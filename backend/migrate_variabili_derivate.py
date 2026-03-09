"""
migrate_variabili_derivate.py
=============================
Aggiunge la tabella variabili_derivate al DB.

ESECUZIONE:
  python migrate_variabili_derivate.py [path_db]
  Default path: ./configuratore.db
"""
import sqlite3
import sys
import os

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "./configuratore.db"

def run():
    if not os.path.exists(DB_PATH):
        print(f"❌ DB non trovato: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Controlla se esiste già
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='variabili_derivate'")
    if cur.fetchone():
        print("ℹ️  Tabella variabili_derivate già esistente — skipping.")
        conn.close()
        return

    print("📦 Creazione tabella variabili_derivate...")
    cur.execute("""
        CREATE TABLE variabili_derivate (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            nome            TEXT NOT NULL UNIQUE,
            descrizione     TEXT,
            formula         TEXT NOT NULL,
            parametri       TEXT NOT NULL DEFAULT '[]',
            tipo_risultato  TEXT NOT NULL DEFAULT 'numero',
            unita_misura    TEXT,
            attivo          INTEGER NOT NULL DEFAULT 1,
            ordine          INTEGER NOT NULL DEFAULT 0,

            -- Espansione futura (Fase 2 — MORIS, dipendenze cicliche, ecc.)
            scope           TEXT,
            tipo_variabile  TEXT NOT NULL DEFAULT 'flat',
            dipendenze      TEXT NOT NULL DEFAULT '[]',
            meta            TEXT NOT NULL DEFAULT '{}',

            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        )
    """)

    # Trigger updated_at
    cur.execute("""
        CREATE TRIGGER variabili_derivate_updated
        AFTER UPDATE ON variabili_derivate
        BEGIN
            UPDATE variabili_derivate SET updated_at = datetime('now') WHERE id = NEW.id;
        END
    """)

    conn.commit()
    conn.close()
    print("✅ Tabella variabili_derivate creata con successo.")


if __name__ == "__main__":
    run()
