"""
moduli_attivabili.py — Feature flag system per moduli opzionali
================================================================

Due livelli di controllo:

  1. LICENZA (config.ini → env MODULI_LICENZIATI):
     Definisce quali moduli sono acquistati per questa installazione.
     Impostato da David in config.ini al momento del deploy.
     L'amministratore non può modificarlo.
     Un modulo non licenziato è invisibile nell'admin e bloccato lato API.

  2. ATTIVAZIONE (parametri_sistema nel DB):
     L'amministratore può attivare/disattivare solo i moduli licenziati.
     Utile per accendere/spegnere funzionalità senza contattare David.

Sezione config.ini da aggiungere per ogni installazione cliente:
  [licenza]
  moduli = ticketing, fatturazione, tempi

  Oppure, per abilitare tutto (es. installazione David):
  moduli = *

INTEGRAZIONE in main.py:
  from moduli_attivabili import router as moduli_router, richiedi_modulo
  app.include_router(moduli_router)

  from fatturazione_api import router as fatturazione_router
  fatturazione_router.dependencies.append(Depends(richiedi_modulo("fatturazione")))
  app.include_router(fatturazione_router)
"""

import os
import sys
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

try:
    from database import get_db
except ImportError:
    from main import get_db

router = APIRouter(tags=["moduli"])


# ==========================================
# CATALOGO GLOBALE DI TUTTI I MODULI
# ==========================================
# Aggiungere qui ogni nuovo modulo sviluppato.
# "default": stato iniziale se il cliente ha la licenza ma non ha mai
#            esplicitamente attivato/disattivato il modulo.

MODULI_DISPONIBILI = {
    "fatturazione": {
        "nome":        "Fatturazione Elettronica",
        "descrizione": "Generazione XML FatturaPA, invio SDI, fatture attive/passive",
        "default":     False,
        "icona":       "Receipt",
    },
    "ticketing": {
        "nome":        "Assistenza & Ticketing",
        "descrizione": "Gestione ticket di assistenza, impianti, comunicazione con il cliente",
        "default":     True,   # acceso di default quando licenziato
        "icona":       "Ticket",
    },
    "portale_cliente": {
        "nome":        "Portale Cliente",
        "descrizione": "Accesso clienti al portale web per visualizzare ticket, ordini, preventivi",
        "default":     True,
        "icona":       "Globe",
    },
    "tempi": {
        "nome":        "Misurazione Tempi",
        "descrizione": "Timer su ticket, sessioni di lavoro, report tempi per tecnico/cliente",
        "default":     True,
        "icona":       "Timer",
    },
    "oda": {
        "nome":        "Ordini di Acquisto",
        "descrizione": "Gestione ordini di acquisto, fornitori, approvvigionamento",
        "default":     True,
        "icona":       "ShoppingCart",
    },
    "mrp": {
        "nome":        "MRP — Pianificazione Acquisti",
        "descrizione": "Calcolo fabbisogni da BOM e commesse, proposte ordini cumulative per fornitore",
        "default":     True,
        "icona":       "BarChart2",
    },
    "magazzino": {
        "nome":        "Magazzino",
        "descrizione": "Gestione giacenze, movimenti di magazzino, alert sotto-scorta",
        "default":     True,
        "icona":       "Warehouse",
    },
    "produzione": {
    "nome": "Produzione",
    "descrizione": "Avanzamento fasi, schedulazione commesse, WIP materiali, Gantt",
    "default": True,
    "icona": "Factory",
    },
}


# ==========================================
# LETTURA LICENZA DA ENVIRONMENT
# ==========================================

def get_moduli_licenziati() -> set:
    """
    Legge l'env MODULI_LICENZIATI (impostato da server_prod.py leggendo config.ini).
    Ritorna un set di codici modulo autorizzati.
    "*" significa tutti i moduli del catalogo.
    Se la variabile non è impostata, per retrocompatibilità,
    si assume che solo "fatturazione" sia licenziato.
    """
    raw = os.environ.get("MODULI_LICENZIATI", "fatturazione").strip()
    if raw == "*":
        return set(MODULI_DISPONIBILI.keys())
    return {m.strip() for m in raw.split(",") if m.strip() and m.strip() in MODULI_DISPONIBILI}


def is_modulo_licenziato(codice: str) -> bool:
    return codice in get_moduli_licenziati()


# ==========================================
# ATTIVAZIONE (togglabile dall'admin)
# ==========================================

def _chiave_parametro(codice_modulo: str) -> str:
    return f"modulo_{codice_modulo}_attivo"


def is_modulo_attivo(db: Session, codice: str) -> bool:
    """
    Un modulo è attivo solo se:
      1. È licenziato per questa installazione, E
      2. Non è stato esplicitamente disattivato dall'admin (o ha default=True).
    """
    if not is_modulo_licenziato(codice):
        return False

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

    # Nessuna riga in DB → usa il default del catalogo
    mod = MODULI_DISPONIBILI.get(codice)
    return mod["default"] if mod else False


def get_tutti_moduli(db: Session) -> dict:
    """Ritorna { codice: True/False } solo per i moduli licenziati."""
    result = {}
    for codice in get_moduli_licenziati():
        result[codice] = is_modulo_attivo(db, codice)
    return result


# ==========================================
# DEPENDENCY FastAPI
# ==========================================

