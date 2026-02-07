from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
import json
import os

from database import engine, SessionLocal
from models import Base, Preventivo, DatiCommessa, DatiPrincipali, Normative, DisposizioneVano, Porte, Materiale, ProductTemplate
from schemas import (
    PreventivoCreate, PreventivoUpdate, Preventivo as PreventivoSchema,
    DatiCommessaCreate, DatiCommessaUpdate, DatiCommessa as DatiCommessaSchema,
    DatiPrincipaliCreate, DatiPrincipaliUpdate, DatiPrincipali as DatiPrincipaliSchema,
    NormativeCreate, NormativeUpdate, Normative as NormativeSchema,
    DisposizioneVanoCreate, DisposizioneVanoUpdate, DisposizioneVano as DisposizioneVanoSchema,
    PorteCreate, PorteUpdate, Porte as PorteSchema,
    MaterialeCreate, MaterialeUpdate, Materiale as MaterialeSchema,
    ProductTemplateCreate, ProductTemplateUpdate, ProductTemplate as ProductTemplateSchema
)

# Crea tabelle
Base.metadata.create_all(bind=engine)

# FastAPI app
app = FastAPI(title="Configuratore Elettroquadri API", version="0.10.0")

# ==========================================
# CORS CONFIGURATION
# ==========================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# DEPENDENCY
# ==========================================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==========================================
# RULE ENGINE - VERSIONE MIGLIORATA
# ==========================================
def load_rules():
    """Carica le regole dai file JSON nella directory rules/"""
    rules = []
    rules_dir = "./rules"
    
    if not os.path.exists(rules_dir):
        print("âš ï¸ Directory rules/ non trovata")
        return rules
    
    for filename in os.listdir(rules_dir):
        if filename.endswith(".json"):
            try:
                with open(os.path.join(rules_dir, filename), "r", encoding="utf-8") as f:
                    rule = json.load(f)
                    rules.append(rule)
                    print(f"âœ… Regola caricata: {filename}")
            except Exception as e:
                print(f"âŒ Errore caricamento {filename}: {e}")
    
    print(f"ðŸ“‹ Caricate {len(rules)} regole")
    return rules

def evaluate_condition(condition: dict, config_data: dict) -> bool:
    """
    Valuta una singola condizione con gestione robusta di NULL/None
    
    IMPORTANTE: Restituisce False se:
    - Il campo richiesto non esiste nella configurazione
    - Il campo ha valore None/NULL
    - Il campo ha valore vuoto per stringhe
    
    Questo previene attivazioni spurie di regole quando i dati non sono stati inseriti.
    """
    # PROTEZIONE: Se condition Ã¨ stringa invece di dict, salta
    if isinstance(condition, str):
        print(f"âš ï¸ Condizione formato stringa ignorata: {condition}")
        return False
    
    field = condition.get("field")
    operator = condition.get("operator")
    expected_value = condition.get("value")
    
    # CONTROLLO CRITICO: Il campo esiste nella configurazione?
    if field not in config_data:
        print(f"âŒ Campo '{field}' non trovato nella configurazione")
        return False
    
    config_value = config_data.get(field)
    
    # CONTROLLO CRITICO: Il valore Ã¨ NULL/None/vuoto?
    if config_value is None:
        print(f"âŒ Campo '{field}' Ã¨ NULL - condizione non soddisfatta")
        return False
    
    # CONTROLLO: Stringa vuota
    if isinstance(config_value, str) and config_value.strip() == "":
        print(f"âŒ Campo '{field}' Ã¨ stringa vuota - condizione non soddisfatta")
        return False
    
    # Stampa confronto per debug
    print(f"ðŸ” Confronto: {field} ({config_value} [{type(config_value).__name__}]) {operator} {expected_value} [{type(expected_value).__name__}]")
    
    # Gestisci operatori
    result = False
    
    if operator == "equals":
        result = config_value == expected_value
    
    elif operator == "not_equals":
        result = config_value != expected_value
    
    elif operator == "contains":
        result = expected_value in str(config_value) if config_value else False
    
    elif operator == "greater_than":
        try:
            result = float(config_value) > float(expected_value)
        except (ValueError, TypeError):
            print(f"âš ï¸ Impossibile confrontare '{config_value}' > '{expected_value}'")
            result = False
    
    elif operator == "less_than":
        try:
            result = float(config_value) < float(expected_value)
        except (ValueError, TypeError):
            print(f"âš ï¸ Impossibile confrontare '{config_value}' < '{expected_value}'")
            result = False
    
    elif operator == "in":
        if isinstance(expected_value, list):
            result = config_value in expected_value
        else:
            print(f"âš ï¸ Operatore 'in' richiede una lista, ricevuto: {type(expected_value).__name__}")
            result = False
    
    else:
        print(f"âš ï¸ Operatore sconosciuto: {operator}")
        result = False
    
    # Log risultato
    if result:
        print(f"âœ… Condizione VERA: {field} {operator} {expected_value}")
    else:
        print(f"âŒ Condizione FALSA: {field} {operator} {expected_value}")
    
    return result

