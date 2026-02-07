"""
SCRIPT DI MIGRAZIONE DATABASE v2.0
==================================
Aggiunge le nuove tabelle senza eliminare i dati esistenti.

NUOVE TABELLE:
- parametri_sistema
- gruppi_utenti
- permessi_gruppi
- utenti
- clienti
- categorie_articoli
- articoli
- righe_ricambio

MODIFICHE A TABELLE ESISTENTI:
- preventivi: aggiunti tipo_preventivo, cliente_id, totale_lordo, totale_sconti, totale_netto
"""

import sqlite3
import os
import shutil
from datetime import datetime

# Configurazione
DB_PATH = "./configuratore.db"
BACKUP_DIR = "./backups"

def backup_database():
    """Crea backup del database prima della migrazione"""
    if not os.path.exists(DB_PATH):
        print("⚠️ Database non trovato, nessun backup necessario")
        return None
    
    if not os.path.exists(BACKUP_DIR):
        os.makedirs(BACKUP_DIR)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(BACKUP_DIR, f"configuratore_backup_{timestamp}.db")
    shutil.copy2(DB_PATH, backup_path)
    print(f"✅ Backup creato: {backup_path}")
    return backup_path

def run_migration():
    """Esegue la migrazione del database"""
    
    print("\n" + "="*60)
    print("MIGRAZIONE DATABASE CONFIGURATORE ELETTROQUADRI v2.0")
    print("="*60 + "\n")
    
    # Backup
    backup_path = backup_database()
    
    # Connessione
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # ==========================================
        # NUOVE TABELLE
        # ==========================================
        
        print("📦 Creazione nuove tabelle...")
        
        # 1. PARAMETRI SISTEMA
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS parametri_sistema (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chiave VARCHAR(100) UNIQUE NOT NULL,
                valore VARCHAR(255) NOT NULL,
                descrizione VARCHAR(500),
                tipo_dato VARCHAR(50) DEFAULT 'string',
                gruppo VARCHAR(100),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_parametri_chiave ON parametri_sistema(chiave)")
        print("   ✅ parametri_sistema")
        
        # 2. GRUPPI UTENTI
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS gruppi_utenti (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome VARCHAR(100) UNIQUE NOT NULL,
                descrizione VARCHAR(500),
                is_admin BOOLEAN DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_gruppi_nome ON gruppi_utenti(nome)")
        print("   ✅ gruppi_utenti")
        
        # 3. PERMESSI GRUPPI
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS permessi_gruppi (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gruppo_id INTEGER NOT NULL,
                permesso VARCHAR(100) NOT NULL,
                descrizione VARCHAR(255),
                FOREIGN KEY (gruppo_id) REFERENCES gruppi_utenti(id) ON DELETE CASCADE
            )
        """)
        print("   ✅ permessi_gruppi")
        
        # 4. UTENTI
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS utenti (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE,
                nome VARCHAR(100),
                cognome VARCHAR(100),
                password_hash VARCHAR(255),
                gruppo_id INTEGER,
                is_active BOOLEAN DEFAULT 1,
                ultimo_accesso DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (gruppo_id) REFERENCES gruppi_utenti(id)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_utenti_username ON utenti(username)")
        print("   ✅ utenti")
        
        # 5. CLIENTI - Gestione tabella esistente o nuova
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='clienti'")
        clienti_exists = cursor.fetchone() is not None
        
        if clienti_exists:
            # Verifica colonne esistenti
            cursor.execute("PRAGMA table_info(clienti)")
            existing_cols = {row[1] for row in cursor.fetchall()}
            
            # Se esiste 'nome', consideralo equivalente a 'ragione_sociale'
            has_nome_field = 'nome' in existing_cols
            
            # Colonne necessarie con definizioni
            required_cols = {
                'codice': "VARCHAR(50)",
                'partita_iva': "VARCHAR(20)",
                'codice_fiscale': "VARCHAR(20)",
                'indirizzo': "VARCHAR(255)",
                'cap': "VARCHAR(10)",
                'citta': "VARCHAR(100)",
                'provincia': "VARCHAR(5)",
                'nazione': "VARCHAR(50) DEFAULT 'Italia'",
                'telefono': "VARCHAR(50)",
                'email': "VARCHAR(255)",
                'pec': "VARCHAR(255)",
                'sconto_produzione': "DECIMAL(5,2) DEFAULT 0.00",
                'sconto_acquisto': "DECIMAL(5,2) DEFAULT 0.00",
                'sconto_globale': "DECIMAL(5,2) DEFAULT 0.00",
                'pagamento_default': "VARCHAR(100)",
                'listino_id': "INTEGER",
                'note': "TEXT",
                'is_active': "BOOLEAN DEFAULT 1",
                'created_at': "DATETIME DEFAULT CURRENT_TIMESTAMP",
                'updated_at': "DATETIME DEFAULT CURRENT_TIMESTAMP"
            }
            
            # Aggiungi ragione_sociale solo se non esiste né nome né ragione_sociale
            if not has_nome_field and 'ragione_sociale' not in existing_cols:
                required_cols['ragione_sociale'] = "VARCHAR(255)"
            
            # Aggiungi colonne mancanti
            for col_name, col_def in required_cols.items():
                if col_name not in existing_cols:
                    try:
                        cursor.execute(f"ALTER TABLE clienti ADD COLUMN {col_name} {col_def}")
                        print(f"      + aggiunta colonna clienti.{col_name}")
                    except Exception as e:
                        print(f"      ⚠️ colonna {col_name}: {e}")
            
            print("   ✅ clienti (aggiornata)")
        else:
            cursor.execute("""
                CREATE TABLE clienti (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    codice VARCHAR(50) UNIQUE NOT NULL,
                    ragione_sociale VARCHAR(255) NOT NULL,
                    partita_iva VARCHAR(20),
                    codice_fiscale VARCHAR(20),
                    indirizzo VARCHAR(255),
                    cap VARCHAR(10),
                    citta VARCHAR(100),
                    provincia VARCHAR(5),
                    nazione VARCHAR(50) DEFAULT 'Italia',
                    telefono VARCHAR(50),
                    email VARCHAR(255),
                    pec VARCHAR(255),
                    sconto_produzione DECIMAL(5,2) DEFAULT 0.00,
                    sconto_acquisto DECIMAL(5,2) DEFAULT 0.00,
                    sconto_globale DECIMAL(5,2) DEFAULT 0.00,
                    pagamento_default VARCHAR(100),
                    listino_id INTEGER,
                    note TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            print("   ✅ clienti (nuova)")
        
        # Crea indici solo se le colonne esistono
        try:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_clienti_codice ON clienti(codice)")
        except:
            pass
        try:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_clienti_ragione ON clienti(ragione_sociale)")
        except:
            pass
        
        # 6. CATEGORIE ARTICOLI
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS categorie_articoli (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codice VARCHAR(50) UNIQUE NOT NULL,
                nome VARCHAR(255) NOT NULL,
                descrizione TEXT,
                categoria_padre_id INTEGER,
                ordine INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                FOREIGN KEY (categoria_padre_id) REFERENCES categorie_articoli(id)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_categorie_codice ON categorie_articoli(codice)")
        print("   ✅ categorie_articoli")
        
        # 7. ARTICOLI - Gestione tabella esistente o nuova
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='articoli'")
        articoli_exists = cursor.fetchone() is not None
        
        if articoli_exists:
            cursor.execute("PRAGMA table_info(articoli)")
            existing_cols = {row[1] for row in cursor.fetchall()}
            
            required_cols = {
                'codice': "VARCHAR(50)",
                'descrizione': "VARCHAR(500)",
                'descrizione_estesa': "TEXT",
                'tipo_articolo': "VARCHAR(20) DEFAULT 'PRODUZIONE'",
                'categoria_id': "INTEGER",
                'costo_fisso': "DECIMAL(12,4) DEFAULT 0.0000",
                'costo_variabile': "DECIMAL(12,4) DEFAULT 0.0000",
                'unita_misura_variabile': "VARCHAR(20)",
                'costo_ultimo_acquisto': "DECIMAL(12,4) DEFAULT 0.0000",
                'data_ultimo_acquisto': "DATETIME",
                'prezzo_listino': "DECIMAL(12,4) DEFAULT 0.0000",
                'ricarico_percentuale': "DECIMAL(5,2)",
                'rule_id_calcolo': "VARCHAR(100)",
                'rule_params': "TEXT",
                'giacenza': "INTEGER DEFAULT 0",
                'scorta_minima': "INTEGER DEFAULT 0",
                'unita_misura': "VARCHAR(20) DEFAULT 'PZ'",
                'peso': "DECIMAL(10,3)",
                'volume': "DECIMAL(10,3)",
                'codice_fornitore': "VARCHAR(100)",
                'codice_ean': "VARCHAR(20)",
                'complessivo_padre_id': "INTEGER",
                'note': "TEXT",
                'is_active': "BOOLEAN DEFAULT 1",
                'created_at': "DATETIME DEFAULT CURRENT_TIMESTAMP",
                'updated_at': "DATETIME DEFAULT CURRENT_TIMESTAMP"
            }
            
            for col_name, col_def in required_cols.items():
                if col_name not in existing_cols:
                    try:
                        cursor.execute(f"ALTER TABLE articoli ADD COLUMN {col_name} {col_def}")
                        print(f"      + aggiunta colonna articoli.{col_name}")
                    except Exception as e:
                        print(f"      ⚠️ colonna {col_name}: {e}")
            
            print("   ✅ articoli (aggiornata)")
        else:
            cursor.execute("""
                CREATE TABLE articoli (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    codice VARCHAR(50) UNIQUE NOT NULL,
                    descrizione VARCHAR(500) NOT NULL,
                    descrizione_estesa TEXT,
                    tipo_articolo VARCHAR(20) DEFAULT 'PRODUZIONE',
                    categoria_id INTEGER,
                    costo_fisso DECIMAL(12,4) DEFAULT 0.0000,
                    costo_variabile DECIMAL(12,4) DEFAULT 0.0000,
                    unita_misura_variabile VARCHAR(20),
                    costo_ultimo_acquisto DECIMAL(12,4) DEFAULT 0.0000,
                    data_ultimo_acquisto DATETIME,
                    prezzo_listino DECIMAL(12,4) DEFAULT 0.0000,
                    ricarico_percentuale DECIMAL(5,2),
                    rule_id_calcolo VARCHAR(100),
                    rule_params TEXT,
                    giacenza INTEGER DEFAULT 0,
                    scorta_minima INTEGER DEFAULT 0,
                    unita_misura VARCHAR(20) DEFAULT 'PZ',
                    peso DECIMAL(10,3),
                    volume DECIMAL(10,3),
                    codice_fornitore VARCHAR(100),
                    codice_ean VARCHAR(20),
                    complessivo_padre_id INTEGER,
                    note TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (categoria_id) REFERENCES categorie_articoli(id),
                    FOREIGN KEY (complessivo_padre_id) REFERENCES articoli(id)
                )
            """)
            print("   ✅ articoli (nuova)")
        
        # Crea indici (safe)
        try:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_articoli_codice ON articoli(codice)")
        except:
            pass
        try:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_articoli_tipo ON articoli(tipo_articolo)")
        except:
            pass
        try:
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_articoli_categoria ON articoli(categoria_id)")
        except:
            pass
        
        # 8. RIGHE RICAMBIO
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS righe_ricambio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                preventivo_id INTEGER NOT NULL,
                articolo_id INTEGER,
                codice_articolo VARCHAR(50) NOT NULL,
                descrizione VARCHAR(500) NOT NULL,
                quantita DECIMAL(10,2) DEFAULT 1.00,
                unita_misura VARCHAR(20) DEFAULT 'PZ',
                parametro_calcolo DECIMAL(12,4),
                costo_base DECIMAL(12,4) DEFAULT 0.0000,
                prezzo_listino DECIMAL(12,4) DEFAULT 0.0000,
                ricarico_applicato DECIMAL(5,2) DEFAULT 0.00,
                sconto_cliente DECIMAL(5,2) DEFAULT 0.00,
                prezzo_unitario DECIMAL(12,4) DEFAULT 0.0000,
                prezzo_totale DECIMAL(12,4) DEFAULT 0.0000,
                note TEXT,
                ordine INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (preventivo_id) REFERENCES preventivi(id) ON DELETE CASCADE,
                FOREIGN KEY (articolo_id) REFERENCES articoli(id)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_righe_preventivo ON righe_ricambio(preventivo_id)")
        print("   ✅ righe_ricambio")
        
        # ==========================================
        # MODIFICHE TABELLA PREVENTIVI
        # ==========================================
        
        print("\n📝 Modifica tabella preventivi...")
        
        # Verifica colonne esistenti
        cursor.execute("PRAGMA table_info(preventivi)")
        existing_columns = [row[1] for row in cursor.fetchall()]
        
        # Aggiungi nuove colonne se non esistono
        new_columns = [
            ("tipo_preventivo", "VARCHAR(20) DEFAULT 'COMPLETO'"),
            ("cliente_id", "INTEGER"),
            ("totale_lordo", "DECIMAL(12,2) DEFAULT 0.00"),
            ("totale_sconti", "DECIMAL(12,2) DEFAULT 0.00"),
            ("totale_netto", "DECIMAL(12,2) DEFAULT 0.00"),
        ]
        
        for col_name, col_def in new_columns:
            if col_name not in existing_columns:
                cursor.execute(f"ALTER TABLE preventivi ADD COLUMN {col_name} {col_def}")
                print(f"   ✅ Aggiunta colonna: {col_name}")
            else:
                print(f"   ⏭️ Colonna già esistente: {col_name}")
        
        # ==========================================
        # DATI DI DEFAULT
        # ==========================================
        
        print("\n📊 Inserimento dati di default...")
        
        # Parametri sistema
        default_params = [
            ("ricarico_produzione_default", "30.00", "Ricarico % default per articoli di PRODUZIONE", "number", "ricarichi"),
            ("ricarico_acquisto_default", "15.00", "Ricarico % default per articoli di ACQUISTO", "number", "ricarichi"),
            ("iva_default", "22.00", "Aliquota IVA default", "number", "fiscale"),
        ]
        
        for chiave, valore, descrizione, tipo_dato, gruppo in default_params:
            cursor.execute("SELECT id FROM parametri_sistema WHERE chiave = ?", (chiave,))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO parametri_sistema (chiave, valore, descrizione, tipo_dato, gruppo)
                    VALUES (?, ?, ?, ?, ?)
                """, (chiave, valore, descrizione, tipo_dato, gruppo))
                print(f"   ✅ Parametro: {chiave}")
        
        # Gruppi utenti
        default_groups = [
            ("Amministratori", "Accesso completo al sistema", 1),
            ("Commerciali", "Gestione preventivi e clienti", 0),
            ("Tecnici", "Gestione configurazioni tecniche", 0),
            ("Visualizzatori", "Solo visualizzazione", 0),
        ]
        
        for nome, descrizione, is_admin in default_groups:
            cursor.execute("SELECT id FROM gruppi_utenti WHERE nome = ?", (nome,))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO gruppi_utenti (nome, descrizione, is_admin)
                    VALUES (?, ?, ?)
                """, (nome, descrizione, is_admin))
                print(f"   ✅ Gruppo: {nome}")
        
        # Categorie articoli
        default_categorie = [
            ("CAVI", "Cavi e conduttori", 1),
            ("COMPONENTI", "Componenti elettrici", 2),
            ("QUADRI", "Quadri e contenitori", 3),
            ("ACCESSORI", "Accessori vari", 4),
        ]
        
        for codice, nome, ordine in default_categorie:
            cursor.execute("SELECT id FROM categorie_articoli WHERE codice = ?", (codice,))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO categorie_articoli (codice, nome, ordine)
                    VALUES (?, ?, ?)
                """, (codice, nome, ordine))
                print(f"   ✅ Categoria: {codice}")
        
        # Articoli di esempio
        example_articoli = [
            ("CAV-FG7OR-3G1.5", "Cavo FG7OR 3G1.5", "CAVI", "PRODUZIONE", 0.50, 0.35, "m", 0.00, None),
            ("CAV-FG7OR-3G2.5", "Cavo FG7OR 3G2.5", "CAVI", "PRODUZIONE", 0.60, 0.45, "m", 0.00, None),
            ("CAV-FLAT-24G0.75", "Cavo piatto 24G0.75", "CAVI", "PRODUZIONE", 1.00, 0.80, "m", 0.00, None),
            ("REL-24V-10A", "Relè 24V 10A", "COMPONENTI", "ACQUISTO", 0.00, 0.00, None, 12.50, None),
            ("CONT-LC1D25", "Contattore LC1D25", "COMPONENTI", "ACQUISTO", 0.00, 0.00, None, 45.00, None),
            ("INT-16A-2P", "Interruttore 16A 2P", "COMPONENTI", "ACQUISTO", 0.00, 0.00, None, 8.50, None),
        ]
        
        for codice, descrizione, cat_cod, tipo, c_fisso, c_var, um_var, c_acq, prezzo in example_articoli:
            cursor.execute("SELECT id FROM articoli WHERE codice = ?", (codice,))
            if not cursor.fetchone():
                # Trova categoria_id
                cursor.execute("SELECT id FROM categorie_articoli WHERE codice = ?", (cat_cod,))
                cat_row = cursor.fetchone()
                cat_id = cat_row[0] if cat_row else None
                
                cursor.execute("""
                    INSERT INTO articoli (codice, descrizione, tipo_articolo, categoria_id, 
                                         costo_fisso, costo_variabile, unita_misura_variabile, 
                                         costo_ultimo_acquisto, prezzo_listino)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (codice, descrizione, tipo, cat_id, c_fisso, c_var, um_var, c_acq, prezzo or 0))
                print(f"   ✅ Articolo: {codice}")
        
        # Clienti di esempio
        # Verifica struttura tabella clienti per adattare inserimento
        cursor.execute("PRAGMA table_info(clienti)")
        clienti_cols = {row[1] for row in cursor.fetchall()}
        
        example_clienti = [
            ("CLI001", "Ascensori Rossi S.r.l.", "01234567890", "Via Roma 123, Milano", "10.00", "5.00"),
            ("CLI002", "Impianti Bianchi S.p.A.", "09876543210", "Corso Italia 456, Torino", "15.00", "8.00"),
        ]
        
        for codice, ragione, piva, indirizzo, sc_prod, sc_acq in example_clienti:
            # Verifica se cliente esiste (per codice o per nome/ragione_sociale)
            cursor.execute("SELECT id FROM clienti WHERE codice = ?", (codice,))
            if not cursor.fetchone():
                # Adatta inserimento alla struttura esistente
                if 'ragione_sociale' in clienti_cols and 'nome' not in clienti_cols:
                    # Struttura nuova
                    cursor.execute("""
                        INSERT INTO clienti (codice, ragione_sociale, partita_iva, indirizzo, 
                                            sconto_produzione, sconto_acquisto)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (codice, ragione, piva, indirizzo, sc_prod, sc_acq))
                elif 'nome' in clienti_cols:
                    # Struttura vecchia con 'nome'
                    cursor.execute("""
                        INSERT INTO clienti (codice, nome, partita_iva, indirizzo, 
                                            sconto_produzione, sconto_acquisto)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (codice, ragione, piva, indirizzo, sc_prod, sc_acq))
                else:
                    # Struttura minima
                    cursor.execute("""
                        INSERT INTO clienti (codice)
                        VALUES (?)
                    """, (codice,))
                print(f"   ✅ Cliente: {codice}")
        
        # Commit
        conn.commit()
        
        print("\n" + "="*60)
        print("✅ MIGRAZIONE COMPLETATA CON SUCCESSO!")
        print("="*60)
        
        if backup_path:
            print(f"\n📁 Backup disponibile in: {backup_path}")
        
        print("\nProssimi passi:")
        print("1. Riavvia il server FastAPI")
        print("2. Visita http://localhost:8000/docs per testare le nuove API")
        print("3. Chiama POST /api/init-data per inizializzare ulteriori dati")
        
    except Exception as e:
        conn.rollback()
        print(f"\n❌ ERRORE durante la migrazione: {e}")
        if backup_path:
            print(f"⚠️ Puoi ripristinare dal backup: {backup_path}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
