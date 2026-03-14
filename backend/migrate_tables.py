import sqlite3

conn = sqlite3.connect('configuratore.db')

conn.executescript("""
CREATE TABLE IF NOT EXISTS fornitori (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ragione_sociale TEXT,
    denominazione TEXT,
    codice TEXT,
    partita_iva TEXT,
    codice_fiscale TEXT,
    pec TEXT,
    codice_sdi TEXT,
    email TEXT,
    email_cc TEXT,
    telefono TEXT,
    indirizzo TEXT,
    comune TEXT,
    provincia TEXT,
    cap TEXT,
    nazione TEXT DEFAULT 'IT',
    paese TEXT DEFAULT 'IT',
    iban TEXT,
    condizioni_pagamento TEXT,
    note TEXT,
    attivo INTEGER DEFAULT 1,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ordini_acquisto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_oda TEXT,
    anno INTEGER,
    stato TEXT DEFAULT 'bozza',
    fornitore_id INTEGER,
    fornitore_denominazione TEXT,
    fornitore_partita_iva TEXT,
    fornitore_pec TEXT,
    fornitore_indirizzo TEXT,
    fornitore_comune TEXT,
    fornitore_provincia TEXT,
    preventivo_id INTEGER,
    ordine_id INTEGER,
    codice_commessa TEXT,
    data_emissione TEXT,
    data_consegna_richiesta TEXT,
    condizioni_pagamento TEXT,
    luogo_consegna TEXT,
    note TEXT,
    note_interne TEXT,
    totale_imponibile REAL DEFAULT 0,
    totale_iva REAL DEFAULT 0,
    totale_fattura REAL DEFAULT 0,
    creato_da TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ordini_acquisto_righe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    oda_id INTEGER,
    numero_riga INTEGER,
    articolo_id INTEGER,
    codice_articolo TEXT,
    descrizione TEXT,
    unita_misura TEXT DEFAULT 'pz',
    quantita_ordinata REAL DEFAULT 1,
    quantita_ricevuta REAL DEFAULT 0,
    prezzo_unitario REAL DEFAULT 0,
    sconto_percentuale REAL DEFAULT 0,
    aliquota_iva REAL DEFAULT 22,
    prezzo_totale REAL DEFAULT 0,
    note_riga TEXT
);

CREATE TABLE IF NOT EXISTS ordini_acquisto_storico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    oda_id INTEGER,
    stato_da TEXT,
    stato_a TEXT,
    nota TEXT,
    utente TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ordini_acquisto_ricevimenti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    oda_id INTEGER,
    riga_id INTEGER,
    quantita REAL,
    data_ricezione TEXT,
    numero_ddt TEXT,
    note TEXT,
    registrato_da TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);
""")

conn.commit()
conn.close()
print('Migrazione completata OK')
