"""
migrate_produzione.py — Crea tabelle modulo Produzione
=======================================================
Eseguire UNA SOLA VOLTA:
    cd C:\\Users\\david\\Desktop\\Python\\ConfiguratoreEQ\\3.0\\backend
    venv\\Scripts\\python.exe migrate_produzione.py elettroquadri_demo.db
"""

import sys
import sqlite3
from datetime import datetime

if len(sys.argv) < 2:
    print("Uso: python migrate_produzione.py <percorso_db>")
    sys.exit(1)

DB_PATH = sys.argv[1]
conn = sqlite3.connect(DB_PATH)
conn.execute("PRAGMA journal_mode=WAL")
conn.execute("PRAGMA foreign_keys=ON")
cur = conn.cursor()

print(f"[{datetime.now():%H:%M:%S}] Connesso a {DB_PATH}")

# ──────────────────────────────────────────────
# 1. centri_lavoro
# ──────────────────────────────────────────────
cur.execute("""
CREATE TABLE IF NOT EXISTS centri_lavoro (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nome            TEXT    NOT NULL,
    descrizione     TEXT,
    capacita_ore_giorno REAL NOT NULL DEFAULT 8.0,
    colore          TEXT    NOT NULL DEFAULT '#6366f1',
    attivo          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    DEFAULT (datetime('now')),
    updated_at      TEXT    DEFAULT (datetime('now'))
)
""")
print("  [OK] centri_lavoro")

# ──────────────────────────────────────────────
# 2. fasi_template
# ──────────────────────────────────────────────
cur.execute("""
CREATE TABLE IF NOT EXISTS fasi_template (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    nome                TEXT    NOT NULL,
    descrizione         TEXT,
    ordine              INTEGER NOT NULL DEFAULT 0,
    durata_stimata_ore  REAL    NOT NULL DEFAULT 8.0,
    centro_lavoro_id    INTEGER REFERENCES centri_lavoro(id) ON DELETE SET NULL,
    tipo_commessa       TEXT,
    attivo              INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT    DEFAULT (datetime('now')),
    updated_at          TEXT    DEFAULT (datetime('now'))
)
""")
print("  [OK] fasi_template")

# ──────────────────────────────────────────────
# 3. fasi_produzione
# ──────────────────────────────────────────────
cur.execute("""
CREATE TABLE IF NOT EXISTS fasi_produzione (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ordine_id           INTEGER NOT NULL REFERENCES ordini(id) ON DELETE CASCADE,
    template_id         INTEGER REFERENCES fasi_template(id) ON DELETE SET NULL,
    nome                TEXT    NOT NULL,
    ordine              INTEGER NOT NULL DEFAULT 0,
    stato               TEXT    NOT NULL DEFAULT 'da_fare',
    centro_lavoro_id    INTEGER REFERENCES centri_lavoro(id) ON DELETE SET NULL,
    durata_stimata_ore  REAL    NOT NULL DEFAULT 8.0,
    durata_reale_ore    REAL,
    data_inizio_prevista TEXT,
    data_fine_prevista   TEXT,
    data_inizio_reale    TEXT,
    data_fine_reale      TEXT,
    note                TEXT,
    created_at          TEXT    DEFAULT (datetime('now')),
    updated_at          TEXT    DEFAULT (datetime('now'))
)
""")
cur.execute("CREATE INDEX IF NOT EXISTS idx_fasi_produzione_ordine ON fasi_produzione(ordine_id)")
print("  [OK] fasi_produzione")

# ──────────────────────────────────────────────
# 4. produzione_timer
# ──────────────────────────────────────────────
cur.execute("""
CREATE TABLE IF NOT EXISTS produzione_timer (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    fase_id     INTEGER NOT NULL REFERENCES fasi_produzione(id) ON DELETE CASCADE,
    utente      TEXT    NOT NULL DEFAULT 'utente',
    started_at  TEXT    NOT NULL,
    stopped_at  TEXT,
    minuti      REAL,
    created_at  TEXT    DEFAULT (datetime('now'))
)
""")
cur.execute("CREATE INDEX IF NOT EXISTS idx_timer_fase ON produzione_timer(fase_id)")
print("  [OK] produzione_timer")

