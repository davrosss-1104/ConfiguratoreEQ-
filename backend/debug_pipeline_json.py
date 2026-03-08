import sqlite3, json

c = sqlite3.connect('elettroquadri_demo.db')
rows = c.execute("SELECT id, contenuto FROM regole WHERE id='PIPELINE_1772119560079'").fetchall()
if not rows:
    rows = c.execute("SELECT id, contenuto FROM regole WHERE id LIKE '%PIPELINE%'").fetchall()
for r in rows:
    print(f'ID: {r[0]}')
    try:
        data = json.loads(r[1])
        print(json.dumps(data.get('pipeline_steps', data), indent=2))
    except:
        print(r[1][:2000])
