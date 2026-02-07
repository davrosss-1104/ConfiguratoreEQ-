"""
Migrazione completa: allinea il DB al modello SQLAlchemy.
Eseguire dalla cartella backend:  python migrate_templates.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "configuratore.db")

def add_column(cursor, table, column, col_type):
    cursor.execute(f"PRAGMA table_info({table})")
    columns = [col[1] for col in cursor.fetchall()]
    if column not in columns:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
        print(f"  ✅ {table}.{column} aggiunta")
        return True
    else:
        print(f"  ℹ️  {table}.{column} già presente")
        return False

def rename_column(cursor, table, old_name, new_name, col_type):
    """Rinomina colonna copiando i dati (SQLite non supporta RENAME COLUMN nelle versioni vecchie)"""
    cursor.execute(f"PRAGMA table_info({table})")
    columns = [col[1] for col in cursor.fetchall()]
    
    if new_name in columns:
        print(f"  ℹ️  {table}.{new_name} già presente")
        return
    
    if old_name not in columns:
        print(f"  ⚠️  {table}.{old_name} non trovata, creo {new_name}")
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {new_name} {col_type}")
        return
    
    # Aggiungi nuova colonna, copia dati, (non possiamo droppare la vecchia in SQLite)
    cursor.execute(f"ALTER TABLE {table} ADD COLUMN {new_name} {col_type}")
    cursor.execute(f"UPDATE {table} SET {new_name} = {old_name}")
    print(f"  🔄 {table}.{old_name} → {new_name} (dati copiati)")

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"❌ Database non trovato: {DB_PATH}")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # ==========================================
    # 1. Tabella product_templates
    # ==========================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS product_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            categoria TEXT NOT NULL,
            sottocategoria TEXT NOT NULL,
            nome_display TEXT NOT NULL,
            descrizione TEXT,
            icona TEXT,
            ordine INTEGER DEFAULT 0,
            attivo INTEGER DEFAULT 1,
            template_data TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("✅ Tabella product_templates OK")
    
    # ==========================================
    # 2. preventivi
    # ==========================================
    print("\n--- preventivi ---")
    add_column(cursor, "preventivi", "categoria", "TEXT")
    add_column(cursor, "preventivi", "template_id", "INTEGER")
    
    # ==========================================
    # 3. dati_commessa
    # Il modello ha: consegna_richiesta, prezzo_unitario
    # Il DB ha: data_consegna_richiesta (e manca prezzo_unitario)
    # ==========================================
    print("\n--- dati_commessa ---")
    rename_column(cursor, "dati_commessa", "data_consegna_richiesta", "consegna_richiesta", "TEXT")
    add_column(cursor, "dati_commessa", "prezzo_unitario", "REAL")
    
    # ==========================================
    # 4. dati_principali
    # ==========================================
    print("\n--- dati_principali ---")
    add_column(cursor, "dati_principali", "con_locale_macchina", "BOOLEAN")
    add_column(cursor, "dati_principali", "posizione_locale_macchina", "TEXT")
    add_column(cursor, "dati_principali", "tipo_trazione", "TEXT")
    
    conn.commit()
    conn.close()
    print("\n🎉 Migrazione completata!")

if __name__ == "__main__":
    migrate()
