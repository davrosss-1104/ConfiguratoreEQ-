"""
ticketing_api.py — API REST per il modulo Ticketing e Assistenza
================================================================

Endpoints:
  Impianti:
    GET    /impianti                      lista impianti (filtri: cliente_id)
    GET    /impianti/{id}                 dettaglio impianto + ordini collegati
    POST   /impianti                      crea impianto
    PUT    /impianti/{id}                 modifica impianto
    DELETE /impianti/{id}                 elimina impianto
    GET    /impianti/cerca/{codice}       cerca per codice_cliente + cliente_id

  Ordini-Impianti:
    GET    /ordini/{ordine_id}/impianti   impianti collegati a un ordine
    POST   /ordini/{ordine_id}/impianti   collega/crea impianti a un ordine
    DELETE /ordini/{ordine_id}/impianti/{impianto_id}

  Categorie ticket:
    GET    /categorie-ticket              lista
    POST   /categorie-ticket              crea
    PUT    /categorie-ticket/{id}         modifica
    DELETE /categorie-ticket/{id}         elimina

  Tickets:
    GET    /tickets                       lista (filtri multipli)
    GET    /tickets/{id}                  dettaglio
    POST   /tickets                       crea
    PUT    /tickets/{id}                  modifica
    DELETE /tickets/{id}                  elimina
    POST   /tickets/{id}/transizione      cambia stato
    GET    /tickets/{id}/commenti         lista commenti
    POST   /tickets/{id}/commenti         aggiungi commento
    GET    /tickets/kanban/{utente_id}    vista kanban per tecnico
    GET    /tickets/dashboard             statistiche

  Nexum bridge:
    GET    /nexum/cerca                   ricerca regole in Nexum

Integrazione in main.py:
  from ticketing_api import router as ticketing_router
  ticketing_router.dependencies.append(Depends(richiedi_modulo("ticketing")))
  app.include_router(ticketing_router)
"""

import shutil, uuid
from pathlib import Path
from fastapi import UploadFile, File, Form
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import text
import httpx
import os
import logging

try:
    from database import get_db
except ImportError:
    from main import get_db

logger = logging.getLogger("ticketing_api")

router = APIRouter(tags=["ticketing"])
ALLEGATI_DIR = Path("./allegati_ticket")
ALLEGATI_DIR.mkdir(exist_ok=True)
MAX_FILE_SIZE = 20 * 1024 * 1024
ESTENSIONI_PERMESSE = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".txt", ".csv", ".zip",
}

# ==========================================
# HELPERS
# ==========================================

def _raw(db: Session):
    return db.get_bind().raw_connection()


def _genera_numero_ticket(cursor) -> str:
    anno = datetime.now().year
    cursor.execute(
        "SELECT COUNT(*) FROM tickets WHERE numero_ticket LIKE ?",
        (f"TK-{anno}-%",)
    )
    n = cursor.fetchone()[0] + 1
    return f"TK-{anno}-{n:04d}"


def _get_nexum_config(db: Session) -> dict:
    """Legge URL e API key di Nexum da parametri_sistema."""
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("""
        SELECT chiave, valore FROM parametri_sistema
        WHERE chiave IN ('nexum_url', 'nexum_api_key')
    """)
    rows = cur.fetchall()
    conn.close()
    return {r[0]: r[1] for r in rows}


def _invia_notifica(conn, ticket_id: int, trigger: str,
                    stato_da: str = "", stato_a: str = "", motivo: str = ""):
    """
    Wrapper silenzioso attorno a notifiche_email.invia_notifica_ticket.
    Eseguito in thread separato per non bloccare la risposta HTTP.
    """
    import threading
    def _run():
        try:
            from notifiche_email import invia_notifica_ticket
            invia_notifica_ticket(conn, ticket_id, trigger,
                                  stato_da=stato_da, stato_a=stato_a, motivo=motivo)
        except Exception as e:
            logger.warning(f"[NOTIFICA] Errore invio email ticket {ticket_id} trigger '{trigger}': {e}")
    threading.Thread(target=_run, daemon=True).start()


# ==========================================
# STATE MACHINE TICKETS
# ==========================================

STATI_INTERNI = {
    "aperto":        {"label": "Aperto",        "colore": "#6B7280", "ordine": 1},
    "assegnato":     {"label": "Assegnato",      "colore": "#4F46E5", "ordine": 2},
    "in_lavorazione":{"label": "In lavorazione", "colore": "#D97706", "ordine": 3},
    "sospeso":       {"label": "Sospeso",        "colore": "#9CA3AF", "ordine": 4},
    "risolto":       {"label": "Risolto",        "colore": "#059669", "ordine": 5},
    "chiuso":        {"label": "Chiuso",         "colore": "#1F2937", "ordine": 6, "terminale": True},
    "annullato":     {"label": "Annullato",      "colore": "#DC2626", "ordine": 7, "terminale": True},
}

STATI_ESTERNI = {
    "ricevuto":           {"label": "Ricevuto",            "colore": "#6B7280", "ordine": 1},
    "assegnato":          {"label": "Assegnato",           "colore": "#4F46E5", "ordine": 2},
    "in_lavorazione":     {"label": "In lavorazione",      "colore": "#D97706", "ordine": 3},
    "in_attesa_ricambi":  {"label": "Attesa ricambi",      "colore": "#7C3AED", "ordine": 4},
    "sospeso":            {"label": "Sospeso",             "colore": "#9CA3AF", "ordine": 5},
    "risolto":            {"label": "Risolto",             "colore": "#059669", "ordine": 6},
    "chiuso":             {"label": "Chiuso",              "colore": "#1F2937", "ordine": 7, "terminale": True},
    "annullato":          {"label": "Annullato",           "colore": "#DC2626", "ordine": 8, "terminale": True},
}

