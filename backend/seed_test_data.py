"""
seed_test_data.py — Adattato alla struttura reale del DB
Uso:
  cd C:\\Users\\david\\Desktop\\Python\\ConfiguratoreEQ\\4.0\\backend
  venv\\Scripts\\python.exe seed_test_data.py elettroquadri_demo.db
"""

import sqlite3, sys, os
from datetime import datetime, date, timedelta

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "./elettroquadri_demo.db"
if not os.path.exists(DB_PATH):
    print(f"[ERRORE] DB non trovato: {DB_PATH}"); sys.exit(1)

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
cur = conn.cursor()
now  = datetime.now().isoformat()
oggi = date.today()
anno = oggi.year

def d(n):  return (oggi + timedelta(days=n)).isoformat()
def dp(n): return (oggi - timedelta(days=n)).isoformat()
def exists(t, c, v):
    cur.execute(f"SELECT 1 FROM {t} WHERE {c}=?", (v,)); return cur.fetchone() is not None

print(f"\n{'='*60}\n  Seed dati — ConfiguratoreEQ\n  {datetime.now().strftime('%d/%m/%Y %H:%M')}\n{'='*60}\n")


# ── 1. FORNITORI ─────────────────────────────────────────────────────────────
print("[1/7] Fornitori...")
fornitori_dati = [
    ("SCHNEIDER ELECTRIC SPA", "F001", "IT12345678901"),
    ("ABB SPA",                "F002", "IT09876543211"),
    ("LEGRAND SPA",            "F003", "IT05544332211"),
    ("PRYSMIAN SPA",           "F004", "IT07766554433"),
    ("SEMATIC SPA",            "F005", "IT03322114455"),
    ("FINDER SRL",             "F006", "IT08877665544"),
    ("WEIDMULLER SRL",         "F007", "IT06655443322"),
    ("SIEMENS SPA",            "F008", "IT04433221100"),
    ("RITTAL SRL",             "F009", "IT01122334455"),
]
fornitore_ids = {}
for rs, cod, piva in fornitori_dati:
    if not exists("fornitori", "codice", cod):
        cur.execute("INSERT INTO fornitori (ragione_sociale,codice,partita_iva,created_at,updated_at) VALUES (?,?,?,?,?)",
                    (rs, cod, piva, now, now))
        fid = cur.lastrowid; print(f"  ✅ {rs}")
    else:
        cur.execute("SELECT id FROM fornitori WHERE codice=?", (cod,)); fid = cur.fetchone()[0]; print(f"  ⏭  {rs}")
    fornitore_ids[rs] = fid
conn.commit()


