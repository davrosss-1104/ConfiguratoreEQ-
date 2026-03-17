"""
dashboard_api.py — KPI aggregati per la Dashboard centralizzata
===============================================================
Endpoint:
  GET /dashboard/kpi          → tutti i KPI in un colpo solo
  GET /dashboard/kpi/produzione
  GET /dashboard/kpi/acquisti
  GET /dashboard/kpi/fatturazione
  GET /dashboard/kpi/tempi
  GET /dashboard/alert        → lista alert attivi (soglie superate)
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

try:
    from database import get_db
except ImportError:
    from main import get_db

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _q(db: Session, sql: str, params: dict | None = None) -> list:
    try:
        rows = db.execute(text(sql), params or {}).fetchall()
        return [dict(zip(r.keys(), r)) for r in rows]
    except Exception:
        return []


def _scalar(db: Session, sql: str, params: dict | None = None, default: Any = 0) -> Any:
    try:
        row = db.execute(text(sql), params or {}).fetchone()
        if row is None:
            return default
        val = row[0]
        return val if val is not None else default
    except Exception:
        return default


def _oggi() -> str:
    return date.today().isoformat()


def _fra_giorni(n: int) -> str:
    return (date.today() + timedelta(days=n)).isoformat()


# ══════════════════════════════════════════════════════════════════════════════
# KPI PRODUZIONE
# ══════════════════════════════════════════════════════════════════════════════

def _kpi_produzione(db: Session) -> dict:
    oggi = _oggi()

    commesse_in_produzione = _scalar(db,
        "SELECT COUNT(*) FROM ordini WHERE stato = 'in_produzione'")

    commesse_in_ritardo = _scalar(db, """
        SELECT COUNT(DISTINCT fp.ordine_id)
        FROM fasi_produzione fp
        WHERE fp.stato NOT IN ('completata','saltata')
          AND fp.data_fine_prevista < :oggi
    """, {"oggi": oggi})

    fasi_completate_oggi = _scalar(db, """
        SELECT COUNT(*) FROM fasi_produzione
        WHERE stato = 'completata'
          AND date(data_fine_reale) = :oggi
    """, {"oggi": oggi})

    fasi_in_corso = _scalar(db,
        "SELECT COUNT(*) FROM fasi_produzione WHERE stato = 'in_corso'")

    # Efficienza ore: reali vs stimate (ultime 30 fasi completate)
    eff_rows = _q(db, """
        SELECT durata_stimata_ore, durata_reale_ore
        FROM fasi_produzione
        WHERE stato = 'completata'
          AND durata_stimata_ore > 0
          AND durata_reale_ore IS NOT NULL
        ORDER BY data_fine_reale DESC
        LIMIT 30
    """)
    if eff_rows:
        tot_stimate = sum(r["durata_stimata_ore"] for r in eff_rows)
        tot_reali   = sum(r["durata_reale_ore"]   for r in eff_rows)
        efficienza  = round((tot_stimate / tot_reali) * 100) if tot_reali > 0 else 100
    else:
        efficienza = None

    # Trend commesse completate (ultimi 8 mesi)
    trend = _q(db, """
        SELECT strftime('%Y-%m', updated_at) AS mese, COUNT(*) AS n
        FROM preventivi
        WHERE stato IN ('spedito','completato','chiuso')
          AND updated_at >= date('now','-8 months')
        GROUP BY mese
        ORDER BY mese
    """)

    # WIP: articoli da prelevare
    wip_da_prelevare = _scalar(db,
        "SELECT COUNT(*) FROM wip_commessa WHERE stato = 'da_prelevare'",
        default=0)
    wip_parziale = _scalar(db,
        "SELECT COUNT(*) FROM wip_commessa WHERE stato = 'parziale'",
        default=0)

    return {
        "commesse_in_produzione": commesse_in_produzione,
        "commesse_in_ritardo":    commesse_in_ritardo,
        "fasi_in_corso":          fasi_in_corso,
        "fasi_completate_oggi":   fasi_completate_oggi,
        "efficienza_percent":     efficienza,
        "wip_da_prelevare":       wip_da_prelevare,
        "wip_parziale":           wip_parziale,
        "trend_completate":       trend,
    }


# ══════════════════════════════════════════════════════════════════════════════
# KPI ACQUISTI
# ══════════════════════════════════════════════════════════════════════════════

def _kpi_acquisti(db: Session) -> dict:
    oggi = _oggi()
    fra7  = _fra_giorni(7)

    oda_aperti = _scalar(db, """
        SELECT COUNT(*) FROM ordini_acquisto
        WHERE stato NOT IN ('ricevuto','chiuso','annullato')
    """)

    oda_in_ritardo = _scalar(db, """
        SELECT COUNT(*) FROM ordini_acquisto
        WHERE stato NOT IN ('ricevuto','chiuso','annullato')
          AND data_consegna_prevista < :oggi
    """, {"oggi": oggi})

    oda_in_scadenza = _scalar(db, """
        SELECT COUNT(*) FROM ordini_acquisto
        WHERE stato NOT IN ('ricevuto','chiuso','annullato')
          AND data_consegna_prevista BETWEEN :oggi AND :fra7
    """, {"oggi": oggi, "fra7": fra7})

    valore_aperto = _scalar(db, """
        SELECT COALESCE(SUM(totale_imponibile), 0) FROM ordini_acquisto
        WHERE stato NOT IN ('ricevuto','chiuso','annullato')
    """)

    # Valore ODA per stato (grafico a barre)
    per_stato = _q(db, """
        SELECT stato,
               COUNT(*) AS n,
               COALESCE(SUM(totale_imponibile), 0) AS valore
        FROM ordini_acquisto
        WHERE stato != 'annullato'
        GROUP BY stato
        ORDER BY n DESC
    """)

    # Top 5 fornitori per volume (ultimi 90 gg)
    top_fornitori = _q(db, """
        SELECT fornitore_nome AS fornitore,
               COUNT(*) AS n_oda,
               COALESCE(SUM(totale_imponibile), 0) AS valore
        FROM ordini_acquisto
        WHERE created_at >= date('now','-90 days')
          AND stato != 'annullato'
        GROUP BY fornitore_nome
        ORDER BY valore DESC
        LIMIT 5
    """)

    # Trend ODA (ultimi 8 mesi)
    trend = _q(db, """
        SELECT strftime('%Y-%m', data_ordine) AS mese,
               COUNT(*) AS n,
               COALESCE(SUM(totale_imponibile), 0) AS valore
        FROM ordini_acquisto
        WHERE data_ordine >= date('now','-8 months')
          AND stato != 'annullato'
        GROUP BY mese
        ORDER BY mese
    """)

    return {
        "oda_aperti":       oda_aperti,
        "oda_in_ritardo":   oda_in_ritardo,
        "oda_in_scadenza":  oda_in_scadenza,
        "valore_aperto":    float(valore_aperto),
        "per_stato":        per_stato,
        "top_fornitori":    top_fornitori,
        "trend":            trend,
    }


# ══════════════════════════════════════════════════════════════════════════════
# KPI FATTURAZIONE
# ══════════════════════════════════════════════════════════════════════════════

def _kpi_fatturazione(db: Session) -> dict:
    oggi = _oggi()

    fatture_emesse_mese = _scalar(db, """
        SELECT COUNT(*) FROM fatture
        WHERE strftime('%Y-%m', data_fattura) = strftime('%Y-%m', 'now')
    """)

    fatturato_mese = _scalar(db, """
        SELECT COALESCE(SUM(importo_totale), 0) FROM fatture
        WHERE strftime('%Y-%m', data_fattura) = strftime('%Y-%m', 'now')
          AND stato != 'annullata'
    """)

    fatture_scadute = _scalar(db, """
        SELECT COUNT(*) FROM fatture
        WHERE stato NOT IN ('pagata','annullata')
          AND data_scadenza < :oggi
    """, {"oggi": oggi})

    fatturato_anno = _scalar(db, """
        SELECT COALESCE(SUM(importo_totale), 0) FROM fatture
        WHERE strftime('%Y', data_fattura) = strftime('%Y', 'now')
          AND stato != 'annullata'
    """)

    # Trend mensile fatturato (anno corrente)
    trend = _q(db, """
        SELECT strftime('%Y-%m', data_fattura) AS mese,
               COUNT(*) AS n,
               COALESCE(SUM(importo_totale), 0) AS valore
        FROM fatture
        WHERE strftime('%Y', data_fattura) = strftime('%Y', 'now')
          AND stato != 'annullata'
        GROUP BY mese
        ORDER BY mese
    """)

    # Fatture passive in attesa
    passive_da_approvare = _scalar(db, """
        SELECT COUNT(*) FROM fatture_passive
        WHERE stato IN ('ricevuta','da_contabilizzare')
    """)

    return {
        "fatture_emesse_mese":    fatture_emesse_mese,
        "fatturato_mese":         float(fatturato_mese),
        "fatturato_anno":         float(fatturato_anno),
        "fatture_scadute":        fatture_scadute,
        "passive_da_approvare":   passive_da_approvare,
        "trend_mensile":          trend,
    }


# ══════════════════════════════════════════════════════════════════════════════
# KPI TEMPI & ASSISTENZA
# ══════════════════════════════════════════════════════════════════════════════

def _kpi_tempi(db: Session) -> dict:
    oggi = _oggi()

    ticket_aperti = _scalar(db,
        "SELECT COUNT(*) FROM tickets WHERE stato NOT IN ('chiuso','risolto','annullato')")

    ticket_in_ritardo = _scalar(db, """
        SELECT COUNT(*) FROM tickets
        WHERE stato NOT IN ('chiuso','risolto','annullato')
          AND priorita IN ('alta','urgente')
          AND created_at < date('now','-3 days')
    """)

    ticket_oggi = _scalar(db, """
        SELECT COUNT(*) FROM tickets
        WHERE date(created_at) = :oggi
    """, {"oggi": oggi})

    ore_settimana = _scalar(db, """
        SELECT COALESCE(SUM(minuti), 0) / 60.0
        FROM ticket_sessioni
        WHERE started_at >= date('now','-7 days')
    """)

    # Ticket per stato
    per_stato = _q(db, """
        SELECT stato, COUNT(*) AS n
        FROM tickets
        GROUP BY stato
        ORDER BY n DESC
    """)

    # Top operatori ore settimana
    top_operatori = _q(db, """
        SELECT utente_username AS operatore,
               ROUND(SUM(minuti) / 60.0, 1) AS ore
        FROM ticket_sessioni
        WHERE started_at >= date('now','-7 days')
        GROUP BY utente_username
        ORDER BY ore DESC
        LIMIT 5
    """)

    # Trend ticket (ultimi 8 mesi)
    trend = _q(db, """
        SELECT strftime('%Y-%m', created_at) AS mese, COUNT(*) AS n
        FROM tickets
        WHERE created_at >= date('now','-8 months')
        GROUP BY mese
        ORDER BY mese
    """)

    return {
        "ticket_aperti":     ticket_aperti,
        "ticket_in_ritardo": ticket_in_ritardo,
        "ticket_oggi":       ticket_oggi,
        "ore_settimana":     round(float(ore_settimana), 1),
        "per_stato":         per_stato,
        "top_operatori":     top_operatori,
        "trend":             trend,
    }


# ══════════════════════════════════════════════════════════════════════════════
# ALERT
# ══════════════════════════════════════════════════════════════════════════════

def _build_alert(db: Session) -> list[dict]:
    alerts = []
    oggi = _oggi()
    fra7  = _fra_giorni(7)

    # Commesse in ritardo produzione
    n = _scalar(db, """
        SELECT COUNT(DISTINCT fp.ordine_id)
        FROM fasi_produzione fp
        WHERE fp.stato NOT IN ('completata','saltata')
          AND fp.data_fine_prevista < :oggi
    """, {"oggi": oggi})
    if n > 0:
        alerts.append({
            "tipo": "warning",
            "modulo": "produzione",
            "titolo": f"{n} commess{'a' if n == 1 else 'e'} in ritardo",
            "dettaglio": "Fasi non completate con scadenza superata",
            "azione": "/produzione",
        })

    # ODA scaduti
    n = _scalar(db, """
        SELECT COUNT(*) FROM ordini_acquisto
        WHERE stato NOT IN ('ricevuto','chiuso','annullato')
          AND data_consegna_prevista < :oggi
    """, {"oggi": oggi})
    if n > 0:
        alerts.append({
            "tipo": "danger",
            "modulo": "acquisti",
            "titolo": f"{n} ODA scadut{'o' if n == 1 else 'i'}",
            "dettaglio": "Data consegna prevista superata",
            "azione": "/acquisti/oda",
        })

    # ODA in scadenza prossimi 7 giorni
    n = _scalar(db, """
        SELECT COUNT(*) FROM ordini_acquisto
        WHERE stato NOT IN ('ricevuto','chiuso','annullato')
          AND data_consegna_prevista BETWEEN :oggi AND :fra7
    """, {"oggi": oggi, "fra7": fra7})
    if n > 0:
        alerts.append({
            "tipo": "warning",
            "modulo": "acquisti",
            "titolo": f"{n} ODA in scadenza entro 7 giorni",
            "dettaglio": "Verificare lo stato delle consegne",
            "azione": "/acquisti/oda",
        })

    # Fatture scadute
    n = _scalar(db, """
        SELECT COUNT(*) FROM fatture
        WHERE stato NOT IN ('pagata','annullata')
          AND data_scadenza < :oggi
    """, {"oggi": oggi})
    if n > 0:
        alerts.append({
            "tipo": "danger",
            "modulo": "fatturazione",
            "titolo": f"{n} fattura{'a' if n == 1 else 'e'} scadut{'a' if n == 1 else 'e'}",
            "dettaglio": "Pagamento non registrato oltre la scadenza",
            "azione": "/fatturazione",
        })

    # Articoli sotto scorta minima
    n = _scalar(db, """
        SELECT COUNT(*) FROM giacenze_magazzino g
        JOIN articoli a ON a.id = g.articolo_id
        WHERE a.scorta_minima IS NOT NULL
          AND a.scorta_minima > 0
          AND g.quantita_disponibile < a.scorta_minima
    """)
    if n > 0:
        alerts.append({
            "tipo": "warning",
            "modulo": "magazzino",
            "titolo": f"{n} articol{'o' if n == 1 else 'i'} sotto scorta",
            "dettaglio": "Giacenza disponibile inferiore alla scorta minima",
            "azione": "/magazzino",
        })

    # Ticket urgenti aperti da > 24h
    n = _scalar(db, """
        SELECT COUNT(*) FROM tickets
        WHERE priorita = 'urgente'
          AND stato NOT IN ('chiuso','risolto','annullato')
          AND created_at < datetime('now','-1 day')
    """)
    if n > 0:
        alerts.append({
            "tipo": "danger",
            "modulo": "assistenza",
            "titolo": f"{n} ticket urgent{'e' if n == 1 else 'i'} aperti da > 24h",
            "dettaglio": "Richiedono attenzione immediata",
            "azione": "/tickets",
        })

    return alerts


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/kpi")
def get_kpi_tutti(db: Session = Depends(get_db)):
    return {
        "produzione":   _kpi_produzione(db),
        "acquisti":     _kpi_acquisti(db),
        "fatturazione": _kpi_fatturazione(db),
        "tempi":        _kpi_tempi(db),
        "aggiornato_il": datetime.now().isoformat(),
    }


@router.get("/kpi/produzione")
def get_kpi_produzione(db: Session = Depends(get_db)):
    return _kpi_produzione(db)


@router.get("/kpi/acquisti")
def get_kpi_acquisti(db: Session = Depends(get_db)):
    return _kpi_acquisti(db)


@router.get("/kpi/fatturazione")
def get_kpi_fatturazione(db: Session = Depends(get_db)):
    return _kpi_fatturazione(db)


@router.get("/kpi/tempi")
def get_kpi_tempi(db: Session = Depends(get_db)):
    return _kpi_tempi(db)


@router.get("/alert")
def get_alert(db: Session = Depends(get_db)):
    return _build_alert(db)