# ──────────────────────────────────────────────
# 5. wip_commessa
# ──────────────────────────────────────────────
cur.execute("""
CREATE TABLE IF NOT EXISTS wip_commessa (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ordine_id           INTEGER NOT NULL REFERENCES ordini(id) ON DELETE CASCADE,
    articolo_id         INTEGER REFERENCES articoli(id) ON DELETE SET NULL,
    codice_articolo     TEXT    NOT NULL,
    descrizione         TEXT,
    unita_misura        TEXT    DEFAULT 'pz',
    quantita_necessaria REAL    NOT NULL DEFAULT 0,
    quantita_prelevata  REAL    NOT NULL DEFAULT 0,
    stato               TEXT    NOT NULL DEFAULT 'da_prelevare',
    note                TEXT,
    created_at          TEXT    DEFAULT (datetime('now')),
    updated_at          TEXT    DEFAULT (datetime('now'))
)
""")
cur.execute("CREATE INDEX IF NOT EXISTS idx_wip_ordine ON wip_commessa(ordine_id)")
cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_wip_ordine_articolo ON wip_commessa(ordine_id, codice_articolo)")
print("  [OK] wip_commessa")

# ──────────────────────────────────────────────
# 6. Seed centri_lavoro di default (solo se vuota)
# ──────────────────────────────────────────────
cur.execute("SELECT COUNT(*) FROM centri_lavoro")
if cur.fetchone()[0] == 0:
    centri_default = [
        ("Preparazione",  "Taglio cavi, preparazione componenti", 8.0, "#f59e0b"),
        ("Cablaggio",     "Montaggio e cablaggio quadro",         8.0, "#3b82f6"),
        ("Collaudo",      "Test elettrici e funzionali",          8.0, "#10b981"),
        ("Spedizione",    "Imballaggio e preparazione spedizione",8.0, "#8b5cf6"),
    ]
    cur.executemany(
        "INSERT INTO centri_lavoro (nome, descrizione, capacita_ore_giorno, colore) VALUES (?,?,?,?)",
        centri_default
    )
    print("  [OK] seed 4 centri_lavoro default")

    # Seed fasi_template collegate ai centri
    cur.execute("SELECT id FROM centri_lavoro WHERE nome='Preparazione' LIMIT 1")
    r = cur.fetchone(); cl_prep = r[0] if r else None
    cur.execute("SELECT id FROM centri_lavoro WHERE nome='Cablaggio' LIMIT 1")
    r = cur.fetchone(); cl_cab = r[0] if r else None
    cur.execute("SELECT id FROM centri_lavoro WHERE nome='Collaudo' LIMIT 1")
    r = cur.fetchone(); cl_col = r[0] if r else None
    cur.execute("SELECT id FROM centri_lavoro WHERE nome='Spedizione' LIMIT 1")
    r = cur.fetchone(); cl_sped = r[0] if r else None

    fasi_default = [
        ("Preparazione materiali", "Prelievo e verifica materiali da magazzino", 0, 4.0, cl_prep, None),
        ("Cablaggio",              "Montaggio componenti e cablaggio quadro",     1, 16.0, cl_cab, None),
        ("Collaudo interno",       "Test elettrici e funzionali",                  2, 4.0, cl_col, None),
        ("Documentazione",         "Schemi aggiornati, etichette, dichiarazione", 3, 2.0, cl_col, None),
        ("Spedizione",             "Imballaggio e consegna al corriere",           4, 2.0, cl_sped, None),
    ]
    cur.executemany(
        "INSERT INTO fasi_template (nome, descrizione, ordine, durata_stimata_ore, centro_lavoro_id, tipo_commessa) VALUES (?,?,?,?,?,?)",
        fasi_default
    )
    print("  [OK] seed 5 fasi_template default")

conn.commit()
conn.close()
print(f"\n[{datetime.now():%H:%M:%S}] Migrazione completata.")
