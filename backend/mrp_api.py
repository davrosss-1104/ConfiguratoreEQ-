"""
mrp_api.py — API REST per il modulo MRP
========================================
Includere in main.py:

    from mrp_api import router as mrp_router
    mrp_router.dependencies = [Depends(richiedi_modulo("mrp"))]
    app.include_router(mrp_router)
"""

import os
import json
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from database import SessionLocal

logger = logging.getLogger("mrp_api")

router = APIRouter(prefix="/mrp", tags=["MRP"])


# ==========================================
# DEPENDENCY
# ==========================================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _raw(db: Session):
    return db.get_bind().raw_connection()


def _db_path(db: Session) -> str:
    """Ricava il percorso fisico del file SQLite dalla connessione."""
    raw = _raw(db)
    cur = raw.cursor()
    cur.execute("PRAGMA database_list")
    for row in cur.fetchall():
        if row[1] == "main":
            return row[2]
    raise RuntimeError("Impossibile determinare il percorso del DB")


# ==========================================
# RUN MRP
# ==========================================

@router.post("/run")
def lancia_run_mrp(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
):
    """
    Lancia un run MRP.
    Body opzionale:
    {
        "orizzonte_giorni": 90,
        "commessa_ids": [1, 2, 3],   // null = tutte le commesse aperte
        "utente": "mario.rossi"
    }
    """
    from mrp_engine import esegui_run_mrp

    orizzonte    = int(payload.get("orizzonte_giorni") or 90)
    commessa_ids = payload.get("commessa_ids") or None
    utente       = payload.get("utente") or "sistema"

    try:
        db_path = _db_path(db)
        result  = esegui_run_mrp(
            db_path          = db_path,
            orizzonte_giorni = orizzonte,
            commessa_ids     = commessa_ids,
            utente           = utente,
        )
        return result
    except Exception as e:
        logger.exception("Errore durante run MRP")
        raise HTTPException(500, f"Errore MRP: {str(e)}")


# ==========================================
# LISTA RUN
# ==========================================

