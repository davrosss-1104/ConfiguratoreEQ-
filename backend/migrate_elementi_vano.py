"""
migrate_elementi_vano.py
========================
Aggiunge la tabella elementi_vano e popola i valori di default
corrispondenti agli elementi attualmente hardcoded in PiantaInterattiva.tsx.

ESECUZIONE:
  python migrate_elementi_vano.py [path_db]
  Default: ./configuratore.db
"""
import sqlite3
import sys
import os

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "./configuratore.db"

ELEMENTI_DEFAULT = [
    {
        "id_elemento": "QM",
        "nome": "Quadro Manovra",
        "emoji": "🔲",
        "colore_bg": "bg-purple-200",
        "colore_border": "border-purple-400",
        "solo_esterno": 1,
        "solo_interno": 0,
        "ha_distanza": 1,
        "attivo": 1,
        "ordine": 10,
    },
    {
        "id_elemento": "IN",
        "nome": "Inverter",
        "emoji": "📊",
        "colore_bg": "bg-yellow-200",
        "colore_border": "border-yellow-400",
        "solo_esterno": 0,
        "solo_interno": 1,
        "ha_distanza": 0,
        "attivo": 1,
        "ordine": 20,
    },
    {
        "id_elemento": "UPS",
        "nome": "Gruppo Continuità",
        "emoji": "🔋",
        "colore_bg": "bg-green-200",
        "colore_border": "border-green-400",
        "solo_esterno": 0,
        "solo_interno": 1,
        "ha_distanza": 0,
        "attivo": 1,
        "ordine": 30,
    },
    {
        "id_elemento": "BotI",
        "nome": "Bottoniera Ispezione",
        "emoji": "⭕",
        "colore_bg": "bg-blue-200",
        "colore_border": "border-blue-400",
        "solo_esterno": 0,
        "solo_interno": 0,
        "ha_distanza": 1,
        "attivo": 1,
        "ordine": 40,
    },
    {
        "id_elemento": "Sirena",
        "nome": "Sirena Allarme",
        "emoji": "🔔",
        "colore_bg": "bg-red-200",
        "colore_border": "border-red-400",
        "solo_esterno": 1,
        "solo_interno": 0,
        "ha_distanza": 1,
        "attivo": 1,
        "ordine": 50,
    },
    {
        "id_elemento": "Altro",
        "nome": "Altro Elemento",
        "emoji": "❓",
        "colore_bg": "bg-gray-200",
        "colore_border": "border-gray-400",
        "solo_esterno": 0,
        "solo_interno": 0,
        "ha_distanza": 1,
        "attivo": 1,
        "ordine": 60,
    },
]


def run():
    if not os.path.exists(DB_PATH):
        print(f"❌ DB non trovato: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='elementi_vano'")
    if cur.fetchone():
        print("ℹ️  Tabella elementi_vano già esistente — skipping.")
        conn.close()
        return

    print("📦 Creazione tabella elementi_vano...")
    cur.execute("""
        CREATE TABLE elementi_vano (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            id_elemento     TEXT NOT NULL UNIQUE,   -- es. "QM", "BotI", "CentrOleo"
            nome            TEXT NOT NULL,
            emoji           TEXT NOT NULL DEFAULT '📦',
            colore_bg       TEXT NOT NULL DEFAULT 'bg-gray-200',
            colore_border   TEXT NOT NULL DEFAULT 'border-gray-400',
            solo_esterno    INTEGER NOT NULL DEFAULT 0,
            solo_interno    INTEGER NOT NULL DEFAULT 0,
            ha_distanza     INTEGER NOT NULL DEFAULT 1,  -- mostra campo distanza se esterno
            descrizione     TEXT,
            attivo          INTEGER NOT NULL DEFAULT 1,
            ordine          INTEGER NOT NULL DEFAULT 0,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        )
    """)

    cur.execute("""
        CREATE TRIGGER elementi_vano_updated
        AFTER UPDATE ON elementi_vano
        BEGIN
            UPDATE elementi_vano SET updated_at = datetime('now') WHERE id = NEW.id;
        END
    """)

    print("📥 Inserimento elementi di default...")
    for el in ELEMENTI_DEFAULT:
        cur.execute("""
            INSERT INTO elementi_vano
                (id_elemento, nome, emoji, colore_bg, colore_border,
                 solo_esterno, solo_interno, ha_distanza, attivo, ordine)
            VALUES
                (:id_elemento, :nome, :emoji, :colore_bg, :colore_border,
                 :solo_esterno, :solo_interno, :ha_distanza, :attivo, :ordine)
        """, el)
        print(f"   ✓ {el['id_elemento']} — {el['nome']}")

    conn.commit()
    conn.close()
    print("✅ Tabella elementi_vano creata e popolata.")


if __name__ == "__main__":
    run()
