"""
migrate_sezioni_preventivo.py
=============================
Migrazione per:
  1. Tabella sezioni_preventivo       — struttura del documento PDF finale
  2. Colonne su campi_configuratore   — mapping campo → sezione PDF
  3. Colonna is_default su valori_configurazione — traccia valori non modificati

ESECUZIONE:
  cd backend/
  python migrate_sezioni_preventivo.py

SICURO: usa ALTER TABLE ADD COLUMN con try/except, idempotente.
"""

from database import engine
from sqlalchemy import text, inspect


def migrate():
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    with engine.begin() as conn:

        # ================================================================
        # 1. TABELLA sezioni_preventivo
        # ================================================================
        if "sezioni_preventivo" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE sezioni_preventivo (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    codice TEXT NOT NULL UNIQUE,
                    titolo TEXT NOT NULL,
                    ordine INTEGER DEFAULT 0,
                    tipo TEXT DEFAULT 'tabella',
                    visibile INTEGER DEFAULT 1,
                    mostra_titolo INTEGER DEFAULT 1,
                    nota_default TEXT,
                    stile TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """))
            print("✅ Tabella sezioni_preventivo creata")

            # Popola sezioni di default
            sezioni_default = [
                ("intestazione",        "Intestazione",                 10, "intestazione", 1, 0, None),
                ("dati_commessa",       "Dati Commessa",                20, "tabella",      1, 1, None),
                ("specifiche_tecniche", "Specifiche Tecniche",          30, "tabella",      1, 1, None),
                ("configurazione",      "Configurazione Impianto",      40, "tabella",      1, 1, None),
                ("materiali",           "Elenco Materiali",             50, "tabella",      1, 1, None),
                ("valori_standard",     "Valori Standard Applicati",    60, "tabella",      1, 1,
                 "I seguenti valori non sono stati modificati durante la configurazione. Si prega di verificare e confermare."),
                ("note_tecniche",       "Note Tecniche",                70, "testo_libero", 1, 1, None),
                ("condizioni",          "Condizioni Commerciali",       80, "testo_libero", 1, 1, None),
            ]
            for codice, titolo, ordine, tipo, visibile, mostra_titolo, nota in sezioni_default:
                conn.execute(text("""
                    INSERT INTO sezioni_preventivo (codice, titolo, ordine, tipo, visibile, mostra_titolo, nota_default)
                    VALUES (:c, :t, :o, :tipo, :v, :mt, :n)
                """), {"c": codice, "t": titolo, "o": ordine, "tipo": tipo,
                       "v": visibile, "mt": mostra_titolo, "n": nota})
            print(f"   → Inserite {len(sezioni_default)} sezioni di default")
        else:
            print("ℹ️  Tabella sezioni_preventivo già esistente")

        # ================================================================
        # 2. NUOVE COLONNE su campi_configuratore
        # ================================================================
        nuove_colonne_campi = [
            ("includi_preventivo",       "INTEGER DEFAULT 0"),
            ("sezione_preventivo",       "TEXT"),
            ("ordine_preventivo",        "INTEGER DEFAULT 0"),
            ("etichetta_preventivo",     "TEXT"),
            ("mostra_default_preventivo","INTEGER DEFAULT 0"),
        ]
        for col_name, col_def in nuove_colonne_campi:
            try:
                conn.execute(text(f"SELECT {col_name} FROM campi_configuratore LIMIT 1"))
                print(f"ℹ️  campi_configuratore.{col_name} già presente")
            except:
                conn.execute(text(
                    f"ALTER TABLE campi_configuratore ADD COLUMN {col_name} {col_def}"
                ))
                print(f"✅ campi_configuratore.{col_name} aggiunta")

        # ================================================================
        # 3. NUOVA COLONNA is_default su valori_configurazione
        # ================================================================
        try:
            conn.execute(text("SELECT is_default FROM valori_configurazione LIMIT 1"))
            print("ℹ️  valori_configurazione.is_default già presente")
        except:
            conn.execute(text(
                "ALTER TABLE valori_configurazione ADD COLUMN is_default INTEGER DEFAULT 1"
            ))
            print("✅ valori_configurazione.is_default aggiunta")
            # I valori esistenti sono tutti "legacy", marchiamoli come non-default
            # (non sappiamo se l'utente li ha toccati o no)
            conn.execute(text(
                "UPDATE valori_configurazione SET is_default = 0 WHERE is_default IS NULL"
            ))
            print("   → Valori esistenti marcati come is_default=0 (legacy)")

    print("\n🏁 Migrazione completata")


if __name__ == "__main__":
    migrate()