# ── 2. ARTICOLI ──────────────────────────────────────────────────────────────
print("\n[2/7] Articoli...")
articoli_dati = [
    ("EQ-CONT-001","Contattore 25A",                 "SCHNEIDER ELECTRIC SPA",14,10,25, 12.50),
    ("EQ-CONT-002","Contattore 40A",                 "SCHNEIDER ELECTRIC SPA",14, 8,15, 18.90),
    ("EQ-RELE-001","Relè termico 10-16A",            "ABB SPA",               10,10,30,  8.70),
    ("EQ-RELE-002","Relè termico 16-25A",            "ABB SPA",               10, 8,20, 10.20),
    ("EQ-INT-001", "Interruttore magnetotermico 16A","LEGRAND SPA",            7,15,40,  6.80),
    ("EQ-INT-002", "Interruttore magnetotermico 25A","LEGRAND SPA",            7,12,18,  9.40),
    ("EQ-INT-003", "Interruttore differenziale 25A", "LEGRAND SPA",            7,10,12, 22.00),
    ("EQ-TRAS-001","Trasformatore 230/24V 50VA",     "FINDER SRL",            21, 5, 8, 35.00),
    ("EQ-TRAS-002","Trasformatore 230/24V 100VA",    "FINDER SRL",            21, 4, 5, 52.00),
    ("EQ-CAVO-001","Cavo H07RN-F 3x2.5 (metro)",    "PRYSMIAN SPA",           5,100,45, 2.10),
    ("EQ-CAVO-002","Cavo schermato 4x1 (metro)",     "PRYSMIAN SPA",           5,50,80,  3.40),
    ("EQ-MORS-001","Morsetto 4mm2 (pz)",             "WEIDMULLER SRL",        10,200,150,0.45),
    ("EQ-MORS-002","Morsetto 6mm2 (pz)",             "WEIDMULLER SRL",        10,100,60, 0.70),
    ("EQ-BOARD-001","Scheda CPU ascensore",          "SEMATIC SPA",           30, 3, 4,280.00),
    ("EQ-BOARD-002","Scheda I/O espansione",         "SEMATIC SPA",           30, 3, 2,145.00),
    ("EQ-PLC-001", "PLC Siemens S7-1200",            "SIEMENS SPA",           21, 2, 3,420.00),
    ("EQ-FUSIB-001","Portafusibile 10x38",           "FINDER SRL",             7,50,90,  1.20),
    ("EQ-DIN-001", "Guida DIN 35mm (metro)",         "LEGRAND SPA",            5,20,35,  1.80),
    ("EQ-CANA-001","Canalina 40x40 (metro)",         "LEGRAND SPA",            5,30,55,  2.50),
    ("EQ-QUAD-001","Quadro metallico 600x800x250",   "RITTAL SRL",            14, 2, 3,185.00),
]
articolo_ids = {}
for codice, desc, forn, lead, scorta, giacenza, costo in articoli_dati:
    forn_id = fornitore_ids.get(forn)
    if not exists("articoli", "codice", codice):
        cur.execute("""INSERT INTO articoli (codice,descrizione,fornitore,fornitore_id,lead_time_giorni,
                       scorta_minima,giacenza,costo_fisso,unita_misura,is_active,created_at,updated_at)
                       VALUES (?,?,?,?,?,?,?,?,'pz',1,?,?)""",
                    (codice,desc,forn,forn_id,lead,scorta,giacenza,costo,now,now))
        aid = cur.lastrowid; print(f"  ✅ {codice}")
    else:
        cur.execute("SELECT id FROM articoli WHERE codice=?", (codice,)); aid = cur.fetchone()[0]
        cur.execute("UPDATE articoli SET giacenza=?,scorta_minima=?,lead_time_giorni=? WHERE id=?",
                    (giacenza,scorta,lead,aid)); print(f"  ⏭  {codice} (aggiornato)")
    articolo_ids[codice] = aid
conn.commit()


# ── 3. PREVENTIVI E ORDINI ───────────────────────────────────────────────────
print("\n[3/7] Preventivi e Ordini...")
cur.execute("SELECT id,ragione_sociale FROM clienti"); clienti_db = {r["ragione_sociale"]:r["id"] for r in cur.fetchall()}
clienti_list = list(clienti_db.items())

def cli(i): return clienti_list[i % len(clienti_list)] if clienti_list else ("", None)

cur.execute("SELECT MAX(CAST(SUBSTR(numero_preventivo,INSTR(numero_preventivo,'/')+1) AS INTEGER)) FROM preventivi WHERE numero_preventivo LIKE ?", (f"{anno}/%",))
max_prev = cur.fetchone()[0] or 0
cur.execute("SELECT MAX(CAST(SUBSTR(numero_ordine,10) AS INTEGER)) FROM ordini WHERE numero_ordine LIKE ?", (f"ORD-{anno}-%",))
max_ord = cur.fetchone()[0] or 0

scenari = [
    ("in_produzione", 15, 4800, 0),
    ("in_produzione",  8, 6200, 1),
    ("in_produzione", 20, 3900, 2),
    ("completato",    -5, 5100, 3),
    ("spedito",      -10, 4400, 4),
    ("confermato",    30, 7200, 0),
    ("confermato",    45, 3300, 1),
    ("in_produzione", -3, 5800, 2),  # in ritardo
]
prev_ids = []; ord_ids = []
for i, (stato_ord, cons_delta, prezzo, cli_idx) in enumerate(scenari):
    max_prev += 1; max_ord += 1
    nprev = f"{anno}/{max_prev:04d}"; nord = f"ORD-{anno}-{max_ord:04d}"
    cname, cid = cli(cli_idx)
    if not exists("preventivi","numero_preventivo",nprev):
        cur.execute("INSERT INTO preventivi (numero_preventivo,tipo_preventivo,status,cliente_id,customer_name,total_price,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
                    (nprev,"fune","confirmed",cid,cname,prezzo,dp(60-i*5),now))
        prev_id = cur.lastrowid
        cur.execute("INSERT OR IGNORE INTO dati_commessa (preventivo_id,data_offerta,consegna_richiesta,prezzo_unitario,quantita) VALUES (?,?,?,?,?)",
                    (prev_id,dp(60-i*5),d(cons_delta),prezzo,1))
        print(f"  ✅ {nprev} — {cname}")
    else:
        cur.execute("SELECT id FROM preventivi WHERE numero_preventivo=?", (nprev,)); prev_id = cur.fetchone()[0]; print(f"  ⏭  {nprev}")
    prev_ids.append(prev_id)
    if not exists("ordini","numero_ordine",nord):
        cur.execute("INSERT INTO ordini (numero_ordine,preventivo_id,cliente_id,stato,data_consegna_prevista,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
                    (nord,prev_id,cid,stato_ord,d(cons_delta),dp(60-i*5),now))
        ord_id = cur.lastrowid
        cur.execute("UPDATE preventivi SET ordine_id=? WHERE id=?", (ord_id,prev_id))
        print(f"     ✅ {nord} stato={stato_ord}")
    else:
        cur.execute("SELECT id FROM ordini WHERE numero_ordine=?", (nord,)); ord_id = cur.fetchone()[0]; print(f"     ⏭  {nord}")
    ord_ids.append(ord_id)
