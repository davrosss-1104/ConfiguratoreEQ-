from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import timedelta
import json
import os
from decimal import Decimal

from database import engine, SessionLocal
from models import (
    Base, Preventivo, DatiCommessa, DatiPrincipali, Normative, 
    DisposizioneVano, Porte, Materiale, RigaRicambio,
    ParametriSistema, GruppoUtenti, PermessoGruppo, Utente,
    Cliente, CategoriaArticolo, Articolo
)
from schemas import (
    PreventivoCreate, PreventivoUpdate, Preventivo as PreventivoSchema,
    PreventivoConCliente, PreventivoCompleto,
    DatiCommessaCreate, DatiCommessaUpdate, DatiCommessa as DatiCommessaSchema,
    DatiPrincipaliCreate, DatiPrincipaliUpdate, DatiPrincipali as DatiPrincipaliSchema,
    NormativeCreate, NormativeUpdate, Normative as NormativeSchema,
    DisposizioneVanoCreate, DisposizioneVanoUpdate, DisposizioneVano as DisposizioneVanoSchema,
    PorteCreate, PorteUpdate, Porte as PorteSchema,
    MaterialeCreate, MaterialeUpdate, Materiale as MaterialeSchema,
    # Nuovi schemas
    ParametriSistemaCreate, ParametriSistemaUpdate, ParametriSistema as ParametriSistemaSchema,
    GruppoUtentiCreate, GruppoUtentiUpdate, GruppoUtenti as GruppoUtentiSchema, GruppoUtentiConPermessi,
    PermessoGruppoCreate, PermessoGruppo as PermessoGruppoSchema,
    UtenteCreate, UtenteUpdate, Utente as UtenteSchema, UtenteConGruppo,
    ClienteCreate, ClienteUpdate, Cliente as ClienteSchema,
    CategoriaArticoloCreate, CategoriaArticoloUpdate, CategoriaArticolo as CategoriaArticoloSchema,
    ArticoloCreate, ArticoloUpdate, Articolo as ArticoloSchema, ArticoloConCategoria,
    ArticoloSearchResult, ArticoloSearchFilters,
    CalcoloPrezzoInput, CalcoloPrezzoOutput,
    RigaRicambioCreate, RigaRicambioUpdate, RigaRicambio as RigaRicambioSchema,
    AggiuntaBatchArticoli, SuccessResponse
)
from auth import (
    authenticate_user, create_access_token, get_current_user, 
    get_current_user_required, require_admin, is_admin, has_permission,
    create_demo_users, get_password_hash, ACCESS_TOKEN_EXPIRE_MINUTES
)

# Crea tabelle
Base.metadata.create_all(bind=engine)


# ==========================================
# AUTH SCHEMAS
# ==========================================

class Token(BaseModel):
    access_token: str
    token_type: str

