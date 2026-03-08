import sqlite3

c = sqlite3.connect('elettroquadri_demo.db')

PID = 219

print(f'=== SEZIONI nel preventivo {PID} ===')
rows = c.execute(f"SELECT DISTINCT sezione FROM valori_configurazione WHERE preventivo_id={PID} ORDER BY sezione").fetchall()
for r in rows:
    print(' ', r[0])

print(f'\n=== VALORI sezione selezione_trasformatore per preventivo {PID} ===')
rows = c.execute(f"SELECT sezione, codice_campo, valore FROM valori_configurazione WHERE preventivo_id={PID} AND sezione='selezione_trasformatore'").fetchall()
if rows:
    for r in rows:
        print(f'  {r[0]}.{r[1]} = {r[2]!r}')
else:
    print('  (nessun valore)')

print(f'\n=== CAMPI in campi_configuratore sezione selezione_trasformatore ===')
try:
    rows = c.execute("SELECT codice, etichetta, tipo FROM campi_configuratore WHERE sezione='selezione_trasformatore' AND attivo=1").fetchall()
    if rows:
        for r in rows:
            print(f'  {r[0]} ({r[2]}): {r[1]}')
    else:
        print('  (nessun campo attivo)')
except Exception as e:
    # prova con colonne diverse
    rows = c.execute("SELECT * FROM campi_configuratore WHERE sezione='selezione_trasformatore' LIMIT 3").fetchall()
    cols = [d[0] for d in c.execute("PRAGMA table_info(campi_configuratore)").fetchall()]
    print('  colonne:', cols)
    for r in rows:
        print(' ', dict(zip(cols, r)))
