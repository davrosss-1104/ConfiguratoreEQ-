"""
magazzino_api.py — API REST per il modulo Magazzino
====================================================
Includere in main.py:

    from magazzino_api import router as magazzino_router
    magazzino_router.dependencies = [Depends(richiedi_modulo("magazzino"))]
    app.include_router(magazzino_router)

Agganciare lo scarico automatico in ordini_stato.py:

    from magazzino_api import scarica_commessa_per_ordine
    # dentro cambia_stato_ordine, dopo il commit, se stato_nuovo == "spedito":
    try:
        scarica_commessa_per_ordine(conn, ordine_id, created_by)
        conn.commit()
    except Exception as e:
        logger.warning(f"Scarico magazzino fallito per ordine {ordine_id}: {e}")
"""

import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from database import SessionLocal

logger = logging.getLogger("magazzino")

router = APIRouter(prefix="/magazzino", tags=["Magazzino"])

TIPI_MOVIMENTO = {
    "inventario_iniziale": {"label": "Inventario iniziale", "segno": +1},
    "carico_acquisto":     {"label": "Carico da acquisto",  "segno": +1},
    "carico_rettifica":    {"label": "Rettifica in entrata","segno": +1},
    "reso_cliente":        {"label": "Reso da cliente",     "segno": +1},
    "scarico_commessa":    {"label": "Scarico commessa",    "segno": -1},
    "scarico_rettifica":   {"label": "Rettifica in uscita", "segno": -1},
    "reso_fornitore":      {"label": "Reso a fornitore",    "segno": -1},
}


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


# ==========================================
# LOGICA CORE — usata anche dall'hook ordini
# ==========================================

def _aggiorna_giacenza_cache(conn, articolo_id: int):
    """
    Ricalcola la giacenza aggregata dai movimenti e aggiorna
    il campo cache articoli.giacenza. Chiamato dopo ogni movimento.
    """
    cur = conn.cursor()
    cur.execute("""
        SELECT COALESCE(SUM(quantita * segno), 0)
        FROM magazzino_movimenti
        WHERE articolo_id = ?
    """, (articolo_id,))
    giacenza = cur.fetchone()[0]
    cur.execute(
        "UPDATE articoli SET giacenza = ?, updated_at = datetime('now') WHERE id = ?",
        (round(giacenza, 4), articolo_id)
    )


def _inserisci_movimento(conn, tipo: str, articolo_id: int, codice_articolo: str,
                         quantita: float, utente: str = "sistema",
                         riferimento_tipo: str = None, riferimento_id: int = None,
                         note: str = None, data_movimento: str = None) -> int:
    """
    Inserisce un movimento e aggiorna la cache giacenza.
    Ritorna l'id del movimento creato.
    """
    if tipo not in TIPI_MOVIMENTO:
        raise ValueError(f"Tipo movimento '{tipo}' non valido")
    if quantita <= 0:
        raise ValueError(f"Quantità deve essere > 0 (ricevuto {quantita})")

    segno = TIPI_MOVIMENTO[tipo]["segno"]
    data  = data_movimento or datetime.now().isoformat()

    cur = conn.cursor()
    cur.execute("""
        INSERT INTO magazzino_movimenti (
            tipo, segno, articolo_id, codice_articolo, quantita,
            riferimento_tipo, riferimento_id,
            note, utente, data_movimento, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    """, (
        tipo, segno, articolo_id, codice_articolo, round(quantita, 4),
        riferimento_tipo, riferimento_id,
        note, utente, data,
    ))
    mov_id = cur.lastrowid
    _aggiorna_giacenza_cache(conn, articolo_id)
    return mov_id


