"""
setup_demo.py
=============
Script da eseguire UNA VOLTA prima della presentazione cliente.

Cosa fa:
  1. Migrazione DB: crea tabelle variabili_derivate ed elementi_vano (se non esistono)
  2. Inserisce elementi "centralina" e "quadro_el" nella tabella elementi_vano
  3. Inserisce le 4 variabili derivate:
       - offset_lato_centralina + lunghezza_tubo_centralina
       - offset_lato_quadro     + lunghezza_cavo_quadro
  4. Inserisce gli articoli nel catalogo (se non esistono)
  5. Crea/aggiorna i preventivi di test per la demo:
       - DEMO-OLEO-B  : centralina lato B, corsa 3.5m → tubo 6m atteso
       - DEMO-OLEO-D  : centralina lato D              → tubo 9m atteso
       - DEMO-FUNE-B  : quadro lato B, corsa 4.0m     → cavo 6.0m atteso
       - DEMO-FUNE-D  : quadro lato D                  → cavo 8.0m atteso
       - DEMO-FUNE    : preventivo fune senza quadro   (nessun cavo)
     Più 3 ordini in stati diversi per la demo Ricerca Ordini

Uso:
  python setup_demo.py [percorso/al/configuratore.db]

  Il percorso default è ./configuratore.db nella cartella corrente.
"""

import json
import sqlite3
import sys
import os
from datetime import datetime, timedelta

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "./configuratore.db"

if not os.path.exists(DB_PATH):
    print(f"[ERRORE] Database non trovato: {DB_PATH}")
    print("  Uso: python setup_demo.py /percorso/al/configuratore.db")
    sys.exit(1)

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print(f"\n{'='*60}")
print(f"  Setup Demo — ConfiguratoreEQ")
print(f"  DB: {DB_PATH}")
print(f"  {datetime.now().strftime('%d/%m/%Y %H:%M')}")
print(f"{'='*60}\n")

# ─────────────────────────────────────────────────────────────────────────────
# 1. MIGRAZIONE TABELLE
# ─────────────────────────────────────────────────────────────────────────────
print("[1/5] Creazione tabelle (se non esistono)...")

cur.executescript("""
CREATE TABLE IF NOT EXISTS variabili_derivate (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL UNIQUE,
    descrizione TEXT,
    formula TEXT NOT NULL,
    parametri TEXT NOT NULL DEFAULT '[]',
    tipo_risultato TEXT NOT NULL DEFAULT 'numero',
    unita_misura TEXT,
    attivo INTEGER NOT NULL DEFAULT 1,
    ordine INTEGER NOT NULL DEFAULT 0,
    scope TEXT,
    tipo_variabile TEXT NOT NULL DEFAULT 'flat',
    dipendenze TEXT NOT NULL DEFAULT '[]',
    meta TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS elementi_vano (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_elemento TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '📦',
    colore_bg TEXT NOT NULL DEFAULT 'bg-gray-200',
    colore_border TEXT NOT NULL DEFAULT 'border-gray-400',
    solo_esterno INTEGER NOT NULL DEFAULT 0,
    solo_interno INTEGER NOT NULL DEFAULT 0,
    ha_distanza INTEGER NOT NULL DEFAULT 1,
    descrizione TEXT,
    attivo INTEGER NOT NULL DEFAULT 1,
    ordine INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
""")
conn.commit()
print("   OK\n")

# ─────────────────────────────────────────────────────────────────────────────
# 2. ELEMENTO VANO: centralina
# ─────────────────────────────────────────────────────────────────────────────
print("[2/5] Inserimento elementi vano (centralina + quadro elettrico)...")

cur.execute("SELECT id FROM elementi_vano WHERE id_elemento = 'centralina'")
if cur.fetchone():
    cur.execute("""
        UPDATE elementi_vano SET
            nome='Centralina Oleodinamica', emoji='🛢️',
            colore_bg='bg-orange-200', colore_border='border-orange-500',
            solo_esterno=1, solo_interno=0, ha_distanza=1,
            descrizione='Centralina idraulica — solo lato esterno al vano',
            attivo=1, ordine=10, updated_at=datetime('now')
        WHERE id_elemento='centralina'
    """)
    print("   Aggiornato (esisteva già): centralina")
else:
    cur.execute("""
        INSERT INTO elementi_vano
            (id_elemento, nome, emoji, colore_bg, colore_border,
             solo_esterno, solo_interno, ha_distanza, descrizione, attivo, ordine)
        VALUES
            ('centralina','Centralina Oleodinamica','🛢️',
             'bg-orange-200','border-orange-500',
             1, 0, 1,
             'Centralina idraulica — solo lato esterno al vano',
             1, 10)
    """)
    print("   Inserito: centralina")

