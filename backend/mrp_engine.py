"""
mrp_engine.py — Motore MRP (Material Requirements Planning)
============================================================
Logica pura, senza dipendenze FastAPI.
Importabile sia da mrp_api.py che da script standalone.

Flusso:
  1. Carica le commesse aperte con data consegna (da preventivi + dati_commessa)
  2. Per ogni commessa, esplode la BOM (tabella materiali del preventivo)
  3. Aggrega per articolo_id (o codice se articolo_id è NULL)
  4. Sottrae le giacenze disponibili (tabella articoli.giacenza)
  5. Sottrae le quantità già in ordine (ODA in stato inviato/parzialmente_ricevuto)
  6. Genera mrp_fabbisogni (lordo e netto) e mrp_proposte_ordine raggruppate per fornitore
"""

import sqlite3
import logging
from datetime import date, datetime, timedelta
from typing import Optional

logger = logging.getLogger("mrp_engine")


# ==========================================
# ENTRY POINT PRINCIPALE
# ==========================================

def esegui_run_mrp(
    db_path: str,
    orizzonte_giorni: int = 90,
    commessa_ids: Optional[list] = None,
    utente: str = "sistema",
) -> dict:
    """
    Esegue un run MRP completo.

    Parametri:
        db_path          : percorso assoluto al file SQLite
        orizzonte_giorni : considera solo commesse con consegna entro N giorni
        commessa_ids     : lista di preventivo_id da includere (None = tutte le aperte)
        utente           : username che ha lanciato il run

    Ritorna:
        {
            "run_id": int,
            "commesse_elaborate": int,
            "righe_fabbisogno": int,
            "proposte_generate": int,
            "avvisi": [ str, ... ]
        }
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        run_id = _crea_run(conn, orizzonte_giorni, utente)
        avvisi = []

        # 1. Carica commesse aperte
        commesse = _carica_commesse_aperte(conn, orizzonte_giorni, commessa_ids)
        if not commesse:
            avvisi.append("Nessuna commessa aperta trovata nell'orizzonte selezionato.")
            _chiudi_run(conn, run_id, 0, 0, 0, "completato")
            conn.commit()
            return {"run_id": run_id, "commesse_elaborate": 0,
                    "righe_fabbisogno": 0, "proposte_generate": 0, "avvisi": avvisi}

        # 2. Esplodi BOM per ogni commessa → fabbisogno lordo aggregato
        fabbisogno_lordo = _esplodi_bom(conn, commesse, avvisi)

        # 3. Carica giacenze e ODA in corso
        giacenze      = _carica_giacenze(conn)
        in_ordine     = _carica_in_ordine(conn)

        # 4. Calcola fabbisogno netto e salva
        righe_salvate = _salva_fabbisogni(conn, run_id, fabbisogno_lordo, giacenze, in_ordine)

        # 5. Genera proposte d'ordine raggruppate per fornitore
        proposte_generate = _genera_proposte(conn, run_id, fabbisogno_lordo, giacenze, in_ordine, avvisi)

        _chiudi_run(conn, run_id, len(commesse), righe_salvate, proposte_generate, "completato")
        conn.commit()

        return {
            "run_id":               run_id,
            "commesse_elaborate":   len(commesse),
            "righe_fabbisogno":     righe_salvate,
            "proposte_generate":    proposte_generate,
            "avvisi":               avvisi,
        }

    except Exception as e:
        logger.exception("Errore run MRP")
        conn.rollback()
        try:
            _chiudi_run(conn, run_id, 0, 0, 0, f"errore: {str(e)[:200]}")
            conn.commit()
        except Exception:
            pass
        raise
    finally:
        conn.close()


# ==========================================
# STEP 1 — CARICA COMMESSE APERTE
# ==========================================

def _carica_commesse_aperte(conn, orizzonte_giorni: int, commessa_ids: Optional[list]) -> list:
    """
    Ritorna lista di dict:
      { preventivo_id, numero_preventivo, customer_name, data_consegna, quantita }

    Usa dati_commessa.consegna_richiesta come data consegna.
    Se non c'è una data consegna, include la commessa con data=oggi+orizzonte.
    Filtra solo preventivi con status IN ('confirmed', 'in_produzione', 'draft')
    escludendo 'cancelled', 'delivered'.
    """
    data_limite = (date.today() + timedelta(days=orizzonte_giorni)).isoformat()

    base_query = """
        SELECT
            p.id                            AS preventivo_id,
            p.numero_preventivo,
            p.customer_name,
            p.status,
            COALESCE(dc.consegna_richiesta, ?) AS data_consegna,
            COALESCE(dc.quantita, 1)           AS quantita
        FROM preventivi p
        LEFT JOIN dati_commessa dc ON dc.preventivo_id = p.id
        WHERE p.status IN ('confirmed', 'confermato', 'in_produzione', 'in_lavorazione')
          AND (dc.consegna_richiesta IS NULL OR dc.consegna_richiesta <= ?)
    """
    params = [data_limite, data_limite]

    if commessa_ids:
        placeholders = ",".join("?" * len(commessa_ids))
        base_query += f" AND p.id IN ({placeholders})"
        params.extend(commessa_ids)

    base_query += " ORDER BY data_consegna ASC"

    cur = conn.cursor()
    cur.execute(base_query, params)
    return [dict(r) for r in cur.fetchall()]


# ==========================================
# STEP 2 — ESPLOSIONE BOM
# ==========================================

def _esplodi_bom(conn, commesse: list, avvisi: list) -> dict:
    """
    Esplode la BOM di ogni commessa e aggrega i fabbisogni.

    Usa la tabella `materiali` (righe BOM del preventivo già calcolate
    dal rule engine). Per i componenti con articolo_id valorizzato usa
    quello come chiave; altrimenti usa il codice articolo come fallback.

    Ritorna dict:
    {
      chiave: {
        "articolo_id": int|None,
        "codice":      str,
        "descrizione": str,
        "quantita_totale": float,
        "commesse":    [ {preventivo_id, numero_preventivo, quantita_commessa, quantita_componente} ],
        "data_consegna_prima": str,   # data consegna più vicina
      }
    }
    """
    cur = conn.cursor()
    aggregato: dict = {}

    for c in commesse:
        pid      = c["preventivo_id"]
        qtà_comm = float(c.get("quantita") or 1)

        cur.execute("""
            SELECT
                m.codice,
                m.descrizione,
                m.quantita,
                a.id           AS articolo_id,
                a.fornitore,
                a.codice_fornitore,
                a.lead_time_giorni,
                a.giacenza,
                a.scorta_minima,
                a.unita_misura
            FROM materiali m
            LEFT JOIN articoli a ON a.codice = m.codice
            WHERE m.preventivo_id = ?
              AND m.quantita > 0
        """, (pid,))

        righe = cur.fetchall()
        if not righe:
            avvisi.append(f"Commessa {c['numero_preventivo']}: nessun materiale in BOM.")
            continue

        for r in righe:
            codice      = r["codice"]
            articolo_id = r["articolo_id"]
            chiave      = str(articolo_id) if articolo_id else f"cod:{codice}"
            qty         = float(r["quantita"] or 0) * qtà_comm

            if chiave not in aggregato:
                aggregato[chiave] = {
                    "articolo_id":        articolo_id,
                    "codice":             codice,
                    "descrizione":        r["descrizione"] or "",
                    "fornitore":          r["fornitore"] or "",
                    "codice_fornitore":   r["codice_fornitore"] or "",
                    "lead_time_giorni":   int(r["lead_time_giorni"] or 0),
                    "unita_misura":       r["unita_misura"] or "PZ",
                    "giacenza_attuale":   float(r["giacenza"] or 0),
                    "scorta_minima":      float(r["scorta_minima"] or 0),
                    "quantita_totale":    0.0,
                    "commesse":           [],
                    "data_consegna_prima": c["data_consegna"],
                }

            aggregato[chiave]["quantita_totale"] += qty
            aggregato[chiave]["commesse"].append({
                "preventivo_id":      pid,
                "numero_preventivo":  c["numero_preventivo"],
                "quantita_commessa":  qtà_comm,
                "quantita_componente": qty,
                "data_consegna":      c["data_consegna"],
            })

            # Mantieni la data consegna più vicina
            d_att  = aggregato[chiave]["data_consegna_prima"] or "9999-12-31"
            d_nuov = c["data_consegna"] or "9999-12-31"
            if d_nuov < d_att:
                aggregato[chiave]["data_consegna_prima"] = c["data_consegna"]

    return aggregato


# ==========================================
# STEP 3 — GIACENZE E ODA IN CORSO
# ==========================================

def _carica_giacenze(conn) -> dict:
    """Ritorna { codice_articolo: giacenza_attuale } per tutti gli articoli."""
    cur = conn.cursor()
    cur.execute("SELECT codice, COALESCE(giacenza, 0) FROM articoli")
    return {r[0]: float(r[1]) for r in cur.fetchall()}


def _carica_in_ordine(conn) -> dict:
    """
    Ritorna { codice_articolo: quantita_ancora_da_ricevere }
    sommando le righe degli ODA in stato inviato o parzialmente_ricevuto.
    """
    cur = conn.cursor()
    cur.execute("""
        SELECT
            r.codice_articolo,
            SUM(r.quantita_ordinata - COALESCE(r.quantita_ricevuta, 0)) AS residuo
        FROM ordini_acquisto_righe r
        JOIN ordini_acquisto o ON o.id = r.oda_id
        WHERE o.stato IN ('inviato', 'parzialmente_ricevuto')
          AND r.codice_articolo IS NOT NULL
        GROUP BY r.codice_articolo
    """)
    return {r[0]: float(r[1] or 0) for r in cur.fetchall()}


# ==========================================
# STEP 4 — SALVA FABBISOGNI
# ==========================================

def _salva_fabbisogni(conn, run_id: int, fabbisogno: dict,
                      giacenze: dict, in_ordine: dict) -> int:
    """Inserisce le righe in mrp_fabbisogni. Ritorna il numero di righe inserite."""
    cur = conn.cursor()
    cur.execute("DELETE FROM mrp_fabbisogni WHERE run_id = ?", (run_id,))
    n = 0

    for chiave, item in fabbisogno.items():
        codice         = item["codice"]
        q_lordo        = item["quantita_totale"]
        disponibile    = giacenze.get(codice, 0.0) + in_ordine.get(codice, 0.0)
        q_netto        = max(0.0, q_lordo - disponibile)
        commesse_json  = _json_dumps(item["commesse"])

        cur.execute("""
            INSERT INTO mrp_fabbisogni (
                run_id, articolo_id, codice_articolo, descrizione,
                fornitore, unita_misura,
                quantita_fabbisogno_lordo, giacenza_disponibile,
                quantita_in_ordine, quantita_fabbisogno_netto,
                data_consegna_prima, commesse_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """, (
            run_id,
            item["articolo_id"],
            codice,
            item["descrizione"],
            item["fornitore"],
            item["unita_misura"],
            round(q_lordo, 4),
            round(giacenze.get(codice, 0.0), 4),
            round(in_ordine.get(codice, 0.0), 4),
            round(q_netto, 4),
            item["data_consegna_prima"],
            commesse_json,
        ))
        n += 1

    return n


# ==========================================
# STEP 5 — GENERA PROPOSTE ORDINE
# ==========================================

def _genera_proposte(conn, run_id: int, fabbisogno: dict,
                     giacenze: dict, in_ordine: dict, avvisi: list) -> int:
    """
    Raggruppa gli articoli con fabbisogno netto > 0 per fornitore
    e crea una proposta d'ordine per fornitore in mrp_proposte_ordine.
    Ritorna il numero di proposte create.
    """
    cur = conn.cursor()
    cur.execute("DELETE FROM mrp_proposte_ordine WHERE run_id = ?", (run_id,))

    # Raggruppa per fornitore
    per_fornitore: dict = {}
    for chiave, item in fabbisogno.items():
        codice  = item["codice"]
        q_netto = max(0.0, item["quantita_totale"] - giacenze.get(codice, 0.0) - in_ordine.get(codice, 0.0))
        if q_netto <= 0:
            continue

        fornitore = item["fornitore"] or "__SENZA_FORNITORE__"
        if fornitore not in per_fornitore:
            per_fornitore[fornitore] = {
                "fornitore":            fornitore,
                "data_consegna_prima":  item["data_consegna_prima"],
                "righe":                [],
            }

        per_fornitore[fornitore]["righe"].append({
            "articolo_id":      item["articolo_id"],
            "codice_articolo":  codice,
            "descrizione":      item["descrizione"],
            "unita_misura":     item["unita_misura"],
            "quantita":         round(q_netto, 4),
            "lead_time_giorni": item["lead_time_giorni"],
            "commesse":         item["commesse"],
        })

        # Aggiorna data consegna più vicina a livello fornitore
        d_att  = per_fornitore[fornitore]["data_consegna_prima"] or "9999-12-31"
        d_nuov = item["data_consegna_prima"] or "9999-12-31"
        if d_nuov < d_att:
            per_fornitore[fornitore]["data_consegna_prima"] = item["data_consegna_prima"]

    if not per_fornitore:
        avvisi.append("Fabbisogno netto zero: giacenze e ODA in corso coprono tutti i materiali necessari.")
        return 0

    if "__SENZA_FORNITORE__" in per_fornitore:
        n_art = len(per_fornitore["__SENZA_FORNITORE__"]["righe"])
        avvisi.append(f"{n_art} articolo/i senza fornitore assegnato: raggruppati in proposta 'Non assegnato'.")

    n = 0
    for fornitore, gruppo in per_fornitore.items():
        # Cerca fornitore_id nella tabella fornitori
        fornitore_id = _cerca_fornitore_id(conn, fornitore)

        # Data consegna suggerita = prima data commessa − lead time max delle righe
        lead_max   = max((r["lead_time_giorni"] for r in gruppo["righe"]), default=0)
        data_prima = gruppo["data_consegna_prima"]
        if data_prima and data_prima != "9999-12-31":
            try:
                dt = datetime.fromisoformat(data_prima).date()
                data_consegna_suggerita = (dt - timedelta(days=lead_max)).isoformat()
            except Exception:
                data_consegna_suggerita = None
        else:
            data_consegna_suggerita = None

        righe_json = _json_dumps(gruppo["righe"])

        cur.execute("""
            INSERT INTO mrp_proposte_ordine (
                run_id, fornitore, fornitore_id,
                data_consegna_suggerita, stato,
                n_righe, righe_json, created_at
            ) VALUES (?, ?, ?, ?, 'proposta', ?, ?, datetime('now'))
        """, (
            run_id,
            fornitore if fornitore != "__SENZA_FORNITORE__" else "Non assegnato",
            fornitore_id,
            data_consegna_suggerita,
            len(gruppo["righe"]),
            righe_json,
        ))
        n += 1

    return n


def _cerca_fornitore_id(conn, nome_fornitore: str) -> Optional[int]:
    """Cerca fornitore per denominazione (match esatto case-insensitive)."""
    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM fornitori WHERE LOWER(ragione_sociale) = LOWER(?) LIMIT 1",
        (nome_fornitore,)
    )
    row = cur.fetchone()
    return row[0] if row else None


# ==========================================
# HELPERS RUN
# ==========================================

def _crea_run(conn, orizzonte_giorni: int, utente: str) -> int:
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO mrp_runs (
            data_run, orizzonte_giorni, utente, stato, created_at
        ) VALUES (datetime('now'), ?, ?, 'in_corso', datetime('now'))
    """, (orizzonte_giorni, utente))
    return cur.lastrowid