def evaluate_rules(preventivo_id: int, db: Session):
    """
    Valuta tutte le regole per un preventivo e aggiunge/rimuove materiali
    
    LOGICA:
    1. Raccoglie tutti i dati di configurazione
    2. Valuta ogni regola con le sue condizioni
    3. Rimuove materiali di regole non piÃ¹ attive
    4. Aggiunge nuovi materiali solo per regole attive
    """
    print(f"\n{'='*60}")
    print(f"ðŸ” VALUTAZIONE REGOLE PER PREVENTIVO {preventivo_id}")
    print(f"{'='*60}")
    
    # CRITICO: Forza SQLAlchemy a scartare la cache e rileggere dal database
    # Senza questo, le relazioni (preventivo.normative, etc.) restituiscono dati cached!
    db.expire_all()
    
    # Carica configurazione corrente
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        print(f"âŒ Preventivo {preventivo_id} non trovato")
        return {"error": "Preventivo non trovato"}
    
    # Raccogli tutti i dati di configurazione
    config_data = {}
    
    # Dati Principali
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
    
    # Normative
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
    
    # Stampa configurazione corrente (solo valori non-NULL)
    print(f"\nðŸ“Š CONFIGURAZIONE CORRENTE:")
    print(f"{'-'*60}")
    for key, value in sorted(config_data.items()):
        if value is not None and value != "":
            print(f"   {key}: {value}")
    print(f"{'-'*60}\n")
    
    # Carica regole
    rules = load_rules()
    active_rules = set()
    materials_to_add = []
    
    # Valuta ogni regola
    print(f"\n{'='*60}")
    print(f"ðŸ§ª VALUTAZIONE REGOLE")
    print(f"{'='*60}")
    
    for rule in rules:
        rule_id = rule.get("id", "unknown")
        rule_name = rule.get("name", "Regola senza nome")
        print(f"\nðŸ” Valutazione regola: {rule_name} (ID: {rule_id})")
        print(f"{'-'*60}")
        
        conditions = rule.get("conditions", [])
        all_conditions_met = True
        
        # Valuta tutte le condizioni
        for condition in conditions:
            if not evaluate_condition(condition, config_data):
                all_conditions_met = False
                break
        
        if all_conditions_met:
            print(f"âœ… Regola '{rule_name}' ATTIVA")
            active_rules.add(rule_id)
            
            # Aggiungi materiali di questa regola
            for material in rule.get("materials", []):
                materials_to_add.append({
                    "rule_id": rule_id,
                    "codice": material.get("codice"),
                    "descrizione": material.get("descrizione"),
                    "quantita": material.get("quantita", 1),
                    "prezzo_unitario": material.get("prezzo_unitario", 0.0),
                    "categoria": material.get("categoria", "Materiale Automatico")
                })
        else:
            print(f"âŒ Regola '{rule_name}' NON attiva")
    
    print(f"\n{'='*60}")
    print(f"ðŸŽ¯ REGOLE ATTIVE: {len(active_rules)}")
    for rule_id in active_rules:
        print(f"   âœ… {rule_id}")
    print(f"{'='*60}")
    
    # Rimuovi materiali di regole non piÃ¹ attive
    print(f"\n{'='*60}")
    print(f"ðŸ—‘ï¸ PULIZIA MATERIALI OBSOLETI")
    print(f"{'='*60}")
    
    existing_materials = db.query(Materiale).filter(
        Materiale.preventivo_id == preventivo_id,
        Materiale.aggiunto_da_regola == True
    ).all()
    
    removed_count = 0
    for material in existing_materials:
        if material.regola_id not in active_rules:
            print(f"ðŸ—‘ï¸ Rimuovo: {material.codice} - {material.descrizione} (regola {material.regola_id} non piÃ¹ attiva)")
            db.delete(material)
            removed_count += 1
        else:
            print(f"âœ… Mantengo: {material.codice} - {material.descrizione} (regola {material.regola_id} ancora attiva)")
    
    if removed_count == 0:
        print(f"â„¹ï¸ Nessun materiale da rimuovere")
    
    # Aggiungi nuovi materiali (evita duplicati)
    print(f"\n{'='*60}")
    print(f"âž• AGGIUNTA NUOVI MATERIALI")
    print(f"{'='*60}")
    
    added_count = 0
    for mat_data in materials_to_add:
        # Controlla se giÃ  esiste
        existing = db.query(Materiale).filter(
            Materiale.preventivo_id == preventivo_id,
            Materiale.codice == mat_data["codice"],
            Materiale.regola_id == mat_data["rule_id"]
        ).first()
        
        if not existing:
            prezzo_totale = mat_data["quantita"] * mat_data["prezzo_unitario"]
            
            new_material = Materiale(
                preventivo_id=preventivo_id,
                codice=mat_data["codice"],
                descrizione=mat_data["descrizione"],
                quantita=mat_data["quantita"],
                prezzo_unitario=mat_data["prezzo_unitario"],
                prezzo_totale=prezzo_totale,
                categoria=mat_data["categoria"],
                aggiunto_da_regola=True,
                regola_id=mat_data["rule_id"]
            )
            
            db.add(new_material)
            added_count += 1
            print(f"âž• Aggiunto: {mat_data['codice']} - {mat_data['descrizione']} (â‚¬{prezzo_totale:.2f})")
        else:
            print(f"â­ï¸ GiÃ  presente: {mat_data['codice']} - {mat_data['descrizione']}")
    
    if added_count == 0:
        print(f"â„¹ï¸ Nessun nuovo materiale da aggiungere")
    
    # Commit modifiche
    db.commit()
    
    # Aggiorna totale preventivo
    all_materials = db.query(Materiale).filter(
        Materiale.preventivo_id == preventivo_id
    ).all()
    
    totale = sum(m.prezzo_totale for m in all_materials)
    preventivo.total_price = totale
    db.commit()
    
    # Risultato finale
    print(f"\n{'='*60}")
    print(f"âœ¨ RIEPILOGO VALUTAZIONE")
    print(f"{'='*60}")
    print(f"ðŸ“Š Regole attive: {len(active_rules)}")
    if active_rules:
        for rule_id in active_rules:
            print(f"   âœ… {rule_id}")
    print(f"ðŸ—‘ï¸ Materiali rimossi: {removed_count}")
    print(f"âž• Materiali aggiunti: {added_count}")
    print(f"ðŸ“¦ Materiali totali: {len(all_materials)}")
    print(f"ðŸ’° Totale preventivo: â‚¬{totale:.2f}")
    print(f"{'='*60}\n")
    
    return {
        "active_rules": list(active_rules),
        "materials_added": added_count,
        "materials_removed": removed_count,
        "total_materials": len(all_materials),
        "total_price": totale
    }

