from database import engine

conn = engine.raw_connection()
cur = conn.cursor()

alterazioni = [
    "ALTER TABLE ordini_acquisto_righe ADD COLUMN articolo_id INTEGER",
    "ALTER TABLE ordini_acquisto_righe ADD COLUMN sconto_percentuale REAL DEFAULT 0",
    "ALTER TABLE ordini_acquisto_righe ADD COLUMN note_riga TEXT",
]

for sql in alterazioni:
    try:
        cur.execute(sql)
        print(f"OK: {sql}")
    except Exception as e:
        print(f"SKIP (già esiste?): {e}")

conn.commit()
conn.close()
print("Migrazione completata.")