def richiedi_modulo(codice: str):
    """
    Guard FastAPI: blocca la request se il modulo non è attivo
    (non licenziato OPPURE disattivato dall'admin).

    Uso:
      ticketing_router.dependencies.append(Depends(richiedi_modulo("ticketing")))

    oppure su singolo endpoint:
      @app.get("/...", dependencies=[Depends(richiedi_modulo("tempi"))])
    """
    def _guard(db: Session = Depends(get_db)):
        if not is_modulo_licenziato(codice):
            raise HTTPException(
                status_code=403,
                detail=f"Modulo non disponibile in questa installazione."
            )
        if not is_modulo_attivo(db, codice):
            mod = MODULI_DISPONIBILI.get(codice, {})
            nome = mod.get("nome", codice)
            raise HTTPException(
                status_code=403,
                detail=f"Il modulo '{nome}' non è attivo. "
                       f"Attivarlo da Amministrazione → Moduli."
            )
    return _guard


# ==========================================
# ENDPOINT
# ==========================================

@router.get("/moduli-attivi")
def get_moduli_attivi(db: Session = Depends(get_db)):
    """
    { "ticketing": true, "fatturazione": false, ... }
    Solo moduli licenziati. Usato dal Sidebar per mostrare/nascondere voci.
    """
    return get_tutti_moduli(db)


@router.get("/moduli-disponibili")
def get_moduli_disponibili(db: Session = Depends(get_db)):
    """
    Lista completa con nome, descrizione, stato attuale.
    Ritorna SOLO i moduli licenziati — l'admin non vede gli altri.
    """
    licenziati = get_moduli_licenziati()
    result = []
    for codice in MODULI_DISPONIBILI:
        if codice not in licenziati:
            continue
        info = MODULI_DISPONIBILI[codice]
        result.append({
            "codice":      codice,
            "nome":        info["nome"],
            "descrizione": info["descrizione"],
            "icona":       info.get("icona", "Package"),
            "attivo":      is_modulo_attivo(db, codice),
        })
    return result


@router.put("/moduli-attivi/{codice}")
def toggle_modulo(codice: str, data: dict, db: Session = Depends(get_db)):
    """
    Attiva o disattiva un modulo licenziato.
    Body: { "attivo": true/false }
    Blocca se il modulo non è nel pacchetto licenza di questa installazione.
    """
    if codice not in MODULI_DISPONIBILI:
        raise HTTPException(404, f"Modulo '{codice}' sconosciuto")

    if not is_modulo_licenziato(codice):
        raise HTTPException(403, "Modulo non incluso nella licenza di questa installazione")

    attivo  = bool(data.get("attivo", False))
    chiave  = _chiave_parametro(codice)
    valore  = "true" if attivo else "false"
    now     = datetime.now()

    try:
        existing = db.execute(
            text("SELECT id FROM parametri_sistema WHERE chiave = :k"),
            {"k": chiave}
        ).fetchone()

        if existing:
            db.execute(
                text("UPDATE parametri_sistema SET valore=:v, updated_at=:now WHERE chiave=:k"),
                {"v": valore, "now": now, "k": chiave}
            )
        else:
            mod = MODULI_DISPONIBILI[codice]
            db.execute(
                text("""INSERT INTO parametri_sistema
                        (chiave, valore, descrizione, tipo_dato, gruppo, created_at, updated_at)
                        VALUES (:k, :v, :d, 'boolean', 'moduli', :now, :now)"""),
                {"k": chiave, "v": valore,
                 "d": f"Attiva/disattiva modulo {mod['nome']}", "now": now}
            )
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, str(e))

    return {"codice": codice, "attivo": attivo, "nome": MODULI_DISPONIBILI[codice]["nome"]}


# ==========================================
# MIGRAZIONE STANDALONE
# ==========================================

def migrate_moduli(db_path: str = "configuratore.db"):
    """
    Inserisce i parametri DB solo per i moduli licenziati.
    Sicuro da eseguire più volte.
    """
    import sqlite3

    licenziati = get_moduli_licenziati()
    conn   = sqlite3.connect(db_path)
    cursor = conn.cursor()
    now    = datetime.now().isoformat()

    print("=" * 50)
    print("MIGRAZIONE MODULI ATTIVABILI")
    print(f"Moduli licenziati: {', '.join(licenziati) if licenziati else '(nessuno)'}")
    print("=" * 50)

    for codice, info in MODULI_DISPONIBILI.items():
        if codice not in licenziati:
            print(f"  ⏭️  {codice} — non licenziato, skip")
            continue
        chiave = _chiave_parametro(codice)
        cursor.execute("SELECT id FROM parametri_sistema WHERE chiave = ?", (chiave,))
        if cursor.fetchone():
            print(f"  ⏭️  {chiave} già presente, skip")
            continue
        valore = "true" if info["default"] else "false"
        cursor.execute("""
            INSERT INTO parametri_sistema
                (chiave, valore, descrizione, tipo_dato, gruppo, created_at, updated_at)
            VALUES (?, ?, ?, 'boolean', 'moduli', ?, ?)
        """, (chiave, valore, f"Attiva/disattiva modulo {info['nome']}", now, now))
        print(f"  ✅ Inserito: {chiave} = {valore}")

    conn.commit()
    conn.close()
    print("\n✅ Migrazione moduli completata")


if __name__ == "__main__":
    db = sys.argv[1] if len(sys.argv) > 1 else "configuratore.db"
    migrate_moduli(db)
