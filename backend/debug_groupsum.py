import sys, json
sys.path.insert(0, '.')
from database import SessionLocal
from models import Preventivo
from rule_engine import RuleEngine

db = SessionLocal()
preventivo = db.query(Preventivo).filter(Preventivo.id == 219).first()
engine = RuleEngine(db)
ctx = engine.build_config_context(preventivo)

# Step 0: lookup_each
step0 = {
    "action": "lookup_each",
    "sezione": "selezione_trasformatore",
    "tabella": "utilizzatori_trasformatore",
    "campo_lookup": "componente",
    "output_prefix": "_calc.util."
}
out0 = engine._pipeline_lookup_each(step0, ctx)
print(f'lookup_each: {len(out0)} keys')
for k, v in sorted(out0.items()):
    print(f'  {k} = {v!r}')

# Pattern matching debug
print('\n=== PATTERN: _calc.util.*.watt ===')
values = engine._match_pattern("_calc.util.*.watt", ctx)
for wc, v in values.items():
    print(f'  wildcard={wc!r} → watt={v}')

print('\n=== PATTERN: _calc.util.*.tensione_uscita_trasf ===')
groups = engine._match_pattern("_calc.util.*.tensione_uscita_trasf", ctx)
for wc, v in groups.items():
    print(f'  wildcard={wc!r} → tensione={v}')

print('\n=== Tutte le chiavi _calc.util nel ctx ===')
for k, v in sorted(ctx.items()):
    if k.startswith('_calc.util.'):
        print(f'  {k} = {v!r}')
