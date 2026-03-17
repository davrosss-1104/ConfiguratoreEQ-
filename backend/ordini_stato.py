"""
ordini_stato.py — Macchina a stati ordini + API transizioni
=============================================================

Stati: confermato → in_produzione → completato → spedito → fatturato
       qualsiasi (tranne fatturato) ↔ sospeso
       qualsiasi (tranne fatturato) → annullato

Integrazione in main.py:
  from ordini_stato import router as ordini_stato_router
  app.include_router(ordini_stato_router)

IMPORTANTE: Registrare PRIMA delle route inline /ordini/{ordine_id}
            Eliminare le vecchie route inline STATI_ORDINE / api_cambio_stato / api_storico_stati
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger("ordini_stato")

try:
    from database import get_db
except ImportError:
    from main import get_db

try:
    from moduli_attivabili import is_modulo_attivo
except ImportError:
    def is_modulo_attivo(db, codice):
        return False

router = APIRouter(tags=["ordini-stato"])

# ==========================================
# DEFINIZIONE STATI
# ==========================================

STATI_ORDINE = {
    "confermato": {
        "label": "Confermato",
        "colore": "#4F46E5",
        "colore_bg": "bg-indigo-100 text-indigo-800 border-indigo-300",
        "icona": "check-circle",
        "ordine": 1,
        "terminale": False,
    },
    "in_produzione": {
        "label": "In Produzione",
        "colore": "#D97706",
        "colore_bg": "bg-amber-100 text-amber-800 border-amber-300",
        "icona": "settings",
        "ordine": 2,
        "terminale": False,
    },
    "completato": {
        "label": "Completato",
        "colore": "#059669",
        "colore_bg": "bg-emerald-100 text-emerald-800 border-emerald-300",
        "icona": "package-check",
        "ordine": 3,
        "terminale": False,
    },
    "spedito": {
        "label": "Spedito",
        "colore": "#2563EB",
        "colore_bg": "bg-blue-100 text-blue-800 border-blue-300",
        "icona": "truck",
        "ordine": 4,
        "terminale": False,
    },
    "fatturato": {
        "label": "Fatturato",
        "colore": "#7C3AED",
        "colore_bg": "bg-violet-100 text-violet-800 border-violet-300",
        "icona": "file-text",
        "ordine": 5,
        "terminale": True,
    },
    "sospeso": {
        "label": "Sospeso",
        "colore": "#DC2626",
        "colore_bg": "bg-red-100 text-red-800 border-red-300",
        "icona": "pause-circle",
        "ordine": 90,
        "terminale": False,
    },
    "annullato": {
        "label": "Annullato",
        "colore": "#6B7280",
        "colore_bg": "bg-gray-200 text-gray-600 border-gray-300",
        "icona": "x-circle",
        "ordine": 99,
        "terminale": True,
    },
}

TRANSIZIONI = {
    "confermato":    ["in_produzione", "sospeso", "annullato"],
    "in_produzione": ["completato", "sospeso", "annullato"],
    "completato":    ["spedito", "sospeso", "annullato"],
    "spedito":       ["fatturato", "sospeso", "annullato"],
    "fatturato":     [],
    "sospeso":       ["__resume__"],
    "annullato":     [],
}

ETICHETTE_TRANSIZIONE = {
    "in_produzione": "Avvia Produzione",
    "completato":    "Segna Completato",
    "spedito":       "Segna Spedito",
    "fatturato":     "Segna Fatturato",
    "sospeso":       "Sospendi Ordine",
    "annullato":     "Annulla Ordine",
    "__resume__":    "Riprendi Ordine",
}

STILI_TRANSIZIONE = {
    "in_produzione": "bg-amber-500 hover:bg-amber-600 text-white",
    "completato":    "bg-emerald-500 hover:bg-emerald-600 text-white",
    "spedito":       "bg-blue-500 hover:bg-blue-600 text-white",
    "fatturato":     "bg-violet-500 hover:bg-violet-600 text-white",
    "sospeso":       "bg-red-100 hover:bg-red-200 text-red-700 border border-red-300",
    "annullato":     "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300",
    "__resume__":    "bg-green-500 hover:bg-green-600 text-white",
}


# ==========================================
# HELPERS
# ==========================================

def _ensure_storico_table(cursor):
    """Crea tabella storico se non esiste — schema compatibile col vecchio."""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ordini_storico_stato (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ordine_id INTEGER NOT NULL,
            stato_precedente TEXT,
            stato_nuovo TEXT NOT NULL,
            motivo TEXT,
            utente TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (ordine_id) REFERENCES ordini(id) ON DELETE CASCADE
        )
    """)


