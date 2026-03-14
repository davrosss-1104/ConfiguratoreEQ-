"""
migrate_tempi.py — Misurazione tempi sui ticket
================================================
Eseguire una volta sola:
    python migrate_tempi.py

Operazioni:
  1. Aggiunge colonna tempo_previsto_minuti a tickets
  2. Crea tabella ticket_sessioni_lavoro
"""

import sqlite3, sys, os

DB_PATH = os.environ.get(
    "DB_PATH",
    r"C:\Users\david\Desktop\Python\ConfiguratoreEQ\3.0\backend\elettroquadri_demo.db"
)

def run():
    conn = sqlite3.connect(DB_PATH)
    cur  = conn.cursor()

    # 1. Colonna tempo_previsto_minuti su tickets
    cur.execute("PRAGMA table_info(tickets)")
    cols = {r[1] for r in cur.fetchall()}
    if "tempo_previsto_minuti" not in cols:
        cur.execute("ALTER TABLE tickets ADD COLUMN tempo_previsto_minuti INTEGER DEFAULT NULL")
        print("✅ Aggiunta colonna tempo_previsto_minuti a tickets")
    else:
        print("ℹ️  Colonna tempo_previsto_minuti già presente")

    # 2. Tabella sessioni lavoro
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ticket_sessioni_lavoro (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id       INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
            utente_id       INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
            inizio          TEXT NOT NULL,
            fine            TEXT,
            durata_minuti   INTEGER,
            note            TEXT,
            fatturabile     INTEGER NOT NULL DEFAULT 1,
            created_at      TEXT DEFAULT (datetime('now'))
        )
    """)
    print("✅ Tabella ticket_sessioni_lavoro pronta")

    # Indici per performance
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessioni_ticket ON ticket_sessioni_lavoro(ticket_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessioni_utente ON ticket_sessioni_lavoro(utente_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_sessioni_inizio  ON ticket_sessioni_lavoro(inizio)")

    conn.commit()
    conn.close()
    print("✅ Migrate completato.")

if __name__ == "__main__":
    run()
