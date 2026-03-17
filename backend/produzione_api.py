"""
produzione_api.py — API REST per il modulo Produzione
======================================================
Includere in main.py:

    from produzione_api import router as produzione_router
    produzione_router.dependencies = [Depends(richiedi_modulo("produzione"))]
    app.include_router(produzione_router)

Agganciare la creazione fasi in ordini_stato.py (vedere docstring
della funzione crea_fasi_da_template).
"""

import logging
from datetime import datetime, date, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Body, Query
from sqlalchemy.orm import Session

from database import SessionLocal

logger = logging.getLogger("produzione_api")

router = APIRouter(prefix="/produzione", tags=["Produzione"])

STATI_FASE = ("da_fare", "in_corso", "completata", "saltata")

TRANSIZIONI_FASE = {
    "da_fare":    ["in_corso",   "saltata"],
    "in_corso":   ["completata", "da_fare"],
    "completata": ["in_corso"],
    "saltata":    ["da_fare"],
}


# ──────────────────────────────────────────────
# DEPENDENCY + HELPERS
# ──────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _raw(db: Session):
    return db.get_bind().raw_connection()


def _row2dict(cursor, row) -> dict:
    cols = [d[0] for d in cursor.description]
    return dict(zip(cols, row))


def _rows2list(cursor, rows) -> list:
    cols = [d[0] for d in cursor.description]
    return [dict(zip(cols, r)) for r in rows]


def _avanzamento_ordine(cur, ordine_id: int) -> dict:
    """Ritorna percentuale completamento e conteggi fasi per un ordine."""
    cur.execute("""
        SELECT stato, COUNT(*) as n
        FROM fasi_produzione
        WHERE ordine_id = ?
        GROUP BY stato
    """, (ordine_id,))
    rows = cur.fetchall()
    totale = sum(r[1] for r in rows)
    completate = sum(r[1] for r in rows if r[0] == "completata")
    saltate    = sum(r[1] for r in rows if r[0] == "saltata")
    perc = round((completate + saltate) / totale * 100) if totale > 0 else 0
    stati_map = {r[0]: r[1] for r in rows}
    return {
        "totale": totale,
        "completate": completate,
        "in_corso": stati_map.get("in_corso", 0),
        "da_fare": stati_map.get("da_fare", 0),
        "saltate": saltate,
        "percentuale": perc,
    }


# ──────────────────────────────────────────────
# FUNZIONE PUBBLICA — chiamata da ordini_stato.py
# ──────────────────────────────────────────────

def crea_fasi_da_template(conn, ordine_id: int, created_by: str = "sistema") -> dict:
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM fasi_produzione WHERE ordine_id = ?", (ordine_id,))
    if cur.fetchone()[0] > 0:
        return {"ok": False, "warning": "Le fasi per questa commessa esistono già"}

    cur.execute("""
        SELECT p.tipo_preventivo
        FROM ordini o
        LEFT JOIN preventivi p ON p.id = o.preventivo_id
        WHERE o.id = ?
    """, (ordine_id,))
    row = cur.fetchone()
    tipo_commessa = row[0] if row and row[0] else None

    cur.execute("""
        SELECT id, nome, ordine, durata_stimata_ore, centro_lavoro_id
        FROM fasi_template
        WHERE attivo = 1 AND (tipo_commessa = ? OR tipo_commessa IS NULL)
        ORDER BY (tipo_commessa IS NULL), ordine
    """, (tipo_commessa,))
    template_rows = cur.fetchall()

    if not template_rows:
        return {"ok": False, "warning": "Nessun template fasi configurato. Aggiungere le fasi manualmente o configurare un template in Produzione > Config."}

    oggi = date.today()
    data_corrente = oggi
    fasi_create = 0

    for tmpl_id, nome, ordine, durata_ore, centro_id in template_rows:
        giorni_fase = max(1, round(durata_ore / 8))
        data_inizio = data_corrente.isoformat()
        data_fine   = (data_corrente + timedelta(days=giorni_fase)).isoformat()
        cur.execute("""
            INSERT INTO fasi_produzione
                (ordine_id, template_id, nome, ordine, stato,
                 centro_lavoro_id, durata_stimata_ore,
                 data_inizio_prevista, data_fine_prevista)
            VALUES (?,?,?,?,?,?,?,?,?)
        """, (ordine_id, tmpl_id, nome, ordine, "da_fare",
              centro_id, durata_ore, data_inizio, data_fine))
        data_corrente += timedelta(days=giorni_fase)
        fasi_create += 1

    conn.commit()
    logger.info(f"[produzione] Create {fasi_create} fasi per ordine {ordine_id}")
    return {"ok": True, "fasi_create": fasi_create}


