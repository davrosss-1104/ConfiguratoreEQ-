"""
migrate_ordini_stati.py
========================
Migrazione per la macchina a stati degli ordini.

Aggiunge:
  - Tabella ordini_storico_stato (timeline transizioni)
  - Colonna ordini.stato_precedente (per resume da sospeso)

Eseguire: python migrate_ordini_stati.py [db_path]
Sicuro da eseguire più volte (skip se già presente).
"""

import sqlite3
import sys
from datetime import datetime


def column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    return column_name in [row[1] for row in cursor.fetchall()]


def table_exists(cursor, table_name):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
    return cursor.fetchone() is not None


def migrate(db_path="configuratore.db"):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    now = datetime.now().isoformat()

    print("=" * 50)
    print("MIGRAZIONE MACCHINA STATI ORDINI")
    print("=" * 50)

    # ============================================================
    # 1. Tabella ordini_storico_stato
    # ============================================================
    if not table_exists(cursor, "ordini_storico_stato"):
        cursor.execute("""
            CREATE TABLE ordini_storico_stato (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ordine_id INTEGER NOT NULL,
                stato_da TEXT NOT NULL,
                stato_a TEXT NOT NULL,
                note TEXT,
                created_by TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (ordine_id) REFERENCES ordini(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_storico_stato_ordine
            ON ordini_storico_stato(ordine_id, created_at DESC)
        """)
        print("  ✅ Tabella ordini_storico_stato creata")
    else:
        print("  ⏭️  Tabella ordini_storico_stato già esiste")

    # ============================================================
    # 2. Colonna ordini.stato_precedente (per resume da sospeso)
    # ============================================================
    if table_exists(cursor, "ordini"):
        if not column_exists(cursor, "ordini", "stato_precedente"):
            cursor.execute("ALTER TABLE ordini ADD COLUMN stato_precedente TEXT")
            print("  ✅ Colonna ordini.stato_precedente aggiunta")
        else:
            print("  ⏭️  Colonna ordini.stato_precedente già esiste")

        # ============================================================
        # 3. Popola storico per ordini esistenti (entry iniziale)
        # ============================================================
        cursor.execute("""
            SELECT o.id, o.stato, o.created_at
            FROM ordini o
            LEFT JOIN ordini_storico_stato s ON s.ordine_id = o.id
            WHERE s.id IS NULL
        """)
        ordini_senza_storico = cursor.fetchall()
        for oid, stato, created_at in ordini_senza_storico:
            cursor.execute("""
                INSERT INTO ordini_storico_stato (ordine_id, stato_da, stato_a, note, created_by, created_at)
                VALUES (?, 'nuovo', ?, 'Stato iniziale (migrazione)', 'sistema', ?)
            """, (oid, stato or 'confermato', created_at or now))
            print(f"  ✅ Storico iniziale per ordine #{oid} ({stato})")

    else:
        print("  ⚠️  Tabella ordini non trovata - skip colonne aggiuntive")

    conn.commit()
    conn.close()
    print("\n✅ Migrazione macchina stati completata")


if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else "configuratore.db"
    migrate(db)
