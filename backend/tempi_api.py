"""
tempi_api.py — Misurazione tempi sui ticket
============================================
Endpoints:
  GET    /tickets/{id}/sessioni              lista sessioni del ticket
  POST   /tickets/{id}/sessioni              crea sessione manuale (con inizio+fine)
  POST   /tickets/{id}/sessioni/start        avvia timer live (crea sessione senza fine)
  POST   /tickets/{id}/sessioni/stop         stoppa timer live (chiude sessione aperta)
  PUT    /tickets/{id}/sessioni/{sid}        modifica sessione (note, fatturabile, orari)
  DELETE /tickets/{id}/sessioni/{sid}        elimina sessione
  GET    /report/tempi                       dashboard aggregata (filtri: utente_id, cliente_id, da, a)
  PUT    /tickets/{id}/tempo-previsto        aggiorna stima iniziale minuti

Registrare in main.py:
  from tempi_api import router as tempi_router
  app.include_router(tempi_router)

Autorizzazione: solo admin (is_admin=True) o tecnico assegnato al ticket.
"""

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session

try:
    from database import get_db
except ImportError:
    from main import get_db

router = APIRouter(tags=["tempi"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _raw(db: Session):
    return db.get_bind().raw_connection()


def _utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def _durata(inizio: str, fine: str) -> int:
    """Calcola durata in minuti tra due stringhe ISO."""
    fmt = "%Y-%m-%dT%H:%M:%S"
    try:
        dt_i = datetime.strptime(inizio[:19], fmt)
        dt_f = datetime.strptime(fine[:19], fmt)
        return max(0, int((dt_f - dt_i).total_seconds() // 60))
    except Exception:
        return 0


def _get_ticket(cur, ticket_id: int) -> dict:
    cur.execute("SELECT id, assegnato_a, stato FROM tickets WHERE id = ?", (ticket_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Ticket non trovato")
    return {"id": row[0], "assegnato_a": row[1], "stato": row[2]}


def _check_autorizzato(authorization: Optional[str], ticket: dict, db: Session):
    """
    Verifica che l'utente sia admin oppure il tecnico assegnato.
    Ritorna il record utente o None se autenticazione assente (backward compat).
    """
    if not authorization:
        return None
    token = authorization.replace("Bearer ", "").strip()
    try:
        from auth import get_user_from_token
        user = get_user_from_token(token, db)
    except Exception:
        raise HTTPException(401, "Token non valido")
    if not user:
        raise HTTPException(401, "Utente non trovato")
    if user.is_admin:
        return user
    if ticket.get("assegnato_a") and ticket["assegnato_a"] == user.id:
        return user
    # Controllo ruolo superadmin via codice
    try:
        from sqlalchemy.orm import Session as _S
        from models import Ruolo
        if user.ruolo_id:
            ruolo = db.query(Ruolo).filter_by(id=user.ruolo_id).first()
            if ruolo and ruolo.codice == "superadmin":
                return user
    except Exception:
        pass
    raise HTTPException(403, "Non autorizzato: solo admin o tecnico assegnato")


def _sessione_to_dict(row, cols) -> dict:
    d = dict(zip(cols, row))
    # Calcola durata live se sessione ancora aperta
    if d.get("fine") is None and d.get("inizio"):
        d["durata_minuti"] = _durata(d["inizio"], _utcnow())
        d["in_corso"] = True
    else:
        d["in_corso"] = False
    d["fatturabile"] = bool(d.get("fatturabile"))
    return d


# ==========================================
# SESSIONI — CRUD
# ==========================================

@router.get("/tickets/{ticket_id}/sessioni")
def lista_sessioni(
    ticket_id: int,
    db: Session = Depends(get_db)
):
    """Lista sessioni di lavoro del ticket, con totali aggregati."""
    conn = _raw(db)
    cur  = conn.cursor()
    _get_ticket(cur, ticket_id)  # verifica esistenza

    cur.execute("""
        SELECT s.*, u.username as utente_nome
        FROM ticket_sessioni_lavoro s
        LEFT JOIN utenti u ON u.id = s.utente_id
        WHERE s.ticket_id = ?
        ORDER BY s.inizio DESC
    """, (ticket_id,))
    cols = [d[0] for d in cur.description]
    sessioni = [_sessione_to_dict(r, cols) for r in cur.fetchall()]

    # Totali
    chiuse = [s for s in sessioni if not s["in_corso"]]
    totale_minuti      = sum(s.get("durata_minuti") or 0 for s in chiuse)
    fatturabili_minuti = sum(s.get("durata_minuti") or 0 for s in chiuse if s["fatturabile"])

    # Stima prevista
    cur.execute("SELECT tempo_previsto_minuti FROM tickets WHERE id = ?", (ticket_id,))
    row = cur.fetchone()
    tempo_previsto = row[0] if row and row[0] is not None else None

    conn.close()
    return {
        "sessioni": sessioni,
        "totale_minuti": totale_minuti,
        "fatturabili_minuti": fatturabili_minuti,
        "interni_minuti": totale_minuti - fatturabili_minuti,
        "tempo_previsto_minuti": tempo_previsto,
        "sessione_aperta": any(s["in_corso"] for s in sessioni),
    }


@router.post("/tickets/{ticket_id}/sessioni")
def crea_sessione_manuale(
    ticket_id: int,
    payload: dict,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Crea una sessione manuale con inizio e fine già noti.
    Body: { inizio: str (ISO), fine: str (ISO), note?: str, fatturabile?: bool, utente_id?: int }
    """
    conn = _raw(db)
    cur  = conn.cursor()
    ticket = _get_ticket(cur, ticket_id)
    user   = _check_autorizzato(authorization, ticket, db)

    inizio = payload.get("inizio")
    fine   = payload.get("fine")
    if not inizio:
        raise HTTPException(400, "inizio obbligatorio")

    durata = _durata(inizio, fine) if fine else None
    utente_id = payload.get("utente_id") or (user.id if user else None)
    fatturabile = 1 if payload.get("fatturabile", True) else 0

    cur.execute("""
        INSERT INTO ticket_sessioni_lavoro
            (ticket_id, utente_id, inizio, fine, durata_minuti, note, fatturabile)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (ticket_id, utente_id, inizio, fine, durata, payload.get("note"), fatturabile))
    sid = cur.lastrowid
    cur.execute("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?", (ticket_id,))
    conn.commit()
    conn.close()
    return {"id": sid, "status": "created", "durata_minuti": durata}


@router.post("/tickets/{ticket_id}/sessioni/start")
def start_timer(
    ticket_id: int,
    payload: dict,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Avvia un timer live: crea una sessione con inizio=adesso e fine=NULL.
    Body: { utente_id?: int, note?: str, fatturabile?: bool }
    Restituisce errore se l'utente ha già una sessione aperta su questo ticket.
    """
    conn = _raw(db)
    cur  = conn.cursor()
    ticket = _get_ticket(cur, ticket_id)
    user   = _check_autorizzato(authorization, ticket, db)

    utente_id = payload.get("utente_id") or (user.id if user else None)
    if not utente_id:
        raise HTTPException(400, "utente_id obbligatorio")

    # Verifica sessione già aperta per questo utente su questo ticket
    cur.execute("""
        SELECT id FROM ticket_sessioni_lavoro
        WHERE ticket_id = ? AND utente_id = ? AND fine IS NULL
        LIMIT 1
    """, (ticket_id, utente_id))
    if cur.fetchone():
        conn.close()
        raise HTTPException(400, "Sessione già in corso per questo utente su questo ticket")

    adesso = _utcnow()
    fatturabile = 1 if payload.get("fatturabile", True) else 0
    cur.execute("""
        INSERT INTO ticket_sessioni_lavoro
            (ticket_id, utente_id, inizio, fine, durata_minuti, note, fatturabile)
        VALUES (?, ?, ?, NULL, NULL, ?, ?)
    """, (ticket_id, utente_id, adesso, payload.get("note"), fatturabile))
    sid = cur.lastrowid
    cur.execute("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?", (ticket_id,))
    conn.commit()
    conn.close()
    return {"id": sid, "status": "started", "inizio": adesso}


@router.post("/tickets/{ticket_id}/sessioni/stop")
def stop_timer(
    ticket_id: int,
    payload: dict,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Stoppa il timer live: chiude la sessione aperta dell'utente.
    Body: { utente_id?: int, note?: str }
    """
    conn = _raw(db)
    cur  = conn.cursor()
    ticket = _get_ticket(cur, ticket_id)
    user   = _check_autorizzato(authorization, ticket, db)

    utente_id = payload.get("utente_id") or (user.id if user else None)
    if not utente_id:
        raise HTTPException(400, "utente_id obbligatorio")

    cur.execute("""
        SELECT id, inizio FROM ticket_sessioni_lavoro
        WHERE ticket_id = ? AND utente_id = ? AND fine IS NULL
        ORDER BY inizio DESC LIMIT 1
    """, (ticket_id, utente_id))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(400, "Nessuna sessione aperta trovata")

    sid   = row[0]
    inizio = row[1]
    adesso = _utcnow()
    durata = _durata(inizio, adesso)
    note   = payload.get("note")

    cur.execute("""
        UPDATE ticket_sessioni_lavoro
        SET fine = ?, durata_minuti = ?, note = COALESCE(?, note)
        WHERE id = ?
    """, (adesso, durata, note, sid))
    cur.execute("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?", (ticket_id,))
    conn.commit()
    conn.close()
    return {"id": sid, "status": "stopped", "fine": adesso, "durata_minuti": durata}


@router.put("/tickets/{ticket_id}/sessioni/{sessione_id}")
def modifica_sessione(
    ticket_id: int,
    sessione_id: int,
    payload: dict,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Modifica una sessione (note, fatturabile, inizio, fine).
    Ricalcola durata se inizio/fine vengono modificati.
    """
    conn = _raw(db)
    cur  = conn.cursor()
    ticket = _get_ticket(cur, ticket_id)
    _check_autorizzato(authorization, ticket, db)

    cur.execute("SELECT id, inizio, fine FROM ticket_sessioni_lavoro WHERE id = ? AND ticket_id = ?",
                (sessione_id, ticket_id))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Sessione non trovata")

    inizio_old, fine_old = row[1], row[2]
    inizio  = payload.get("inizio", inizio_old)
    fine    = payload.get("fine", fine_old)
    durata  = _durata(inizio, fine) if fine else None

    updates = {
        "inizio":         inizio,
        "fine":           fine,
        "durata_minuti":  durata,
        "note":           payload.get("note", ""),
        "fatturabile":    1 if payload.get("fatturabile", True) else 0,
    }
    cur.execute("""
        UPDATE ticket_sessioni_lavoro
        SET inizio=?, fine=?, durata_minuti=?, note=?, fatturabile=?
        WHERE id=?
    """, (updates["inizio"], updates["fine"], updates["durata_minuti"],
          updates["note"], updates["fatturabile"], sessione_id))
    conn.commit()
    conn.close()
    return {"status": "updated", "durata_minuti": durata}


@router.delete("/tickets/{ticket_id}/sessioni/{sessione_id}")
def elimina_sessione(
    ticket_id: int,
    sessione_id: int,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    conn = _raw(db)
    cur  = conn.cursor()
    ticket = _get_ticket(cur, ticket_id)
    _check_autorizzato(authorization, ticket, db)

    cur.execute("DELETE FROM ticket_sessioni_lavoro WHERE id = ? AND ticket_id = ?",
                (sessione_id, ticket_id))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


# ==========================================
# STIMA PREVISTA
# ==========================================

@router.put("/tickets/{ticket_id}/tempo-previsto")
def aggiorna_tempo_previsto(
    ticket_id: int,
    payload: dict,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Imposta la stima iniziale del tempo previsto (minuti).
    Body: { minuti: int }
    """
    conn = _raw(db)
    cur  = conn.cursor()
    ticket = _get_ticket(cur, ticket_id)
    _check_autorizzato(authorization, ticket, db)

    minuti = payload.get("minuti")
    if minuti is not None and (not isinstance(minuti, int) or minuti < 0):
        raise HTTPException(400, "minuti deve essere un intero >= 0")

    cur.execute("UPDATE tickets SET tempo_previsto_minuti = ? WHERE id = ?", (minuti, ticket_id))
    conn.commit()
    conn.close()
    return {"status": "updated", "tempo_previsto_minuti": minuti}


# ==========================================
# REPORT TEMPI
# ==========================================

@router.get("/report/tempi")
def report_tempi(
    utente_id:  Optional[int] = Query(None),
    cliente_id: Optional[int] = Query(None),
    da:         Optional[str] = Query(None, description="Data inizio filtro (YYYY-MM-DD)"),
    a:          Optional[str] = Query(None, description="Data fine filtro (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Dashboard aggregata tempi.
    Ritorna:
      - per_tecnico: totale minuti e fatturabili per ogni tecnico
      - per_cliente: totale minuti per ogni cliente
      - per_ticket:  lista ticket con totale minuti, stima e delta
      - totali globali
    """
    conn = _raw(db)
    cur  = conn.cursor()

    # Clausole WHERE condivise
    where = ["s.fine IS NOT NULL"]   # esclude sessioni ancora aperte dalle statistiche
    params: list = []

    if utente_id:
        where.append("s.utente_id = ?")
        params.append(utente_id)
    if cliente_id:
        where.append("t.cliente_id = ?")
        params.append(cliente_id)
    if da:
        where.append("date(s.inizio) >= ?")
        params.append(da)
    if a:
        where.append("date(s.inizio) <= ?")
        params.append(a)

    where_sql = " AND ".join(where)

    # ── Per tecnico ───────────────────────────────────────────
    cur.execute(f"""
        SELECT
            u.id,
            u.username,
            u.nome || ' ' || COALESCE(u.cognome,'') AS nome_completo,
            SUM(s.durata_minuti)                     AS totale_minuti,
            SUM(CASE WHEN s.fatturabile=1 THEN s.durata_minuti ELSE 0 END) AS fatturabili_minuti,
            COUNT(DISTINCT s.ticket_id)               AS num_ticket,
            COUNT(s.id)                               AS num_sessioni
        FROM ticket_sessioni_lavoro s
        JOIN tickets t ON t.id = s.ticket_id
        LEFT JOIN utenti u ON u.id = s.utente_id
        WHERE {where_sql}
        GROUP BY s.utente_id
        ORDER BY totale_minuti DESC
    """, params)
    cols_u = [d[0] for d in cur.description]
    per_tecnico = [dict(zip(cols_u, r)) for r in cur.fetchall()]

    # ── Per cliente ───────────────────────────────────────────
    cur.execute(f"""
        SELECT
            c.id,
            c.ragione_sociale,
            SUM(s.durata_minuti)                                           AS totale_minuti,
            SUM(CASE WHEN s.fatturabile=1 THEN s.durata_minuti ELSE 0 END) AS fatturabili_minuti,
            COUNT(DISTINCT s.ticket_id)                                    AS num_ticket
        FROM ticket_sessioni_lavoro s
        JOIN tickets t  ON t.id  = s.ticket_id
        LEFT JOIN clienti c ON c.id = t.cliente_id
        WHERE {where_sql}
        GROUP BY t.cliente_id
        ORDER BY totale_minuti DESC
    """, params)
    cols_c = [d[0] for d in cur.description]
    per_cliente = [dict(zip(cols_c, r)) for r in cur.fetchall()]

    # ── Per ticket ────────────────────────────────────────────
    cur.execute(f"""
        SELECT
            t.id,
            t.numero_ticket,
            t.titolo,
            t.stato,
            t.tempo_previsto_minuti,
            c.ragione_sociale   AS cliente_nome,
            u.username          AS assegnato_nome,
            SUM(s.durata_minuti)                                           AS totale_minuti,
            SUM(CASE WHEN s.fatturabile=1 THEN s.durata_minuti ELSE 0 END) AS fatturabili_minuti,
            COUNT(s.id)                                                    AS num_sessioni
        FROM ticket_sessioni_lavoro s
        JOIN tickets t  ON t.id  = s.ticket_id
        LEFT JOIN clienti c ON c.id = t.cliente_id
        LEFT JOIN utenti u  ON u.id = t.assegnato_a
        WHERE {where_sql}
        GROUP BY s.ticket_id
        ORDER BY totale_minuti DESC
    """, params)
    cols_t = [d[0] for d in cur.description]
    per_ticket = []
    for r in cur.fetchall():
        row = dict(zip(cols_t, r))
        previsto = row.get("tempo_previsto_minuti")
        effettivo = row.get("totale_minuti") or 0
        row["delta_minuti"] = (effettivo - previsto) if previsto is not None else None
        per_ticket.append(row)

    # ── Totali globali ────────────────────────────────────────
    totale_globale      = sum(r.get("totale_minuti") or 0 for r in per_tecnico)
    fatturabili_globale = sum(r.get("fatturabili_minuti") or 0 for r in per_tecnico)

    conn.close()
    return {
        "per_tecnico":          per_tecnico,
        "per_cliente":          per_cliente,
        "per_ticket":           per_ticket,
        "totale_minuti":        totale_globale,
        "fatturabili_minuti":   fatturabili_globale,
        "interni_minuti":       totale_globale - fatturabili_globale,
    }
