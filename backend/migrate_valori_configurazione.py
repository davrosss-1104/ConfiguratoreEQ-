"""
migrate_valori_configurazione.py
Crea la tabella valori_configurazione per le sezioni dinamiche.
Eseguire UNA VOLTA: python migrate_valori_configurazione.py
"""
from database import engine
from sqlalchemy import text, inspect

def migrate():
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    
    with engine.begin() as conn:
        # --- Tabella valori_configurazione ---
        if "valori_configurazione" not in existing_tables:
            conn.execute(text("""
                CREATE TABLE valori_configurazione (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    preventivo_id INTEGER NOT NULL,
                    sezione VARCHAR(100) NOT NULL,
                    codice_campo VARCHAR(100) NOT NULL,
                    valore TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP,
                    FOREIGN KEY (preventivo_id) REFERENCES preventivi(id) ON DELETE CASCADE
                )
            """))
            print("✅ Tabella valori_configurazione creata")
            
            # Indici
            conn.execute(text(
                "CREATE INDEX ix_valori_config_preventivo ON valori_configurazione(preventivo_id)"
            ))
            conn.execute(text(
                "CREATE INDEX ix_valori_config_sezione ON valori_configurazione(sezione)"
            ))
            conn.execute(text(
                "CREATE UNIQUE INDEX ix_valori_config_unique ON valori_configurazione(preventivo_id, sezione, codice_campo)"
            ))
            print("✅ Indici creati (preventivo_id, sezione, unique composito)")
        else:
            print("ℹ️ Tabella valori_configurazione già esistente, skip")

    print("🏁 Migrazione completata")


if __name__ == "__main__":
    migrate()