def popola_wip_da_bom(conn, ordine_id: int) -> int:
    cur = conn.cursor()
    cur.execute("""
        SELECT m.codice, m.descrizione, m.quantita, m.unita_misura,
               a.id as articolo_id
        FROM materiali m
        LEFT JOIN articoli a ON a.codice = m.codice
        WHERE m.preventivo_id = (SELECT preventivo_id FROM ordini WHERE id = ?)
          AND m.codice IS NOT NULL AND m.codice != ''
    """, (ordine_id,))
    materiali = cur.fetchall()
    inseriti = 0
    for codice, desc, qty, um, art_id in materiali:
        try:
            cur.execute("""
                INSERT OR IGNORE INTO wip_commessa
                    (ordine_id, articolo_id, codice_articolo, descrizione,
                     unita_misura, quantita_necessaria, stato)
                VALUES (?,?,?,?,?,?,?)
            """, (ordine_id, art_id, codice, desc, um or "pz", qty or 0, "da_prelevare"))
            if cur.rowcount > 0:
                inseriti += 1
        except Exception as e:
            logger.warning(f"wip insert skip {codice}: {e}")
    conn.commit()
    return inseriti


# ──────────────────────────────────────────────
# CENTRI DI LAVORO
# ──────────────────────────────────────────────