conn.commit()


# ── 4. MATERIALI BOM ─────────────────────────────────────────────────────────
print("\n[4/7] Materiali BOM...")
bom = [("EQ-CONT-001",2,12.50),("EQ-CONT-002",1,18.90),("EQ-RELE-001",2,8.70),
       ("EQ-INT-001",3,6.80),("EQ-INT-002",1,9.40),("EQ-INT-003",1,22.00),
       ("EQ-TRAS-001",1,35.00),("EQ-CAVO-001",15,2.10),("EQ-CAVO-002",8,3.40),
       ("EQ-MORS-001",40,0.45),("EQ-FUSIB-001",6,1.20),("EQ-DIN-001",2,1.80),
       ("EQ-CANA-001",3,2.50),("EQ-QUAD-001",1,185.00)]
for prev_id in prev_ids:
    cur.execute("SELECT COUNT(*) FROM materiali WHERE preventivo_id=?", (prev_id,))
    if cur.fetchone()[0] > 0: print(f"  ⏭  BOM prev_id={prev_id}"); continue
    for codice, qty, prezzo in bom:
        cur.execute("SELECT descrizione FROM articoli WHERE codice=?", (codice,))
        row = cur.fetchone(); desc = row[0] if row else codice
        cur.execute("INSERT INTO materiali (preventivo_id,codice,descrizione,quantita,prezzo_unitario,prezzo_totale,aggiunto_da_regola,unita_misura) VALUES (?,?,?,?,?,?,0,'pz')",
                    (prev_id,codice,desc,qty,prezzo,round(qty*prezzo,2)))
    print(f"  ✅ BOM inserita per prev_id={prev_id}")
conn.commit()


# ── 5. ORDINI DI ACQUISTO ────────────────────────────────────────────────────
print("\n[5/7] Ordini di Acquisto...")
cur.execute("SELECT MAX(CAST(SUBSTR(numero_oda,10) AS INTEGER)) FROM ordini_acquisto WHERE anno=?", (anno,))
max_oda = cur.fetchone()[0] or 0