def _ensure_stato_precedente_col(cursor):
    """Aggiunge colonna stato_precedente a ordini se manca."""
    try:
        cursor.execute("PRAGMA table_info(ordini)")
        cols = [r[1] for r in cursor.fetchall()]
        if "stato_precedente" not in cols:
            cursor.execute("ALTER TABLE ordini ADD COLUMN stato_precedente TEXT")
    except Exception:
        pass


def _get_ordine_raw(cursor, ordine_id: int) -> dict:
    cursor.execute("SELECT * FROM ordini WHERE id = ?", (ordine_id,))
    row = cursor.fetchone()
    if not row:
        return None
    cols = [d[0] for d in cursor.description]
    return dict(zip(cols, row))


def _valida_transizione(stato_corrente: str, stato_nuovo: str, ordine: dict, db: Session) -> str:
    """Ritorna None se ok, altrimenti messaggio errore."""
    if stato_corrente not in TRANSIZIONI:
        return f"Stato corrente '{stato_corrente}' non riconosciuto"

    # Resume da sospeso
    if stato_corrente == "sospeso":
        stato_precedente = ordine.get("stato_precedente")
        if not stato_precedente or stato_precedente == "sospeso":
            return "Impossibile riprendere: stato precedente non registrato"
        if stato_nuovo != stato_precedente:
            return f"Da sospeso si puo' solo tornare a '{stato_precedente}'"
        return None

    # Sospeso — sempre permesso da stati non terminali
    if stato_nuovo == "sospeso":
        if STATI_ORDINE.get(stato_corrente, {}).get("terminale"):
            return f"Non e' possibile sospendere un ordine in stato '{stato_corrente}'"
        return None

    # Annullato
    if stato_nuovo == "annullato":
        if STATI_ORDINE.get(stato_corrente, {}).get("terminale"):
            return f"Non e' possibile annullare un ordine in stato '{stato_corrente}'"
        return None

    transizioni_possibili = TRANSIZIONI.get(stato_corrente, [])
    if stato_nuovo not in transizioni_possibili:
        nomi = [STATI_ORDINE.get(s, {}).get("label", s) for s in transizioni_possibili if s not in ("sospeso", "annullato")]
        return f"Transizione '{stato_corrente}' -> '{stato_nuovo}' non permessa. Prossimi stati: {', '.join(nomi)}"

    # Condizioni specifiche
    if stato_nuovo == "in_produzione":
        if not ordine.get("bom_esplosa"):
            return "Per avviare la produzione e' necessario esplodere la BOM prima"

    # Impianti obbligatori se modulo ticketing attivo
    if stato_nuovo == "in_produzione":
        if is_modulo_attivo(db, "ticketing"):
            try:
                prev_id = ordine.get("preventivo_id")
                if prev_id:
                    result = db.execute(
                        text("SELECT numeri_impianto FROM dati_commessa WHERE preventivo_id = :pid"),
                        {"pid": prev_id}
                    ).fetchone()
                    if not result or not result[0] or not str(result[0]).strip():
                        return "Il modulo Ticketing e' attivo: inserire almeno un numero impianto nei Dati Commessa prima di avviare la produzione"
            except Exception:
                pass

    if stato_nuovo == "fatturato":
        if not is_modulo_attivo(db, "fatturazione"):
            return "Il modulo fatturazione non e' attivo"
        try:
            result = db.execute(
                text("SELECT COUNT(*) FROM fatture WHERE ordine_id = :oid AND stato_sdi != 'bozza'"),
                {"oid": ordine["id"]}
            ).fetchone()
            if not result or result[0] == 0:
                try:
                    result2 = db.execute(
                        text("SELECT COUNT(*) FROM fe_fatture_ordini fo JOIN fatture f ON f.id = fo.fattura_id WHERE fo.ordine_id = :oid AND f.stato_sdi != 'bozza'"),
                        {"oid": ordine["id"]}
                    ).fetchone()
                    if not result2 or result2[0] == 0:
                        return "Nessuna fattura emessa collegata a questo ordine"
                except Exception:
                    return "Nessuna fattura emessa collegata a questo ordine"
        except Exception:
            return "Impossibile verificare le fatture collegate"

    return None


def _registra_transizione(cursor, ordine_id, stato_da, stato_a, motivo=None, utente=None):
    """Registra transizione — colonne compatibili col vecchio schema."""
    cursor.execute("""
        INSERT INTO ordini_storico_stato (ordine_id, stato_precedente, stato_nuovo, motivo, utente, created_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
    """, (ordine_id, stato_da, stato_a, motivo, utente or "utente"))


# ==========================================
# HOOKS MODULI
# ==========================================

