"""
add_campi_vano.py
=================
Aggiunge i campi vano dinamici (generati da parse_posizioni_vano)
alla tabella campi_configuratore, così compaiono nel dropdown del Rule Builder.

Uso:
    python add_campi_vano.py backend\elettroquadri_demo.db
"""

import sqlite3, sys, os

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "backend\\elettroquadri_demo.db"
if not os.path.exists(DB_PATH):
    print(f"ERRORE DB non trovato: {DB_PATH}")
    sys.exit(1)

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

CAMPI = [
    ("vano.centralina_presente",    "Centralina presente",        "Vano",  "boolean"),
    ("vano.centralina_lato",        "Centralina - lato",          "Vano",  "string"),
    ("vano.centralina_distanza",    "Centralina - distanza (m)",  "Vano",  "number"),
    ("vano.quadro_el_presente",     "Quadro elettrico presente",  "Vano",  "boolean"),
    ("vano.quadro_el_lato",         "Quadro elettrico - lato",    "Vano",  "string"),
    ("vano.quadro_el_distanza",     "Quadro elettrico - dist (m)","Vano",  "number"),
]

inseriti = 0
for codice, etichetta, sezione, tipo in CAMPI:
    cur.execute("SELECT id FROM campi_configuratore WHERE codice=?", (codice,))
    if cur.fetchone():
        print(f"  Gia presente: {codice}")
        continue
    cur.execute("""
        INSERT INTO campi_configuratore
            (codice, etichetta, tipo, sezione, attivo, ordine, usabile_regole, visibile_form)
        VALUES (?,?,?,?,1,99,1,0)
    """, (codice, etichetta, tipo, sezione))
    inseriti += 1
    print(f"  Inserito: {codice}")

conn.commit()
conn.close()
print(f"\nFatto. {inseriti} campi inseriti.")
