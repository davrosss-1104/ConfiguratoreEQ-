# ============================================================
# FILE: api_permessi.py
# Nuovi endpoint per gestione Gruppi, Ruoli, Permessi
# DA IMPORTARE in main.py (vedi istruzioni in fondo)
# ============================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import get_db
from models import GruppoUtenti, Ruolo, PermessoRuolo, Utente
from auth import (
    get_user_permissions, PERMESSI_CATALOGO, RUOLI_DEFAULT,
    get_password_hash, seed_gruppi_e_ruoli, SEZIONI_FISSE
)
from typing import Optional

router = APIRouter()


# ==========================================
# CATALOGO PERMESSI (lista di tutti i permessi disponibili)
# ==========================================
@router.get("/permessi/catalogo")
def get_catalogo_permessi(db: Session = Depends(get_db)):
    """Restituisce il catalogo completo dei permessi disponibili.
    I permessi sezione vengono generati dinamicamente da sezioni_configuratore + SEZIONI_FISSE.
    """
    # 1. Permessi statici (non-sezione)
    catalogo = list(PERMESSI_CATALOGO)

    # 2. Leggi sezioni dal DB
    codici_da_db = set()
    try:
        rows = db.execute(text(
            "SELECT codice, etichetta FROM sezioni_configuratore WHERE attivo = 1 ORDER BY ordine"
        )).fetchall()
        for row in rows:
            codice, etichetta = row[0], row[1]
            codici_da_db.add(codice)
            catalogo.append({"codice": f"sezione.{codice}.view", "categoria": "Sezioni", "descrizione": f"Vedere {etichetta}"})
            catalogo.append({"codice": f"sezione.{codice}.edit", "categoria": "Sezioni", "descrizione": f"Modificare {etichetta}"})
    except Exception:
        pass  # tabella non ancora creata

    # 3. Aggiungi sezioni fisse se non già presenti da DB
    for sez in SEZIONI_FISSE:
        if sez["codice"] not in codici_da_db:
            catalogo.append({"codice": f"sezione.{sez['codice']}.view", "categoria": "Sezioni", "descrizione": f"Vedere {sez['etichetta']}"})
            catalogo.append({"codice": f"sezione.{sez['codice']}.edit", "categoria": "Sezioni", "descrizione": f"Modificare {sez['etichetta']}"})

    return catalogo


# ==========================================
# GRUPPI UTENTI
# ==========================================
@router.get("/gruppi-utenti")
def get_gruppi_utenti(db: Session = Depends(get_db)):
    """Lista di tutti i gruppi utenti"""
    gruppi = db.query(GruppoUtenti).order_by(GruppoUtenti.nome).all()
    result = []
    for g in gruppi:
        n_utenti = db.query(Utente).filter(Utente.gruppo_id == g.id).count()
        n_ruoli = db.query(Ruolo).filter(Ruolo.gruppo_id == g.id).count()
        result.append({
            "id": g.id,
            "nome": g.nome,
            "descrizione": g.descrizione,
            "is_admin": g.is_admin,
            "n_utenti": n_utenti,
            "n_ruoli": n_ruoli,
            "created_at": str(g.created_at) if g.created_at else None,
        })
    return result


@router.post("/gruppi-utenti")
def create_gruppo_utenti(data: dict, db: Session = Depends(get_db)):
    """Crea un nuovo gruppo utenti"""
    nome = data.get("nome", "").strip()
    if not nome:
        raise HTTPException(status_code=400, detail="Nome obbligatorio")
    
    existing = db.query(GruppoUtenti).filter(GruppoUtenti.nome == nome).first()
    if existing:
        raise HTTPException(status_code=400, detail="Gruppo già esistente")
    
    gruppo = GruppoUtenti(
        nome=nome,
        descrizione=data.get("descrizione", ""),
        is_admin=data.get("is_admin", False),
    )
    db.add(gruppo)
    db.commit()
    db.refresh(gruppo)
    return {"id": gruppo.id, "status": "ok"}