def _hook_in_produzione(conn, ordine_id: int, created_by: str, db: Session) -> dict:
    """
    Hook chiamato alla transizione → in_produzione.
    1. Crea fasi produzione da template (se modulo produzione attivo)
    2. Popola WIP da BOM (se modulo produzione attivo)
    Ritorna warning se nessun template trovato.
    """
    warning = None
    if not is_modulo_attivo(db, "produzione"):
        return {"warning": None}
    try:
        from produzione_api import crea_fasi_da_template, popola_wip_da_bom
        result = crea_fasi_da_template(conn, ordine_id, created_by)
        if not result["ok"]:
            warning = result.get("warning")
        else:
            # Popola WIP dalla BOM
            try:
                popola_wip_da_bom(conn, ordine_id)
            except Exception as e_wip:
                logger.warning(f"WIP popola fallito per ordine {ordine_id}: {e_wip}")
    except Exception as e:
        logger.warning(f"Hook in_produzione fallito per ordine {ordine_id}: {e}")
        warning = f"Fasi produzione non create automaticamente: {e}"
    return {"warning": warning}


def _hook_spedito(conn, ordine_id: int, created_by: str, db: Session):
    """Hook chiamato alla transizione → spedito. Scarica commessa dal magazzino."""
    if not is_modulo_attivo(db, "magazzino"):
        return
    try:
        from magazzino_api import scarica_commessa_per_ordine
        scarica_commessa_per_ordine(conn, ordine_id, created_by)
        conn.commit()
    except Exception as e:
        logger.warning(f"Scarico magazzino fallito per ordine {ordine_id}: {e}")


# ==========================================
# ENDPOINTS
# ==========================================

@router.get("/ordini/stati-metadata")
def get_stati_metadata():
    return {
        "stati": STATI_ORDINE,
        "transizioni": TRANSIZIONI,
        "etichette": ETICHETTE_TRANSIZIONE,
        "stili": STILI_TRANSIZIONE,
    }


@router.get("/ordini/stati-config")
def get_stati_config():
    """Compatibilita' con vecchio endpoint."""
    return STATI_ORDINE


@router.get("/ordini/{ordine_id}/transizioni")
def get_transizioni_disponibili(ordine_id: int, db: Session = Depends(get_db)):
    conn = db.get_bind().raw_connection()
    cursor = conn.cursor()
    _ensure_stato_precedente_col(cursor)
    ordine = _get_ordine_raw(cursor, ordine_id)
    if not ordine:
        raise HTTPException(404, "Ordine non trovato")

    stato = ordine.get("stato", "confermato")
    stato_info = STATI_ORDINE.get(stato, {})

    transizioni = []

    if stato == "sospeso":
        stato_precedente = ordine.get("stato_precedente")
        if stato_precedente and stato_precedente != "sospeso":
            prev_info = STATI_ORDINE.get(stato_precedente, {})
            transizioni.append({
                "stato_a": stato_precedente,
                "etichetta": f"Riprendi -> {prev_info.get('label', stato_precedente)}",
                "stile": STILI_TRANSIZIONE.get("__resume__", ""),
                "icona": "play-circle",
                "tipo": "resume",
                "richiede_note": False,
                "bloccata": False,
                "motivo_blocco": None,
            })
    else:
        for st in TRANSIZIONI.get(stato, []):
            if st == "__resume__":
                continue
            info = STATI_ORDINE.get(st, {})
            errore = _valida_transizione(stato, st, ordine, db)

            # Warning produzione (non blocca, ma segnala)
            warning_produzione = None
            if st == "in_produzione" and not errore and is_modulo_attivo(db, "produzione"):
                try:
                    cursor.execute("SELECT COUNT(*) FROM fasi_template WHERE attivo = 1")
                    n_template = cursor.fetchone()[0]
                    if n_template == 0:
                        warning_produzione = "Nessun template fasi configurato. Le fasi dovranno essere create manualmente."
                except Exception:
                    pass

            transizioni.append({
                "stato_a": st,
                "etichetta": ETICHETTE_TRANSIZIONE.get(st, info.get("label", st)),
                "stile": STILI_TRANSIZIONE.get(st, ""),
                "icona": info.get("icona", "arrow-right"),
                "tipo": "sospendi" if st == "sospeso" else "annulla" if st == "annullato" else "avanza",
                "richiede_note": st in ("sospeso", "annullato"),
                "bloccata": errore is not None,
                "motivo_blocco": errore,
                "warning": warning_produzione,
            })

    return {
        "ordine_id": ordine_id,
        "stato_corrente": stato,
        "stato_info": stato_info,
        "stato_precedente": ordine.get("stato_precedente"),
        "transizioni": transizioni,
    }


