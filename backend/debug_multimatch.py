import json, os

base = os.path.dirname(os.path.abspath(__file__))

# Carica catalogo
with open(os.path.join(base, 'data', 'catalogo_trasformatori_flat.json'), 'r', encoding='utf-8') as f:
    cat = json.load(f)

records = cat.get('records', [])

# Requisiti simulati (da group_sum con power_factor=0.8)
requisiti = {
    '75': 187.5,
    '15': 187.5,
    '18': 187.5,
    '24': 18.75,
    '5': 18.75,
}

print(f'Requisiti: {requisiti}')
print(f'Totale record catalogo: {len(records)}')

# Raggruppa per codice_trasf
from collections import defaultdict
by_code = defaultdict(list)
for r in records:
    by_code[r['codice_trasf']].append(r)

print(f'\nTrasformatori nel catalogo: {list(by_code.keys())}')

print('\n=== Verifica per ogni trasformatore ===')
for codice, rows in sorted(by_code.items()):
    tensioni_disponibili = {str(r['tensione_uscita']): float(r['va_disponibili']) for r in rows}
    
    ok = True
    dettagli = []
    for t_req, va_req in requisiti.items():
        va_disp = tensioni_disponibili.get(t_req)
        if va_disp is None:
            ok = False
            dettagli.append(f'  tensione {t_req}V: MANCANTE')
        elif va_disp < va_req:
            ok = False
            dettagli.append(f'  tensione {t_req}V: {va_disp} < {va_req} (insufficiente)')
        else:
            dettagli.append(f'  tensione {t_req}V: {va_disp} >= {va_req} OK')
    
    status = '✓ MATCH' if ok else '✗ NO'
    print(f'\n{codice} [{status}]')
    for d in dettagli:
        print(d)