# ==========================================
# PREVENTIVI
# ==========================================
@app.get("/preventivi", response_model=List[PreventivoSchema])
def get_preventivi(db: Session = Depends(get_db)):
    """Ottieni tutti i preventivi ordinati per data (piÃ¹ recenti prima)"""
    preventivi = db.query(Preventivo).order_by(Preventivo.created_at.desc()).all()
    return preventivi

@app.get("/preventivi/{preventivo_id}", response_model=PreventivoSchema)
def get_preventivo(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni un preventivo specifico"""
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return preventivo

@app.post("/preventivi", response_model=PreventivoSchema, status_code=201)
def create_preventivo(data: PreventivoCreate, db: Session = Depends(get_db)):
    """
    Crea nuovo preventivo con generazione automatica numero preventivo.
    Formato numero: ANNO/SEQUENZA (es: 2025/0001)
    Se template_id è specificato, pre-compila i campi dal template.
    """
    from datetime import datetime
    
    # Genera numero preventivo automatico se non fornito
    if not data.numero_preventivo:
        current_year = datetime.now().year
        last_preventivo = (
            db.query(Preventivo)
            .filter(Preventivo.numero_preventivo.like(f"{current_year}/%"))
            .order_by(Preventivo.id.desc())
            .first()
        )
        
        if last_preventivo and "/" in last_preventivo.numero_preventivo:
            try:
                last_number = int(last_preventivo.numero_preventivo.split("/")[1])
                new_number = last_number + 1
            except (ValueError, IndexError):
                new_number = 1
        else:
            new_number = 1
        
        numero_preventivo = f"{current_year}/{new_number:04d}"
    else:
        numero_preventivo = data.numero_preventivo
    
    # Carica template se specificato
    template_data_parsed = None
    if data.template_id:
        template = db.query(ProductTemplate).filter(ProductTemplate.id == data.template_id).first()
        if template and template.template_data:
            try:
                template_data_parsed = json.loads(template.template_data)
                print(f"📋 Template caricato: {template.nome_display} (ID={template.id})")
            except json.JSONDecodeError:
                print(f"⚠️ Errore parsing template_data per template {data.template_id}")
    
    # Crea preventivo con dati
    preventivo_dict = data.dict(exclude_unset=True)
    preventivo_dict['numero_preventivo'] = numero_preventivo
    # Rimuovi template_id dal dict se presente (lo settiamo separatamente)
    template_id = preventivo_dict.pop('template_id', None)
    
    # Imposta template_id e categoria nel dict
    if template_id:
        preventivo_dict['template_id'] = template_id
        if template:
            preventivo_dict['categoria'] = template.categoria
            print(f"🏷️ Categoria impostata: {template.categoria}")
    
    if 'created_at' not in preventivo_dict:
        preventivo_dict['created_at'] = datetime.now()
    if 'updated_at' not in preventivo_dict:
        preventivo_dict['updated_at'] = datetime.now()
    
    preventivo = Preventivo(**preventivo_dict)
    db.add(preventivo)
    db.commit()
    db.refresh(preventivo)
    
    print(f"✨ Preventivo creato: {numero_preventivo} (ID={preventivo.id})")
    
    # Crea record correlati (vuoti o pre-compilati da template)
    dp_data = template_data_parsed.get("dati_principali", {}) if template_data_parsed else {}
    norm_data = template_data_parsed.get("normative", {}) if template_data_parsed else {}
    dc_data = template_data_parsed.get("dati_commessa", {}) if template_data_parsed else {}
    dv_data = template_data_parsed.get("disposizione_vano", {}) if template_data_parsed else {}
    porte_data = template_data_parsed.get("porte", {}) if template_data_parsed else {}
    
    dati_commessa = DatiCommessa(preventivo_id=preventivo.id, **dc_data)
    dati_principali = DatiPrincipali(preventivo_id=preventivo.id, **dp_data)
    normative = Normative(preventivo_id=preventivo.id, **norm_data)
    disposizione_vano = DisposizioneVano(preventivo_id=preventivo.id, **dv_data)
    porte = Porte(preventivo_id=preventivo.id, **porte_data)
    
    db.add_all([dati_commessa, dati_principali, normative, disposizione_vano, porte])
    db.commit()
    
    # Aggiungi materiali da template se presenti
    if template_data_parsed and "materiali" in template_data_parsed:
        for mat in template_data_parsed["materiali"]:
            quantita = mat.get("quantita", 1)
            prezzo_unitario = mat.get("prezzo_unitario", 0.0)
            materiale = Materiale(
                preventivo_id=preventivo.id,
                codice=mat.get("codice", ""),
                descrizione=mat.get("descrizione", ""),
                quantita=quantita,
                prezzo_unitario=prezzo_unitario,
                prezzo_totale=quantita * prezzo_unitario,
                categoria=mat.get("categoria", "Template"),
                aggiunto_da_regola=False,
                note=f"Da template: {template.nome_display}" if template else None
            )
            db.add(materiale)
        
        db.commit()
        
        # Aggiorna totale preventivo
        all_materials = db.query(Materiale).filter(Materiale.preventivo_id == preventivo.id).all()
        preventivo.total_price = sum(m.prezzo_totale for m in all_materials)
        db.commit()
        db.refresh(preventivo)
        
        print(f"📦 Aggiunti {len(template_data_parsed['materiali'])} materiali da template")
    
    return preventivo

@app.put("/preventivi/{preventivo_id}", response_model=PreventivoSchema)
def update_preventivo(
    preventivo_id: int,
    data: PreventivoUpdate,
    db: Session = Depends(get_db)
):
    """Aggiorna preventivo"""
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    from datetime import datetime
    update_dict = data.dict(exclude_unset=True)
    update_dict['updated_at'] = datetime.now()
    
    for key, value in update_dict.items():
        setattr(preventivo, key, value)
    
    db.commit()
    db.refresh(preventivo)
    return preventivo

@app.delete("/preventivi/{preventivo_id}")
def delete_preventivo(preventivo_id: int, db: Session = Depends(get_db)):
    """Elimina preventivo (cascade su tutti i record correlati)"""
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    db.delete(preventivo)
    db.commit()
    return {"message": "Preventivo eliminato"}

# ==========================================
# DATI COMMESSA
# ==========================================
@app.get("/preventivi/{preventivo_id}/dati-commessa", response_model=DatiCommessaSchema)
def get_dati_commessa(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni dati commessa, crea se non esiste"""
    dati = db.query(DatiCommessa).filter(
        DatiCommessa.preventivo_id == preventivo_id
    ).first()
    if not dati:
        dati = DatiCommessa(preventivo_id=preventivo_id)
        db.add(dati)
        db.commit()
        db.refresh(dati)
    return dati

@app.put("/preventivi/{preventivo_id}/dati-commessa", response_model=DatiCommessaSchema)
def update_dati_commessa(
    preventivo_id: int,
    data: DatiCommessaUpdate,
    db: Session = Depends(get_db)
):
    """Aggiorna dati commessa"""
    dati = db.query(DatiCommessa).filter(
        DatiCommessa.preventivo_id == preventivo_id
    ).first()
    if not dati:
        dati = DatiCommessa(preventivo_id=preventivo_id)
        db.add(dati)
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(dati, key, value)
    
    db.commit()
    db.refresh(dati)
    
    # Valuta regole dopo aggiornamento
    evaluate_rules(preventivo_id, db)
    
    return dati

# ==========================================
# DATI PRINCIPALI
# ==========================================
@app.get("/preventivi/{preventivo_id}/dati-principali", response_model=DatiPrincipaliSchema)
def get_dati_principali(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni dati principali, crea se non esiste"""
    dati = db.query(DatiPrincipali).filter(
        DatiPrincipali.preventivo_id == preventivo_id
    ).first()
    if not dati:
        dati = DatiPrincipali(preventivo_id=preventivo_id)
        db.add(dati)
        db.commit()
        db.refresh(dati)
    return dati

@app.put("/preventivi/{preventivo_id}/dati-principali", response_model=DatiPrincipaliSchema)
def update_dati_principali(
    preventivo_id: int,
    data: DatiPrincipaliUpdate,
    db: Session = Depends(get_db)
):
    """Aggiorna dati principali"""
    dati = db.query(DatiPrincipali).filter(
        DatiPrincipali.preventivo_id == preventivo_id
    ).first()
    if not dati:
        dati = DatiPrincipali(preventivo_id=preventivo_id)
        db.add(dati)
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(dati, key, value)
    
    db.commit()
    db.refresh(dati)
    
    # Valuta regole dopo aggiornamento
    evaluate_rules(preventivo_id, db)
    
    return dati

# ==========================================
# NORMATIVE
# ==========================================
@app.get("/preventivi/{preventivo_id}/normative", response_model=NormativeSchema)
def get_normative(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni normative, crea se non esiste"""
    normative = db.query(Normative).filter(
        Normative.preventivo_id == preventivo_id
    ).first()
    if not normative:
        normative = Normative(preventivo_id=preventivo_id)
        db.add(normative)
        db.commit()
        db.refresh(normative)
    return normative

@app.put("/preventivi/{preventivo_id}/normative", response_model=NormativeSchema)
def update_normative(
    preventivo_id: int,
    data: NormativeUpdate,
    db: Session = Depends(get_db)
):
    """Aggiorna normative"""
    normative = db.query(Normative).filter(
        Normative.preventivo_id == preventivo_id
    ).first()
    if not normative:
        normative = Normative(preventivo_id=preventivo_id)
        db.add(normative)
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(normative, key, value)
    
    db.commit()
    db.refresh(normative)
    
    # Valuta regole dopo aggiornamento
    evaluate_rules(preventivo_id, db)
    
    return normative

# ==========================================
# DISPOSIZIONE VANO
# ==========================================
@app.get("/preventivi/{preventivo_id}/disposizione-vano", response_model=DisposizioneVanoSchema)
def get_disposizione_vano(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni disposizione vano, crea se non esiste"""
    disposizione = db.query(DisposizioneVano).filter(
        DisposizioneVano.preventivo_id == preventivo_id
    ).first()
    if not disposizione:
        disposizione = DisposizioneVano(preventivo_id=preventivo_id)
        db.add(disposizione)
        db.commit()
        db.refresh(disposizione)
    return disposizione

@app.put("/preventivi/{preventivo_id}/disposizione-vano", response_model=DisposizioneVanoSchema)
def update_disposizione_vano(
    preventivo_id: int,
    data: DisposizioneVanoUpdate,
    db: Session = Depends(get_db)
):
    """Aggiorna disposizione vano con pulizia stringhe vuote"""
    disposizione = db.query(DisposizioneVano).filter(
        DisposizioneVano.preventivo_id == preventivo_id
    ).first()
    if not disposizione:
        disposizione = DisposizioneVano(preventivo_id=preventivo_id)
        db.add(disposizione)
    
    # Converti e pulisci dati
    data_dict = data.dict(exclude_unset=True)
    print(f"ðŸ“¥ Ricevuto dati disposizione vano per preventivo {preventivo_id}")
    
    # Pulisci stringhe vuote (converti in None)
    cleaned_data = {}
    for key, value in data_dict.items():
        if value == '' or value == '{}' or value == '[]':
            cleaned_data[key] = None
        else:
            cleaned_data[key] = value
    
    # Aggiorna campi
    for key, value in cleaned_data.items():
        setattr(disposizione, key, value)
    
    db.commit()
    db.refresh(disposizione)
    print(f"âœ… DisposizioneVano salvata: ID={disposizione.id}")
    
    return disposizione

@app.delete("/preventivi/{preventivo_id}/disposizione-vano")
def delete_disposizione_vano(preventivo_id: int, db: Session = Depends(get_db)):
    """Elimina disposizione vano"""
    disposizione = db.query(DisposizioneVano).filter(
        DisposizioneVano.preventivo_id == preventivo_id
    ).first()
    if disposizione:
        db.delete(disposizione)
        db.commit()
    return {"message": "Disposizione vano eliminata"}

# ==========================================
# PORTE
# ==========================================
@app.get("/preventivi/{preventivo_id}/porte", response_model=PorteSchema)
def get_porte(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni dati porte, crea se non esiste"""
    porte = db.query(Porte).filter(Porte.preventivo_id == preventivo_id).first()
    if not porte:
        porte = Porte(preventivo_id=preventivo_id)
        db.add(porte)
        db.commit()
        db.refresh(porte)
    return porte

@app.put("/preventivi/{preventivo_id}/porte", response_model=PorteSchema)
def update_porte(
    preventivo_id: int,
    data: PorteUpdate,
    db: Session = Depends(get_db)
):
    """Aggiorna dati porte"""
    porte = db.query(Porte).filter(Porte.preventivo_id == preventivo_id).first()
    if not porte:
        porte = Porte(preventivo_id=preventivo_id)
        db.add(porte)
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(porte, key, value)
    
    db.commit()
    db.refresh(porte)
    return porte

# ==========================================
# MATERIALI
# ==========================================
@app.get("/preventivi/{preventivo_id}/materiali", response_model=List[MaterialeSchema])
def get_materiali(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni tutti i materiali di un preventivo"""
    materiali = db.query(Materiale).filter(
        Materiale.preventivo_id == preventivo_id
    ).all()
    return materiali

@app.post("/preventivi/{preventivo_id}/materiali", response_model=MaterialeSchema)
def create_materiale(
    preventivo_id: int,
    data: MaterialeCreate,
    db: Session = Depends(get_db)
):
    """Crea nuovo materiale"""
    prezzo_totale = data.quantita * data.prezzo_unitario
    
    materiale = Materiale(
        preventivo_id=preventivo_id,
        codice=data.codice,
        descrizione=data.descrizione,
        quantita=data.quantita,
        prezzo_unitario=data.prezzo_unitario,
        prezzo_totale=prezzo_totale,
        categoria=data.categoria,
        aggiunto_da_regola=data.aggiunto_da_regola,
        regola_id=data.regola_id,
        note=data.note
    )
    
    db.add(materiale)
    db.commit()
    db.refresh(materiale)
    
    # Aggiorna totale preventivo
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if preventivo:
        all_materials = db.query(Materiale).filter(Materiale.preventivo_id == preventivo_id).all()
        preventivo.total_price = sum(m.prezzo_totale for m in all_materials)
        db.commit()
    
    return materiale

@app.put("/preventivi/{preventivo_id}/materiali/{materiale_id}", response_model=MaterialeSchema)
def update_materiale(
    preventivo_id: int,
    materiale_id: int,
    data: MaterialeUpdate,
    db: Session = Depends(get_db)
):
    """Aggiorna materiale esistente"""
    materiale = db.query(Materiale).filter(
        Materiale.id == materiale_id,
        Materiale.preventivo_id == preventivo_id
    ).first()
    
    if not materiale:
        raise HTTPException(status_code=404, detail="Materiale non trovato")
    
    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(materiale, key, value)
    
    # Ricalcola prezzo totale se quantitÃ  o prezzo unitario sono cambiati
    if 'quantita' in update_data or 'prezzo_unitario' in update_data:
        materiale.prezzo_totale = materiale.quantita * materiale.prezzo_unitario
    
    db.commit()
    db.refresh(materiale)
    
    # Aggiorna totale preventivo
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if preventivo:
        all_materials = db.query(Materiale).filter(Materiale.preventivo_id == preventivo_id).all()
        preventivo.total_price = sum(m.prezzo_totale for m in all_materials)
        db.commit()
    
    return materiale

@app.delete("/preventivi/{preventivo_id}/materiali/{materiale_id}")
def delete_materiale(
    preventivo_id: int,
    materiale_id: int,
    db: Session = Depends(get_db)
):
    """Elimina materiale"""
    materiale = db.query(Materiale).filter(
        Materiale.id == materiale_id,
        Materiale.preventivo_id == preventivo_id
    ).first()
    
    if not materiale:
        raise HTTPException(status_code=404, detail="Materiale non trovato")
    
    db.delete(materiale)
    db.commit()
    
    # Aggiorna totale preventivo
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if preventivo:
        all_materials = db.query(Materiale).filter(Materiale.preventivo_id == preventivo_id).all()
        preventivo.total_price = sum(m.prezzo_totale for m in all_materials)
        db.commit()
    
    return {"message": "Materiale eliminato"}

# ==========================================
# PRODUCT TEMPLATES
# ==========================================
@app.get("/templates", response_model=List[ProductTemplateSchema])
def get_templates(categoria: str = None, db: Session = Depends(get_db)):
    """Ottieni tutti i template, opzionalmente filtrati per categoria"""
    query = db.query(ProductTemplate).filter(ProductTemplate.attivo == True)
    if categoria:
        query = query.filter(ProductTemplate.categoria == categoria.upper())
    templates = query.order_by(ProductTemplate.categoria, ProductTemplate.ordine).all()
    return templates

@app.get("/templates/all", response_model=List[ProductTemplateSchema])
def get_all_templates(db: Session = Depends(get_db)):
    """Ottieni TUTTI i template (inclusi disattivi) - per admin"""
    templates = db.query(ProductTemplate).order_by(
        ProductTemplate.categoria, ProductTemplate.ordine
    ).all()
    return templates

@app.get("/templates/categories/summary")
def get_categories_summary(db: Session = Depends(get_db)):
    """Ottieni riepilogo categorie con conteggio template"""
    templates = db.query(ProductTemplate).filter(ProductTemplate.attivo == True).order_by(
        ProductTemplate.categoria, ProductTemplate.ordine
    ).all()
    
    categories = {}
    for t in templates:
        cat = t.categoria
        if cat not in categories:
            categories[cat] = {"categoria": cat, "sottocategorie": []}
        categories[cat]["sottocategorie"].append({
            "id": t.id,
            "sottocategoria": t.sottocategoria,
            "nome_display": t.nome_display,
            "descrizione": t.descrizione,
            "icona": t.icona,
            "ordine": t.ordine
        })
    
    return list(categories.values())

@app.get("/templates/{template_id}", response_model=ProductTemplateSchema)
def get_template(template_id: int, db: Session = Depends(get_db)):
    """Ottieni un template specifico"""
    template = db.query(ProductTemplate).filter(ProductTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template non trovato")
    return template

@app.post("/templates", response_model=ProductTemplateSchema, status_code=201)
def create_template(data: ProductTemplateCreate, db: Session = Depends(get_db)):
    """Crea un nuovo template"""
    from datetime import datetime
    
    # Valida JSON se presente
    if data.template_data:
        try:
            json.loads(data.template_data)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="template_data non è un JSON valido")
    
    template_dict = data.dict()
    template_dict['categoria'] = template_dict['categoria'].upper()
    template_dict['created_at'] = datetime.now()
    template_dict['updated_at'] = datetime.now()
    
    template = ProductTemplate(**template_dict)
    db.add(template)
    db.commit()
    db.refresh(template)
    
    print(f"✨ Template creato: {template.nome_display} ({template.categoria}/{template.sottocategoria})")
    return template

@app.put("/templates/{template_id}", response_model=ProductTemplateSchema)
def update_template(template_id: int, data: ProductTemplateUpdate, db: Session = Depends(get_db)):
    """Aggiorna un template esistente"""
    template = db.query(ProductTemplate).filter(ProductTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template non trovato")
    
    # Valida JSON se presente
    if data.template_data:
        try:
            json.loads(data.template_data)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="template_data non è un JSON valido")
    
    from datetime import datetime
    update_dict = data.dict(exclude_unset=True)
    if 'categoria' in update_dict and update_dict['categoria']:
        update_dict['categoria'] = update_dict['categoria'].upper()
    update_dict['updated_at'] = datetime.now()
    
    for key, value in update_dict.items():
        setattr(template, key, value)
    
    db.commit()
    db.refresh(template)
    
    print(f"✏️ Template aggiornato: {template.nome_display} (ID={template.id})")
    return template

@app.delete("/templates/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    """Elimina un template"""
    template = db.query(ProductTemplate).filter(ProductTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template non trovato")
    
    db.delete(template)
    db.commit()
    
    print(f"🗑️ Template eliminato: {template.nome_display} (ID={template_id})")
    return {"message": "Template eliminato"}

# ==========================================
# RULE ENGINE ENDPOINT
# ==========================================
@app.post("/preventivi/{preventivo_id}/evaluate-rules")
def evaluate_rules_endpoint(preventivo_id: int, db: Session = Depends(get_db)):
    """Endpoint per valutare manualmente le regole"""
    result = evaluate_rules(preventivo_id, db)
    return result

# ==========================================
# STARTUP
# ==========================================
if __name__ == "__main__":
    import uvicorn
    print("ðŸš€ Avvio Configuratore Elettroquadri API v0.9.1")
    print("ðŸ“¡ Server in ascolto su http://0.0.0.0:8000")
    print("ðŸ“– Documentazione API: http://0.0.0.0:8000/docs")
    print("\nâœ¨ MIGLIORAMENTI v0.9.1:")
    print("   âœ… Numero preventivo automatico (ANNO/SEQUENZA)")
    print("   âœ… Campo customer_name supportato")
    print("   âœ… BUG FIX: total_price invece di totale")
    print("   âœ… Updated_at automatico su update preventivo")
    uvicorn.run(app, host="0.0.0.0", port=8000)
