# auth.py - Sistema di autenticazione con gruppi utenti

from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Utente, GruppoUtenti, PermessoGruppo

# Configurazione
SECRET_KEY = "elettroquadri-secret-key-change-in-production-2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 ore

# OAuth2
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


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
        print(f"âŒ Utente '{username}' non trovato")
        return None
    if not user.is_active:
        print(f"âŒ Utente '{username}' non attivo")
        return None
    if not verify_password(password, user.password_hash):
        print(f"âŒ Password errata per utente '{username}'")
        return None
    print(f"âœ… Utente '{username}' autenticato con successo")
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
    """Verifica se l'utente appartiene a un gruppo admin"""
    if not user or not user.gruppo_id:
        return False
    gruppo = db.query(GruppoUtenti).filter(GruppoUtenti.id == user.gruppo_id).first()
    return gruppo and gruppo.is_admin


def has_permission(user: Utente, db: Session, codice_permesso: str) -> bool:
    """Verifica se l'utente ha un permesso specifico"""
    if not user or not user.gruppo_id:
        return False
    
    # Admin ha tutti i permessi
    gruppo = db.query(GruppoUtenti).filter(GruppoUtenti.id == user.gruppo_id).first()
    if gruppo and gruppo.is_admin:
        return True
    
    # Verifica permesso specifico
    permesso = db.query(PermessoGruppo).filter(
        PermessoGruppo.gruppo_id == user.gruppo_id,
        PermessoGruppo.codice_permesso == codice_permesso
    ).first()
    return permesso is not None


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


def create_default_admin(db: Session):
    """Crea utente admin di default se non esiste"""
    admin = db.query(Utente).filter(Utente.username == "admin").first()
    if not admin:
        # Trova o crea gruppo Amministratori
        gruppo_admin = db.query(GruppoUtenti).filter(GruppoUtenti.is_admin == True).first()
        if not gruppo_admin:
            gruppo_admin = GruppoUtenti(
                nome="Amministratori",
                descrizione="Accesso completo al sistema",
                is_admin=True
            )
            db.add(gruppo_admin)
            db.commit()
            db.refresh(gruppo_admin)
        
        # Crea utente admin
        admin = Utente(
            username="admin",
            password_hash=get_password_hash("admin"),
            nome="Amministratore",
            cognome="Sistema",
            email="admin@elettroquadri.it",
            gruppo_id=gruppo_admin.id,
            is_active=True
        )
        db.add(admin)
        db.commit()
        print("âœ… Utente admin creato (username: admin, password: admin)")
    return admin


def create_demo_users(db: Session):
    """Crea utenti demo per testing"""
    # Gruppi
    gruppi = {
        "Amministratori": {"descrizione": "Accesso completo", "is_admin": True},
        "Commerciali": {"descrizione": "Gestione preventivi e clienti", "is_admin": False},
        "Tecnici": {"descrizione": "Configurazione tecnica", "is_admin": False},
    }
    
    gruppo_ids = {}
    for nome, config in gruppi.items():
        gruppo = db.query(GruppoUtenti).filter(GruppoUtenti.nome == nome).first()
        if not gruppo:
            gruppo = GruppoUtenti(nome=nome, **config)
            db.add(gruppo)
            db.commit()
            db.refresh(gruppo)
        gruppo_ids[nome] = gruppo.id
    
    # Utenti demo
    utenti_demo = [
        {"username": "admin", "password": "admin", "nome": "Admin", "cognome": "Sistema", "gruppo": "Amministratori"},
        {"username": "mario.rossi", "password": "demo", "nome": "Mario", "cognome": "Rossi", "gruppo": "Commerciali"},
        {"username": "luigi.bianchi", "password": "demo", "nome": "Luigi", "cognome": "Bianchi", "gruppo": "Tecnici"},
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
                gruppo_id=gruppo_ids[u["gruppo"]],
                is_active=True
            )
            db.add(utente)
    
    db.commit()
    print("âœ… Utenti demo creati")
