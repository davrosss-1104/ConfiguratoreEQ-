"""
fatturazione_api.py - API REST per il modulo Fatturazione Elettronica

Router FastAPI da includere in main.py con:
    from fatturazione_api import router as fatturazione_router
    app.include_router(fatturazione_router)
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, desc
from typing import Optional, List
from datetime import datetime, timedelta
import json
import io
import base64
import logging

from database import SessionLocal
from fatturazione_models import (
    ConfigurazioneFatturazione, NumerazioneFatture, Fattura, RigaFattura,
    AllegatoFattura, NotificaSDI, RegistroIVA,
    TIPI_DOCUMENTO, REGIMI_FISCALI, MODALITA_PAGAMENTO, NATURE_IVA,
    TIPI_CASSA
)
from fatturazione_xml import (
    FatturaPAGenerator, calcola_totali_fattura, valida_fattura_base
)
from fatturazione_provider import get_sdi_provider

logger = logging.getLogger("fatturazione.api")

router = APIRouter(prefix="/fatturazione", tags=["Fatturazione Elettronica"])


# ==========================================
# DEPENDENCY
# ==========================================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _orm_to_dict(obj):
    if obj is None:
        return None
    if hasattr(obj, '__table__'):
        row = {}
        for col in obj.__table__.columns:
            val = getattr(obj, col.name, None)
            if hasattr(val, 'isoformat'):
                val = val.isoformat()
            row[col.name] = val
        return row
    return obj


def _get_config(db: Session) -> ConfigurazioneFatturazione:
    """Recupera configurazione fatturazione (crea default se non esiste)"""
    config = db.query(ConfigurazioneFatturazione).first()
    if not config:
        config = ConfigurazioneFatturazione(
            denominazione="Azienda S.r.l.",
            partita_iva="00000000000",
            regime_fiscale="RF01",
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


# ==========================================
# LOOKUP / ENUMERAZIONI
# ==========================================

@router.get("/lookup/tipi-documento")
async def get_tipi_documento():
    return TIPI_DOCUMENTO

@router.get("/lookup/regimi-fiscali")
async def get_regimi_fiscali():
    return REGIMI_FISCALI

@router.get("/lookup/modalita-pagamento")
async def get_modalita_pagamento():
    return MODALITA_PAGAMENTO

@router.get("/lookup/nature-iva")
async def get_nature_iva():
    return NATURE_IVA

@router.get("/lookup/tipi-cassa")
async def get_tipi_cassa():
    return TIPI_CASSA


# ==========================================
# CONFIGURAZIONE
# ==========================================

@router.get("/configurazione")
async def get_configurazione(db: Session = Depends(get_db)):
    config = _get_config(db)
    data = _orm_to_dict(config)
    # Non esporre password
    if data.get("sdi_password_encrypted"):
        data["sdi_password_encrypted"] = "***"
    return data


@router.put("/configurazione")
async def update_configurazione(payload: dict = Body(...), db: Session = Depends(get_db)):
    config = _get_config(db)

    # Campi aggiornabili
    updatable = [
        "denominazione", "partita_iva", "codice_fiscale", "regime_fiscale",
        "indirizzo", "numero_civico", "cap", "comune", "provincia", "nazione",
        "telefono", "email", "pec",
        "rea_ufficio", "rea_numero", "rea_capitale_sociale", "rea_socio_unico",
        "rea_stato_liquidazione",
        "codice_destinatario_default", "id_paese_trasmittente", "id_codice_trasmittente",
        "formato_trasmissione",
        "sdi_provider", "sdi_username", "sdi_ambiente", "sdi_codice_destinatario_ricezione",
        "aliquota_iva_default", "esigibilita_iva_default", "natura_iva_default",
        "ritenuta_tipo_default", "ritenuta_aliquota_default", "ritenuta_causale_default",
        "cassa_tipo_default", "cassa_aliquota_default", "cassa_imponibile_tipo", "cassa_ritenuta",
        "bollo_virtuale_soglia", "bollo_virtuale_importo",
        "condizioni_pagamento_default", "modalita_pagamento_default",
        "iban", "bic", "istituto_finanziario",
    ]

    for key in updatable:
        if key in payload:
            setattr(config, key, payload[key])

    # Password SDI — se fornita, cripta e salva
    if "sdi_password" in payload and payload["sdi_password"] and payload["sdi_password"] != "***":
        # In produzione usare Fernet o simile; qui base64 come placeholder
        config.sdi_password_encrypted = base64.b64encode(
            payload["sdi_password"].encode()
        ).decode()

    db.commit()
    db.refresh(config)
    return {"status": "ok", "id": config.id}


@router.post("/configurazione/test-connessione")
async def test_connessione_sdi(db: Session = Depends(get_db)):
    """Testa la connessione al provider SDI"""
    config = _get_config(db)
    config_dict = _orm_to_dict(config)

    # Decripta password
    if config.sdi_password_encrypted and config.sdi_password_encrypted != "***":
        try:
            config_dict["sdi_password"] = base64.b64decode(
                config.sdi_password_encrypted
            ).decode()
        except Exception:
            config_dict["sdi_password"] = ""
    else:
        config_dict["sdi_password"] = ""

    provider = get_sdi_provider(config_dict)
    success = provider.authenticate()
    return {"success": success, "provider": config_dict.get("sdi_provider", "manuale")}


# ==========================================
# NUMERAZIONE
# ==========================================

@router.get("/numerazione")
async def get_numerazioni(db: Session = Depends(get_db)):
    nums = db.query(NumerazioneFatture).order_by(
        NumerazioneFatture.anno.desc(), NumerazioneFatture.tipo_documento
    ).all()
    return [_orm_to_dict(n) for n in nums]


@router.post("/numerazione")
async def create_numerazione(payload: dict = Body(...), db: Session = Depends(get_db)):
    num = NumerazioneFatture(
        tipo_documento=payload["tipo_documento"],
        anno=payload.get("anno", datetime.now().year),
        sezionale=payload.get("sezionale", ""),
        prefisso=payload.get("prefisso", ""),
        ultimo_numero=payload.get("ultimo_numero", 0),
        formato=payload.get("formato", "{prefisso}{numero}/{anno}"),
        padding_cifre=payload.get("padding_cifre", 1),
    )
    db.add(num)
    db.commit()
    db.refresh(num)
    return _orm_to_dict(num)


@router.put("/numerazione/{num_id}")
async def update_numerazione(num_id: int, payload: dict = Body(...),
                             db: Session = Depends(get_db)):
    num = db.query(NumerazioneFatture).filter(NumerazioneFatture.id == num_id).first()
    if not num:
        raise HTTPException(404, "Numerazione non trovata")
    for k in ["prefisso", "ultimo_numero", "formato", "padding_cifre", "sezionale"]:
        if k in payload:
            setattr(num, k, payload[k])
    db.commit()
    return _orm_to_dict(num)


def _prossimo_numero(db: Session, tipo_documento: str, anno: int = None,
                     sezionale: str = "") -> str:
    """Genera prossimo numero fattura progressivo"""
    if not anno:
        anno = datetime.now().year

    num = db.query(NumerazioneFatture).filter(
        NumerazioneFatture.tipo_documento == tipo_documento,
        NumerazioneFatture.anno == anno,
        NumerazioneFatture.sezionale == sezionale,
    ).first()

    if not num:
        # Crea contatore automaticamente
        prefisso_map = {
            "TD01": "FT", "TD02": "FA", "TD04": "NC",
            "TD05": "ND", "TD06": "PA", "TD24": "FD",
        }
        num = NumerazioneFatture(
            tipo_documento=tipo_documento,
            anno=anno,
            sezionale=sezionale,
            prefisso=prefisso_map.get(tipo_documento, ""),
            ultimo_numero=0,
            formato="{prefisso}{numero}/{anno}",
            padding_cifre=1,
        )
        db.add(num)

    num.ultimo_numero += 1

    # Formatta numero
    numero_str = str(num.ultimo_numero)
    if num.padding_cifre > 0:
        numero_str = numero_str.zfill(num.padding_cifre)

    risultato = num.formato.format(
        prefisso=num.prefisso,
        numero=numero_str,
        anno=str(anno),
        sezionale=num.sezionale,
    )

    db.flush()
    return risultato


# ==========================================
# FATTURE - CRUD
# ==========================================

@router.get("/fatture")
async def list_fatture(
    direzione: str = Query("attiva", regex="^(attiva|passiva|tutte)$"),
    tipo_documento: Optional[str] = None,
    stato_sdi: Optional[str] = None,
    anno: Optional[int] = None,
    cliente_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = 0,
    size: int = 50,
    db: Session = Depends(get_db)
):
    q = db.query(Fattura)

    if direzione != "tutte":
        q = q.filter(Fattura.direzione == direzione)
    if tipo_documento:
        q = q.filter(Fattura.tipo_documento == tipo_documento)
    if stato_sdi:
        q = q.filter(Fattura.stato_sdi == stato_sdi)
    if anno:
        q = q.filter(Fattura.anno == anno)
    if cliente_id:
        q = q.filter(Fattura.cliente_id == cliente_id)
    if search:
        q = q.filter(
            (Fattura.numero_fattura.ilike(f"%{search}%")) |
            (Fattura.dest_denominazione.ilike(f"%{search}%")) |
            (Fattura.dest_partita_iva.ilike(f"%{search}%"))
        )

    total = q.count()
    fatture = q.order_by(desc(Fattura.data_fattura), desc(Fattura.id)) \
               .offset(page * size).limit(size).all()

    return {
        "items": [_orm_to_dict(f) for f in fatture],
        "total": total,
        "page": page,
        "size": size,
    }


@router.get("/fatture/{fattura_id}")
async def get_fattura(fattura_id: int, db: Session = Depends(get_db)):
    fattura = db.query(Fattura).filter(Fattura.id == fattura_id).first()
    if not fattura:
        raise HTTPException(404, "Fattura non trovata")

    data = _orm_to_dict(fattura)
    data["righe"] = [_orm_to_dict(r) for r in fattura.righe]
    data["allegati"] = [_orm_to_dict(a) for a in fattura.allegati]
    data["notifiche"] = [_orm_to_dict(n) for n in fattura.notifiche]
    data["tipo_documento_desc"] = TIPI_DOCUMENTO.get(fattura.tipo_documento, "")
    return data


@router.post("/fatture")
async def create_fattura(payload: dict = Body(...), db: Session = Depends(get_db)):
    """Crea nuova fattura (bozza)"""
    config = _get_config(db)

    fattura = Fattura(
        direzione=payload.get("direzione", "attiva"),
        tipo_documento=payload.get("tipo_documento", "TD01"),
        anno=payload.get("anno", datetime.now().year),
        ordine_id=payload.get("ordine_id"),
        preventivo_id=payload.get("preventivo_id"),
        fattura_origine_id=payload.get("fattura_origine_id"),
        cliente_id=payload.get("cliente_id"),
        dest_denominazione=payload.get("dest_denominazione", ""),
        dest_partita_iva=payload.get("dest_partita_iva"),
        dest_codice_fiscale=payload.get("dest_codice_fiscale"),
        dest_indirizzo=payload.get("dest_indirizzo"),
        dest_numero_civico=payload.get("dest_numero_civico"),
        dest_cap=payload.get("dest_cap"),
        dest_comune=payload.get("dest_comune"),
        dest_provincia=payload.get("dest_provincia"),
        dest_nazione=payload.get("dest_nazione", "IT"),
        dest_pec=payload.get("dest_pec"),
        dest_codice_destinatario=payload.get("dest_codice_destinatario",
                                              config.codice_destinatario_default),
        data_fattura=datetime.fromisoformat(payload["data_fattura"]) if payload.get("data_fattura") else datetime.now(),
        data_scadenza=datetime.fromisoformat(payload["data_scadenza"]) if payload.get("data_scadenza") else None,
        # Ritenuta
        ritenuta_tipo=payload.get("ritenuta_tipo") or config.ritenuta_tipo_default,
        ritenuta_aliquota=payload.get("ritenuta_aliquota") or config.ritenuta_aliquota_default,
        ritenuta_causale=payload.get("ritenuta_causale") or config.ritenuta_causale_default,
        # Cassa prev
        cassa_tipo=payload.get("cassa_tipo") or config.cassa_tipo_default,
        cassa_aliquota=payload.get("cassa_aliquota") or config.cassa_aliquota_default,
        cassa_ritenuta=payload.get("cassa_ritenuta", config.cassa_ritenuta),
        cassa_aliquota_iva=payload.get("cassa_aliquota_iva", config.aliquota_iva_default),
        # IVA
        esigibilita_iva=payload.get("esigibilita_iva", config.esigibilita_iva_default),
        # Pagamento
        condizioni_pagamento=payload.get("condizioni_pagamento", config.condizioni_pagamento_default),
        modalita_pagamento=payload.get("modalita_pagamento", config.modalita_pagamento_default),
        iban_pagamento=payload.get("iban_pagamento") or config.iban,
        istituto_finanziario=payload.get("istituto_finanziario") or config.istituto_finanziario,
        # Dati ordine
        dati_ordine_id_documento=payload.get("dati_ordine_id_documento"),
        dati_ordine_data=datetime.fromisoformat(payload["dati_ordine_data"]) if payload.get("dati_ordine_data") else None,
        dati_ordine_codice_commessa=payload.get("dati_ordine_codice_commessa"),
        dati_ordine_codice_cup=payload.get("dati_ordine_codice_cup"),
        dati_ordine_codice_cig=payload.get("dati_ordine_codice_cig"),
        # Note
        causale=payload.get("causale"),
        note_interne=payload.get("note_interne"),
        stato_sdi="bozza",
        created_by=payload.get("created_by", "system"),
    )
    db.add(fattura)
    db.flush()

    # Righe
    for i, riga_data in enumerate(payload.get("righe", []), 1):
        riga = RigaFattura(
            fattura_id=fattura.id,
            numero_riga=riga_data.get("numero_riga", i),
            codice_tipo=riga_data.get("codice_tipo"),
            codice_valore=riga_data.get("codice_valore"),
            descrizione=riga_data.get("descrizione", ""),
            quantita=riga_data.get("quantita", 1),
            unita_misura=riga_data.get("unita_misura"),
            prezzo_unitario=riga_data.get("prezzo_unitario", 0),
            sconto_percentuale=riga_data.get("sconto_percentuale", 0),
            prezzo_totale=riga_data.get("prezzo_totale", 0),
            aliquota_iva=riga_data.get("aliquota_iva", config.aliquota_iva_default),
            natura=riga_data.get("natura"),
            riferimento_normativo=riga_data.get("riferimento_normativo"),
            ritenuta=riga_data.get("ritenuta", False),
        )
        # Calcola prezzo_totale se non fornito
        if not riga.prezzo_totale and riga.prezzo_unitario:
            ptot = riga.quantita * riga.prezzo_unitario
            if riga.sconto_percentuale:
                ptot *= (1 - riga.sconto_percentuale / 100)
            riga.prezzo_totale = round(ptot, 2)
        db.add(riga)

    db.commit()
    db.refresh(fattura)

    # Ricalcola totali
    _ricalcola_totali(fattura, db)

    return {"id": fattura.id, "stato_sdi": fattura.stato_sdi}


@router.put("/fatture/{fattura_id}")
async def update_fattura(fattura_id: int, payload: dict = Body(...),
                         db: Session = Depends(get_db)):
    fattura = db.query(Fattura).filter(Fattura.id == fattura_id).first()
    if not fattura:
        raise HTTPException(404, "Fattura non trovata")
    if fattura.stato_sdi not in ("bozza", "errore", "scartata"):
        raise HTTPException(400, f"Fattura in stato '{fattura.stato_sdi}' non modificabile")

    # Aggiorna campi testata
    updatable = [
        "tipo_documento", "dest_denominazione", "dest_partita_iva", "dest_codice_fiscale",
        "dest_indirizzo", "dest_numero_civico", "dest_cap", "dest_comune", "dest_provincia",
        "dest_nazione", "dest_pec", "dest_codice_destinatario",
        "data_fattura", "data_scadenza",
        "ritenuta_tipo", "ritenuta_aliquota", "ritenuta_causale",
        "cassa_tipo", "cassa_aliquota", "cassa_ritenuta", "cassa_aliquota_iva", "cassa_natura",
        "esigibilita_iva",
        "condizioni_pagamento", "modalita_pagamento", "iban_pagamento", "istituto_finanziario",
        "dati_ordine_id_documento", "dati_ordine_codice_commessa",
        "dati_ordine_codice_cup", "dati_ordine_codice_cig",
        "causale", "note_interne",
    ]
    for k in updatable:
        if k in payload:
            val = payload[k]
            if k in ("data_fattura", "data_scadenza", "dati_ordine_data") and val:
                val = datetime.fromisoformat(val)
            setattr(fattura, k, val)

    # Aggiorna righe se fornite
    if "righe" in payload:
        # Elimina righe esistenti
        db.query(RigaFattura).filter(RigaFattura.fattura_id == fattura_id).delete()
        config = _get_config(db)
        for i, rd in enumerate(payload["righe"], 1):
            riga = RigaFattura(
                fattura_id=fattura_id,
                numero_riga=rd.get("numero_riga", i),
                codice_tipo=rd.get("codice_tipo"),
                codice_valore=rd.get("codice_valore"),
                descrizione=rd.get("descrizione", ""),
                quantita=rd.get("quantita", 1),
                unita_misura=rd.get("unita_misura"),
                prezzo_unitario=rd.get("prezzo_unitario", 0),
                sconto_percentuale=rd.get("sconto_percentuale", 0),
                prezzo_totale=rd.get("prezzo_totale", 0),
                aliquota_iva=rd.get("aliquota_iva", config.aliquota_iva_default),
                natura=rd.get("natura"),
                riferimento_normativo=rd.get("riferimento_normativo"),
                ritenuta=rd.get("ritenuta", False),
            )
            if not riga.prezzo_totale and riga.prezzo_unitario:
                ptot = riga.quantita * riga.prezzo_unitario
                if riga.sconto_percentuale:
                    ptot *= (1 - riga.sconto_percentuale / 100)
                riga.prezzo_totale = round(ptot, 2)
            db.add(riga)

    db.commit()
    db.refresh(fattura)
    _ricalcola_totali(fattura, db)

    return {"id": fattura.id, "status": "updated"}


@router.delete("/fatture/{fattura_id}")
async def delete_fattura(fattura_id: int, db: Session = Depends(get_db)):
    fattura = db.query(Fattura).filter(Fattura.id == fattura_id).first()
    if not fattura:
        raise HTTPException(404, "Fattura non trovata")
    if fattura.stato_sdi not in ("bozza", "errore"):
        raise HTTPException(400, "Solo fatture in bozza o errore possono essere eliminate")
    db.delete(fattura)
    db.commit()
    return {"status": "deleted"}


# ==========================================
# CREA DA ORDINE
# ==========================================

@router.post("/fatture/da-ordine/{ordine_id}")
async def crea_fattura_da_ordine(
    ordine_id: int,
    tipo_documento: str = Query("TD01"),
    db: Session = Depends(get_db)
):
    """
    Crea fattura (bozza) partendo da un ordine completato.
    Importa cliente, materiali, totali dall'ordine.
    """
    config = _get_config(db)

    # Leggi ordine (via raw SQL dato che ordini è tabella legacy)
    conn = db.get_bind().raw_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM ordini WHERE id = ?", (ordine_id,))
    cols = [d[0] for d in cursor.description]
    row = cursor.fetchone()
    if not row:
        raise HTTPException(404, "Ordine non trovato")
    ordine = dict(zip(cols, row))

    if ordine.get("stato") not in ("completato", "spedito", "confermato", "in_produzione"):
        raise HTTPException(400, f"Ordine in stato '{ordine.get('stato')}' - non fatturabile")

    # Leggi preventivo associato
    preventivo_id = ordine.get("preventivo_id")
    cliente_id = ordine.get("cliente_id")

    # Leggi dati cliente
    cliente_data = {}
    if cliente_id:
        cursor.execute("SELECT * FROM clienti WHERE id = ?", (cliente_id,))
        c_cols = [d[0] for d in cursor.description]
        c_row = cursor.fetchone()
        if c_row:
            cliente_data = dict(zip(c_cols, c_row))

    # Leggi materiali dal preventivo
    righe_fattura = []
    if preventivo_id:
        from models import Materiale
        materiali = db.query(Materiale).filter(
            Materiale.preventivo_id == preventivo_id
        ).order_by(Materiale.ordine).all()

        for i, mat in enumerate(materiali, 1):
            righe_fattura.append({
                "numero_riga": i,
                "codice_tipo": "INTERNO",
                "codice_valore": mat.codice,
                "descrizione": mat.descrizione or mat.codice,
                "quantita": mat.quantita or 1,
                "unita_misura": mat.unita_misura or "pz",
                "prezzo_unitario": mat.prezzo_unitario or 0,
                "prezzo_totale": mat.prezzo_totale or 0,
                "aliquota_iva": config.aliquota_iva_default,
            })

    # Crea fattura
    payload = {
        "direzione": "attiva",
        "tipo_documento": tipo_documento,
        "ordine_id": ordine_id,
        "preventivo_id": preventivo_id,
        "cliente_id": cliente_id,
        "dest_denominazione": cliente_data.get("ragione_sociale", ""),
        "dest_partita_iva": cliente_data.get("partita_iva"),
        "dest_codice_fiscale": cliente_data.get("codice_fiscale"),
        "dest_indirizzo": cliente_data.get("indirizzo"),
        "dest_cap": cliente_data.get("cap"),
        "dest_comune": cliente_data.get("citta"),
        "dest_provincia": cliente_data.get("provincia"),
        "dest_pec": cliente_data.get("pec"),
        "dest_codice_destinatario": cliente_data.get("codice_destinatario") or config.codice_destinatario_default,
        "data_fattura": datetime.now().isoformat(),
        "dati_ordine_id_documento": ordine.get("numero_ordine"),
        "causale": f"Fattura per ordine {ordine.get('numero_ordine', '')}",
        "righe": righe_fattura,
    }

    # Riutilizza create_fattura
    return await create_fattura(payload, db)

# ==========================================
# ORDINI FATTURABILI PER CLIENTE
# ==========================================

@router.get("/ordini-fatturabili/{cliente_id}")
def get_ordini_fatturabili(cliente_id: int, db: Session = Depends(get_db)):
    """
    Restituisce gli ordini in stato 'completato' per un dato cliente,
    pronti per essere fatturati.
    """
    try:
        # Stesso pattern usato in crea_fattura_da_ordine (riga ~515)
        conn = db.get_bind().raw_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT o.*
            FROM ordini o
            WHERE o.cliente_id = ? AND o.stato = 'completato'
            ORDER BY o.created_at DESC
        """, (cliente_id,))

        cols = [d[0] for d in cursor.description]
        rows = cursor.fetchall()

        ordini = []
        for row in rows:
            od = dict(zip(cols, row))
            try:
                cursor.execute(
                    "SELECT COUNT(*) FROM materiali WHERE preventivo_id = ?",
                    (od.get("preventivo_id"),)
                )
                od["n_materiali"] = cursor.fetchone()[0]
            except Exception:
                od["n_materiali"] = 0
            ordini.append(od)

        return {"cliente_id": cliente_id, "ordini": ordini}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"Errore caricamento ordini fatturabili: {e}")


