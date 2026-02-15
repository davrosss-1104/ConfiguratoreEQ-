"""
migrate_prototipo.py
====================
Migrazione per il prototipo del processo completo:
  Input → Rule Engine → BOM 1° livello → Prezzo/Lead Time → Ordine → Esplosione BOM → Produzione

Eseguire UNA VOLTA: python migrate_prototipo.py

Aggiunge:
  - Tabella articoli_bom (anagrafica articoli per esplosione)
  - Tabella bom_struttura (relazioni padre-figlio)
  - Tabella ordini (preventivi confermati)
  - Tabella esplosi (output esplosione BOM ricorsiva)
  - Dati demo: articoli realistici + struttura BOM multilivello
  - Aggiorna preventivi: aggiunge campi lead_time, data_conferma

NON tocca le tabelle esistenti (preventivi, materiali, regole, ecc.)
"""

import sqlite3
import os
import shutil
from datetime import datetime

DB_PATH = "./configuratore.db"
BACKUP_DIR = "./backups"


def backup_db():
    """Crea backup del database prima della migrazione"""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = os.path.join(BACKUP_DIR, f"configuratore_backup_{ts}.db")
    shutil.copy2(DB_PATH, backup_path)
    print(f"✅ Backup creato: {backup_path}")
    return backup_path


def table_exists(cursor, table_name):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
    return cursor.fetchone() is not None


def column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [row[1] for row in cursor.fetchall()]
    return column_name in columns