cur.execute("SELECT id FROM elementi_vano WHERE id_elemento = 'quadro_el'")
if cur.fetchone():
    cur.execute("""
        UPDATE elementi_vano SET
            nome='Quadro Elettrico', emoji='⚡',
            colore_bg='bg-blue-200', colore_border='border-blue-500',
            solo_esterno=1, solo_interno=0, ha_distanza=1,
            descrizione='Quadro elettrico di manovra — solo lato esterno al vano',
            attivo=1, ordine=20, updated_at=datetime('now')
        WHERE id_elemento='quadro_el'
    """)
    print("   Aggiornato (esisteva già): quadro_el")
else:
    cur.execute("""
        INSERT INTO elementi_vano
            (id_elemento, nome, emoji, colore_bg, colore_border,
             solo_esterno, solo_interno, ha_distanza, descrizione, attivo, ordine)
        VALUES
            ('quadro_el','Quadro Elettrico','⚡',
             'bg-blue-200','border-blue-500',
             1, 0, 1,
             'Quadro elettrico di manovra — solo lato esterno al vano',
             1, 20)
    """)
    print("   Inserito: quadro_el")

conn.commit()
print()

# ─────────────────────────────────────────────────────────────────────────────
# 3. VARIABILI DERIVATE
# ─────────────────────────────────────────────────────────────────────────────
print("[3/5] Inserimento variabili derivate...")

variabili = [
    {
        "nome": "offset_lato_centralina",
        "descrizione": "Offset percorso orizzontale tubo centralina in base al lato del vano",
        "formula": "if(vano.centralina_lato == B, 0.3, if(vano.centralina_lato == D, vano.larghezza + 0.5, vano.profondita))",
        "parametri": json.dumps([
            {"nome": "margine_b",      "valore": 0.3, "descrizione": "Offset fisso lato macchina"},
            {"nome": "margine_d_extra","valore": 0.5, "descrizione": "Extra lato D oltre la larghezza"},
        ]),
        "tipo_risultato": "numero",
        "unita_misura": "m",
        "ordine": 10,
    },
    {
        "nome": "lunghezza_tubo_centralina",
        "descrizione": "Lunghezza tubo idraulico centralina→cilindro, arrotondata al metro superiore",
        "formula": "ceil((corsa + 0.5 + vano.centralina_distanza + offset_lato_centralina) * 1.10)",
        "parametri": json.dumps([
            {"nome": "margine_curva_fondo",   "valore": 0.5,  "descrizione": "Curve in fossa e in testa"},
            {"nome": "coefficiente_sicurezza","valore": 1.10, "descrizione": "10% extra per tensionamento"},
        ]),
        "tipo_risultato": "numero",
        "unita_misura": "m",
        "ordine": 20,
    },
    {
        "nome": "offset_lato_quadro",
        "descrizione": "Offset percorso orizzontale cavo piatto quadro elettrico in base al lato del vano",
        "formula": "if(vano.quadro_el_lato == B, 0.3, if(vano.quadro_el_lato == D, vano.larghezza + 0.5, vano.profondita))",
        "parametri": json.dumps([
            {"nome": "margine_b",      "valore": 0.3, "descrizione": "Offset fisso lato macchina"},
            {"nome": "margine_d_extra","valore": 0.5, "descrizione": "Extra lato D oltre la larghezza"},
        ]),
        "tipo_risultato": "numero",
        "unita_misura": "m",
        "ordine": 30,
    },
    {
        "nome": "lunghezza_cavo_quadro",
        "descrizione": "Lunghezza cavo piatto quadro elettrico, arrotondata al mezzo metro superiore",
        "formula": "ceil((corsa + 0.5 + vano.quadro_el_distanza + offset_lato_quadro) * 1.10 * 2) / 2",
        "parametri": json.dumps([
            {"nome": "margine_curva_fondo",   "valore": 0.5,  "descrizione": "Margine per curve"},
            {"nome": "coefficiente_sicurezza","valore": 1.10, "descrizione": "10% extra"},
        ]),
        "tipo_risultato": "numero",
        "unita_misura": "m",
        "ordine": 40,
    },
]

