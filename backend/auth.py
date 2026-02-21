# auth.py - Sistema di autenticazione con gruppi, ruoli e permessi

from datetime import datetime, timedelta
from typing import Optional, List
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Utente, GruppoUtenti, PermessoGruppo, Ruolo, PermessoRuolo

# Configurazione
SECRET_KEY = "elettroquadri-secret-key-change-in-production-2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 ore

# OAuth2
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ==========================================
# CATALOGO PERMESSI DISPONIBILI
# ==========================================
PERMESSI_CATALOGO = [
    # --- Preventivi ---
    {"codice": "preventivi.view", "categoria": "Preventivi", "descrizione": "Visualizzare preventivi"},
    {"codice": "preventivi.create", "categoria": "Preventivi", "descrizione": "Creare nuovi preventivi"},
    {"codice": "preventivi.edit", "categoria": "Preventivi", "descrizione": "Modificare preventivi"},
    {"codice": "preventivi.delete", "categoria": "Preventivi", "descrizione": "Eliminare preventivi"},
    {"codice": "preventivi.export_pdf", "categoria": "Preventivi", "descrizione": "Esportare PDF"},
    # --- Prezzi ---
    {"codice": "prezzi.view", "categoria": "Prezzi", "descrizione": "Visualizzare prezzi e costi"},
    {"codice": "prezzi.edit", "categoria": "Prezzi", "descrizione": "Modificare prezzi e sconti"},
    # --- Clienti ---
    {"codice": "clienti.view", "categoria": "Clienti", "descrizione": "Visualizzare anagrafica clienti"},
    {"codice": "clienti.edit", "categoria": "Clienti", "descrizione": "Modificare anagrafica clienti"},
    # --- Materiali ---
    {"codice": "materiali.view", "categoria": "Materiali", "descrizione": "Visualizzare materiali"},
    {"codice": "materiali.edit", "categoria": "Materiali", "descrizione": "Aggiungere/rimuovere materiali"},
    # --- Ricambi ---
    {"codice": "ricambi.view", "categoria": "Ricambi", "descrizione": "Visualizzare ricambi"},
    {"codice": "ricambi.edit", "categoria": "Ricambi", "descrizione": "Gestire ricambi"},
    # --- Sezioni configuratore ---
    {"codice": "sezione.dati_commessa.view", "categoria": "Sezioni", "descrizione": "Vedere Dati Commessa"},
    {"codice": "sezione.dati_commessa.edit", "categoria": "Sezioni", "descrizione": "Modificare Dati Commessa"},
    {"codice": "sezione.dati_principali.view", "categoria": "Sezioni", "descrizione": "Vedere Dati Principali"},
    {"codice": "sezione.dati_principali.edit", "categoria": "Sezioni", "descrizione": "Modificare Dati Principali"},
    {"codice": "sezione.normative.view", "categoria": "Sezioni", "descrizione": "Vedere Normative"},
    {"codice": "sezione.normative.edit", "categoria": "Sezioni", "descrizione": "Modificare Normative"},
    {"codice": "sezione.disposizione_vano.view", "categoria": "Sezioni", "descrizione": "Vedere Disposizione Vano"},
    {"codice": "sezione.disposizione_vano.edit", "categoria": "Sezioni", "descrizione": "Modificare Disposizione Vano"},
    {"codice": "sezione.argano.view", "categoria": "Sezioni", "descrizione": "Vedere Argano"},
    {"codice": "sezione.argano.edit", "categoria": "Sezioni", "descrizione": "Modificare Argano"},
    {"codice": "sezione.porte.view", "categoria": "Sezioni", "descrizione": "Vedere Porte"},
    {"codice": "sezione.porte.edit", "categoria": "Sezioni", "descrizione": "Modificare Porte"},
    {"codice": "sezione.materiali.view", "categoria": "Sezioni", "descrizione": "Vedere sezione Materiali"},
    {"codice": "sezione.materiali.edit", "categoria": "Sezioni", "descrizione": "Modificare sezione Materiali"},
    {"codice": "sezione.ordine.view", "categoria": "Sezioni", "descrizione": "Vedere Ordine & BOM"},
    {"codice": "sezione.ordine.edit", "categoria": "Sezioni", "descrizione": "Modificare Ordine & BOM"},
    # --- Amministrazione ---
    {"codice": "admin.utenti", "categoria": "Admin", "descrizione": "Gestione utenti e ruoli"},
    {"codice": "admin.articoli", "categoria": "Admin", "descrizione": "Gestione articoli"},
    {"codice": "admin.bom", "categoria": "Admin", "descrizione": "Gestione BOM"},
    {"codice": "admin.clienti", "categoria": "Admin", "descrizione": "Gestione clienti (admin)"},
    {"codice": "admin.opzioni", "categoria": "Admin", "descrizione": "Gestione opzioni dropdown"},
    {"codice": "admin.campi", "categoria": "Admin", "descrizione": "Gestione campi configuratore"},
    {"codice": "admin.sezioni", "categoria": "Admin", "descrizione": "Gestione sezioni"},
    {"codice": "admin.regole", "categoria": "Admin", "descrizione": "Rule engine"},
    {"codice": "admin.template_doc", "categoria": "Admin", "descrizione": "Template documenti"},
]


