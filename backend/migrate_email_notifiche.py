r"""
migrate_email_notifiche.py
==========================
Aggiunge:
  - Tabella email_notifiche_log
  - Parametri SMTP in parametri_sistema (se non esistono)

Eseguire con:
  set DATABASE_URL=sqlite:///C:\Users\david\Desktop\Python\ConfiguratoreEQ\3.0\backend\elettroquadri_demo.db
  python migrate_email_notifiche.py
"""

import os, sqlite3

DB_PATH = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./backend/elettroquadri_demo.db"
).replace("sqlite:///", "")

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# ── Tabella log notifiche email ──────────────────────────────────────────────
cur.execute("""
CREATE TABLE IF NOT EXISTS email_notifiche_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id   INTEGER NOT NULL,
    trigger     TEXT NOT NULL,      -- 'assegnazione' | 'cambio_stato' | 'scadenza'
    destinatari TEXT NOT NULL,      -- JSON array di indirizzi
    oggetto     TEXT,
    esito       TEXT NOT NULL,      -- 'inviata' | 'errore' | 'disabilitata'
    errore      TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (ticket_id) REFERENCES tickets(id)
)
""")
print("OK — tabella email_notifiche_log")

# ── Parametri SMTP in parametri_sistema ──────────────────────────────────────
PARAMETRI_DEFAULT = [
    ("smtp_host",          ""),
    ("smtp_port",          "587"),
    ("smtp_user",          ""),
    ("smtp_password",      ""),
    ("smtp_use_tls",       "1"),
    ("smtp_mittente",      ""),          # indirizzo mittente (es: notifiche@azienda.it)
    ("email_notifiche_attive", "0"),     # master switch: 0=disabilitate, 1=abilitate
    ("email_notifica_assegnazione", "1"),
    ("email_notifica_cambio_stato", "1"),
    ("email_notifica_scadenza",     "1"),
    ("email_ora_invio_differito",   "08:00"),  # ora invio per notifiche differite
]

for chiave, valore_default in PARAMETRI_DEFAULT:
    cur.execute(
        "INSERT OR IGNORE INTO parametri_sistema (chiave, valore) VALUES (?, ?)",
        (chiave, valore_default)
    )

conn.commit()
print(f"OK — {len(PARAMETRI_DEFAULT)} parametri SMTP aggiunti (se non esistevano)")

conn.close()
print("\nMigrazione completata.")
