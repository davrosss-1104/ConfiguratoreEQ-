"""
migrate_impianti_v2.py
─────────────────────
1. Aggiunge colonne mancanti alla tabella `impianti` (se esiste già da migrate_ticketing)
   oppure la crea da zero.
2. Crea la junction table `preventivi_impianti`.

ESECUZIONE: cd backend && python migrate_impianti_v2.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import engine
from sqlalchemy import text

def col_exists(conn, table, col):
    rows = conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
    return any(r[1] == col for r in rows)

def table_exists(conn, table):
    r = conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=:t"
    ), {"t": table}).fetchone()
    return r is not None

def migrate():
    with engine.begin() as conn:

        # ── 1. Tabella impianti ──────────────────────────────────────
        if not table_exists(conn, "impianti"):
            conn.execute(text("""
                CREATE TABLE impianti (
                    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                    numero_impianto     TEXT NOT NULL,
                    tipo                TEXT NOT NULL DEFAULT 'nuovo',
                    indirizzo           TEXT,
                    cliente_finale      TEXT,
                    anno_installazione  INTEGER,
                    costruttore         TEXT,
                    modello             TEXT,
                    note                TEXT,
                    created_at          TEXT DEFAULT (datetime('now')),
                    updated_at          TEXT DEFAULT (datetime('now'))
                )
            """))
            print("✅ Tabella impianti creata")
        else:
            print("ℹ️  Tabella impianti già esistente — aggiungo colonne mancanti")
            nuove = [
                ("tipo",               "TEXT NOT NULL DEFAULT 'nuovo'"),
                ("indirizzo",          "TEXT"),
                ("cliente_finale",     "TEXT"),
                ("anno_installazione", "INTEGER"),
                ("costruttore",        "TEXT"),
                ("modello",            "TEXT"),
                ("note",               "TEXT"),
            ]
            for col, defn in nuove:
                if not col_exists(conn, "impianti", col):
                    conn.execute(text(f"ALTER TABLE impianti ADD COLUMN {col} {defn}"))
                    print(f"  + colonna impianti.{col}")

        # ── 2. Junction preventivi_impianti ──────────────────────────
        if not table_exists(conn, "preventivi_impianti"):
            conn.execute(text("""
                CREATE TABLE preventivi_impianti (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    preventivo_id   INTEGER NOT NULL,
                    impianto_id     INTEGER NOT NULL,
                    created_at      TEXT DEFAULT (datetime('now')),
                    UNIQUE(preventivo_id, impianto_id),
                    FOREIGN KEY(preventivo_id) REFERENCES preventivi(id),
                    FOREIGN KEY(impianto_id)   REFERENCES impianti(id)
                )
            """))
            print("✅ Tabella preventivi_impianti creata")
        else:
            print("ℹ️  Tabella preventivi_impianti già esistente")

        print("\n✅ Migrazione completata.")

if __name__ == "__main__":
    migrate()