for vd in variabili:
    cur.execute("SELECT id FROM variabili_derivate WHERE nome = ?", (vd["nome"],))
    if cur.fetchone():
        cur.execute("""
            UPDATE variabili_derivate SET
                descrizione=?, formula=?, parametri=?,
                tipo_risultato=?, unita_misura=?, ordine=?,
                attivo=1, updated_at=datetime('now')
            WHERE nome=?
        """, (vd["descrizione"], vd["formula"], vd["parametri"],
              vd["tipo_risultato"], vd["unita_misura"], vd["ordine"], vd["nome"]))
        print(f"   Aggiornata: {vd['nome']}")
    else:
        cur.execute("""
            INSERT INTO variabili_derivate
                (nome, descrizione, formula, parametri, tipo_risultato, unita_misura, ordine, attivo)
            VALUES (?,?,?,?,?,?,?,1)
        """, (vd["nome"], vd["descrizione"], vd["formula"], vd["parametri"],
              vd["tipo_risultato"], vd["unita_misura"], vd["ordine"]))
        print(f"   Inserita:   {vd['nome']}")

conn.commit()
print()

# ─────────────────────────────────────────────────────────────────────────────
# 4. ARTICOLI CATALOGO
# ─────────────────────────────────────────────────────────────────────────────
print("[4/5] Inserimento articoli demo nel catalogo...")

# Verifica struttura tabella articoli
cur.execute("PRAGMA table_info(articoli)")
cols_articoli = [r[1] for r in cur.fetchall()]

if not cols_articoli:
    print("   ATTENZIONE: tabella 'articoli' non trovata — skip")
else:
    # articoli_bom è il catalogo usato da _lookup_prezzo nel rule engine
    cur.execute("PRAGMA table_info(articoli_bom)")
    cols_bom = [r[1] for r in cur.fetchall()]

    articoli_bom = [
        ("TUBO-IDRA-3M",   "Tubo idraulico flessibile DN12 L=3m",       "TUBO", 45.00),
        ("TUBO-IDRA-6M",   "Tubo idraulico flessibile DN12 L=6m",       "TUBO", 82.00),
        ("TUBO-IDRA-9M",   "Tubo idraulico flessibile DN12 L=9m",       "TUBO", 118.00),
        ("TUBO-IDRA-12M",  "Tubo idraulico flessibile DN12 L=12m",      "TUBO", 155.00),
        ("RACK-TUBO-KIT",  "Kit raccorderia tubo centralina oleo",       "ACC",  28.50),
        ("CAVO-PIATTO-ML", "Cavo piatto quadro elettrico (prezzo/metro)","CAVO",  4.80),
    ]

    for codice, desc, cat, prezzo in articoli_bom:
        cur.execute("SELECT id FROM articoli_bom WHERE codice = ?", (codice,))
        if cur.fetchone():
            print(f"   Esiste già: {codice}")
            continue
        cur.execute("""
            INSERT INTO articoli_bom (codice, descrizione, categoria, prezzo_listino, attivo)
            VALUES (?,?,?,?,1)
        """, (codice, desc, cat, prezzo))
        print(f"   Inserito:   {codice}")

    conn.commit()
print()

# ─────────────────────────────────────────────────────────────────────────────
# 5. PREVENTIVI E ORDINI DI TEST
# ─────────────────────────────────────────────────────────────────────────────
print("[5/5] Creazione preventivi e ordini demo...")

# Verifica struttura preventivi
cur.execute("PRAGMA table_info(preventivi)")
cols_prev = [r[1] for r in cur.fetchall()]

if not cols_prev:
    print("   ATTENZIONE: tabella 'preventivi' non trovata — skip")
    conn.close()
    print("\nSetup completato (parziale — DB non ha ancora la struttura preventivi).\n")
    sys.exit(0)

# Funzione helper per creare/aggiornare preventivo demo
def upsert_preventivo(ref, tipo_impianto, nota):
    """Crea preventivo demo se non esiste, ritorna id."""
    cur.execute("SELECT id FROM preventivi WHERE numero_preventivo = ?", (ref,))
    row = cur.fetchone()
    if row:
        print(f"   Preventivo {ref}: già presente (id={row[0]})")
        return row[0]

    fields = {
        "numero_preventivo": ref,
        "tipo_preventivo":   "COMPLETO",
        "status":            "draft",
        "created_at":        datetime.now().isoformat(),
        "updated_at":        datetime.now().isoformat(),
    }
    if "note" in cols_prev:
        fields["note"] = nota

    keys = list(fields.keys())
    vals = list(fields.values())
    cur.execute(
        f"INSERT INTO preventivi ({','.join(keys)}) VALUES ({','.join(['?']*len(keys))})",
        vals
    )
    pid = cur.lastrowid
    print(f"   Preventivo {ref}: creato (id={pid})")
    return pid


