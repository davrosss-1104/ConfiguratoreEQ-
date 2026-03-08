import sys
sys.path.insert(0, '.')
from database import SessionLocal
from models import Preventivo
from rule_engine import RuleEngine

db = SessionLocal()
preventivo = db.query(Preventivo).filter(Preventivo.id == 219).first()
engine = RuleEngine(db)
ctx = engine.build_config_context(preventivo)

print('=== selezione_trasformatore nel contesto ===')
for k, v in ctx.items():
    if k.startswith('selezione_trasformatore.'):
        print(f'  {k} = {v!r}  (type={type(v).__name__})')

print('\n=== componenti attivi (logica lookup_each) ===')
sez_prefix = 'selezione_trasformatore.'
for k, v in ctx.items():
    if k.startswith(sez_prefix):
        campo = k[len(sez_prefix):]
        attivo = bool(v) and str(v).lower() not in ("false", "0", "no", "off", "")
        if attivo:
            print(f'  ATTIVO: {campo} = {v!r}')