TRANSIZIONI_INTERNE = {
    "aperto":         ["assegnato", "annullato"],
    "assegnato":      ["in_lavorazione", "sospeso", "annullato"],
    "in_lavorazione": ["risolto", "sospeso", "annullato"],
    "sospeso":        ["in_lavorazione", "annullato"],
    "risolto":        ["chiuso", "in_lavorazione"],
    "chiuso":         [],
    "annullato":      [],
}

TRANSIZIONI_ESTERNE = {
    "ricevuto":          ["assegnato", "annullato"],
    "assegnato":         ["in_lavorazione", "sospeso", "annullato"],
    "in_lavorazione":    ["in_attesa_ricambi", "risolto", "sospeso", "annullato"],
    "in_attesa_ricambi": ["in_lavorazione", "risolto", "annullato"],
    "sospeso":           ["in_lavorazione", "annullato"],
    "risolto":           ["chiuso", "in_lavorazione"],
    "chiuso":            [],
    "annullato":         [],
}


def _valida_transizione(tipo: str, stato_da: str, stato_a: str) -> Optional[str]:
    """Ritorna messaggio di errore se la transizione non è permessa, None se OK."""
    mappa = TRANSIZIONI_INTERNE if tipo == "interno" else TRANSIZIONI_ESTERNE
    permessi = mappa.get(stato_da, [])
    if stato_a not in permessi:
        return f"Transizione '{stato_da}' → '{stato_a}' non permessa"
    return None


# ==========================================
# IMPIANTI
# ==========================================

@router.get("/impianti")
def lista_impianti(
    cliente_id: Optional[int] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db)
):
    conn = _raw(db)
    cur = conn.cursor()
    sql = """
        SELECT i.*, c.ragione_sociale as cliente_nome
        FROM impianti i
        LEFT JOIN clienti c ON c.id = i.cliente_id
        WHERE 1=1
    """
    params = []
    if cliente_id:
        sql += " AND i.cliente_id = ?"
        params.append(cliente_id)
    if q:
        sql += " AND (i.codice_cliente LIKE ? OR i.descrizione LIKE ?)"
        params += [f"%{q}%", f"%{q}%"]
    sql += " ORDER BY i.created_at DESC"
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return rows


@router.get("/impianti/cerca")
def cerca_impianto(
    codice: str,
    cliente_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Cerca impianto per codice_cliente (e opzionalmente cliente_id)."""
    conn = _raw(db)
    cur = conn.cursor()
    sql = "SELECT * FROM impianti WHERE codice_cliente = ?"
    params = [codice]
    if cliente_id:
        sql += " AND cliente_id = ?"
        params.append(cliente_id)
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return dict(zip(cols, row))


@router.get("/impianti/{impianto_id}")
def dettaglio_impianto(impianto_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("""
        SELECT i.*, c.ragione_sociale as cliente_nome
        FROM impianti i
        LEFT JOIN clienti c ON c.id = i.cliente_id
        WHERE i.id = ?
    """, (impianto_id,))
    cols = [d[0] for d in cur.description]
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Impianto non trovato")
    impianto = dict(zip(cols, row))

    # Ordini collegati
    cur.execute("""
        SELECT o.id, o.numero_ordine, o.stato, o.created_at
        FROM ordini_impianti oi
        JOIN ordini o ON o.id = oi.ordine_id
        WHERE oi.impianto_id = ?
        ORDER BY o.created_at DESC
    """, (impianto_id,))
    ordini_cols = [d[0] for d in cur.description]
    impianto["ordini"] = [dict(zip(ordini_cols, r)) for r in cur.fetchall()]

    # Ticket collegati
    cur.execute("""
        SELECT id, numero_ticket, titolo, stato, priorita, created_at
        FROM tickets WHERE impianto_id = ?
        ORDER BY created_at DESC
    """, (impianto_id,))
    tk_cols = [d[0] for d in cur.description]
    impianto["tickets"] = [dict(zip(tk_cols, r)) for r in cur.fetchall()]

    conn.close()
    return impianto


@router.post("/impianti")
def crea_impianto(payload: dict, db: Session = Depends(get_db)):
    codice = payload.get("codice_cliente", "").strip()
    cliente_id = payload.get("cliente_id")
    if not codice:
        raise HTTPException(400, "codice_cliente obbligatorio")

    conn = _raw(db)
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO impianti (codice_cliente, cliente_id, descrizione,
                                  indirizzo_installazione, note)
            VALUES (?, ?, ?, ?, ?)
        """, (
            codice,
            cliente_id,
            payload.get("descrizione"),
            payload.get("indirizzo_installazione"),
            payload.get("note"),
        ))
        conn.commit()
        impianto_id = cur.lastrowid
        conn.close()
        return {"id": impianto_id, "status": "created"}
    except Exception as e:
        conn.close()
        if "UNIQUE" in str(e):
            raise HTTPException(409, f"Impianto con codice '{codice}' già esistente per questo cliente")
        raise HTTPException(500, str(e))