# helper locale per upsert disposizione_vano
def upsert_disp_vano(pid, posizioni_json):
    cur.execute("SELECT id FROM disposizione_vano WHERE preventivo_id=?", (pid,))
    if cur.fetchone():
        cur.execute("UPDATE disposizione_vano SET posizioni_elementi=? WHERE preventivo_id=?", (posizioni_json, pid))
    else:
        cur.execute("INSERT INTO disposizione_vano (preventivo_id, posizioni_elementi) VALUES (?,?)",
                    (pid, posizioni_json))

def set_valori(pid, coppie):
    for sezione, campo, valore in coppie:
        cur.execute("INSERT OR REPLACE INTO valori_configurazione (preventivo_id, sezione, codice_campo, valore) VALUES (?,?,?,?)",
                    (pid, sezione, campo, valore))

# ── DEMO-OLEO-B: centralina lato B, corsa 3.5 → tubo 6m ─────────────────────
pid_b = upsert_preventivo("DEMO-OLEO-B", "oleodinamica", "Demo: centralina lato B, corsa 3.5m → tubo 6m atteso")
set_valori(pid_b, [
    ("dati_principali", "tipo_impianto", "oleodinamica"),
    ("dati_principali", "corsa",         "3.5"),
    ("vano",            "vano.larghezza","1.4"),
    ("vano",            "vano.profondita","1.6"),
])
upsert_disp_vano(pid_b, json.dumps({"centralina": {"lato": "B", "segmento": 1, "distanza_metri": 0.8, "elemento_id": "centralina"}}))

# ── DEMO-OLEO-D: centralina lato D, corsa 3.5 → tubo 9m ─────────────────────
pid_d = upsert_preventivo("DEMO-OLEO-D", "oleodinamica", "Demo: centralina lato D, corsa 3.5m → tubo 9m atteso")
set_valori(pid_d, [
    ("dati_principali", "tipo_impianto", "oleodinamica"),
    ("dati_principali", "corsa",         "3.5"),
    ("vano",            "vano.larghezza","1.4"),
    ("vano",            "vano.profondita","1.6"),
])
upsert_disp_vano(pid_d, json.dumps({"centralina": {"lato": "D", "segmento": 1, "distanza_metri": 0.8, "elemento_id": "centralina"}}))

# ── DEMO-FUNE-B: quadro lato B, corsa 4.0 → cavo 6.0m ───────────────────────
# (4.0 + 0.5 + 0.6 + 0.3) * 1.10 = 5.94 → ceil(5.94*2)/2 = 6.0
pid_fb = upsert_preventivo("DEMO-FUNE-B", "fune", "Demo: quadro lato B, corsa 4.0m → cavo 6.0m atteso")
set_valori(pid_fb, [
    ("dati_principali", "tipo_impianto", "fune"),
    ("dati_principali", "corsa",         "4.0"),
    ("vano",            "vano.larghezza","1.4"),
    ("vano",            "vano.profondita","1.6"),
])
upsert_disp_vano(pid_fb, json.dumps({"quadro_el": {"lato": "B", "segmento": 1, "distanza_metri": 0.6, "elemento_id": "quadro_el"}}))

# ── DEMO-FUNE-D: quadro lato D, corsa 4.0 → cavo 8.0m ───────────────────────
# (4.0 + 0.5 + 0.6 + 1.9) * 1.10 = 7.70 → ceil(7.70*2)/2 = 8.0
pid_fd = upsert_preventivo("DEMO-FUNE-D", "fune", "Demo: quadro lato D, corsa 4.0m → cavo 8.0m atteso")
set_valori(pid_fd, [
    ("dati_principali", "tipo_impianto", "fune"),
    ("dati_principali", "corsa",         "4.0"),
    ("vano",            "vano.larghezza","1.4"),
    ("vano",            "vano.profondita","1.6"),
])
upsert_disp_vano(pid_fd, json.dumps({"quadro_el": {"lato": "D", "segmento": 1, "distanza_metri": 0.6, "elemento_id": "quadro_el"}}))

# ── DEMO-FUNE: nessun quadro posizionato → nessun cavo ───────────────────────
pid_f = upsert_preventivo("DEMO-FUNE", "fune", "Demo: impianto fune senza quadro — nessun cavo")
set_valori(pid_f, [("dati_principali", "tipo_impianto", "fune")])

conn.commit()

