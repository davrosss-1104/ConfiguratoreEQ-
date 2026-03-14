r"""
migrate_escalation.py
=====================
Aggiunge:
  - Tabella ticket_assegnazioni_storico
  - Tabella ticket_utenti_supporto
  - Parametri escalation in parametri_sistema

Eseguire con:
  set DATABASE_URL=sqlite:///C:\Users\david\Desktop\Python\ConfiguratoreEQ\3.0\backend\elettroquadri_demo.db
  python migrate_escalation.py
"""

import os, sqlite3

DB_PATH = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./backend/elettroquadri_demo.db"
).replace("sqlite:///", "")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# ── Storico assegnazioni ─────────────────────────────────────────────────────
cur.execute("""
CREATE TABLE IF NOT EXISTS ticket_assegnazioni_storico (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id       INTEGER NOT NULL,
    utente_da_id    INTEGER,                  -- NULL se non era assegnato prima
    utente_a_id     INTEGER,                  -- NULL se rimosso
    utente_da_nome  TEXT,
    utente_a_nome   TEXT,
    motivo          TEXT,
    assegnato_da_id INTEGER,                  -- chi ha fatto la riassegnazione
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
)
""")
print("OK — tabella ticket_assegnazioni_storico")

# ── Utenti di supporto configurabili ────────────────────────────────────────
cur.execute("""
CREATE TABLE IF NOT EXISTS ticket_utenti_supporto (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    utente_id  INTEGER NOT NULL UNIQUE,
    note       TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (utente_id) REFERENCES utenti(id) ON DELETE CASCADE
)
""")
print("OK — tabella ticket_utenti_supporto")

# ── Parametri escalation ─────────────────────────────────────────────────────
PARAMETRI = [
    ("escalation_attiva",              "1"),   # 0=disabilitata
    ("escalation_ore_senza_aggiornamenti", "24"),  # ore prima di escalare
    ("escalation_email_attiva",        "1"),   # invia email all'escalation
]
for chiave, valore in PARAMETRI:
    cur.execute(
        "INSERT OR IGNORE INTO parametri_sistema (chiave, valore) VALUES (?, ?)",
        (chiave, valore)
    )
print(f"OK — {len(PARAMETRI)} parametri escalation aggiunti")

conn.commit()
conn.close()
print("\nMigrazione completata.")
