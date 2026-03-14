r"""
migrate_fornitori.py
====================
1. Crea tabella `fornitori` con anagrafica completa
2. Aggiunge `fornitore_id` a `articoli` (FK soft verso fornitori)
3. Aggiunge `fornitore_id` a `ordini_acquisto` se non c'è già
4. Popola `fornitori` dai nomi distinti già presenti in `articoli.fornitore`
   e aggiorna `articoli.fornitore_id` di conseguenza
5. Crea indici utili

Sicuro da eseguire più volte (tutte le operazioni sono idempotenti).
"""
import sqlite3
import sys
from datetime import datetime

def migrate(db_path: str = "configuratore.db"):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    now = datetime.now().isoformat()

    print("=" * 55)
    print("MIGRAZIONE ANAGRAFICA FORNITORI")
    print("=" * 55)

    # ----------------------------------------------------------
    # 1. Tabella fornitori
    # ----------------------------------------------------------
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fornitori (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            ragione_sociale     TEXT    NOT NULL,
            codice              TEXT,                       -- codice interno opzionale
            partita_iva         TEXT,
            codice_fiscale      TEXT,
            pec                 TEXT,
            email               TEXT,                       -- email per invio ODA
            email_cc            TEXT,                       -- CC opzionale
            telefono            TEXT,
            indirizzo           TEXT,
            comune              TEXT,
            provincia           TEXT,
            cap                 TEXT,
            paese               TEXT    DEFAULT 'IT',
            iban                TEXT,
            condizioni_pagamento TEXT,
            note                TEXT,
            attivo              INTEGER DEFAULT 1,
            created_at          TEXT    DEFAULT (datetime('now')),
            updated_at          TEXT    DEFAULT (datetime('now'))
        )
    """)
    print("  ✅ Tabella `fornitori` creata (o già esistente)")

    # Indice univoco su ragione_sociale (case-insensitive)
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_fornitori_ragione_sociale
        ON fornitori (LOWER(ragione_sociale))
    """)

    # ----------------------------------------------------------
    # 2. fornitore_id su articoli
    # ----------------------------------------------------------
    cur.execute("PRAGMA table_info(articoli)")
    cols_articoli = {r["name"] for r in cur.fetchall()}
    if "fornitore_id" not in cols_articoli:
        cur.execute("ALTER TABLE articoli ADD COLUMN fornitore_id INTEGER REFERENCES fornitori(id)")
        print("  ✅ Aggiunta colonna `fornitore_id` ad `articoli`")
    else:
        print("  ⏭️  `articoli.fornitore_id` già presente")

    # ----------------------------------------------------------
    # 3. fornitore_id su ordini_acquisto (per join diretto)
    # ----------------------------------------------------------
    #cur.execute("PRAGMA table_info(ordini_acquisto)")
    #cols_oda = {r["name"] for r in cur.fetchall()}
    #if "fornitore_id" not in cols_oda:
    #    cur.execute("ALTER TABLE ordini_acquisto ADD COLUMN fornitore_id INTEGER REFERENCES fornitori(id)")
     #   print("  ✅ Aggiunta colonna `fornitore_id` a `ordini_acquisto`")
    #else:
    #    print("  ⏭️  `ordini_acquisto.fornitore_id` già presente")

    # ----------------------------------------------------------
    # 4. Popola fornitori dai nomi già presenti in articoli
    # ----------------------------------------------------------
    cur.execute("""
        SELECT DISTINCT fornitore FROM articoli
        WHERE fornitore IS NOT NULL AND TRIM(fornitore) != ''
        ORDER BY fornitore
    """)
    nomi = [r[0].strip() for r in cur.fetchall()]
    inseriti = 0
    for nome in nomi:
        cur.execute(
            "SELECT id FROM fornitori WHERE LOWER(ragione_sociale) = LOWER(?)",
            (nome,)
        )
        if not cur.fetchone():
            cur.execute(
                "INSERT INTO fornitori (ragione_sociale, created_at, updated_at) VALUES (?, ?, ?)",
                (nome, now, now)
            )
            inseriti += 1

    if inseriti:
        print(f"  ✅ Importati {inseriti} fornitori da articoli esistenti")
    else:
        print("  ⏭️  Nessun nuovo fornitore da importare")

    # ----------------------------------------------------------
    # 5. Aggiorna fornitore_id sugli articoli
    # ----------------------------------------------------------
    cur.execute("""
        UPDATE articoli
        SET fornitore_id = (
            SELECT f.id FROM fornitori f
            WHERE LOWER(f.ragione_sociale) = LOWER(articoli.fornitore)
        )
        WHERE fornitore IS NOT NULL AND fornitore_id IS NULL
    """)
    aggiornati = cur.rowcount
    if aggiornati:
        print(f"  ✅ Collegati {aggiornati} articoli al fornitore tramite fornitore_id")

    # ----------------------------------------------------------
    # 6. Aggiorna fornitore_id sugli ODA esistenti
    # ----------------------------------------------------------
    #cur.execute("""
    #    UPDATE ordini_acquisto
    #    SET fornitore_id = (
    #        SELECT f.id FROM fornitori f
    #        WHERE LOWER(f.ragione_sociale) = LOWER(ordini_acquisto.fornitore_denominazione)
    #    )
    #    WHERE fornitore_denominazione IS NOT NULL AND fornitore_id IS NULL
    #""")
    #aggiornati_oda = cur.rowcount
    #if aggiornati_oda:
    #    print(f"  ✅ Collegati {aggiornati_oda} ODA esistenti al fornitore tramite fornitore_id")

    # ----------------------------------------------------------
    # 7. Indici
    # ----------------------------------------------------------
    cur.execute("CREATE INDEX IF NOT EXISTS idx_articoli_fornitore_id ON articoli(fornitore_id)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_oda_fornitore_id ON ordini_acquisto(fornitore_id)")

    conn.commit()
    conn.close()
    print("\n✅ Migrazione fornitori completata")


if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else "configuratore.db"
    migrate(db)