@router.get("/runs")
def lista_runs(
    page:  int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    conn   = _raw(db)
    cur    = conn.cursor()
    offset = (page - 1) * limit

    cur.execute("SELECT COUNT(*) FROM mrp_runs")
    totale = cur.fetchone()[0]

    cur.execute("""
        SELECT id, data_run, orizzonte_giorni, utente, stato,
               commesse_elaborate, righe_fabbisogno, proposte_generate,
               completed_at
        FROM mrp_runs
        ORDER BY data_run DESC
        LIMIT ? OFFSET ?
    """, (limit, offset))
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return {"totale": totale, "page": page, "limit": limit, "runs": rows}


# ==========================================
# DETTAGLIO RUN — FABBISOGNI
# ==========================================

@router.get("/runs/{run_id}/fabbisogni")
def fabbisogni_run(
    run_id:       int,
    solo_netto:   bool = True,
    q:            Optional[str] = None,
    fornitore:    Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Ritorna i fabbisogni calcolati per un run.
    solo_netto=true  → solo articoli con fabbisogno_netto > 0
    """
    conn  = _raw(db)
    cur   = conn.cursor()

    conds  = ["run_id = ?"]
    params = [run_id]

    if solo_netto:
        conds.append("quantita_fabbisogno_netto > 0")
    if q:
        conds.append("(codice_articolo LIKE ? OR descrizione LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    if fornitore:
        conds.append("fornitore LIKE ?")
        params.append(f"%{fornitore}%")

    where = " AND ".join(conds)
    cur.execute(f"""
        SELECT id, articolo_id, codice_articolo, descrizione,
               fornitore, unita_misura,
               quantita_fabbisogno_lordo, giacenza_disponibile,
               quantita_in_ordine, quantita_fabbisogno_netto,
               data_consegna_prima, commesse_json
        FROM mrp_fabbisogni
        WHERE {where}
        ORDER BY data_consegna_prima ASC, fornitore ASC, codice_articolo ASC
    """, params)
    cols = [d[0] for d in cur.description]
    rows = []
    for r in cur.fetchall():
        d = dict(zip(cols, r))
        try:
            d["commesse"] = json.loads(d.pop("commesse_json") or "[]")
        except Exception:
            d["commesse"] = []
        rows.append(d)

    conn.close()
    return {"run_id": run_id, "fabbisogni": rows, "totale": len(rows)}


# ==========================================
# LISTA PROPOSTE
# ==========================================

@router.get("/proposte")
def lista_proposte(
    run_id:   Optional[int] = None,
    stato:    Optional[str] = None,
    page:     int = 1,
    limit:    int = 50,
    db: Session = Depends(get_db),
):
    """
    Lista proposte d'ordine. Se run_id non specificato, ritorna l'ultimo run.
    """
    conn   = _raw(db)
    cur    = conn.cursor()

    # Se run_id non fornito, prendi l'ultimo run completato
    if not run_id:
        cur.execute("""
            SELECT id FROM mrp_runs
            WHERE stato = 'completato'
            ORDER BY data_run DESC LIMIT 1
        """)
        row = cur.fetchone()
        if not row:
            conn.close()
            return {"run_id": None, "proposte": [], "totale": 0}
        run_id = row[0]

    conds  = ["run_id = ?"]
    params = [run_id]
    if stato:
        conds.append("stato = ?")
        params.append(stato)

    where  = " AND ".join(conds)
    offset = (page - 1) * limit

    cur.execute(f"SELECT COUNT(*) FROM mrp_proposte_ordine WHERE {where}", params)
    totale = cur.fetchone()[0]

    cur.execute(f"""
        SELECT id, run_id, fornitore, fornitore_id,
               data_consegna_suggerita, stato, n_righe,
               righe_json, oda_id, created_at, updated_at
        FROM mrp_proposte_ordine
        WHERE {where}
        ORDER BY fornitore ASC
        LIMIT ? OFFSET ?
    """, params + [limit, offset])
    cols = [d[0] for d in cur.description]
    rows = []
    for r in cur.fetchall():
        d = dict(zip(cols, r))
        try:
            d["righe"] = json.loads(d.pop("righe_json") or "[]")
        except Exception:
            d["righe"] = []
        rows.append(d)

    conn.close()
    return {"run_id": run_id, "totale": totale, "page": page, "proposte": rows}


# ==========================================
# DETTAGLIO PROPOSTA
# ==========================================

@router.get("/proposte/{proposta_id}")
def dettaglio_proposta(proposta_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur  = conn.cursor()
    cur.execute("SELECT * FROM mrp_proposte_ordine WHERE id = ?", (proposta_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Proposta non trovata")
    cols = [d[0] for d in cur.description]
    d    = dict(zip(cols, row))
    try:
        d["righe"] = json.loads(d.pop("righe_json") or "[]")
    except Exception:
        d["righe"] = []
    conn.close()
    return d


# ==========================================
# CONVERTI PROPOSTA → ODA
# ==========================================

@router.post("/proposte/{proposta_id}/converti-oda")
def converti_proposta_oda(
    proposta_id: int,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
):
    """
    Converte una proposta MRP in un ODA bozza.
    Body opzionale: { "utente": "mario.rossi" }
    Ritorna: { "oda_id": int, "numero_oda": str }
    """
    from mrp_engine import converti_proposta_in_oda

    utente  = payload.get("utente") or "sistema"
    db_path = _db_path(db)

    import sqlite3
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        result = converti_proposta_in_oda(conn, proposta_id, utente)
        conn.commit()
        return result
    except ValueError as e:
        conn.rollback()
        raise HTTPException(400, str(e))
    except Exception as e:
        conn.rollback()
        logger.exception("Errore conversione proposta → ODA")
        raise HTTPException(500, str(e))
    finally:
        conn.close()


@router.post("/proposte/converti-tutte")
def converti_tutte_proposte(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    """
    Converte tutte le proposte 'proposta' di un run in ODA bozze.
    Body: { "run_id": int, "utente": "mario.rossi" }
    Ritorna: { "convertite": int, "oda_creati": [ {oda_id, numero_oda, fornitore} ] }
    """
    from mrp_engine import converti_proposta_in_oda

    run_id  = payload.get("run_id")
    utente  = payload.get("utente") or "sistema"

    if not run_id:
        raise HTTPException(400, "run_id obbligatorio")

    db_path = _db_path(db)

    import sqlite3
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur  = conn.cursor()
    cur.execute("""
        SELECT id, fornitore FROM mrp_proposte_ordine
        WHERE run_id = ? AND stato = 'proposta'
    """, (run_id,))
    proposte = [dict(r) for r in cur.fetchall()]

    if not proposte:
        conn.close()
        raise HTTPException(404, "Nessuna proposta convertibile per questo run")

    oda_creati = []
    errori     = []
    for p in proposte:
        try:
            result = converti_proposta_in_oda(conn, p["id"], utente)
            oda_creati.append({
                "oda_id":     result["oda_id"],
                "numero_oda": result["numero_oda"],
                "fornitore":  p["fornitore"],
            })
        except Exception as e:
            errori.append({"proposta_id": p["id"], "fornitore": p["fornitore"], "errore": str(e)})

    conn.commit()
    conn.close()

    return {
        "convertite":  len(oda_creati),
        "oda_creati":  oda_creati,
        "errori":      errori,
    }


# ==========================================
# ANNULLA / RIFIUTA PROPOSTA
# ==========================================

@router.put("/proposte/{proposta_id}/stato")
def aggiorna_stato_proposta(
    proposta_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    """
    Aggiorna lo stato di una proposta.
    Body: { "stato": "rifiutata" | "proposta" }
    """
    nuovo_stato = payload.get("stato")
    if nuovo_stato not in ("proposta", "rifiutata"):
        raise HTTPException(400, "Stato ammesso: proposta | rifiutata")

    conn = _raw(db)
    cur  = conn.cursor()
    cur.execute("SELECT stato FROM mrp_proposte_ordine WHERE id = ?", (proposta_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Proposta non trovata")
    if row[0] == "convertita":
        conn.close()
        raise HTTPException(400, "Non puoi modificare una proposta già convertita in ODA")

    cur.execute("""
        UPDATE mrp_proposte_ordine
        SET stato = ?, updated_at = datetime('now')
        WHERE id = ?
    """, (nuovo_stato, proposta_id))
    conn.commit()
    conn.close()
    return {"id": proposta_id, "stato": nuovo_stato}


# ==========================================
# COMMESSE DISPONIBILI PER SELEZIONE MRP
# ==========================================

@router.get("/commesse-selezionabili")
def commesse_selezionabili(
    orizzonte_giorni: int = 90,
    db: Session = Depends(get_db),
):
    """
    Lista commesse aperte selezionabili per un run MRP manuale.
    """
    from datetime import timedelta
    data_limite = (date.today() + timedelta(days=orizzonte_giorni)).isoformat()

    conn = _raw(db)
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            p.id,
            p.numero_preventivo,
            p.customer_name,
            p.status,
            COALESCE(dc.consegna_richiesta, ?)  AS data_consegna,
            COALESCE(dc.quantita, 1)             AS quantita,
            (SELECT COUNT(*) FROM materiali m WHERE m.preventivo_id = p.id) AS n_materiali
        FROM preventivi p
        LEFT JOIN dati_commessa dc ON dc.preventivo_id = p.id
        WHERE p.status IN ('confirmed', 'confermato', 'in_produzione', 'in_lavorazione')
          AND (dc.consegna_richiesta IS NULL OR dc.consegna_richiesta <= ?)
        ORDER BY data_consegna ASC
    """, (data_limite, data_limite))
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return rows