# ==========================================
# CREA FATTURA DA ORDINI MULTIPLI
# ==========================================

@router.post("/fatture/da-ordini")
async def crea_fattura_da_ordini(payload: dict = Body(...), db: Session = Depends(get_db)):
    """
    Crea fattura (bozza) da uno o più ordini completati.
    Tutti gli ordini devono appartenere allo stesso cliente.

    Body:
    {
        "ordine_ids": [1, 2, 3],
        "tipo_documento": "TD01",
        "causale": "...",
        "note_interne": "..."
    }
    """
    ordine_ids = payload.get("ordine_ids", [])
    if not ordine_ids:
        raise HTTPException(400, "Nessun ordine specificato")

    config = _get_config(db)
    conn = db.connection()
    cursor = conn.connection.cursor()

    # ── 1. Carica e valida tutti gli ordini ──
    placeholders = ",".join("?" * len(ordine_ids))
    cursor.execute(f"SELECT * FROM ordini WHERE id IN ({placeholders})", ordine_ids)
    cols = [d[0] for d in cursor.description]
    rows = cursor.fetchall()

    if len(rows) != len(ordine_ids):
        found = {dict(zip(cols, r))["id"] for r in rows}
        missing = set(ordine_ids) - found
        raise HTTPException(404, f"Ordini non trovati: {missing}")

    ordini = [dict(zip(cols, r)) for r in rows]

    # Valida stesso cliente
    clienti = set(o.get("cliente_id") for o in ordini if o.get("cliente_id"))
    if len(clienti) > 1:
        raise HTTPException(400, "Tutti gli ordini devono appartenere allo stesso cliente")
    if len(clienti) == 0:
        raise HTTPException(400, "Ordini senza cliente associato")

    cliente_id = clienti.pop()

    # Valida stato
    for o in ordini:
        if o.get("stato") != "completato":
            raise HTTPException(
                400,
                f"Ordine {o.get('numero_ordine', o['id'])} è in stato "
                f"'{o.get('stato')}' — solo ordini completati sono fatturabili"
            )

    # ── 2. Carica dati cliente ──
    cliente_data = {}
    cursor.execute("SELECT * FROM clienti WHERE id = ?", (cliente_id,))
    c_cols = [d[0] for d in cursor.description]
    c_row = cursor.fetchone()
    if c_row:
        cliente_data = dict(zip(c_cols, c_row))

    # ── 3. Raccogli materiali da tutti gli ordini ──
    righe_fattura = []
    numeri_ordine = []
    riga_num = 1

    for o in ordini:
        numero_ord = o.get("numero_ordine", f"ORD-{o['id']}")
        numeri_ordine.append(numero_ord)
        prev_id = o.get("preventivo_id")
        if not prev_id:
            continue

        from models import Materiale
        materiali = db.query(Materiale).filter(
            Materiale.preventivo_id == prev_id
        ).order_by(Materiale.id).all()

        # Separatore ordine (se multi-ordine)
        if len(ordine_ids) > 1 and materiali:
            righe_fattura.append({
                "numero_riga": riga_num,
                "codice_tipo": None,
                "codice_valore": None,
                "descrizione": f"── Ordine {numero_ord} ──",
                "quantita": 0,
                "unita_misura": None,
                "prezzo_unitario": 0,
                "prezzo_totale": 0,
                "aliquota_iva": 0,
            })
            riga_num += 1

        for mat in materiali:
            righe_fattura.append({
                "numero_riga": riga_num,
                "codice_tipo": "INTERNO",
                "codice_valore": mat.codice,
                "descrizione": mat.descrizione or mat.codice,
                "quantita": mat.quantita or 1,
                "unita_misura": getattr(mat, 'unita_misura', None) or "pz",
                "prezzo_unitario": mat.prezzo_unitario or 0,
                "prezzo_totale": mat.prezzo_totale or 0,
                "aliquota_iva": config.aliquota_iva_default,
            })
            riga_num += 1

    # ── 4. Componi causale ──
    if len(numeri_ordine) == 1:
        causale_default = f"Fattura per ordine {numeri_ordine[0]}"
        dati_ordine_id_doc = numeri_ordine[0]
    else:
        causale_default = f"Fattura per ordini {', '.join(numeri_ordine)}"
        dati_ordine_id_doc = ", ".join(numeri_ordine)

    # ── 5. Crea fattura via create_fattura ──
    fattura_payload = {
        "direzione": "attiva",
        "tipo_documento": payload.get("tipo_documento", "TD01"),
        "ordine_id": ordine_ids[0],
        "preventivo_id": ordini[0].get("preventivo_id"),
        "cliente_id": cliente_id,
        "dest_denominazione": cliente_data.get("ragione_sociale", ""),
        "dest_partita_iva": cliente_data.get("partita_iva"),
        "dest_codice_fiscale": cliente_data.get("codice_fiscale"),
        "dest_indirizzo": cliente_data.get("indirizzo"),
        "dest_cap": cliente_data.get("cap"),
        "dest_comune": cliente_data.get("citta"),
        "dest_provincia": cliente_data.get("provincia"),
        "dest_pec": cliente_data.get("pec"),
        "dest_codice_destinatario": cliente_data.get("codice_destinatario") or config.codice_destinatario_default,
        "data_fattura": datetime.now().isoformat(),
        "dati_ordine_id_documento": dati_ordine_id_doc,
        "causale": payload.get("causale") or causale_default,
        "note_interne": payload.get("note_interne"),
        "condizioni_pagamento": payload.get("condizioni_pagamento") or config.condizioni_pagamento_default,
        "modalita_pagamento": config.modalita_pagamento_default,
        "iban_pagamento": config.iban,
        "istituto_finanziario": config.istituto_finanziario,
        "righe": righe_fattura,
    }

    result = await create_fattura(fattura_payload, db)
    # Riapri connessione (create_fattura ha chiuso la precedente)
    conn = db.get_bind().raw_connection()
    cursor = conn.cursor()
    fattura_id = result["id"]

    # ── 6. Popola tabella ponte fe_fatture_ordini ──
    for oid in ordine_ids:
        try:
            cursor.execute(
                "INSERT OR IGNORE INTO fe_fatture_ordini (fattura_id, ordine_id) VALUES (?, ?)",
                (fattura_id, oid)
            )
        except Exception as e:
            print(f"WARN: fe_fatture_ordini insert {fattura_id}-{oid}: {e}")

    # ── 7. Cambia stato ordini a 'fatturato' + registra storico ──
    for o in ordini:
        oid = o["id"]
        stato_prec = o.get("stato", "completato")
        try:
            cursor.execute(
                "UPDATE ordini SET stato = 'fatturato', fattura_id = ?, updated_at = datetime('now') WHERE id = ?",
                (fattura_id, oid)
            )
        except Exception:
            cursor.execute(
                "UPDATE ordini SET stato = 'fatturato', updated_at = datetime('now') WHERE id = ?",
                (oid,)
            )

        try:
            cursor.execute("""
                INSERT INTO ordini_storico_stato (ordine_id, stato_precedente, stato_nuovo, motivo, utente)
                VALUES (?, ?, 'fatturato', ?, 'system')
            """, (oid, stato_prec, f"Fattura #{fattura_id} creata"))
        except Exception as e:
            print(f"WARN: storico stato ordine {oid}: {e}")

    conn.commit()

    return {
        "id": fattura_id,
        "stato_sdi": "bozza",
        "ordini_fatturati": ordine_ids,
        "totale_ordini": len(ordine_ids),
    }



