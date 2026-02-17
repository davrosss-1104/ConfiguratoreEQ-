"""Diagnostica regole contattori - esegui con: python diagnostica_regole.py"""
import sqlite3, json, os

conn = sqlite3.connect("configuratore.db")
c = conn.cursor()

# 1. Context dal ORM argano
ctx = {}
c.execute("SELECT trazione, potenza_motore_kw, tipo_avviamento_motore FROM argano WHERE preventivo_id=1")
row = c.fetchone()
if row:
    ctx["trazione"] = row[0]
    ctx["argano.trazione"] = row[0]
    ctx["potenza_motore_kw"] = row[1]
    ctx["argano.potenza_motore_kw"] = row[1]
    if row[2]:
        ctx["tipo_avviamento_motore"] = row[2]
        ctx["argano.tipo_avviamento_motore"] = row[2]

# 2. Context da valori_configurazione
c.execute("SELECT codice_campo, valore FROM valori_configurazione WHERE preventivo_id=1")
for campo, val in c.fetchall():
    try:
        val = float(val)
    except:
        pass
    ctx[campo] = val
    # Anche senza prefisso
    if "." in campo:
        ctx[campo.split(".", 1)[1]] = val

conn.close()

print("=== CONTEXT ===")
for k, v in sorted(ctx.items()):
    print(f"  {k} = {v!r} ({type(v).__name__})")

# 3. Prova la regola
print("\n=== TEST REGOLA ===")
f = "rules/rule_CONT_OLEO_DIR_50HZ_5_9KW.json"
if not os.path.exists(f):
    print(f"FILE NON TROVATO: {f}")
    if os.path.exists("rules"):
        files = [x for x in os.listdir("rules") if "CONT_OLEO" in x]
        print(f"File CONT_OLEO trovati: {len(files)}")
        for x in files[:5]:
            print(f"  {x}")
    else:
        print("DIRECTORY rules/ NON ESISTE!")
else:
    rule = json.load(open(f, encoding="utf-8"))
    print(f"Regola: {rule['id']}")
    all_ok = True
    for cond in rule["conditions"]:
        field = cond["field"]
        exp = cond["value"]
        op = cond["operator"]
        val = ctx.get(field)
        if op == "equals":
            ok = str(val).lower() == str(exp).lower()
        elif op == "greater_equal":
            try:
                ok = float(val) >= float(exp)
            except:
                ok = False
        elif op == "less_than":
            try:
                ok = float(val) < float(exp)
            except:
                ok = False
        else:
            ok = "?"
        if not ok:
            all_ok = False
        status = "OK" if ok else "FAIL"
        print(f"  [{status}] {field}: ctx={val!r} {op} {exp!r}")
    print(f"\nRisultato: {'MATCH' if all_ok else 'NO MATCH'}")