def _chiudi_run(conn, run_id: int, n_commesse: int, n_fabbisogni: int,
                n_proposte: int, stato: str):
    cur = conn.cursor()
    cur.execute("""
        UPDATE mrp_runs
        SET stato = ?, commesse_elaborate = ?, righe_fabbisogno = ?,
            proposte_generate = ?, completed_at = datetime('now')
        WHERE id = ?
    """, (stato, n_commesse, n_fabbisogni, n_proposte, run_id))


def _json_dumps(obj) -> str:
    import json
    def _default(o):
        if isinstance(o, (date, datetime)):
            return o.isoformat()
        return str(o)
    return json.dumps(obj, default=_default, ensure_ascii=False)


# ==========================================
# UTILITÀ: CONVERSIONE PROPOSTA → ODA
# ==========================================

def converti_proposta_in_oda(conn, proposta_id: int, utente: str) -> dict:
    """
    Converte una proposta MRP in un ODA bozza.
    Riutilizza la logica di numerazione già presente in oda_api.py.
    Ritorna { oda_id, numero_oda }.
    """
    import json
    cur = conn.cursor()

    cur.execute("SELECT * FROM mrp_proposte_ordine WHERE id = ?", (proposta_id,))
    row = cur.fetchone()
    if not row:
        raise ValueError(f"Proposta {proposta_id} non trovata")

    proposta = dict(row)
    if proposta["stato"] == "convertita":
        raise ValueError(f"Proposta {proposta_id} già convertita in ODA")

    righe = json.loads(proposta["righe_json"] or "[]")

    # Numerazione ODA
    anno = date.today().year
    cur.execute("SELECT ultimo_numero FROM oda_numerazione WHERE anno = ?", (anno,))
    row_num = cur.fetchone()
    if row_num:
        nuovo = row_num[0] + 1
        cur.execute("UPDATE oda_numerazione SET ultimo_numero = ? WHERE anno = ?", (nuovo, anno))
    else:
        nuovo = 1
        cur.execute("INSERT INTO oda_numerazione (anno, ultimo_numero) VALUES (?, ?)", (anno, nuovo))
    numero_oda = f"ODA-{anno}-{str(nuovo).zfill(4)}"

    # Lista commesse coinvolte (deduplicata)
    commesse_set = set()
    for r in righe:
        for c in r.get("commesse", []):
            commesse_set.add(c.get("numero_preventivo", ""))
    note_commesse = "Da MRP — commesse: " + ", ".join(sorted(commesse_set)) if commesse_set else "Da MRP"

    cur.execute("""
        INSERT INTO ordini_acquisto (
            numero_oda, anno, stato,
            fornitore_id, fornitore_denominazione,
            data_emissione, data_consegna_richiesta,
            note, note_interne, creato_da, created_at, updated_at
        ) VALUES (?, ?, 'bozza', ?, ?, date('now'), ?, ?, ?, ?, datetime('now'), datetime('now'))
    """, (
        numero_oda, anno,
        proposta.get("fornitore_id"),
        proposta["fornitore"] if proposta["fornitore"] != "Non assegnato" else None,
        proposta.get("data_consegna_suggerita"),
        note_commesse,
        f"Generato da MRP run #{proposta['run_id']}",
        utente,
    ))
    oda_id = cur.lastrowid

    cur.execute("""
        INSERT INTO ordini_acquisto_storico (oda_id, stato_da, stato_a, nota)
        VALUES (?, NULL, 'bozza', ?)
    """, (oda_id, f"ODA creato da proposta MRP #{proposta_id}"))

    # Inserisce le righe
    for i, r in enumerate(righe, start=1):
        cur.execute("""
            INSERT INTO ordini_acquisto_righe (
                oda_id, numero_riga,
                articolo_id, codice_articolo, descrizione, unita_misura,
                quantita_ordinata, quantita_ricevuta,
                prezzo_unitario, sconto_percentuale, aliquota_iva, prezzo_totale,
                note_riga
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 22, 0, ?)
        """, (
            oda_id, i,
            r.get("articolo_id"),
            r.get("codice_articolo"),
            r.get("descrizione", ""),
            r.get("unita_misura", "PZ"),
            r.get("quantita", 0),
            f"MRP: {', '.join(c.get('numero_preventivo','') for c in r.get('commesse',[])[:3])}",
        ))

    # Ricalcola totali (imponibile = 0 perché i prezzi vanno inseriti manualmente)
    cur.execute("""
        UPDATE ordini_acquisto
        SET imponibile_totale = 0, iva_totale = 0, totale_oda = 0,
            updated_at = datetime('now')
        WHERE id = ?
    """, (oda_id,))

    # Segna proposta come convertita
    cur.execute("""
        UPDATE mrp_proposte_ordine
        SET stato = 'convertita', oda_id = ?, updated_at = datetime('now')
        WHERE id = ?
    """, (oda_id, proposta_id))

    return {"oda_id": oda_id, "numero_oda": numero_oda}
