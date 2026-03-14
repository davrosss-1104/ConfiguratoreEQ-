"""
notifiche_email.py
==================
Modulo per l'invio di notifiche email legate ai ticket.

Trigger supportati:
  - 'assegnazione'          -> email al tecnico assegnato
  - 'cambio_stato'          -> email al tecnico assegnato + creatore
  - 'scadenza'              -> email al tecnico assegnato (scheduler APScheduler)
  - 'cambio_stato_cliente'  -> email al cliente (tono esterno)
  - 'messaggio_cliente'     -> email al cliente con testo manuale

Invio differito:
  Se email_invio_differito = '1' nei parametri_sistema, i trigger 'assegnazione'
  e 'cambio_stato' vengono accodati in email_notifiche_coda invece di essere
  inviati subito. Lo scheduler mattutino chiama svuota_coda() per processarli.
  I trigger 'messaggio_cliente', 'cambio_stato_cliente' e 'scadenza' sono
  sempre immediati.
"""

import smtplib
import json
import logging
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

logger = logging.getLogger("notifiche_email")

TRIGGER_DIFFERIBILI = {"assegnazione", "cambio_stato"}
TRIGGER_IMMEDIATI   = {"messaggio_cliente", "cambio_stato_cliente", "scadenza"}


# ── Config SMTP ───────────────────────────────────────────────────────────────

def _get_smtp_config(conn) -> dict:
    cur = conn.cursor()
    chiavi = [
        "smtp_host", "smtp_port", "smtp_user", "smtp_password",
        "smtp_use_tls", "smtp_mittente",
        "email_notifiche_attive",
        "email_notifica_assegnazione",
        "email_notifica_cambio_stato",
        "email_notifica_scadenza",
        "email_ora_invio_differito",
        "email_invio_differito",
    ]
    placeholders = ",".join("?" for _ in chiavi)
    cur.execute(
        f"SELECT chiave, valore FROM parametri_sistema WHERE chiave IN ({placeholders})",
        chiavi
    )
    return {r[0]: r[1] for r in cur.fetchall()}


def _get_ticket_info(conn, ticket_id: int) -> Optional[dict]:
    cur = conn.cursor()
    cur.execute("""
        SELECT
            t.id, t.numero_ticket, t.titolo, t.descrizione,
            t.stato, t.priorita, t.tipo, t.scadenza,
            t.assegnato_a, t.creato_da, t.cliente_id,
            u_ass.username  AS assegnato_nome,
            u_ass.email     AS assegnato_email,
            u_cre.username  AS creatore_nome,
            u_cre.email     AS creatore_email,
            c.ragione_sociale AS cliente_nome,
            c.email           AS cliente_email_anagrafica,
            i.codice_cliente  AS impianto_codice
        FROM tickets t
        LEFT JOIN utenti u_ass ON u_ass.id = t.assegnato_a
        LEFT JOIN utenti u_cre ON u_cre.id = t.creato_da
        LEFT JOIN clienti c    ON c.id = t.cliente_id
        LEFT JOIN impianti i   ON i.id = t.impianto_id
        WHERE t.id = ?
    """, (ticket_id,))
    cols = [d[0] for d in cur.description]
    row = cur.fetchone()
    if not row:
        return None
    return dict(zip(cols, row))


def _get_email_cliente(conn, ticket: dict) -> Optional[str]:
    if not ticket.get("cliente_id"):
        return None
    cur = conn.cursor()
    cur.execute(
        "SELECT email FROM utenti WHERE cliente_id = ? AND is_active = 1 AND email IS NOT NULL AND email != '' LIMIT 1",
        (ticket["cliente_id"],)
    )
    row = cur.fetchone()
    if row:
        return row[0]
    return ticket.get("cliente_email_anagrafica") or None


def _log_notifica(conn, ticket_id: int, trigger: str, destinatari: list,
                  oggetto: str, esito: str, errore: str = None):
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO email_notifiche_log
            (ticket_id, trigger, destinatari, oggetto, esito, errore)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (ticket_id, trigger, json.dumps(destinatari), oggetto, esito, errore))
    conn.commit()