# ==========================================
# NOTA DI CREDITO DA FATTURA
# ==========================================

@router.post("/fatture/{fattura_id}/nota-credito")
async def crea_nota_credito(fattura_id: int,
                            payload: dict = Body(default={}),
                            db: Session = Depends(get_db)):
    """Crea nota di credito collegata a una fattura esistente"""
    fattura_orig = db.query(Fattura).filter(Fattura.id == fattura_id).first()
    if not fattura_orig:
        raise HTTPException(404, "Fattura origine non trovata")

    # Copia dati dalla fattura originale
    nc_payload = {
        "direzione": "attiva",
        "tipo_documento": "TD04",
        "fattura_origine_id": fattura_id,
        "cliente_id": fattura_orig.cliente_id,
        "dest_denominazione": fattura_orig.dest_denominazione,
        "dest_partita_iva": fattura_orig.dest_partita_iva,
        "dest_codice_fiscale": fattura_orig.dest_codice_fiscale,
        "dest_indirizzo": fattura_orig.dest_indirizzo,
        "dest_numero_civico": fattura_orig.dest_numero_civico,
        "dest_cap": fattura_orig.dest_cap,
        "dest_comune": fattura_orig.dest_comune,
        "dest_provincia": fattura_orig.dest_provincia,
        "dest_nazione": fattura_orig.dest_nazione,
        "dest_pec": fattura_orig.dest_pec,
        "dest_codice_destinatario": fattura_orig.dest_codice_destinatario,
        "data_fattura": datetime.now().isoformat(),
        "ritenuta_tipo": fattura_orig.ritenuta_tipo,
        "ritenuta_aliquota": fattura_orig.ritenuta_aliquota,
        "ritenuta_causale": fattura_orig.ritenuta_causale,
        "cassa_tipo": fattura_orig.cassa_tipo,
        "cassa_aliquota": fattura_orig.cassa_aliquota,
        "esigibilita_iva": fattura_orig.esigibilita_iva,
        "condizioni_pagamento": fattura_orig.condizioni_pagamento,
        "modalita_pagamento": fattura_orig.modalita_pagamento,
        "causale": payload.get("causale",
                               f"Nota di credito rif. fattura {fattura_orig.numero_fattura}"),
    }

    # Righe: copia da originale (importi positivi → SDI accetta positivi per NC)
    # oppure usa righe personalizzate dal payload
    if "righe" in payload and payload["righe"]:
        nc_payload["righe"] = payload["righe"]
    else:
        nc_payload["righe"] = []
        for riga in fattura_orig.righe:
            nc_payload["righe"].append({
                "codice_tipo": riga.codice_tipo,
                "codice_valore": riga.codice_valore,
                "descrizione": riga.descrizione,
                "quantita": riga.quantita,
                "unita_misura": riga.unita_misura,
                "prezzo_unitario": riga.prezzo_unitario,
                "prezzo_totale": riga.prezzo_totale,
                "aliquota_iva": riga.aliquota_iva,
                "natura": riga.natura,
                "ritenuta": riga.ritenuta,
            })

    return await create_fattura(nc_payload, db)


