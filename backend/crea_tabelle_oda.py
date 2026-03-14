from database import engine

conn = engine.raw_connection()
cur = conn.cursor()

cur.executescript("""
CREATE TABLE IF NOT EXISTS ordini_acquisto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_oda TEXT NOT NULL UNIQUE,
    anno INTEGER NOT NULL,
    stato TEXT NOT NULL DEFAULT 'bozza',
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
    data_consegna_effettiva TEXT,
    imponibile_totale REAL DEFAULT 0,
    iva_totale REAL DEFAULT 0,
    totale_oda REAL DEFAULT 0,
    condizioni_pagamento TEXT,
    luogo_consegna TEXT,
    note TEXT,
    note_interne TEXT,
    riferimento_sdi TEXT,
    creato_da TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ordini_acquisto_righe (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    oda_id INTEGER NOT NULL REFERENCES ordini_acquisto(id),
    numero_riga INTEGER NOT NULL,
    codice_articolo TEXT,
    descrizione TEXT,
    quantita_ordinata REAL DEFAULT 0,
    quantita_ricevuta REAL DEFAULT 0,
    unita_misura TEXT DEFAULT 'pz',
    prezzo_unitario REAL DEFAULT 0,
    aliquota_iva REAL DEFAULT 22,
    prezzo_totale REAL DEFAULT 0,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ordini_acquisto_ricevimenti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    oda_id INTEGER NOT NULL REFERENCES ordini_acquisto(id),
    riga_id INTEGER NOT NULL REFERENCES ordini_acquisto_righe(id),
    quantita_ricevuta REAL NOT NULL,
    data_ricezione TEXT,
    note TEXT,
    registrato_da TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ordini_acquisto_storico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    oda_id INTEGER NOT NULL REFERENCES ordini_acquisto(id),
    stato_da TEXT,
    stato_a TEXT,
    nota TEXT,
    utente TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS oda_numerazione (
    anno INTEGER PRIMARY KEY,
    ultimo_numero INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS oda_fatture_passive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    oda_id INTEGER NOT NULL REFERENCES ordini_acquisto(id),
    fattura_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);
""")

conn.commit()
conn.close()
print("Tabelle ODA create con successo.")
