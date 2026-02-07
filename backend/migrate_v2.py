"""
Script di migrazione per aggiornare il database v2.0
Aggiunge tabelle mancanti e dati demo
"""
import sqlite3
import os
from datetime import datetime

DB_PATH = "configuratore.db"

def run_migration():
    print("🚀 Avvio migrazione database v2.0...")
    
    # Crea il database se non esiste
    if not os.path.exists(DB_PATH):
        print(f"📦 Database {DB_PATH} non trovato, verrà creato...")
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # ==========================================
        # DROP TABELLE DA RICREARE
        # ==========================================
        print("🗑️ Pulizia tabelle esistenti...")
        tables_to_drop = ["righe_ricambio", "articoli", "categorie_articoli", "clienti", "argano", "utenti", "template_preventivi", "preventivi", "dati_commessa", "dati_principali", "normative", "disposizione_vano", "porte", "materiali"]
        for table in tables_to_drop:
            try:
                cursor.execute(f"DROP TABLE IF EXISTS {table}")
                print(f"  ✅ Eliminata tabella {table}")
            except Exception as e:
                print(f"  ⚠️ {table}: {e}")
        
        # ==========================================
        # TABELLE NUOVE
        # ==========================================
        
        # 1. Parametri Sistema
        print("📋 Creazione tabella parametri_sistema...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS parametri_sistema (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chiave VARCHAR(100) UNIQUE NOT NULL,
                valore VARCHAR(500) NOT NULL,
                descrizione VARCHAR(500),
                tipo_dato VARCHAR(50) DEFAULT 'string',
                gruppo VARCHAR(100),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 1b. Opzioni Dropdown
        print("📋 Creazione tabella opzioni_dropdown...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS opzioni_dropdown (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gruppo VARCHAR(100) NOT NULL,
                valore VARCHAR(200) NOT NULL,
                etichetta VARCHAR(200) NOT NULL,
                ordine INTEGER DEFAULT 0,
                attivo BOOLEAN DEFAULT 1,
                descrizione VARCHAR(500),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_opzioni_gruppo ON opzioni_dropdown(gruppo)")
        
        # 1c. Campi Configuratore (per Rule Designer)
        print("📋 Creazione tabella campi_configuratore...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS campi_configuratore (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codice VARCHAR(100) UNIQUE NOT NULL,
                etichetta VARCHAR(200) NOT NULL,
                tipo VARCHAR(50) NOT NULL,
                sezione VARCHAR(100) NOT NULL,
                gruppo_dropdown VARCHAR(100),
                unita_misura VARCHAR(20),
                valore_min REAL,
                valore_max REAL,
                valore_default VARCHAR(200),
                descrizione VARCHAR(500),
                obbligatorio BOOLEAN DEFAULT 0,
                ordine INTEGER DEFAULT 0,
                attivo BOOLEAN DEFAULT 1,
                visibile_form BOOLEAN DEFAULT 1,
                usabile_regole BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_campi_sezione ON campi_configuratore(sezione)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_campi_codice ON campi_configuratore(codice)")
        
        # 2. Gruppi Utenti
        print("📋 Creazione tabella gruppi_utenti...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS gruppi_utenti (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome VARCHAR(100) UNIQUE NOT NULL,
                descrizione VARCHAR(500),
                is_admin BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 3. Permessi Gruppi
        print("📋 Creazione tabella permessi_gruppi...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS permessi_gruppi (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                gruppo_id INTEGER NOT NULL,
                codice_permesso VARCHAR(100) NOT NULL,
                descrizione VARCHAR(500),
                FOREIGN KEY (gruppo_id) REFERENCES gruppi_utenti(id) ON DELETE CASCADE
            )
        """)
        
        # 4. Utenti
        print("📋 Creazione tabella utenti...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS utenti (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                nome VARCHAR(100),
                cognome VARCHAR(100),
                email VARCHAR(255),
                gruppo_id INTEGER,
                is_admin BOOLEAN DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME,
                FOREIGN KEY (gruppo_id) REFERENCES gruppi_utenti(id)
            )
        """)
        
        # 4b. Template Preventivi
        print("📋 Creazione tabella template_preventivi...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS template_preventivi (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nome VARCHAR(255) NOT NULL,
                descrizione TEXT,
                created_by INTEGER,
                is_public BOOLEAN DEFAULT 0,
                dati_json TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES utenti(id)
            )
        """)
        
        # 4c. Preventivi
        print("📋 Creazione tabella preventivi...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS preventivi (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero_preventivo VARCHAR(50) UNIQUE NOT NULL,
                tipo_preventivo VARCHAR(20) DEFAULT 'COMPLETO',
                cliente_id INTEGER,
                customer_name VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                data_scadenza DATETIME,
                status VARCHAR(20) DEFAULT 'draft',
                total_price DECIMAL(12,2) DEFAULT 0,
                sconto_cliente DECIMAL(5,2) DEFAULT 0,
                sconto_extra_admin DECIMAL(5,2) DEFAULT 0,
                total_price_finale DECIMAL(12,2) DEFAULT 0,
                note TEXT,
                created_by INTEGER,
                FOREIGN KEY (cliente_id) REFERENCES clienti(id),
                FOREIGN KEY (created_by) REFERENCES utenti(id)
            )
        """)
        
        # 5. Clienti
        print("📋 Creazione tabella clienti...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS clienti (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codice VARCHAR(50) UNIQUE NOT NULL,
                ragione_sociale VARCHAR(255) NOT NULL,
                partita_iva VARCHAR(20),
                codice_fiscale VARCHAR(20),
                indirizzo VARCHAR(255),
                cap VARCHAR(10),
                citta VARCHAR(100),
                provincia VARCHAR(5),
                nazione VARCHAR(100) DEFAULT 'Italia',
                telefono VARCHAR(50),
                email VARCHAR(255),
                pec VARCHAR(255),
                sconto_globale DECIMAL(5,2) DEFAULT 0,
                sconto_produzione DECIMAL(5,2) DEFAULT 0,
                sconto_acquisto DECIMAL(5,2) DEFAULT 0,
                aliquota_iva DECIMAL(5,2) DEFAULT 22,
                pagamento_default VARCHAR(100),
                imballo_default VARCHAR(100),
                reso_fco_default VARCHAR(100),
                trasporto_default VARCHAR(100),
                destinazione_default VARCHAR(255),
                riferimento_cliente_default VARCHAR(100),
                listino VARCHAR(50),
                note TEXT,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 6. Categorie Articoli
        print("📋 Creazione tabella categorie_articoli...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS categorie_articoli (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codice VARCHAR(50) UNIQUE NOT NULL,
                nome VARCHAR(255) NOT NULL,
                descrizione TEXT,
                ordine INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT 1
            )
        """)
        
        # 7. Articoli
        print("📋 Creazione tabella articoli...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS articoli (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codice VARCHAR(50) UNIQUE NOT NULL,
                descrizione VARCHAR(500) NOT NULL,
                descrizione_estesa TEXT,
                tipo_articolo VARCHAR(20) DEFAULT 'PRODUZIONE',
                categoria_id INTEGER,
                costo_fisso DECIMAL(12,4) DEFAULT 0,
                costo_variabile_1 DECIMAL(12,4) DEFAULT 0,
                unita_misura_var_1 VARCHAR(20),
                descrizione_var_1 VARCHAR(100),
                costo_variabile_2 DECIMAL(12,4) DEFAULT 0,
                unita_misura_var_2 VARCHAR(20),
                descrizione_var_2 VARCHAR(100),
                costo_variabile_3 DECIMAL(12,4) DEFAULT 0,
                unita_misura_var_3 VARCHAR(20),
                descrizione_var_3 VARCHAR(100),
                costo_variabile_4 DECIMAL(12,4) DEFAULT 0,
                unita_misura_var_4 VARCHAR(20),
                descrizione_var_4 VARCHAR(100),
                rule_id_calcolo VARCHAR(100),
                ricarico_percentuale DECIMAL(5,2),
                unita_misura VARCHAR(20) DEFAULT 'PZ',
                giacenza INTEGER DEFAULT 0,
                scorta_minima INTEGER DEFAULT 0,
                fornitore VARCHAR(255),
                codice_fornitore VARCHAR(50),
                lead_time_giorni INTEGER DEFAULT 0,
                manodopera_giorni INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (categoria_id) REFERENCES categorie_articoli(id)
            )
        """)
        
        # 8. Righe Ricambio
        print("📋 Creazione tabella righe_ricambio...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS righe_ricambio (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                preventivo_id INTEGER NOT NULL,
                articolo_id INTEGER,
                codice VARCHAR(50) NOT NULL,
                descrizione VARCHAR(500) NOT NULL,
                tipo_articolo VARCHAR(20) DEFAULT 'PRODUZIONE',
                quantita DECIMAL(10,2) DEFAULT 1,
                parametro_1 DECIMAL(10,2),
                unita_param_1 VARCHAR(20),
                desc_param_1 VARCHAR(100),
                costo_var_1 DECIMAL(12,4) DEFAULT 0,
                parametro_2 DECIMAL(10,2),
                unita_param_2 VARCHAR(20),
                desc_param_2 VARCHAR(100),
                costo_var_2 DECIMAL(12,4) DEFAULT 0,
                parametro_3 DECIMAL(10,2),
                unita_param_3 VARCHAR(20),
                desc_param_3 VARCHAR(100),
                costo_var_3 DECIMAL(12,4) DEFAULT 0,
                parametro_4 DECIMAL(10,2),
                unita_param_4 VARCHAR(20),
                desc_param_4 VARCHAR(100),
                costo_var_4 DECIMAL(12,4) DEFAULT 0,
                costo_fisso DECIMAL(12,4) DEFAULT 0,
                costo_base_unitario DECIMAL(12,4) DEFAULT 0,
                ricarico_percentuale DECIMAL(5,2) DEFAULT 0,
                prezzo_listino_unitario DECIMAL(12,4) DEFAULT 0,
                sconto_cliente DECIMAL(5,2) DEFAULT 0,
                prezzo_cliente_unitario DECIMAL(12,4) DEFAULT 0,
                prezzo_totale_listino DECIMAL(12,2) DEFAULT 0,
                prezzo_totale_cliente DECIMAL(12,2) DEFAULT 0,
                ordine INTEGER DEFAULT 0,
                note TEXT,
                FOREIGN KEY (preventivo_id) REFERENCES preventivi(id) ON DELETE CASCADE,
                FOREIGN KEY (articolo_id) REFERENCES articoli(id)
            )
        """)
        
        # ==========================================
        # AGGIUNTA TABELLE MANCANTI
        # ==========================================
        print("📋 Creazione tabella materiali...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS materiali (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                preventivo_id INTEGER NOT NULL,
                codice VARCHAR(50) NOT NULL,
                descrizione VARCHAR(500) NOT NULL,
                quantita DECIMAL(10,2) DEFAULT 1,
                prezzo_unitario DECIMAL(12,4) DEFAULT 0,
                prezzo_totale DECIMAL(12,2) DEFAULT 0,
                categoria VARCHAR(100),
                aggiunto_da_regola BOOLEAN DEFAULT 0,
                regola_id VARCHAR(100),
                note TEXT,
                lead_time_giorni INTEGER DEFAULT 0,
                manodopera_giorni INTEGER DEFAULT 0,
                FOREIGN KEY (preventivo_id) REFERENCES preventivi(id) ON DELETE CASCADE
            )
        """)
        
        print("📋 Creazione tabella dati_commessa...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dati_commessa (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                preventivo_id INTEGER UNIQUE NOT NULL,
                numero_offerta VARCHAR(50),
                data_offerta VARCHAR(20),
                riferimento_cliente VARCHAR(255),
                quantita INTEGER,
                data_consegna_richiesta DATE,
                imballo VARCHAR(100),
                reso_fco VARCHAR(100),
                pagamento VARCHAR(100),
                trasporto VARCHAR(100),
                destinazione VARCHAR(255),
                FOREIGN KEY (preventivo_id) REFERENCES preventivi(id) ON DELETE CASCADE
            )
        """)
        
        print("📋 Creazione tabella dati_principali...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dati_principali (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                preventivo_id INTEGER UNIQUE NOT NULL,
                tipo_impianto VARCHAR(50),
                nuovo_impianto BOOLEAN,
                numero_fermate INTEGER,
                numero_servizi INTEGER,
                velocita REAL,
                corsa REAL,
                forza_motrice VARCHAR(50),
                luce VARCHAR(50),
                tensione_manovra VARCHAR(50),
                tensione_freno VARCHAR(50),
                FOREIGN KEY (preventivo_id) REFERENCES preventivi(id) ON DELETE CASCADE
            )
        """)
        
        print("📋 Creazione tabella normative...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS normative (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                preventivo_id INTEGER UNIQUE NOT NULL,
                en_81_1 VARCHAR(20),
                en_81_20 VARCHAR(20),
                en_81_21 VARCHAR(20),
                en_81_28 BOOLEAN DEFAULT 0,
                en_81_70 BOOLEAN DEFAULT 0,
                en_81_72 BOOLEAN DEFAULT 0,
                en_81_73 BOOLEAN DEFAULT 0,
                a3_95_16 BOOLEAN DEFAULT 0,
                dm236_legge13 BOOLEAN DEFAULT 0,
                emendamento_a3 BOOLEAN DEFAULT 0,
                uni_10411_1 BOOLEAN DEFAULT 0,
                FOREIGN KEY (preventivo_id) REFERENCES preventivi(id) ON DELETE CASCADE
            )
        """)
        
        print("📋 Creazione tabella disposizione_vano...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS disposizione_vano (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                preventivo_id INTEGER UNIQUE NOT NULL,
                posizione_quadro_lato VARCHAR(50),
                posizione_quadro_piano VARCHAR(50),
                altezza_vano DECIMAL(10,2),
                piano_piu_alto VARCHAR(50),
                piano_piu_basso VARCHAR(50),
                posizioni_elementi TEXT,
                sbarchi TEXT,
                note TEXT,
                FOREIGN KEY (preventivo_id) REFERENCES preventivi(id) ON DELETE CASCADE
            )
        """)
        
        print("📋 Creazione tabella porte...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS porte (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                preventivo_id INTEGER UNIQUE NOT NULL,
                tipo_porte_piano VARCHAR(100),
                tipo_porte_cabina VARCHAR(100),
                numero_accessi INTEGER,
                tipo_operatore VARCHAR(100),
                marca_operatore VARCHAR(100),
                stazionamento_porte VARCHAR(100),
                tipo_apertura VARCHAR(100),
                distanza_minima_accessi REAL,
                alimentazione_operatore VARCHAR(100),
                con_scheda BOOLEAN,
                FOREIGN KEY (preventivo_id) REFERENCES preventivi(id) ON DELETE CASCADE
            )
        """)
        
        print("📋 Creazione tabella argano...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS argano (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                preventivo_id INTEGER UNIQUE NOT NULL,
                trazione VARCHAR(100),
                potenza_motore_kw DECIMAL(10,2),
                corrente_nom_motore_amp DECIMAL(10,2),
                tipo_vvvf VARCHAR(100),
                vvvf_nel_vano BOOLEAN DEFAULT 0,
                freno_tensione VARCHAR(50),
                ventilazione_forzata VARCHAR(50),
                tipo_teleruttore VARCHAR(100),
                FOREIGN KEY (preventivo_id) REFERENCES preventivi(id) ON DELETE CASCADE
            )
        """)
        
        # ==========================================
        # AGGIORNA TABELLA PREVENTIVI
        # ==========================================
        print("📋 Aggiornamento tabella preventivi...")
        
        columns_to_add = [
            ("tipo_preventivo", "VARCHAR(20) DEFAULT 'COMPLETO'"),
            ("cliente_id", "INTEGER"),
            ("data_scadenza", "DATETIME"),
            ("sconto_cliente", "DECIMAL(5,2) DEFAULT 0"),
            ("sconto_extra_admin", "DECIMAL(5,2) DEFAULT 0"),
            ("total_price_finale", "DECIMAL(12,2) DEFAULT 0"),
            ("note", "TEXT"),
            ("created_by", "INTEGER"),
        ]
        
        cursor.execute("PRAGMA table_info(preventivi)")
        existing_columns = [col[1] for col in cursor.fetchall()]
        
        for col_name, col_def in columns_to_add:
            if col_name not in existing_columns:
                try:
                    cursor.execute(f"ALTER TABLE preventivi ADD COLUMN {col_name} {col_def}")
                    print(f"  ✅ Aggiunta colonna {col_name}")
                except Exception as e:
                    print(f"  ⚠️ Colonna {col_name}: {e}")
        
        # ==========================================
        # INSERISCI DATI DEMO
        # ==========================================
        print("\n📦 Inserimento dati demo...")
        
        # Parametri Sistema
        parametri = [
            ("ricarico_produzione_default", "30.00", "Ricarico % default per articoli PRODUZIONE", "number", "ricarichi"),
            ("ricarico_acquisto_default", "15.00", "Ricarico % default per articoli ACQUISTO", "number", "ricarichi"),
            ("iva_default", "22.00", "Aliquota IVA default", "number", "fiscale"),
            ("prefisso_preventivo", "PREV", "Prefisso per numero preventivo", "string", "preventivi"),
        ]
        
        for chiave, valore, desc, tipo, gruppo in parametri:
            cursor.execute("SELECT id FROM parametri_sistema WHERE chiave = ?", (chiave,))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO parametri_sistema (chiave, valore, descrizione, tipo_dato, gruppo)
                    VALUES (?, ?, ?, ?, ?)
                """, (chiave, valore, desc, tipo, gruppo))
                print(f"  ✅ Parametro: {chiave}")
        
        # Utenti Demo
        # Formato: (username, password, nome, cognome, email, is_admin)
        utenti = [
            ("admin", "admin", "Amministratore", "Sistema", "admin@elettroquadri.it", True),
            ("utente", "utente", "Mario", "Rossi", "mario.rossi@elettroquadri.it", False),
            ("vendite", "vendite", "Laura", "Bianchi", "laura.bianchi@elettroquadri.it", False),
        ]
        
        for username, pwd, nome, cognome, email, is_admin in utenti:
            cursor.execute("SELECT id FROM utenti WHERE username = ?", (username,))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO utenti (username, password_hash, nome, cognome, email, is_admin)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (username, pwd, nome, cognome, email, is_admin))
                tipo_utente = "Admin" if is_admin else "Utente"
                print(f"  ✅ {tipo_utente}: {username} / {pwd}")
        
        # Template Preventivi Demo (creati da admin, pubblici)
        import json
        templates_demo = [
            (
                "Ascensore Residenziale Standard",
                "Template per ascensore residenziale 4 fermate, 630kg",
                1,  # created_by = admin
                True,  # is_public
                json.dumps({
                    "dati_principali": {
                        "tipo_impianto": "Ascensore elettrico",
                        "velocita": 1.0,
                        "portata_kg": 630,
                        "portata_persone": 8,
                        "numero_fermate": 4,
                        "corsa_m": 9.0,
                        "tensione_alimentazione": "400V trifase",
                        "frequenza_hz": 50
                    },
                    "normative": {
                        "normativa_riferimento": "EN81-20:2020",
                        "marcatura_ce": True,
                        "direttiva_ascensori": True
                    },
                    "argano": {
                        "trazione": "Gearless MRL",
                        "potenza_motore_kw": 5.5,
                        "corrente_nom_motore_amp": 12.0,
                        "vvvf_nel_vano": True,
                        "freno_tensione": "48 Vcc"
                    }
                })
            ),
            (
                "Ascensore Condominio Grande",
                "Template per condominio 8 fermate, 1000kg",
                1,
                True,
                json.dumps({
                    "dati_principali": {
                        "tipo_impianto": "Ascensore elettrico",
                        "velocita": 1.6,
                        "portata_kg": 1000,
                        "portata_persone": 13,
                        "numero_fermate": 8,
                        "corsa_m": 21.0,
                        "tensione_alimentazione": "400V trifase",
                        "frequenza_hz": 50
                    },
                    "normative": {
                        "normativa_riferimento": "EN81-20:2020",
                        "marcatura_ce": True,
                        "direttiva_ascensori": True
                    },
                    "argano": {
                        "trazione": "Gearless MRL",
                        "potenza_motore_kw": 11.0,
                        "corrente_nom_motore_amp": 22.0,
                        "vvvf_nel_vano": False,
                        "freno_tensione": "48 Vcc"
                    }
                })
            ),
            (
                "Montacarichi Industriale",
                "Template per montacarichi 2000kg",
                1,
                True,
                json.dumps({
                    "dati_principali": {
                        "tipo_impianto": "Montacarichi",
                        "velocita": 0.5,
                        "portata_kg": 2000,
                        "numero_fermate": 3,
                        "corsa_m": 6.0,
                        "tensione_alimentazione": "400V trifase",
                        "frequenza_hz": 50
                    },
                    "normative": {
                        "normativa_riferimento": "EN81-20:2020",
                        "direttiva_macchine": True
                    },
                    "argano": {
                        "trazione": "Geared",
                        "potenza_motore_kw": 15.0,
                        "corrente_nom_motore_amp": 30.0,
                        "vvvf_nel_vano": False
                    }
                })
            ),
        ]
        
        for nome, desc, created_by, is_public, dati_json in templates_demo:
            cursor.execute("SELECT id FROM template_preventivi WHERE nome = ?", (nome,))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO template_preventivi (nome, descrizione, created_by, is_public, dati_json)
                    VALUES (?, ?, ?, ?, ?)
                """, (nome, desc, created_by, is_public, dati_json))
                tipo = "🌐 Pubblico" if is_public else "🔒 Privato"
                print(f"  ✅ Template {tipo}: {nome}")
        
        # Categorie Articoli
        categorie = [
            ("CAVI", "Cavi e Conduttori", 1),
            ("COMPONENTI", "Componenti Elettrici", 2),
            ("QUADRI", "Quadri e Contenitori", 3),
            ("MOTORI", "Motori e Inverter", 4),
            ("SICUREZZA", "Dispositivi Sicurezza", 5),
            ("ACCESSORI", "Accessori Vari", 6),
            ("TRAZIONE", "Componenti Trazione", 7),
        ]
        
        for codice, nome, ordine in categorie:
            cursor.execute("SELECT id FROM categorie_articoli WHERE codice = ?", (codice,))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO categorie_articoli (codice, nome, ordine)
                    VALUES (?, ?, ?)
                """, (codice, nome, ordine))
                print(f"  ✅ Categoria: {codice}")
        
        # Opzioni Dropdown
        # Formato: (gruppo, valore, etichetta, ordine)
        opzioni_dropdown = [
            # Tipo Impianto
            ("tipo_impianto", "ascensore", "Ascensore", 1),
            ("tipo_impianto", "piattaforma", "Piattaforma", 2),
            ("tipo_impianto", "montacarichi", "Montacarichi", 3),
            ("tipo_impianto", "scala_mobile", "Scala Mobile", 4),
            ("tipo_impianto", "tappeto_mobile", "Tappeto Mobile", 5),
            
            # Forza Motrice
            ("forza_motrice", "3x400V", "3x400V", 1),
            ("forza_motrice", "3x400V+N", "3x400V + Neutro", 2),
            ("forza_motrice", "3x230V", "3x230V", 3),
            ("forza_motrice", "1x230V", "1x230V (Monofase)", 4),
            
            # Tensione Luce
            ("tensione_luce", "220V", "220V", 1),
            ("tensione_luce", "230V", "230V", 2),
            ("tensione_luce", "24V", "24V", 3),
            
            # Tensione Manovra
            ("tensione_manovra", "48Vcc", "48Vcc", 1),
            ("tensione_manovra", "60Vcc", "60Vcc", 2),
            ("tensione_manovra", "80Vcc", "80Vcc", 3),
            ("tensione_manovra", "110Vcc", "110Vcc", 4),
            ("tensione_manovra", "24Vcc", "24Vcc", 5),
            
            # Tensione Freno
            ("tensione_freno", "48Vcc", "48Vcc", 1),
            ("tensione_freno", "60Vcc", "60Vcc", 2),
            ("tensione_freno", "80Vcc", "80Vcc", 3),
            ("tensione_freno", "110Vcc", "110Vcc", 4),
            ("tensione_freno", "180Vcc", "180Vcc", 5),
            ("tensione_freno", "205Vcc", "205Vcc", 6),
            
            # Trazione (Argano)
            ("trazione", "gearless_mrl", "Gearless MRL", 1),
            ("trazione", "gearless_sala", "Gearless con Sala Macchine", 2),
            ("trazione", "geared", "Geared (con riduttore)", 3),
            ("trazione", "oleodinamica", "Oleodinamica", 4),
            
            # Tipo Quadro Manovra
            ("tipo_quadro_manovra", "elettrico", "Elettrico", 1),
            ("tipo_quadro_manovra", "oleodinamico", "Oleodinamico", 2),
            
            # Tipo Ordine
            ("tipo_ordine", "qm_precablato", "QM Precablato", 1),
            ("tipo_ordine", "qm_cablato", "QM Cablato", 2),
            ("tipo_ordine", "solo_quadro", "Solo Quadro", 3),
            ("tipo_ordine", "ricambi", "Ricambi", 4),
            
            # Stato Preventivo
            ("stato_preventivo", "bozza", "Bozza", 1),
            ("stato_preventivo", "da_confermare", "Completato da Confermare", 2),
            ("stato_preventivo", "confermato", "Confermato", 3),
            ("stato_preventivo", "annullato", "Annullato", 4),
            
            # Pagamento
            ("pagamento", "30gg_df", "30 gg d.f.", 1),
            ("pagamento", "60gg_df", "60 gg d.f.", 2),
            ("pagamento", "90gg_df", "90 gg d.f.", 3),
            ("pagamento", "anticipato", "Anticipato", 4),
            ("pagamento", "contrassegno", "Contrassegno", 5),
            ("pagamento", "bonifico", "Bonifico anticipato", 6),
            
            # Imballo
            ("imballo", "cartone", "Cartone", 1),
            ("imballo", "pallet", "Pallet", 2),
            ("imballo", "cassa_legno", "Cassa Legno", 3),
            ("imballo", "sfuso", "Sfuso", 4),
            
            # Trasporto
            ("trasporto", "corriere", "Corriere", 1),
            ("trasporto", "corriere_espresso", "Corriere Espresso", 2),
            ("trasporto", "ns_mezzo", "Ns. Mezzo", 3),
            ("trasporto", "ritiro_cliente", "Ritiro Cliente", 4),
            ("trasporto", "trasportatore_dedicato", "Trasportatore Dedicato", 5),
            
            # Direttiva
            ("direttiva", "2014/33/UE", "2014/33/UE", 1),
            ("direttiva", "2006/42/CE", "2006/42/CE (Macchine)", 2),
            
            # Tipo Manovra
            ("tipo_manovra", "universale", "Universale", 1),
            ("tipo_manovra", "collettiva_discesa", "Collettiva Discesa", 2),
            ("tipo_manovra", "collettiva_completa", "Collettiva Completa", 3),
            ("tipo_manovra", "simplex", "Simplex", 4),
            
            # Logica Processore
            ("logica_processore", "microprocessore_cabina", "Microprocessore Seriale Cabina", 1),
            ("logica_processore", "microprocessore_vano", "Microprocessore Seriale Vano", 2),
            ("logica_processore", "rele", "A Relè", 3),
            
            # Porte Cabina
            ("porte_cabina", "automatiche", "Automatiche", 1),
            ("porte_cabina", "semiautomatiche", "Semiautomatiche", 2),
            ("porte_cabina", "manuali", "Manuali", 3),
            
            # Porte Piano
            ("porte_piano", "automatiche", "Automatiche", 1),
            ("porte_piano", "semiautomatiche", "Semiautomatiche", 2),
            ("porte_piano", "manuali", "Manuali", 3),
            
            # Fornitore Operatore
            ("fornitore_operatore", "prisma", "Prisma", 1),
            ("fornitore_operatore", "fermator", "Fermator", 2),
            ("fornitore_operatore", "wittur", "Wittur", 3),
            ("fornitore_operatore", "sematic", "Sematic", 4),
            ("fornitore_operatore", "altro", "Altro", 99),
        ]
        
        print("📋 Inserimento opzioni dropdown...")
        for gruppo, valore, etichetta, ordine in opzioni_dropdown:
            cursor.execute("SELECT id FROM opzioni_dropdown WHERE gruppo = ? AND valore = ?", (gruppo, valore))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO opzioni_dropdown (gruppo, valore, etichetta, ordine, attivo)
                    VALUES (?, ?, ?, ?, 1)
                """, (gruppo, valore, etichetta, ordine))
        print(f"  ✅ Inserite {len(opzioni_dropdown)} opzioni dropdown")
        
        # Campi Configuratore (schema modulo d'ordine per Rule Designer)
        # Formato: (codice, etichetta, tipo, sezione, gruppo_dropdown, unita, min, max, default, desc, obbl, ordine)
        campi_configuratore = [
            # ==========================================
            # SEZIONE: DATI COMMESSA
            # ==========================================
            ("dati_commessa.numero_offerta", "Numero Offerta", "testo", "dati_commessa", None, None, None, None, None, "Numero identificativo offerta", False, 1),
            ("dati_commessa.commessa", "Commessa", "testo", "dati_commessa", None, None, None, None, None, "Riferimento commessa cliente", False, 2),
            ("dati_commessa.riferimento_cliente", "Riferimento Cliente", "testo", "dati_commessa", None, None, None, None, None, "Referente o ufficio cliente", False, 3),
            ("dati_commessa.tipo_ordine", "Tipo Ordine", "dropdown", "dati_commessa", "tipo_ordine", None, None, None, "qm_precablato", "Tipologia ordine", True, 4),
            ("dati_commessa.data_consegna_richiesta", "Data Consegna Richiesta", "data", "dati_commessa", None, None, None, None, None, "Data consegna desiderata", False, 5),
            ("dati_commessa.pagamento", "Pagamento", "dropdown", "dati_commessa", "pagamento", None, None, None, "30gg_df", "Modalità pagamento", False, 6),
            ("dati_commessa.imballo", "Imballo", "dropdown", "dati_commessa", "imballo", None, None, None, "cartone", "Tipo imballo", False, 7),
            ("dati_commessa.trasporto", "Trasporto", "dropdown", "dati_commessa", "trasporto", None, None, None, "corriere", "Modalità trasporto", False, 8),
            ("dati_commessa.resa", "Resa", "testo", "dati_commessa", None, None, None, None, "Ns. Stabilimento", "Punto di resa merce", False, 9),
            ("dati_commessa.destinazione", "Destinazione", "testo", "dati_commessa", None, None, None, None, None, "Indirizzo consegna", False, 10),
            ("dati_commessa.stato_preventivo", "Stato Preventivo", "dropdown", "dati_commessa", "stato_preventivo", None, None, None, "bozza", "Stato del preventivo", False, 11),
            ("dati_commessa.validita_offerta", "Validità Offerta", "numero", "dati_commessa", None, "giorni", 1, 365, "30", "Giorni validità offerta", False, 12),
            
            # ==========================================
            # SEZIONE: DATI PRINCIPALI
            # ==========================================
            ("dati_principali.tipo_impianto", "Tipo Impianto", "dropdown", "dati_principali", "tipo_impianto", None, None, None, "ascensore", "Tipologia impianto", True, 1),
            ("dati_principali.nuovo_impianto", "Nuovo Impianto", "booleano", "dati_principali", None, None, None, None, "true", "Se è nuovo impianto o ristrutturazione", False, 2),
            ("dati_principali.tipo_quadro_manovra", "Tipo Quadro Manovra", "dropdown", "dati_principali", "tipo_quadro_manovra", None, None, None, "elettrico", "Tipo quadro di manovra", False, 3),
            ("dati_principali.numero_fermate", "Numero Fermate", "numero", "dati_principali", None, None, 2, 50, "2", "Numero di fermate", True, 4),
            ("dati_principali.numero_accessi", "Numero Accessi", "numero", "dati_principali", None, None, 1, 4, "1", "Accessi per piano (1-4)", False, 5),
            ("dati_principali.numero_servizi", "Numero Servizi", "numero", "dati_principali", None, None, 1, 50, "2", "Numero piani serviti", False, 6),
            ("dati_principali.distanza_minima_piani", "Distanza Minima tra Piani", "numero", "dati_principali", None, "mm", 0, 10000, "0", "Distanza minima interpiano", False, 7),
            ("dati_principali.velocita", "Velocità", "numero", "dati_principali", None, "m/s", 0.1, 10, "1", "Velocità nominale", True, 8),
            ("dati_principali.corsa", "Corsa", "numero", "dati_principali", None, "m", 0, 200, "0", "Corsa totale impianto", False, 9),
            ("dati_principali.portata_kg", "Portata", "numero", "dati_principali", None, "kg", 100, 10000, "630", "Portata nominale", False, 10),
            ("dati_principali.portata_persone", "Portata Persone", "numero", "dati_principali", None, "pers", 1, 100, "8", "Numero persone", False, 11),
            ("dati_principali.tipo_manovra", "Tipo di Manovra", "dropdown", "dati_principali", "tipo_manovra", None, None, None, "universale", "Tipologia manovra", False, 12),
            ("dati_principali.logica_processore", "Logica Processore", "dropdown", "dati_principali", "logica_processore", None, None, None, "microprocessore_cabina", "Tipo logica di controllo", False, 13),
            ("dati_principali.modulo_programmazione", "Modulo Programmazione", "booleano", "dati_principali", None, None, None, None, "false", "Se include modulo programmazione", False, 14),
            ("dati_principali.operatori_uguali", "Operatori Uguali su Tutti gli Accessi", "booleano", "dati_principali", None, None, None, None, "false", "Se operatori identici su tutti i lati", False, 15),
            ("dati_principali.doppio_pulsante_piano_0", "Doppio Pulsante al Piano 0", "booleano", "dati_principali", None, None, None, None, "false", "Se presente doppio pulsante", False, 16),
            
            # ==========================================
            # SEZIONE: TENSIONI
            # ==========================================
            ("tensioni.forza_motrice", "Forza Motrice", "dropdown", "tensioni", "forza_motrice", None, None, None, "3x400V", "Tensione alimentazione motore", True, 1),
            ("tensioni.luce", "Tensione Luce", "dropdown", "tensioni", "tensione_luce", None, None, None, "220V", "Tensione circuito luce", False, 2),
            ("tensioni.tensione_manovra", "Tensione Manovra", "dropdown", "tensioni", "tensione_manovra", None, None, None, "48Vcc", "Tensione circuito manovra", False, 3),
            ("tensioni.tensione_freno", "Tensione Freno", "dropdown", "tensioni", "tensione_freno", None, None, None, "48Vcc", "Tensione alimentazione freno", False, 4),
            
            # ==========================================
            # SEZIONE: NORMATIVE
            # ==========================================
            ("normative.direttiva", "Direttiva", "dropdown", "normative", "direttiva", None, None, None, "2014/33/UE", "Direttiva di riferimento", True, 1),
            ("normative.en_81_20", "Normativa EN 81-20", "booleano", "normative", None, None, None, None, "false", "Norma EN 81-20 applicata", False, 2),
            ("normative.en_81_20_anno", "Anno EN 81-20", "dropdown", "normative", "en_81_20_anno", None, None, None, None, "Versione anno (2020/2022)", False, 3),
            ("normative.en_81_21", "Normativa EN 81-21", "booleano", "normative", None, None, None, None, "false", "Norma EN 81-21 (esistenti)", False, 4),
            ("normative.en_81_28", "Normativa EN 81-28", "booleano", "normative", None, None, None, None, "false", "Norma EN 81-28 (allarmi)", False, 5),
            ("normative.en_81_50", "Normativa EN 81-50", "booleano", "normative", None, None, None, None, "false", "Norma EN 81-50 (componenti)", False, 6),
            ("normative.en_81_70", "Normativa EN 81-70", "booleano", "normative", None, None, None, None, "false", "Norma EN 81-70 (accessibilità)", False, 7),
            ("normative.en_81_72", "Normativa EN 81-72", "booleano", "normative", None, None, None, None, "false", "Norma EN 81-72 (antincendio)", False, 8),
            ("normative.en_81_73", "Normativa EN 81-73", "booleano", "normative", None, None, None, None, "false", "Norma EN 81-73 (emergenza)", False, 9),
            ("normative.en_81", "Normativa EN 81", "booleano", "normative", None, None, None, None, "false", "Norma EN 81 base", False, 10),
            ("normative.en_95_16", "Normativa 95/16", "booleano", "normative", None, None, None, None, "false", "Direttiva 95/16/CE", False, 11),
            ("normative.dm_236", "DM 236 (L.13)", "booleano", "normative", None, None, None, None, "false", "DM 236 accessibilità", False, 12),
            ("normative.normativa_10411", "Normativa 10411", "booleano", "normative", None, None, None, None, "false", "UNI 10411", False, 13),
            ("normative.dm_15_9_2005", "DM 15/9/2005", "booleano", "normative", None, None, None, None, "false", "Decreto ministeriale", False, 14),
            ("normative.emendamento_a3", "Emendamento A3", "booleano", "normative", None, None, None, None, "false", "Emendamento A3 applicato", False, 15),
            
            # ==========================================
            # SEZIONE: ARGANO / TRAZIONE
            # ==========================================
            ("argano.trazione", "Tipo Trazione", "dropdown", "argano", "trazione", None, None, None, "gearless_mrl", "Tipo di trazione", True, 1),
            ("argano.potenza_motore_kw", "Potenza Motore", "numero", "argano", None, "kW", 0.5, 100, "5.5", "Potenza nominale motore", False, 2),
            ("argano.corrente_nominale", "Corrente Nominale Motore", "numero", "argano", None, "A", 1, 500, "12", "Corrente nominale", False, 3),
            ("argano.tipo_vvvf", "Tipo VVVF", "testo", "argano", None, None, None, None, None, "Modello inverter VVVF", False, 4),
            ("argano.vvvf_nel_vano", "VVVF nel Vano", "booleano", "argano", None, None, None, None, "true", "Se inverter installato nel vano", False, 5),
            ("argano.freno_albero_lento", "Freno Albero Lento", "testo", "argano", None, None, None, None, None, "Tipo freno (es: 48Vcc senza booster)", False, 6),
            ("argano.microlivellazione", "Microlivellazione", "booleano", "argano", None, None, None, None, "false", "Se presente microlivellazione", False, 7),
            ("argano.marca_argano", "Marca Argano", "testo", "argano", None, None, None, None, None, "Produttore argano", False, 8),
            ("argano.modello_argano", "Modello Argano", "testo", "argano", None, None, None, None, None, "Modello specifico", False, 9),
            
            # ==========================================
            # SEZIONE: PORTE LATO A
            # ==========================================
            ("porte_lato_a.porte_cabina", "Porte Cabina", "dropdown", "porte_lato_a", "porte_cabina", None, None, None, "automatiche", "Tipo porte cabina", False, 1),
            ("porte_lato_a.porte_piano", "Porte Piano", "dropdown", "porte_lato_a", "porte_piano", None, None, None, "automatiche", "Tipo porte di piano", False, 2),
            ("porte_lato_a.elettroserrature", "Elettroserrature", "testo", "porte_lato_a", None, None, None, None, None, "Tipo elettroserrature", False, 3),
            ("porte_lato_a.tensione_elettroserrature", "Tensione Elettroserrature", "testo", "porte_lato_a", None, None, None, None, None, "Tensione alimentazione serrature", False, 4),
            ("porte_lato_a.pattino_retrattile", "Pattino Retrattile", "testo", "porte_lato_a", None, None, None, None, None, "Tipo pattino (es: 18Vcc)", False, 5),
            ("porte_lato_a.predisposizione_fotocellula", "Predisposizione Fotocellula", "booleano", "porte_lato_a", None, None, None, None, "false", "Se predisposto per fotocellula", False, 6),
            ("porte_lato_a.tensione_fotocellula", "Tensione Fotocellula", "testo", "porte_lato_a", None, None, None, None, "24Vcc", "Tensione alimentazione fotocellula", False, 7),
            ("porte_lato_a.fotocellula_in_catena", "Fotocellula in Catena Sicurezze", "booleano", "porte_lato_a", None, None, None, None, "false", "Se fotocellula in catena sicurezze", False, 8),
            
            # ==========================================
            # SEZIONE: OPERATORE PORTE LATO A
            # ==========================================
            ("operatore_a.fornitore_operatore", "Fornitore Operatore", "dropdown", "operatore_a", "fornitore_operatore", None, None, None, "prisma", "Produttore operatore", False, 1),
            ("operatore_a.modello_operatore", "Modello Operatore", "testo", "operatore_a", None, None, None, None, None, "Modello specifico operatore", False, 2),
            ("operatore_a.fine_corsa_apertura", "Fine Corsa Apertura", "booleano", "operatore_a", None, None, None, None, "false", "Se presente FC apertura", False, 3),
            ("operatore_a.fine_corsa_chiusura", "Fine Corsa Chiusura", "booleano", "operatore_a", None, None, None, None, "false", "Se presente FC chiusura", False, 4),
            ("operatore_a.alimentato_in_marcia", "Alimentato in Marcia", "booleano", "operatore_a", None, None, None, None, "false", "Se operatore alimentato in marcia", False, 5),
            ("operatore_a.mantenimento_apertura", "Mantenimento Apertura", "booleano", "operatore_a", None, None, None, None, "false", "Se mantiene porta aperta", False, 6),
            ("operatore_a.costola_mobile", "Costola Mobile", "booleano", "operatore_a", None, None, None, None, "false", "Se presente costola mobile", False, 7),
            ("operatore_a.scheda", "Scheda", "booleano", "operatore_a", None, None, None, None, "false", "Se include scheda elettronica", False, 8),
            ("operatore_a.rallentamento_operatore", "Rallentamento Operatore", "booleano", "operatore_a", None, None, None, None, "false", "Se rallentamento controllato", False, 9),
            
            # ==========================================
            # SEZIONE: PORTE LATO B (se presente)
            # ==========================================
            ("porte_lato_b.presente", "Lato B Presente", "booleano", "porte_lato_b", None, None, None, None, "false", "Se impianto ha lato B", False, 1),
            ("porte_lato_b.porte_cabina", "Porte Cabina Lato B", "dropdown", "porte_lato_b", "porte_cabina", None, None, None, "automatiche", "Tipo porte cabina lato B", False, 2),
            ("porte_lato_b.porte_piano", "Porte Piano Lato B", "dropdown", "porte_lato_b", "porte_piano", None, None, None, "automatiche", "Tipo porte piano lato B", False, 3),
            
            # ==========================================
            # SEZIONE: CABINA
            # ==========================================
            ("cabina.larghezza", "Larghezza Cabina", "numero", "cabina", None, "mm", 500, 5000, "1100", "Larghezza interna cabina", False, 1),
            ("cabina.profondita", "Profondità Cabina", "numero", "cabina", None, "mm", 500, 5000, "1400", "Profondità interna cabina", False, 2),
            ("cabina.altezza", "Altezza Cabina", "numero", "cabina", None, "mm", 1800, 3500, "2200", "Altezza interna cabina", False, 3),
            ("cabina.apertura_porte", "Apertura Porte", "numero", "cabina", None, "mm", 600, 2000, "800", "Luce netta porte", False, 4),
            
            # ==========================================
            # SEZIONE: VANO
            # ==========================================
            ("vano.larghezza", "Larghezza Vano", "numero", "vano", None, "mm", 1000, 10000, "1600", "Larghezza vano corsa", False, 1),
            ("vano.profondita", "Profondità Vano", "numero", "vano", None, "mm", 1000, 10000, "1800", "Profondità vano corsa", False, 2),
            ("vano.testata", "Testata", "numero", "vano", None, "mm", 2500, 10000, "3600", "Extracorsa superiore", False, 3),
            ("vano.fossa", "Fossa", "numero", "vano", None, "mm", 500, 5000, "1200", "Profondità fossa", False, 4),
            
            # ==========================================
            # SEZIONE: QUADRO ELETTRICO
            # ==========================================
            ("quadro.posizione", "Posizione Quadro", "testo", "quadro", None, None, None, None, None, "Ubicazione quadro manovra", False, 1),
            ("quadro.distanza_da_vano", "Distanza da Vano", "numero", "quadro", None, "m", 0, 100, "0", "Distanza quadro dal vano", False, 2),
            ("quadro.locale_macchina", "Con Locale Macchina", "booleano", "quadro", None, None, None, None, "false", "Se presente locale macchina", False, 3),
        ]
        
        print("📋 Inserimento campi configuratore...")
        for codice, etichetta, tipo, sezione, gruppo_dd, unita, vmin, vmax, default, desc, obbl, ordine in campi_configuratore:
            cursor.execute("SELECT id FROM campi_configuratore WHERE codice = ?", (codice,))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO campi_configuratore 
                    (codice, etichetta, tipo, sezione, gruppo_dropdown, unita_misura, 
                     valore_min, valore_max, valore_default, descrizione, obbligatorio, ordine, attivo)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """, (codice, etichetta, tipo, sezione, gruppo_dd, unita, vmin, vmax, default, desc, obbl, ordine))
        print(f"  ✅ Inseriti {len(campi_configuratore)} campi configuratore")
        
        # Opzioni aggiuntive per dropdown dei campi
        opzioni_aggiuntive = [
            # Anno EN 81-1
            ("en_81_1_anno", "1998", "1998", 1),
            ("en_81_1_anno", "2010", "2010", 2),
            # Anno EN 81-20
            ("en_81_20_anno", "2014", "2014", 1),
            ("en_81_20_anno", "2020", "2020", 2),
            ("en_81_20_anno", "2022", "2022", 3),
            # Anno EN 81-21
            ("en_81_21_anno", "2009", "2009", 1),
            ("en_81_21_anno", "2018", "2018", 2),
        ]
        for gruppo, valore, etichetta, ordine in opzioni_aggiuntive:
            cursor.execute("SELECT id FROM opzioni_dropdown WHERE gruppo = ? AND valore = ?", (gruppo, valore))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO opzioni_dropdown (gruppo, valore, etichetta, ordine, attivo)
                    VALUES (?, ?, ?, ?, 1)
                """, (gruppo, valore, etichetta, ordine))
        
        # Clienti Demo con valori default per condizioni commerciali
        # Formato: (codice, ragione, piva, ind, cap, citta, prov, sc_prod, sc_acq, pagamento, imballo, reso_fco, trasporto, destinazione, rif_cliente)
        clienti = [
            ("C001", "Ascensori Rossi S.r.l.", "IT01234567890", "Via Roma 1", "20100", "Milano", "MI", 
             5.0, 3.0, "30 gg d.f.", "Cartone", "Ns. Stabilimento", "Corriere", "Via Roma 1, 20100 Milano", "Uff. Acquisti"),
            ("C002", "Elevatori Bianchi S.p.A.", "IT09876543210", "Corso Italia 50", "10100", "Torino", "TO", 
             8.0, 5.0, "60 gg d.f.", "Pallet", "Franco destino", "Ns. mezzo", "Corso Italia 50, 10100 Torino", "Sig. Bianchi"),
            ("C003", "Lift Service Verdi", "IT11223344556", "Via Garibaldi 20", "00100", "Roma", "RM", 
             3.0, 2.0, "30 gg d.f.", "Cartone", "Ns. Stabilimento", "Corriere espresso", "Via Garibaldi 20, 00100 Roma", "Uff. Tecnico"),
            ("C004", "Impianti Neri & C.", "IT66778899001", "Via Dante 15", "40100", "Bologna", "BO", 
             10.0, 7.0, "90 gg d.f.", "Cassa legno", "Franco destino", "Trasportatore dedicato", "Via Dante 15, 40100 Bologna", "Geom. Neri"),
            ("C005", "Elettroascensori Sud", "IT55443322110", "Via Napoli 100", "80100", "Napoli", "NA", 
             4.0, 2.0, "30 gg d.f.", "Cartone rinforzato", "Ns. Stabilimento", "Corriere", "Via Napoli 100, 80100 Napoli", "Ing. Esposito"),
        ]
        
        for codice, ragione, piva, ind, cap, citta, prov, sc_prod, sc_acq, pag, imb, reso, trasp, dest, rif in clienti:
            cursor.execute("SELECT id FROM clienti WHERE codice = ?", (codice,))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO clienti (codice, ragione_sociale, partita_iva, indirizzo, cap, citta, provincia, 
                                         sconto_produzione, sconto_acquisto, pagamento_default, 
                                         imballo_default, reso_fco_default, trasporto_default, 
                                         destinazione_default, riferimento_cliente_default)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (codice, ragione, piva, ind, cap, citta, prov, sc_prod, sc_acq, pag, imb, reso, trasp, dest, rif))
                print(f"  ✅ Cliente: {ragione}")
        
        # Articoli Demo (con supporto fino a 4 parametri variabili)
        # Formato: (codice, desc, tipo, cat, fisso, var1, um1, desc1, var2, um2, desc2, ricarico, um, lead_time, manodopera)
        articoli = [
            # Cavi - solo 1 parametro (lunghezza) - consegna rapida
            ("CAV-3G15", "Cavo FG7OR 3G1.5", "ACQUISTO", "CAVI", 0, 0.85, "metro", "Lunghezza", 0, None, None, 15.0, "MT", 3, 0),
            ("CAV-3G25", "Cavo FG7OR 3G2.5", "ACQUISTO", "CAVI", 0, 1.20, "metro", "Lunghezza", 0, None, None, 15.0, "MT", 3, 0),
            ("CAV-5G15", "Cavo FG7OR 5G1.5", "ACQUISTO", "CAVI", 0, 1.45, "metro", "Lunghezza", 0, None, None, 15.0, "MT", 3, 0),
            ("CAV-SCHERM", "Cavo schermato 4x0.75", "ACQUISTO", "CAVI", 0, 2.30, "metro", "Lunghezza", 0, None, None, 18.0, "MT", 5, 0),
            # Quadri - 2 parametri (fermate + cablaggio) - produzione interna
            ("QEL-STD-01", "Quadro elettrico standard", "PRODUZIONE", "QUADRI", 500.00, 45.00, "fermata", "N. Fermate", 3.50, "metro", "Cablaggio", 35.0, "PZ", 15, 5),
            ("QEL-GRL-01", "Quadro elettrico gearless", "PRODUZIONE", "QUADRI", 750.00, 55.00, "fermata", "N. Fermate", 4.00, "metro", "Cablaggio", 35.0, "PZ", 18, 7),
            # Articoli a costo fisso
            ("INV-7K5", "Inverter 7.5 kW", "ACQUISTO", "MOTORI", 650.00, 0, None, None, 0, None, None, 20.0, "PZ", 12, 1),
            ("INV-11K", "Inverter 11 kW", "ACQUISTO", "MOTORI", 890.00, 0, None, None, 0, None, None, 20.0, "PZ", 14, 1),
            ("ENC-ABS", "Encoder assoluto", "ACQUISTO", "COMPONENTI", 320.00, 0, None, None, 0, None, None, 22.0, "PZ", 8, 1),
            ("REL-SIC-01", "Relè di sicurezza doppio canale", "ACQUISTO", "SICUREZZA", 85.00, 0, None, None, 0, None, None, 25.0, "PZ", 5, 0),
            ("PLS-EMER", "Pulsante emergenza a fungo", "ACQUISTO", "SICUREZZA", 12.50, 0, None, None, 0, None, None, 30.0, "PZ", 2, 0),
            ("MORS-4MM", "Morsettiera 4mm² (10 poli)", "ACQUISTO", "COMPONENTI", 8.50, 0, None, None, 0, None, None, 25.0, "PZ", 2, 0),
            ("PCB-CTRL", "Scheda controllo principale", "PRODUZIONE", "COMPONENTI", 180.00, 0, None, None, 0, None, None, 40.0, "PZ", 10, 3),
            ("PCB-IO", "Scheda I/O espansione", "PRODUZIONE", "COMPONENTI", 95.00, 0, None, None, 0, None, None, 40.0, "PZ", 8, 2),
            ("DISP-LCD", "Display LCD cabina", "ACQUISTO", "ACCESSORI", 145.00, 0, None, None, 0, None, None, 25.0, "PZ", 10, 0),
            
            # ============================================
            # ARTICOLI PER REGOLE AUTOMATICHE
            # ============================================
            
            # --- REGOLA EN 81-20:2020 (Normative) ---
            ("SEC-UCM-001", "Dispositivo UCM (EN 81-20:2020)", "ACQUISTO", "SICUREZZA", 450.00, 0, None, None, 0, None, None, 20.0, "PZ", 15, 2),
            ("SEC-APSG-001", "APSG - Protezione porte automatiche", "ACQUISTO", "SICUREZZA", 320.00, 0, None, None, 0, None, None, 20.0, "PZ", 10, 1),
            ("SEC-BUFFER-001", "Ammortizzatori certificati EN 81-20", "ACQUISTO", "SICUREZZA", 180.00, 0, None, None, 0, None, None, 20.0, "PZ", 8, 1),
            
            # --- REGOLA GEARLESS MRL (Argano) ---
            ("QEL-GRL-001", "Quadro elettrico Gearless MRL - Configurazione standard", "PRODUZIONE", "QUADRI", 2850.00, 0, None, None, 0, None, None, 25.0, "PZ", 20, 5),
            ("INV-GRL-001", "Inverter per motore Gearless - Alta efficienza", "ACQUISTO", "MOTORI", 1650.00, 0, None, None, 0, None, None, 18.0, "PZ", 12, 2),
            ("ENC-MRL-001", "Encoder assoluto per trazione MRL", "ACQUISTO", "TRAZIONE", 420.00, 0, None, None, 0, None, None, 22.0, "PZ", 8, 1),
            ("PCB-GRL-001", "Scheda controllo principale Gearless", "PRODUZIONE", "COMPONENTI", 580.00, 0, None, None, 0, None, None, 35.0, "PZ", 10, 3),
            
            # --- REGOLA GEARED (Argano) ---
            ("QEL-GRD-001", "Quadro elettrico Geared - Configurazione standard", "PRODUZIONE", "QUADRI", 2200.00, 0, None, None, 0, None, None, 25.0, "PZ", 18, 4),
            ("INV-GRD-001", "Inverter per motore Geared", "ACQUISTO", "MOTORI", 1200.00, 0, None, None, 0, None, None, 18.0, "PZ", 10, 2),
            ("ENC-GRD-001", "Encoder incrementale per Geared", "ACQUISTO", "TRAZIONE", 280.00, 0, None, None, 0, None, None, 22.0, "PZ", 6, 1),
            ("RID-GRD-001", "Riduttore meccanico", "ACQUISTO", "TRAZIONE", 950.00, 0, None, None, 0, None, None, 15.0, "PZ", 25, 3),
        ]
        
        for codice, desc, tipo, cat_cod, cf, cv1, um1, dv1, cv2, um2, dv2, ricarico, um, lt, mo in articoli:
            cursor.execute("SELECT id FROM articoli WHERE codice = ?", (codice,))
            if not cursor.fetchone():
                cursor.execute("SELECT id FROM categorie_articoli WHERE codice = ?", (cat_cod,))
                cat_row = cursor.fetchone()
                cat_id = cat_row[0] if cat_row else None
                
                cursor.execute("""
                    INSERT INTO articoli (codice, descrizione, tipo_articolo, categoria_id, 
                                          costo_fisso, costo_variabile_1, unita_misura_var_1, descrizione_var_1,
                                          costo_variabile_2, unita_misura_var_2, descrizione_var_2,
                                          ricarico_percentuale, unita_misura, lead_time_giorni, manodopera_giorni)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (codice, desc, tipo, cat_id, cf, cv1, um1, dv1, cv2, um2, dv2, ricarico, um, lt, mo))
                print(f"  ✅ Articolo: {codice}")
        
        # Preventivi Demo
        print("\n📋 Creazione preventivi demo...")
        preventivi_demo = [
            ("2025/0001", "COMPLETO", 1, "Ascensore Palazzo Rossi", "draft"),
            ("2025/0002", "RICAMBIO", 2, "Ricambi Lift Service", "draft"),
            ("2025/0003", "COMPLETO", 3, "Impianto Hotel Verdi", "confirmed"),
        ]
        
        for numero, tipo, cliente_id, nome, status in preventivi_demo:
            cursor.execute("SELECT id FROM preventivi WHERE numero_preventivo = ?", (numero,))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO preventivi (numero_preventivo, tipo_preventivo, cliente_id, customer_name, status)
                    VALUES (?, ?, ?, ?, ?)
                """, (numero, tipo, cliente_id, nome, status))
                print(f"  ✅ Preventivo: {numero} ({tipo})")
        
        conn.commit()
        print("\n✅ Migrazione completata!")
        
        # Statistiche
        print("\n📊 Riepilogo:")
        for table in ["parametri_sistema", "categorie_articoli", "clienti", "articoli", "preventivi"]:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            print(f"   • {table}: {cursor.fetchone()[0]} record")
        
        return True
        
    except Exception as e:
        print(f"\n❌ Errore: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