oda_scenari = [
    ("SCHNEIDER ELECTRIC SPA","ricevuto",             45,10, [("EQ-CONT-001",20,12.50),("EQ-CONT-002",10,18.90)]),
    ("ABB SPA",               "ricevuto",             40, 8, [("EQ-RELE-001",20,8.70),("EQ-RELE-002",15,10.20)]),
    ("LEGRAND SPA",           "inviato",              20,-5, [("EQ-INT-001",30,6.80),("EQ-INT-002",20,9.40),("EQ-INT-003",15,22.00)]),
    ("PRYSMIAN SPA",          "inviato",              15,-3, [("EQ-CAVO-001",100,2.10),("EQ-CAVO-002",50,3.40)]),
    ("SEMATIC SPA",           "inviato",              10, 2, [("EQ-BOARD-001",5,280.00),("EQ-BOARD-002",5,145.00)]),  # scaduto
    ("FINDER SRL",            "bozza",                 3,-20,[("EQ-TRAS-001",8,35.00),("EQ-TRAS-002",4,52.00),("EQ-FUSIB-001",50,1.20)]),
    ("WEIDMULLER SRL",        "inviato",               8,-7, [("EQ-MORS-001",300,0.45),("EQ-MORS-002",150,0.70)]),
    ("SIEMENS SPA",           "bozza",                 1,-30,[("EQ-PLC-001",3,420.00)]),
    ("RITTAL SRL",            "parzialmente_ricevuto",25, 5, [("EQ-QUAD-001",6,185.00)]),
    ("LEGRAND SPA",           "inviato",               5,-12,[("EQ-DIN-001",20,1.80),("EQ-CANA-001",30,2.50)]),
]
for forn_nome, stato, d_em, d_cons_rel, righe in oda_scenari:
    max_oda += 1; numero_oda = f"ODA-{anno}-{max_oda:04d}"
    if exists("ordini_acquisto","numero_oda",numero_oda): print(f"  ⏭  {numero_oda}"); continue
    forn_id = fornitore_ids.get(forn_nome)
    imponibile = sum(q*p for _,q,p in righe)
    iva = round(imponibile*0.22,2); totale = round(imponibile+iva,2)
    cur.execute("""INSERT INTO ordini_acquisto
        (numero_oda,anno,stato,fornitore_id,fornitore_denominazione,
         data_emissione,data_consegna_richiesta,
         imponibile_totale,iva_totale,totale_oda,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (numero_oda,anno,stato,forn_id,forn_nome,
         dp(d_em), d(-d_cons_rel),
         round(imponibile,2),iva,totale,now,now))
    oda_id = cur.lastrowid
    for n, (codice,qty,prezzo) in enumerate(righe,1):
        cur.execute("SELECT id,descrizione FROM articoli WHERE codice=?", (codice,))
        row = cur.fetchone(); aid = row[0] if row else None; desc = row[1] if row else codice
        cur.execute("""INSERT INTO ordini_acquisto_righe
            (oda_id,numero_riga,codice_articolo,descrizione,articolo_id,
             quantita_ordinata,quantita_ricevuta,prezzo_unitario,prezzo_totale,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (oda_id,n,codice,desc,aid,qty,qty if stato=="ricevuto" else 0,prezzo,round(qty*prezzo,2),now,now))
    print(f"  ✅ {numero_oda} — {forn_nome} — {stato} — €{totale:.0f}")
conn.commit()


# ── 6. TICKET ────────────────────────────────────────────────────────────────
print("\n[6/7] Ticket...")
cur.execute("SELECT id,username FROM utenti"); utenti_db = {r["username"]:r["id"] for r in cur.fetchall()}
admin_id = utenti_db.get("admin",1); utente_id = utenti_db.get("utente",2); vendite_id = utenti_db.get("vendite",3)
cur.execute("SELECT MAX(CAST(SUBSTR(numero_ticket,5) AS INTEGER)) FROM tickets WHERE numero_ticket LIKE 'TKT-%'")
max_tkt = cur.fetchone()[0] or 0
cur.execute("SELECT id,nome FROM categorie_ticket"); cat_db = {r["nome"]:r["id"] for r in cur.fetchall()}
cg=cat_db.get("Guasto",5); cm=cat_db.get("Manutenzione",6); cr=cat_db.get("Richiesta tecnica",7)
cc=cat_db.get("Collaudo",3); ck=cat_db.get("Ricambi",8)
cur.execute("SELECT id FROM ordini WHERE stato='in_produzione' LIMIT 3")
op=[r[0] for r in cur.fetchall()]
oa=op[0] if op else None; ob=op[1] if len(op)>1 else None; oc=op[2] if len(op)>2 else None

tkt_data=[
    ("Quadro non risponde al piano 3",       "aperto",        "urgente",cg,oa,admin_id,  2, 45),
    ("Rumore anomalo apertura porte",        "in_lavorazione","alta",   cg,ob,utente_id, 5, 90),
    ("Aggiornamento firmware scheda CPU",    "aperto",        "normale",cr,oc,utente_id, 1,  0),
    ("Verifica conformita EN81-20",          "chiuso",        "normale",cm,oa,vendite_id,30,180),
    ("Sostituzione contattore K1",           "chiuso",        "urgente",cg,ob,admin_id, 15,120),
    ("Calibrazione sensori di livello",      "in_lavorazione","alta",   ck,oc,utente_id, 3, 60),
    ("Mancanza fase L2 quadro principale",   "aperto",        "urgente",cg,oa,admin_id,  1, 30),
    ("Revisione annuale impianto",           "aperto",        "bassa",  cm,ob,utente_id, 7,  0),
    ("Errore E05 su display operatore",      "in_lavorazione","alta",   cg,oc,admin_id,  4, 75),
    ("Richiesta schema elettrico aggiornato","chiuso",        "bassa",  cr,None,vendite_id,20,30),
    ("Blocco emergenza intermittente",       "aperto",        "urgente",cg,oa,admin_id,  0, 15),
    ("Collaudo post installazione",          "chiuso",        "normale",cc,ob,utente_id,25,240),
]
tkt_count=0
for titolo,stato,priorita,cat_id,ord_id,ass_id,giorni_fa,minuti in tkt_data:
    max_tkt+=1; numero=f"TKT-{max_tkt:04d}"
    if exists("tickets","numero_ticket",numero): print(f"  ⏭  {numero}"); continue
    created=(oggi-timedelta(days=giorni_fa)).isoformat()
    scadenza=d(3) if priorita=="urgente" else None
    rat=now if stato=="chiuso" else None; cat_at=now if stato=="chiuso" else None
    cur.execute("""INSERT INTO tickets
        (numero_ticket,tipo,titolo,stato,priorita,categoria_id,
         ordine_id,assegnato_a,creato_da,scadenza,risolto_at,chiuso_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (numero,"esterno",titolo,stato,priorita,cat_id,ord_id,ass_id,admin_id,scadenza,rat,cat_at,created,now))
    tid=cur.lastrowid
    if minuti>0:
        st=(oggi-timedelta(days=giorni_fa,hours=2)).isoformat()
        en=(oggi-timedelta(days=giorni_fa,hours=2)+timedelta(minutes=minuti)).isoformat()
        cur.execute("INSERT INTO ticket_sessioni_lavoro (ticket_id,utente_id,inizio,fine,durata_minuti,fatturabile,created_at) VALUES (?,?,?,?,?,1,?)",
                    (tid,ass_id,st,en,int(minuti),now))
    tkt_count+=1; print(f"  ✅ {numero} [{priorita}] {titolo[:45]}")
conn.commit()


# ── 7. FATTURE ───────────────────────────────────────────────────────────────
print("\n[7/7] Fatture (fe_fatture)...")
cur.execute("SELECT COUNT(*) FROM fe_fatture WHERE direzione='attiva' AND anno=?", (anno,))
if cur.fetchone()[0]>0:
    print("  ⏭  Fatture attive già presenti")
else:
    cur.execute("SELECT MAX(CAST(SUBSTR(numero_fattura,4) AS INTEGER)) FROM fe_fatture WHERE anno=? AND direzione='attiva'",(anno,))
    max_f=cur.fetchone()[0] or 0
    fatt_data=[
        (0,4800, 5,"consegnata", 0),
        (1,12400,4,"consegnata", 0),
        (2,3900, 4,"consegnata", 0),
        (3,5100, 3,"consegnata", 0),
        (4,13200,3,"consegnata", 0),
        (0,6200, 2,"bozza",      30),
        (1,4400, 2,"bozza",      45),
        (2,7800, 1,"bozza",      30),
        (0,3300, 1,"bozza",      60),
        (1,5100, 0,"bozza",      30),
        (2,9200, 0,"bozza",      30),
        (3,4200, 2,"bozza",     -15),  # scaduta
        (4,3600, 3,"bozza",     -30),  # scaduta
    ]
    for cli_idx,importo,mesi_fa,stato_sdi,scad_delta in fatt_data:
        max_f+=1; numero=f"FT-{max_f:04d}"
        cname,cid=(clienti_list[cli_idx%len(clienti_list)] if clienti_list else ("",None))
        data_f=(oggi-timedelta(days=mesi_fa*30)).isoformat()
        data_s=(oggi+timedelta(days=scad_delta)).isoformat() if scad_delta!=0 else None
        iva=round(importo*0.22,2); tot=importo+iva
        cur.execute("""INSERT INTO fe_fatture
            (direzione,tipo_documento,numero_fattura,anno,cliente_id,dest_denominazione,
             data_fattura,data_scadenza,imponibile_totale,iva_totale,totale_fattura,stato_sdi,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            ("attiva","TD01",numero,anno,cid,cname,data_f,data_s,float(importo),iva,float(tot),stato_sdi,now,now))
        print(f"  ✅ {numero} — {cname[:25]} — €{tot:.0f} — {stato_sdi}")
    conn.commit()

conn.close()
print(f"\n{'='*60}\n  SEED COMPLETATO\n{'='*60}")
print(f"""
Dati inseriti:
  • {len(fornitori_dati)} fornitori
  • {len(articoli_dati)} articoli (giacenze + scorte minime)
  • 8 preventivi/ordini in vari stati
  • BOM materiali su ogni commessa
  • 10 ODA (alcuni scaduti, ricevuti, bozza)
  • {tkt_count} ticket (urgenti, in lavorazione, chiusi + sessioni lavoro)
  • 13 fatture (2 scadute → alert dashboard)
""")