@router.get("/centri-lavoro")
def lista_centri(db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("SELECT * FROM centri_lavoro ORDER BY nome")
    return _rows2list(cur, cur.fetchall())


@router.post("/centri-lavoro")
def crea_centro(payload: dict = Body(...), db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("""
        INSERT INTO centri_lavoro (nome, descrizione, capacita_ore_giorno, colore)
        VALUES (:nome, :descrizione, :capacita_ore_giorno, :colore)
    """, {
        "nome": payload.get("nome", ""),
        "descrizione": payload.get("descrizione"),
        "capacita_ore_giorno": payload.get("capacita_ore_giorno", 8.0),
        "colore": payload.get("colore", "#6366f1"),
    })
    conn.commit()
    new_id = cur.lastrowid
    cur.execute("SELECT * FROM centri_lavoro WHERE id = ?", (new_id,))
    return _row2dict(cur, cur.fetchone())


@router.put("/centri-lavoro/{centro_id}")
def aggiorna_centro(centro_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("SELECT id FROM centri_lavoro WHERE id = ?", (centro_id,))
    if not cur.fetchone():
        raise HTTPException(404, "Centro di lavoro non trovato")
    fields = {k: v for k, v in payload.items() if k in ("nome","descrizione","capacita_ore_giorno","colore","attivo")}
    if not fields:
        raise HTTPException(400, "Nessun campo valido")
    set_clause = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = centro_id
    cur.execute(f"UPDATE centri_lavoro SET {set_clause}, updated_at = datetime('now') WHERE id = :id", fields)
    conn.commit()
    cur.execute("SELECT * FROM centri_lavoro WHERE id = ?", (centro_id,))
    return _row2dict(cur, cur.fetchone())


@router.delete("/centri-lavoro/{centro_id}")
def elimina_centro(centro_id: int, db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("UPDATE centri_lavoro SET attivo = 0 WHERE id = ?", (centro_id,))
    conn.commit()
    return {"ok": True}


# ──────────────────────────────────────────────
# TEMPLATE FASI
# ──────────────────────────────────────────────

@router.get("/template-fasi")
def lista_template(db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("""
        SELECT ft.*, cl.nome as centro_nome, cl.colore as centro_colore
        FROM fasi_template ft
        LEFT JOIN centri_lavoro cl ON cl.id = ft.centro_lavoro_id
        WHERE ft.attivo = 1
        ORDER BY ft.tipo_commessa NULLS LAST, ft.ordine
    """)
    return _rows2list(cur, cur.fetchall())


@router.post("/template-fasi")
def crea_template(payload: dict = Body(...), db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("""
        INSERT INTO fasi_template
            (nome, descrizione, ordine, durata_stimata_ore, centro_lavoro_id, tipo_commessa)
        VALUES (:nome, :descrizione, :ordine, :durata_stimata_ore, :centro_lavoro_id, :tipo_commessa)
    """, {
        "nome": payload.get("nome", ""),
        "descrizione": payload.get("descrizione"),
        "ordine": payload.get("ordine", 0),
        "durata_stimata_ore": payload.get("durata_stimata_ore", 8.0),
        "centro_lavoro_id": payload.get("centro_lavoro_id"),
        "tipo_commessa": payload.get("tipo_commessa"),
    })
    conn.commit()
    new_id = cur.lastrowid
    cur.execute("SELECT * FROM fasi_template WHERE id = ?", (new_id,))
    return _row2dict(cur, cur.fetchone())


@router.put("/template-fasi/{tmpl_id}")
def aggiorna_template(tmpl_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("SELECT id FROM fasi_template WHERE id = ?", (tmpl_id,))
    if not cur.fetchone():
        raise HTTPException(404, "Template non trovato")
    allowed = ("nome","descrizione","ordine","durata_stimata_ore","centro_lavoro_id","tipo_commessa","attivo")
    fields = {k: v for k, v in payload.items() if k in allowed}
    if not fields:
        raise HTTPException(400, "Nessun campo valido")
    set_clause = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = tmpl_id
    cur.execute(f"UPDATE fasi_template SET {set_clause}, updated_at = datetime('now') WHERE id = :id", fields)
    conn.commit()
    cur.execute("SELECT * FROM fasi_template WHERE id = ?", (tmpl_id,))
    return _row2dict(cur, cur.fetchone())


@router.delete("/template-fasi/{tmpl_id}")
def elimina_template(tmpl_id: int, db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("UPDATE fasi_template SET attivo = 0 WHERE id = ?", (tmpl_id,))
    conn.commit()
    return {"ok": True}


@router.post("/template-fasi/{tmpl_id}/duplica")
def duplica_template(tmpl_id: int, db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("SELECT * FROM fasi_template WHERE id = ?", (tmpl_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Template non trovato")
    t = _row2dict(cur, row)
    cur.execute("""
        INSERT INTO fasi_template (nome, descrizione, ordine, durata_stimata_ore, centro_lavoro_id, tipo_commessa)
        VALUES (:nome, :descrizione, :ordine, :durata_stimata_ore, :centro_lavoro_id, :tipo_commessa)
    """, {
        "nome": f"{t['nome']} (copia)",
        "descrizione": t["descrizione"],
        "ordine": t["ordine"],
        "durata_stimata_ore": t["durata_stimata_ore"],
        "centro_lavoro_id": t["centro_lavoro_id"],
        "tipo_commessa": t["tipo_commessa"],
    })
    conn.commit()
    new_id = cur.lastrowid
    cur.execute("SELECT * FROM fasi_template WHERE id = ?", (new_id,))
    return _row2dict(cur, cur.fetchone())


# ──────────────────────────────────────────────
# FASI PRODUZIONE PER COMMESSA
# ──────────────────────────────────────────────

@router.get("/commesse/{ordine_id}/fasi")
def get_fasi_commessa(ordine_id: int, db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("SELECT id FROM ordini WHERE id = ?", (ordine_id,))
    if not cur.fetchone():
        raise HTTPException(404, "Ordine non trovato")
    cur.execute("""
        SELECT fp.*, cl.nome as centro_nome, cl.colore as centro_colore
        FROM fasi_produzione fp
        LEFT JOIN centri_lavoro cl ON cl.id = fp.centro_lavoro_id
        WHERE fp.ordine_id = ?
        ORDER BY fp.ordine, fp.id
    """, (ordine_id,))
    fasi = _rows2list(cur, cur.fetchall())
    for f in fasi:
        cur.execute("SELECT COALESCE(SUM(minuti),0) FROM produzione_timer WHERE fase_id = ? AND stopped_at IS NOT NULL", (f["id"],))
        f["minuti_registrati"] = cur.fetchone()[0]
    avanzamento = _avanzamento_ordine(cur, ordine_id)
    return {"fasi": fasi, "avanzamento": avanzamento}


@router.post("/commesse/{ordine_id}/fasi")
def aggiungi_fase(ordine_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("SELECT id FROM ordini WHERE id = ?", (ordine_id,))
    if not cur.fetchone():
        raise HTTPException(404, "Ordine non trovato")
    cur.execute("""
        INSERT INTO fasi_produzione
            (ordine_id, template_id, nome, ordine, centro_lavoro_id,
             durata_stimata_ore, data_inizio_prevista, data_fine_prevista, note)
        VALUES (:ordine_id, :template_id, :nome, :ordine, :centro_lavoro_id,
                :durata_stimata_ore, :data_inizio_prevista, :data_fine_prevista, :note)
    """, {
        "ordine_id": ordine_id,
        "template_id": payload.get("template_id"),
        "nome": payload.get("nome", "Nuova fase"),
        "ordine": payload.get("ordine", 0),
        "centro_lavoro_id": payload.get("centro_lavoro_id"),
        "durata_stimata_ore": payload.get("durata_stimata_ore", 8.0),
        "data_inizio_prevista": payload.get("data_inizio_prevista"),
        "data_fine_prevista": payload.get("data_fine_prevista"),
        "note": payload.get("note"),
    })
    conn.commit()
    new_id = cur.lastrowid
    cur.execute("""
        SELECT fp.*, cl.nome as centro_nome, cl.colore as centro_colore
        FROM fasi_produzione fp
        LEFT JOIN centri_lavoro cl ON cl.id = fp.centro_lavoro_id
        WHERE fp.id = ?
    """, (new_id,))
    return _row2dict(cur, cur.fetchone())


@router.post("/commesse/{ordine_id}/crea-da-template")
def crea_fasi_commessa_da_template(ordine_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    result = crea_fasi_da_template(conn, ordine_id, "utente")
    if not result["ok"]:
        raise HTTPException(400, result["warning"])
    return result


@router.put("/commesse/{ordine_id}/fasi/{fase_id}")
def aggiorna_fase(ordine_id: int, fase_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("SELECT id FROM fasi_produzione WHERE id = ? AND ordine_id = ?", (fase_id, ordine_id))
    if not cur.fetchone():
        raise HTTPException(404, "Fase non trovata")
    allowed = ("nome","ordine","centro_lavoro_id","durata_stimata_ore","durata_reale_ore",
               "data_inizio_prevista","data_fine_prevista","data_inizio_reale","data_fine_reale","note")
    fields = {k: v for k, v in payload.items() if k in allowed}
    if not fields:
        raise HTTPException(400, "Nessun campo valido")
    set_clause = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = fase_id
    cur.execute(f"UPDATE fasi_produzione SET {set_clause}, updated_at = datetime('now') WHERE id = :id", fields)
    conn.commit()
    cur.execute("""
        SELECT fp.*, cl.nome as centro_nome, cl.colore as centro_colore
        FROM fasi_produzione fp
        LEFT JOIN centri_lavoro cl ON cl.id = fp.centro_lavoro_id
        WHERE fp.id = ?
    """, (fase_id,))
    return _row2dict(cur, cur.fetchone())


@router.delete("/commesse/{ordine_id}/fasi/{fase_id}")
def elimina_fase(ordine_id: int, fase_id: int, db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("DELETE FROM fasi_produzione WHERE id = ? AND ordine_id = ?", (fase_id, ordine_id))
    conn.commit()
    return {"ok": True}


# ──────────────────────────────────────────────
# AVANZAMENTO STATO FASE
# ──────────────────────────────────────────────

@router.post("/fasi/{fase_id}/avanza-stato")
def avanza_stato_fase(fase_id: int, payload: dict = Body(default={}), db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("SELECT * FROM fasi_produzione WHERE id = ?", (fase_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Fase non trovata")
    fase = _row2dict(cur, row)
    stato_nuovo = payload.get("stato")
    if not stato_nuovo:
        raise HTTPException(400, "Campo 'stato' obbligatorio")
    if stato_nuovo not in STATI_FASE:
        raise HTTPException(400, f"Stato non valido. Validi: {STATI_FASE}")
    stato_corrente = fase["stato"]
    if stato_nuovo not in TRANSIZIONI_FASE.get(stato_corrente, []):
        raise HTTPException(400, f"Transizione '{stato_corrente}' -> '{stato_nuovo}' non permessa")

    now = datetime.utcnow().isoformat()
    updates: dict = {"stato": stato_nuovo}

    if stato_nuovo == "in_corso" and not fase.get("data_inizio_reale"):
        updates["data_inizio_reale"] = now
    if stato_nuovo == "completata":
        updates["data_fine_reale"] = now
        cur.execute("""
            SELECT COALESCE(SUM(minuti), 0) FROM produzione_timer
            WHERE fase_id = ? AND stopped_at IS NOT NULL
        """, (fase_id,))
        minuti_totali = cur.fetchone()[0]
        if minuti_totali > 0:
            updates["durata_reale_ore"] = round(minuti_totali / 60, 2)

    set_clause = ", ".join(f"{k} = :{k}" for k in updates)
    updates["id"] = fase_id
    cur.execute(f"UPDATE fasi_produzione SET {set_clause}, updated_at = datetime('now') WHERE id = :id", updates)
    conn.commit()
    cur.execute("""
        SELECT fp.*, cl.nome as centro_nome, cl.colore as centro_colore
        FROM fasi_produzione fp
        LEFT JOIN centri_lavoro cl ON cl.id = fp.centro_lavoro_id
        WHERE fp.id = ?
    """, (fase_id,))
    return _row2dict(cur, cur.fetchone())


# ──────────────────────────────────────────────
# TIMER FASI
# ──────────────────────────────────────────────

@router.post("/fasi/{fase_id}/timer/start")
def start_timer(fase_id: int, payload: dict = Body(default={}), db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("SELECT id, stato FROM fasi_produzione WHERE id = ?", (fase_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Fase non trovata")
    cur.execute("SELECT id FROM produzione_timer WHERE fase_id = ? AND stopped_at IS NULL", (fase_id,))
    if cur.fetchone():
        raise HTTPException(400, "Timer già in corso per questa fase")
    utente = payload.get("utente", "utente")
    now = datetime.utcnow().isoformat()
    cur.execute("""
        INSERT INTO produzione_timer (fase_id, utente, started_at)
        VALUES (?, ?, ?)
    """, (fase_id, utente, now))
    conn.commit()
    timer_id = cur.lastrowid
    return {"timer_id": timer_id, "started_at": now, "fase_id": fase_id}


@router.post("/fasi/{fase_id}/timer/stop")
def stop_timer(fase_id: int, payload: dict = Body(default={}), db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("""
        SELECT id, started_at FROM produzione_timer
        WHERE fase_id = ? AND stopped_at IS NULL
        ORDER BY started_at DESC LIMIT 1
    """, (fase_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Nessun timer in corso per questa fase")
    timer_id, started_at = row
    now = datetime.utcnow()
    started = datetime.fromisoformat(started_at)
    minuti = (now - started).total_seconds() / 60
    cur.execute("""
        UPDATE produzione_timer SET stopped_at = ?, minuti = ? WHERE id = ?
    """, (now.isoformat(), round(minuti, 2), timer_id))
    conn.commit()
    return {"timer_id": timer_id, "minuti": round(minuti, 2), "stopped_at": now.isoformat()}


@router.get("/fasi/{fase_id}/timer")
def get_timer_fase(fase_id: int, db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("""
        SELECT * FROM produzione_timer WHERE fase_id = ? ORDER BY started_at DESC
    """, (fase_id,))
    sessioni = _rows2list(cur, cur.fetchall())
    cur.execute("""
        SELECT COALESCE(SUM(minuti),0) FROM produzione_timer
        WHERE fase_id = ? AND stopped_at IS NOT NULL
    """, (fase_id,))
    totale_minuti = cur.fetchone()[0]
    cur.execute("SELECT id, started_at FROM produzione_timer WHERE fase_id = ? AND stopped_at IS NULL LIMIT 1", (fase_id,))
    row = cur.fetchone()
    timer_aperto = {"id": row[0], "started_at": row[1]} if row else None
    return {
        "fase_id": fase_id,
        "sessioni": sessioni,
        "totale_minuti": round(totale_minuti, 2),
        "totale_ore": round(totale_minuti / 60, 2),
        "timer_aperto": timer_aperto,
    }


# ──────────────────────────────────────────────
# WIP COMMESSA
# ──────────────────────────────────────────────

@router.get("/wip/{ordine_id}")
def get_wip(ordine_id: int, db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("SELECT id FROM ordini WHERE id = ?", (ordine_id,))
    if not cur.fetchone():
        raise HTTPException(404, "Ordine non trovato")
    cur.execute("""
        SELECT w.*, a.giacenza as giacenza_attuale
        FROM wip_commessa w
        LEFT JOIN articoli a ON a.id = w.articolo_id
        WHERE w.ordine_id = ?
        ORDER BY w.stato, w.codice_articolo
    """, (ordine_id,))
    righe = _rows2list(cur, cur.fetchall())
    totale = len(righe)
    prelevate = sum(1 for r in righe if r["stato"] == "prelevato")
    return {
        "ordine_id": ordine_id,
        "righe": righe,
        "totale": totale,
        "prelevate": prelevate,
        "percentuale": round(prelevate / totale * 100) if totale else 0,
    }


@router.post("/wip/{ordine_id}/popola")
def popola_wip(ordine_id: int, db: Session = Depends(get_db)):
    conn = _raw(db)
    inseriti = popola_wip_da_bom(conn, ordine_id)
    return {"ok": True, "inseriti": inseriti}


@router.put("/wip/{ordine_id}/{wip_id}")
def aggiorna_wip(ordine_id: int, wip_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    cur.execute("SELECT id FROM wip_commessa WHERE id = ? AND ordine_id = ?", (wip_id, ordine_id))
    if not cur.fetchone():
        raise HTTPException(404, "Riga WIP non trovata")
    allowed = ("quantita_prelevata", "stato", "note")
    fields = {k: v for k, v in payload.items() if k in allowed}
    if not fields:
        raise HTTPException(400, "Nessun campo valido")
    if "quantita_prelevata" in fields and "stato" not in fields:
        cur.execute("SELECT quantita_necessaria FROM wip_commessa WHERE id = ?", (wip_id,))
        qnec = cur.fetchone()[0]
        qprel = fields["quantita_prelevata"]
        if qprel >= qnec:
            fields["stato"] = "prelevato"
        elif qprel > 0:
            fields["stato"] = "parziale"
        else:
            fields["stato"] = "da_prelevare"
    set_clause = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = wip_id
    cur.execute(f"UPDATE wip_commessa SET {set_clause}, updated_at = datetime('now') WHERE id = :id", fields)
    conn.commit()
    cur.execute("SELECT * FROM wip_commessa WHERE id = ?", (wip_id,))
    return _row2dict(cur, cur.fetchone())


# ──────────────────────────────────────────────
# GANTT
# ──────────────────────────────────────────────

@router.get("/gantt")
def get_gantt(
    data_inizio: Optional[str] = Query(None, description="YYYY-MM-DD"),
    data_fine:   Optional[str] = Query(None, description="YYYY-MM-DD"),
    db: Session = Depends(get_db)
):
    conn = _raw(db); cur = conn.cursor()

    oggi = date.today()
    d_inizio = data_inizio or (oggi - timedelta(days=30)).isoformat()
    d_fine   = data_fine   or (oggi + timedelta(days=60)).isoformat()

    cur.execute("""
        SELECT o.id, p.numero_preventivo, o.stato,
               p.customer_name, o.data_consegna_prevista AS data_consegna,
               dc.quantita
        FROM ordini o
        LEFT JOIN preventivi p  ON p.id = o.preventivo_id
        LEFT JOIN dati_commessa dc ON dc.preventivo_id = o.preventivo_id
        WHERE o.stato IN ('in_produzione','completato')
        ORDER BY o.data_consegna_prevista NULLS LAST, o.id
    """)
    ordini = _rows2list(cur, cur.fetchall())

    risultato = []
    for ordine in ordini:
        cur.execute("""
            SELECT fp.id, fp.nome, fp.ordine, fp.stato,
                   fp.durata_stimata_ore, fp.durata_reale_ore,
                   fp.data_inizio_prevista, fp.data_fine_prevista,
                   fp.data_inizio_reale, fp.data_fine_reale,
                   cl.nome as centro_nome, cl.colore as centro_colore
            FROM fasi_produzione fp
            LEFT JOIN centri_lavoro cl ON cl.id = fp.centro_lavoro_id
            WHERE fp.ordine_id = ?
            ORDER BY fp.ordine, fp.id
        """, (ordine["id"],))
        fasi = _rows2list(cur, cur.fetchall())
        avanzamento = _avanzamento_ordine(cur, ordine["id"])
        risultato.append({
            **ordine,
            "fasi": fasi,
            "avanzamento": avanzamento,
        })

    return {
        "range_inizio": d_inizio,
        "range_fine": d_fine,
        "oggi": oggi.isoformat(),
        "commesse": risultato,
    }


@router.put("/gantt/drag")
def gantt_drag(payload: dict = Body(...), db: Session = Depends(get_db)):
    fase_id = payload.get("fase_id")
    d_inizio = payload.get("data_inizio_prevista")
    d_fine   = payload.get("data_fine_prevista")
    if not fase_id or not d_inizio or not d_fine:
        raise HTTPException(400, "Campi obbligatori: fase_id, data_inizio_prevista, data_fine_prevista")
    conn = _raw(db); cur = conn.cursor()
    cur.execute("SELECT id FROM fasi_produzione WHERE id = ?", (fase_id,))
    if not cur.fetchone():
        raise HTTPException(404, "Fase non trovata")
    cur.execute("""
        UPDATE fasi_produzione
        SET data_inizio_prevista = ?, data_fine_prevista = ?, updated_at = datetime('now')
        WHERE id = ?
    """, (d_inizio, d_fine, fase_id))
    conn.commit()
    return {"ok": True, "fase_id": fase_id, "data_inizio_prevista": d_inizio, "data_fine_prevista": d_fine}


# ──────────────────────────────────────────────
# DASHBOARD
# ──────────────────────────────────────────────

@router.get("/dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    conn = _raw(db); cur = conn.cursor()
    oggi = date.today().isoformat()

    cur.execute("SELECT COUNT(*) FROM ordini WHERE stato = 'in_produzione'")
    commesse_in_produzione = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*) FROM ordini WHERE stato = 'completato'
        AND updated_at >= date('now','-30 days')
    """)
    completate_30gg = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*) FROM fasi_produzione
        WHERE data_fine_prevista < ? AND stato NOT IN ('completata','saltata')
    """, (oggi,))
    fasi_in_ritardo = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM fasi_produzione WHERE stato = 'in_corso'")
    fasi_in_corso = cur.fetchone()[0]

    cur.execute("""
        SELECT COUNT(*) FROM fasi_produzione
        WHERE data_inizio_prevista = ? AND stato = 'da_fare'
    """, (oggi,))
    fasi_oggi = cur.fetchone()[0]

    cur.execute("""
        SELECT o.id, p.numero_preventivo, p.customer_name, o.stato,
               o.data_consegna_prevista AS data_consegna, dc.quantita
        FROM ordini o
        LEFT JOIN preventivi p  ON p.id = o.preventivo_id
        LEFT JOIN dati_commessa dc ON dc.preventivo_id = o.preventivo_id
        WHERE o.stato IN ('in_produzione','completato')
        ORDER BY o.data_consegna_prevista NULLS LAST, o.id
        LIMIT 20
    """)
    commesse_rows = _rows2list(cur, cur.fetchall())
    commesse = []
    for c in commesse_rows:
        av = _avanzamento_ordine(cur, c["id"])
        commesse.append({**c, "avanzamento": av})

    cur.execute("""
        SELECT COUNT(*) FROM wip_commessa w
        JOIN ordini o ON o.id = w.ordine_id
        WHERE w.stato = 'da_prelevare' AND o.stato = 'in_produzione'
    """)
    wip_da_prelevare = cur.fetchone()[0]

    return {
        "kpi": {
            "commesse_in_produzione": commesse_in_produzione,
            "completate_30gg": completate_30gg,
            "fasi_in_ritardo": fasi_in_ritardo,
            "fasi_in_corso": fasi_in_corso,
            "fasi_da_iniziare_oggi": fasi_oggi,
            "wip_da_prelevare": wip_da_prelevare,
        },
        "commesse": commesse,
    }
