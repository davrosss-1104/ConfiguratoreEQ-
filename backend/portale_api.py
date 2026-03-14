"""
portale_api.py — Portale Cliente
=================================
Endpoints dedicati ai clienti autenticati (ruolo cliente_base / cliente_avanzato).
Tutti i dati sono filtrati per il cliente_id dell'utente loggato.

Registrare in main.py:
    from portale_api import router as portale_router
    app.include_router(portale_router, prefix="/api/portale")
"""

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from typing import Optional

try:
    from database import get_db
except ImportError:
    from main import get_db

router = APIRouter(tags=["portale"])


# ── helpers ──────────────────────────────────────────────────────────────────

def _raw(db: Session):
    return db.get_bind().raw_connection()


def _get_cliente_id_from_token(authorization: Optional[str], db: Session):
    """
    Estrae cliente_id dal token JWT.
    Lancia 401 se non autenticato, 403 se utente non ha un cliente collegato.
    Ritorna (cliente_id, user).
    """
    if not authorization:
        raise HTTPException(401, "Token mancante")
    token = authorization.replace("Bearer ", "").strip()
    try:
        from auth import get_user_from_token
        user = get_user_from_token(token, db)
    except Exception:
        raise HTTPException(401, "Token non valido")
    if not user:
        raise HTTPException(401, "Utente non trovato")
    if not user.cliente_id:
        raise HTTPException(403, "Utente non associato a nessun cliente")
    return user.cliente_id, user


# ==========================================
# INFO CLIENTE
# ==========================================