@router.put("/gruppi-utenti/{gruppo_id}")
def update_gruppo_utenti(gruppo_id: int, data: dict, db: Session = Depends(get_db)):
    """Modifica un gruppo utenti"""
    gruppo = db.query(GruppoUtenti).filter(GruppoUtenti.id == gruppo_id).first()
    if not gruppo:
        raise HTTPException(status_code=404, detail="Gruppo non trovato")
    
    if "nome" in data:
        gruppo.nome = data["nome"]
    if "descrizione" in data:
        gruppo.descrizione = data["descrizione"]
    if "is_admin" in data:
        gruppo.is_admin = data["is_admin"]
    
    db.commit()
    return {"status": "ok"}


@router.delete("/gruppi-utenti/{gruppo_id}")
def delete_gruppo_utenti(gruppo_id: int, db: Session = Depends(get_db)):
    """Elimina un gruppo utenti"""
    gruppo = db.query(GruppoUtenti).filter(GruppoUtenti.id == gruppo_id).first()
    if not gruppo:
        raise HTTPException(status_code=404, detail="Gruppo non trovato")
    
    # Controlla se ci sono utenti
    n_utenti = db.query(Utente).filter(Utente.gruppo_id == gruppo_id).count()
    if n_utenti > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Impossibile eliminare: {n_utenti} utenti associati"
        )
    
    db.delete(gruppo)
    db.commit()
    return {"status": "ok"}


# ==========================================
# RUOLI
# ==========================================
@router.get("/ruoli")
def get_ruoli(db: Session = Depends(get_db)):
    """Lista di tutti i ruoli con permessi e conteggio utenti"""
    ruoli = db.query(Ruolo).order_by(Ruolo.nome).all()
    result = []
    for r in ruoli:
        n_utenti = db.query(Utente).filter(Utente.ruolo_id == r.id).count()
        permessi = db.query(PermessoRuolo).filter(PermessoRuolo.ruolo_id == r.id).all()
        gruppo = db.query(GruppoUtenti).filter(GruppoUtenti.id == r.gruppo_id).first() if r.gruppo_id else None
        result.append({
            "id": r.id,
            "codice": r.codice,
            "nome": r.nome,
            "descrizione": r.descrizione,
            "gruppo_id": r.gruppo_id,
            "gruppo_nome": gruppo.nome if gruppo else None,
            "is_superadmin": r.is_superadmin,
            "n_utenti": n_utenti,
            "permessi": [p.codice_permesso for p in permessi],
            "created_at": str(r.created_at) if r.created_at else None,
        })
    return result


@router.post("/ruoli")
def create_ruolo(data: dict, db: Session = Depends(get_db)):
    """Crea un nuovo ruolo"""
    codice = data.get("codice", "").strip()
    nome = data.get("nome", "").strip()
    
    if not codice or not nome:
        raise HTTPException(status_code=400, detail="Codice e nome obbligatori")
    
    existing = db.query(Ruolo).filter(Ruolo.codice == codice).first()
    if existing:
        raise HTTPException(status_code=400, detail="Codice ruolo già esistente")
    
    ruolo = Ruolo(
        codice=codice,
        nome=nome,
        descrizione=data.get("descrizione", ""),
        gruppo_id=data.get("gruppo_id"),
        is_superadmin=data.get("is_superadmin", False),
    )
    db.add(ruolo)
    db.commit()
    db.refresh(ruolo)
    
    # Aggiungi permessi se forniti
    permessi = data.get("permessi", [])
    for codice_perm in permessi:
        perm = PermessoRuolo(ruolo_id=ruolo.id, codice_permesso=codice_perm)
        db.add(perm)
    db.commit()
    
    return {"id": ruolo.id, "status": "ok"}