def _ensure_coda_table(conn):
    conn.cursor().execute("""
        CREATE TABLE IF NOT EXISTS email_notifiche_coda (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id  INTEGER NOT NULL,
            trigger    TEXT    NOT NULL,
            stato_da   TEXT    NOT NULL DEFAULT '',
            stato_a    TEXT    NOT NULL DEFAULT '',
            motivo     TEXT    NOT NULL DEFAULT '',
            created_at TEXT    NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.commit()


def _accoda_notifica(conn, ticket_id: int, trigger: str,
                     stato_da: str, stato_a: str, motivo: str):
    _ensure_coda_table(conn)
    conn.cursor().execute("""
        INSERT INTO email_notifiche_coda (ticket_id, trigger, stato_da, stato_a, motivo)
        VALUES (?, ?, ?, ?, ?)
    """, (ticket_id, trigger, stato_da, stato_a, motivo))
    conn.commit()
    logger.info(f"[CODA] Notifica '{trigger}' accodata per ticket {ticket_id}")


# ── Template email ────────────────────────────────────────────────────────────

def _build_email_assegnazione(ticket: dict) -> tuple:
    oggetto = f"[{ticket['numero_ticket']}] Ticket assegnato a te: {ticket['titolo']}"
    corpo = f"""
<html><body style="font-family: Arial, sans-serif; color: #333;">
<h2 style="color:#4F46E5;">Ticket assegnato</h2>
<p>Ciao <strong>{ticket['assegnato_nome'] or 'Tecnico'}</strong>,</p>
<p>Ti e stato assegnato un nuovo ticket:</p>
<table style="border-collapse:collapse; width:100%; max-width:600px;">
  <tr><td style="padding:6px 12px; background:#f3f4f6; font-weight:bold; width:140px;">Numero</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e5e7eb;">{ticket['numero_ticket']}</td></tr>
  <tr><td style="padding:6px 12px; background:#f3f4f6; font-weight:bold;">Titolo</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e5e7eb;">{ticket['titolo']}</td></tr>
  <tr><td style="padding:6px 12px; background:#f3f4f6; font-weight:bold;">Priorita</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e5e7eb;">{ticket['priorita'].upper()}</td></tr>
  <tr><td style="padding:6px 12px; background:#f3f4f6; font-weight:bold;">Cliente</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e5e7eb;">{ticket['cliente_nome'] or '-'}</td></tr>
  <tr><td style="padding:6px 12px; background:#f3f4f6; font-weight:bold;">Impianto</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e5e7eb;">{ticket['impianto_codice'] or '-'}</td></tr>
</table>
{f'<p style="margin-top:16px;"><strong>Descrizione:</strong><br>{ticket["descrizione"]}</p>' if ticket.get('descrizione') else ''}
<p style="color:#6b7280; font-size:12px; margin-top:24px;">- ConfiguratoreEQ - Notifica automatica</p>
</body></html>
"""
    return oggetto, corpo


def _build_email_cambio_stato(ticket: dict, stato_da: str, stato_a: str, motivo: str = "") -> tuple:
    COLORI = {
        "aperto": "#6B7280", "ricevuto": "#6B7280", "assegnato": "#4F46E5",
        "in_lavorazione": "#D97706", "in_attesa_ricambi": "#7C3AED",
        "sospeso": "#9CA3AF", "risolto": "#059669", "chiuso": "#1F2937", "annullato": "#DC2626",
    }
    colore = COLORI.get(stato_a, "#4F46E5")
    oggetto = f"[{ticket['numero_ticket']}] Stato aggiornato: {stato_a.replace('_',' ').title()}"
    corpo = f"""
<html><body style="font-family: Arial, sans-serif; color: #333;">
<h2 style="color:{colore};">Aggiornamento ticket</h2>
<p>Il ticket <strong>{ticket['numero_ticket']}</strong> ha cambiato stato:</p>
<p style="font-size:18px; margin:16px 0;">
  <span style="color:#6B7280;">{stato_da.replace('_',' ').title()}</span>
  &nbsp;-&gt;&nbsp;
  <span style="color:{colore}; font-weight:bold;">{stato_a.replace('_',' ').title()}</span>
</p>
<table style="border-collapse:collapse; width:100%; max-width:600px;">
  <tr><td style="padding:6px 12px; background:#f3f4f6; font-weight:bold; width:140px;">Titolo</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e5e7eb;">{ticket['titolo']}</td></tr>
  <tr><td style="padding:6px 12px; background:#f3f4f6; font-weight:bold;">Tecnico</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e5e7eb;">{ticket['assegnato_nome'] or '-'}</td></tr>
  <tr><td style="padding:6px 12px; background:#f3f4f6; font-weight:bold;">Cliente</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e5e7eb;">{ticket['cliente_nome'] or '-'}</td></tr>
</table>
{f'<p style="margin-top:16px;"><strong>Nota:</strong> {motivo}</p>' if motivo else ''}
<p style="color:#6b7280; font-size:12px; margin-top:24px;">- ConfiguratoreEQ - Notifica automatica</p>
</body></html>
"""
    return oggetto, corpo


def _build_email_cambio_stato_cliente(ticket: dict, stato_da: str, stato_a: str) -> tuple:
    COLORI = {
        "ricevuto": "#6B7280", "assegnato": "#4F46E5", "in_lavorazione": "#D97706",
        "in_attesa_ricambi": "#7C3AED", "sospeso": "#9CA3AF",
        "risolto": "#059669", "chiuso": "#1F2937", "annullato": "#DC2626",
    }
    LABEL = {
        "ricevuto": "Ricevuto", "assegnato": "In lavorazione",
        "in_lavorazione": "In lavorazione", "in_attesa_ricambi": "In attesa ricambi",
        "sospeso": "Temporaneamente sospeso", "risolto": "Risolto",
        "chiuso": "Chiuso", "annullato": "Annullato",
    }
    colore  = COLORI.get(stato_a, "#4F46E5")
    label_a = LABEL.get(stato_a, stato_a.replace("_", " ").title())
    oggetto = f"Aggiornamento richiesta assistenza [{ticket['numero_ticket']}]"
    corpo = f"""
<html><body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;">
<div style="background:{colore};padding:20px 24px;border-radius:8px 8px 0 0;">
  <h2 style="color:white;margin:0;font-size:18px;">Aggiornamento richiesta assistenza</h2>
</div>
<div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
  <p>Gentile <strong>{ticket['cliente_nome'] or 'Cliente'}</strong>,</p>
  <p>La sua richiesta di assistenza e stata aggiornata:</p>
  <div style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">
    <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Riferimento: <strong>{ticket['numero_ticket']}</strong></p>
    <p style="margin:0 0 8px;font-size:15px;font-weight:bold;color:#111;">{ticket['titolo']}</p>
    <p style="margin:0;">Stato attuale: <span style="color:{colore};font-weight:bold;">{label_a}</span></p>
  </div>
  {'<p style="background:#ecfdf5;border-left:3px solid #059669;padding:12px;border-radius:4px;color:#065f46;"><strong>La richiesta e stata risolta.</strong></p>' if stato_a == 'risolto' else ''}
  {'<p style="background:#f0fdf4;border-left:3px solid #059669;padding:12px;border-radius:4px;color:#166534;"><strong>La richiesta e stata chiusa. Grazie.</strong></p>' if stato_a == 'chiuso' else ''}
  <p style="color:#6b7280;font-size:13px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">
    Per i dettagli acceda al portale assistenza.
  </p>
</div>
</body></html>"""
    return oggetto, corpo


def _build_email_messaggio_cliente(ticket: dict, testo: str, mittente_nome: str) -> tuple:
    oggetto = f"Messaggio sulla sua richiesta [{ticket['numero_ticket']}]"
    corpo = f"""
<html><body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;">
<div style="background:#4F46E5;padding:20px 24px;border-radius:8px 8px 0 0;">
  <h2 style="color:white;margin:0;font-size:18px;">Messaggio sulla sua richiesta</h2>
</div>
<div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
  <p>Gentile <strong>{ticket['cliente_nome'] or 'Cliente'}</strong>,</p>
  <p>Ha ricevuto un messaggio riguardo alla sua richiesta <strong>{ticket['numero_ticket']}</strong> - <em>{ticket['titolo']}</em>:</p>
  <div style="background:#f0f4ff;border-left:4px solid #4F46E5;padding:16px;border-radius:4px;margin:16px 0;">
    <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">{mittente_nome}</p>
    <p style="margin:0;font-size:15px;color:#1e1b4b;white-space:pre-wrap;">{testo}</p>
  </div>
  <p style="color:#6b7280;font-size:13px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">
    Per rispondere acceda al portale assistenza.
  </p>
</div>
</body></html>"""
    return oggetto, corpo


def _build_email_scadenza(ticket: dict) -> tuple:
    oggetto = f"[{ticket['numero_ticket']}] Ticket in scadenza oggi: {ticket['titolo']}"
    corpo = f"""
<html><body style="font-family: Arial, sans-serif; color: #333;">
<h2 style="color:#DC2626;">Ticket in scadenza</h2>
<p>Ciao <strong>{ticket['assegnato_nome'] or 'Tecnico'}</strong>,</p>
<p>Il seguente ticket e in scadenza <strong>oggi</strong>:</p>
<table style="border-collapse:collapse; width:100%; max-width:600px;">
  <tr><td style="padding:6px 12px; background:#f3f4f6; font-weight:bold; width:140px;">Numero</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e5e7eb;">{ticket['numero_ticket']}</td></tr>
  <tr><td style="padding:6px 12px; background:#f3f4f6; font-weight:bold;">Titolo</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e5e7eb;">{ticket['titolo']}</td></tr>
  <tr><td style="padding:6px 12px; background:#f3f4f6; font-weight:bold;">Stato</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e5e7eb;">{ticket['stato'].replace('_',' ').title()}</td></tr>
  <tr><td style="padding:6px 12px; background:#f3f4f6; font-weight:bold;">Cliente</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e5e7eb;">{ticket['cliente_nome'] or '-'}</td></tr>
  <tr><td style="padding:6px 12px; background:#f3f4f6; font-weight:bold;">Scadenza</td>
      <td style="padding:6px 12px; border-bottom:1px solid #e5e7eb; color:#DC2626;"><strong>{ticket['scadenza']}</strong></td></tr>
</table>
<p style="color:#6b7280; font-size:12px; margin-top:24px;">- ConfiguratoreEQ - Notifica automatica</p>
</body></html>
"""
    return oggetto, corpo


# ── Invio SMTP ────────────────────────────────────────────────────────────────

def _invia_smtp(cfg: dict, destinatari: list, oggetto: str, corpo_html: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = oggetto
    msg["From"]    = cfg.get("smtp_mittente") or cfg.get("smtp_user", "")
    msg["To"]      = ", ".join(destinatari)
    msg.attach(MIMEText(corpo_html, "html", "utf-8"))

    host    = cfg["smtp_host"]
    port    = int(cfg.get("smtp_port", 587))
    use_tls = str(cfg.get("smtp_use_tls", "1")) == "1"

    if use_tls:
        server = smtplib.SMTP(host, port, timeout=10)
        server.starttls()
    else:
        server = smtplib.SMTP_SSL(host, port, timeout=10)

    if cfg.get("smtp_user") and cfg.get("smtp_password"):
        server.login(cfg["smtp_user"], cfg["smtp_password"])

    server.sendmail(msg["From"], destinatari, msg.as_string())
    server.quit()


# ── Funzione principale ───────────────────────────────────────────────────────

def invia_notifica_ticket(
    conn,
    ticket_id: int,
    trigger: str,
    stato_da: str = "",
    stato_a: str = "",
    motivo: str = "",
):
    """
    Punto di ingresso principale. Chiamare dopo il commit in ticketing_api.py.
    """
    try:
        cfg = _get_smtp_config(conn)

        if str(cfg.get("email_notifiche_attive", "0")) != "1":
            return

        flag_map = {
            "assegnazione":         "email_notifica_assegnazione",
            "cambio_stato":         "email_notifica_cambio_stato",
            "scadenza":             "email_notifica_scadenza",
            "cambio_stato_cliente": "email_notifica_cambio_stato",
            "messaggio_cliente":    "email_notifiche_attive",
        }
        flag = flag_map.get(trigger)
        if flag and str(cfg.get(flag, "1")) != "1":
            return

        if not cfg.get("smtp_host"):
            logger.warning("SMTP non configurato - notifica non inviata")
            return

        # Invio differito: accoda per processare allo scheduler mattutino
        if (trigger in TRIGGER_DIFFERIBILI
                and str(cfg.get("email_invio_differito", "0")) == "1"):
            _accoda_notifica(conn, ticket_id, trigger, stato_da, stato_a, motivo)
            return

        _invia_notifica_immediata(conn, cfg, ticket_id, trigger, stato_da, stato_a, motivo)

    except Exception as e:
        logger.error(f"Errore notifica email ticket {ticket_id} trigger '{trigger}': {e}")
        try:
            _log_notifica(conn, ticket_id, trigger, [], "", "errore", str(e))
        except Exception:
            pass


def _invia_notifica_immediata(conn, cfg: dict, ticket_id: int, trigger: str,
                               stato_da: str, stato_a: str, motivo: str):
    """Costruisce destinatari + template e invia via SMTP."""
    ticket = _get_ticket_info(conn, ticket_id)
    if not ticket:
        return

    destinatari = []

    if trigger == "assegnazione":
        if ticket.get("assegnato_email"):
            destinatari.append(ticket["assegnato_email"])
        if not destinatari:
            return
        oggetto, corpo = _build_email_assegnazione(ticket)

    elif trigger == "cambio_stato":
        if ticket.get("assegnato_email"):
            destinatari.append(ticket["assegnato_email"])
        if ticket.get("creatore_email") and ticket["creatore_email"] not in destinatari:
            destinatari.append(ticket["creatore_email"])
        if not destinatari:
            return
        oggetto, corpo = _build_email_cambio_stato(ticket, stato_da, stato_a, motivo)

    elif trigger == "cambio_stato_cliente":
        email_cl = _get_email_cliente(conn, ticket)
        if email_cl:
            destinatari.append(email_cl)
        if not destinatari:
            return
        oggetto, corpo = _build_email_cambio_stato_cliente(ticket, stato_da, stato_a)

    elif trigger == "messaggio_cliente":
        email_cl = _get_email_cliente(conn, ticket)
        if email_cl:
            destinatari.append(email_cl)
        if not destinatari:
            return
        mittente = motivo or "Assistenza"
        oggetto, corpo = _build_email_messaggio_cliente(ticket, stato_a, mittente)

    elif trigger == "scadenza":
        if ticket.get("assegnato_email"):
            destinatari.append(ticket["assegnato_email"])
        if not destinatari:
            return
        oggetto, corpo = _build_email_scadenza(ticket)

    else:
        logger.warning(f"Trigger sconosciuto: {trigger}")
        return

    _invia_smtp(cfg, destinatari, oggetto, corpo)
    _log_notifica(conn, ticket_id, trigger, destinatari, oggetto, "inviata")
    logger.info(f"Email '{trigger}' inviata per ticket {ticket_id} a {destinatari}")


# ── Scheduler: svuota coda differita ─────────────────────────────────────────

def svuota_coda(db_path: str):
    """
    Processa tutte le notifiche in email_notifiche_coda e le invia.
    Da chiamare con APScheduler ogni mattina alla stessa ora di controlla_scadenze().
    """
    import sqlite3 as _sqlite3
    conn = _sqlite3.connect(db_path)
    cur  = conn.cursor()

    _ensure_coda_table(conn)

    cur.execute("""
        SELECT id, ticket_id, trigger, stato_da, stato_a, motivo
        FROM email_notifiche_coda
        ORDER BY id ASC
    """)
    righe = cur.fetchall()

    if not righe:
        conn.close()
        return

    cfg = _get_smtp_config(conn)
    if str(cfg.get("email_notifiche_attive", "0")) != "1" or not cfg.get("smtp_host"):
        conn.close()
        logger.info(f"[CODA] {len(righe)} notifiche in coda, email disabilitate o SMTP non configurato")
        return

    inviate = 0
    errori  = 0
    ids_ok  = []

    for coda_id, ticket_id, trigger, stato_da, stato_a, motivo in righe:
        try:
            _invia_notifica_immediata(conn, cfg, ticket_id, trigger, stato_da, stato_a, motivo)
            ids_ok.append(coda_id)
            inviate += 1
        except Exception as ex:
            logger.error(f"[CODA] Errore id={coda_id} ticket={ticket_id}: {ex}")
            errori += 1

    if ids_ok:
        placeholders = ",".join("?" for _ in ids_ok)
        cur.execute(f"DELETE FROM email_notifiche_coda WHERE id IN ({placeholders})", ids_ok)
        conn.commit()

    conn.close()
    logger.info(f"[CODA] Svuotata: {inviate} inviate, {errori} errori")


# ── Scheduler scadenze ────────────────────────────────────────────────────────

def controlla_scadenze(db_path: str):
    """Controlla ticket in scadenza oggi e invia notifiche."""
    import sqlite3 as _sqlite3
    conn = _sqlite3.connect(db_path)
    cur  = conn.cursor()

    cur.execute("""
        SELECT id FROM tickets
        WHERE date(scadenza) = date('now')
        AND stato NOT IN ('chiuso', 'annullato', 'risolto')
        AND assegnato_a IS NOT NULL
    """)
    ids = [r[0] for r in cur.fetchall()]

    for ticket_id in ids:
        invia_notifica_ticket(conn, ticket_id, "scadenza")

    conn.close()
    logger.info(f"Controllo scadenze: {len(ids)} ticket notificati")


def get_ora_invio_configurata(db_path: str) -> tuple:
    """
    Legge email_ora_invio_differito da parametri_sistema.
    Ritorna (hour, minute). Default: (8, 0).
    """
    import sqlite3 as _sqlite3
    try:
        conn = _sqlite3.connect(db_path)
        cur  = conn.cursor()
        cur.execute(
            "SELECT valore FROM parametri_sistema WHERE chiave = 'email_ora_invio_differito' LIMIT 1"
        )
        row = cur.fetchone()
        conn.close()
        if row and row[0]:
            parts = str(row[0]).strip().split(":")
            return int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
    except Exception:
        pass
    return 8, 0
