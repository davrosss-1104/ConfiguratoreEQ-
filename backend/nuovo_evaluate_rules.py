"""
SOSTITUZIONE evaluate_rules in main.py
=======================================
Sostituisci le righe 141-151 (da "def evaluate_rules" fino a 
"return engine.evaluate_rules(preventivo)") con TUTTO il codice sotto.

Questo ricollega:
  - load_rules() → legge i 32 file JSON da ./rules/
  - evaluate_condition() → valuta condizioni (già presente in main.py)
  - build_config_context() → NUOVO, legge da TUTTE le sezioni ORM + valori_configurazione
"""


def build_config_context(preventivo_id: int, db: Session) -> dict:
    """
    Costruisce il contesto COMPLETO per la valutazione regole,
    leggendo da TUTTE le fonti dati del preventivo.
    
    Fonti (in ordine di priorità, le ultime sovrascrivono):
      1. preventivo.configurazione (campo JSON generico)
      2. dati_principali (tabella ORM)
      3. normative (tabella ORM)
      4. argano (query diretta)
      5. porte (query diretta)
      6. disposizione_vano (query diretta)
      7. valori_configurazione (tabella chiave/valore per campi dinamici)
    """
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        return {}
    
    config_data = {}
    
    # 1. Campo JSON generico del preventivo (base, bassa priorità)
    if preventivo.configurazione and isinstance(preventivo.configurazione, dict):
        for k, v in preventivo.configurazione.items():
            if isinstance(v, dict):
                # Sezione annidata: appiattisci
                for kk, vv in v.items():
                    config_data[kk] = vv
            else:
                config_data[k] = v
    
    # 2. Dati principali
    if preventivo.dati_principali:
        dp = preventivo.dati_principali
        config_data.update({
            "tipo_impianto": dp.tipo_impianto,
            "nuovo_impianto": dp.nuovo_impianto,
            "numero_fermate": dp.numero_fermate,
            "numero_servizi": dp.numero_servizi,
            "velocita": dp.velocita,
            "corsa": dp.corsa,
            "con_locale_macchina": dp.con_locale_macchina,
            "posizione_locale_macchina": dp.posizione_locale_macchina,
            "tipo_trazione": dp.tipo_trazione,
            "forza_motrice": dp.forza_motrice,
            "luce": dp.luce,
            "tensione_manovra": dp.tensione_manovra,
            "tensione_freno": dp.tensione_freno,
        })
    
    # 3. Normative
    if preventivo.normative:
        norm = preventivo.normative
        config_data.update({
            "en_81_1": norm.en_81_1,
            "en_81_20": norm.en_81_20,
            "en_81_21": norm.en_81_21,
            "en_81_28": norm.en_81_28,
            "en_81_70": norm.en_81_70,
            "en_81_72": norm.en_81_72,
            "en_81_73": norm.en_81_73,
            "a3_95_16": norm.a3_95_16,
            "dm236_legge13": norm.dm236_legge13,
            "emendamento_a3": norm.emendamento_a3,
            "uni_10411_1": norm.uni_10411_1,
        })
    
    # 4. Argano (non ha relazione ORM, query diretta)
    try:
        argano = db.query(Argano).filter(Argano.preventivo_id == preventivo_id).first()
        if argano:
            config_data.update({
                "trazione": argano.trazione,
                "potenza_motore_kw": argano.potenza_motore_kw,
                "corrente_nom_motore_amp": argano.corrente_nom_motore_amp,
                "tipo_vvvf": argano.tipo_vvvf,
                "vvvf_nel_vano": argano.vvvf_nel_vano,
                "freno_tensione": argano.freno_tensione,
                "ventilazione_forzata": argano.ventilazione_forzata,
                "tipo_teleruttore": argano.tipo_teleruttore,
            })
    except Exception:
        pass
    
    # 5. Porte (query diretta, leggi tutti gli attributi)
    try:
        porte = db.query(Porte).filter(Porte.preventivo_id == preventivo_id).first()
        if porte:
            skip = {'id', 'preventivo_id', 'preventivo', 'metadata', 'registry',
                    '_sa_instance_state', '_sa_class_manager'}
            for col in porte.__table__.columns:
                if col.name not in ('id', 'preventivo_id'):
                    val = getattr(porte, col.name, None)
                    if val is not None:
                        config_data[col.name] = val
    except Exception:
        pass
    
    # 6. Disposizione vano (query diretta)
    try:
        dv = db.query(DisposizioneVano).filter(
            DisposizioneVano.preventivo_id == preventivo_id
        ).first()
        if dv:
            for col in dv.__table__.columns:
                if col.name not in ('id', 'preventivo_id'):
                    val = getattr(dv, col.name, None)
                    if val is not None:
                        config_data[col.name] = val
    except Exception:
        pass
    
    # 7. Valori configurazione (tabella chiave/valore, massima priorità)
    try:
        result = db.execute(
            text("SELECT codice_campo, valore FROM valori_configurazione WHERE preventivo_id = :pid"),
            {"pid": preventivo_id}
        )
        for row in result.fetchall():
            campo, valore = row[0], row[1]
            if campo and valore is not None:
                config_data[campo] = valore
    except Exception:
        pass  # Tabella potrebbe non esistere
    
    # Pulizia: rimuovi None
    config_data = {k: v for k, v in config_data.items() if v is not None}
    
    return config_data


