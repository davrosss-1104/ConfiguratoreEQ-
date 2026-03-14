"""
fornitori_api.py - API REST per l'anagrafica fornitori
=======================================================
Includere in main.py:
    from fornitori_api import router as fornitori_router
    app.include_router(fornitori_router)
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

try:
    from database import get_db
except ImportError:
    from main import get_db

router = APIRouter(prefix="/fornitori", tags=["Fornitori"])


def _raw(db: Session):
    return db.get_bind().raw_connection()


# ==========================================
# LISTA FORNITORI
# ==========================================

@router.get("")
def lista_fornitori(
    q:      Optional[str] = None,
    attivo: Optional[int] = None,
    db: Session = Depends(get_db)
):
    conn = _raw(db)
    cur  = conn.cursor()
    sql  = "SELECT * FROM fornitori WHERE 1=1"
    params = []
    if q:
        sql += " AND (LOWER(ragione_sociale) LIKE LOWER(?) OR LOWER(email) LIKE LOWER(?) OR codice LIKE ?)"
        params += [f"%{q}%", f"%{q}%", f"%{q}%"]
    if attivo is not None:
        sql += " AND attivo = ?"
        params.append(attivo)
    sql += " ORDER BY ragione_sociale"
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return rows


# ==========================================
# DETTAGLIO
# ==========================================

@router.get("/{fornitore_id}")
def get_fornitore(fornitore_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur  = conn.cursor()
    cur.execute("SELECT * FROM fornitori WHERE id = ?", (fornitore_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Fornitore non trovato")
    cols = [d[0] for d in cur.description]
    f = dict(zip(cols, row))

    # Articoli collegati
    cur.execute("""
        SELECT id, codice, descrizione, codice_fornitore, is_active
        FROM articoli WHERE fornitore_id = ?
        ORDER BY codice
    """, (fornitore_id,))
    a_cols = [d[0] for d in cur.description]
    f["articoli"] = [dict(zip(a_cols, r)) for r in cur.fetchall()]

    conn.close()
    return f


# ==========================================
# CREA
# ==========================================

@router.post("")
def crea_fornitore(payload: dict = Body(...), db: Session = Depends(get_db)):
    ragione = (payload.get("ragione_sociale") or "").strip()
    if not ragione:
        raise HTTPException(400, "ragione_sociale obbligatoria")

    conn = _raw(db)
    cur  = conn.cursor()

    # Controlla duplicati
    cur.execute(
        "SELECT id FROM fornitori WHERE LOWER(ragione_sociale) = LOWER(?)",
        (ragione,)
    )
    if cur.fetchone():
        conn.close()
        raise HTTPException(409, f"Fornitore '{ragione}' già esistente")

    now = datetime.now().isoformat()
    cur.execute("""
        INSERT INTO fornitori (
            ragione_sociale, denominazione, codice, partita_iva, codice_fiscale,
            pec, email, email_cc, telefono,
            indirizzo, comune, provincia, cap, paese, nazione,
            iban, condizioni_pagamento, note, attivo,
            created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
    """, (
        ragione,
        ragione,  # denominazione = ragione_sociale
        payload.get("codice"),
        payload.get("partita_iva"),
        payload.get("codice_fiscale"),
        payload.get("pec"),
        payload.get("email"),
        payload.get("email_cc"),
        payload.get("telefono"),
        payload.get("indirizzo"),
        payload.get("comune"),
        payload.get("provincia"),
        payload.get("cap"),
        payload.get("paese", "IT"),
        payload.get("paese", "IT"),  # nazione = paese
        payload.get("iban"),
        payload.get("condizioni_pagamento"),
        payload.get("note"),
        now, now,
    ))
    fid = cur.lastrowid
    conn.commit()
    conn.close()
    return {"id": fid, "ragione_sociale": ragione}


# ==========================================
# AGGIORNA
# ==========================================

@router.put("/{fornitore_id}")
def aggiorna_fornitore(fornitore_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    campi = {
        "ragione_sociale", "denominazione", "codice", "partita_iva", "codice_fiscale",
        "pec", "email", "email_cc", "telefono",
        "indirizzo", "comune", "provincia", "cap", "paese", "nazione",
        "iban", "condizioni_pagamento", "note", "attivo",
    }
    aggiorn = {k: v for k, v in payload.items() if k in campi}
    if not aggiorn:
        raise HTTPException(400, "Nessun campo aggiornabile")

    # Mantieni ragione_sociale e denominazione in sync
    if "ragione_sociale" in aggiorn and "denominazione" not in aggiorn:
        aggiorn["denominazione"] = aggiorn["ragione_sociale"]
    elif "denominazione" in aggiorn and "ragione_sociale" not in aggiorn:
        aggiorn["ragione_sociale"] = aggiorn["denominazione"]

    conn = _raw(db)
    cur  = conn.cursor()
    cur.execute("SELECT id FROM fornitori WHERE id = ?", (fornitore_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, "Fornitore non trovato")

    set_cl = ", ".join(f"{k} = ?" for k in aggiorn)
    cur.execute(
        f"UPDATE fornitori SET {set_cl}, updated_at = ? WHERE id = ?",
        list(aggiorn.values()) + [datetime.now().isoformat(), fornitore_id]
    )
    conn.commit()
    conn.close()
    return {"id": fornitore_id}


# ==========================================
# ELIMINA (soft: attivo = 0)
# ==========================================

@router.delete("/{fornitore_id}")
def elimina_fornitore(fornitore_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur  = conn.cursor()
    cur.execute("SELECT id FROM fornitori WHERE id = ?", (fornitore_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, "Fornitore non trovato")

    # Verifica articoli collegati
    cur.execute("SELECT COUNT(*) FROM articoli WHERE fornitore_id = ?", (fornitore_id,))
    if cur.fetchone()[0] > 0:
        # Soft delete: non blocca, ma avvisa
        cur.execute(
            "UPDATE fornitori SET attivo = 0, updated_at = ? WHERE id = ?",
            (datetime.now().isoformat(), fornitore_id)
        )
        conn.commit()
        conn.close()
        return {"disattivato": True, "motivo": "Fornitore ha articoli collegati — disattivato invece di eliminato"}

    cur.execute("DELETE FROM fornitori WHERE id = ?", (fornitore_id,))
    conn.commit()
    conn.close()
    return {"eliminato": True}


# ==========================================
# TROVA O CREA DA STRINGA
# ==========================================

@router.post("/da-stringa")
def trova_o_crea_da_stringa(payload: dict = Body(...), db: Session = Depends(get_db)):
    """
    Dato un nome fornitore testuale (come salvato in articoli.fornitore),
    cerca un fornitore corrispondente o ne crea uno nuovo (senza email/dati).
    Ritorna sempre { id, ragione_sociale, è_nuovo }.
    Usato dalla generazione automatica ODA.
    """
    nome = (payload.get("nome") or "").strip()
    if not nome:
        raise HTTPException(400, "nome obbligatorio")

    conn = _raw(db)
    cur  = conn.cursor()
    cur.execute(
        "SELECT id, ragione_sociale FROM fornitori WHERE LOWER(ragione_sociale) = LOWER(?)",
        (nome,)
    )
    row = cur.fetchone()
    if row:
        conn.close()
        return {"id": row[0], "ragione_sociale": row[1], "nuovo": False}

    # Crea minimo
    now = datetime.now().isoformat()
    cur.execute(
        "INSERT INTO fornitori (ragione_sociale, denominazione, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (nome, nome, now, now)
    )
    fid = cur.lastrowid
    conn.commit()
    conn.close()
    return {"id": fid, "ragione_sociale": nome, "nuovo": True}
