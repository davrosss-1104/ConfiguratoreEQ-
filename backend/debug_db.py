import sqlite3

c = sqlite3.connect('elettroquadri_demo.db')

print('=== SEZIONI nel preventivo 1 ===')
rows = c.execute("SELECT DISTINCT sezione FROM valori_configurazione WHERE preventivo_id=1 ORDER BY sezione").fetchall()
for r in rows:
    print(' ', r[0])

print('\n=== VALORI sezione *trasf* ===')
rows = c.execute("SELECT sezione, codice_campo, valore FROM valori_configurazione WHERE preventivo_id=1 AND sezione LIKE '%trasf%' LIMIT 50").fetchall()
if rows:
    for r in rows:
        print(f'  {r[0]}.{r[1]} = {r[2]}')
else:
    print('  (nessun valore)')

print('\n=== CAMPI configuratore sezione *trasf* ===')
rows = c.execute("SELECT sezione, codice, tipo_campo FROM campi_configuratore WHERE sezione LIKE '%trasf%' AND attivo=1").fetchall()
if rows:
    for r in rows:
        print(f'  {r[0]}.{r[1]} ({r[2]})')
else:
    print('  (nessun campo)')