@router.get("/me")
def portale_me(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Dati del cliente loggato."""
    cliente_id, user = _get_cliente_id_from_token(authorization, db)
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("""
        SELECT id, ragione_sociale, codice, citta, provincia,
               telefono, email, pec
        FROM clienti WHERE id = ?
    """, (cliente_id,))
    cols = [d[0] for d in cur.description]
    row = cur.fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Cliente non trovato")
    cliente = dict(zip(cols, row))
    cliente["utente_username"] = user.username
    cliente["utente_email"]    = user.email
    return cliente


# ==========================================
# DASHBOARD RIEPILOGATIVA
# ==========================================

@router.get("/dashboard")
def portale_dashboard(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Riepilogo numerico per la homepage del portale cliente:
    - contatori ticket per stato
    - contatori ordini per stato
    - numero preventivi
    - ultimi aggiornamenti (ticket + ordini mescolati, ordinati per data)
    """
    cliente_id, _ = _get_cliente_id_from_token(authorization, db)
    conn = _raw(db)
    cur = conn.cursor()

    # ── Ticket ────────────────────────────────────────────────────────────────
    cur.execute("""
        SELECT
            COUNT(*) AS totale,
            SUM(CASE WHEN stato NOT IN ('chiuso','annullato') THEN 1 ELSE 0 END) AS aperti,
            SUM(CASE WHEN stato IN ('risolto','chiuso') THEN 1 ELSE 0 END) AS risolti,
            SUM(CASE WHEN stato = 'in_attesa_ricambi' THEN 1 ELSE 0 END) AS in_attesa_ricambi
        FROM tickets WHERE cliente_id = ?
    """, (cliente_id,))
    r = cur.fetchone()
    ticket_stats = {
        "totale":            r[0] or 0,
        "aperti":            r[1] or 0,
        "risolti":           r[2] or 0,
        "in_attesa_ricambi": r[3] or 0,
    }

    # ── Ordini ────────────────────────────────────────────────────────────────
    cur.execute("""
        SELECT
            COUNT(*) AS totale,
            SUM(CASE WHEN stato IN ('confermato','in_produzione') THEN 1 ELSE 0 END) AS in_corso,
            SUM(CASE WHEN stato = 'completato' THEN 1 ELSE 0 END) AS completati,
            SUM(CASE WHEN stato = 'spedito' THEN 1 ELSE 0 END) AS spediti
        FROM ordini WHERE cliente_id = ?
    """, (cliente_id,))
    r = cur.fetchone()
    ordine_stats = {
        "totale":     r[0] or 0,
        "in_corso":   r[1] or 0,
        "completati": r[2] or 0,
        "spediti":    r[3] or 0,
    }

    # ── Preventivi ───────────────────────────────────────────────────────────
    cur.execute("SELECT COUNT(*) FROM preventivi WHERE cliente_id = ?", (cliente_id,))
    n_preventivi = cur.fetchone()[0] or 0

    # ── Ultimi aggiornamenti (feed) ───────────────────────────────────────────
    cur.execute("""
        SELECT 'ticket' as tipo, t.id, t.numero_ticket as numero,
               t.titolo as descrizione, t.stato, t.updated_at as data
        FROM tickets t
        WHERE t.cliente_id = ?
        AND t.updated_at IS NOT NULL
        ORDER BY t.updated_at DESC
        LIMIT 5
    """, (cliente_id,))
    cols_tk = [d[0] for d in cur.description]
    feed_ticket = [dict(zip(cols_tk, r)) for r in cur.fetchall()]

    cur.execute("""
        SELECT 'ordine' as tipo, o.id, o.numero_ordine as numero,
               o.tipo_impianto as descrizione, o.stato, o.updated_at as data
        FROM ordini o
        WHERE o.cliente_id = ?
        AND o.updated_at IS NOT NULL
        ORDER BY o.updated_at DESC
        LIMIT 5
    """, (cliente_id,))
    cols_ord = [d[0] for d in cur.description]
    feed_ordini = [dict(zip(cols_ord, r)) for r in cur.fetchall()]

    feed = sorted(feed_ticket + feed_ordini, key=lambda x: x["data"] or "", reverse=True)[:8]

    conn.close()
    return {
        "ticket_stats":  ticket_stats,
        "ordine_stats":  ordine_stats,
        "n_preventivi":  n_preventivi,
        "feed":          feed,
    }


# ==========================================
# TICKETS
# ==========================================

@router.get("/tickets")
def portale_tickets(
    stato: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Lista ticket del cliente, filtrabili per stato."""
    cliente_id, _ = _get_cliente_id_from_token(authorization, db)
    conn = _raw(db)
    cur = conn.cursor()
    sql = """
        SELECT t.id, t.numero_ticket, t.titolo, t.stato, t.priorita,
               t.tipo, t.created_at, t.updated_at, t.scadenza,
               t.risolto_at, t.chiuso_at,
               i.codice_cliente as impianto_codice,
               cat.nome as categoria_nome, cat.colore as categoria_colore,
               (SELECT COUNT(*) FROM ticket_commenti tc
                WHERE tc.ticket_id = t.id
                AND (tc.visibile_cliente = 1 OR tc.tipo IN ('cambio_stato'))) as n_messaggi
        FROM tickets t
        LEFT JOIN impianti i ON i.id = t.impianto_id
        LEFT JOIN categorie_ticket cat ON cat.id = t.categoria_id
        WHERE t.cliente_id = ?
    """
    params = [cliente_id]
    if stato == 'aperti':
        sql += " AND t.stato NOT IN ('chiuso','annullato')"
    elif stato == 'chiusi':
        sql += " AND t.stato IN ('chiuso','annullato','risolto')"
    elif stato:
        sql += " AND t.stato = ?"
        params.append(stato)
    sql += " ORDER BY t.updated_at DESC"
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return rows


@router.get("/tickets/{ticket_id}")
def portale_ticket_dettaglio(
    ticket_id: int,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Dettaglio ticket — solo commenti visibili al cliente."""
    cliente_id, _ = _get_cliente_id_from_token(authorization, db)
    conn = _raw(db)
    cur = conn.cursor()

    cur.execute("""
        SELECT t.*, i.codice_cliente as impianto_codice,
               cat.nome as categoria_nome, cat.colore as categoria_colore
        FROM tickets t
        LEFT JOIN impianti i ON i.id = t.impianto_id
        LEFT JOIN categorie_ticket cat ON cat.id = t.categoria_id
        WHERE t.id = ? AND t.cliente_id = ?
    """, (ticket_id, cliente_id))
    cols = [d[0] for d in cur.description]
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Ticket non trovato")
    ticket = dict(zip(cols, row))

    cur.execute("""
        SELECT tc.id, tc.testo, tc.tipo, tc.created_at,
               u.username as autore
        FROM ticket_commenti tc
        LEFT JOIN utenti u ON u.id = tc.utente_id
        WHERE tc.ticket_id = ?
        AND (tc.visibile_cliente = 1 OR tc.tipo IN ('cambio_stato'))
        ORDER BY tc.created_at ASC
    """, (ticket_id,))
    comm_cols = [d[0] for d in cur.description]
    ticket["messaggi"] = [dict(zip(comm_cols, r)) for r in cur.fetchall()]

    conn.close()
    return ticket


@router.post("/tickets/{ticket_id}/rispondi")
def portale_rispondi(
    ticket_id: int,
    payload: dict,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Il cliente aggiunge un messaggio al ticket."""
    cliente_id, user = _get_cliente_id_from_token(authorization, db)
    testo = payload.get("testo", "").strip()
    if not testo:
        raise HTTPException(400, "testo obbligatorio")

    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("SELECT id, stato FROM tickets WHERE id = ? AND cliente_id = ?", (ticket_id, cliente_id))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Ticket non trovato")
    if row[1] in ("chiuso", "annullato"):
        conn.close()
        raise HTTPException(400, "Ticket chiuso, non è possibile aggiungere messaggi")

    cur.execute("""
        INSERT INTO ticket_commenti (ticket_id, utente_id, testo, tipo, visibile_cliente)
        VALUES (?, ?, ?, 'risposta_cliente', 1)
    """, (ticket_id, user.id, testo))
    cur.execute("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?", (ticket_id,))
    conn.commit()
    comm_id = cur.lastrowid
    conn.close()
    return {"id": comm_id, "status": "created"}


@router.post("/tickets")
def portale_apri_ticket(
    payload: dict,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Il cliente apre una nuova richiesta di assistenza.
    Payload: { "titolo": "...", "descrizione": "...", "impianto_id": (opzionale), "priorita": (opzionale) }
    """
    cliente_id, user = _get_cliente_id_from_token(authorization, db)
    titolo = payload.get("titolo", "").strip()
    if not titolo:
        raise HTTPException(400, "titolo obbligatorio")

    conn = _raw(db)
    cur = conn.cursor()

    # Genera numero ticket
    from datetime import datetime as _dt
    anno = _dt.now().year
    cur.execute("SELECT COUNT(*) FROM tickets WHERE numero_ticket LIKE ?", (f"TK-{anno}-%",))
    n = cur.fetchone()[0] + 1
    numero = f"TK-{anno}-{n:04d}"

    # Verifica impianto se fornito
    impianto_id = payload.get("impianto_id")
    if impianto_id:
        cur.execute("SELECT id FROM impianti WHERE id = ? AND cliente_id = ?", (impianto_id, cliente_id))
        if not cur.fetchone():
            conn.close()
            raise HTTPException(403, "Impianto non associato al tuo account")

    cur.execute("""
        INSERT INTO tickets (
            numero_ticket, tipo, titolo, descrizione, stato, priorita,
            cliente_id, impianto_id, creato_da
        ) VALUES (?, 'esterno', ?, ?, 'ricevuto', ?, ?, ?, ?)
    """, (
        numero,
        titolo,
        payload.get("descrizione", ""),
        payload.get("priorita", "normale"),
        cliente_id,
        impianto_id,
        user.id,
    ))
    ticket_id = cur.lastrowid

    cur.execute("""
        INSERT INTO ticket_commenti (ticket_id, utente_id, testo, tipo, visibile_cliente)
        VALUES (?, ?, 'Richiesta aperta dal cliente', 'cambio_stato', 1)
    """, (ticket_id, user.id))

    conn.commit()
    conn.close()
    return {"id": ticket_id, "numero_ticket": numero, "status": "created"}


# ==========================================
# ORDINI
# ==========================================

@router.get("/ordini")
def portale_ordini(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Lista ordini del cliente."""
    cliente_id, _ = _get_cliente_id_from_token(authorization, db)
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("""
        SELECT o.id, o.numero_ordine, o.stato, o.created_at, o.updated_at,
               o.tipo_impianto, o.data_consegna_prevista, o.totale_netto,
               p.numero_preventivo
        FROM ordini o
        LEFT JOIN preventivi p ON p.id = o.preventivo_id
        WHERE o.cliente_id = ?
        ORDER BY o.created_at DESC
    """, (cliente_id,))
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return rows


@router.get("/ordini/{ordine_id}")
def portale_ordine_dettaglio(
    ordine_id: int,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """
    Dettaglio ordine con storico stati (timeline) e impianti collegati.
    """
    cliente_id, _ = _get_cliente_id_from_token(authorization, db)
    conn = _raw(db)
    cur = conn.cursor()

    cur.execute("""
        SELECT o.*, p.numero_preventivo
        FROM ordini o
        LEFT JOIN preventivi p ON p.id = o.preventivo_id
        WHERE o.id = ? AND o.cliente_id = ?
    """, (ordine_id, cliente_id))
    cols = [d[0] for d in cur.description]
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Ordine non trovato")
    ordine = dict(zip(cols, row))

    # Storico stati (timeline)
    try:
        cur.execute("""
            SELECT stato_nuovo, motivo, utente, created_at
            FROM ordini_storico_stato
            WHERE ordine_id = ?
            ORDER BY created_at ASC
        """, (ordine_id,))
        st_cols = [d[0] for d in cur.description]
        ordine["storico_stati"] = [dict(zip(st_cols, r)) for r in cur.fetchall()]
    except Exception:
        ordine["storico_stati"] = []

    # Impianti collegati
    try:
        cur.execute("""
            SELECT i.codice_cliente, i.descrizione, i.indirizzo_installazione
            FROM ordini_impianti oi
            JOIN impianti i ON i.id = oi.impianto_id
            WHERE oi.ordine_id = ?
        """, (ordine_id,))
        imp_cols = [d[0] for d in cur.description]
        ordine["impianti"] = [dict(zip(imp_cols, r)) for r in cur.fetchall()]
    except Exception:
        ordine["impianti"] = []

    # Ticket collegati a questo ordine
    cur.execute("""
        SELECT id, numero_ticket, titolo, stato, updated_at
        FROM tickets
        WHERE ordine_id = ? AND cliente_id = ?
        ORDER BY updated_at DESC
    """, (ordine_id, cliente_id))
    tk_cols = [d[0] for d in cur.description]
    ordine["tickets_collegati"] = [dict(zip(tk_cols, r)) for r in cur.fetchall()]

    conn.close()
    return ordine


# ==========================================
# PREVENTIVI
# ==========================================

@router.get("/preventivi")
def portale_preventivi(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Lista preventivi del cliente con stato ordine se presente."""
    cliente_id, _ = _get_cliente_id_from_token(authorization, db)
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("""
        SELECT p.id, p.numero_preventivo, p.tipo_preventivo, p.categoria,
               p.created_at, p.updated_at,
               o.id as ordine_id, o.numero_ordine, o.stato as stato_ordine,
               o.data_consegna_prevista
        FROM preventivi p
        LEFT JOIN ordini o ON o.preventivo_id = p.id
        WHERE p.cliente_id = ?
        ORDER BY p.created_at DESC
    """, (cliente_id,))
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return rows


# ==========================================
# IMPIANTI DEL CLIENTE
# ==========================================

@router.get("/impianti")
def portale_impianti(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Lista impianti associati al cliente loggato."""
    cliente_id, _ = _get_cliente_id_from_token(authorization, db)
    conn = _raw(db)
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT id, codice_cliente, descrizione, indirizzo_installazione
            FROM impianti
            WHERE cliente_id = ?
            ORDER BY codice_cliente
        """, (cliente_id,))
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    except Exception:
        rows = []
    conn.close()
    return rows


# ==========================================
# MATERIALI TICKET (visibili al cliente)
# ==========================================

@router.get("/tickets/{ticket_id}/materiali")
def portale_ticket_materiali(
    ticket_id: int,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
):
    """Materiali impiegati nel ticket, solo quelli con visibile_cliente=1."""
    cliente_id, _ = _get_cliente_id_from_token(authorization, db)
    conn = _raw(db)
    cur = conn.cursor()

    # Verifica che il ticket appartenga al cliente
    cur.execute("SELECT id FROM tickets WHERE id = ? AND cliente_id = ?", (ticket_id, cliente_id))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, "Ticket non trovato")

    try:
        cur.execute("""
            SELECT tm.id, tm.codice, tm.descrizione, tm.quantita, tm.unita_misura, tm.note, tm.created_at
            FROM ticket_materiali tm
            WHERE tm.ticket_id = ? AND tm.visibile_cliente = 1
            ORDER BY tm.created_at ASC
        """, (ticket_id,))
        cols = [d[0] for d in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    except Exception:
        rows = []
    conn.close()
    return rows
