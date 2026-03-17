"""
migrate_mrp.py — Migrazione DB per il modulo MRP
=================================================
Crea le tabelle:
  - mrp_runs
  - mrp_fabbisogni
  - mrp_proposte_ordine

Sicuro da eseguire più volte (CREATE TABLE IF NOT EXISTS).

Uso:
    python migrate_mrp.py elettroquadri_demo.db
"""

import sqlite3
import sys
from datetime import datetime


def migrate(db_path: str):
    conn = sqlite3.connect(db_path)
    cur  = conn.cursor()
    now  = datetime.now().isoformat()

    print("=" * 55)
    print("MIGRAZIONE MRP")
    print(f"DB: {db_path}")
    print("=" * 55)

    # ── mrp_runs ──────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS mrp_runs (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            data_run            TEXT    NOT NULL,
            orizzonte_giorni    INTEGER NOT NULL DEFAULT 90,
            utente              TEXT,
            stato               TEXT    NOT NULL DEFAULT 'in_corso',
            -- Possibili stati: in_corso | completato | errore: <msg>
            commesse_elaborate  INTEGER DEFAULT 0,
            righe_fabbisogno    INTEGER DEFAULT 0,
            proposte_generate   INTEGER DEFAULT 0,
            completed_at        TEXT,
            created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)
    print("  ✅ mrp_runs")

    # ── mrp_fabbisogni ────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS mrp_fabbisogni (
            id                          INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id                      INTEGER NOT NULL
                                            REFERENCES mrp_runs(id) ON DELETE CASCADE,
            articolo_id                 INTEGER,  -- NULL se articolo non in anagrafica
            codice_articolo             TEXT,
            descrizione                 TEXT,
            fornitore                   TEXT,
            unita_misura                TEXT    DEFAULT 'PZ',
            quantita_fabbisogno_lordo   REAL    NOT NULL DEFAULT 0,
            giacenza_disponibile        REAL    NOT NULL DEFAULT 0,
            quantita_in_ordine          REAL    NOT NULL DEFAULT 0,
            quantita_fabbisogno_netto   REAL    NOT NULL DEFAULT 0,
            data_consegna_prima         TEXT,
            commesse_json               TEXT,   -- JSON array delle commesse di origine
            created_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mrp_fabbisogni_run
        ON mrp_fabbisogni(run_id)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mrp_fabbisogni_articolo
        ON mrp_fabbisogni(articolo_id)
    """)
    print("  ✅ mrp_fabbisogni")

    # ── mrp_proposte_ordine ───────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS mrp_proposte_ordine (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id                  INTEGER NOT NULL
                                        REFERENCES mrp_runs(id) ON DELETE CASCADE,
            fornitore               TEXT    NOT NULL,
            fornitore_id            INTEGER,  -- FK a fornitori.id (nullable)
            data_consegna_suggerita TEXT,
            stato                   TEXT    NOT NULL DEFAULT 'proposta',
            -- Possibili stati: proposta | convertita | rifiutata
            n_righe                 INTEGER DEFAULT 0,
            righe_json              TEXT,   -- JSON array delle righe articolo
            oda_id                  INTEGER,  -- valorizzato dopo conversione
            created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
            updated_at              TEXT
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mrp_proposte_run
        ON mrp_proposte_ordine(run_id)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mrp_proposte_stato
        ON mrp_proposte_ordine(stato)
    """)
    print("  ✅ mrp_proposte_ordine")

    # ── Aggiungi mrp a parametri_sistema se non esiste ───────
    cur.execute("""
        SELECT id FROM parametri_sistema WHERE chiave = 'modulo_mrp_attivo'
    """)
    if not cur.fetchone():
        cur.execute("""
            INSERT INTO parametri_sistema
                (chiave, valore, descrizione, tipo_dato, gruppo, created_at, updated_at)
            VALUES
                ('modulo_mrp_attivo', 'true',
                 'Attiva/disattiva modulo MRP', 'boolean', 'moduli', ?, ?)
        """, (now, now))
        print("  ✅ parametri_sistema: modulo_mrp_attivo = true")
    else:
        print("  ⏭️  parametri_sistema: modulo_mrp_attivo già presente")

    conn.commit()
    conn.close()
    print("\n✅ Migrazione MRP completata")


if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else "elettroquadri_demo.db"
    migrate(db)
