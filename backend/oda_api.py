"""
oda_api.py - API REST per il modulo Ordini di Acquisto
======================================================
Includere in main.py:

    from oda_api import router as oda_router
    oda_router.dependencies = [Depends(richiedi_modulo("oda"))]
    app.include_router(oda_router)
"""

import logging
import smtplib
import tempfile
import os
from datetime import datetime, date
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session

from database import SessionLocal

logger = logging.getLogger("oda")

router = APIRouter(prefix="/oda", tags=["Ordini di Acquisto"])

STATI_ODA = ["bozza", "inviato", "parzialmente_ricevuto", "ricevuto", "chiuso", "annullato"]

TRANSIZIONI_AMMESSE = {
    "bozza":                  ["inviato", "annullato"],
    "inviato":                ["parzialmente_ricevuto", "ricevuto", "annullato"],
    "parzialmente_ricevuto":  ["ricevuto", "annullato"],
    "ricevuto":               ["chiuso"],
    "chiuso":                 [],
    "annullato":              [],
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
# NUMERAZIONE
# ==========================================

def _prossimo_numero_oda(conn, anno: int) -> str:
    cur = conn.cursor()
    cur.execute("SELECT ultimo_numero FROM oda_numerazione WHERE anno = ?", (anno,))
    row = cur.fetchone()
    if row:
        nuovo = row[0] + 1
        cur.execute("UPDATE oda_numerazione SET ultimo_numero = ? WHERE anno = ?", (nuovo, anno))
    else:
        nuovo = 1
        cur.execute("INSERT INTO oda_numerazione (anno, ultimo_numero) VALUES (?, ?)", (anno, nuovo))
    return f"ODA-{anno}-{str(nuovo).zfill(4)}"


def _ricalcola_totali(conn, oda_id: int):
    cur = conn.cursor()
    cur.execute("""
        SELECT
            SUM(prezzo_totale)                            AS imponibile,
            SUM(prezzo_totale * aliquota_iva / 100.0)     AS iva
        FROM ordini_acquisto_righe
        WHERE oda_id = ?
    """, (oda_id,))
    row = cur.fetchone()
    imponibile = round(row[0] or 0, 2)
    iva        = round(row[1] or 0, 2)
    totale     = round(imponibile + iva, 2)
    cur.execute("""
        UPDATE ordini_acquisto
        SET imponibile_totale = ?, iva_totale = ?, totale_oda = ?, updated_at = datetime('now')
        WHERE id = ?
    """, (imponibile, iva, totale, oda_id))


def _aggiorna_stato_ricezione(conn, oda_id: int):
    """Aggiorna stato ODA in base alle quantità ricevute vs ordinate."""
    cur = conn.cursor()
    cur.execute("""
        SELECT
            SUM(quantita_ordinata)  AS totale_ord,
            SUM(quantita_ricevuta)  AS totale_ric
        FROM ordini_acquisto_righe
        WHERE oda_id = ?
    """, (oda_id,))
    row = cur.fetchone()
    if not row or not row[0]:
        return

    totale_ord = row[0]
    totale_ric = row[1] or 0

    cur.execute("SELECT stato FROM ordini_acquisto WHERE id = ?", (oda_id,))
    stato_cur = cur.fetchone()
    if not stato_cur or stato_cur[0] in ("chiuso", "annullato", "bozza"):
        return

    if totale_ric <= 0:
        nuovo_stato = "inviato"
    elif totale_ric < totale_ord:
        nuovo_stato = "parzialmente_ricevuto"
    else:
        nuovo_stato = "ricevuto"

    if stato_cur[0] != nuovo_stato:
        stato_prec = stato_cur[0]
        cur.execute("""
            UPDATE ordini_acquisto SET stato = ?, updated_at = datetime('now') WHERE id = ?
        """, (nuovo_stato, oda_id))
        cur.execute("""
            INSERT INTO ordini_acquisto_storico (oda_id, stato_da, stato_a, nota)
            VALUES (?, ?, ?, 'Aggiornamento automatico ricezione')
        """, (oda_id, stato_prec, nuovo_stato))


# ==========================================
# LISTA ODA
# ==========================================

@router.get("")
def lista_oda(
    q:           Optional[str] = None,
    stato:       Optional[str] = None,
    fornitore_id:Optional[int] = None,
    anno:        Optional[int] = None,
    preventivo_id: Optional[int] = None,
    ordine_id:   Optional[int] = None,
    da_ricevere: bool = False,
    page:        int  = 1,
    limit:       int  = 50,
    db: Session = Depends(get_db),
):
    conn = _raw(db)
    cur  = conn.cursor()

    conds  = ["1=1"]
    params: list = []

    if q:
        conds.append("(o.numero_oda LIKE ? OR o.fornitore_denominazione LIKE ? OR o.codice_commessa LIKE ?)")
        params += [f"%{q}%"] * 3
    if stato:
        conds.append("o.stato = ?"); params.append(stato)
    if fornitore_id:
        conds.append("o.fornitore_id = ?"); params.append(fornitore_id)
    if anno:
        conds.append("o.anno = ?"); params.append(anno)
    if preventivo_id:
        conds.append("o.preventivo_id = ?"); params.append(preventivo_id)
    if ordine_id:
        conds.append("o.ordine_id = ?"); params.append(ordine_id)
    if da_ricevere:
        conds.append("o.stato IN ('inviato','parzialmente_ricevuto')")

    where  = " AND ".join(conds)
    offset = (page - 1) * limit

    cur.execute(f"SELECT COUNT(*) FROM ordini_acquisto o WHERE {where}", params)
    totale = cur.fetchone()[0]

    cur.execute(f"""
        SELECT
            o.id, o.numero_oda, o.anno, o.stato,
            o.fornitore_id, o.fornitore_denominazione, o.fornitore_partita_iva,
            o.preventivo_id, o.ordine_id, o.codice_commessa,
            o.data_emissione, o.data_consegna_richiesta, o.data_consegna_effettiva,
            o.imponibile_totale, o.iva_totale, o.totale_oda,
            o.condizioni_pagamento, o.note,
            o.creato_da, o.created_at,
            (SELECT COUNT(*) FROM ordini_acquisto_righe r WHERE r.oda_id = o.id) AS n_righe,
            (SELECT COUNT(*) FROM oda_fatture_passive f WHERE f.oda_id = o.id)   AS n_fatture
        FROM ordini_acquisto o
        WHERE {where}
        ORDER BY o.created_at DESC, o.id DESC
        LIMIT ? OFFSET ?
    """, params + [limit, offset])

    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()

    return {"totale": totale, "page": page, "limit": limit, "oda": rows}


# ==========================================
# DETTAGLIO ODA
# ==========================================

@router.get("/statistiche")
def statistiche_oda(anno: Optional[int] = None, db: Session = Depends(get_db)):
    if not anno:
        anno = date.today().year
    conn = _raw(db)
    cur  = conn.cursor()

    cur.execute("""
        SELECT stato, COUNT(*), SUM(totale_oda)
        FROM ordini_acquisto WHERE anno = ?
        GROUP BY stato
    """, (anno,))
    per_stato = {r[0]: {"count": r[1], "totale": round(r[2] or 0, 2)} for r in cur.fetchall()}

    cur.execute("""
        SELECT COUNT(*), SUM(totale_oda) FROM ordini_acquisto WHERE anno = ?
    """, (anno,))
    row = cur.fetchone()

    cur.execute("""
        SELECT COUNT(*) FROM ordini_acquisto
        WHERE stato IN ('inviato','parzialmente_ricevuto')
        AND data_consegna_richiesta IS NOT NULL
        AND data_consegna_richiesta < date('now')
    """)
    in_ritardo = cur.fetchone()[0]

    cur.execute("""
        SELECT fornitore_denominazione, COUNT(*), SUM(totale_oda)
        FROM ordini_acquisto WHERE anno = ?
        GROUP BY fornitore_denominazione
        ORDER BY SUM(totale_oda) DESC LIMIT 10
    """, (anno,))
    per_fornitore = [
        {"denominazione": r[0], "count": r[1], "totale": round(r[2] or 0, 2)}
        for r in cur.fetchall()
    ]

    conn.close()
    return {
        "anno":          anno,
        "totale_count":  row[0] or 0,
        "totale_importo":round(row[1] or 0, 2),
        "per_stato":     per_stato,
        "in_ritardo":    in_ritardo,
        "per_fornitore": per_fornitore,
    }
@router.get("/{oda_id}")
def get_oda(oda_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur  = conn.cursor()

    cur.execute("SELECT * FROM ordini_acquisto WHERE id = ?", (oda_id,))
    row = cur.fetchone()
    if not row:
        conn.close(); raise HTTPException(404, "ODA non trovato")

    cols = [d[0] for d in cur.description]
    oda  = dict(zip(cols, row))

    # Righe
    cur.execute("""
        SELECT r.*,
               (r.quantita_ordinata - r.quantita_ricevuta) AS quantita_residua
        FROM ordini_acquisto_righe r
        WHERE r.oda_id = ?
        ORDER BY r.numero_riga
    """, (oda_id,))
    r_cols   = [d[0] for d in cur.description]
    oda["righe"] = [dict(zip(r_cols, r)) for r in cur.fetchall()]

    # Ricevimenti
    cur.execute("""
        SELECT rc.*, r.codice_articolo, r.descrizione AS descrizione_riga
        FROM ordini_acquisto_ricevimenti rc
        JOIN ordini_acquisto_righe r ON r.id = rc.riga_id
        WHERE rc.oda_id = ?
        ORDER BY rc.data_ricezione DESC
    """, (oda_id,))
    rc_cols = [d[0] for d in cur.description]
    oda["ricevimenti"] = [dict(zip(rc_cols, r)) for r in cur.fetchall()]

    # Fatture passive collegate
    cur.execute("""
        SELECT f.id, f.numero_fattura AS numero_fattura_fornitore, f.fornitore_denominazione,
               f.data_fattura AS data_fattura_fornitore, f.totale_fattura, f.stato_sdi AS stato_lavorazione
        FROM fe_fatture f
        JOIN oda_fatture_passive j ON j.fattura_id = f.id
        WHERE j.oda_id = ?
    """, (oda_id,))
    fp_cols = [d[0] for d in cur.description]
    oda["fatture_passive"] = [dict(zip(fp_cols, r)) for r in cur.fetchall()]

    # Storico
    cur.execute("""
        SELECT * FROM ordini_acquisto_storico WHERE oda_id = ? ORDER BY created_at DESC
    """, (oda_id,))
    s_cols = [d[0] for d in cur.description]
    oda["storico"] = [dict(zip(s_cols, r)) for r in cur.fetchall()]

    conn.close()
    return oda


# ==========================================
# CREA ODA
# ==========================================

@router.post("")
def crea_oda(payload: dict = Body(...), db: Session = Depends(get_db)):
    anno = payload.get("anno") or date.today().year
    conn = _raw(db)
    cur  = conn.cursor()

    numero_oda = payload.get("numero_oda") or _prossimo_numero_oda(conn, anno)

    cur.execute("""
        INSERT INTO ordini_acquisto (
            numero_oda, anno, stato,
            fornitore_id, fornitore_denominazione, fornitore_partita_iva,
            fornitore_pec, fornitore_indirizzo, fornitore_comune, fornitore_provincia,
            preventivo_id, ordine_id, codice_commessa,
            data_emissione, data_consegna_richiesta,
            condizioni_pagamento, luogo_consegna, note, note_interne,
            creato_da, created_at, updated_at
        ) VALUES (?, ?, 'bozza', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    """, (
        numero_oda, anno,
        payload.get("fornitore_id"),
        payload.get("fornitore_denominazione"),
        payload.get("fornitore_partita_iva"),
        payload.get("fornitore_pec"),
        payload.get("fornitore_indirizzo"),
        payload.get("fornitore_comune"),
        payload.get("fornitore_provincia"),
        payload.get("preventivo_id"),
        payload.get("ordine_id"),
        payload.get("codice_commessa"),
        payload.get("data_emissione") or str(date.today()),
        payload.get("data_consegna_richiesta"),
        payload.get("condizioni_pagamento"),
        payload.get("luogo_consegna"),
        payload.get("note"),
        payload.get("note_interne"),
        payload.get("creato_da"),
    ))
    oda_id = cur.lastrowid

    # Storico
    cur.execute("""
        INSERT INTO ordini_acquisto_storico (oda_id, stato_da, stato_a, nota)
        VALUES (?, NULL, 'bozza', 'ODA creato')
    """, (oda_id,))

    # Righe dal payload
    righe = payload.get("righe", [])
    for i, riga in enumerate(righe, start=1):
        _insert_riga(cur, oda_id, i, riga)

    _ricalcola_totali(conn, oda_id)
    conn.commit()
    conn.close()

    return {"id": oda_id, "numero_oda": numero_oda}


# ==========================================
# AGGIORNA TESTATA ODA
# ==========================================

@router.put("/{oda_id}")
def aggiorna_oda(oda_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    campi_ammessi = {
        "fornitore_id", "fornitore_denominazione", "fornitore_partita_iva",
        "fornitore_pec", "fornitore_indirizzo", "fornitore_comune", "fornitore_provincia",
        "preventivo_id", "ordine_id", "codice_commessa",
        "data_emissione", "data_consegna_richiesta", "data_consegna_effettiva",
        "condizioni_pagamento", "luogo_consegna", "note", "note_interne",
        "riferimento_sdi",
    }
    aggiorn = {k: v for k, v in payload.items() if k in campi_ammessi}
    if not aggiorn:
        raise HTTPException(400, "Nessun campo aggiornabile nel payload")

    set_cl = ", ".join(f"{k} = ?" for k in aggiorn)
    conn   = _raw(db)
    cur    = conn.cursor()
    cur.execute(
        f"UPDATE ordini_acquisto SET {set_cl}, updated_at = datetime('now') WHERE id = ?",
        list(aggiorn.values()) + [oda_id]
    )
    conn.commit()
    conn.close()
    return {"id": oda_id}


# ==========================================
# RIGHE: CRUD
# ==========================================

def _insert_riga(cur, oda_id: int, numero_riga: int, riga: dict):
    qt  = float(riga.get("quantita_ordinata") or 1)
    pu  = float(riga.get("prezzo_unitario") or 0)
    sc  = float(riga.get("sconto_percentuale") or 0)
    pt  = round(qt * pu * (1 - sc / 100), 4)
    cur.execute("""
        INSERT INTO ordini_acquisto_righe (
            oda_id, numero_riga,
            articolo_id, codice_articolo, descrizione, unita_misura,
            quantita_ordinata, quantita_ricevuta, prezzo_unitario,
            sconto_percentuale, aliquota_iva, prezzo_totale, note_riga
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    """, (
        oda_id, numero_riga,
        riga.get("articolo_id"), riga.get("codice_articolo"),
        riga.get("descrizione", ""), riga.get("unita_misura", "pz"),
        qt, pu, sc,
        float(riga.get("aliquota_iva") or 22),
        pt, riga.get("note_riga"),
    ))


@router.post("/{oda_id}/righe")
def aggiungi_riga(oda_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    conn = _raw(db)
    cur  = conn.cursor()

    cur.execute("SELECT id FROM ordini_acquisto WHERE id = ?", (oda_id,))
    if not cur.fetchone():
        conn.close(); raise HTTPException(404, "ODA non trovato")

    cur.execute("SELECT COALESCE(MAX(numero_riga),0)+1 FROM ordini_acquisto_righe WHERE oda_id=?", (oda_id,))
    numero_riga = cur.fetchone()[0]

    _insert_riga(cur, oda_id, numero_riga, payload)
    _ricalcola_totali(conn, oda_id)
    conn.commit()
    riga_id = cur.lastrowid
    conn.close()
    return {"id": riga_id}


@router.put("/{oda_id}/righe/{riga_id}")
def aggiorna_riga(oda_id: int, riga_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    conn = _raw(db)
    cur  = conn.cursor()

    qt  = float(payload.get("quantita_ordinata") or 1)
    pu  = float(payload.get("prezzo_unitario") or 0)
    sc  = float(payload.get("sconto_percentuale") or 0)
    pt  = round(qt * pu * (1 - sc / 100), 4)

    cur.execute("""
        UPDATE ordini_acquisto_righe
        SET codice_articolo=?, descrizione=?, unita_misura=?,
            quantita_ordinata=?, prezzo_unitario=?, sconto_percentuale=?,
            aliquota_iva=?, prezzo_totale=?, note_riga=?
        WHERE id=? AND oda_id=?
    """, (
        payload.get("codice_articolo"), payload.get("descrizione", ""),
        payload.get("unita_misura", "pz"),
        qt, pu, sc,
        float(payload.get("aliquota_iva") or 22), pt,
        payload.get("note_riga"),
        riga_id, oda_id,
    ))
    _ricalcola_totali(conn, oda_id)
    conn.commit()
    conn.close()
    return {"id": riga_id}


@router.delete("/{oda_id}/righe/{riga_id}")
def elimina_riga(oda_id: int, riga_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur  = conn.cursor()
    cur.execute("DELETE FROM ordini_acquisto_righe WHERE id=? AND oda_id=?", (riga_id, oda_id))
    _ricalcola_totali(conn, oda_id)
    conn.commit()
    conn.close()
    return {"eliminata": True}


# ==========================================
# RICEVIMENTO MERCE
# ==========================================

@router.post("/{oda_id}/ricevimenti")
def registra_ricevimento(oda_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    """
    Registra la ricezione (parziale o totale) di una riga.
    payload: { riga_id, quantita, numero_ddt?, note?, registrato_da? }
    """
    riga_id  = payload.get("riga_id")
    quantita = float(payload.get("quantita") or 0)
    if not riga_id or quantita <= 0:
        raise HTTPException(400, "riga_id e quantita > 0 obbligatori")

    conn = _raw(db)
    cur  = conn.cursor()

    # Verifica riga appartiene all'ODA
    cur.execute(
        "SELECT quantita_ordinata, quantita_ricevuta FROM ordini_acquisto_righe WHERE id=? AND oda_id=?",
        (riga_id, oda_id)
    )
    row = cur.fetchone()
    if not row:
        conn.close(); raise HTTPException(404, "Riga non trovata")

    qt_ord = row[0]
    qt_ric = row[1]
    qt_nuova = qt_ric + quantita
    if qt_nuova > qt_ord:
        conn.close()
        raise HTTPException(400, f"Quantità ricevuta ({qt_nuova}) supera quella ordinata ({qt_ord})")

    cur.execute("""
        INSERT INTO ordini_acquisto_ricevimenti (oda_id, riga_id, quantita, data_ricezione, numero_ddt, note, registrato_da)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        oda_id, riga_id, quantita,
        payload.get("data_ricezione") or str(date.today()),
        payload.get("numero_ddt"),
        payload.get("note"),
        payload.get("registrato_da"),
    ))

    cur.execute(
        "UPDATE ordini_acquisto_righe SET quantita_ricevuta = ? WHERE id = ?",
        (qt_nuova, riga_id)
    )

    _aggiorna_stato_ricezione(conn, oda_id)
    conn.commit()
    conn.close()
    return {"registrato": True, "quantita_ricevuta": qt_nuova}


# ==========================================
# TRANSIZIONI STATO
# ==========================================

@router.post("/{oda_id}/transizione")
def transizione_stato(oda_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    stato_nuovo = payload.get("stato")
    nota        = payload.get("nota")
    utente      = payload.get("utente")

    if stato_nuovo not in STATI_ODA:
        raise HTTPException(400, f"Stato non valido: {STATI_ODA}")

    conn = _raw(db)
    cur  = conn.cursor()

    cur.execute("SELECT stato FROM ordini_acquisto WHERE id = ?", (oda_id,))
    row = cur.fetchone()
    if not row:
        conn.close(); raise HTTPException(404, "ODA non trovato")

    stato_corrente = row[0]
    ammessi = TRANSIZIONI_AMMESSE.get(stato_corrente, [])
    if stato_nuovo not in ammessi:
        conn.close()
        raise HTTPException(400, f"Transizione '{stato_corrente}' → '{stato_nuovo}' non ammessa")

    extra_sql   = ""
    extra_parms = []
    if stato_nuovo == "ricevuto":
        extra_sql   = ", data_consegna_effettiva = COALESCE(data_consegna_effettiva, date('now'))"

    cur.execute(f"""
        UPDATE ordini_acquisto
        SET stato = ?, updated_at = datetime('now') {extra_sql}
        WHERE id = ?
    """, [stato_nuovo] + extra_parms + [oda_id])

    cur.execute("""
        INSERT INTO ordini_acquisto_storico (oda_id, stato_da, stato_a, nota, utente)
        VALUES (?, ?, ?, ?, ?)
    """, (oda_id, stato_corrente, stato_nuovo, nota, utente))

    conn.commit()

    # Notifica interna: ODA ricevuto/parzialmente ricevuto
    if stato_nuovo in ("ricevuto", "parzialmente_ricevuto"):
        try:
            smtp_cfg = _get_smtp_config(conn)
            dest_int = smtp_cfg.get("email_destinatario_oda", "").strip()
            if (dest_int
                    and smtp_cfg.get("email_notifica_oda_ricevuto", "1") == "1"
                    and smtp_cfg.get("email_notifiche_attive", "0") == "1"):
                cur2 = conn.cursor()
                cur2.execute(
                    "SELECT numero_oda, fornitore_denominazione, codice_commessa FROM ordini_acquisto WHERE id = ?",
                    (oda_id,)
                )
                r2 = cur2.fetchone()
                if r2:
                    from notifiche_email import _invia_smtp as _smtp
                    label = "Ricevuto" if stato_nuovo == "ricevuto" else "Parzialmente ricevuto"
                    corpo_int = (
                        f"<html><body style='font-family:Arial,sans-serif;color:#333;'>"
                        f"<h3 style='color:#4F46E5;'>ODA {label}</h3>"
                        f"<p><strong>{r2[0]}</strong> — {r2[1]}</p>"
                        f"<p>Commessa: {r2[2] or '—'}</p>"
                        f"</body></html>"
                    )
                    _smtp(smtp_cfg, [dest_int],
                          f"ODA {label}: {r2[0]} — {r2[1]}",
                          corpo_int)
        except Exception as _ne:
            logger.warning(f"Notifica interna ODA ricevuto fallita: {_ne}")

    conn.close()
    return {"id": oda_id, "stato": stato_nuovo}


# ==========================================
# COLLEGA / SCOLLEGA FATTURA PASSIVA
# ==========================================

@router.post("/{oda_id}/fatture/{fattura_id}")
def collega_fattura(oda_id: int, fattura_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur  = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO oda_fatture_passive (oda_id, fattura_id) VALUES (?, ?)",
            (oda_id, fattura_id)
        )
        conn.commit()
    except Exception:
        conn.close()
        raise HTTPException(409, "Collegamento già esistente")
    conn.close()
    return {"collegato": True}


@router.delete("/{oda_id}/fatture/{fattura_id}")
def scollega_fattura(oda_id: int, fattura_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur  = conn.cursor()
    cur.execute(
        "DELETE FROM oda_fatture_passive WHERE oda_id=? AND fattura_id=?",
        (oda_id, fattura_id)
    )
    conn.commit()
    conn.close()
    return {"scollegato": True}


# ==========================================
# GENERA ODA DA BOM
# ==========================================

@router.get("/genera-da-bom/{ordine_id}/check")
def check_oda_esistenti(ordine_id: int, db: Session = Depends(get_db)):
    """
    Controlla se esistono già ODA per i fornitori della BOM di questo ordine.
    Ritorna la lista dei fornitori con flag conflitto.
    Usato dal frontend per mostrare il dialog di conferma.
    """
    conn = _raw(db)
    cur  = conn.cursor()

    # Verifica ordine e BOM esplosa
    cur.execute("SELECT numero_ordine, bom_esplosa FROM ordini WHERE id = ?", (ordine_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Ordine non trovato")
    if not row[1]:
        conn.close()
        raise HTTPException(400, "BOM non ancora esplosa per questo ordine")

    numero_ordine = row[0]

    # Lista acquisti dalla BOM
    cur.execute("""
        SELECT e.codice, e.descrizione, e.quantita, e.unita_misura,
               e.costo_unitario, e.costo_totale,
               COALESCE(a.fornitore, 'Non assegnato') AS fornitore_nome,
               a.codice_fornitore,
               COALESCE(f.id, NULL) AS fornitore_id,
               COALESCE(f.email, '') AS fornitore_email
        FROM esplosi e
        LEFT JOIN articoli a ON a.codice = e.codice
        LEFT JOIN fornitori f ON LOWER(f.ragione_sociale) = LOWER(a.fornitore)
        WHERE e.ordine_id = ? AND e.tipo = 'ACQUISTO'
        ORDER BY fornitore_nome, e.codice
    """, (ordine_id,))

    cols = [d[0] for d in cur.description]
    righe = [dict(zip(cols, r)) for r in cur.fetchall()]

    # Raggruppa per fornitore
    per_fornitore = {}
    for r in righe:
        fn = r["fornitore_nome"]
        if fn not in per_fornitore:
            per_fornitore[fn] = {
                "fornitore_nome":  fn,
                "fornitore_id":    r["fornitore_id"],
                "fornitore_email": r["fornitore_email"],
                "articoli":        [],
                "totale":          0,
            }
        per_fornitore[fn]["articoli"].append(r)
        per_fornitore[fn]["totale"] += r["costo_totale"] or 0

    # Controlla conflitti: ODA già esistenti per questo ordine
    cur.execute("""
        SELECT fornitore_denominazione, id, numero_oda, stato
        FROM ordini_acquisto
        WHERE ordine_id = ? AND stato NOT IN ('annullato')
        ORDER BY created_at DESC
    """, (ordine_id,))
    oda_esistenti = {}
    for r in cur.fetchall():
        oda_esistenti[r[0]] = {"oda_id": r[1], "numero_oda": r[2], "stato": r[3]}

    conn.close()

    risultato = []
    for fn, dati in per_fornitore.items():
        entry = {
            "fornitore_nome":    fn,
            "fornitore_id":      dati["fornitore_id"],
            "fornitore_email":   dati["fornitore_email"],
            "num_articoli":      len(dati["articoli"]),
            "totale":            round(dati["totale"], 2),
            "conflitto":         fn in oda_esistenti,
            "oda_esistente":     oda_esistenti.get(fn),
        }
        risultato.append(entry)

    return {
        "ordine_id":     ordine_id,
        "numero_ordine": numero_ordine,
        "fornitori":     risultato,
        "ha_conflitti":  any(r["conflitto"] for r in risultato),
    }


@router.post("/genera-da-bom/{ordine_id}")
def genera_oda_da_bom(
    ordine_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db)
):
    """
    Genera uno o più ODA dalla BOM esplosa dell'ordine.

    Payload:
    {
        "fornitori": [
            {
                "fornitore_nome": "Schneider",
                "azione": "crea"        // oppure "ricrea" (elimina e ricrea) o "salta"
            },
            ...
        ],
        "creato_da": "admin"
    }

    Se `fornitori` è omesso, crea per tutti (senza conflitti).
    """
    conn = _raw(db)
    cur  = conn.cursor()

    # Verifica ordine
    cur.execute("""
        SELECT o.numero_ordine, o.bom_esplosa, o.preventivo_id,
               c.ragione_sociale AS cliente_nome
        FROM ordini o
        LEFT JOIN clienti c ON c.id = o.cliente_id
        WHERE o.id = ?
    """, (ordine_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Ordine non trovato")
    if not row[1]:
        conn.close()
        raise HTTPException(400, "BOM non ancora esplosa")

    numero_ordine  = row[0]
    preventivo_id  = row[2]
    cliente_nome   = row[3] or ""
    creato_da      = payload.get("creato_da", "sistema")

    # Istruzioni per fornitore  { nome: azione }
    istruzioni = {}
    for f in payload.get("fornitori", []):
        istruzioni[f["fornitore_nome"]] = f.get("azione", "crea")

    # Lista acquisti dalla BOM
    cur.execute("""
        SELECT e.codice, e.descrizione, e.quantita, e.unita_misura,
               e.costo_unitario, e.costo_totale,
               COALESCE(a.fornitore, 'Non assegnato') AS fornitore_nome,
               a.codice_fornitore, 
               a.id AS articolo_id
        FROM esplosi e
        LEFT JOIN articoli a ON a.codice = e.codice
        WHERE e.ordine_id = ? AND e.tipo = 'ACQUISTO'
        ORDER BY fornitore_nome, e.codice
    """, (ordine_id,))
    righe_bom_cols = [d[0] for d in cur.description]
    righe_bom = [dict(zip(righe_bom_cols, r)) for r in cur.fetchall()]

    # Raggruppa per fornitore
    per_fornitore: dict = {}
    for r in righe_bom:
        fn = r["fornitore_nome"]
        if fn not in per_fornitore:
            per_fornitore[fn] = []
        per_fornitore[fn].append(r)

    anno   = date.today().year
    creati = []
    saltati = []

    for fn, articoli in per_fornitore.items():
        azione = istruzioni.get(fn, "crea")  # default: crea se non specificato
        if azione == "salta":
            saltati.append(fn)
            continue

        # Se "ricrea": elimina ODA precedente
        if azione == "ricrea":
            cur.execute("""
                SELECT id FROM ordini_acquisto
                WHERE ordine_id = ? AND fornitore_denominazione = ?
                AND stato NOT IN ('annullato')
            """, (ordine_id, fn))
            vecchi = [r[0] for r in cur.fetchall()]
            for vid in vecchi:
                cur.execute("DELETE FROM ordini_acquisto_righe WHERE oda_id = ?", (vid,))
                cur.execute("DELETE FROM ordini_acquisto_storico WHERE oda_id = ?", (vid,))
                cur.execute("DELETE FROM ordini_acquisto WHERE id = ?", (vid,))

        # Trova o crea fornitore in anagrafica
        cur.execute(
            "SELECT id, condizioni_pagamento FROM fornitori WHERE LOWER(ragione_sociale) = LOWER(?)",
            (fn,)
        )
        f_row = cur.fetchone()
        if f_row:
            fornitore_id   = f_row[0]
            cond_pagamento = f_row[1]
        else:
            now = datetime.now().isoformat()
            cur.execute(
                "INSERT INTO fornitori (ragione_sociale, created_at, updated_at) VALUES (?, ?, ?)",
                (fn, now, now)
            )
            fornitore_id   = cur.lastrowid
            cond_pagamento = None

        # Totale righe
        totale_articoli = sum(r["costo_totale"] or 0 for r in articoli)

        # Crea ODA
        numero_oda = _prossimo_numero_oda(conn, anno)
        cur.execute("""
            INSERT INTO ordini_acquisto (
                numero_oda, anno, stato,
                fornitore_id, fornitore_denominazione,
                preventivo_id, ordine_id, codice_commessa,
                data_emissione,
                condizioni_pagamento,
                note_interne, creato_da,
                created_at, updated_at
            ) VALUES (?, ?, 'bozza', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        """, (
            numero_oda, anno,
            fornitore_id, fn,
            preventivo_id, ordine_id,
            numero_ordine,           # codice_commessa = numero ordine di vendita
            str(date.today()),
            cond_pagamento,
            f"Generato automaticamente da BOM ordine {numero_ordine} — cliente: {cliente_nome}",
            creato_da,
        ))
        oda_id = cur.lastrowid

        # Storico
        cur.execute("""
            INSERT INTO ordini_acquisto_storico (oda_id, stato_da, stato_a, nota)
            VALUES (?, NULL, 'bozza', ?)
        """, (oda_id, f"ODA generato automaticamente da BOM ordine {numero_ordine}"))

        # Righe ODA
        for i, art in enumerate(articoli, start=1):
            cur.execute("""
                INSERT INTO ordini_acquisto_righe (
                    oda_id, numero_riga,
                    articolo_id, codice_articolo, descrizione, unita_misura,
                    quantita_ordinata, quantita_ricevuta,
                    prezzo_unitario, sconto_percentuale, aliquota_iva, prezzo_totale,
                    note_riga
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 22, ?, ?)
            """, (
                oda_id, i,
                art.get("articolo_id"),
                art["codice"],
                art["descrizione"],
                art["unita_misura"] or "pz",
                art["quantita"],
                art["costo_unitario"] or 0,
                art["costo_totale"] or 0,
                f"Cod.forn: {art['codice_fornitore']}" if art.get("codice_fornitore") else None,
            ))

        _ricalcola_totali(conn, oda_id)

        creati.append({
            "oda_id":          oda_id,
            "numero_oda":      numero_oda,
            "fornitore_nome":  fn,
            "fornitore_id":    fornitore_id,
            "num_righe":       len(articoli),
            "totale":          round(totale_articoli, 2),
        })

    conn.commit()
    conn.close()

    return {
        "ordine_id":     ordine_id,
        "numero_ordine": numero_ordine,
        "creati":        creati,
        "saltati":       saltati,
        "totale_creati": len(creati),
    }


# ==========================================
# INVIA EMAIL ODA AL FORNITORE
# ==========================================

def _get_smtp_config(conn) -> dict:
    """Legge configurazione SMTP da parametri_sistema."""
    cur = conn.cursor()
    chiavi = [
        "smtp_host", "smtp_port", "smtp_user", "smtp_password",
        "smtp_use_tls", "smtp_mittente", "email_notifiche_attive",
    ]
    cur.execute(
        f"SELECT chiave, valore FROM parametri_sistema WHERE chiave IN ({','.join('?' * len(chiavi))})",
        chiavi
    )
    return {r[0]: r[1] for r in cur.fetchall()}


def _genera_pdf_oda(oda: dict) -> bytes:
    """
    Genera un PDF semplice per l'ODA.
    Usa export_utils se disponibile, altrimenti fallback testuale.
    """
    try:
        from export_utils import genera_pdf_oda as _genera
        return _genera(oda)
    except (ImportError, AttributeError):
        pass

    # Fallback: testo plain convertito a PDF con reportlab se disponibile
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib import colors
        import io

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4)
        styles = getSampleStyleSheet()
        elements = []

        elements.append(Paragraph(f"ORDINE DI ACQUISTO {oda['numero_oda']}", styles["Title"]))
        elements.append(Spacer(1, 12))
        elements.append(Paragraph(f"Fornitore: {oda.get('fornitore_denominazione', '')}", styles["Normal"]))
        elements.append(Paragraph(f"Data: {oda.get('data_emissione', '')}", styles["Normal"]))
        elements.append(Paragraph(f"Commessa: {oda.get('codice_commessa', '')}", styles["Normal"]))
        elements.append(Spacer(1, 12))

        if oda.get("righe"):
            data = [["Codice", "Descrizione", "Qtà", "UM", "P.Unit.", "Totale"]]
            for r in oda["righe"]:
                data.append([
                    r.get("codice_articolo", ""),
                    r.get("descrizione", ""),
                    str(r.get("quantita_ordinata", "")),
                    r.get("unita_misura", "pz"),
                    f"€ {r.get('prezzo_unitario', 0):.2f}",
                    f"€ {r.get('prezzo_totale', 0):.2f}",
                ])
            t = Table(data, colWidths=[70, 200, 40, 40, 70, 70])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
                ("GRID",       (0, 0), (-1, -1), 0.5, colors.black),
                ("FONTSIZE",   (0, 0), (-1, -1), 8),
            ]))
            elements.append(t)
            elements.append(Spacer(1, 12))
            elements.append(Paragraph(
                f"Totale imponibile: € {oda.get('imponibile_totale', 0):.2f}",
                styles["Normal"]
            ))

        if oda.get("note"):
            elements.append(Spacer(1, 8))
            elements.append(Paragraph(f"Note: {oda['note']}", styles["Normal"]))

        doc.build(elements)
        return buf.getvalue()

    except ImportError:
        # Ultimo fallback: testo
        lines = [
            f"ORDINE DI ACQUISTO {oda['numero_oda']}",
            f"Fornitore: {oda.get('fornitore_denominazione', '')}",
            f"Data: {oda.get('data_emissione', '')}",
            f"Commessa: {oda.get('codice_commessa', '')}",
            "",
            "Articoli:",
        ]
        for r in oda.get("righe", []):
            lines.append(
                f"  {r.get('codice_articolo','')} - {r.get('descrizione','')} "
                f"x{r.get('quantita_ordinata','')} {r.get('unita_misura','pz')} "
                f"@ €{r.get('prezzo_unitario',0):.2f} = €{r.get('prezzo_totale',0):.2f}"
            )
        lines.append(f"\nTotale: € {oda.get('imponibile_totale', 0):.2f}")
        return "\n".join(lines).encode("utf-8")


@router.post("/{oda_id}/invia-email")
def invia_email_oda(oda_id: int, payload: dict = Body(default={}), db: Session = Depends(get_db)):
    """
    Invia l'ODA al fornitore via email con PDF allegato.
    Fa transitare l'ODA da bozza → inviato.

    Payload opzionale:
    {
        "note_email": "Testo aggiuntivo nel corpo email",
        "email_override": "altro@fornitore.it",   // sovrascrive email anagrafica
        "inviato_da": "mario.rossi"
    }
    """
    conn = _raw(db)
    cur  = conn.cursor()

    # Carica ODA completo
    cur.execute("SELECT * FROM ordini_acquisto WHERE id = ?", (oda_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "ODA non trovato")
    cols = [d[0] for d in cur.description]
    oda  = dict(zip(cols, row))

    if oda["stato"] not in ("bozza", "inviato"):
        conn.close()
        raise HTTPException(400, f"Non è possibile inviare un ODA in stato '{oda['stato']}'")

    # Carica righe
    cur.execute("""
        SELECT * FROM ordini_acquisto_righe WHERE oda_id = ? ORDER BY numero_riga
    """, (oda_id,))
    r_cols = [d[0] for d in cur.description]
    oda["righe"] = [dict(zip(r_cols, r)) for r in cur.fetchall()]

    # Email destinatario
    email_dest = payload.get("email_override", "").strip()
    if not email_dest and oda.get("fornitore_id"):
        cur.execute("SELECT email, email_cc FROM fornitori WHERE id = ?", (oda["fornitore_id"],))
        f_row = cur.fetchone()
        if f_row:
            email_dest = f_row[0] or ""
            email_cc   = f_row[1] or ""
        else:
            email_cc = ""
    else:
        email_cc = ""

    if not email_dest:
        conn.close()
        raise HTTPException(400, "Nessuna email configurata per questo fornitore. Aggiornare l'anagrafica.")

    # Config SMTP
    smtp_cfg = _get_smtp_config(conn)
    smtp_host = smtp_cfg.get("smtp_host", "").strip()
    if not smtp_host:
        conn.close()
        raise HTTPException(503, "SMTP non configurato. Configurare in Amministrazione → Config Email.")

    smtp_port   = int(smtp_cfg.get("smtp_port", 587))
    smtp_user   = smtp_cfg.get("smtp_user", "")
    smtp_pass   = smtp_cfg.get("smtp_password", "")
    smtp_tls    = smtp_cfg.get("smtp_use_tls", "true").lower() in ("true", "1")
    mittente    = smtp_cfg.get("smtp_mittente") or smtp_user

    # Genera PDF
    try:
        pdf_bytes = _genera_pdf_oda(oda)
        nome_allegato = f"{oda['numero_oda']}.pdf"
        content_type  = "application/pdf"
    except Exception as e:
        logger.warning(f"Errore generazione PDF ODA {oda_id}: {e} — invio testo plain")
        pdf_bytes    = f"Ordine di acquisto {oda['numero_oda']}".encode()
        nome_allegato = f"{oda['numero_oda']}.txt"
        content_type  = "text/plain"

    # Corpo email
    note_email = (payload.get("note_email") or "").strip()
    righe_txt  = "\n".join(
        f"  - {r.get('codice_articolo','')} {r.get('descrizione','')} "
        f"x{r.get('quantita_ordinata','')} {r.get('unita_misura','pz')}"
        for r in oda["righe"]
    )
    corpo = (
        f"Gentili {oda.get('fornitore_denominazione', 'Fornitore')},\n\n"
        f"Vi inviamo in allegato l'ordine di acquisto {oda['numero_oda']}"
        f" relativo alla commessa {oda.get('codice_commessa', '')}.\n\n"
        f"Riepilogo articoli:\n{righe_txt}\n\n"
        f"Totale imponibile: € {oda.get('imponibile_totale', 0):.2f}\n"
    )
    if oda.get("condizioni_pagamento"):
        corpo += f"Condizioni di pagamento: {oda['condizioni_pagamento']}\n"
    if note_email:
        corpo += f"\n{note_email}\n"
    corpo += "\nCordiali saluti,\nElettroquadri S.r.l."

    # Composizione messaggio MIME
    msg = MIMEMultipart()
    msg["From"]    = mittente
    msg["To"]      = email_dest
    if email_cc:
        msg["Cc"]  = email_cc
    msg["Subject"] = f"Ordine di Acquisto {oda['numero_oda']} — {oda.get('codice_commessa', '')}"
    msg.attach(MIMEText(corpo, "plain", "utf-8"))

    allegato = MIMEApplication(pdf_bytes, _subtype=content_type.split("/")[1])
    allegato.add_header("Content-Disposition", "attachment", filename=nome_allegato)
    msg.attach(allegato)

    # Invio
    try:
        if smtp_tls:
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
        if smtp_user and smtp_pass:
            server.login(smtp_user, smtp_pass)
        destinatari = [email_dest] + ([email_cc] if email_cc else [])
        server.sendmail(mittente, destinatari, msg.as_bytes())
        server.quit()
    except Exception as e:
        conn.close()
        logger.error(f"Errore invio email ODA {oda_id}: {e}")
        raise HTTPException(502, f"Errore invio email: {e}")

    # Transizione stato bozza → inviato
    stato_prec = oda["stato"]
    if stato_prec == "bozza":
        cur.execute("""
            UPDATE ordini_acquisto
            SET stato = 'inviato', updated_at = datetime('now')
            WHERE id = ?
        """, (oda_id,))
        cur.execute("""
            INSERT INTO ordini_acquisto_storico (oda_id, stato_da, stato_a, nota, utente)
            VALUES (?, ?, 'inviato', ?, ?)
        """, (
            oda_id, stato_prec,
            f"Email inviata a {email_dest}",
            payload.get("inviato_da"),
        ))
        conn.commit()

    # Notifica interna: ODA inviato
    try:
        smtp_cfg2 = _get_smtp_config(conn)
        dest_int  = smtp_cfg2.get("email_destinatario_oda", "").strip()
        if (dest_int
                and smtp_cfg2.get("email_notifica_oda_inviato", "1") == "1"
                and smtp_cfg2.get("email_notifiche_attive", "0") == "1"):
            from notifiche_email import _invia_smtp as _smtp
            corpo_int = (
                f"<html><body style='font-family:Arial,sans-serif;color:#333;'>"
                f"<h3 style='color:#059669;'>ODA inviato al fornitore</h3>"
                f"<p><strong>{oda['numero_oda']}</strong> inviato a <strong>{email_dest}</strong></p>"
                f"<p>Fornitore: {oda.get('fornitore_denominazione','')}<br>"
                f"Commessa: {oda.get('codice_commessa','')}<br>"
                f"Totale: € {oda.get('imponibile_totale',0):.2f}</p>"
                f"</body></html>"
            )
            _smtp(smtp_cfg2,
                  [dest_int],
                  f"ODA inviato: {oda['numero_oda']} — {oda.get('fornitore_denominazione','')}",
                  corpo_int)
    except Exception as _ne:
        logger.warning(f"Notifica interna ODA inviato fallita: {_ne}")

    conn.close()
    logger.info(f"ODA {oda['numero_oda']} inviato a {email_dest}")
    return {
        "inviato":    True,
        "oda_id":     oda_id,
        "numero_oda": oda["numero_oda"],
        "email_dest": email_dest,
        "stato":      "inviato",
    }


# ==========================================
# FORNITORI CON ODA PENDENTI (per invio batch)
# ==========================================

@router.get("/fornitori-pendenti")
def fornitori_con_oda_pendenti(
    anno:       Optional[int] = None,
    ordine_id:  Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Ritorna i fornitori che hanno almeno un ODA in stato bozza o inviato,
    raggruppati con il totale e la lista degli ODA.
    Usato dalla pagina OrdiniAcquisto per la selezione invio email batch.
    """
    conn = _raw(db)
    cur  = conn.cursor()

    sql = """
        SELECT
            o.fornitore_denominazione,
            o.fornitore_id,
            COALESCE(f.email, '') AS fornitore_email,
            COUNT(o.id)           AS num_oda,
            SUM(o.totale_oda)     AS totale,
            GROUP_CONCAT(o.id)    AS oda_ids,
            GROUP_CONCAT(o.numero_oda) AS numeri_oda,
            GROUP_CONCAT(COALESCE(o.codice_commessa, ''))  AS commesse
        FROM ordini_acquisto o
        LEFT JOIN fornitori f ON f.id = o.fornitore_id
        WHERE o.stato IN ('bozza', 'inviato')
    """
    params = []
    if anno:
        sql += " AND o.anno = ?"
        params.append(anno)
    if ordine_id:
        sql += " AND o.ordine_id = ?"
        params.append(ordine_id)

    sql += " GROUP BY o.fornitore_denominazione ORDER BY o.fornitore_denominazione"
    cur.execute(sql, params)
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]

    # Converti stringhe GROUP_CONCAT in liste
    for r in rows:
        r["oda_ids"]    = [int(x) for x in r["oda_ids"].split(",") if x]
        r["numeri_oda"] = [x for x in r["numeri_oda"].split(",") if x]
        r["commesse"]   = list({x for x in r["commesse"].split(",") if x})
        r["totale"]     = round(r["totale"] or 0, 2)

    conn.close()
    return rows


# ==========================================
# INVIO EMAIL BATCH (multi-fornitore, multi-commessa)
# ==========================================

@router.post("/invia-email-batch")
def invia_email_batch(payload: dict = Body(...), db: Session = Depends(get_db)):
    """
    Invia email a uno o più fornitori selezionati.
    Per ogni fornitore: raccoglie TUTTI i suoi ODA bozza/inviato,
    genera un unico PDF multi-commessa, invia una sola email.

    Payload:
    {
        "fornitori": ["Schneider", "ABB"],   // lista nomi fornitore
        "note_email": "...",                  // testo aggiuntivo opzionale
        "inviato_da": "mario.rossi"
    }
    """
    nomi_fornitori = payload.get("fornitori", [])
    if not nomi_fornitori:
        raise HTTPException(400, "Nessun fornitore selezionato")

    note_email  = (payload.get("note_email") or "").strip()
    inviato_da  = payload.get("inviato_da")

    conn = _raw(db)
    cur  = conn.cursor()

    smtp_cfg  = _get_smtp_config(conn)
    smtp_host = smtp_cfg.get("smtp_host", "").strip()
    if not smtp_host:
        conn.close()
        raise HTTPException(503, "SMTP non configurato. Configurare in Amministrazione → Config Email.")

    smtp_port = int(smtp_cfg.get("smtp_port", 587))
    smtp_user = smtp_cfg.get("smtp_user", "")
    smtp_pass = smtp_cfg.get("smtp_password", "")
    smtp_tls  = smtp_cfg.get("smtp_use_tls", "true").lower() in ("true", "1")
    mittente  = smtp_cfg.get("smtp_mittente") or smtp_user

    risultati = []

    for nome_fornitore in nomi_fornitori:
        # Carica tutti gli ODA pendenti di questo fornitore
        cur.execute("""
            SELECT o.*
            FROM ordini_acquisto o
            WHERE LOWER(o.fornitore_denominazione) = LOWER(?)
              AND o.stato IN ('bozza', 'inviato')
            ORDER BY o.codice_commessa, o.numero_oda
        """, (nome_fornitore,))
        oda_cols = [d[0] for d in cur.description]
        oda_list = [dict(zip(oda_cols, r)) for r in cur.fetchall()]

        if not oda_list:
            risultati.append({"fornitore": nome_fornitore, "ok": False, "errore": "Nessun ODA pendente"})
            continue

        # Per ogni ODA carica le righe
        for oda in oda_list:
            cur.execute("""
                SELECT * FROM ordini_acquisto_righe WHERE oda_id = ? ORDER BY numero_riga
            """, (oda["id"],))
            r_cols   = [d[0] for d in cur.description]
            oda["righe"] = [dict(zip(r_cols, r)) for r in cur.fetchall()]

        # Email destinatario dall'anagrafica fornitore
        fornitore_id = oda_list[0].get("fornitore_id")
        email_dest = ""
        email_cc   = ""
        if fornitore_id:
            cur.execute("SELECT email, email_cc FROM fornitori WHERE id = ?", (fornitore_id,))
            f_row = cur.fetchone()
            if f_row:
                email_dest = f_row[0] or ""
                email_cc   = f_row[1] or ""

        if not email_dest:
            risultati.append({
                "fornitore": nome_fornitore,
                "ok":        False,
                "errore":    "Email fornitore non configurata — aggiornare anagrafica",
            })
            continue

        # Genera PDF unico multi-commessa
        try:
            pdf_bytes = _genera_pdf_multi_oda(oda_list)
            numeri    = ", ".join(o["numero_oda"] for o in oda_list)
            nome_allegato = f"ODA_{nome_fornitore.replace(' ', '_')}_{numeri[:40]}.pdf"
        except Exception as e:
            logger.warning(f"Errore PDF multi-ODA per {nome_fornitore}: {e}")
            pdf_bytes     = f"Ordini di acquisto: {', '.join(o['numero_oda'] for o in oda_list)}".encode()
            nome_allegato = f"ODA_{nome_fornitore[:30]}.txt"

        # Commesse distinte
        commesse = list({o.get("codice_commessa", "") for o in oda_list if o.get("codice_commessa")})
        numeri_oda_txt = "\n".join(
            f"  • {o['numero_oda']} — commessa {o.get('codice_commessa','N/D')} — {fmt(o.get('totale_oda') or 0)}"
            for o in oda_list
        )
        totale_batch = sum(o.get("totale_oda") or 0 for o in oda_list)

        corpo = (
            f"Gentili {nome_fornitore},\n\n"
            f"Vi inviamo in allegato {'l\'ordine di acquisto' if len(oda_list) == 1 else 'gli ordini di acquisto'}:\n\n"
            f"{numeri_oda_txt}\n\n"
            f"Totale complessivo: € {totale_batch:.2f}\n"
        )
        if oda_list[0].get("condizioni_pagamento"):
            corpo += f"Condizioni di pagamento: {oda_list[0]['condizioni_pagamento']}\n"
        if note_email:
            corpo += f"\n{note_email}\n"
        corpo += "\nCordiali saluti,\nElettroquadri S.r.l."

        msg            = MIMEMultipart()
        msg["From"]    = mittente
        msg["To"]      = email_dest
        if email_cc:
            msg["Cc"]  = email_cc
        soggetto_commesse = f" — commesse {', '.join(commesse)}" if commesse else ""
        msg["Subject"] = f"Ordini di Acquisto {nome_fornitore}{soggetto_commesse}"
        msg.attach(MIMEText(corpo, "plain", "utf-8"))
        allegato = MIMEApplication(pdf_bytes, _subtype="pdf")
        allegato.add_header("Content-Disposition", "attachment", filename=nome_allegato)
        msg.attach(allegato)

        try:
            if smtp_tls:
                server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
                server.starttls()
            else:
                server = smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15)
            if smtp_user and smtp_pass:
                server.login(smtp_user, smtp_pass)
            destinatari = [email_dest] + ([email_cc] if email_cc else [])
            server.sendmail(mittente, destinatari, msg.as_bytes())
            server.quit()
        except Exception as e:
            risultati.append({"fornitore": nome_fornitore, "ok": False, "errore": str(e)})
            continue

        # Transiziona tutti gli ODA bozza → inviato
        for oda in oda_list:
            if oda["stato"] == "bozza":
                cur.execute("""
                    UPDATE ordini_acquisto SET stato='inviato', updated_at=datetime('now')
                    WHERE id=?
                """, (oda["id"],))
                cur.execute("""
                    INSERT INTO ordini_acquisto_storico (oda_id, stato_da, stato_a, nota, utente)
                    VALUES (?, 'bozza', 'inviato', ?, ?)
                """, (oda["id"], f"Email batch inviata a {email_dest}", inviato_da))

        conn.commit()
        logger.info(f"Email batch ODA inviata a {email_dest} ({nome_fornitore}): {[o['numero_oda'] for o in oda_list]}")
        risultati.append({
            "fornitore":  nome_fornitore,
            "ok":         True,
            "email_dest": email_dest,
            "num_oda":    len(oda_list),
            "oda":        [o["numero_oda"] for o in oda_list],
        })

    conn.close()
    ok    = [r for r in risultati if r["ok"]]
    errori = [r for r in risultati if not r["ok"]]
    return {
        "inviati":     len(ok),
        "errori":      len(errori),
        "risultati":   risultati,
    }


def _genera_pdf_multi_oda(oda_list: list) -> bytes:
    """
    Genera un PDF unico contenente tutti gli ODA passati.
    Ogni ODA è una sezione separata con intestazione commessa.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import (SimpleDocTemplate, Paragraph, Table,
                                        TableStyle, Spacer, HRFlowable, PageBreak)
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib import colors
        from reportlab.lib.units import mm
        import io

        buf    = io.BytesIO()
        styles = getSampleStyleSheet()
        bold   = ParagraphStyle("bold", parent=styles["Normal"], fontName="Helvetica-Bold")
        small  = ParagraphStyle("small", parent=styles["Normal"], fontSize=8)

        elements = []
        fornitore_nome = oda_list[0].get("fornitore_denominazione", "")

        # Intestazione documento
        elements.append(Paragraph(f"ELETTROQUADRI S.r.l.", bold))
        elements.append(Paragraph(f"Ordini di Acquisto — {fornitore_nome}", styles["Title"]))
        elements.append(Paragraph(
            f"Riepilogo: {len(oda_list)} ODA — "
            f"Totale € {sum(o.get('totale_oda') or 0 for o in oda_list):.2f}",
            styles["Normal"]
        ))
        elements.append(Spacer(1, 8*mm))

        for idx, oda in enumerate(oda_list):
            if idx > 0:
                elements.append(PageBreak())

            # Intestazione ODA
            elements.append(Paragraph(
                f"ORDINE DI ACQUISTO N. {oda['numero_oda']}",
                bold
            ))
            elements.append(Spacer(1, 3*mm))

            # Dati testata
            testata = [
                ["Commessa:", oda.get("codice_commessa") or "—",
                 "Data emissione:", oda.get("data_emissione") or "—"],
                ["Fornitore:", oda.get("fornitore_denominazione") or "—",
                 "Consegna richiesta:", oda.get("data_consegna_richiesta") or "—"],
            ]
            if oda.get("condizioni_pagamento"):
                testata.append(["Cond. pagamento:", oda["condizioni_pagamento"], "", ""])

            t_head = Table(testata, colWidths=[40*mm, 70*mm, 40*mm, 40*mm])
            t_head.setStyle(TableStyle([
                ("FONTNAME",  (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME",  (2, 0), (2, -1), "Helvetica-Bold"),
                ("FONTSIZE",  (0, 0), (-1, -1), 9),
                ("VALIGN",    (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            elements.append(t_head)
            elements.append(Spacer(1, 5*mm))

            # Righe ODA
            if oda.get("righe"):
                data_tab = [["#", "Codice", "Descrizione", "Qtà", "UM", "P.Unit.", "Totale"]]
                for r in oda["righe"]:
                    data_tab.append([
                        str(r.get("numero_riga", "")),
                        r.get("codice_articolo", ""),
                        r.get("descrizione", ""),
                        str(r.get("quantita_ordinata", "")),
                        r.get("unita_misura", "pz"),
                        f"€ {r.get('prezzo_unitario', 0):.2f}",
                        f"€ {r.get('prezzo_totale', 0):.2f}",
                    ])

                t_righe = Table(data_tab, colWidths=[10*mm, 28*mm, 68*mm, 15*mm, 12*mm, 22*mm, 22*mm])
                t_righe.setStyle(TableStyle([
                    ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#1e40af")),
                    ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
                    ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
                    ("FONTSIZE",      (0, 0), (-1, -1), 8),
                    ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
                    ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
                    ("ALIGN",         (3, 0), (-1, -1), "RIGHT"),
                    ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]))
                elements.append(t_righe)
                elements.append(Spacer(1, 3*mm))

                # Totale ODA
                totale_tab = Table(
                    [["", "", "", "", "", "TOTALE IMPONIBILE", f"€ {oda.get('imponibile_totale', 0):.2f}"]],
                    colWidths=[10*mm, 28*mm, 68*mm, 15*mm, 12*mm, 22*mm, 22*mm]
                )
                totale_tab.setStyle(TableStyle([
                    ("FONTNAME",  (5, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE",  (0, 0), (-1, 0), 9),
                    ("ALIGN",     (5, 0), (-1, 0), "RIGHT"),
                    ("LINEABOVE", (5, 0), (-1, 0), 0.8, colors.black),
                ]))
                elements.append(totale_tab)

            if oda.get("note"):
                elements.append(Spacer(1, 3*mm))
                elements.append(Paragraph(f"Note: {oda['note']}", small))

        doc = SimpleDocTemplate(
            buf, pagesize=A4,
            leftMargin=15*mm, rightMargin=15*mm,
            topMargin=15*mm, bottomMargin=15*mm
        )
        doc.build(elements)
        return buf.getvalue()

    except ImportError:
        # Fallback testo
        lines = []
        for oda in oda_list:
            lines += [
                f"ODA {oda['numero_oda']} — Commessa {oda.get('codice_commessa','N/D')}",
                f"Fornitore: {oda.get('fornitore_denominazione','')}",
                "",
            ]
            for r in oda.get("righe", []):
                lines.append(
                    f"  {r.get('codice_articolo','')} {r.get('descrizione','')} "
                    f"x{r.get('quantita_ordinata','')} = €{r.get('prezzo_totale',0):.2f}"
                )
            lines += [f"Totale: €{oda.get('imponibile_totale',0):.2f}", "---", ""]
        return "\n".join(lines).encode("utf-8")


# ==========================================
# STATISTICHE
# ==========================================

