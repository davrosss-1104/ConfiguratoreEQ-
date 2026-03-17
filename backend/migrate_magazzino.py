"""
migrate_magazzino.py — Migrazione DB per il modulo Magazzino
=============================================================
Operazioni:
  1. Crea tabella magazzino_movimenti
  2. Converte le giacenze statiche esistenti in movimenti 'inventario_iniziale'
  3. Verifica integrità: giacenza calcolata deve corrispondere al campo cache
  4. Aggiunge 'magazzino' a parametri_sistema

Sicuro da rieseguire: usa INSERT OR IGNORE e controlla duplicati.

Uso:
    python migrate_magazzino.py elettroquadri_demo.db
"""

import sqlite3
import sys
from datetime import datetime


def migrate(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur  = conn.cursor()
    now  = datetime.now().isoformat()

    print("=" * 55)
    print("MIGRAZIONE MAGAZZINO")
    print(f"DB: {db_path}")
    print("=" * 55)

    # ── 1. Crea tabella movimenti ─────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS magazzino_movimenti (
            id                  INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo                TEXT    NOT NULL,
            -- tipi: inventario_iniziale | carico_acquisto | carico_rettifica |
            --       reso_cliente | scarico_commessa | scarico_rettifica | reso_fornitore
            segno               INTEGER NOT NULL DEFAULT 1,
            -- +1 = entrata, -1 = uscita
            articolo_id         INTEGER NOT NULL REFERENCES articoli(id) ON DELETE CASCADE,
            codice_articolo     TEXT    NOT NULL,
            quantita            REAL    NOT NULL DEFAULT 0,
            -- sempre positiva; il segno determina l'effetto sulla giacenza
            riferimento_tipo    TEXT,
            -- ordine | oda | manuale
            riferimento_id      INTEGER,
            note                TEXT,
            utente              TEXT,
            data_movimento      TEXT    NOT NULL DEFAULT (datetime('now')),
            created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mag_mov_articolo
        ON magazzino_movimenti(articolo_id)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mag_mov_tipo
        ON magazzino_movimenti(tipo)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mag_mov_data
        ON magazzino_movimenti(data_movimento)
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mag_mov_riferimento
        ON magazzino_movimenti(riferimento_tipo, riferimento_id)
    """)
    print("  ✅ magazzino_movimenti")

    # ── 2. Converti giacenze statiche in inventario_iniziale ──
    cur.execute("""
        SELECT id, codice, giacenza FROM articoli
        WHERE giacenza > 0 AND is_active = 1
    """)
    articoli = cur.fetchall()

    convertiti = 0
    saltati    = 0
    for art in articoli:
        art_id  = art["id"]
        codice  = art["codice"]
        giacenza = float(art["giacenza"])

        # Controlla se esiste già un inventario_iniziale per questo articolo
        cur.execute("""
            SELECT COUNT(*) FROM magazzino_movimenti
            WHERE articolo_id = ? AND tipo = 'inventario_iniziale'
        """, (art_id,))
        if cur.fetchone()[0] > 0:
            saltati += 1
            continue

        cur.execute("""
            INSERT INTO magazzino_movimenti (
                tipo, segno, articolo_id, codice_articolo, quantita,
                riferimento_tipo, note, utente, data_movimento, created_at
            ) VALUES ('inventario_iniziale', 1, ?, ?, ?, 'manuale',
                      'Giacenza iniziale da migrazione', 'sistema', ?, ?)
        """, (art_id, codice, giacenza, now, now))
        convertiti += 1

    print(f"  ✅ Inventari iniziali: {convertiti} creati, {saltati} già presenti")

    # ── 3. Verifica integrità giacenze ────────────────────────
    cur.execute("""
        SELECT a.id, a.codice, a.giacenza AS cache,
               COALESCE(SUM(m.quantita * m.segno), 0) AS calcolata
        FROM articoli a
        LEFT JOIN magazzino_movimenti m ON m.articolo_id = a.id
        GROUP BY a.id
        HAVING ABS(cache - calcolata) > 0.001
    """)
    discrepanze = cur.fetchall()
    if discrepanze:
        print(f"\n  ⚠️  {len(discrepanze)} discrepanze trovate — aggiorno cache:")
        for d in discrepanze[:10]:  # mostra max 10
            print(f"     {d['codice']}: cache={d['cache']} calcolata={d['calcolata']}")
            cur.execute(
                "UPDATE articoli SET giacenza = ? WHERE id = ?",
                (round(d["calcolata"], 4), d["id"])
            )
        if len(discrepanze) > 10:
            print(f"     ... e altri {len(discrepanze) - 10}")
        # Aggiorna tutte
        cur.execute("""
            UPDATE articoli SET giacenza = (
                SELECT COALESCE(SUM(m.quantita * m.segno), 0)
                FROM magazzino_movimenti m WHERE m.articolo_id = articoli.id
            )
        """)
        print("  ✅ Cache giacenze riallineata")
    else:
        print("  ✅ Integrità giacenze OK")

    # ── 4. Parametri sistema ──────────────────────────────────
    cur.execute("""
        SELECT id FROM parametri_sistema WHERE chiave = 'modulo_magazzino_attivo'
    """)
    if not cur.fetchone():
        cur.execute("""
            INSERT INTO parametri_sistema
                (chiave, valore, descrizione, tipo_dato, gruppo, created_at, updated_at)
            VALUES
                ('modulo_magazzino_attivo', 'true',
                 'Attiva/disattiva modulo Magazzino', 'boolean', 'moduli', ?, ?)
        """, (now, now))
        print("  ✅ parametri_sistema: modulo_magazzino_attivo = true")
    else:
        print("  ⏭️  parametri_sistema: modulo_magazzino_attivo già presente")

    conn.commit()
    conn.close()
    print("\n✅ Migrazione Magazzino completata")


def verifica(db_path: str):
    """Stampa un riepilogo dello stato del magazzino dopo la migrazione."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur  = conn.cursor()

    cur.execute("SELECT COUNT(*) AS n FROM magazzino_movimenti")
    n_mov = cur.fetchone()["n"]

    cur.execute("SELECT COUNT(*) AS n FROM articoli WHERE giacenza > 0")
    n_art = cur.fetchone()["n"]

    cur.execute("""
        SELECT COUNT(*) AS n FROM articoli
        WHERE scorta_minima > 0 AND giacenza < scorta_minima
    """)
    n_sotto = cur.fetchone()["n"]

    print(f"\nRiepilogo post-migrazione:")
    print(f"  Movimenti creati:          {n_mov}")
    print(f"  Articoli con giacenza > 0: {n_art}")
    print(f"  Articoli sotto scorta:     {n_sotto}")
    conn.close()


if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else "elettroquadri_demo.db"
    migrate(db)
    verifica(db)