@router.put("/impianti/{impianto_id}")
def modifica_impianto(impianto_id: int, payload: dict, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("SELECT id FROM impianti WHERE id = ?", (impianto_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, "Impianto non trovato")

    campi = ["codice_cliente", "cliente_id", "descrizione", "indirizzo_installazione", "note"]
    set_parts = []
    params = []
    for campo in campi:
        if campo in payload:
            set_parts.append(f"{campo} = ?")
            params.append(payload[campo])
    if not set_parts:
        conn.close()
        return {"status": "no_changes"}

    set_parts.append("updated_at = datetime('now')")
    params.append(impianto_id)
    cur.execute(f"UPDATE impianti SET {', '.join(set_parts)} WHERE id = ?", params)
    conn.commit()
    conn.close()
    return {"status": "updated"}


@router.delete("/impianti/{impianto_id}")
def elimina_impianto(impianto_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("SELECT id FROM impianti WHERE id = ?", (impianto_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, "Impianto non trovato")
    cur.execute(
        "SELECT COUNT(*) FROM tickets WHERE impianto_id = ? AND stato NOT IN ('chiuso','annullato')",
        (impianto_id,)
    )
    if cur.fetchone()[0] > 0:
        conn.close()
        raise HTTPException(400, "Impossibile eliminare: esistono ticket aperti per questo impianto")
    cur.execute("DELETE FROM impianti WHERE id = ?", (impianto_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


# ==========================================
# ORDINI ↔ IMPIANTI
# ==========================================

@router.get("/ordini/{ordine_id}/impianti")
def impianti_ordine(ordine_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("""
        SELECT i.*
        FROM ordini_impianti oi
        JOIN impianti i ON i.id = oi.impianto_id
        WHERE oi.ordine_id = ?
    """, (ordine_id,))
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/ordini/{ordine_id}/impianti")
def collega_impianti_ordine(ordine_id: int, payload: dict, db: Session = Depends(get_db)):
    impianti_input = payload.get("impianti", [])
    if not impianti_input:
        raise HTTPException(400, "Lista impianti vuota")

    conn = _raw(db)
    cur = conn.cursor()

    cur.execute("SELECT id, cliente_id FROM ordini WHERE id = ?", (ordine_id,))
    ordine = cur.fetchone()
    if not ordine:
        conn.close()
        raise HTTPException(404, "Ordine non trovato")
    cliente_id_ordine = ordine[1]

    risultati = []
    for imp in impianti_input:
        codice = imp.get("codice_cliente", "").strip()
        if not codice:
            continue
        cliente_id = imp.get("cliente_id") or cliente_id_ordine

        cur.execute(
            "SELECT id FROM impianti WHERE codice_cliente = ? AND cliente_id = ?",
            (codice, cliente_id)
        )
        row = cur.fetchone()
        if row:
            impianto_id = row[0]
        else:
            cur.execute("""
                INSERT INTO impianti (codice_cliente, cliente_id, descrizione,
                                      indirizzo_installazione, note)
                VALUES (?, ?, ?, ?, ?)
            """, (
                codice, cliente_id,
                imp.get("descrizione"),
                imp.get("indirizzo_installazione"),
                imp.get("note"),
            ))
            impianto_id = cur.lastrowid

        cur.execute("""
            INSERT OR IGNORE INTO ordini_impianti (ordine_id, impianto_id)
            VALUES (?, ?)
        """, (ordine_id, impianto_id))
        risultati.append({"codice_cliente": codice, "impianto_id": impianto_id})

    conn.commit()
    conn.close()
    return {"status": "ok", "impianti": risultati}


@router.delete("/ordini/{ordine_id}/impianti/{impianto_id}")
def scollega_impianto_ordine(ordine_id: int, impianto_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM ordini_impianti WHERE ordine_id = ? AND impianto_id = ?",
        (ordine_id, impianto_id)
    )
    conn.commit()
    conn.close()
    return {"status": "deleted"}


# ==========================================
# CATEGORIE TICKET
# ==========================================

@router.get("/categorie-ticket")
def lista_categorie(tipo: Optional[str] = None, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    sql = "SELECT * FROM categorie_ticket WHERE attivo = 1"
    params = []
    if tipo:
        sql += " AND (tipo = ? OR tipo = 'entrambi')"
        params.append(tipo)
    sql += " ORDER BY tipo, ordine"
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/categorie-ticket")
def crea_categoria(payload: dict, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO categorie_ticket (nome, tipo, colore, ordine)
        VALUES (?, ?, ?, ?)
    """, (
        payload.get("nome", ""),
        payload.get("tipo", "entrambi"),
        payload.get("colore", "#6B7280"),
        payload.get("ordine", 0),
    ))
    conn.commit()
    cat_id = cur.lastrowid
    conn.close()
    return {"id": cat_id, "status": "created"}


@router.put("/categorie-ticket/{cat_id}")
def modifica_categoria(cat_id: int, payload: dict, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    campi = ["nome", "tipo", "colore", "ordine", "attivo"]
    set_parts = []
    params = []
    for c in campi:
        if c in payload:
            set_parts.append(f"{c} = ?")
            params.append(payload[c])
    if set_parts:
        params.append(cat_id)
        cur.execute(f"UPDATE categorie_ticket SET {', '.join(set_parts)} WHERE id = ?", params)
        conn.commit()
    conn.close()
    return {"status": "updated"}


@router.delete("/categorie-ticket/{cat_id}")
def elimina_categoria(cat_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM tickets WHERE categoria_id = ?", (cat_id,))
    if cur.fetchone()[0] > 0:
        conn.close()
        raise HTTPException(400, "Categoria in uso da ticket esistenti")
    cur.execute("DELETE FROM categorie_ticket WHERE id = ?", (cat_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


# ==========================================
# TICKETS — CRUD
# ==========================================

@router.get("/tickets")
def lista_tickets(
    tipo:         Optional[str]  = None,
    stato:        Optional[str]  = None,
    priorita:     Optional[str]  = None,
    cliente_id:   Optional[int]  = None,
    assegnato_a:  Optional[int]  = None,
    impianto_id:  Optional[int]  = None,
    categoria_id: Optional[int]  = None,
    q:            Optional[str]  = None,
    db: Session = Depends(get_db)
):
    conn = _raw(db)
    cur = conn.cursor()
    sql = """
        SELECT t.*,
               c.ragione_sociale  as cliente_nome,
               u.username         as assegnato_nome,
               uc.username        as creato_da_nome,
               i.codice_cliente   as impianto_codice,
               cat.nome           as categoria_nome,
               cat.colore         as categoria_colore
        FROM tickets t
        LEFT JOIN clienti c     ON c.id  = t.cliente_id
        LEFT JOIN utenti u      ON u.id  = t.assegnato_a
        LEFT JOIN utenti uc     ON uc.id = t.creato_da
        LEFT JOIN impianti i    ON i.id  = t.impianto_id
        LEFT JOIN categorie_ticket cat ON cat.id = t.categoria_id
        WHERE 1=1
    """
    params = []
    if tipo:
        sql += " AND t.tipo = ?"
        params.append(tipo)
    if stato:
        sql += " AND t.stato = ?"
        params.append(stato)
    if priorita:
        sql += " AND t.priorita = ?"
        params.append(priorita)
    if cliente_id:
        sql += " AND t.cliente_id = ?"
        params.append(cliente_id)
    if assegnato_a:
        sql += " AND t.assegnato_a = ?"
        params.append(assegnato_a)
    if impianto_id:
        sql += " AND t.impianto_id = ?"
        params.append(impianto_id)
    if categoria_id:
        sql += " AND t.categoria_id = ?"
        params.append(categoria_id)
    if q:
        sql += " AND (t.titolo LIKE ? OR t.numero_ticket LIKE ? OR t.descrizione LIKE ?)"
        params += [f"%{q}%", f"%{q}%", f"%{q}%"]
    sql += " ORDER BY t.created_at DESC"
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return {"items": rows, "totale": len(rows)}
def stati_metadata():
    return {
        "interno":  {"stati": STATI_INTERNI,  "transizioni": TRANSIZIONI_INTERNE},
        "esterno":  {"stati": STATI_ESTERNI,  "transizioni": TRANSIZIONI_ESTERNE},
    }


@router.get("/tickets/dashboard")
def dashboard_tickets(db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()

    cur.execute("SELECT stato, COUNT(*) FROM tickets GROUP BY stato")
    per_stato = dict(cur.fetchall())

    cur.execute("SELECT tipo, COUNT(*) FROM tickets GROUP BY tipo")
    per_tipo = dict(cur.fetchall())

    cur.execute("SELECT priorita, COUNT(*) FROM tickets WHERE stato NOT IN ('chiuso','annullato') GROUP BY priorita")
    per_priorita = dict(cur.fetchall())

    cur.execute("""
        SELECT u.username, COUNT(*) as n
        FROM tickets t JOIN utenti u ON u.id = t.assegnato_a
        WHERE t.stato NOT IN ('chiuso','annullato')
        GROUP BY t.assegnato_a
        ORDER BY n DESC LIMIT 10
    """)
    per_tecnico = [{"tecnico": r[0], "n": r[1]} for r in cur.fetchall()]

    cur.execute("""
        SELECT COUNT(*) FROM tickets
        WHERE scadenza < datetime('now')
        AND stato NOT IN ('chiuso','annullato','risolto')
    """)
    scaduti = cur.fetchone()[0]

    cur.execute("""
        SELECT AVG((julianday(risolto_at) - julianday(created_at)) * 24)
        FROM tickets WHERE risolto_at IS NOT NULL
    """)
    tempo_medio_ore = cur.fetchone()[0]

    conn.close()
    return {
        "per_stato":       per_stato,
        "per_tipo":        per_tipo,
        "per_priorita":    per_priorita,
        "per_tecnico":     per_tecnico,
        "scaduti":         scaduti,
        "tempo_medio_ore": round(tempo_medio_ore, 1) if tempo_medio_ore else None,
    }


@router.get("/tickets/kanban/{utente_id}")
def kanban_tecnico(utente_id: int, tipo: Optional[str] = None, db: Session = Depends(get_db)):
    """Vista kanban per singolo tecnico — ticket raggruppati per stato."""
    conn = _raw(db)
    cur = conn.cursor()
    sql = """
        SELECT t.*,
               c.ragione_sociale as cliente_nome,
               i.codice_cliente  as impianto_codice,
               cat.nome          as categoria_nome,
               cat.colore        as categoria_colore
        FROM tickets t
        LEFT JOIN clienti c     ON c.id  = t.cliente_id
        LEFT JOIN impianti i    ON i.id  = t.impianto_id
        LEFT JOIN categorie_ticket cat ON cat.id = t.categoria_id
        WHERE t.assegnato_a = ?
        AND t.stato NOT IN ('chiuso','annullato')
    """
    params = [utente_id]
    if tipo:
        sql += " AND t.tipo = ?"
        params.append(tipo)
    sql += " ORDER BY t.priorita DESC, t.scadenza ASC"
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()

    result = {}
    for r in rows:
        stato = r["stato"]
        if stato not in result:
            result[stato] = []
        result[stato].append(r)
    return result


@router.get("/tickets/{ticket_id}")
def dettaglio_ticket(ticket_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("""
        SELECT t.*,
               c.ragione_sociale  as cliente_nome,
               u.username         as assegnato_nome,
               uc.username        as creato_da_nome,
               i.codice_cliente   as impianto_codice,
               i.descrizione      as impianto_descrizione,
               cat.nome           as categoria_nome,
               cat.colore         as categoria_colore
        FROM tickets t
        LEFT JOIN clienti c     ON c.id  = t.cliente_id
        LEFT JOIN utenti u      ON u.id  = t.assegnato_a
        LEFT JOIN utenti uc     ON uc.id = t.creato_da
        LEFT JOIN impianti i    ON i.id  = t.impianto_id
        LEFT JOIN categorie_ticket cat ON cat.id = t.categoria_id
        WHERE t.id = ?
    """, (ticket_id,))
    cols = [d[0] for d in cur.description]
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Ticket non trovato")
    ticket = dict(zip(cols, row))

    cur.execute("""
        SELECT tc.*, u.username as utente_nome
        FROM ticket_commenti tc
        LEFT JOIN utenti u ON u.id = tc.utente_id
        WHERE tc.ticket_id = ?
        ORDER BY tc.created_at ASC
    """, (ticket_id,))
    comm_cols = [d[0] for d in cur.description]
    ticket["commenti"] = [dict(zip(comm_cols, r)) for r in cur.fetchall()]

    cur.execute("""
        SELECT ta.*, u.username as caricato_da_nome
        FROM ticket_allegati ta
        LEFT JOIN utenti u ON u.id = ta.caricato_da
        WHERE ta.ticket_id = ?
        ORDER BY ta.created_at ASC
    """, (ticket_id,))
    all_cols = [d[0] for d in cur.description]
    ticket["allegati"] = [dict(zip(all_cols, r)) for r in cur.fetchall()]

    conn.close()
    return ticket


# ── ORDINE COLLEGATO AL TICKET ────────────────────────────────────────────────

@router.get("/tickets/{ticket_id}/ordine")
def ticket_ordine_collegato(ticket_id: int, db: Session = Depends(get_db)):
    """Restituisce i dati dell'ordine collegato al ticket (se presente)."""
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("SELECT ordine_id FROM tickets WHERE id = ?", (ticket_id,))
    row = cur.fetchone()
    if not row or not row[0]:
        conn.close()
        return None
    ordine_id = row[0]
    cur.execute("""
        SELECT o.id, o.numero_ordine, o.stato, o.tipo_impianto,
               o.data_consegna_prevista, o.totale_netto,
               p.numero_preventivo
        FROM ordini o
        LEFT JOIN preventivi p ON p.id = o.preventivo_id
        WHERE o.id = ?
    """, (ordine_id,))
    cols = [d[0] for d in cur.description]
    ordine_row = cur.fetchone()
    conn.close()
    if not ordine_row:
        return None
    return dict(zip(cols, ordine_row))


# ── MATERIALI IMPIEGATI NEL TICKET ────────────────────────────────────────────

@router.get("/tickets/{ticket_id}/materiali")
def ticket_materiali_lista(ticket_id: int, db: Session = Depends(get_db)):
    """Lista materiali/articoli utilizzati per risolvere il ticket."""
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("""
        SELECT tm.id, tm.articolo_id, tm.codice, tm.descrizione,
               tm.quantita, tm.unita_misura, tm.note,
               tm.visibile_cliente, tm.created_at,
               u.username as aggiunto_da_nome
        FROM ticket_materiali tm
        LEFT JOIN utenti u ON u.id = tm.aggiunto_da
        WHERE tm.ticket_id = ?
        ORDER BY tm.created_at ASC
    """, (ticket_id,))
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/tickets/{ticket_id}/materiali")
def ticket_aggiungi_materiale(ticket_id: int, payload: dict, db: Session = Depends(get_db)):
    """
    Aggiunge un materiale al ticket.
    Payload: { articolo_id, codice, descrizione*, quantita, unita_misura, note, visibile_cliente, aggiunto_da }
    """
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("SELECT id FROM tickets WHERE id = ?", (ticket_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, "Ticket non trovato")
    descrizione = payload.get("descrizione", "").strip()
    if not descrizione:
        conn.close()
        raise HTTPException(400, "descrizione obbligatoria")
    cur.execute("""
        INSERT INTO ticket_materiali
            (ticket_id, articolo_id, codice, descrizione, quantita, unita_misura,
             note, visibile_cliente, aggiunto_da)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        ticket_id,
        payload.get("articolo_id"),
        payload.get("codice", ""),
        descrizione,
        payload.get("quantita", 1),
        payload.get("unita_misura", ""),
        payload.get("note", ""),
        1 if payload.get("visibile_cliente") else 0,
        payload.get("aggiunto_da"),
    ))
    mat_id = cur.lastrowid
    cur.execute("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?", (ticket_id,))
    conn.commit()
    conn.close()
    return {"id": mat_id, "status": "created"}


@router.put("/tickets/{ticket_id}/materiali/{mat_id}")
def ticket_modifica_materiale(ticket_id: int, mat_id: int, payload: dict, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("SELECT id FROM ticket_materiali WHERE id = ? AND ticket_id = ?", (mat_id, ticket_id))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, "Materiale non trovato")
    campi = ["descrizione", "quantita", "unita_misura", "note", "visibile_cliente"]
    parts, params = [], []
    for c in campi:
        if c in payload:
            v = payload[c]
            if c == "visibile_cliente":
                v = 1 if v else 0
            parts.append(f"{c} = ?")
            params.append(v)
    if parts:
        params.append(mat_id)
        cur.execute(f"UPDATE ticket_materiali SET {', '.join(parts)} WHERE id = ?", params)
        conn.commit()
    conn.close()
    return {"status": "updated"}


@router.delete("/tickets/{ticket_id}/materiali/{mat_id}")
def ticket_elimina_materiale(ticket_id: int, mat_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("DELETE FROM ticket_materiali WHERE id = ? AND ticket_id = ?", (mat_id, ticket_id))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


@router.post("/tickets")
def crea_ticket(payload: dict, db: Session = Depends(get_db)):
    titolo = payload.get("titolo", "").strip()
    tipo   = payload.get("tipo", "esterno")
    if not titolo:
        raise HTTPException(400, "titolo obbligatorio")
    if tipo not in ("interno", "esterno"):
        raise HTTPException(400, "tipo deve essere 'interno' o 'esterno'")

    stato_iniziale = "aperto" if tipo == "interno" else "ricevuto"

    conn = _raw(db)
    cur = conn.cursor()
    numero = _genera_numero_ticket(cur)

    cur.execute("""
        INSERT INTO tickets (
            numero_ticket, tipo, titolo, descrizione, stato, priorita,
            categoria_id, cliente_id, ordine_id, impianto_id,
            assegnato_a, creato_da, scadenza
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        numero,
        tipo,
        titolo,
        payload.get("descrizione"),
        payload.get("stato", stato_iniziale),
        payload.get("priorita", "normale"),
        payload.get("categoria_id"),
        payload.get("cliente_id"),
        payload.get("ordine_id"),
        payload.get("impianto_id"),
        payload.get("assegnato_a"),
        payload.get("creato_da"),
        payload.get("scadenza"),
    ))
    ticket_id = cur.lastrowid

    cur.execute("""
        INSERT INTO ticket_commenti (ticket_id, utente_id, testo, tipo)
        VALUES (?, ?, 'Ticket creato', 'cambio_stato')
    """, (ticket_id, payload.get("creato_da")))

    conn.commit()

    # Notifica assegnazione se il ticket viene creato già assegnato
    if payload.get("assegnato_a"):
        _invia_notifica(conn, ticket_id, "assegnazione")

    conn.close()
    return {"id": ticket_id, "numero_ticket": numero, "status": "created"}


@router.put("/tickets/{ticket_id}")
def modifica_ticket(ticket_id: int, payload: dict, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()

    # Leggi assegnato_a precedente per rilevare cambio
    cur.execute("SELECT id, assegnato_a FROM tickets WHERE id = ?", (ticket_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Ticket non trovato")
    assegnato_precedente = row[1]

    campi = [
        "titolo", "descrizione", "priorita", "categoria_id",
        "cliente_id", "ordine_id", "impianto_id", "assegnato_a",
        "scadenza", "soluzione", "nexum_regola_id", "nexum_proposta"
    ]
    set_parts = []
    params = []
    for campo in campi:
        if campo in payload:
            set_parts.append(f"{campo} = ?")
            params.append(payload[campo])

    if set_parts:
        set_parts.append("updated_at = datetime('now')")
        params.append(ticket_id)
        cur.execute(f"UPDATE tickets SET {', '.join(set_parts)} WHERE id = ?", params)
        conn.commit()

        # Notifica assegnazione se assegnato_a è cambiato con un nuovo tecnico
        nuovo_assegnato = payload.get("assegnato_a")
        if (nuovo_assegnato is not None
                and nuovo_assegnato != assegnato_precedente
                and nuovo_assegnato):
            _invia_notifica(conn, ticket_id, "assegnazione")

    conn.close()
    return {"status": "updated"}


@router.delete("/tickets/{ticket_id}")
def elimina_ticket(ticket_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("SELECT stato FROM tickets WHERE id = ?", (ticket_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Ticket non trovato")
    if row[0] not in ("aperto", "ricevuto", "annullato"):
        conn.close()
        raise HTTPException(400, "Solo ticket aperti o annullati possono essere eliminati")
    cur.execute("DELETE FROM tickets WHERE id = ?", (ticket_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


# ==========================================
# TICKETS — TRANSIZIONI STATO
# ==========================================

@router.post("/tickets/{ticket_id}/transizione")
def transizione_ticket(ticket_id: int, payload: dict, db: Session = Depends(get_db)):
    """
    Body: { "stato_nuovo": "...", "utente_id": ..., "motivo": "..." (opzionale) }
    """
    stato_nuovo = payload.get("stato_nuovo")
    utente_id   = payload.get("utente_id")
    motivo      = payload.get("motivo", "")

    if not stato_nuovo:
        raise HTTPException(400, "stato_nuovo obbligatorio")

    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,))
    cols = [d[0] for d in cur.description]
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Ticket non trovato")
    ticket = dict(zip(cols, row))

    stato_attuale = ticket["stato"]
    tipo          = ticket["tipo"]

    errore = _valida_transizione(tipo, stato_attuale, stato_nuovo)
    if errore:
        conn.close()
        raise HTTPException(400, errore)

    if stato_nuovo in ("risolto", "chiuso") and not ticket.get("soluzione") and not payload.get("soluzione"):
        conn.close()
        raise HTTPException(400, "Inserire la soluzione prima di risolvere/chiudere il ticket")

    now = datetime.now().isoformat()
    updates = {"stato": stato_nuovo, "updated_at": now}
    if stato_nuovo == "risolto":
        updates["risolto_at"] = now
    if stato_nuovo == "chiuso":
        updates["chiuso_at"] = now
    if payload.get("soluzione"):
        updates["soluzione"] = payload["soluzione"]

    set_parts = [f"{k} = ?" for k in updates]
    params = list(updates.values()) + [ticket_id]
    cur.execute(f"UPDATE tickets SET {', '.join(set_parts)} WHERE id = ?", params)

    testo_log = f"Stato cambiato: {stato_attuale} → {stato_nuovo}"
    if motivo:
        testo_log += f" — {motivo}"
    cur.execute("""
        INSERT INTO ticket_commenti (ticket_id, utente_id, testo, tipo)
        VALUES (?, ?, ?, 'cambio_stato')
    """, (ticket_id, utente_id, testo_log))

    conn.commit()

    # Notifica cambio stato al team interno
    _invia_notifica(conn, ticket_id, "cambio_stato",
                    stato_da=stato_attuale, stato_a=stato_nuovo, motivo=motivo)

    # Notifica cambio stato al cliente (solo ticket esterni, solo se tipo esterno)
    if tipo == "esterno":
        _invia_notifica(conn, ticket_id, "cambio_stato_cliente",
                        stato_da=stato_attuale, stato_a=stato_nuovo)

    conn.close()
    return {"status": "ok", "stato": stato_nuovo}


# ==========================================
# COMMENTI
# ==========================================

@router.get("/tickets/{ticket_id}/commenti")
def lista_commenti(ticket_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("""
        SELECT tc.*, u.username as utente_nome
        FROM ticket_commenti tc
        LEFT JOIN utenti u ON u.id = tc.utente_id
        WHERE tc.ticket_id = ?
        ORDER BY tc.created_at ASC
    """, (ticket_id,))
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/tickets/{ticket_id}/commenti")
def aggiungi_commento(ticket_id: int, payload: dict, db: Session = Depends(get_db)):
    testo = payload.get("testo", "").strip()
    if not testo:
        raise HTTPException(400, "testo obbligatorio")
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("SELECT id, tipo FROM tickets WHERE id = ?", (ticket_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Ticket non trovato")
    ticket_tipo = row[1]

    visibile_cliente = 1 if payload.get("visibile_cliente") else 0
    cur.execute("""
        INSERT INTO ticket_commenti (ticket_id, utente_id, testo, tipo, visibile_cliente)
        VALUES (?, ?, ?, ?, ?)
    """, (
        ticket_id,
        payload.get("utente_id"),
        testo,
        payload.get("tipo", "commento"),
        visibile_cliente,
    ))
    cur.execute("UPDATE tickets SET updated_at = datetime('now') WHERE id = ?", (ticket_id,))
    conn.commit()
    comm_id = cur.lastrowid

    # Notifica al cliente se il commento è visibile al cliente e il ticket è esterno
    if visibile_cliente and ticket_tipo == "esterno":
        nome_mittente = payload.get("nome_mittente", "Assistenza")
        _invia_notifica(conn, ticket_id, "messaggio_cliente",
                        stato_a=testo, motivo=nome_mittente)

    conn.close()
    return {"id": comm_id, "status": "created"}


# ==========================================
# NEXUM BRIDGE
# ==========================================

@router.get("/nexum/cerca")
async def nexum_cerca(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db)
):
    cfg = _get_nexum_config(db)
    nexum_url = cfg.get("nexum_url", "").strip()
    nexum_key = cfg.get("nexum_api_key", "").strip()

    if not nexum_url:
        return {"results": [], "nexum_disponibile": False}

    try:
        headers = {}
        if nexum_key:
            headers["X-API-Key"] = nexum_key
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{nexum_url}/api/regole",
                params={"q": q, "limit": 5},
                headers=headers
            )
            if resp.status_code == 200:
                data = resp.json()
                return {"results": data, "nexum_disponibile": True}
            return {"results": [], "nexum_disponibile": True, "errore": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"results": [], "nexum_disponibile": False, "errore": str(e)}


@router.get("/nexum/stato")
async def nexum_stato(db: Session = Depends(get_db)):
    cfg = _get_nexum_config(db)
    nexum_url = cfg.get("nexum_url", "").strip()
    if not nexum_url:
        return {"configurato": False, "raggiungibile": False}
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{nexum_url}/api/health")
            return {"configurato": True, "raggiungibile": resp.status_code == 200}
    except Exception:
        return {"configurato": True, "raggiungibile": False}


# ==========================================
# ALLEGATI
# ==========================================

@router.post("/tickets/{ticket_id}/allegati")
async def upload_allegato(
    ticket_id: int,
    file: UploadFile = File(...),
    utente_id: int = Form(None),
    db: Session = Depends(get_db),
):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("SELECT id FROM tickets WHERE id = ?", (ticket_id,))
    if not cur.fetchone():
        conn.close()
        raise HTTPException(404, "Ticket non trovato")
    conn.close()

    nome_originale = file.filename or "file"
    ext = Path(nome_originale).suffix.lower()
    if ext not in ESTENSIONI_PERMESSE:
        raise HTTPException(400, f"Tipo file non permesso: {ext}")

    contenuto = await file.read()
    if len(contenuto) > MAX_FILE_SIZE:
        raise HTTPException(400, "File troppo grande (max 20 MB)")

    nome_file_disco = f"{uuid.uuid4().hex}{ext}"
    cartella_ticket = ALLEGATI_DIR / str(ticket_id)
    cartella_ticket.mkdir(exist_ok=True)
    path_completo = cartella_ticket / nome_file_disco

    with open(path_completo, "wb") as f_out:
        f_out.write(contenuto)

    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO ticket_allegati (ticket_id, nome_file, path, dimensione, caricato_da)
        VALUES (?, ?, ?, ?, ?)
    """, (
        ticket_id,
        nome_originale,
        str(path_completo),
        len(contenuto),
        utente_id,
    ))
    conn.commit()
    allegato_id = cur.lastrowid
    conn.close()

    return {
        "id":         allegato_id,
        "nome_file":  nome_originale,
        "dimensione": len(contenuto),
        "status":     "uploaded",
    }


@router.delete("/tickets/{ticket_id}/allegati/{allegato_id}")
def elimina_allegato(ticket_id: int, allegato_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute(
        "SELECT path FROM ticket_allegati WHERE id = ? AND ticket_id = ?",
        (allegato_id, ticket_id)
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Allegato non trovato")

    path = row[0]
    cur.execute("DELETE FROM ticket_allegati WHERE id = ?", (allegato_id,))
    conn.commit()
    conn.close()

    try:
        Path(path).unlink(missing_ok=True)
    except Exception:
        pass

    return {"status": "deleted"}


@router.get("/tickets/{ticket_id}/allegati/{allegato_id}/download")
def download_allegato(ticket_id: int, allegato_id: int, db: Session = Depends(get_db)):
    from fastapi.responses import FileResponse
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute(
        "SELECT nome_file, path FROM ticket_allegati WHERE id = ? AND ticket_id = ?",
        (allegato_id, ticket_id)
    )
    row = cur.fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Allegato non trovato")

    nome_file, path = row
    if not Path(path).exists():
        raise HTTPException(404, "File non trovato su disco")

    return FileResponse(path=path, filename=nome_file)


# ==========================================
# SCHEDULER — ESCALATION TICKETS
# ==========================================

def controlla_escalation_tickets(db_path: str):
    """
    Controlla ticket in ritardo che non hanno avuto aggiornamenti recenti
    e aumenta la priorità da 'normale' a 'alta' o da 'alta' a 'urgente'.
    Da chiamare con APScheduler ogni ora.

    Regole:
    - Ticket 'normale' aperto da > 48h senza aggiornamenti → diventa 'alta'
    - Ticket 'alta' aperto da > 24h senza aggiornamenti → diventa 'urgente'
    """
    import sqlite3 as _sqlite3
    conn = _sqlite3.connect(db_path)
    cur = conn.cursor()

    escalati = 0

    # normale → alta: aperto da >48h, non aggiornato nelle ultime 48h
    cur.execute("""
        SELECT id FROM tickets
        WHERE priorita = 'normale'
        AND stato NOT IN ('chiuso', 'annullato', 'risolto')
        AND (
            julianday('now') - julianday(COALESCE(updated_at, created_at))
        ) * 24 > 48
    """)
    ids_normale = [r[0] for r in cur.fetchall()]
    for tid in ids_normale:
        cur.execute(
            "UPDATE tickets SET priorita = 'alta', updated_at = datetime('now') WHERE id = ?",
            (tid,)
        )
        cur.execute("""
            INSERT INTO ticket_commenti (ticket_id, testo, tipo)
            VALUES (?, 'Priorità escalata automaticamente: normale → alta (nessun aggiornamento nelle ultime 48h)', 'sistema')
        """, (tid,))
        escalati += 1

    # alta → urgente: non aggiornato nelle ultime 24h
    cur.execute("""
        SELECT id FROM tickets
        WHERE priorita = 'alta'
        AND stato NOT IN ('chiuso', 'annullato', 'risolto')
        AND (
            julianday('now') - julianday(COALESCE(updated_at, created_at))
        ) * 24 > 24
    """)
    ids_alta = [r[0] for r in cur.fetchall()]
    for tid in ids_alta:
        cur.execute(
            "UPDATE tickets SET priorita = 'urgente', updated_at = datetime('now') WHERE id = ?",
            (tid,)
        )
        cur.execute("""
            INSERT INTO ticket_commenti (ticket_id, testo, tipo)
            VALUES (?, 'Priorità escalata automaticamente: alta → urgente (nessun aggiornamento nelle ultime 24h)', 'sistema')
        """, (tid,))
        escalati += 1

    conn.commit()
    conn.close()
    logger.info(f"[ESCALATION] {escalati} ticket escalati")