def run_migration():
    print("=" * 60)
    print("  MIGRAZIONE PROTOTIPO - Processo Completo")
    print("=" * 60)

    if not os.path.exists(DB_PATH):
        print(f"❌ Database non trovato: {DB_PATH}")
        print("   Assicurati di essere nella directory backend/")
        return False

    backup_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # ============================================================
        # 1. AGGIORNA TABELLA PREVENTIVI (aggiungi campi mancanti)
        # ============================================================
        print("\n📋 Step 1: Aggiornamento tabella preventivi...")

        new_cols = [
            ("lead_time_giorni", "INTEGER DEFAULT 0"),
            ("data_conferma", "DATETIME"),
            ("data_scadenza", "DATETIME"),
            ("ordine_id", "INTEGER"),  # FK verso ordini quando confermato
        ]
        for col_name, col_def in new_cols:
            if not column_exists(cursor, "preventivi", col_name):
                cursor.execute(f"ALTER TABLE preventivi ADD COLUMN {col_name} {col_def}")
                print(f"  ✅ Aggiunta colonna preventivi.{col_name}")
            else:
                print(f"  ⏭️  Colonna preventivi.{col_name} già esiste")

        # ============================================================
        # 2. TABELLA ORDINI
        # ============================================================
        print("\n📋 Step 2: Creazione tabella ordini...")

        if not table_exists(cursor, "ordini"):
            cursor.execute("""
                CREATE TABLE ordini (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    numero_ordine TEXT UNIQUE NOT NULL,
                    preventivo_id INTEGER NOT NULL,
                    cliente_id INTEGER NOT NULL,
                    
                    -- Stato ordine
                    stato TEXT DEFAULT 'confermato',  -- confermato, in_produzione, completato, spedito
                    
                    -- Dati dal preventivo
                    tipo_impianto TEXT,
                    descrizione TEXT,
                    configurazione_json TEXT,  -- snapshot configurazione al momento della conferma
                    
                    -- Totali (copiati dal preventivo)
                    totale_materiali REAL DEFAULT 0.0,
                    totale_netto REAL DEFAULT 0.0,
                    
                    -- Lead time
                    lead_time_giorni INTEGER DEFAULT 0,
                    data_consegna_prevista DATETIME,
                    data_consegna_effettiva DATETIME,
                    
                    -- Produzione
                    bom_esplosa INTEGER DEFAULT 0,  -- 0=no, 1=sì
                    data_esplosione_bom DATETIME,
                    
                    -- Audit
                    note TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_by TEXT,
                    
                    FOREIGN KEY (preventivo_id) REFERENCES preventivi(id),
                    FOREIGN KEY (cliente_id) REFERENCES clienti(id)
                )
            """)
            print("  ✅ Tabella ordini creata")
        else:
            print("  ⏭️  Tabella ordini già esiste")

        # ============================================================
        # 3. TABELLA ARTICOLI_BOM (anagrafica per esplosione)
        # ============================================================
        print("\n📋 Step 3: Creazione tabella articoli_bom...")

        if not table_exists(cursor, "articoli_bom"):
            cursor.execute("""
                CREATE TABLE articoli_bom (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    codice TEXT UNIQUE NOT NULL,
                    descrizione TEXT NOT NULL,
                    
                    -- Tipo: MASTER (complessivo), SEMILAVORATO, ACQUISTO (leaf)
                    tipo TEXT NOT NULL DEFAULT 'ACQUISTO',
                    categoria TEXT,
                    
                    -- Costi
                    costo_fisso REAL DEFAULT 0.0,
                    costo_variabile REAL DEFAULT 0.0,
                    unita_misura_variabile TEXT,  -- m, kg, ecc.
                    prezzo_listino REAL DEFAULT 0.0,
                    
                    -- Parametri (definiscono QUALI parametri servono a questo articolo)
                    parametro1_nome TEXT,
                    parametro2_nome TEXT,
                    parametro3_nome TEXT,
                    parametro4_nome TEXT,
                    parametro5_nome TEXT,
                    
                    -- Lead time (giorni)
                    lead_time_produzione INTEGER DEFAULT 0,
                    lead_time_acquisto INTEGER DEFAULT 0,
                    
                    -- Fornitore (per ACQUISTO)
                    fornitore TEXT,
                    codice_fornitore TEXT,
                    
                    -- Unità
                    unita_misura TEXT DEFAULT 'PZ',
                    
                    -- Stato
                    attivo INTEGER DEFAULT 1,
                    
                    -- Audit
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    note TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_articoli_bom_codice ON articoli_bom(codice)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_articoli_bom_tipo ON articoli_bom(tipo)")
            print("  ✅ Tabella articoli_bom creata")
        else:
            print("  ⏭️  Tabella articoli_bom già esiste")

        # ============================================================
        # 4. TABELLA BOM_STRUTTURA (relazioni padre-figlio)
        # ============================================================
        print("\n📋 Step 4: Creazione tabella bom_struttura...")

        if not table_exists(cursor, "bom_struttura"):
            cursor.execute("""
                CREATE TABLE bom_struttura (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    
                    -- Padre (codice complessivo)
                    padre_codice TEXT NOT NULL,
                    
                    -- Figlio (codice componente)
                    figlio_codice TEXT NOT NULL,
                    
                    -- Quantità base (può essere parametrica)
                    quantita REAL NOT NULL DEFAULT 1.0,
                    
                    -- Formula quantità (opzionale, es: "[NUM_FERMATE] * 2")
                    formula_quantita TEXT,
                    
                    -- Condizione esistenza (es: "[TIPO_PORTE] == 'Automatiche'")
                    condizione_esistenza TEXT,
                    
                    -- Posizione nella distinta
                    posizione TEXT,
                    livello INTEGER DEFAULT 1,
                    
                    -- Flags
                    obbligatorio INTEGER DEFAULT 1,
                    
                    note TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    
                    FOREIGN KEY (padre_codice) REFERENCES articoli_bom(codice),
                    FOREIGN KEY (figlio_codice) REFERENCES articoli_bom(codice)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_bom_padre ON bom_struttura(padre_codice)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_bom_figlio ON bom_struttura(figlio_codice)")
            print("  ✅ Tabella bom_struttura creata")
        else:
            print("  ⏭️  Tabella bom_struttura già esiste")

        # ============================================================
        # 5. TABELLA ESPLOSI (output esplosione BOM)
        # ============================================================
        print("\n📋 Step 5: Creazione tabella esplosi...")

        if not table_exists(cursor, "esplosi"):
            cursor.execute("""
                CREATE TABLE esplosi (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    
                    -- Riferimento ordine
                    ordine_id INTEGER NOT NULL,
                    
                    -- Articolo esploso
                    codice TEXT NOT NULL,
                    descrizione TEXT,
                    tipo TEXT,  -- ACQUISTO, PRODUZIONE
                    categoria TEXT,
                    
                    -- Quantità calcolata
                    quantita REAL NOT NULL,
                    unita_misura TEXT DEFAULT 'PZ',
                    
                    -- Parametri valorizzati
                    parametro1_nome TEXT,
                    parametro1_valore TEXT,
                    parametro2_nome TEXT,
                    parametro2_valore TEXT,
                    parametro3_nome TEXT,
                    parametro3_valore TEXT,
                    parametro4_nome TEXT,
                    parametro4_valore TEXT,
                    parametro5_nome TEXT,
                    parametro5_valore TEXT,
                    
                    -- Costo calcolato
                    costo_unitario REAL DEFAULT 0.0,
                    costo_totale REAL DEFAULT 0.0,
                    
                    -- Tracciabilità
                    padre_codice TEXT,      -- da quale master deriva
                    livello_esplosione INTEGER DEFAULT 0,
                    percorso TEXT,          -- es: "QUADRO_GL > PCB_CTRL > RESISTENZA_10K"
                    
                    -- Lead time
                    lead_time_giorni INTEGER DEFAULT 0,
                    
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    
                    FOREIGN KEY (ordine_id) REFERENCES ordini(id)
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_esplosi_ordine ON esplosi(ordine_id)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_esplosi_tipo ON esplosi(tipo)")
            print("  ✅ Tabella esplosi creata")
        else:
            print("  ⏭️  Tabella esplosi già esiste")

        # ============================================================
        # 6. DATI DEMO - ARTICOLI BOM REALISTICI
        # ============================================================
        print("\n📋 Step 6: Inserimento dati demo articoli...")

        cursor.execute("SELECT COUNT(*) FROM articoli_bom")
        if cursor.fetchone()[0] == 0:
            articoli = [
                # ---- MASTER (complessivi di primo livello - generati dal rule engine) ----
                ("QUADRO_QM_GL_001", "Quadro manovra Gearless completo", "MASTER", "Quadri Elettrici",
                 1200.00, 0, None, 2850.00, "NUM_FERMATE", "TENSIONE", None, None, None, 25, 0, None, None, "PZ"),

                ("QUADRO_QM_GE_001", "Quadro manovra Geared completo", "MASTER", "Quadri Elettrici",
                 1050.00, 0, None, 2400.00, "NUM_FERMATE", "TENSIONE", None, None, None, 20, 0, None, None, "PZ"),

                ("INVERTER_GL_400V", "Inverter Gearless 400V", "MASTER", "Componenti Elettrici",
                 850.00, 0, None, 1650.00, "POTENZA_KW", None, None, None, None, 15, 0, None, None, "PZ"),

                ("KIT_PRECAB_FUNE", "Kit precablaggio ascensore fune", "MASTER", "Precablaggio",
                 400.00, 15.0, "m", 950.00, "CORSA", "NUM_FERMATE", None, None, None, 10, 0, None, None, "KIT"),

                ("BOTT_CABINA_STD", "Bottoniera cabina standard", "MASTER", "Bottoniere",
                 180.00, 12.0, "fermata", 420.00, "NUM_FERMATE", "TIPO_DISPLAY", None, None, None, 8, 0, None, None, "PZ"),

                ("BOTT_PIANO_STD", "Bottoniera di piano standard", "MASTER", "Bottoniere",
                 45.00, 0, None, 95.00, "TIPO_DISPLAY", None, None, None, None, 5, 0, None, None, "PZ"),

                # ---- SEMILAVORATI (livello intermedio) ----
                ("PCB_CTRL_GL", "Scheda controllo principale Gearless", "SEMILAVORATO", "Elettronica",
                 280.00, 0, None, 580.00, None, None, None, None, None, 12, 0, None, None, "PZ"),

                ("ALIM_24V_10A", "Alimentatore 24V 10A switching", "SEMILAVORATO", "Alimentazione",
                 35.00, 0, None, 75.00, None, None, None, None, None, 3, 0, None, None, "PZ"),

                ("MODULO_IO_16CH", "Modulo I/O 16 canali", "SEMILAVORATO", "Elettronica",
                 55.00, 0, None, 120.00, None, None, None, None, None, 5, 0, None, None, "PZ"),

                ("MORSETTIERA_DIN_32", "Morsettiera DIN 32 poli", "SEMILAVORATO", "Cablaggio",
                 18.00, 0, None, 38.00, None, None, None, None, None, 2, 0, None, None, "PZ"),

                ("CARPENTERIA_QM_800", "Carpenteria quadro 800x600x250", "SEMILAVORATO", "Carpenteria",
                 120.00, 0, None, 250.00, "LARGH", "ALT", "PROF", None, None, 8, 0, None, None, "PZ"),

                ("DISPLAY_LCD_7", "Display LCD 7 pollici con controller", "SEMILAVORATO", "Display",
                 65.00, 0, None, 140.00, None, None, None, None, None, 10, 0, None, None, "PZ"),

                # ---- ACQUISTO (leaf - componenti atomici) ----
                ("CONT_TRIP_25A", "Contattore tripolare 25A", "ACQUISTO", "Componenti Elettrici",
                 12.50, 0, None, 22.00, None, None, None, None, None, 0, 5, "Schneider", "LC1D25", "PZ"),

                ("RELE_24V_2SC", "Relè 24V 2 scambi", "ACQUISTO", "Componenti Elettrici",
                 4.80, 0, None, 9.50, None, None, None, None, None, 0, 3, "Finder", "40.52", "PZ"),

                ("FUSIBILE_10A", "Fusibile 10x38 10A gG", "ACQUISTO", "Protezioni",
                 1.20, 0, None, 2.50, None, None, None, None, None, 0, 2, "Bussmann", "FUS10A", "PZ"),

                ("PORTAFUSIBILE_10x38", "Portafusibile 10x38 DIN", "ACQUISTO", "Protezioni",
                 3.50, 0, None, 7.00, None, None, None, None, None, 0, 3, "Bussmann", "PF10x38", "PZ"),

                ("INTERR_MT_16A", "Interruttore magnetotermico 16A", "ACQUISTO", "Protezioni",
                 8.00, 0, None, 15.00, None, None, None, None, None, 0, 4, "ABB", "S201-C16", "PZ"),

                ("CAVO_1.5_GRIGIO", "Cavo 1x1.5mm² grigio", "ACQUISTO", "Cavi",
                 0.15, 0, None, 0.30, "LUNG", None, None, None, None, 0, 2, "Baldassari", "H07V-K1.5GR", "M"),

                ("CAVO_2.5_BLU", "Cavo 1x2.5mm² blu", "ACQUISTO", "Cavi",
                 0.22, 0, None, 0.45, "LUNG", None, None, None, None, 0, 2, "Baldassari", "H07V-K2.5BL", "M"),

                ("CAVO_MULTI_12G1.5", "Cavo multipolare 12x1.5mm²", "ACQUISTO", "Cavi",
                 2.80, 0, None, 5.50, "LUNG", None, None, None, None, 0, 7, "Baldassari", "YMvK12G1.5", "M"),

                ("GUIDA_DIN_35", "Guida DIN 35mm acciaio zincato", "ACQUISTO", "Carpenteria",
                 2.50, 0, None, 5.00, "LUNG", None, None, None, None, 0, 3, "Weidmuller", "TS35", "M"),

                ("CANALINA_40x60", "Canalina forata 40x60", "ACQUISTO", "Carpenteria",
                 3.80, 0, None, 7.50, "LUNG", None, None, None, None, 0, 4, "Iboco", "CF4060", "M"),

                ("VITE_M4x12", "Vite M4x12 zincata", "ACQUISTO", "Viteria",
                 0.03, 0, None, 0.06, None, None, None, None, None, 0, 1, "Würth", "VM4x12", "PZ"),

                ("DADO_M4", "Dado M4 zincato", "ACQUISTO", "Viteria",
                 0.02, 0, None, 0.04, None, None, None, None, None, 0, 1, "Würth", "DM4", "PZ"),

                ("RONDELLA_M4", "Rondella piana M4 zincata", "ACQUISTO", "Viteria",
                 0.01, 0, None, 0.02, None, None, None, None, None, 0, 1, "Würth", "RM4", "PZ"),

                ("LED_VERDE_24V", "LED spia verde 24V pannello", "ACQUISTO", "Segnalazione",
                 2.50, 0, None, 5.00, None, None, None, None, None, 0, 3, "Lovato", "8LM2TIL103", "PZ"),

                ("LED_ROSSO_24V", "LED spia rosso 24V pannello", "ACQUISTO", "Segnalazione",
                 2.50, 0, None, 5.00, None, None, None, None, None, 0, 3, "Lovato", "8LM2TIL104", "PZ"),

                ("PULSANTE_MOM_22", "Pulsante momentaneo 22mm", "ACQUISTO", "Pulsanteria",
                 3.20, 0, None, 6.50, None, None, None, None, None, 0, 3, "Lovato", "8LM2TBL106", "PZ"),

                ("ETICHETTA_NUM", "Etichetta numerata per morsetti", "ACQUISTO", "Accessori",
                 0.05, 0, None, 0.10, None, None, None, None, None, 0, 1, "Weidmuller", "DEK5", "PZ"),

                ("PRESSACAVO_PG21", "Pressacavo PG21 IP68", "ACQUISTO", "Accessori",
                 1.80, 0, None, 3.50, None, None, None, None, None, 0, 2, "Lapp", "SKINTOP-PG21", "PZ"),

                ("RESISTENZA_10K", "Resistenza 10kΩ 0.25W", "ACQUISTO", "Elettronica",
                 0.02, 0, None, 0.05, None, None, None, None, None, 0, 1, "Yageo", "R10K", "PZ"),

                ("CONDENSATORE_100nF", "Condensatore ceramico 100nF", "ACQUISTO", "Elettronica",
                 0.05, 0, None, 0.10, None, None, None, None, None, 0, 1, "Murata", "C100nF", "PZ"),

                ("CONNETTORE_TERM_6P", "Connettore a terminale 6 poli", "ACQUISTO", "Connettori",
                 1.20, 0, None, 2.50, None, None, None, None, None, 0, 2, "Phoenix", "MSTB2.5/6", "PZ"),
            ]

            for art in articoli:
                cursor.execute("""
                    INSERT INTO articoli_bom 
                    (codice, descrizione, tipo, categoria,
                     costo_fisso, costo_variabile, unita_misura_variabile, prezzo_listino,
                     parametro1_nome, parametro2_nome, parametro3_nome, parametro4_nome, parametro5_nome,
                     lead_time_produzione, lead_time_acquisto, fornitore, codice_fornitore, unita_misura)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, art)
            print(f"  ✅ Inseriti {len(articoli)} articoli")
        else:
            print("  ⏭️  Articoli già presenti")

        # ============================================================
        # 7. DATI DEMO - STRUTTURA BOM (relazioni padre-figlio)
        # ============================================================
        print("\n📋 Step 7: Inserimento struttura BOM...")

        cursor.execute("SELECT COUNT(*) FROM bom_struttura")
        if cursor.fetchone()[0] == 0:
            bom = [
                # ---- QUADRO_QM_GL_001 (Quadro Gearless) → figli ----
                ("QUADRO_QM_GL_001", "CARPENTERIA_QM_800", 1, None, None, "010", 1),
                ("QUADRO_QM_GL_001", "PCB_CTRL_GL", 1, None, None, "020", 1),
                ("QUADRO_QM_GL_001", "ALIM_24V_10A", 1, None, None, "030", 1),
                ("QUADRO_QM_GL_001", "MODULO_IO_16CH", 1, "[NUM_FERMATE] / 8", None, "040", 1),  # 1 ogni 8 fermate
                ("QUADRO_QM_GL_001", "MORSETTIERA_DIN_32", 2, None, None, "050", 1),
                ("QUADRO_QM_GL_001", "CONT_TRIP_25A", 3, None, None, "060", 1),
                ("QUADRO_QM_GL_001", "RELE_24V_2SC", 8, None, None, "070", 1),
                ("QUADRO_QM_GL_001", "FUSIBILE_10A", 6, None, None, "080", 1),
                ("QUADRO_QM_GL_001", "PORTAFUSIBILE_10x38", 6, None, None, "085", 1),
                ("QUADRO_QM_GL_001", "INTERR_MT_16A", 4, None, None, "090", 1),
                ("QUADRO_QM_GL_001", "GUIDA_DIN_35", 3, None, None, "100", 1),  # 3 metri
                ("QUADRO_QM_GL_001", "CANALINA_40x60", 4, None, None, "110", 1),  # 4 metri
                ("QUADRO_QM_GL_001", "CAVO_1.5_GRIGIO", 25, None, None, "120", 1),  # 25 metri
                ("QUADRO_QM_GL_001", "CAVO_2.5_BLU", 10, None, None, "130", 1),  # 10 metri
                ("QUADRO_QM_GL_001", "LED_VERDE_24V", 3, None, None, "140", 1),
                ("QUADRO_QM_GL_001", "LED_ROSSO_24V", 2, None, None, "150", 1),
                ("QUADRO_QM_GL_001", "PRESSACAVO_PG21", 6, None, None, "160", 1),
                ("QUADRO_QM_GL_001", "ETICHETTA_NUM", 64, None, None, "170", 1),  # 2 per morsetto x 32
                ("QUADRO_QM_GL_001", "VITE_M4x12", 40, None, None, "180", 1),
                ("QUADRO_QM_GL_001", "DADO_M4", 40, None, None, "185", 1),
                ("QUADRO_QM_GL_001", "RONDELLA_M4", 40, None, None, "190", 1),

                # ---- PCB_CTRL_GL → figli (sotto-livello) ----
                ("PCB_CTRL_GL", "RESISTENZA_10K", 24, None, None, "010", 1),
                ("PCB_CTRL_GL", "CONDENSATORE_100nF", 16, None, None, "020", 1),
                ("PCB_CTRL_GL", "CONNETTORE_TERM_6P", 4, None, None, "030", 1),
                ("PCB_CTRL_GL", "LED_VERDE_24V", 2, None, None, "040", 1),

                # ---- ALIM_24V_10A → figli ----
                ("ALIM_24V_10A", "CONDENSATORE_100nF", 8, None, None, "010", 1),
                ("ALIM_24V_10A", "RESISTENZA_10K", 6, None, None, "020", 1),
                ("ALIM_24V_10A", "CONNETTORE_TERM_6P", 2, None, None, "030", 1),

                # ---- KIT_PRECAB_FUNE → figli ----
                ("KIT_PRECAB_FUNE", "CAVO_MULTI_12G1.5", 1, "[CORSA] + 5", None, "010", 1),  # corsa + 5m extra
                ("KIT_PRECAB_FUNE", "CAVO_1.5_GRIGIO", 1, "[CORSA] * 3", None, "020", 1),
                ("KIT_PRECAB_FUNE", "CAVO_2.5_BLU", 1, "[CORSA] * 2", None, "030", 1),
                ("KIT_PRECAB_FUNE", "MORSETTIERA_DIN_32", 1, "[NUM_FERMATE]", None, "040", 1),  # 1 per fermata
                ("KIT_PRECAB_FUNE", "ETICHETTA_NUM", 1, "[NUM_FERMATE] * 10", None, "050", 1),
                ("KIT_PRECAB_FUNE", "PRESSACAVO_PG21", 1, "[NUM_FERMATE] * 2", None, "060", 1),

                # ---- BOTT_CABINA_STD → figli ----
                ("BOTT_CABINA_STD", "PULSANTE_MOM_22", 1, "[NUM_FERMATE]", None, "010", 1),
                ("BOTT_CABINA_STD", "LED_VERDE_24V", 1, "[NUM_FERMATE]", None, "020", 1),
                ("BOTT_CABINA_STD", "DISPLAY_LCD_7", 1, None, "[TIPO_DISPLAY] == 'LCD'", "030", 1),
                ("BOTT_CABINA_STD", "CONNETTORE_TERM_6P", 2, None, None, "040", 1),

                # ---- BOTT_PIANO_STD → figli ----
                ("BOTT_PIANO_STD", "PULSANTE_MOM_22", 2, None, None, "010", 1),  # su/giù
                ("BOTT_PIANO_STD", "LED_VERDE_24V", 1, None, None, "020", 1),
                ("BOTT_PIANO_STD", "CONNETTORE_TERM_6P", 1, None, None, "030", 1),

                # ---- INVERTER_GL_400V → figli ----
                ("INVERTER_GL_400V", "CONT_TRIP_25A", 2, None, None, "010", 1),
                ("INVERTER_GL_400V", "FUSIBILE_10A", 3, None, None, "020", 1),
                ("INVERTER_GL_400V", "PORTAFUSIBILE_10x38", 3, None, None, "025", 1),
                ("INVERTER_GL_400V", "CAVO_2.5_BLU", 5, None, None, "030", 1),
            ]

            for row in bom:
                cursor.execute("""
                    INSERT INTO bom_struttura 
                    (padre_codice, figlio_codice, quantita, formula_quantita, condizione_esistenza, posizione, obbligatorio)
                    VALUES (?,?,?,?,?,?,?)
                """, row)
            print(f"  ✅ Inserite {len(bom)} relazioni BOM")
        else:
            print("  ⏭️  Struttura BOM già presente")

        # ============================================================
        # 8. VERIFICA REGOLE (file JSON)
        # ============================================================
        print("\n📋 Step 8: Verifica regole...")

        rules_dir = "./rules"
        if os.path.exists(rules_dir):
            n_regole = len([f for f in os.listdir(rules_dir) if f.endswith(".json")])
            print(f"  ℹ️  {n_regole} regole JSON trovate in {rules_dir}/")
        else:
            print("  ⚠️  Directory rules/ non trovata. Esegui genera_regole_reali.py")

        conn.commit()

        # ============================================================
        # RIEPILOGO
        # ============================================================
        print("\n" + "=" * 60)
        print("  ✅ MIGRAZIONE COMPLETATA")
        print("=" * 60)

        # Conta
        for tbl in ["articoli_bom", "bom_struttura", "ordini", "esplosi"]:
            if table_exists(cursor, tbl):
                cursor.execute(f"SELECT COUNT(*) FROM {tbl}")
                n = cursor.fetchone()[0]
                print(f"  📊 {tbl}: {n} record")

        print("\n  📌 Prossimi passi:")
        print("     1. Riavvia il backend: python main.py")
        print("     2. Crea un preventivo e compila le sezioni")
        print("     3. Le regole genereranno la BOM di 1° livello")
        print("     4. Conferma il preventivo → diventa ordine")
        print("     5. Lancia esplosione BOM sull'ordine")
        print("     6. Visualizza componenti esplosi")

        return True

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Errore migrazione: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        conn.close()


if __name__ == "__main__":
    run_migration()