def evaluate_rules(preventivo_id: int, db: Session):
    """
    Valuta le regole JSON per un preventivo.
    
    1. Costruisce contesto da TUTTE le sezioni (ORM + valori_configurazione + JSON)
    2. Carica regole da file JSON (./rules/)
    3. Per ogni regola: valuta condizioni → se tutte OK → aggiunge materiali
    4. Rimuove materiali orfani (regole non più attive)
    
    Returns: dict con risultato valutazione
    """
    db.expire_all()
    
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        return {"error": "Preventivo non trovato"}
    
    # 1. Costruisci contesto completo
    config_data = build_config_context(preventivo_id, db)
    
    # 2. Carica regole da file JSON
    rules = load_rules()
    
    if not rules:
        return {
            "status": "warning",
            "message": "Nessuna regola trovata in ./rules/",
            "materiali_aggiunti": 0,
            "materiali_rimossi": 0,
            "regole_attive": [],
            "context_keys": list(config_data.keys())
        }
    
    # 3. Valuta regole
    active_rules = set()
    materials_to_add = []
    
    for rule in rules:
        if not rule.get("enabled", True):
            continue
        
        rule_id = rule.get("id", "unknown")
        conditions = rule.get("conditions", [])
        
        # Valuta tutte le condizioni (AND implicito)
        all_met = True
        for condition in conditions:
            if not evaluate_condition(condition, config_data):
                all_met = False
                break
        
        if all_met and conditions:
            active_rules.add(rule_id)
            for material in rule.get("materials", []):
                materials_to_add.append({
                    "rule_id": rule_id,
                    "codice": material.get("codice"),
                    "descrizione": material.get("descrizione"),
                    "quantita": material.get("quantita", 1),
                    "prezzo_unitario": material.get("prezzo_unitario", 0.0),
                    "categoria": material.get("categoria", "Materiale Automatico"),
                    "note": material.get("note", ""),
                })
    
    # 4. Rimozione orfani: materiali da regole non più attive
    materiali_rimossi = 0
    existing_auto = db.query(Materiale).filter(
        Materiale.preventivo_id == preventivo_id,
        Materiale.aggiunto_da_regola == True
    ).all()
    
    for mat in existing_auto:
        if mat.regola_id and mat.regola_id not in active_rules:
            db.delete(mat)
            materiali_rimossi += 1
    
    # 5. Aggiungi nuovi materiali (evita duplicati)
    materiali_aggiunti = 0
    for mat_data in materials_to_add:
        existing = db.query(Materiale).filter(
            Materiale.preventivo_id == preventivo_id,
            Materiale.codice == mat_data["codice"],
            Materiale.regola_id == mat_data["rule_id"]
        ).first()
        
        if not existing:
            qta = mat_data["quantita"]
            prezzo = mat_data["prezzo_unitario"]
            nuovo = Materiale(
                preventivo_id=preventivo_id,
                codice=mat_data["codice"],
                descrizione=mat_data["descrizione"],
                quantita=qta,
                prezzo_unitario=prezzo,
                prezzo_totale=qta * prezzo,
                categoria=mat_data["categoria"],
                aggiunto_da_regola=True,
                regola_id=mat_data["rule_id"],
                note=mat_data.get("note", ""),
            )
            db.add(nuovo)
            materiali_aggiunti += 1
    
    # 6. Ricalcola totale preventivo
    if materiali_aggiunti > 0 or materiali_rimossi > 0:
        db.commit()
        tutti_materiali = db.query(Materiale).filter(
            Materiale.preventivo_id == preventivo_id
        ).all()
        preventivo.totale_materiali = sum(m.prezzo_totale or 0 for m in tutti_materiali)
        db.commit()
    
    return {
        "status": "ok",
        "materiali_aggiunti": materiali_aggiunti,
        "materiali_rimossi": materiali_rimossi,
        "regole_attive": list(active_rules),
        "regole_totali": len(rules),
        "context_keys": list(config_data.keys()),
    }


# ============================================================
# AGGIORNAMENTO ENDPOINT rule-context (righe 2043-2056 di main.py)
# ============================================================
# Sostituisci l'endpoint get_rule_context con questo:

"""
@app.get("/preventivi/{preventivo_id}/rule-context")
def get_rule_context(preventivo_id: int, db: Session = Depends(get_db)):
    \"\"\"Debug: mostra il contesto completo che il rule engine usa per valutare.\"\"\"
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    context = build_config_context(preventivo_id, db)
    rules = load_rules()
    
    # Mostra anche quali regole matcherebbero
    matching = []
    for rule in rules:
        if not rule.get("enabled", True):
            continue
        conditions = rule.get("conditions", [])
        all_met = all(evaluate_condition(c, context) for c in conditions) if conditions else False
        matching.append({
            "id": rule.get("id"),
            "name": rule.get("name"),
            "match": all_met,
            "conditions_detail": [
                {
                    "field": c.get("field"),
                    "operator": c.get("operator"),
                    "expected": c.get("value"),
                    "actual": context.get(c.get("field")),
                    "result": evaluate_condition(c, context)
                }
                for c in conditions
            ]
        })
    
    return {
        "preventivo_id": preventivo_id,
        "context": context,
        "context_keys_count": len(context),
        "rules_total": len(rules),
        "rules_matching": sum(1 for r in matching if r["match"]),
        "rules_detail": matching
    }
"""
