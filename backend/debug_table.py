import json, os

base = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(base, 'data', 'utilizzatori_trasformatore.json')

with open(path, 'r', encoding='utf-8') as f:
    tbl = json.load(f)

records = tbl.get('records', [])
print(f'Totale record: {len(records)}')
print('\nComponenti nella tabella:')
for r in records:
    print(f"  {r.get('componente')} | tensione={r.get('tensione_uscita_trasf')} | watt={r.get('watt')}")
