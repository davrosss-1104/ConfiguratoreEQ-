"""
fatture_passive_api.py - API REST per fatture passive (ricevute)
================================================================
Router FastAPI separato. Includere in main.py con:

    from fatture_passive_api import router as passive_router
    passive_router.dependencies.append(Depends(richiedi_modulo("fatturazione")))
    app.include_router(passive_router)
"""

import base64
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import io

from database import SessionLocal
from fatturazione_models import Fattura, RigaFattura
from fatture_passive_xml import parse_fattura_pa, data_iso
from fatturazione_provider import get_sdi_provider

logger = logging.getLogger("fatturazione.passive")

router = APIRouter(prefix="/fatturazione/passive", tags=["Fatture Passive"])


# ==========================================
# HELPERS
# ==========================================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _raw(db: Session):
    return db.get_bind().raw_connection()


def _get_config_dict(db: Session) -> dict:
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("SELECT * FROM fe_configurazione LIMIT 1")
    row = cur.fetchone()
    conn.close()
    if not row:
        return {}
    cols = [d[0] for d in cur.description]
    return dict(zip(cols, row))


STATI_LAVORAZIONE = ["da_verificare", "verificata", "approvata", "registrata", "pagata"]

TIPO_DOC_LABELS = {
    "TD01": "Fattura",
    "TD04": "Nota di credito",
    "TD05": "Nota di debito",
    "TD06": "Parcella",
    "TD16": "Integrazione RC interno",
    "TD17": "Autofattura servizi estero",
    "TD20": "Autofattura",
    "TD24": "Fattura differita",
}


# ==========================================
# LISTA FATTURE PASSIVE
# ==========================================

@router.get("")
def lista_passive(
    q:              Optional[str] = None,
    stato:          Optional[str] = None,
    fornitore_id:   Optional[int] = None,
    anno:           Optional[int] = None,
    da_registrare:  bool = False,
    da_pagare:      bool = False,
    scadute:        bool = False,
    page:           int  = 1,
    limit:          int  = 50,
    db: Session = Depends(get_db),
):
    conn = _raw(db)
    cur = conn.cursor()

    conds = ["f.direzione = 'passiva'"]
    params: list = []

    if q:
        conds.append("(f.fornitore_denominazione LIKE ? OR f.numero_fattura_fornitore LIKE ? OR f.numero_fattura LIKE ?)")
        params += [f"%{q}%"] * 3
    if stato:
        conds.append("f.stato_lavorazione = ?")
        params.append(stato)
    if fornitore_id:
        conds.append("f.fornitore_id = ?")
        params.append(fornitore_id)
    if anno:
        conds.append("f.anno = ?")
        params.append(anno)
    if da_registrare:
        conds.append("f.registrata = 0 AND f.stato_lavorazione IN ('approvata', 'verificata')")
    if da_pagare:
        conds.append("f.stato_lavorazione = 'registrata'")
    if scadute:
        conds.append("f.scadenza_pagamento IS NOT NULL AND f.scadenza_pagamento < datetime('now') AND f.stato_lavorazione != 'pagata'")

    where = " AND ".join(conds)
    offset = (page - 1) * limit

    cur.execute(f"SELECT COUNT(*) FROM fe_fatture f WHERE {where}", params)
    totale = cur.fetchone()[0]

    cur.execute(f"""
        SELECT
            f.id, f.numero_fattura, f.numero_fattura_fornitore, f.anno,
            f.tipo_documento, f.stato_sdi, f.stato_lavorazione,
            f.fornitore_denominazione, f.fornitore_partita_iva, f.fornitore_id,
            f.data_fattura, f.data_fattura_fornitore, f.data_ricezione,
            f.scadenza_pagamento, f.pagata_at,
            f.imponibile_totale, f.iva_totale, f.totale_fattura,
            f.registrata, f.note_lavorazione,
            f.xml_ricevuto_filename,
            f.created_at
        FROM fe_fatture f
        WHERE {where}
        ORDER BY f.data_ricezione DESC, f.id DESC
        LIMIT ? OFFSET ?
    """, params + [limit, offset])

    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, row)) for row in cur.fetchall()]
    conn.close()

    return {
        "totale": totale,
        "page": page,
        "limit": limit,
        "fatture": rows,
    }


# ==========================================
# IMPORT XML MANUALE
# ==========================================