@router.put("/ruoli/{ruolo_id}")
def update_ruolo(ruolo_id: int, data: dict, db: Session = Depends(get_db)):
    """Modifica un ruolo e i suoi permessi"""
    ruolo = db.query(Ruolo).filter(Ruolo.id == ruolo_id).first()
    if not ruolo:
        raise HTTPException(status_code=404, detail="Ruolo non trovato")
    
    if "nome" in data:
        ruolo.nome = data["nome"]
    if "descrizione" in data:
        ruolo.descrizione = data["descrizione"]
    if "gruppo_id" in data:
        ruolo.gruppo_id = data["gruppo_id"]
    if "is_superadmin" in data:
        ruolo.is_superadmin = data["is_superadmin"]
    
    # Aggiorna permessi (replace completo)
    if "permessi" in data:
        # Rimuovi tutti i permessi esistenti
        db.query(PermessoRuolo).filter(PermessoRuolo.ruolo_id == ruolo_id).delete()
        # Inserisci i nuovi
        for codice_perm in data["permessi"]:
            perm = PermessoRuolo(ruolo_id=ruolo_id, codice_permesso=codice_perm)
            db.add(perm)
    
    db.commit()
    return {"status": "ok"}


@router.delete("/ruoli/{ruolo_id}")
def delete_ruolo(ruolo_id: int, db: Session = Depends(get_db)):
    """Elimina un ruolo"""
    ruolo = db.query(Ruolo).filter(Ruolo.id == ruolo_id).first()
    if not ruolo:
        raise HTTPException(status_code=404, detail="Ruolo non trovato")
    
    # Controlla se ci sono utenti con questo ruolo
    n_utenti = db.query(Utente).filter(Utente.ruolo_id == ruolo_id).count()
    if n_utenti > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Impossibile eliminare: {n_utenti} utenti con questo ruolo"
        )
    
    db.delete(ruolo)
    db.commit()
    return {"status": "ok"}


@router.post("/ruoli/duplica/{ruolo_id}")
def duplica_ruolo(ruolo_id: int, data: dict, db: Session = Depends(get_db)):
    """Duplica un ruolo esistente con un nuovo codice/nome"""
    ruolo_orig = db.query(Ruolo).filter(Ruolo.id == ruolo_id).first()
    if not ruolo_orig:
        raise HTTPException(status_code=404, detail="Ruolo originale non trovato")
    
    nuovo_codice = data.get("codice", f"{ruolo_orig.codice}_copia")
    nuovo_nome = data.get("nome", f"{ruolo_orig.nome} (Copia)")
    
    existing = db.query(Ruolo).filter(Ruolo.codice == nuovo_codice).first()
    if existing:
        raise HTTPException(status_code=400, detail="Codice ruolo già esistente")
    
    # Crea il nuovo ruolo
    nuovo_ruolo = Ruolo(
        codice=nuovo_codice,
        nome=nuovo_nome,
        descrizione=data.get("descrizione", ruolo_orig.descrizione),
        gruppo_id=data.get("gruppo_id", ruolo_orig.gruppo_id),
        is_superadmin=False,
    )
    db.add(nuovo_ruolo)
    db.commit()
    db.refresh(nuovo_ruolo)
    
    # Copia i permessi
    permessi_orig = db.query(PermessoRuolo).filter(PermessoRuolo.ruolo_id == ruolo_id).all()
    for p in permessi_orig:
        perm = PermessoRuolo(ruolo_id=nuovo_ruolo.id, codice_permesso=p.codice_permesso)
        db.add(perm)
    db.commit()
    
    return {"id": nuovo_ruolo.id, "status": "ok"}


# ==========================================
# PERMESSI UTENTE (query diretta)
# ==========================================
@router.get("/utenti/{utente_id}/permessi")
def get_permessi_utente(utente_id: int, db: Session = Depends(get_db)):
    """Restituisce i permessi effettivi di un utente"""
    utente = db.query(Utente).filter(Utente.id == utente_id).first()
    if not utente:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    
    permessi = get_user_permissions(utente, db)
    return {
        "utente_id": utente_id,
        "username": utente.username,
        "ruolo_id": utente.ruolo_id,
        "gruppo_id": utente.gruppo_id,
        "permessi": permessi
    }


# ==========================================
# SEED / RESET
# ==========================================
@router.post("/permessi/seed")
def seed_permessi(db: Session = Depends(get_db)):
    """Ricrea gruppi e ruoli di default (non sovrascrive quelli esistenti)"""
    seed_gruppi_e_ruoli(db)
    return {"status": "ok", "message": "Seed completato"}
