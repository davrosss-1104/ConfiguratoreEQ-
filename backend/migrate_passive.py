"""
migrate_passive.py - Migrazione schema per fatture passive
==========================================================
Aggiunge colonne mancanti alla tabella fe_fatture per supportare
il flusso completo delle fatture passive ricevute via SDI.

Eseguire: python migrate_passive.py
"""

import sqlite3
import os
import sys

DB_PATH = os.path.join(os.path.dirname(__file__), "configuratore.db")

def migrate(db_path: str = DB_PATH):
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(fe_fatture)")
    colonne_esistenti = {row[1] for row in cur.fetchall()}

    nuove_colonne = [
        # Fornitore esteso (le passive arrivano dallo SDI, denormalizziamo tutto)
        ("fornitore_codice_fiscale",    "TEXT"),
        ("fornitore_indirizzo",         "TEXT"),
        ("fornitore_cap",               "TEXT"),
        ("fornitore_comune",            "TEXT"),
        ("fornitore_provincia",         "TEXT"),
        ("fornitore_nazione",           "TEXT DEFAULT 'IT'"),
        ("fornitore_pec",               "TEXT"),
        ("fornitore_codice_sdi",        "TEXT"),    # codice destinatario del fornitore

        # Collegamento fornitori anagrafica (se esiste tabella fornitori)
        ("fornitore_id",                "INTEGER"),

        # Numero fattura fornitore (diverso dal nostro numero interno)
        ("numero_fattura_fornitore",    "TEXT"),
        ("data_fattura_fornitore",      "TEXT"),    # data del documento ricevuto

        # Flusso lavorazione passiva
        ("stato_lavorazione",           "TEXT DEFAULT 'da_verificare'"),
        # da_verificare → verificata → approvata → registrata → pagata
        ("approvata_da",                "TEXT"),
        ("approvata_at",                "TEXT"),
        ("pagata_at",                   "TEXT"),
        ("scadenza_pagamento",          "TEXT"),

        # XML ricevuto (base64)
        ("xml_ricevuto",                "TEXT"),    # XML originale ricevuto dal fornitore
        ("xml_ricevuto_filename",       "TEXT"),

        # Note lavorazione
        ("note_lavorazione",            "TEXT"),

        # Collegamento ordini acquisto (futuro modulo OdA)
        ("ordine_acquisto_id",          "INTEGER"),
        ("ordine_acquisto_numero",      "TEXT"),
    ]

    aggiunte = []
    for nome_col, tipo_col in nuove_colonne:
        if nome_col not in colonne_esistenti:
            try:
                cur.execute(f"ALTER TABLE fe_fatture ADD COLUMN {nome_col} {tipo_col}")
                aggiunte.append(nome_col)
            except sqlite3.OperationalError as e:
                print(f"  SKIP {nome_col}: {e}")

    # Tabella storico lavorazione fatture passive
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fe_passive_storico (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            fattura_id  INTEGER NOT NULL,
            stato_da    TEXT,
            stato_a     TEXT NOT NULL,
            nota        TEXT,
            utente      TEXT,
            created_at  TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (fattura_id) REFERENCES fe_fatture(id) ON DELETE CASCADE
        )
    """)

    # Tabella fornitori (anagrafica basilare — espandibile)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fornitori (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            denominazione       TEXT NOT NULL,
            partita_iva         TEXT,
            codice_fiscale      TEXT,
            indirizzo           TEXT,
            cap                 TEXT,
            comune              TEXT,
            provincia           TEXT,
            nazione             TEXT DEFAULT 'IT',
            pec                 TEXT,
            codice_sdi          TEXT,
            iban                TEXT,
            note                TEXT,
            attivo              INTEGER DEFAULT 1,
            created_at          TEXT DEFAULT (datetime('now')),
            updated_at          TEXT DEFAULT (datetime('now'))
        )
    """)

    # Indice utile per lookup p.iva fornitore
    cur.execute("""
        CREATE INDEX IF NOT EXISTS ix_fornitori_piva
        ON fornitori(partita_iva)
    """)

    conn.commit()
    conn.close()

    print(f"Migrazione completata.")
    print(f"Colonne aggiunte a fe_fatture: {aggiunte if aggiunte else 'nessuna (già presenti)'}")
    print("Tabelle create/verificate: fe_passive_storico, fornitori")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else DB_PATH
    migrate(path)