@router.post("/importa-xml")
async def importa_xml(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Carica un file XML FatturaPA e lo importa come fattura passiva."""
    contenuto = await file.read()

    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            xml_str = contenuto.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        raise HTTPException(400, "Impossibile decodificare il file XML")

    dati = parse_fattura_pa(xml_str)
    if dati["errori"] and not dati.get("documento"):
        raise HTTPException(400, f"XML non valido: {'; '.join(dati['errori'])}")

    return _crea_da_parsed(dati, xml_str, file.filename or "fattura.xml", db)


@router.post("/importa-xml-base64")
def importa_xml_base64(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    """Importa XML ricevuto in formato base64 (per webhook SDI)."""
    xml_b64 = payload.get("xml_base64") or payload.get("xml")
    filename = payload.get("filename", "fattura.xml")

    if not xml_b64:
        raise HTTPException(400, "Campo xml_base64 obbligatorio")

    try:
        xml_bytes = base64.b64decode(xml_b64)
        xml_str = xml_bytes.decode("utf-8-sig")
    except Exception as e:
        raise HTTPException(400, f"Base64 non valido: {e}")

    dati = parse_fattura_pa(xml_str)
    return _crea_da_parsed(dati, xml_str, filename, db)


def _crea_da_parsed(dati: dict, xml_str: str, filename: str, db: Session) -> dict:
    """Crea record fe_fatture + righe da dati parsati."""
    conn = _raw(db)
    cur = conn.cursor()

    fornitore  = dati.get("fornitore", {})
    documento  = dati.get("documento", {})
    righe      = dati.get("righe", [])
    totali     = dati.get("totali", {})
    pagamento  = dati.get("pagamento", {})

    # Cerca fornitore in anagrafica
    fornitore_id = None
    piva = fornitore.get("partita_iva")
    if piva:
        cur.execute("SELECT id FROM fornitori WHERE partita_iva = ?", (piva,))
        row = cur.fetchone()
        if row:
            fornitore_id = row[0]

    # Scadenza pagamento (primo dettaglio pagamento)
    scadenza_pag = None
    if pagamento.get("dettagli"):
        scadenza_pag = pagamento["dettagli"][0].get("data_scadenza")

    # Controlla duplicato (stesso filename o stesso numero fattura fornitore + p.iva)
    if filename:
        cur.execute(
            "SELECT id FROM fe_fatture WHERE xml_ricevuto_filename = ? AND direzione = 'passiva'",
            (filename,)
        )
        existing = cur.fetchone()
        if existing:
            conn.close()
            return {
                "status": "duplicato",
                "id": existing[0],
                "messaggio": "Fattura già importata (filename duplicato)",
            }

    anno_doc = None
    data_doc_str = documento.get("data")
    if data_doc_str:
        try:
            anno_doc = int(data_doc_str[:4])
        except Exception:
            pass

    cur.execute("""
        INSERT INTO fe_fatture (
            direzione, tipo_documento, anno,
            fornitore_denominazione, fornitore_partita_iva, fornitore_codice_fiscale,
            fornitore_indirizzo, fornitore_cap, fornitore_comune,
            fornitore_provincia, fornitore_nazione, fornitore_pec, fornitore_id,
            numero_fattura_fornitore, data_fattura_fornitore,
            data_ricezione,
            imponibile_totale, iva_totale, totale_fattura,
            condizioni_pagamento, modalita_pagamento, scadenza_pagamento,
            stato_sdi, stato_lavorazione,
            xml_ricevuto, xml_ricevuto_filename,
            created_at, updated_at
        ) VALUES (
            'passiva', ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?,
            datetime('now'),
            ?, ?, ?,
            ?, ?, ?,
            'ricevuta', 'da_verificare',
            ?, ?,
            datetime('now'), datetime('now')
        )
    """, (
        documento.get("tipo_documento", "TD01"),
        anno_doc or datetime.now().year,
        fornitore.get("denominazione"),
        piva,
        fornitore.get("codice_fiscale"),
        fornitore.get("indirizzo"),
        fornitore.get("cap"),
        fornitore.get("comune"),
        fornitore.get("provincia"),
        fornitore.get("nazione", "IT"),
        fornitore.get("pec"),
        fornitore_id,
        documento.get("numero"),
        data_iso(data_doc_str),
        totali.get("imponibile_totale", 0.0),
        totali.get("iva_totale", 0.0),
        totali.get("totale_documento", 0.0),
        pagamento.get("condizioni"),
        pagamento["dettagli"][0].get("modalita") if pagamento.get("dettagli") else None,
        data_iso(scadenza_pag),
        xml_str,
        filename,
    ))
    fattura_id = cur.lastrowid

    # Inserisci righe
    for riga in righe:
        cur.execute("""
            INSERT INTO fe_righe_fattura (
                fattura_id, numero_riga, codice_tipo, codice_valore,
                descrizione, quantita, unita_misura,
                prezzo_unitario, prezzo_totale,
                aliquota_iva, natura, ritenuta,
                sconto_percentuale
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            fattura_id,
            riga.get("numero_riga", 0),
            riga.get("codice_tipo"),
            riga.get("codice_valore"),
            riga.get("descrizione", ""),
            riga.get("quantita", 1.0),
            riga.get("unita_misura"),
            riga.get("prezzo_unitario", 0.0),
            riga.get("prezzo_totale", 0.0),
            riga.get("aliquota_iva", 0.0),
            riga.get("natura"),
            1 if riga.get("ritenuta") == "SI" else 0,
            riga.get("sconto_percentuale", 0.0),
        ))

    # Storico
    cur.execute("""
        INSERT INTO fe_passive_storico (fattura_id, stato_da, stato_a, nota)
        VALUES (?, NULL, 'da_verificare', 'Importata via XML')
    """, (fattura_id,))

    conn.commit()
    conn.close()

    return {
        "status": "importata",
        "id": fattura_id,
        "fornitore": fornitore.get("denominazione"),
        "numero_fornitore": documento.get("numero"),
        "totale": totali.get("totale_documento", 0.0),
        "avvisi": dati.get("errori", []),
    }


