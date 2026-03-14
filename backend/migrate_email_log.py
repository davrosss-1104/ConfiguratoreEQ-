"""
migrate_email_log.py
====================
Crea la tabella email_notifiche_log usata da notifiche_email.py.
Aggiunge anche la colonna email_cc alla tabella fornitori se mancante.

Eseguire una volta sola:
  venv\Scripts\python.exe migrate_email_log.py
"""

import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "elettroquadri_demo.db")


def run():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # ── email_notifiche_log ───────────────────────────────────────────────────
    cur.execute("""
        CREATE TABLE IF NOT EXISTS email_notifiche_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id   INTEGER,
            oda_id      INTEGER,
            trigger     TEXT    NOT NULL,
            destinatari TEXT,
            oggetto     TEXT,
            esito       TEXT    NOT NULL DEFAULT 'inviata',
            errore      TEXT,
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)
    print("[OK] Tabella email_notifiche_log creata (o già esistente)")

    # ── colonna email_cc su fornitori (per ODA con CC) ────────────────────────
    cur.execute("PRAGMA table_info(fornitori)")
    cols = [r[1] for r in cur.fetchall()]
    if "email_cc" not in cols:
        cur.execute("ALTER TABLE fornitori ADD COLUMN email_cc TEXT")
        print("[OK] Colonna email_cc aggiunta a fornitori")
    else:
        print("[OK] Colonna email_cc già presente su fornitori")

    # ── parametri email ODA in parametri_sistema ──────────────────────────────
    nuovi_parametri = [
        ("email_notifica_oda_inviato",   "1",  "Email al team quando un ODA viene inviato al fornitore"),
        ("email_notifica_oda_ricevuto",  "1",  "Email al team quando un ODA viene marcato come ricevuto"),
        ("email_destinatario_oda",       "",   "Email interna per notifiche ODA (es. ufficio.acquisti@azienda.it)"),
    ]
    for chiave, valore_default, descrizione in nuovi_parametri:
        cur.execute("SELECT id FROM parametri_sistema WHERE chiave = ?", (chiave,))
        if not cur.fetchone():
            cur.execute(
                "INSERT INTO parametri_sistema (chiave, valore, descrizione) VALUES (?, ?, ?)",
                (chiave, valore_default, descrizione)
            )
            print(f"[OK] Parametro '{chiave}' aggiunto")
        else:
            print(f"[OK] Parametro '{chiave}' già presente")

    conn.commit()
    conn.close()
    print("\nMigrazione completata.")


if __name__ == "__main__":
    run()
