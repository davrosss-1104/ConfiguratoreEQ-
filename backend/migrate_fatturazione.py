"""
migrate_fatturazione.py - Migrazione DB per il modulo Fatturazione Elettronica

Crea tutte le tabelle necessarie con gestione safe (skip se esistono).
Eseguire con: python migrate_fatturazione.py
"""

import sys
import os
import sqlite3
from datetime import datetime

# Aggiungi percorso progetto
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def table_exists(cursor, table_name):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,))
    return cursor.fetchone() is not None


def column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    return any(row[1] == column_name for row in cursor.fetchall())


def migrate(db_path="configuratore.db"):
    print(f"\n{'='*60}")
    print(f"  MIGRAZIONE FATTURAZIONE ELETTRONICA")
    print(f"  Database: {db_path}")
    print(f"  Data: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    # Backup
    import shutil
    backup_path = f"{db_path}.bak_fe_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    if os.path.exists(db_path):
        shutil.copy2(db_path, backup_path)
        print(f"📦 Backup: {backup_path}")

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # ============================================================
        # 1. CONFIGURAZIONE FATTURAZIONE
        # ============================================================
        print("\n📋 Step 1: Tabella fe_configurazione...")
        if not table_exists(cursor, "fe_configurazione"):
            cursor.execute("""
                CREATE TABLE fe_configurazione (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    -- Dati cedente/prestatore
                    denominazione TEXT NOT NULL DEFAULT '',
                    partita_iva TEXT NOT NULL DEFAULT '',
                    codice_fiscale TEXT,
                    regime_fiscale TEXT DEFAULT 'RF01',
                    indirizzo TEXT,
                    numero_civico TEXT,
                    cap TEXT,
                    comune TEXT,
                    provincia TEXT,
                    nazione TEXT DEFAULT 'IT',
                    -- Contatti
                    telefono TEXT,
                    email TEXT,
                    pec TEXT,
                    -- REA
                    rea_ufficio TEXT,
                    rea_numero TEXT,
                    rea_capitale_sociale REAL,
                    rea_socio_unico TEXT,
                    rea_stato_liquidazione TEXT DEFAULT 'LN',
                    -- SDI
                    codice_destinatario_default TEXT DEFAULT '0000000',
                    id_paese_trasmittente TEXT DEFAULT 'IT',
                    id_codice_trasmittente TEXT,
                    formato_trasmissione TEXT DEFAULT 'FPR12',
                    -- Provider SDI
                    sdi_provider TEXT DEFAULT 'aruba',
                    sdi_username TEXT,
                    sdi_password_encrypted TEXT,
                    sdi_ambiente TEXT DEFAULT 'demo',
                    sdi_codice_destinatario_ricezione TEXT,
                    -- IVA defaults
                    aliquota_iva_default REAL DEFAULT 22.0,
                    esigibilita_iva_default TEXT DEFAULT 'I',
                    natura_iva_default TEXT,
                    -- Ritenuta
                    ritenuta_tipo_default TEXT,
                    ritenuta_aliquota_default REAL,
                    ritenuta_causale_default TEXT,
                    -- Cassa previdenziale
                    cassa_tipo_default TEXT,
                    cassa_aliquota_default REAL,
                    cassa_imponibile_tipo TEXT DEFAULT 'percentuale',
                    cassa_ritenuta INTEGER DEFAULT 0,
                    -- Bollo
                    bollo_virtuale_soglia REAL DEFAULT 77.47,
                    bollo_virtuale_importo REAL DEFAULT 2.0,
                    -- Pagamento
                    condizioni_pagamento_default TEXT DEFAULT 'TP02',
                    modalita_pagamento_default TEXT DEFAULT 'MP05',
                    iban TEXT,
                    bic TEXT,
                    istituto_finanziario TEXT,
                    -- Audit
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            print("  ✅ fe_configurazione creata")
        else:
            print("  ⏭️  fe_configurazione già esiste")

        # ============================================================
        # 2. NUMERAZIONE FATTURE
        # ============================================================
        print("\n📋 Step 2: Tabella fe_numerazione...")
        if not table_exists(cursor, "fe_numerazione"):
            cursor.execute("""
                CREATE TABLE fe_numerazione (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tipo_documento TEXT NOT NULL,
                    anno INTEGER NOT NULL,
                    sezionale TEXT DEFAULT '',
                    prefisso TEXT DEFAULT '',
                    ultimo_numero INTEGER DEFAULT 0,
                    formato TEXT DEFAULT '{prefisso}{numero}/{anno}',
                    padding_cifre INTEGER DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(tipo_documento, anno, sezionale)
                )
            """)
            print("  ✅ fe_numerazione creata")
        else:
            print("  ⏭️  fe_numerazione già esiste")

        # ============================================================
        # 3. FATTURE
        # ============================================================
        print("\n📋 Step 3: Tabella fe_fatture...")
        if not table_exists(cursor, "fe_fatture"):
            cursor.execute("""
                CREATE TABLE fe_fatture (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    -- Tipo
                    direzione TEXT NOT NULL DEFAULT 'attiva',
                    tipo_documento TEXT NOT NULL DEFAULT 'TD01',
                    -- Numerazione
                    numero_fattura TEXT,
                    anno INTEGER,
                    progressivo_invio TEXT,
                    -- Collegamento
                    ordine_id INTEGER,
                    preventivo_id INTEGER,
                    fattura_origine_id INTEGER REFERENCES fe_fatture(id),
                    -- Soggetti
                    cliente_id INTEGER,
                    dest_denominazione TEXT,
                    dest_partita_iva TEXT,
                    dest_codice_fiscale TEXT,
                    dest_indirizzo TEXT,
                    dest_numero_civico TEXT,
                    dest_cap TEXT,
                    dest_comune TEXT,
                    dest_provincia TEXT,
                    dest_nazione TEXT DEFAULT 'IT',
                    dest_pec TEXT,
                    dest_codice_destinatario TEXT DEFAULT '0000000',
                    -- Date
                    data_fattura DATETIME,
                    data_scadenza DATETIME,
                    -- Totali
                    imponibile_totale REAL DEFAULT 0.0,
                    iva_totale REAL DEFAULT 0.0,
                    totale_fattura REAL DEFAULT 0.0,
                    -- Ritenuta
                    ritenuta_tipo TEXT,
                    ritenuta_aliquota REAL,
                    ritenuta_importo REAL DEFAULT 0.0,
                    ritenuta_causale TEXT,
                    -- Cassa previdenziale
                    cassa_tipo TEXT,
                    cassa_aliquota REAL,
                    cassa_importo REAL DEFAULT 0.0,
                    cassa_imponibile REAL DEFAULT 0.0,
                    cassa_aliquota_iva REAL,
                    cassa_ritenuta INTEGER DEFAULT 0,
                    cassa_natura TEXT,
                    -- Bollo
                    bollo_virtuale INTEGER DEFAULT 0,
                    bollo_importo REAL DEFAULT 0.0,
                    -- Esigibilità IVA
                    esigibilita_iva TEXT DEFAULT 'I',
                    -- Pagamento
                    condizioni_pagamento TEXT,
                    modalita_pagamento TEXT,
                    iban_pagamento TEXT,
                    istituto_finanziario TEXT,
                    -- Dati ordine
                    dati_ordine_id_documento TEXT,
                    dati_ordine_data DATETIME,
                    dati_ordine_codice_commessa TEXT,
                    dati_ordine_codice_cup TEXT,
                    dati_ordine_codice_cig TEXT,
                    -- Stato SDI
                    stato_sdi TEXT DEFAULT 'bozza',
                    -- File
                    xml_filename TEXT,
                    xml_content TEXT,
                    sdi_identificativo TEXT,
                    sdi_filename TEXT,
                    sdi_data_invio DATETIME,
                    sdi_data_consegna DATETIME,
                    sdi_notifica_json TEXT,
                    -- Fatture passive
                    fornitore_denominazione TEXT,
                    fornitore_partita_iva TEXT,
                    fornitore_codice_fiscale TEXT,
                    data_ricezione DATETIME,
                    registrata INTEGER DEFAULT 0,
                    -- Note
                    causale TEXT,
                    note_interne TEXT,
                    -- Audit
                    created_by TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_fe_fatture_numero ON fe_fatture(numero_fattura, anno)")
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_fe_fatture_stato ON fe_fatture(stato_sdi)")
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_fe_fatture_dir ON fe_fatture(direzione)")
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_fe_fatture_cliente ON fe_fatture(cliente_id)")
            print("  ✅ fe_fatture creata con indici")
        else:
            print("  ⏭️  fe_fatture già esiste")

        # ============================================================
        # 4. RIGHE FATTURA
        # ============================================================
        print("\n📋 Step 4: Tabella fe_righe_fattura...")
        if not table_exists(cursor, "fe_righe_fattura"):
            cursor.execute("""
                CREATE TABLE fe_righe_fattura (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fattura_id INTEGER NOT NULL REFERENCES fe_fatture(id) ON DELETE CASCADE,
                    numero_riga INTEGER NOT NULL,
                    codice_tipo TEXT,
                    codice_valore TEXT,
                    descrizione TEXT NOT NULL DEFAULT '',
                    quantita REAL DEFAULT 1.0,
                    unita_misura TEXT,
                    prezzo_unitario REAL DEFAULT 0.0,
                    sconto_percentuale REAL DEFAULT 0.0,
                    sconto_importo REAL DEFAULT 0.0,
                    maggiorazione_percentuale REAL DEFAULT 0.0,
                    maggiorazione_importo REAL DEFAULT 0.0,
                    prezzo_totale REAL DEFAULT 0.0,
                    aliquota_iva REAL DEFAULT 22.0,
                    natura TEXT,
                    riferimento_normativo TEXT,
                    ritenuta INTEGER DEFAULT 0,
                    data_inizio_periodo DATETIME,
                    data_fine_periodo DATETIME,
                    riferimento_ordine TEXT,
                    riferimento_ddt TEXT,
                    riferimento_ddt_data DATETIME,
                    note TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_fe_righe_fatt ON fe_righe_fattura(fattura_id)")
            print("  ✅ fe_righe_fattura creata")
        else:
            print("  ⏭️  fe_righe_fattura già esiste")

        # ============================================================
        # 5. ALLEGATI
        # ============================================================
        print("\n📋 Step 5: Tabella fe_allegati...")
        if not table_exists(cursor, "fe_allegati"):
            cursor.execute("""
                CREATE TABLE fe_allegati (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fattura_id INTEGER NOT NULL REFERENCES fe_fatture(id) ON DELETE CASCADE,
                    nome_attachment TEXT NOT NULL,
                    formato_attachment TEXT,
                    descrizione TEXT,
                    contenuto_base64 TEXT
                )
            """)
            print("  ✅ fe_allegati creata")
        else:
            print("  ⏭️  fe_allegati già esiste")

        # ============================================================
        # 6. NOTIFICHE SDI
        # ============================================================
        print("\n📋 Step 6: Tabella fe_notifiche_sdi...")
        if not table_exists(cursor, "fe_notifiche_sdi"):
            cursor.execute("""
                CREATE TABLE fe_notifiche_sdi (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fattura_id INTEGER NOT NULL REFERENCES fe_fatture(id) ON DELETE CASCADE,
                    tipo_notifica TEXT,
                    filename_notifica TEXT,
                    descrizione TEXT,
                    data_ricezione DATETIME DEFAULT CURRENT_TIMESTAMP,
                    contenuto_json TEXT
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS ix_fe_notifiche_fatt ON fe_notifiche_sdi(fattura_id)")
            print("  ✅ fe_notifiche_sdi creata")
        else:
            print("  ⏭️  fe_notifiche_sdi già esiste")

        # ============================================================
        # 7. REGISTRO IVA
        # ============================================================
        print("\n📋 Step 7: Tabella fe_registro_iva...")
        if not table_exists(cursor, "fe_registro_iva"):
            cursor.execute("""
                CREATE TABLE fe_registro_iva (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fattura_id INTEGER REFERENCES fe_fatture(id),
                    tipo_registro TEXT NOT NULL,
                    anno INTEGER NOT NULL,
                    numero_protocollo INTEGER NOT NULL,
                    data_registrazione DATETIME NOT NULL,
                    data_documento DATETIME,
                    numero_documento TEXT,
                    controparte_denominazione TEXT,
                    controparte_partita_iva TEXT,
                    imponibile REAL DEFAULT 0.0,
                    imposta REAL DEFAULT 0.0,
                    aliquota_iva REAL,
                    natura TEXT,
                    ritenuta_importo REAL DEFAULT 0.0,
                    note TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(tipo_registro, anno, numero_protocollo)
                )
            """)
            print("  ✅ fe_registro_iva creata")
        else:
            print("  ⏭️  fe_registro_iva già esiste")

        # ============================================================
        # 8. COLONNE AGGIUNTIVE SU clienti (se non esistono)
        # ============================================================
        print("\n📋 Step 8: Colonne aggiuntive su clienti...")
        extra_cols = {
            "codice_destinatario": "TEXT DEFAULT '0000000'",
            "codice_sdi": "TEXT",
        }
        if table_exists(cursor, "clienti"):
            for col_name, col_def in extra_cols.items():
                if not column_exists(cursor, "clienti", col_name):
                    cursor.execute(f"ALTER TABLE clienti ADD COLUMN {col_name} {col_def}")
                    print(f"  ✅ Aggiunta clienti.{col_name}")
                else:
                    print(f"  ⏭️  clienti.{col_name} già esiste")
        else:
            print("  ⚠️  Tabella clienti non trovata")

        # ============================================================
        # 9. DATI DEMO (configurazione default)
        # ============================================================
        print("\n📋 Step 9: Configurazione default...")
        cursor.execute("SELECT COUNT(*) FROM fe_configurazione")
        if cursor.fetchone()[0] == 0:
            cursor.execute("""
                INSERT INTO fe_configurazione (
                    denominazione, partita_iva, regime_fiscale,
                    indirizzo, cap, comune, provincia, nazione,
                    sdi_provider, sdi_ambiente,
                    aliquota_iva_default, condizioni_pagamento_default,
                    modalita_pagamento_default
                ) VALUES (
                    'Azienda Demo S.r.l.', '00000000000', 'RF01',
                    'Via Esempio 1', '00100', 'Roma', 'RM', 'IT',
                    'aruba', 'demo',
                    22.0, 'TP02', 'MP05'
                )
            """)
            print("  ✅ Configurazione default inserita")
        else:
            print("  ⏭️  Configurazione già presente")

        # ============================================================
        # 10. NUMERAZIONE DEFAULT
        # ============================================================
        print("\n📋 Step 10: Numerazione default...")
        anno = datetime.now().year
        default_nums = [
            ("TD01", "FT", "Fatture"),
            ("TD02", "FA", "Acconti"),
            ("TD04", "NC", "Note di credito"),
            ("TD06", "PA", "Parcelle"),
        ]
        for td, pref, desc in default_nums:
            cursor.execute(
                "SELECT COUNT(*) FROM fe_numerazione WHERE tipo_documento=? AND anno=?",
                (td, anno)
            )
            if cursor.fetchone()[0] == 0:
                cursor.execute("""
                    INSERT INTO fe_numerazione (tipo_documento, anno, prefisso, formato, padding_cifre)
                    VALUES (?, ?, ?, '{prefisso}{numero}/{anno}', 1)
                """, (td, anno, pref))
                print(f"  ✅ Numerazione {desc} ({td}) - {pref}N/{anno}")
            else:
                print(f"  ⏭️  Numerazione {desc} già presente")

        conn.commit()

        print(f"\n{'='*60}")
        print(f"  ✅ MIGRAZIONE COMPLETATA CON SUCCESSO")
        print(f"{'='*60}")
        print(f"\n📝 Prossimi passi:")
        print(f"  1. Aggiungi al main.py:")
        print(f"     from fatturazione_api import router as fatturazione_router")
        print(f"     app.include_router(fatturazione_router)")
        print(f"  2. Configura dati azienda in /api/fatturazione/configurazione")
        print(f"  3. Configura credenziali Aruba SDI")
        print()

    except Exception as e:
        print(f"\n❌ ERRORE: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else "configuratore.db"
    migrate(db_path)
