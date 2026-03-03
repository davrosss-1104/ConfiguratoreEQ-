"""
moduli_attivabili.py — Feature flag system per moduli opzionali
================================================================

Aggiunge a main.py:
  1. GET  /moduli-attivi           → dict dei moduli e loro stato on/off
  2. PUT  /moduli-attivi/{codice}  → attiva/disattiva un modulo (solo admin)
  3. Dependency FastAPI: richiedi_modulo("fatturazione") → guard per endpoint

I flag sono salvati in parametri_sistema con gruppo = "moduli"
e chiave = "modulo_{codice}_attivo", valore = "true" / "false".

INTEGRAZIONE in main.py:
  from moduli_attivabili import router as moduli_router, richiedi_modulo
  app.include_router(moduli_router)
  
  # Proteggere il router fatturazione:
  from fatturazione_api import router as fatturazione_router
  fatturazione_router.dependencies.append(Depends(richiedi_modulo("fatturazione")))
  app.include_router(fatturazione_router)

MIGRAZIONE (aggiunta a migrate_fatturazione.py o eseguibile standalone):
  python moduli_attivabili.py [db_path]
"""

import sys
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

# Importa get_db dal progetto (adatta il path se necessario)
try:
    from database import get_db
except ImportError:
    from main import get_db

router = APIRouter(tags=["moduli"])

# ==========================================
# MODULI REGISTRATI
# ==========================================
# Ogni modulo ha: codice, nome, descrizione, default (spento)
MODULI_DISPONIBILI = {
    "fatturazione": {
        "nome": "Fatturazione Elettronica",
        "descrizione": "Generazione XML FatturaPA, invio SDI, gestione fatture attive/passive",
        "default": False,
    },
    # Futuri moduli:
    # "magazzino": { "nome": "Gestione Magazzino", ... },
    # "crm": { "nome": "CRM Clienti", ... },
}


# ==========================================
# HELPERS
# ==========================================

def _chiave_parametro(codice_modulo: str) -> str:
    return f"modulo_{codice_modulo}_attivo"


def is_modulo_attivo(db: Session, codice: str) -> bool:
    """Controlla se un modulo è attivo leggendo parametri_sistema."""
    chiave = _chiave_parametro(codice)
    try:
        row = db.execute(
            text("SELECT valore FROM parametri_sistema WHERE chiave = :k"),
            {"k": chiave}
        ).fetchone()
        if row:
            return row[0].lower() in ("true", "1", "si", "yes")
    except Exception:
        pass
    # Default dal registro
    mod = MODULI_DISPONIBILI.get(codice)
    return mod["default"] if mod else False


def get_tutti_moduli(db: Session) -> dict:
    """Ritorna { codice: True/False } per tutti i moduli registrati."""
    result = {}
    for codice in MODULI_DISPONIBILI:
        result[codice] = is_modulo_attivo(db, codice)
    return result


# ==========================================
# DEPENDENCY: Guard per endpoint protetti
# ==========================================

def richiedi_modulo(codice: str):
    """
    Ritorna una FastAPI dependency che blocca la request se il modulo non è attivo.
    
    Uso:
      fatturazione_router.dependencies.append(Depends(richiedi_modulo("fatturazione")))
    
    oppure su singolo endpoint:
      @app.get("/...", dependencies=[Depends(richiedi_modulo("fatturazione"))])
    """
    def _guard(db: Session = Depends(get_db)):
        if not is_modulo_attivo(db, codice):
            mod = MODULI_DISPONIBILI.get(codice, {})
            nome = mod.get("nome", codice)
            raise HTTPException(
                status_code=403,
                detail=f"Il modulo '{nome}' non è attivo. "
                        f"Attivarlo da Amministrazione → Parametri Sistema."
            )
    return _guard


# ==========================================
# ENDPOINT: Lista moduli attivi (per frontend)
# ==========================================

@router.get("/moduli-attivi")
def get_moduli_attivi(db: Session = Depends(get_db)):
    """
    Ritorna { "fatturazione": true/false, ... }
    Il frontend lo usa per mostrare/nascondere sezioni nel Sidebar.
    """
    return get_tutti_moduli(db)


@router.get("/moduli-disponibili")
def get_moduli_disponibili(db: Session = Depends(get_db)):
    """
    Ritorna la lista completa con nome, descrizione e stato attuale.
    Per la pagina admin di gestione moduli.
    """
    result = []
    for codice, info in MODULI_DISPONIBILI.items():
        result.append({
            "codice": codice,
            "nome": info["nome"],
            "descrizione": info["descrizione"],
            "attivo": is_modulo_attivo(db, codice),
        })
    return result


@router.put("/moduli-attivi/{codice}")
def toggle_modulo(codice: str, data: dict, db: Session = Depends(get_db)):
    """
    Attiva o disattiva un modulo.
    Body: { "attivo": true/false }
    Richiede admin (aggiungere auth dependency in produzione).
    """
    if codice not in MODULI_DISPONIBILI:
        raise HTTPException(status_code=404, detail=f"Modulo '{codice}' non trovato")
    
    attivo = data.get("attivo", False)
    chiave = _chiave_parametro(codice)
    valore = "true" if attivo else "false"
    
    # Upsert nel parametri_sistema
    try:
        existing = db.execute(
            text("SELECT id FROM parametri_sistema WHERE chiave = :k"),
            {"k": chiave}
        ).fetchone()
        
        if existing:
            db.execute(
                text("UPDATE parametri_sistema SET valore = :v, updated_at = :now WHERE chiave = :k"),
                {"v": valore, "now": datetime.now(), "k": chiave}
            )
        else:
            mod = MODULI_DISPONIBILI[codice]
            db.execute(
                text("""INSERT INTO parametri_sistema 
                        (chiave, valore, descrizione, tipo_dato, gruppo, created_at, updated_at)
                        VALUES (:k, :v, :d, 'boolean', 'moduli', :now, :now)"""),
                {
                    "k": chiave,
                    "v": valore,
                    "d": f"Attiva/disattiva modulo {mod['nome']}",
                    "now": datetime.now(),
                }
            )
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    
    return {
        "codice": codice,
        "attivo": attivo,
        "nome": MODULI_DISPONIBILI[codice]["nome"],
    }


# ==========================================
# MIGRAZIONE STANDALONE
# ==========================================

def migrate_moduli(db_path: str = "configuratore.db"):
    """
    Inserisce i parametri feature flag per tutti i moduli registrati.
    Sicuro da eseguire più volte (skip se già presente).
    """
    import sqlite3
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    
    print("=" * 50)
    print("MIGRAZIONE MODULI ATTIVABILI")
    print("=" * 50)
    
    for codice, info in MODULI_DISPONIBILI.items():
        chiave = _chiave_parametro(codice)
        cursor.execute("SELECT id FROM parametri_sistema WHERE chiave = ?", (chiave,))
        if cursor.fetchone():
            print(f"  ⏭️  {chiave} già presente, skip")
            continue
        
        valore = "true" if info["default"] else "false"
        cursor.execute("""
            INSERT INTO parametri_sistema (chiave, valore, descrizione, tipo_dato, gruppo, created_at, updated_at)
            VALUES (?, ?, ?, 'boolean', 'moduli', ?, ?)
        """, (chiave, valore, f"Attiva/disattiva modulo {info['nome']}", now, now))
        print(f"  ✅ Inserito: {chiave} = {valore}")
    
    conn.commit()
    conn.close()
    print("\n✅ Migrazione moduli completata")


if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else "configuratore.db"
    migrate_moduli(db)
