import sqlite3, os
db_path = os.path.join(os.path.dirname(__file__), "elettroquadri_demo.db")
conn = sqlite3.connect(db_path)
cur = conn.cursor()

# Verifica colonne esistenti
cur.execute("PRAGMA table_info(fatture_passive)")
cols = [r[1] for r in cur.fetchall()]
print("Colonne esistenti:", cols)

if 'numero_fattura_fornitore' not in cols:
    conn.execute("ALTER TABLE fatture_passive ADD COLUMN numero_fattura_fornitore TEXT")
    print("Aggiunta numero_fattura_fornitore")

conn.commit()
conn.close()
print("OK")