"""
migrate_ordini_stati.py
Aggiunge la tabella ordini_storico_stato e le colonne mancanti alla tabella ordini
per supportare la macchina a stati e la timeline.
"""
import sqlite3
import sys
import os
import shutil
from datetime import datetime


def migrate(db_path: str):
    if not os.path.exists(db_path):
        print(f"[ERRORE] DB non trovato: {db_path}")
        sys.exit(1)

    # Backup
    backup = f"{db_path}.bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    shutil.copy2(db_path, backup)
    print(f"[OK] Backup: {backup}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # ── 1. Tabella storico stati ordine ──
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ordini_storico_stato (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ordine_id INTEGER NOT NULL,
            stato_precedente TEXT,
            stato_nuovo TEXT NOT NULL,
            motivo TEXT,
            utente TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (ordine_id) REFERENCES ordini(id)
        )
    """)
    print("[OK] Tabella ordini_storico_stato creata/verificata")

    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_storico_stato_ordine
        ON ordini_storico_stato(ordine_id)
    """)
    print("[OK] Indice idx_storico_stato_ordine creato/verificato")

    # ── 2. Aggiungi colonne mancanti a ordini ──
    colonne_nuove = [
        ("note", "TEXT"),
        ("note_interne", "TEXT"),
        ("condizioni_pagamento", "TEXT"),
        ("condizioni_consegna", "TEXT"),
        ("riferimento_cliente", "TEXT"),
        ("data_cambio_stato", "TEXT"),
        ("stato_precedente", "TEXT"),
    ]

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ordini'")
    if cursor.fetchone():
        for col_name, col_type in colonne_nuove:
            try:
                cursor.execute(f"SELECT {col_name} FROM ordini LIMIT 1")
            except sqlite3.OperationalError:
                cursor.execute(f"ALTER TABLE ordini ADD COLUMN {col_name} {col_type}")
                print(f"[OK] Colonna ordini.{col_name} aggiunta")
    else:
        print("[WARN] Tabella ordini non esiste ancora, le colonne verranno aggiunte alla creazione")

    # ── 3. Popola storico per ordini esistenti (se mancano record) ──
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ordini'")
    if cursor.fetchone():
        cursor.execute("""
            SELECT o.id, o.stato, o.created_at
            FROM ordini o
            LEFT JOIN ordini_storico_stato s ON s.ordine_id = o.id
            WHERE s.id IS NULL
        """)
        orfani = cursor.fetchall()
        for oid, stato, created_at in orfani:
            cursor.execute("""
                INSERT INTO ordini_storico_stato
                (ordine_id, stato_precedente, stato_nuovo, motivo, utente, created_at)
                VALUES (?, NULL, ?, 'Migrazione - stato iniziale', 'sistema', ?)
            """, (oid, stato or 'confermato', created_at or datetime.now().isoformat()))
            print(f"[OK] Storico iniziale per ordine #{oid} ({stato})")

    conn.commit()
    conn.close()
    print("\n[DONE] Migrazione completata con successo!")


if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else "configuratore.db"
    migrate(db_path)
