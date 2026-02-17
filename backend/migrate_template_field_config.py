"""
migrate_template_field_config.py
================================
Aggiunge supporto per configurazione campi per-template.

Nuove colonne su valori_configurazione:
  - is_readonly:              campo bloccato (impostato dal template)
  - includi_preventivo:       mostra nel documento PDF
  - mostra_default_preventivo: se non modificato, mostra in sezione "Valori Standard"

Eseguire: python migrate_template_field_config.py [path_db]
"""
import sqlite3
import sys
import os


def get_existing_columns(cursor, table):
    cursor.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cursor.fetchall()}


def migrate(db_path):
    print(f"Database: {db_path}")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    changes = 0

    # ── 1. Colonne su valori_configurazione ──
    existing = get_existing_columns(c, "valori_configurazione")
    new_cols = [
        ("is_readonly", "INTEGER DEFAULT 0"),
        ("includi_preventivo", "INTEGER DEFAULT 1"),
        ("mostra_default_preventivo", "INTEGER DEFAULT 0"),
    ]
    for col_name, col_def in new_cols:
        if col_name not in existing:
            print(f"  Aggiungo valori_configurazione.{col_name}...")
            c.execute(f"ALTER TABLE valori_configurazione ADD COLUMN {col_name} {col_def}")
            changes += 1
        else:
            print(f"  valori_configurazione.{col_name}: gia' presente")

    if changes:
        conn.commit()
        print(f"\nMigrazione completata: {changes} modifiche applicate.")
    else:
        print(f"\nNessuna modifica necessaria, DB gia' aggiornato.")

    conn.close()


if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else None

    if not db_path:
        candidates = [
            "./configuratore.db",
            "./elettroquadri_demo.db",
        ]
        for p in candidates:
            if os.path.exists(p):
                db_path = p
                break

    if not db_path:
        print("Errore: specificare il path del database")
        print("Uso: python migrate_template_field_config.py <path_db>")
        sys.exit(1)

    migrate(db_path)
