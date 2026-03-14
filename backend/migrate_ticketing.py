import sqlite3

conn = sqlite3.connect('configuratore.db')

conn.executescript("""
CREATE TABLE IF NOT EXISTS impianti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codice_cliente TEXT NOT NULL,
    cliente_id INTEGER,
    descrizione TEXT,
    indirizzo_installazione TEXT,
    note TEXT,
    attivo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(codice_cliente, cliente_id)
);

CREATE TABLE IF NOT EXISTS ordini_impianti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ordine_id INTEGER NOT NULL,
    impianto_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS preventivi_impianti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    preventivo_id INTEGER NOT NULL,
    impianto_id INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categorie_ticket (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    tipo TEXT DEFAULT 'generale',
    colore TEXT DEFAULT '#6366f1',
    ordine INTEGER DEFAULT 0,
    attivo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_ticket TEXT UNIQUE,
    tipo TEXT DEFAULT 'interno',
    titolo TEXT NOT NULL,
    descrizione TEXT,
    stato TEXT DEFAULT 'aperto',
    priorita TEXT DEFAULT 'normale',
    categoria_id INTEGER,
    cliente_id INTEGER,
    ordine_id INTEGER,
    impianto_id INTEGER,
    assegnato_a INTEGER,
    creato_da INTEGER,
    scadenza TEXT,
    soluzione TEXT,
    nexum_regola_id TEXT,
    nexum_proposta TEXT,
    risolto_at TEXT,
    chiuso_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ticket_commenti (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    utente_id INTEGER,
    testo TEXT,
    tipo TEXT DEFAULT 'commento',
    visibile_cliente INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ticket_allegati (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    nome_file TEXT,
    path TEXT,
    dimensione INTEGER,
    caricato_da INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);
""")

conn.commit()
conn.close()
print('Migrazione ticketing completata OK')