# ==========================================
# GENERA XML & INVIA SDI
# ==========================================

@router.post("/fatture/{fattura_id}/genera-xml")
async def genera_xml(fattura_id: int, db: Session = Depends(get_db)):
    """Genera XML FatturaPA e assegna numero fattura"""
    fattura = db.query(Fattura).filter(Fattura.id == fattura_id).first()
    if not fattura:
        raise HTTPException(404, "Fattura non trovata")

    config = _get_config(db)
    config_dict = _orm_to_dict(config)
    fattura_dict = _orm_to_dict(fattura)
    righe_dict = [_orm_to_dict(r) for r in fattura.righe]

    # Assegna numero se non presente
    if not fattura.numero_fattura:
        fattura.numero_fattura = _prossimo_numero(
            db, fattura.tipo_documento, fattura.anno
        )
        fattura_dict["numero_fattura"] = fattura.numero_fattura

    # Valida
    errori = valida_fattura_base(config_dict, fattura_dict, righe_dict)
    if errori:
        return JSONResponse(status_code=422, content={"errori": errori})

    # Ricalcola totali
    _ricalcola_totali(fattura, db)
    fattura_dict = _orm_to_dict(fattura)

    # Se è nota di credito, aggiungi dati fattura collegata
    if fattura.tipo_documento == "TD04" and fattura.fattura_origine_id:
        orig = db.query(Fattura).filter(Fattura.id == fattura.fattura_origine_id).first()
        if orig:
            fattura_dict["fattura_origine_numero"] = orig.numero_fattura
            fattura_dict["fattura_origine_data"] = orig.data_fattura.isoformat() if orig.data_fattura else None

    # Genera XML
    gen = FatturaPAGenerator(config_dict, fattura_dict, righe_dict)
    xml_str = gen.genera()
    filename = gen.get_filename()

    # Salva
    fattura.xml_content = xml_str
    fattura.xml_filename = filename
    fattura.progressivo_invio = gen.get_progressivo()
    fattura.stato_sdi = "generata"
    db.commit()

    return {
        "id": fattura.id,
        "numero_fattura": fattura.numero_fattura,
        "xml_filename": filename,
        "stato_sdi": "generata",
    }