class LoginRequest(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    nome: Optional[str] = None
    cognome: Optional[str] = None
    email: Optional[str] = None
    gruppo_id: Optional[int] = None
    gruppo_nome: Optional[str] = None
    is_active: bool
    is_admin: bool
    permessi: List[str] = []
    
    class Config:
        from_attributes = True

# FastAPI app
app = FastAPI(title="Configuratore Elettroquadri API", version="2.0.0")

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
# STARTUP: Crea utenti demo
# ==========================================
@app.on_event("startup")
async def startup_event():
    db = SessionLocal()
    try:
        create_demo_users(db)
    finally:
        db.close()


# ==========================================
# AUTH ENDPOINTS
# ==========================================

@app.post("/api/auth/login", response_model=Token)
async def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    """Login utente - restituisce JWT token"""
    user = authenticate_user(db, login_data.username, login_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username o password non corretti",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@app.post("/api/auth/login/form", response_model=Token)
async def login_form(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Login con form OAuth2 (per Swagger UI)"""
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Username o password non corretti",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: Utente = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Ottieni informazioni utente corrente"""
    # Carica gruppo
    gruppo = None
    gruppo_nome = None
    permessi = []
    user_is_admin = False
    
    if current_user.gruppo_id:
        gruppo = db.query(GruppoUtenti).filter(GruppoUtenti.id == current_user.gruppo_id).first()
        if gruppo:
            gruppo_nome = gruppo.nome
            user_is_admin = gruppo.is_admin
            # Carica permessi
            perms = db.query(PermessoGruppo).filter(PermessoGruppo.gruppo_id == gruppo.id).all()
            permessi = [p.codice_permesso for p in perms]
    
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        nome=current_user.nome,
        cognome=current_user.cognome,
        email=current_user.email,
        gruppo_id=current_user.gruppo_id,
        gruppo_nome=gruppo_nome,
        is_active=current_user.is_active,
        is_admin=user_is_admin,
        permessi=permessi
    )


@app.get("/api/auth/check")
async def check_auth(current_user: Utente = Depends(get_current_user)):
    """Verifica se token è valido (non richiede autenticazione)"""
    if current_user:
        return {"authenticated": True, "username": current_user.username}
    return {"authenticated": False}


@app.post("/api/auth/change-password")
async def change_password(
    old_password: str,
    new_password: str,
    current_user: Utente = Depends(get_current_user_required),
    db: Session = Depends(get_db)
):
    """Cambia password utente corrente"""
    from auth import verify_password
    
    if not verify_password(old_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Password attuale non corretta")
    
    current_user.password_hash = get_password_hash(new_password)
    db.commit()
    return {"message": "Password aggiornata con successo"}


# ==========================================
# HELPER: CALCOLO PREZZO A 3 LIVELLI
# ==========================================
def calcola_prezzo_articolo(
    db: Session,
    articolo: Articolo,
    quantita: float = 1.0,
    parametro_calcolo: Optional[float] = None,
    cliente_id: Optional[int] = None
) -> CalcoloPrezzoOutput:
    """
    Calcola il prezzo di un articolo seguendo il sistema a 3 livelli:
    
    STEP 1: COSTO BASE
    - Se rule_id_calcolo presente: esegue regola
    - Altrimenti: costo_fisso + (costo_variabile × parametro)
    
    STEP 2: PREZZO LISTINO
    - Applica ricarico (da articolo o da parametri_sistema)
    
    STEP 3: PREZZO FINALE
    - Applica sconto cliente se specificato
    """
    
    # ========== STEP 1: COSTO BASE ==========
    costo_base = float(articolo.costo_fisso or 0)
    dettaglio_costo = f"Costo fisso: €{costo_base:.4f}"
    
    if articolo.costo_variabile and articolo.costo_variabile > 0:
        param = parametro_calcolo or 1.0
        costo_variabile_totale = float(articolo.costo_variabile) * param
        costo_base += costo_variabile_totale
        um = articolo.unita_misura_variabile or "unità"
        dettaglio_costo += f" + (€{float(articolo.costo_variabile):.4f} × {param} {um}) = €{costo_base:.4f}"
    
    # Se c'è una regola di calcolo, potrebbe sovrascrivere
    if articolo.rule_id_calcolo:
        # TODO: Implementare esecuzione regole calcolo
        dettaglio_costo += f" [Regola: {articolo.rule_id_calcolo}]"
    
    # ========== STEP 2: PREZZO LISTINO ==========
    # Determina ricarico
    if articolo.ricarico_percentuale is not None:
        ricarico = float(articolo.ricarico_percentuale)
    else:
        # Cerca nei parametri sistema
        chiave_ricarico = f"ricarico_{articolo.tipo_articolo.lower()}_default"
        param_ricarico = db.query(ParametriSistema).filter(
            ParametriSistema.chiave == chiave_ricarico
        ).first()
        
        if param_ricarico:
            ricarico = float(param_ricarico.valore)
        else:
            # Default: 30% produzione, 15% acquisto
            ricarico = 30.0 if articolo.tipo_articolo == "PRODUZIONE" else 15.0
    
    prezzo_listino = costo_base * (1 + ricarico / 100)
    
    # ========== STEP 3: PREZZO FINALE ==========
    sconto_cliente = 0.0
    prezzo_finale = prezzo_listino
    
    if cliente_id:
        cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
        if cliente:
            # Sconto per tipo articolo
            if articolo.tipo_articolo == "PRODUZIONE":
                sconto_cliente = float(cliente.sconto_produzione or 0)
            else:
                sconto_cliente = float(cliente.sconto_acquisto or 0)
            
            # Aggiungi sconto globale
            sconto_cliente += float(cliente.sconto_globale or 0)
            
            prezzo_finale = prezzo_listino * (1 - sconto_cliente / 100)
    
    # ========== TOTALE ==========
    prezzo_totale = prezzo_finale * quantita
    
    return CalcoloPrezzoOutput(
        articolo_id=articolo.id,
        codice=articolo.codice,
        descrizione=articolo.descrizione,
        tipo_articolo=articolo.tipo_articolo,
        costo_base_unitario=round(costo_base, 4),
        dettaglio_costo=dettaglio_costo,
        ricarico_percentuale=ricarico,
        prezzo_listino_unitario=round(prezzo_listino, 4),
        sconto_cliente_percentuale=sconto_cliente,
        prezzo_finale_unitario=round(prezzo_finale, 4),
        quantita=quantita,
        prezzo_totale=round(prezzo_totale, 4)
    )


# ==========================================
# RULE ENGINE - VERSIONE MIGLIORATA
# ==========================================
def load_rules():
    """Carica le regole dai file JSON nella directory rules/"""
    rules = []
    rules_dir = "./rules"
    
    if not os.path.exists(rules_dir):
        print("⚠️ Directory rules/ non trovata")
        return rules
    
    for filename in os.listdir(rules_dir):
        if filename.endswith(".json"):
            try:
                with open(os.path.join(rules_dir, filename), "r", encoding="utf-8") as f:
                    rule = json.load(f)
                    rules.append(rule)
                    print(f"✅ Regola caricata: {filename}")
            except Exception as e:
                print(f"❌ Errore caricamento {filename}: {e}")
    
    print(f"📋 Caricate {len(rules)} regole")
    return rules


def evaluate_condition(condition: dict, config_data: dict) -> bool:
    """Valuta una singola condizione"""
    if isinstance(condition, str):
        return False
    
    field = condition.get("field")
    operator = condition.get("operator")
    expected_value = condition.get("value")
    
    if field not in config_data:
        return False
    
    config_value = config_data.get(field)
    
    if config_value is None:
        return False
    
    if isinstance(config_value, str) and config_value.strip() == "":
        return False
    
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
            result = False
    elif operator == "less_than":
        try:
            result = float(config_value) < float(expected_value)
        except (ValueError, TypeError):
            result = False
    elif operator == "in":
        if isinstance(expected_value, list):
            result = config_value in expected_value
        else:
            result = False
    
    return result


def evaluate_rules(preventivo_id: int, db: Session):
    """Valuta tutte le regole per un preventivo"""
    db.expire_all()
    
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        return {"error": "Preventivo non trovato"}
    
    config_data = {}
    
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
    
    rules = load_rules()
    active_rules = set()
    materials_to_add = []
    
    for rule in rules:
        rule_id = rule.get("id", "unknown")
        conditions = rule.get("conditions", [])
        all_conditions_met = True
        
        for condition in conditions:
            if not evaluate_condition(condition, config_data):
                all_conditions_met = False
                break
        
        if all_conditions_met:
            active_rules.add(rule_id)
            for material in rule.get("materials", []):
                materials_to_add.append({
                    "rule_id": rule_id,
                    "codice": material.get("codice"),
                    "descrizione": material.get("descrizione"),
                    "quantita": material.get("quantita", 1),
                    "prezzo_unitario": material.get("prezzo_unitario", 0.0),
                    "categoria": material.get("categoria", "Materiale Automatico")
                })
    
    # Rimuovi materiali obsoleti
    existing_materials = db.query(Materiale).filter(
        Materiale.preventivo_id == preventivo_id,
        Materiale.aggiunto_da_regola == True
    ).all()
    
    removed_count = 0
    for material in existing_materials:
        if material.regola_id not in active_rules:
            db.delete(material)
            removed_count += 1
    
    # Aggiungi nuovi materiali
    added_count = 0
    for mat_data in materials_to_add:
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
    
    db.commit()
    
    # Aggiorna totale preventivo
    all_materials = db.query(Materiale).filter(
        Materiale.preventivo_id == preventivo_id
    ).all()
    
    totale = sum(m.prezzo_totale for m in all_materials)
    preventivo.total_price = totale
    db.commit()
    
    return {
        "active_rules": list(active_rules),
        "materials_added": added_count,
        "materials_removed": removed_count,
        "total_materials": len(all_materials),
        "total_price": totale
    }


# ==========================================
# PARAMETRI SISTEMA ENDPOINTS
# ==========================================
@app.get("/api/parametri-sistema", response_model=List[ParametriSistemaSchema])
def get_parametri_sistema(
    gruppo: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Ottieni tutti i parametri di sistema"""
    query = db.query(ParametriSistema)
    if gruppo:
        query = query.filter(ParametriSistema.gruppo == gruppo)
    return query.order_by(ParametriSistema.chiave).all()


@app.get("/api/parametri-sistema/{chiave}", response_model=ParametriSistemaSchema)
def get_parametro_sistema(chiave: str, db: Session = Depends(get_db)):
    """Ottieni un parametro specifico"""
    parametro = db.query(ParametriSistema).filter(ParametriSistema.chiave == chiave).first()
    if not parametro:
        raise HTTPException(status_code=404, detail="Parametro non trovato")
    return parametro


@app.post("/api/parametri-sistema", response_model=ParametriSistemaSchema, status_code=201)
def create_parametro_sistema(data: ParametriSistemaCreate, db: Session = Depends(get_db)):
    """Crea nuovo parametro"""
    existing = db.query(ParametriSistema).filter(ParametriSistema.chiave == data.chiave).first()
    if existing:
        raise HTTPException(status_code=400, detail="Chiave già esistente")
    
    parametro = ParametriSistema(**data.dict())
    db.add(parametro)
    db.commit()
    db.refresh(parametro)
    return parametro


@app.put("/api/parametri-sistema/{chiave}", response_model=ParametriSistemaSchema)
def update_parametro_sistema(chiave: str, data: ParametriSistemaUpdate, db: Session = Depends(get_db)):
    """Aggiorna parametro"""
    parametro = db.query(ParametriSistema).filter(ParametriSistema.chiave == chiave).first()
    if not parametro:
        raise HTTPException(status_code=404, detail="Parametro non trovato")
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(parametro, key, value)
    
    db.commit()
    db.refresh(parametro)
    return parametro


@app.delete("/api/parametri-sistema/{chiave}")
def delete_parametro_sistema(chiave: str, db: Session = Depends(get_db)):
    """Elimina parametro"""
    parametro = db.query(ParametriSistema).filter(ParametriSistema.chiave == chiave).first()
    if not parametro:
        raise HTTPException(status_code=404, detail="Parametro non trovato")
    
    db.delete(parametro)
    db.commit()
    return {"message": "Parametro eliminato"}


# ==========================================
# GRUPPI UTENTI ENDPOINTS
# ==========================================
@app.get("/api/gruppi-utenti", response_model=List[GruppoUtentiSchema])
def get_gruppi_utenti(
    include_inactive: bool = False,
    db: Session = Depends(get_db)
):
    """Ottieni tutti i gruppi utenti"""
    query = db.query(GruppoUtenti)
    if not include_inactive:
        query = query.filter(GruppoUtenti.is_active == True)
    return query.order_by(GruppoUtenti.nome).all()


@app.get("/api/gruppi-utenti/{gruppo_id}", response_model=GruppoUtentiConPermessi)
def get_gruppo_utenti(gruppo_id: int, db: Session = Depends(get_db)):
    """Ottieni un gruppo con i suoi permessi"""
    gruppo = db.query(GruppoUtenti).filter(GruppoUtenti.id == gruppo_id).first()
    if not gruppo:
        raise HTTPException(status_code=404, detail="Gruppo non trovato")
    return gruppo


@app.post("/api/gruppi-utenti", response_model=GruppoUtentiSchema, status_code=201)
def create_gruppo_utenti(data: GruppoUtentiCreate, db: Session = Depends(get_db)):
    """Crea nuovo gruppo"""
    existing = db.query(GruppoUtenti).filter(GruppoUtenti.nome == data.nome).first()
    if existing:
        raise HTTPException(status_code=400, detail="Nome gruppo già esistente")
    
    gruppo = GruppoUtenti(**data.dict())
    db.add(gruppo)
    db.commit()
    db.refresh(gruppo)
    return gruppo


@app.put("/api/gruppi-utenti/{gruppo_id}", response_model=GruppoUtentiSchema)
def update_gruppo_utenti(gruppo_id: int, data: GruppoUtentiUpdate, db: Session = Depends(get_db)):
    """Aggiorna gruppo"""
    gruppo = db.query(GruppoUtenti).filter(GruppoUtenti.id == gruppo_id).first()
    if not gruppo:
        raise HTTPException(status_code=404, detail="Gruppo non trovato")
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(gruppo, key, value)
    
    db.commit()
    db.refresh(gruppo)
    return gruppo


@app.delete("/api/gruppi-utenti/{gruppo_id}")
def delete_gruppo_utenti(gruppo_id: int, db: Session = Depends(get_db)):
    """Elimina gruppo (soft delete)"""
    gruppo = db.query(GruppoUtenti).filter(GruppoUtenti.id == gruppo_id).first()
    if not gruppo:
        raise HTTPException(status_code=404, detail="Gruppo non trovato")
    
    gruppo.is_active = False
    db.commit()
    return {"message": "Gruppo disattivato"}


# ==========================================
# PERMESSI GRUPPO ENDPOINTS
# ==========================================
@app.post("/api/gruppi-utenti/{gruppo_id}/permessi", response_model=PermessoGruppoSchema, status_code=201)
def add_permesso_gruppo(gruppo_id: int, data: PermessoGruppoCreate, db: Session = Depends(get_db)):
    """Aggiungi permesso a gruppo"""
    gruppo = db.query(GruppoUtenti).filter(GruppoUtenti.id == gruppo_id).first()
    if not gruppo:
        raise HTTPException(status_code=404, detail="Gruppo non trovato")
    
    permesso = PermessoGruppo(gruppo_id=gruppo_id, **data.dict(exclude={'gruppo_id'}))
    db.add(permesso)
    db.commit()
    db.refresh(permesso)
    return permesso


@app.delete("/api/gruppi-utenti/{gruppo_id}/permessi/{permesso_id}")
def remove_permesso_gruppo(gruppo_id: int, permesso_id: int, db: Session = Depends(get_db)):
    """Rimuovi permesso da gruppo"""
    permesso = db.query(PermessoGruppo).filter(
        PermessoGruppo.id == permesso_id,
        PermessoGruppo.gruppo_id == gruppo_id
    ).first()
    if not permesso:
        raise HTTPException(status_code=404, detail="Permesso non trovato")
    
    db.delete(permesso)
    db.commit()
    return {"message": "Permesso rimosso"}


# ==========================================
# UTENTI ENDPOINTS
# ==========================================
@app.get("/api/utenti", response_model=List[UtenteConGruppo])
def get_utenti(
    include_inactive: bool = False,
    gruppo_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Ottieni tutti gli utenti"""
    query = db.query(Utente)
    if not include_inactive:
        query = query.filter(Utente.is_active == True)
    if gruppo_id:
        query = query.filter(Utente.gruppo_id == gruppo_id)
    return query.order_by(Utente.cognome, Utente.nome).all()


@app.get("/api/utenti/{utente_id}", response_model=UtenteConGruppo)
def get_utente(utente_id: int, db: Session = Depends(get_db)):
    """Ottieni un utente specifico"""
    utente = db.query(Utente).filter(Utente.id == utente_id).first()
    if not utente:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    return utente


@app.post("/api/utenti", response_model=UtenteSchema, status_code=201)
def create_utente(data: UtenteCreate, db: Session = Depends(get_db)):
    """Crea nuovo utente"""
    existing = db.query(Utente).filter(Utente.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username già esistente")
    
    utente_data = data.dict(exclude={'password'})
    utente = Utente(**utente_data)
    
    # TODO: Hash password quando implementato
    if data.password:
        utente.password_hash = data.password  # Da hashare
    
    db.add(utente)
    db.commit()
    db.refresh(utente)
    return utente


@app.put("/api/utenti/{utente_id}", response_model=UtenteSchema)
def update_utente(utente_id: int, data: UtenteUpdate, db: Session = Depends(get_db)):
    """Aggiorna utente"""
    utente = db.query(Utente).filter(Utente.id == utente_id).first()
    if not utente:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    update_data = data.dict(exclude_unset=True, exclude={'password'})
    for key, value in update_data.items():
        setattr(utente, key, value)
    
    if data.password:
        utente.password_hash = data.password  # Da hashare
    
    db.commit()
    db.refresh(utente)
    return utente


@app.delete("/api/utenti/{utente_id}")
def delete_utente(utente_id: int, db: Session = Depends(get_db)):
    """Elimina utente (soft delete)"""
    utente = db.query(Utente).filter(Utente.id == utente_id).first()
    if not utente:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    utente.is_active = False
    db.commit()
    return {"message": "Utente disattivato"}


# ==========================================
# CLIENTI ENDPOINTS
# ==========================================
@app.get("/api/clienti", response_model=List[ClienteSchema])
def get_clienti(
    include_inactive: bool = False,
    search: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Ottieni tutti i clienti"""
    query = db.query(Cliente)
    
    if not include_inactive:
        query = query.filter(Cliente.is_active == True)
    
    if search:
        search_filter = f"%{search}%"
        query = query.filter(
            or_(
                Cliente.codice.ilike(search_filter),
                Cliente.ragione_sociale.ilike(search_filter),
                Cliente.partita_iva.ilike(search_filter),
                Cliente.citta.ilike(search_filter)
            )
        )
    
    return query.order_by(Cliente.ragione_sociale).offset(offset).limit(limit).all()


@app.get("/api/clienti/{cliente_id}", response_model=ClienteSchema)
def get_cliente(cliente_id: int, db: Session = Depends(get_db)):
    """Ottieni un cliente specifico"""
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    return cliente


@app.post("/api/clienti", response_model=ClienteSchema, status_code=201)
def create_cliente(data: ClienteCreate, db: Session = Depends(get_db)):
    """Crea nuovo cliente"""
    existing = db.query(Cliente).filter(Cliente.codice == data.codice).first()
    if existing:
        raise HTTPException(status_code=400, detail="Codice cliente già esistente")
    
    cliente = Cliente(**data.dict())
    db.add(cliente)
    db.commit()
    db.refresh(cliente)
    return cliente


@app.put("/api/clienti/{cliente_id}", response_model=ClienteSchema)
def update_cliente(cliente_id: int, data: ClienteUpdate, db: Session = Depends(get_db)):
    """Aggiorna cliente"""
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(cliente, key, value)
    
    db.commit()
    db.refresh(cliente)
    return cliente


@app.delete("/api/clienti/{cliente_id}")
def delete_cliente(cliente_id: int, db: Session = Depends(get_db)):
    """Elimina cliente (soft delete)"""
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).first()
    if not cliente:
        raise HTTPException(status_code=404, detail="Cliente non trovato")
    
    cliente.is_active = False
    db.commit()
    return {"message": "Cliente disattivato"}


# ==========================================
# CATEGORIE ARTICOLI ENDPOINTS
# ==========================================
@app.get("/api/categorie-articoli", response_model=List[CategoriaArticoloSchema])
def get_categorie_articoli(
    include_inactive: bool = False,
    db: Session = Depends(get_db)
):
    """Ottieni tutte le categorie"""
    query = db.query(CategoriaArticolo)
    if not include_inactive:
        query = query.filter(CategoriaArticolo.is_active == True)
    return query.order_by(CategoriaArticolo.ordine, CategoriaArticolo.nome).all()


@app.post("/api/categorie-articoli", response_model=CategoriaArticoloSchema, status_code=201)
def create_categoria_articolo(data: CategoriaArticoloCreate, db: Session = Depends(get_db)):
    """Crea nuova categoria"""
    existing = db.query(CategoriaArticolo).filter(CategoriaArticolo.codice == data.codice).first()
    if existing:
        raise HTTPException(status_code=400, detail="Codice categoria già esistente")
    
    categoria = CategoriaArticolo(**data.dict())
    db.add(categoria)
    db.commit()
    db.refresh(categoria)
    return categoria


@app.put("/api/categorie-articoli/{categoria_id}", response_model=CategoriaArticoloSchema)
def update_categoria_articolo(categoria_id: int, data: CategoriaArticoloUpdate, db: Session = Depends(get_db)):
    """Aggiorna categoria"""
    categoria = db.query(CategoriaArticolo).filter(CategoriaArticolo.id == categoria_id).first()
    if not categoria:
        raise HTTPException(status_code=404, detail="Categoria non trovata")
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(categoria, key, value)
    
    db.commit()
    db.refresh(categoria)
    return categoria


# ==========================================
# ARTICOLI ENDPOINTS
# ==========================================
@app.get("/api/articoli", response_model=List[ArticoloConCategoria])
def get_articoli(
    include_inactive: bool = False,
    categoria_id: Optional[int] = None,
    tipo_articolo: Optional[str] = None,
    limit: int = Query(default=100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """Ottieni tutti gli articoli"""
    query = db.query(Articolo)
    
    if not include_inactive:
        query = query.filter(Articolo.is_active == True)
    if categoria_id:
        query = query.filter(Articolo.categoria_id == categoria_id)
    if tipo_articolo:
        query = query.filter(Articolo.tipo_articolo == tipo_articolo)
    
    return query.order_by(Articolo.codice).offset(offset).limit(limit).all()


@app.get("/api/articoli/search", response_model=List[ArticoloSearchResult])
def search_articoli(
    q: str = Query(..., min_length=2, description="Query di ricerca"),
    categoria_id: Optional[int] = None,
    tipo_articolo: Optional[str] = None,
    complessivo_id: Optional[int] = None,
    limit: int = Query(default=20, le=100),
    db: Session = Depends(get_db)
):
    """
    Ricerca articoli (per autocomplete e ricerca avanzata)
    Cerca su: codice, descrizione
    """
    search_filter = f"%{q}%"
    
    query = db.query(
        Articolo.id,
        Articolo.codice,
        Articolo.descrizione,
        Articolo.tipo_articolo,
        Articolo.prezzo_listino,
        Articolo.unita_misura,
        CategoriaArticolo.nome.label('categoria_nome')
    ).outerjoin(CategoriaArticolo)
    
    query = query.filter(
        Articolo.is_active == True,
        or_(
            Articolo.codice.ilike(search_filter),
            Articolo.descrizione.ilike(search_filter)
        )
    )
    
    if categoria_id:
        query = query.filter(Articolo.categoria_id == categoria_id)
    if tipo_articolo:
        query = query.filter(Articolo.tipo_articolo == tipo_articolo)
    if complessivo_id:
        query = query.filter(Articolo.complessivo_padre_id == complessivo_id)
    
    results = query.limit(limit).all()
    
    return [
        ArticoloSearchResult(
            id=r.id,
            codice=r.codice,
            descrizione=r.descrizione,
            tipo_articolo=r.tipo_articolo,
            prezzo_listino=float(r.prezzo_listino or 0),
            unita_misura=r.unita_misura or "PZ",
            categoria_nome=r.categoria_nome
        )
        for r in results
    ]


@app.get("/api/articoli/{articolo_id}", response_model=ArticoloConCategoria)
def get_articolo(articolo_id: int, db: Session = Depends(get_db)):
    """Ottieni un articolo specifico"""
    articolo = db.query(Articolo).filter(Articolo.id == articolo_id).first()
    if not articolo:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    return articolo


@app.post("/api/articoli", response_model=ArticoloSchema, status_code=201)
def create_articolo(data: ArticoloCreate, db: Session = Depends(get_db)):
    """Crea nuovo articolo"""
    existing = db.query(Articolo).filter(Articolo.codice == data.codice).first()
    if existing:
        raise HTTPException(status_code=400, detail="Codice articolo già esistente")
    
    articolo = Articolo(**data.dict())
    db.add(articolo)
    db.commit()
    db.refresh(articolo)
    return articolo


@app.put("/api/articoli/{articolo_id}", response_model=ArticoloSchema)
def update_articolo(articolo_id: int, data: ArticoloUpdate, db: Session = Depends(get_db)):
    """Aggiorna articolo"""
    articolo = db.query(Articolo).filter(Articolo.id == articolo_id).first()
    if not articolo:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(articolo, key, value)
    
    db.commit()
    db.refresh(articolo)
    return articolo


@app.delete("/api/articoli/{articolo_id}")
def delete_articolo(articolo_id: int, db: Session = Depends(get_db)):
    """Elimina articolo (soft delete)"""
    articolo = db.query(Articolo).filter(Articolo.id == articolo_id).first()
    if not articolo:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    
    articolo.is_active = False
    db.commit()
    return {"message": "Articolo disattivato"}


# ==========================================
# CALCOLO PREZZO ENDPOINT
# ==========================================
@app.post("/api/articoli/calcola-prezzo", response_model=CalcoloPrezzoOutput)
def calcola_prezzo_endpoint(data: CalcoloPrezzoInput, db: Session = Depends(get_db)):
    """
    Calcola prezzo articolo con sistema a 3 livelli:
    1. Costo base (fisso + variabile × parametro)
    2. Prezzo listino (costo × (1 + ricarico%))
    3. Prezzo finale (listino × (1 - sconto%))
    """
    articolo = db.query(Articolo).filter(Articolo.id == data.articolo_id).first()
    if not articolo:
        raise HTTPException(status_code=404, detail="Articolo non trovato")
    
    return calcola_prezzo_articolo(
        db=db,
        articolo=articolo,
        quantita=data.quantita,
        parametro_calcolo=data.parametro_calcolo,
        cliente_id=data.cliente_id
    )


# ==========================================
# PREVENTIVI ENDPOINTS
# ==========================================
@app.get("/api/preventivi", response_model=List[PreventivoConCliente])
def get_preventivi(
    tipo_preventivo: Optional[str] = None,
    cliente_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Ottieni tutti i preventivi"""
    query = db.query(Preventivo)
    
    if tipo_preventivo:
        query = query.filter(Preventivo.tipo_preventivo == tipo_preventivo)
    if cliente_id:
        query = query.filter(Preventivo.cliente_id == cliente_id)
    if status:
        query = query.filter(Preventivo.status == status)
    
    return query.order_by(Preventivo.created_at.desc()).all()


@app.get("/api/preventivi/{preventivo_id}", response_model=PreventivoCompleto)
def get_preventivo(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni un preventivo specifico"""
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    return preventivo


@app.post("/api/preventivi", response_model=PreventivoSchema, status_code=201)
def create_preventivo(data: PreventivoCreate, db: Session = Depends(get_db)):
    """Crea nuovo preventivo"""
    from datetime import datetime
    
    # Genera numero preventivo
    if not data.numero_preventivo:
        anno = datetime.now().year
        ultimo = db.query(Preventivo).filter(
            Preventivo.numero_preventivo.like(f"{anno}/%")
        ).order_by(Preventivo.id.desc()).first()
        
        if ultimo:
            try:
                ultimo_num = int(ultimo.numero_preventivo.split("/")[1])
            except:
                ultimo_num = 0
        else:
            ultimo_num = 0
        
        numero_preventivo = f"{anno}/{str(ultimo_num + 1).zfill(4)}"
    else:
        numero_preventivo = data.numero_preventivo
    
    # Se cliente_id specificato, popola anche customer_name
    customer_name = data.customer_name
    if data.cliente_id and not customer_name:
        cliente = db.query(Cliente).filter(Cliente.id == data.cliente_id).first()
        if cliente:
            customer_name = cliente.ragione_sociale
    
    preventivo = Preventivo(
        numero_preventivo=numero_preventivo,
        tipo_preventivo=data.tipo_preventivo or "COMPLETO",
        cliente_id=data.cliente_id,
        customer_name=customer_name,
        status=data.status or "draft",
        total_price=data.total_price or 0.0
    )
    
    db.add(preventivo)
    db.commit()
    db.refresh(preventivo)
    return preventivo


@app.put("/api/preventivi/{preventivo_id}", response_model=PreventivoSchema)
def update_preventivo(preventivo_id: int, data: PreventivoUpdate, db: Session = Depends(get_db)):
    """Aggiorna preventivo"""
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    update_data = data.dict(exclude_unset=True)
    
    # Se cambia cliente_id, aggiorna anche customer_name
    if 'cliente_id' in update_data and update_data['cliente_id']:
        cliente = db.query(Cliente).filter(Cliente.id == update_data['cliente_id']).first()
        if cliente and 'customer_name' not in update_data:
            update_data['customer_name'] = cliente.ragione_sociale
    
    for key, value in update_data.items():
        setattr(preventivo, key, value)
    
    db.commit()
    db.refresh(preventivo)
    return preventivo


@app.delete("/api/preventivi/{preventivo_id}")
def delete_preventivo(preventivo_id: int, db: Session = Depends(get_db)):
    """Elimina preventivo"""
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    db.delete(preventivo)
    db.commit()
    return {"message": "Preventivo eliminato"}


# ==========================================
# RIGHE RICAMBIO ENDPOINTS
# ==========================================
@app.get("/api/preventivi/{preventivo_id}/righe-ricambio", response_model=List[RigaRicambioSchema])
def get_righe_ricambio(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni tutte le righe ricambio di un preventivo"""
    return db.query(RigaRicambio).filter(
        RigaRicambio.preventivo_id == preventivo_id
    ).order_by(RigaRicambio.ordine).all()


@app.post("/api/preventivi/{preventivo_id}/righe-ricambio", response_model=RigaRicambioSchema, status_code=201)
def create_riga_ricambio(
    preventivo_id: int,
    data: RigaRicambioCreate,
    db: Session = Depends(get_db)
):
    """
    Crea nuova riga ricambio con calcolo automatico prezzi.
    Se articolo_id è specificato, calcola automaticamente i prezzi.
    """
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    riga_data = data.dict(exclude={'preventivo_id'})
    
    # Se c'è un articolo_id, calcola i prezzi
    if data.articolo_id:
        articolo = db.query(Articolo).filter(Articolo.id == data.articolo_id).first()
        if articolo:
            calcolo = calcola_prezzo_articolo(
                db=db,
                articolo=articolo,
                quantita=float(data.quantita or 1),
                parametro_calcolo=float(data.parametro_calcolo) if data.parametro_calcolo else None,
                cliente_id=preventivo.cliente_id
            )
            
            riga_data['codice_articolo'] = articolo.codice
            riga_data['descrizione'] = articolo.descrizione
            riga_data['costo_base'] = calcolo.costo_base_unitario
            riga_data['prezzo_listino'] = calcolo.prezzo_listino_unitario
            riga_data['ricarico_applicato'] = calcolo.ricarico_percentuale
            riga_data['sconto_cliente'] = calcolo.sconto_cliente_percentuale
            riga_data['prezzo_unitario'] = calcolo.prezzo_finale_unitario
            riga_data['prezzo_totale'] = calcolo.prezzo_totale
    else:
        # Calcola totale manuale
        riga_data['prezzo_totale'] = float(riga_data.get('prezzo_unitario', 0)) * float(riga_data.get('quantita', 1))
    
    riga = RigaRicambio(preventivo_id=preventivo_id, **riga_data)
    db.add(riga)
    db.commit()
    db.refresh(riga)
    
    # Aggiorna totali preventivo
    _aggiorna_totali_preventivo_ricambio(db, preventivo_id)
    
    return riga


@app.put("/api/preventivi/{preventivo_id}/righe-ricambio/{riga_id}", response_model=RigaRicambioSchema)
def update_riga_ricambio(
    preventivo_id: int,
    riga_id: int,
    data: RigaRicambioUpdate,
    db: Session = Depends(get_db)
):
    """Aggiorna riga ricambio"""
    riga = db.query(RigaRicambio).filter(
        RigaRicambio.id == riga_id,
        RigaRicambio.preventivo_id == preventivo_id
    ).first()
    
    if not riga:
        raise HTTPException(status_code=404, detail="Riga non trovata")
    
    update_data = data.dict(exclude_unset=True)
    
    for key, value in update_data.items():
        setattr(riga, key, value)
    
    # Ricalcola totale riga
    if 'quantita' in update_data or 'prezzo_unitario' in update_data:
        riga.prezzo_totale = float(riga.prezzo_unitario or 0) * float(riga.quantita or 1)
    
    db.commit()
    db.refresh(riga)
    
    # Aggiorna totali preventivo
    _aggiorna_totali_preventivo_ricambio(db, preventivo_id)
    
    return riga


@app.delete("/api/preventivi/{preventivo_id}/righe-ricambio/{riga_id}")
def delete_riga_ricambio(
    preventivo_id: int,
    riga_id: int,
    db: Session = Depends(get_db)
):
    """Elimina riga ricambio"""
    riga = db.query(RigaRicambio).filter(
        RigaRicambio.id == riga_id,
        RigaRicambio.preventivo_id == preventivo_id
    ).first()
    
    if not riga:
        raise HTTPException(status_code=404, detail="Riga non trovata")
    
    db.delete(riga)
    db.commit()
    
    # Aggiorna totali preventivo
    _aggiorna_totali_preventivo_ricambio(db, preventivo_id)
    
    return {"message": "Riga eliminata"}


@app.post("/api/preventivi/{preventivo_id}/righe-ricambio/batch", response_model=SuccessResponse)
def add_righe_ricambio_batch(
    preventivo_id: int,
    data: AggiuntaBatchArticoli,
    db: Session = Depends(get_db)
):
    """
    Aggiunge multipli articoli in una volta (da ricerca avanzata).
    Input: lista di {articolo_id, quantita, parametro_calcolo}
    """
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    
    cliente_id = data.cliente_id or preventivo.cliente_id
    added_count = 0
    
    for item in data.articoli:
        articolo_id = item.get('articolo_id')
        quantita = item.get('quantita', 1)
        parametro = item.get('parametro_calcolo')
        
        articolo = db.query(Articolo).filter(Articolo.id == articolo_id).first()
        if not articolo:
            continue
        
        calcolo = calcola_prezzo_articolo(
            db=db,
            articolo=articolo,
            quantita=float(quantita),
            parametro_calcolo=float(parametro) if parametro else None,
            cliente_id=cliente_id
        )
        
        riga = RigaRicambio(
            preventivo_id=preventivo_id,
            articolo_id=articolo_id,
            codice_articolo=articolo.codice,
            descrizione=articolo.descrizione,
            quantita=quantita,
            unita_misura=articolo.unita_misura,
            parametro_calcolo=parametro,
            costo_base=calcolo.costo_base_unitario,
            prezzo_listino=calcolo.prezzo_listino_unitario,
            ricarico_applicato=calcolo.ricarico_percentuale,
            sconto_cliente=calcolo.sconto_cliente_percentuale,
            prezzo_unitario=calcolo.prezzo_finale_unitario,
            prezzo_totale=calcolo.prezzo_totale
        )
        
        db.add(riga)
        added_count += 1
    
    db.commit()
    
    # Aggiorna totali preventivo
    _aggiorna_totali_preventivo_ricambio(db, preventivo_id)
    
    return SuccessResponse(
        success=True,
        message=f"Aggiunti {added_count} articoli",
        data={"added_count": added_count}
    )


def _aggiorna_totali_preventivo_ricambio(db: Session, preventivo_id: int):
    """Helper per aggiornare i totali del preventivo ricambio"""
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        return
    
    righe = db.query(RigaRicambio).filter(RigaRicambio.preventivo_id == preventivo_id).all()
    
    totale_lordo = sum(float(r.prezzo_listino or 0) * float(r.quantita or 1) for r in righe)
    totale_netto = sum(float(r.prezzo_totale or 0) for r in righe)
    totale_sconti = totale_lordo - totale_netto
    
    preventivo.totale_lordo = totale_lordo
    preventivo.totale_sconti = totale_sconti
    preventivo.totale_netto = totale_netto
    preventivo.total_price = totale_netto
    
    db.commit()


# ==========================================
# SEZIONI ESISTENTI (DATI COMMESSA, PRINCIPALI, ECC.)
# ==========================================
@app.get("/api/preventivi/{preventivo_id}/dati-commessa", response_model=DatiCommessaSchema)
def get_dati_commessa(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni dati commessa, crea se non esiste"""
    dati = db.query(DatiCommessa).filter(DatiCommessa.preventivo_id == preventivo_id).first()
    if not dati:
        dati = DatiCommessa(preventivo_id=preventivo_id)
        db.add(dati)
        db.commit()
        db.refresh(dati)
    return dati


@app.put("/api/preventivi/{preventivo_id}/dati-commessa", response_model=DatiCommessaSchema)
def update_dati_commessa(preventivo_id: int, data: DatiCommessaUpdate, db: Session = Depends(get_db)):
    """Aggiorna dati commessa"""
    dati = db.query(DatiCommessa).filter(DatiCommessa.preventivo_id == preventivo_id).first()
    if not dati:
        dati = DatiCommessa(preventivo_id=preventivo_id)
        db.add(dati)
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(dati, key, value)
    
    db.commit()
    db.refresh(dati)
    return dati


@app.get("/api/preventivi/{preventivo_id}/dati-principali", response_model=DatiPrincipaliSchema)
def get_dati_principali(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni dati principali, crea se non esiste"""
    dati = db.query(DatiPrincipali).filter(DatiPrincipali.preventivo_id == preventivo_id).first()
    if not dati:
        dati = DatiPrincipali(preventivo_id=preventivo_id)
        db.add(dati)
        db.commit()
        db.refresh(dati)
    return dati


@app.put("/api/preventivi/{preventivo_id}/dati-principali", response_model=DatiPrincipaliSchema)
def update_dati_principali(preventivo_id: int, data: DatiPrincipaliUpdate, db: Session = Depends(get_db)):
    """Aggiorna dati principali e valuta regole"""
    dati = db.query(DatiPrincipali).filter(DatiPrincipali.preventivo_id == preventivo_id).first()
    if not dati:
        dati = DatiPrincipali(preventivo_id=preventivo_id)
        db.add(dati)
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(dati, key, value)
    
    db.commit()
    db.refresh(dati)
    
    # Valuta regole
    evaluate_rules(preventivo_id, db)
    
    return dati


@app.get("/api/preventivi/{preventivo_id}/normative", response_model=NormativeSchema)
def get_normative(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni normative, crea se non esiste"""
    normative = db.query(Normative).filter(Normative.preventivo_id == preventivo_id).first()
    if not normative:
        normative = Normative(preventivo_id=preventivo_id)
        db.add(normative)
        db.commit()
        db.refresh(normative)
    return normative


@app.put("/api/preventivi/{preventivo_id}/normative", response_model=NormativeSchema)
def update_normative(preventivo_id: int, data: NormativeUpdate, db: Session = Depends(get_db)):
    """Aggiorna normative e valuta regole"""
    normative = db.query(Normative).filter(Normative.preventivo_id == preventivo_id).first()
    if not normative:
        normative = Normative(preventivo_id=preventivo_id)
        db.add(normative)
    
    for key, value in data.dict(exclude_unset=True).items():
        setattr(normative, key, value)
    
    db.commit()
    db.refresh(normative)
    
    # Valuta regole
    evaluate_rules(preventivo_id, db)
    
    return normative


@app.get("/api/preventivi/{preventivo_id}/disposizione-vano", response_model=DisposizioneVanoSchema)
def get_disposizione_vano(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni disposizione vano, crea se non esiste"""
    disposizione = db.query(DisposizioneVano).filter(DisposizioneVano.preventivo_id == preventivo_id).first()
    if not disposizione:
        disposizione = DisposizioneVano(preventivo_id=preventivo_id)
        db.add(disposizione)
        db.commit()
        db.refresh(disposizione)
    return disposizione


@app.put("/api/preventivi/{preventivo_id}/disposizione-vano", response_model=DisposizioneVanoSchema)
def update_disposizione_vano(preventivo_id: int, data: DisposizioneVanoUpdate, db: Session = Depends(get_db)):
    """Aggiorna disposizione vano"""
    disposizione = db.query(DisposizioneVano).filter(DisposizioneVano.preventivo_id == preventivo_id).first()
    if not disposizione:
        disposizione = DisposizioneVano(preventivo_id=preventivo_id)
        db.add(disposizione)
    
    data_dict = data.dict(exclude_unset=True)
    cleaned_data = {}
    for key, value in data_dict.items():
        if value == '' or value == '{}' or value == '[]':
            cleaned_data[key] = None
        else:
            cleaned_data[key] = value
    
    for key, value in cleaned_data.items():
        setattr(disposizione, key, value)
    
    db.commit()
    db.refresh(disposizione)
    return disposizione


@app.get("/api/preventivi/{preventivo_id}/porte", response_model=PorteSchema)
def get_porte(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni dati porte, crea se non esiste"""
    porte = db.query(Porte).filter(Porte.preventivo_id == preventivo_id).first()
    if not porte:
        porte = Porte(preventivo_id=preventivo_id)
        db.add(porte)
        db.commit()
        db.refresh(porte)
    return porte


@app.put("/api/preventivi/{preventivo_id}/porte", response_model=PorteSchema)
def update_porte(preventivo_id: int, data: PorteUpdate, db: Session = Depends(get_db)):
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
# MATERIALI (per preventivi COMPLETO)
# ==========================================
@app.get("/api/preventivi/{preventivo_id}/materiali", response_model=List[MaterialeSchema])
def get_materiali(preventivo_id: int, db: Session = Depends(get_db)):
    """Ottieni tutti i materiali di un preventivo"""
    return db.query(Materiale).filter(Materiale.preventivo_id == preventivo_id).all()


@app.post("/api/preventivi/{preventivo_id}/materiali", response_model=MaterialeSchema)
def create_materiale(preventivo_id: int, data: MaterialeCreate, db: Session = Depends(get_db)):
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
    _aggiorna_totale_preventivo_completo(db, preventivo_id)
    
    return materiale


@app.put("/api/preventivi/{preventivo_id}/materiali/{materiale_id}", response_model=MaterialeSchema)
def update_materiale(preventivo_id: int, materiale_id: int, data: MaterialeUpdate, db: Session = Depends(get_db)):
    """Aggiorna materiale"""
    materiale = db.query(Materiale).filter(
        Materiale.id == materiale_id,
        Materiale.preventivo_id == preventivo_id
    ).first()
    
    if not materiale:
        raise HTTPException(status_code=404, detail="Materiale non trovato")
    
    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(materiale, key, value)
    
    if 'quantita' in update_data or 'prezzo_unitario' in update_data:
        materiale.prezzo_totale = materiale.quantita * materiale.prezzo_unitario
    
    db.commit()
    db.refresh(materiale)
    
    _aggiorna_totale_preventivo_completo(db, preventivo_id)
    
    return materiale


@app.delete("/api/preventivi/{preventivo_id}/materiali/{materiale_id}")
def delete_materiale(preventivo_id: int, materiale_id: int, db: Session = Depends(get_db)):
    """Elimina materiale"""
    materiale = db.query(Materiale).filter(
        Materiale.id == materiale_id,
        Materiale.preventivo_id == preventivo_id
    ).first()
    
    if not materiale:
        raise HTTPException(status_code=404, detail="Materiale non trovato")
    
    db.delete(materiale)
    db.commit()
    
    _aggiorna_totale_preventivo_completo(db, preventivo_id)
    
    return {"message": "Materiale eliminato"}


def _aggiorna_totale_preventivo_completo(db: Session, preventivo_id: int):
    """Helper per aggiornare il totale del preventivo completo"""
    preventivo = db.query(Preventivo).filter(Preventivo.id == preventivo_id).first()
    if not preventivo:
        return
    
    materiali = db.query(Materiale).filter(Materiale.preventivo_id == preventivo_id).all()
    totale = sum(m.prezzo_totale for m in materiali)
    preventivo.total_price = totale
    db.commit()


# ==========================================
# RULE ENGINE ENDPOINT
# ==========================================
@app.post("/api/preventivi/{preventivo_id}/evaluate-rules")
def evaluate_rules_endpoint(preventivo_id: int, db: Session = Depends(get_db)):
    """Endpoint per valutare manualmente le regole"""
    return evaluate_rules(preventivo_id, db)


# ==========================================
# INIT DATA ENDPOINT
# ==========================================
@app.post("/api/init-data", response_model=SuccessResponse)
def init_data(db: Session = Depends(get_db)):
    """Inizializza dati di default nel sistema"""
    
    # Parametri sistema default
    default_params = [
        ("ricarico_produzione_default", "30.00", "Ricarico % default per articoli di PRODUZIONE", "number", "ricarichi"),
        ("ricarico_acquisto_default", "15.00", "Ricarico % default per articoli di ACQUISTO", "number", "ricarichi"),
        ("iva_default", "22.00", "Aliquota IVA default", "number", "fiscale"),
    ]
    
    for chiave, valore, descrizione, tipo_dato, gruppo in default_params:
        existing = db.query(ParametriSistema).filter(ParametriSistema.chiave == chiave).first()
        if not existing:
            db.add(ParametriSistema(
                chiave=chiave,
                valore=valore,
                descrizione=descrizione,
                tipo_dato=tipo_dato,
                gruppo=gruppo
            ))
    
    # Gruppi utenti default
    default_groups = [
        ("Amministratori", "Accesso completo al sistema", True),
        ("Commerciali", "Gestione preventivi e clienti", False),
        ("Tecnici", "Gestione configurazioni tecniche", False),
        ("Visualizzatori", "Solo visualizzazione", False),
    ]
    
    for nome, descrizione, is_admin in default_groups:
        existing = db.query(GruppoUtenti).filter(GruppoUtenti.nome == nome).first()
        if not existing:
            db.add(GruppoUtenti(
                nome=nome,
                descrizione=descrizione,
                is_admin=is_admin
            ))
    
    # Categorie articoli default
    default_categorie = [
        ("CAVI", "Cavi e conduttori", 1),
        ("COMPONENTI", "Componenti elettrici", 2),
        ("QUADRI", "Quadri e contenitori", 3),
        ("ACCESSORI", "Accessori vari", 4),
    ]
    
    for codice, nome, ordine in default_categorie:
        existing = db.query(CategoriaArticolo).filter(CategoriaArticolo.codice == codice).first()
        if not existing:
            db.add(CategoriaArticolo(
                codice=codice,
                nome=nome,
                ordine=ordine
            ))
    
    db.commit()
    
    return SuccessResponse(
        success=True,
        message="Dati di default inizializzati"
    )


# ==========================================
# STARTUP
# ==========================================
if __name__ == "__main__":
    import uvicorn
    print("🚀 Avvio Configuratore Elettroquadri API v2.0.0")
    print("📡 Server in ascolto su http://0.0.0.0:8000")
    print("📖 Documentazione API: http://0.0.0.0:8000/docs")
    print("\n✨ NUOVE FUNZIONALITÀ v2.0:")
    print("   ✅ Gestione tipo preventivo (COMPLETO/RICAMBIO)")
    print("   ✅ Anagrafica clienti con sconti")
    print("   ✅ Anagrafica articoli con costi")
    print("   ✅ Calcolo prezzo a 3 livelli")
    print("   ✅ Gestione utenti e gruppi")
    print("   ✅ Parametri sistema configurabili")
    uvicorn.run(app, host="0.0.0.0", port=8000)