def scarica_commessa_per_ordine(conn, ordine_id: int, utente: str = "sistema"):
    """
    Hook chiamato da ordini_stato.py quando un ordine passa a 'spedito'.
    Legge i materiali del preventivo collegato e crea movimenti di scarico
    per ogni articolo con articolo_id valorizzato e giacenza > 0.
    Idempotente: non scarica se esiste già un movimento scarico_commessa
    per lo stesso ordine.
    """
    cur = conn.cursor()

    # Verifica idempotenza
    cur.execute("""
        SELECT COUNT(*) FROM magazzino_movimenti
        WHERE riferimento_tipo = 'ordine' AND riferimento_id = ?
          AND tipo = 'scarico_commessa'
    """, (ordine_id,))
    if cur.fetchone()[0] > 0:
        logger.info(f"Scarico commessa ordine {ordine_id} già eseguito, skip")
        return

    # Leggi preventivo collegato all'ordine
    cur.execute("SELECT preventivo_id, codice_commessa FROM ordini WHERE id = ?", (ordine_id,))
    row = cur.fetchone()
    if not row or not row[0]:
        logger.warning(f"Ordine {ordine_id}: nessun preventivo collegato, scarico saltato")
        return

    preventivo_id   = row[0]
    codice_commessa = row[1] or f"ordine-{ordine_id}"

    # Leggi materiali BOM del preventivo
    cur.execute("""
        SELECT m.codice, m.quantita, a.id AS articolo_id, a.giacenza
        FROM materiali m
        LEFT JOIN articoli a ON a.codice = m.codice
        WHERE m.preventivo_id = ? AND m.quantita > 0
    """, (preventivo_id,))
    materiali = cur.fetchall()

    scaricati = 0
    for mat in materiali:
        codice      = mat[0]
        quantita    = float(mat[1] or 0)
        articolo_id = mat[2]
        giacenza    = float(mat[3] or 0)

        if not articolo_id:
            logger.debug(f"Articolo '{codice}' non in anagrafica, scarico saltato")
            continue
        if quantita <= 0:
            continue

        # Scarica solo fino alla giacenza disponibile (non vai in negativo)
        qty_scarico = min(quantita, max(0, giacenza))
        if qty_scarico <= 0:
            logger.debug(f"Articolo '{codice}': giacenza {giacenza}, niente da scaricare")
            continue

        _inserisci_movimento(
            conn,
            tipo              = "scarico_commessa",
            articolo_id       = articolo_id,
            codice_articolo   = codice,
            quantita          = qty_scarico,
            utente            = utente,
            riferimento_tipo  = "ordine",
            riferimento_id    = ordine_id,
            note              = f"Scarico automatico commessa {codice_commessa}",
        )
        scaricati += 1

    logger.info(f"Scarico commessa ordine {ordine_id}: {scaricati} articoli scaricati")


# ==========================================
# ENDPOINT: MOVIMENTI
# ==========================================

@router.get("/movimenti")
def lista_movimenti(
    articolo_id:   Optional[int] = None,
    codice:        Optional[str] = None,
    tipo:          Optional[str] = None,
    da:            Optional[str] = None,
    a:             Optional[str] = None,
    page:          int = 1,
    limit:         int = 50,
    db: Session = Depends(get_db),
):
    conn   = _raw(db)
    cur    = conn.cursor()
    conds  = ["1=1"]
    params: list = []

    if articolo_id:
        conds.append("m.articolo_id = ?"); params.append(articolo_id)
    if codice:
        conds.append("m.codice_articolo LIKE ?"); params.append(f"%{codice}%")
    if tipo:
        conds.append("m.tipo = ?"); params.append(tipo)
    if da:
        conds.append("m.data_movimento >= ?"); params.append(da)
    if a:
        conds.append("m.data_movimento <= ?"); params.append(a + "T23:59:59")

    where  = " AND ".join(conds)
    offset = (page - 1) * limit

    cur.execute(f"SELECT COUNT(*) FROM magazzino_movimenti m WHERE {where}", params)
    totale = cur.fetchone()[0]

    cur.execute(f"""
        SELECT
            m.id, m.tipo, m.segno, m.articolo_id, m.codice_articolo,
            a.descrizione AS descrizione_articolo,
            m.quantita, m.riferimento_tipo, m.riferimento_id,
            m.note, m.utente, m.data_movimento, m.created_at
        FROM magazzino_movimenti m
        LEFT JOIN articoli a ON a.id = m.articolo_id
        WHERE {where}
        ORDER BY m.data_movimento DESC, m.id DESC
        LIMIT ? OFFSET ?
    """, params + [limit, offset])
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return {"totale": totale, "page": page, "limit": limit, "movimenti": rows}