@router.get("/fatture/{fattura_id}/xml")
async def download_xml(fattura_id: int, db: Session = Depends(get_db)):
    """Scarica XML fattura"""
    fattura = db.query(Fattura).filter(Fattura.id == fattura_id).first()
    if not fattura or not fattura.xml_content:
        raise HTTPException(404, "XML non disponibile")

    return StreamingResponse(
        io.BytesIO(fattura.xml_content.encode("utf-8")),
        media_type="application/xml",
        headers={
            "Content-Disposition": f"attachment; filename={fattura.xml_filename or 'fattura.xml'}"
        }
    )


@router.post("/fatture/{fattura_id}/invia-sdi")
async def invia_sdi(fattura_id: int, db: Session = Depends(get_db)):
    """Invia fattura al provider SDI"""
    fattura = db.query(Fattura).filter(Fattura.id == fattura_id).first()
    if not fattura:
        raise HTTPException(404, "Fattura non trovata")

    if not fattura.xml_content:
        # Genera XML se non presente
        await genera_xml(fattura_id, db)
        db.refresh(fattura)

    if fattura.stato_sdi not in ("generata", "errore", "scartata"):
        raise HTTPException(400, f"Fattura in stato '{fattura.stato_sdi}' non inviabile")

    config = _get_config(db)
    config_dict = _orm_to_dict(config)

    # Decripta password
    if config.sdi_password_encrypted:
        try:
            config_dict["sdi_password"] = base64.b64decode(
                config.sdi_password_encrypted
            ).decode()
        except Exception:
            config_dict["sdi_password"] = ""

    provider = get_sdi_provider(config_dict)
    result = provider.upload_invoice(fattura.xml_content, fattura.xml_filename)

    if result["success"]:
        fattura.stato_sdi = "inviata"
        fattura.sdi_filename = result.get("upload_filename")
        fattura.sdi_data_invio = datetime.now()

        # Salva notifica
        notifica = NotificaSDI(
            fattura_id=fattura.id,
            tipo_notifica="UPLOAD",
            descrizione="Fattura inviata al provider SDI",
            contenuto_json=result.get("raw_response"),
        )
        db.add(notifica)
    else:
        fattura.stato_sdi = "errore"
        notifica = NotificaSDI(
            fattura_id=fattura.id,
            tipo_notifica="ERRORE_UPLOAD",
            descrizione=result.get("error_description", "Errore invio"),
            contenuto_json=result.get("raw_response"),
        )
        db.add(notifica)

    db.commit()

    return {
        "id": fattura.id,
        "stato_sdi": fattura.stato_sdi,
        "sdi_filename": fattura.sdi_filename,
        "success": result["success"],
        "error": result.get("error_description") if not result["success"] else None,
    }


