"""
migrate_ticket_materiali.py
===========================
Crea la tabella ticket_materiali e aggiunge ordine_nome alla vista ticket.
Eseguire una sola volta:
    backend\venv\Scripts\python.exe migrate_ticket_materiali.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from database import SQLALCHEMY_DATABASE_URL as DB_URL

db_path = DB_URL.replace("sqlite:///", "").replace("sqlite://", "")
import sqlite3
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# ticket_materiali
cur.execute("""
CREATE TABLE IF NOT EXISTS ticket_materiali (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id        INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    articolo_id      INTEGER REFERENCES articoli(id) ON DELETE SET NULL,
    codice           TEXT,
    descrizione      TEXT NOT NULL,
    quantita         REAL NOT NULL DEFAULT 1,
    unita_misura     TEXT,
    note             TEXT,
    visibile_cliente INTEGER NOT NULL DEFAULT 0,
    aggiunto_da      INTEGER REFERENCES utenti(id),
    created_at       TEXT DEFAULT (datetime('now'))
)
""")
print("OK: ticket_materiali creata (o già esistente)")

# Aggiungi ordine_nome a tickets se mancante (colonna virtuale — lo gestiamo via JOIN quindi niente ALTER)
# Verifica che tickets abbia ordine_id
cur.execute("PRAGMA table_info(tickets)")
cols = [r[1] for r in cur.fetchall()]
if "ordine_id" not in cols:
    cur.execute("ALTER TABLE tickets ADD COLUMN ordine_id INTEGER REFERENCES ordini(id)")
    print("OK: colonna ordine_id aggiunta a tickets")
else:
    print("OK: ordine_id già presente in tickets")

conn.commit()
conn.close()
print("Migrazione completata.")