# ==========================================
# SINCRONIZZA DAL PROVIDER SDI
# ==========================================

@router.post("/sincronizza")
def sincronizza_da_sdi(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
):
    """
    Recupera fatture passive dal provider SDI (es. Aruba) e le importa.
    """
    config_dict = _get_config_dict(db)
    if not config_dict:
        raise HTTPException(500, "Configurazione fatturazione non trovata")

    if config_dict.get("sdi_password_encrypted"):
        try:
            config_dict["sdi_password"] = base64.b64decode(
                config_dict["sdi_password_encrypted"]
            ).decode()
        except Exception:
            config_dict["sdi_password"] = ""

    date_from = payload.get("date_from") or (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    date_to   = payload.get("date_to")   or datetime.now().strftime("%Y-%m-%d")

    provider = get_sdi_provider(config_dict)
    result = provider.search_received_invoices(date_from=date_from, date_to=date_to)

    if not result["success"]:
        raise HTTPException(500, result.get("error", "Errore recupero fatture dal provider"))

    importate   = 0
    duplicate   = 0
    errori_list = []

    for inv in result.get("invoices", []):
        filename = inv.get("filename") or inv.get("sdi_filename")

        xml_str = inv.get("xml_content") or inv.get("xml")

        if not xml_str and filename:
            try:
                xml_result = provider.download_invoice_xml(filename)
                xml_str = xml_result.get("xml_content")
            except Exception:
                pass

        if xml_str:
            dati = parse_fattura_pa(xml_str)
            res = _crea_da_parsed(dati, xml_str, filename or "", db)
            if res["status"] == "importata":
                importate += 1
            elif res["status"] == "duplicato":
                duplicate += 1
        else:
            conn = _raw(db)
            cur = conn.cursor()
            cur.execute(
                "SELECT id FROM fe_fatture WHERE sdi_filename = ? AND direzione = 'passiva'",
                (filename,)
            )
            if cur.fetchone():
                conn.close()
                duplicate += 1
                continue

            cur.execute("""
                INSERT INTO fe_fatture (
                    direzione, tipo_documento, anno,
                    fornitore_denominazione, stato_sdi, stato_lavorazione,
                    sdi_filename, sdi_identificativo,
                    data_ricezione, created_at, updated_at
                ) VALUES ('passiva','TD01', ?, ?, 'ricevuta', 'da_verificare', ?, ?, datetime('now'), datetime('now'), datetime('now'))
            """, (
                datetime.now().year,
                inv.get("cedente") or inv.get("fornitore"),
                filename,
                inv.get("id_sdi"),
            ))
            conn.commit()
            conn.close()
            importate += 1

    return {
        "importate":   importate,
        "duplicate":   duplicate,
        "errori":      errori_list,
        "totale_sdi":  len(result.get("invoices", [])),
    }


# ==========================================
# FORNITORI ANAGRAFICA
# ==========================================

@router.get("/fornitori/lista")
def lista_fornitori(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    conn = _raw(db)
    cur = conn.cursor()
    if q:
        cur.execute(
            "SELECT * FROM fornitori WHERE (denominazione LIKE ? OR ragione_sociale LIKE ? OR partita_iva LIKE ?) ORDER BY COALESCE(ragione_sociale, denominazione)",
            (f"%{q}%", f"%{q}%", f"%{q}%")
        )
    else:
        cur.execute("SELECT * FROM fornitori WHERE attivo = 1 ORDER BY COALESCE(ragione_sociale, denominazione)")
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/fornitori")
def crea_fornitore(payload: dict = Body(...), db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO fornitori (
            denominazione, ragione_sociale, partita_iva, codice_fiscale,
            indirizzo, cap, comune, provincia, nazione, paese,
            pec, codice_sdi, iban, note
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        payload.get("denominazione"),
        payload.get("denominazione"),  # ragione_sociale = denominazione
        payload.get("partita_iva"),
        payload.get("codice_fiscale"),
        payload.get("indirizzo"),
        payload.get("cap"),
        payload.get("comune"),
        payload.get("provincia"),
        payload.get("nazione", "IT"),
        payload.get("nazione", "IT"),  # paese = nazione
        payload.get("pec"),
        payload.get("codice_sdi"),
        payload.get("iban"),
        payload.get("note"),
    ))
    conn.commit()
    fid = cur.lastrowid
    conn.close()
    return {"id": fid}


@router.put("/fornitori/{fornitore_id}")
def aggiorna_fornitore(fornitore_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    campi = {k: v for k, v in payload.items() if k in {
        "denominazione","ragione_sociale","partita_iva","codice_fiscale","indirizzo",
        "cap","comune","provincia","nazione","paese","pec","codice_sdi","iban","note","attivo"
    }}
    if not campi:
        raise HTTPException(400, "Nessun campo aggiornabile")
    # Mantieni ragione_sociale e denominazione in sync
    if "denominazione" in campi and "ragione_sociale" not in campi:
        campi["ragione_sociale"] = campi["denominazione"]
    elif "ragione_sociale" in campi and "denominazione" not in campi:
        campi["denominazione"] = campi["ragione_sociale"]
    set_cl = ", ".join(f"{k} = ?" for k in campi)
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute(
        f"UPDATE fornitori SET {set_cl}, updated_at = datetime('now') WHERE id = ?",
        list(campi.values()) + [fornitore_id]
    )
    conn.commit()
    conn.close()
    return {"id": fornitore_id}


# ==========================================
# STATISTICHE PASSIVE
# ==========================================

@router.get("/statistiche")
def statistiche_passive(anno: Optional[int] = None, db: Session = Depends(get_db)):
    if not anno:
        anno = datetime.now().year
    conn = _raw(db)
    cur = conn.cursor()

    cur.execute("""
        SELECT stato_lavorazione, COUNT(*), SUM(totale_fattura)
        FROM fe_fatture
        WHERE direzione = 'passiva' AND anno = ?
        GROUP BY stato_lavorazione
    """, (anno,))
    per_stato = {r[0]: {"count": r[1], "totale": round(r[2] or 0, 2)} for r in cur.fetchall()}

    cur.execute("""
        SELECT COUNT(*), SUM(totale_fattura) FROM fe_fatture
        WHERE direzione = 'passiva' AND anno = ?
    """, (anno,))
    row = cur.fetchone()
    totale_count = row[0] or 0
    totale_importo = round(row[1] or 0, 2)

    cur.execute("""
        SELECT COUNT(*) FROM fe_fatture
        WHERE direzione = 'passiva'
        AND scadenza_pagamento IS NOT NULL
        AND scadenza_pagamento < datetime('now')
        AND stato_lavorazione != 'pagata'
    """)
    scadute = cur.fetchone()[0]

    cur.execute("""
        SELECT fornitore_denominazione, COUNT(*), SUM(totale_fattura)
        FROM fe_fatture
        WHERE direzione = 'passiva' AND anno = ?
        GROUP BY fornitore_denominazione
        ORDER BY SUM(totale_fattura) DESC
        LIMIT 10
    """, (anno,))
    per_fornitore = [
        {"denominazione": r[0], "count": r[1], "totale": round(r[2] or 0, 2)}
        for r in cur.fetchall()
    ]

    conn.close()
    return {
        "anno":          anno,
        "totale_count":  totale_count,
        "totale_importo":totale_importo,
        "per_stato":     per_stato,
        "scadute":       scadute,
        "per_fornitore": per_fornitore,
    }


# ==========================================
# DETTAGLIO FATTURA PASSIVA
# ==========================================

@router.get("/{fattura_id}")
def get_passiva(fattura_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()

    cur.execute("SELECT * FROM fe_fatture WHERE id = ? AND direzione = 'passiva'", (fattura_id,))
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Fattura passiva non trovata")

    cols = [d[0] for d in cur.description]
    fattura = dict(zip(cols, row))

    # Righe
    cur.execute("""
        SELECT * FROM fe_righe_fattura WHERE fattura_id = ? ORDER BY numero_riga
    """, (fattura_id,))
    r_cols = [d[0] for d in cur.description]
    fattura["righe"] = [dict(zip(r_cols, r)) for r in cur.fetchall()]

    # Storico lavorazione
    cur.execute("""
        SELECT * FROM fe_passive_storico WHERE fattura_id = ? ORDER BY created_at DESC
    """, (fattura_id,))
    s_cols = [d[0] for d in cur.description]
    fattura["storico"] = [dict(zip(s_cols, r)) for r in cur.fetchall()]

    conn.close()
    return fattura


# ==========================================
# AGGIORNA STATO LAVORAZIONE
# ==========================================

@router.post("/{fattura_id}/transizione")
def transizione_stato(
    fattura_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    stato_nuovo = payload.get("stato")
    nota = payload.get("nota")
    utente = payload.get("utente")

    if stato_nuovo not in STATI_LAVORAZIONE:
        raise HTTPException(400, f"Stato non valido. Valori ammessi: {STATI_LAVORAZIONE}")

    conn = _raw(db)
    cur = conn.cursor()

    cur.execute(
        "SELECT id, stato_lavorazione FROM fe_fatture WHERE id = ? AND direzione = 'passiva'",
        (fattura_id,)
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Fattura non trovata")

    stato_corrente = row[1]

    extra_sql = ""
    extra_params: list = []

    if stato_nuovo == "registrata":
        extra_sql = ", registrata = 1"
    if stato_nuovo == "pagata":
        extra_sql = ", pagata_at = datetime('now')"
    if stato_nuovo == "approvata":
        extra_sql = f", approvata_da = ?, approvata_at = datetime('now')"
        extra_params = [utente or "utente"]

    cur.execute(f"""
        UPDATE fe_fatture
        SET stato_lavorazione = ?, updated_at = datetime('now') {extra_sql}
        WHERE id = ?
    """, [stato_nuovo] + extra_params + [fattura_id])

    cur.execute("""
        INSERT INTO fe_passive_storico (fattura_id, stato_da, stato_a, nota, utente)
        VALUES (?, ?, ?, ?, ?)
    """, (fattura_id, stato_corrente, stato_nuovo, nota, utente))

    conn.commit()
    conn.close()

    return {"id": fattura_id, "stato_lavorazione": stato_nuovo}


# ==========================================
# AGGIORNA CAMPI LIBERI
# ==========================================

@router.put("/{fattura_id}")
def aggiorna_passiva(
    fattura_id: int,
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    """Aggiorna campi editabili: note, scadenza, fornitore_id, ordine_acquisto_numero."""
    campi_ammessi = {
        "note_lavorazione", "scadenza_pagamento",
        "fornitore_id", "ordine_acquisto_numero", "ordine_acquisto_id",
        "numero_fattura",
    }
    aggiornamenti = {k: v for k, v in payload.items() if k in campi_ammessi}
    if not aggiornamenti:
        raise HTTPException(400, "Nessun campo aggiornabile nel payload")

    set_clause = ", ".join(f"{k} = ?" for k in aggiornamenti)
    values = list(aggiornamenti.values()) + [fattura_id]

    conn = _raw(db)
    cur = conn.cursor()
    cur.execute(
        f"UPDATE fe_fatture SET {set_clause}, updated_at = datetime('now') WHERE id = ? AND direzione = 'passiva'",
        values
    )
    conn.commit()
    conn.close()
    return {"id": fattura_id, "aggiornato": list(aggiornamenti.keys())}


# ==========================================
# DOWNLOAD XML RICEVUTO
# ==========================================

@router.get("/{fattura_id}/xml")
def download_xml_ricevuto(fattura_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    cur = conn.cursor()
    cur.execute(
        "SELECT xml_ricevuto, xml_ricevuto_filename FROM fe_fatture WHERE id = ? AND direzione = 'passiva'",
        (fattura_id,)
    )
    row = cur.fetchone()
    conn.close()
    if not row or not row[0]:
        raise HTTPException(404, "XML non disponibile")

    return StreamingResponse(
        io.BytesIO(row[0].encode("utf-8")),
        media_type="application/xml",
        headers={
            "Content-Disposition": f"attachment; filename={row[1] or 'fattura.xml'}"
        }
    )