# ==========================================
# AGGIORNAMENTO STATO SDI
# ==========================================

@router.post("/fatture/{fattura_id}/aggiorna-stato")
async def aggiorna_stato_sdi(fattura_id: int, db: Session = Depends(get_db)):
    """Interroga il provider SDI per aggiornare lo stato della fattura"""
    fattura = db.query(Fattura).filter(Fattura.id == fattura_id).first()
    if not fattura:
        raise HTTPException(404, "Fattura non trovata")

    if not fattura.sdi_filename and not fattura.xml_filename:
        raise HTTPException(400, "Fattura senza filename SDI")

    config = _get_config(db)
    config_dict = _orm_to_dict(config)
    if config.sdi_password_encrypted:
        try:
            config_dict["sdi_password"] = base64.b64decode(config.sdi_password_encrypted).decode()
        except Exception:
            config_dict["sdi_password"] = ""

    provider = get_sdi_provider(config_dict)
    filename = fattura.sdi_filename or fattura.xml_filename
    result = provider.get_invoice_status(filename)

    if result["success"]:
        old_stato = fattura.stato_sdi
        new_stato = result["stato"]
        fattura.stato_sdi = new_stato
        fattura.sdi_identificativo = result.get("id_sdi")
        fattura.sdi_notifica_json = result.get("raw_response")

        if new_stato == "consegnata" and not fattura.sdi_data_consegna:
            fattura.sdi_data_consegna = datetime.now()

        # Salva notifica se stato cambiato
        if old_stato != new_stato:
            notifica = NotificaSDI(
                fattura_id=fattura.id,
                tipo_notifica=new_stato.upper(),
                descrizione=f"Stato aggiornato: {old_stato} → {new_stato}",
                contenuto_json=result.get("raw_response"),
            )
            db.add(notifica)

        db.commit()

    return {
        "id": fattura.id,
        "stato_sdi": fattura.stato_sdi,
        "success": result["success"],
        "stato_precedente": fattura.stato_sdi if not result["success"] else None,
    }