@router.put("/ordini/{ordine_id}/stato")
def cambia_stato_ordine(ordine_id: int, payload: dict = Body(...), db: Session = Depends(get_db)):
    """
    Accetta sia formato nuovo che vecchio:
      Nuovo: { "stato_nuovo": "...", "note": "...", "created_by": "..." }
      Vecchio: { "stato": "...", "motivo": "...", "utente": "..." }
    """
    stato_nuovo = payload.get("stato_nuovo") or payload.get("stato")
    note = payload.get("note") or payload.get("motivo", "")
    created_by = payload.get("created_by") or payload.get("utente", "utente")

    if not stato_nuovo:
        raise HTTPException(400, "Campo 'stato_nuovo' (o 'stato') obbligatorio")

    stato_nuovo = stato_nuovo.strip()
    if stato_nuovo not in STATI_ORDINE:
        raise HTTPException(400, f"Stato '{stato_nuovo}' non riconosciuto. Validi: {list(STATI_ORDINE.keys())}")

    conn = db.get_bind().raw_connection()
    cursor = conn.cursor()
    _ensure_storico_table(cursor)
    _ensure_stato_precedente_col(cursor)

    ordine = _get_ordine_raw(cursor, ordine_id)
    if not ordine:
        raise HTTPException(404, "Ordine non trovato")

    stato_corrente = ordine.get("stato", "confermato")

    errore = _valida_transizione(stato_corrente, stato_nuovo, ordine, db)
    if errore:
        raise HTTPException(400, errore)

    # Update ordine
    if stato_nuovo == "sospeso":
        try:
            cursor.execute(
                "UPDATE ordini SET stato = ?, stato_precedente = ?, updated_at = datetime('now') WHERE id = ?",
                (stato_nuovo, stato_corrente, ordine_id)
            )
        except Exception:
            cursor.execute(
                "UPDATE ordini SET stato = ?, updated_at = datetime('now') WHERE id = ?",
                (stato_nuovo, ordine_id)
            )
    elif stato_corrente == "sospeso":
        try:
            cursor.execute(
                "UPDATE ordini SET stato = ?, stato_precedente = NULL, updated_at = datetime('now') WHERE id = ?",
                (stato_nuovo, ordine_id)
            )
        except Exception:
            cursor.execute(
                "UPDATE ordini SET stato = ?, updated_at = datetime('now') WHERE id = ?",
                (stato_nuovo, ordine_id)
            )
    else:
        cursor.execute(
            "UPDATE ordini SET stato = ?, updated_at = datetime('now') WHERE id = ?",
            (stato_nuovo, ordine_id)
        )

    _registra_transizione(cursor, ordine_id, stato_corrente, stato_nuovo, note, created_by)
    conn.commit()

    # ── HOOK: in_produzione ──
    hook_warning = None
    if stato_nuovo == "in_produzione":
        hook_result = _hook_in_produzione(conn, ordine_id, created_by, db)
        hook_warning = hook_result.get("warning")

    # ── HOOK: spedito ──
    if stato_nuovo == "spedito":
        _hook_spedito(conn, ordine_id, created_by, db)

    return {
        "ordine_id": ordine_id,
        "stato_precedente": stato_corrente,
        "stato_nuovo": stato_nuovo,
        "stato_info": STATI_ORDINE.get(stato_nuovo, {}),
        "transizioni_disponibili": TRANSIZIONI.get(stato_nuovo, []),
        "note": note,
        "warning": hook_warning,
    }


@router.get("/ordini/{ordine_id}/storico-stati")
def get_storico_stati(ordine_id: int, db: Session = Depends(get_db)):
    conn = db.get_bind().raw_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM ordini WHERE id = ?", (ordine_id,))
    if not cursor.fetchone():
        raise HTTPException(404, "Ordine non trovato")

    _ensure_storico_table(cursor)

    cursor.execute("""
        SELECT id, stato_precedente, stato_nuovo, motivo, utente, created_at
        FROM ordini_storico_stato
        WHERE ordine_id = ?
        ORDER BY created_at ASC, id ASC
    """, (ordine_id,))

    cols = [d[0] for d in cursor.description]
    rows = []
    for row in cursor.fetchall():
        entry = dict(zip(cols, row))
        entry["stato_da"] = entry.pop("stato_precedente", "") or ""
        entry["stato_a"] = entry.pop("stato_nuovo", "")
        entry["note"] = entry.pop("motivo", "") or ""
        entry["created_by"] = entry.pop("utente", "") or ""
        entry["stato_a_info"] = STATI_ORDINE.get(entry["stato_a"], {})
        entry["stato_da_info"] = STATI_ORDINE.get(entry["stato_da"], {})
        rows.append(entry)

    return {"ordine_id": ordine_id, "storico": rows}