# ==========================================
# DEFINIZIONI RUOLI DI DEFAULT
# ==========================================
RUOLI_DEFAULT = {
    "superadmin": {
        "nome": "Super Amministratore",
        "descrizione": "Accesso completo a tutto il sistema",
        "gruppo": "Elettroquadri",
        "is_superadmin": True,
        "permessi": ["*"]  # Tutti i permessi
    },
    "responsabile_eq": {
        "nome": "Responsabile",
        "descrizione": "Responsabile commerciale/tecnico Elettroquadri",
        "gruppo": "Elettroquadri",
        "is_superadmin": False,
        "permessi": [
            "preventivi.view", "preventivi.create", "preventivi.edit", "preventivi.delete", "preventivi.export_pdf",
            "prezzi.view", "prezzi.edit",
            "clienti.view", "clienti.edit",
            "materiali.view", "materiali.edit",
            "ricambi.view", "ricambi.edit",
            "sezione.dati_commessa.view", "sezione.dati_commessa.edit",
            "sezione.dati_principali.view", "sezione.dati_principali.edit",
            "sezione.normative.view", "sezione.normative.edit",
            "sezione.disposizione_vano.view", "sezione.disposizione_vano.edit",
            "sezione.argano.view", "sezione.argano.edit",
            "sezione.porte.view", "sezione.porte.edit",
            "sezione.materiali.view", "sezione.materiali.edit",
            "sezione.ordine.view", "sezione.ordine.edit",
            "admin.articoli", "admin.clienti", "admin.regole",
        ]
    },
    "commerciale_eq": {
        "nome": "Commerciale",
        "descrizione": "Operatore commerciale Elettroquadri",
        "gruppo": "Elettroquadri",
        "is_superadmin": False,
        "permessi": [
            "preventivi.view", "preventivi.create", "preventivi.edit", "preventivi.export_pdf",
            "prezzi.view",
            "clienti.view", "clienti.edit",
            "materiali.view",
            "ricambi.view", "ricambi.edit",
            "sezione.dati_commessa.view", "sezione.dati_commessa.edit",
            "sezione.dati_principali.view", "sezione.dati_principali.edit",
            "sezione.normative.view", "sezione.normative.edit",
            "sezione.disposizione_vano.view", "sezione.disposizione_vano.edit",
            "sezione.argano.view", "sezione.argano.edit",
            "sezione.porte.view", "sezione.porte.edit",
            "sezione.materiali.view",
            "sezione.ordine.view",
        ]
    },
    "tecnico_eq": {
        "nome": "Tecnico",
        "descrizione": "Operatore tecnico Elettroquadri",
        "gruppo": "Elettroquadri",
        "is_superadmin": False,
        "permessi": [
            "preventivi.view", "preventivi.edit",
            "materiali.view", "materiali.edit",
            "sezione.dati_commessa.view",
            "sezione.dati_principali.view", "sezione.dati_principali.edit",
            "sezione.normative.view", "sezione.normative.edit",
            "sezione.disposizione_vano.view", "sezione.disposizione_vano.edit",
            "sezione.argano.view", "sezione.argano.edit",
            "sezione.porte.view", "sezione.porte.edit",
            "sezione.materiali.view", "sezione.materiali.edit",
            "sezione.ordine.view", "sezione.ordine.edit",
        ]
    },
    "cliente_base": {
        "nome": "Cliente",
        "descrizione": "Accesso base per clienti esterni",
        "gruppo": "Clienti",
        "is_superadmin": False,
        "permessi": [
            "preventivi.view",
            "sezione.dati_commessa.view",
            "sezione.dati_principali.view",
            "sezione.normative.view",
            "sezione.disposizione_vano.view",
            "sezione.argano.view",
            "sezione.porte.view",
            "sezione.materiali.view",
        ]
    },
    "cliente_avanzato": {
        "nome": "Cliente Avanzato",
        "descrizione": "Cliente con possibilità di configurare",
        "gruppo": "Clienti",
        "is_superadmin": False,
        "permessi": [
            "preventivi.view", "preventivi.create", "preventivi.edit", "preventivi.export_pdf",
            "clienti.view",
            "sezione.dati_commessa.view", "sezione.dati_commessa.edit",
            "sezione.dati_principali.view", "sezione.dati_principali.edit",
            "sezione.normative.view", "sezione.normative.edit",
            "sezione.disposizione_vano.view", "sezione.disposizione_vano.edit",
            "sezione.argano.view", "sezione.argano.edit",
            "sezione.porte.view", "sezione.porte.edit",
            "sezione.materiali.view",
            "sezione.ordine.view",
        ]
    },
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica che la password in chiaro corrisponda all'hash"""
    try:
        return bcrypt.checkpw(
            plain_password.encode('utf-8'), 
            hashed_password.encode('utf-8')
        )
    except Exception as e:
        print(f"Errore verifica password: {e}")
        return False


def get_password_hash(password: str) -> str:
    """Crea hash della password"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Crea JWT token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def authenticate_user(db: Session, username: str, password: str) -> Optional[Utente]:
    """Autentica utente"""
    user = db.query(Utente).filter(Utente.username == username).first()
    if not user:
        print(f"❌ Utente '{username}' non trovato")
        return None
    if not user.is_active:
        print(f"❌ Utente '{username}' non attivo")
        return None
    if not verify_password(password, user.password_hash):
        print(f"❌ Password errata per utente '{username}'")
        return None
    print(f"✅ Utente '{username}' autenticato con successo")
    return user


def get_user_from_token(token: str, db: Session) -> Optional[Utente]:
    """Estrae utente dal token JWT"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
        user = db.query(Utente).filter(Utente.username == username).first()
        return user
    except JWTError:
        return None


def get_user_permissions(user: Utente, db: Session) -> List[str]:
    """
    Restituisce la lista di tutti i codici permesso dell'utente.
    Ordine di priorità:
    1. Se il ruolo è superadmin → tutti i permessi
    2. Permessi del ruolo assegnato all'utente
    3. Fallback: se is_admin=True (legacy) → tutti i permessi
    """
    if not user:
        return []
    
    # Legacy: is_admin flag
    if user.is_admin:
        return [p["codice"] for p in PERMESSI_CATALOGO]
    
    # Ruolo assegnato
    if user.ruolo_id:
        ruolo = db.query(Ruolo).filter(Ruolo.id == user.ruolo_id).first()
        if ruolo:
            if ruolo.is_superadmin:
                return [p["codice"] for p in PERMESSI_CATALOGO]
            permessi = db.query(PermessoRuolo).filter(
                PermessoRuolo.ruolo_id == ruolo.id
            ).all()
            return [p.codice_permesso for p in permessi]
    
    # Nessun ruolo → nessun permesso (tranne view base)
    return []


def has_permission(user: Utente, db: Session, codice_permesso: str) -> bool:
    """Verifica se l'utente ha un permesso specifico"""
    permissions = get_user_permissions(user, db)
    return codice_permesso in permissions


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Optional[Utente]:
    """Ottieni utente corrente dal token (opzionale)"""
    if not token:
        return None
    return get_user_from_token(token, db)


async def get_current_user_required(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Utente:
    """Ottieni utente corrente dal token (obbligatorio)"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Non autenticato",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_exception
    
    user = get_user_from_token(token, db)
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Utente non attivo")
    return user


def is_admin(user: Utente, db: Session) -> bool:
    """Verifica se l'utente è admin (via ruolo superadmin o flag legacy)"""
    if not user:
        return False
    if user.is_admin:
        return True
    if user.ruolo_id:
        ruolo = db.query(Ruolo).filter(Ruolo.id == user.ruolo_id).first()
        if ruolo and ruolo.is_superadmin:
            return True
    return False


async def require_admin(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Utente:
    """Middleware: richiede utente admin"""
    user = await get_current_user_required(token, db)
    if not is_admin(user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Richiesti privilegi di amministratore"
        )
    return user


async def require_permission(codice_permesso: str):
    """Factory per middleware che richiede un permesso specifico"""
    async def check_permission(
        token: str = Depends(oauth2_scheme),
        db: Session = Depends(get_db)
    ) -> Utente:
        user = await get_current_user_required(token, db)
        if not has_permission(user, db, codice_permesso):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permesso '{codice_permesso}' richiesto"
            )
        return user
    return check_permission


# ==========================================
# SEED: Creazione dati iniziali
# ==========================================

def seed_gruppi_e_ruoli(db: Session):
    """Crea gruppi e ruoli di default se non esistono"""
    
    # --- Gruppi ---
    gruppi_default = {
        "Elettroquadri": "Utenti interni Elettroquadri S.r.l.",
        "Clienti": "Clienti esterni con accesso al configuratore",
    }
    gruppo_map = {}
    for nome, desc in gruppi_default.items():
        gruppo = db.query(GruppoUtenti).filter(GruppoUtenti.nome == nome).first()
        if not gruppo:
            gruppo = GruppoUtenti(
                nome=nome,
                descrizione=desc,
                is_admin=(nome == "Elettroquadri")
            )
            db.add(gruppo)
            db.commit()
            db.refresh(gruppo)
            print(f"  ✅ Gruppo '{nome}' creato")
        gruppo_map[nome] = gruppo.id

    # --- Ruoli ---
    for codice, config in RUOLI_DEFAULT.items():
        ruolo = db.query(Ruolo).filter(Ruolo.codice == codice).first()
        if not ruolo:
            ruolo = Ruolo(
                codice=codice,
                nome=config["nome"],
                descrizione=config["descrizione"],
                gruppo_id=gruppo_map.get(config["gruppo"]),
                is_superadmin=config["is_superadmin"],
            )
            db.add(ruolo)
            db.commit()
            db.refresh(ruolo)
            
            # Aggiungi permessi al ruolo
            permessi_codici = config["permessi"]
            if "*" in permessi_codici:
                # Superadmin: aggiungi tutti
                permessi_codici = [p["codice"] for p in PERMESSI_CATALOGO]
            
            for codice_perm in permessi_codici:
                perm = PermessoRuolo(
                    ruolo_id=ruolo.id,
                    codice_permesso=codice_perm
                )
                db.add(perm)
            db.commit()
            print(f"  ✅ Ruolo '{config['nome']}' creato con {len(permessi_codici)} permessi")
    
    return gruppo_map


def create_default_admin(db: Session):
    """Crea utente admin di default se non esiste"""
    # Prima assicurati che gruppi e ruoli esistano
    gruppo_map = seed_gruppi_e_ruoli(db)
    
    admin = db.query(Utente).filter(Utente.username == "admin").first()
    if not admin:
        # Trova ruolo superadmin
        ruolo_sa = db.query(Ruolo).filter(Ruolo.codice == "superadmin").first()
        gruppo_eq = gruppo_map.get("Elettroquadri")
        
        admin = Utente(
            username="admin",
            password_hash=get_password_hash("admin"),
            nome="Amministratore",
            cognome="Sistema",
            email="admin@elettroquadri.it",
            gruppo_id=gruppo_eq,
            ruolo_id=ruolo_sa.id if ruolo_sa else None,
            is_admin=True,
            is_active=True
        )
        db.add(admin)
        db.commit()
        print("✅ Utente admin creato (username: admin, password: admin)")
    else:
        # Aggiorna admin esistente: assicurati che abbia ruolo_id
        if not admin.ruolo_id:
            ruolo_sa = db.query(Ruolo).filter(Ruolo.codice == "superadmin").first()
            if ruolo_sa:
                admin.ruolo_id = ruolo_sa.id
                if not admin.gruppo_id:
                    admin.gruppo_id = gruppo_map.get("Elettroquadri")
                db.commit()
                print("✅ Utente admin aggiornato con ruolo superadmin")
    return admin


def create_demo_users(db: Session):
    """Crea utenti demo per testing"""
    # Assicurati che gruppi e ruoli esistano
    gruppo_map = seed_gruppi_e_ruoli(db)
    
    # Trova ruoli
    ruolo_map = {}
    for r in db.query(Ruolo).all():
        ruolo_map[r.codice] = r.id
    
    # Utenti demo
    utenti_demo = [
        {
            "username": "admin",
            "password": "admin",
            "nome": "Admin",
            "cognome": "Sistema",
            "gruppo": "Elettroquadri",
            "ruolo": "superadmin",
            "is_admin": True,
        },
        {
            "username": "mario.rossi",
            "password": "demo",
            "nome": "Mario",
            "cognome": "Rossi",
            "gruppo": "Elettroquadri",
            "ruolo": "commerciale_eq",
            "is_admin": False,
        },
        {
            "username": "luigi.bianchi",
            "password": "demo",
            "nome": "Luigi",
            "cognome": "Bianchi",
            "gruppo": "Elettroquadri",
            "ruolo": "tecnico_eq",
            "is_admin": False,
        },
        {
            "username": "cliente.demo",
            "password": "demo",
            "nome": "Demo",
            "cognome": "Cliente",
            "gruppo": "Clienti",
            "ruolo": "cliente_base",
            "is_admin": False,
        },
    ]
    
    for u in utenti_demo:
        existing = db.query(Utente).filter(Utente.username == u["username"]).first()
        if not existing:
            utente = Utente(
                username=u["username"],
                password_hash=get_password_hash(u["password"]),
                nome=u["nome"],
                cognome=u["cognome"],
                email=f"{u['username']}@elettroquadri.it",
                gruppo_id=gruppo_map.get(u["gruppo"]),
                ruolo_id=ruolo_map.get(u["ruolo"]),
                is_admin=u["is_admin"],
                is_active=True
            )
            db.add(utente)
    
    db.commit()
    print("✅ Utenti demo creati")