@router.post("/aggiorna-stati-batch")
async def aggiorna_stati_batch(db: Session = Depends(get_db)):
    """Aggiorna stato di tutte le fatture inviate ma non ancora concluse"""
    fatture_pending = db.query(Fattura).filter(
        Fattura.stato_sdi.in_(["inviata", "mancata_consegna"])
    ).all()

    risultati = []
    for f in fatture_pending:
        try:
            r = await aggiorna_stato_sdi(f.id, db)
            risultati.append({"id": f.id, "numero": f.numero_fattura, "nuovo_stato": r["stato_sdi"]})
        except Exception as e:
            risultati.append({"id": f.id, "numero": f.numero_fattura, "errore": str(e)})

    return {"aggiornate": len(risultati), "risultati": risultati}


# ==========================================
# FATTURE PASSIVE (RICEVUTE)
# ==========================================

@router.post("/sincronizza-passive")
async def sincronizza_passive(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Sincronizza fatture passive dal provider SDI"""
    config = _get_config(db)
    config_dict = _orm_to_dict(config)
    if config.sdi_password_encrypted:
        try:
            config_dict["sdi_password"] = base64.b64decode(config.sdi_password_encrypted).decode()
        except Exception:
            config_dict["sdi_password"] = ""

    provider = get_sdi_provider(config_dict)
    if not date_from:
        date_from = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
    if not date_to:
        date_to = datetime.now().strftime("%Y-%m-%d")

    result = provider.search_received_invoices(date_from=date_from, date_to=date_to)
    if not result["success"]:
        raise HTTPException(500, result.get("error", "Errore sincronizzazione"))

    importate = 0
    for inv in result["invoices"]:
        # Verifica se già importata
        existing = db.query(Fattura).filter(
            Fattura.sdi_filename == inv.get("filename"),
            Fattura.direzione == "passiva"
        ).first()
        if existing:
            continue

        # Importa
        fattura = Fattura(
            direzione="passiva",
            tipo_documento="TD01",  # Verrà aggiornato leggendo XML
            stato_sdi="ricevuta",
            sdi_filename=inv.get("filename"),
            sdi_identificativo=inv.get("id_sdi"),
            fornitore_denominazione=inv.get("cedente"),
            data_ricezione=datetime.now(),
            anno=datetime.now().year,
        )
        db.add(fattura)
        importate += 1

    db.commit()
    return {"importate": importate, "totale_trovate": len(result["invoices"])}


# ==========================================
# STATISTICHE / DASHBOARD
# ==========================================

@router.get("/statistiche")
async def get_statistiche(anno: Optional[int] = None, db: Session = Depends(get_db)):
    if not anno:
        anno = datetime.now().year

    stats = {
        "anno": anno,
        "attive": {},
        "passive": {},
    }

    # Fatture attive per stato
    for stato in ["bozza", "generata", "inviata", "consegnata", "accettata", "scartata", "errore"]:
        count = db.query(Fattura).filter(
            Fattura.direzione == "attiva",
            Fattura.anno == anno,
            Fattura.stato_sdi == stato
        ).count()
        stats["attive"][stato] = count

    # Totale fatturato attivo
    from sqlalchemy import func
    tot = db.query(func.sum(Fattura.totale_fattura)).filter(
        Fattura.direzione == "attiva",
        Fattura.anno == anno,
        Fattura.stato_sdi.in_(["consegnata", "accettata"])
    ).scalar() or 0
    stats["attive"]["totale_fatturato"] = round(tot, 2)

    # Fatture passive
    count_passive = db.query(Fattura).filter(
        Fattura.direzione == "passiva",
        Fattura.anno == anno,
    ).count()
    stats["passive"]["totale"] = count_passive

    registrate = db.query(Fattura).filter(
        Fattura.direzione == "passiva",
        Fattura.anno == anno,
        Fattura.registrata == True,
    ).count()
    stats["passive"]["registrate"] = registrate
    stats["passive"]["da_registrare"] = count_passive - registrate

    return stats


# ==========================================
# HELPER: Ricalcola totali
# ==========================================

def _ricalcola_totali(fattura: Fattura, db: Session):
    """Ricalcola tutti i totali della fattura dalle righe"""
    config = _get_config(db)
    config_dict = _orm_to_dict(config)
    fattura_dict = _orm_to_dict(fattura)
    righe_dict = [_orm_to_dict(r) for r in fattura.righe]

    totali = calcola_totali_fattura(righe_dict, fattura_dict, config_dict)

    fattura.imponibile_totale = totali["imponibile_totale"]
    fattura.iva_totale = totali["iva_totale"]
    fattura.cassa_importo = totali["cassa_importo"]
    fattura.ritenuta_importo = totali["ritenuta_importo"]
    fattura.bollo_virtuale = totali["bollo_virtuale"]
    fattura.bollo_importo = totali["bollo_importo"]
    fattura.totale_fattura = totali["totale_fattura"]

    # Aggiorna cassa_imponibile
    if fattura.cassa_tipo and fattura.cassa_aliquota:
        fattura.cassa_imponibile = totali["imponibile_totale"]

    db.commit()