# ── Ordini demo per Ricerca Ordini ────────────────────────────────────────────
cur.execute("PRAGMA table_info(ordini)")
cols_ordini = [r[1] for r in cur.fetchall()]

if not cols_ordini:
    print("   ATTENZIONE: tabella 'ordini' non trovata — skip ordini demo")
else:
    anno = datetime.now().year
    ordini_demo = [
        ("DEMO-2024-0001", pid_b,  "confermato",    "Ascensore oleo — Hotel Centrale, 3 fermate"),
        ("DEMO-2024-0002", pid_d,  "in_produzione", "Ascensore oleo — Condominio Rossi, 5 fermate"),
        ("DEMO-2024-0003", pid_fb, "completato",    "Ascensore fune — Uffici Bianchi"),
    ]
    for num, pid, stato, nota in ordini_demo:
        cur.execute("SELECT id FROM ordini WHERE numero_ordine=?", (num,))
        if cur.fetchone():
            print(f"   Ordine {num}: già presente")
            continue

        data_cons = (datetime.now() + timedelta(days=21)).isoformat()
        fields = {
            "numero_ordine": num,
            "preventivo_id": pid,
            "stato": stato,
            "lead_time_giorni": 21,
            "data_consegna_prevista": data_cons,
            "bom_esplosa": 1 if stato in ("completato","spedito") else 0,
        }
        if "tipo_impianto" in cols_ordini:
            fields["tipo_impianto"] = "oleodinamica" if "oleo" in nota.lower() else "fune"
        if "note" in cols_ordini:
            fields["note"] = nota
        if "created_at" in cols_ordini:
            fields["created_at"] = datetime.now().isoformat()
        if "updated_at" in cols_ordini:
            fields["updated_at"] = datetime.now().isoformat()

        keys = list(fields.keys())
        vals = list(fields.values())
        cur.execute(
            f"INSERT INTO ordini ({','.join(keys)}) VALUES ({','.join(['?']*len(keys))})",
            vals
        )
        oid = cur.lastrowid

        # Storico stati
        cur.execute("""
            CREATE TABLE IF NOT EXISTS ordini_storico_stato (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ordine_id INTEGER NOT NULL,
                stato_precedente TEXT,
                stato_nuovo TEXT NOT NULL,
                motivo TEXT,
                utente TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        cur.execute("""
            INSERT INTO ordini_storico_stato (ordine_id, stato_precedente, stato_nuovo, motivo, utente)
            VALUES (?,NULL,'confermato','Conferma preventivo','admin')
        """, (oid,))
        if stato == "in_produzione":
            cur.execute("""
                INSERT INTO ordini_storico_stato (ordine_id, stato_precedente, stato_nuovo, motivo, utente)
                VALUES (?,'confermato','in_produzione','BOM esplosa — avvio produzione','admin')
            """, (oid,))
        if stato == "completato":
            cur.execute("""
                INSERT INTO ordini_storico_stato (ordine_id, stato_precedente, stato_nuovo, motivo, utente)
                VALUES (?,'confermato','in_produzione','Avvio produzione','admin')
            """, (oid,))
            cur.execute("""
                INSERT INTO ordini_storico_stato (ordine_id, stato_precedente, stato_nuovo, motivo, utente)
                VALUES (?,'in_produzione','completato','Collaudo superato','admin')
            """, (oid,))

        print(f"   Ordine {num}: creato (stato={stato})")

    conn.commit()

conn.close()

print(f"""
{'='*60}
  Setup completato con successo.

  CHECKLIST FINALE (fai prima della demo):
  ─────────────────────────────────────────
  □ Copia variabili_derivate.py nella cartella backend/
  □ Copia TUBO_CENTRALINA_OLEO.json nella cartella rules/
  □ Copia CAVO_QUADRO_ELETTRICO.json nella cartella rules/
  □ Applica le 3 patch a rule_engine.py (PATCH_RULE_ENGINE.txt)
  □ Riavvia il backend

  VERIFICHE:
  □ DEMO-OLEO-B → Materiali: TUBO-IDRA-6M × 1
  □ DEMO-OLEO-D → Materiali: TUBO-IDRA-9M × 1
  □ DEMO-FUNE-B → Materiali: CAVO-PIATTO-ML × 6.0
  □ DEMO-FUNE-D → Materiali: CAVO-PIATTO-ML × 8.0
  □ DEMO-FUNE   → Materiali: nessun cavo
  □ Ricerca Ordini → 3 ordini demo visibili

{'='*60}
""")