@router.post("/movimenti")
def crea_movimento(payload: dict = Body(...), db: Session = Depends(get_db)):
    """
    Crea un movimento manuale.
    Body:
    {
        "tipo": "carico_rettifica",
        "articolo_id": 12,
        "quantita": 5,
        "note": "...",
        "utente": "mario.rossi",
        "data_movimento": "2025-03-01"   // opzionale, default oggi
    }
    """
    tipo        = payload.get("tipo")
    articolo_id = payload.get("articolo_id")
    quantita    = float(payload.get("quantita") or 0)
    utente      = payload.get("utente") or "sistema"

    if not tipo or tipo not in TIPI_MOVIMENTO:
        raise HTTPException(400, f"Tipo non valido. Ammessi: {list(TIPI_MOVIMENTO.keys())}")
    if not articolo_id:
        raise HTTPException(400, "articolo_id obbligatorio")
    if quantita <= 0:
        raise HTTPException(400, "quantita deve essere > 0")

    conn = _raw(db)
    cur  = conn.cursor()
    cur.execute("SELECT codice FROM articoli WHERE id = ?", (articolo_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Articolo non trovato")
    codice = row[0]

    try:
        mov_id = _inserisci_movimento(
            conn,
            tipo             = tipo,
            articolo_id      = articolo_id,
            codice_articolo  = codice,
            quantita         = quantita,
            utente           = utente,
            riferimento_tipo = payload.get("riferimento_tipo"),
            riferimento_id   = payload.get("riferimento_id"),
            note             = payload.get("note"),
            data_movimento   = payload.get("data_movimento"),
        )
        conn.commit()
    except ValueError as e:
        conn.rollback()
        conn.close()
        raise HTTPException(400, str(e))
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(500, str(e))

    conn.close()
    return {"id": mov_id, "articolo_id": articolo_id, "codice": codice}


@router.delete("/movimenti/{mov_id}")
def elimina_movimento(mov_id: int, utente: str = "sistema", db: Session = Depends(get_db)):
    """
    Elimina un movimento e ricalcola la giacenza.
    Solo movimenti manuali (tipo rettifica o inventario_iniziale).
    """
    conn = _raw(db)
    cur  = conn.cursor()
    cur.execute("SELECT tipo, articolo_id FROM magazzino_movimenti WHERE id = ?", (mov_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Movimento non trovato")

    tipo, articolo_id = row
    if tipo not in ("carico_rettifica", "scarico_rettifica", "inventario_iniziale"):
        conn.close()
        raise HTTPException(400, f"Non puoi eliminare un movimento di tipo '{tipo}'. Solo rettifiche e inventario iniziale.")

    cur.execute("DELETE FROM magazzino_movimenti WHERE id = ?", (mov_id,))
    _aggiorna_giacenza_cache(conn, articolo_id)
    conn.commit()
    conn.close()
    return {"eliminato": True}


# ==========================================
# ENDPOINT: GIACENZE
# ==========================================

@router.get("/giacenze")
def lista_giacenze(
    q:              Optional[str]  = None,
    solo_attivi:    bool           = True,
    solo_sotto_scorta: bool        = False,
    categoria_id:   Optional[int]  = None,
    page:           int            = 1,
    limit:          int            = 50,
    db: Session = Depends(get_db),
):
    """
    Lista articoli con giacenza attuale e stato sotto-scorta.
    """
    conn   = _raw(db)
    cur    = conn.cursor()
    conds  = ["1=1"]
    params: list = []

    if solo_attivi:
        conds.append("a.is_active = 1")
    if q:
        conds.append("(a.codice LIKE ? OR a.descrizione LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    if categoria_id:
        conds.append("a.categoria_id = ?"); params.append(categoria_id)
    if solo_sotto_scorta:
        conds.append("a.giacenza < a.scorta_minima AND a.scorta_minima > 0")

    where  = " AND ".join(conds)
    offset = (page - 1) * limit

    cur.execute(f"SELECT COUNT(*) FROM articoli a WHERE {where}", params)
    totale = cur.fetchone()[0]

    cur.execute(f"""
        SELECT
            a.id, a.codice, a.descrizione, a.unita_misura,
            a.giacenza, a.scorta_minima,
            c.nome AS categoria,
            a.fornitore,
            CASE
                WHEN a.scorta_minima > 0 AND a.giacenza < a.scorta_minima THEN 1
                ELSE 0
            END AS sotto_scorta,
            (SELECT COUNT(*) FROM magazzino_movimenti m WHERE m.articolo_id = a.id) AS n_movimenti
        FROM articoli a
        LEFT JOIN categorie_articoli c ON c.id = a.categoria_id
        WHERE {where}
        ORDER BY sotto_scorta DESC, a.codice ASC
        LIMIT ? OFFSET ?
    """, params + [limit, offset])
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return {"totale": totale, "page": page, "limit": limit, "articoli": rows}


@router.get("/giacenze/sotto-scorta")
def articoli_sotto_scorta(db: Session = Depends(get_db)):
    """
    Lista rapida degli articoli sotto scorta minima.
    Usato per il badge alert nella sidebar e nella GestioneArticoliPage.
    """
    conn = _raw(db)
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            a.id, a.codice, a.descrizione, a.unita_misura,
            a.giacenza, a.scorta_minima,
            a.fornitore,
            (a.scorta_minima - a.giacenza) AS mancanti
        FROM articoli a
        WHERE a.is_active = 1
          AND a.scorta_minima > 0
          AND a.giacenza < a.scorta_minima
        ORDER BY mancanti DESC, a.codice ASC
    """)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return {"totale": len(rows), "articoli": rows}


@router.get("/giacenze/{articolo_id}/movimenti")
def movimenti_articolo(
    articolo_id: int,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """Ultimi N movimenti di un articolo specifico."""
    conn = _raw(db)
    cur  = conn.cursor()
    cur.execute("""
        SELECT
            m.id, m.tipo, m.segno, m.quantita,
            m.riferimento_tipo, m.riferimento_id,
            m.note, m.utente, m.data_movimento,
            (quantita * segno) AS variazione
        FROM magazzino_movimenti m
        WHERE m.articolo_id = ?
        ORDER BY m.data_movimento DESC, m.id DESC
        LIMIT ?
    """, (articolo_id, limit))
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]

    # Giacenza corrente
    cur.execute("SELECT giacenza, scorta_minima, codice, descrizione FROM articoli WHERE id = ?", (articolo_id,))
    art = cur.fetchone()
    conn.close()

    if not art:
        raise HTTPException(404, "Articolo non trovato")

    return {
        "articolo_id":  articolo_id,
        "codice":       art[2],
        "descrizione":  art[3],
        "giacenza":     art[0],
        "scorta_minima":art[1],
        "sotto_scorta": art[0] < art[1] if art[1] else False,
        "movimenti":    rows,
    }


# ==========================================
# ENDPOINT: CARICO DA ODA
# ==========================================

@router.post("/carico-da-oda/{oda_id}")
def carico_da_oda(
    oda_id: int,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
):
    """
    Crea movimenti di carico per le righe di un ODA ricevuto.
    Può essere chiamato manualmente dall'UI o agganciato al ricevimento merce.
    Body opzionale: { "utente": "mario.rossi" }
    """
    utente = payload.get("utente") or "sistema"
    conn   = _raw(db)
    cur    = conn.cursor()

    cur.execute("SELECT numero_oda, stato FROM ordini_acquisto WHERE id = ?", (oda_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "ODA non trovato")
    if row[1] not in ("ricevuto", "parzialmente_ricevuto", "chiuso"):
        conn.close()
        raise HTTPException(400, f"ODA in stato '{row[1]}': il carico richiede stato ricevuto o parzialmente_ricevuto")

    numero_oda = row[0]

    cur.execute("""
        SELECT r.articolo_id, r.codice_articolo, r.quantita_ricevuta,
               r.quantita_ordinata, a.id AS art_id
        FROM ordini_acquisto_righe r
        LEFT JOIN articoli a ON a.codice = r.codice_articolo
        WHERE r.oda_id = ? AND r.quantita_ricevuta > 0
    """, (oda_id,))
    righe = cur.fetchall()

    caricati = 0
    skippati = []
    for r in righe:
        articolo_id = r[0] or r[4]
        codice      = r[1]
        quantita    = float(r[2] or 0)

        if not articolo_id:
            skippati.append(codice)
            continue
        if quantita <= 0:
            continue

        # Controlla se il carico per questa riga è già stato fatto
        cur.execute("""
            SELECT COALESCE(SUM(quantita), 0) FROM magazzino_movimenti
            WHERE riferimento_tipo = 'oda' AND riferimento_id = ?
              AND codice_articolo = ? AND tipo = 'carico_acquisto'
        """, (oda_id, codice))
        gia_caricato = float(cur.fetchone()[0] or 0)
        da_caricare  = round(quantita - gia_caricato, 4)

        if da_caricare <= 0:
            continue

        _inserisci_movimento(
            conn,
            tipo             = "carico_acquisto",
            articolo_id      = articolo_id,
            codice_articolo  = codice,
            quantita         = da_caricare,
            utente           = utente,
            riferimento_tipo = "oda",
            riferimento_id   = oda_id,
            note             = f"Carico da ODA {numero_oda}",
        )
        caricati += 1

    conn.commit()
    conn.close()

    result = {"caricati": caricati, "oda_id": oda_id, "numero_oda": numero_oda}
    if skippati:
        result["skippati"] = skippati
        result["avviso"] = f"{len(skippati)} articoli non trovati in anagrafica: {', '.join(skippati[:5])}"
    return result


# ==========================================
# ENDPOINT: STATISTICHE
# ==========================================

@router.get("/statistiche")
def statistiche_magazzino(db: Session = Depends(get_db)):
    conn = _raw(db)
    cur  = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM articoli WHERE is_active = 1")
    n_articoli = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*) FROM articoli
        WHERE is_active = 1 AND scorta_minima > 0 AND giacenza < scorta_minima
    """)
    n_sotto_scorta = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*) FROM articoli WHERE is_active = 1 AND giacenza > 0
    """)
    n_con_giacenza = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*) FROM magazzino_movimenti
        WHERE data_movimento >= date('now', '-30 days')
    """)
    movimenti_30gg = cur.fetchone()[0]

    cur.execute("""
        SELECT tipo, COUNT(*), SUM(quantita)
        FROM magazzino_movimenti
        WHERE data_movimento >= date('now', '-30 days')
        GROUP BY tipo
    """)
    per_tipo = {r[0]: {"count": r[1], "quantita": round(r[2] or 0, 2)} for r in cur.fetchall()}

    conn.close()
    return {
        "n_articoli":      n_articoli,
        "n_sotto_scorta":  n_sotto_scorta,
        "n_con_giacenza":  n_con_giacenza,
        "movimenti_30gg":  movimenti_30gg,
        "per_tipo":        per_tipo,
    }


# ==========================================
# ENDPOINT: TIPI MOVIMENTO (per UI)
# ==========================================

@router.get("/tipi-movimento")
def get_tipi_movimento():
    return [
        {"codice": k, "label": v["label"], "segno": v["segno"]}
        for k, v in TIPI_MOVIMENTO.items()
    ]
