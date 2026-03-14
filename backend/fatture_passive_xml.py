"""
fatture_passive_xml.py - Parser XML FatturaPA per fatture passive ricevute
==========================================================================
Legge un XML FatturaPA (v1.2 / v1.3) e ne estrae:
- Dati cedente/prestatore (fornitore)
- Dati cessionario/committente (destinatario — noi)
- Righe DettaglioLinee
- Riepilogo IVA
- Dati pagamento
- Metadati documento (numero, data, tipo)
"""

import xml.etree.ElementTree as ET
from typing import Optional
from datetime import datetime


# Namespace FatturaPA — supporta sia v1.2 che v1.3
_NS = {
    "p":  "http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2",
    "p3": "http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.3",
    "ds": "http://www.w3.org/2000/09/xmldsig#",
    "xsi":"http://www.w3.org/2001/XMLSchema-instance",
}


def _txt(el, path: str, ns=None) -> Optional[str]:
    """Cerca un elemento per path relativo, ritorna il testo o None."""
    if el is None:
        return None
    found = el.find(path, ns or _NS)
    if found is not None and found.text:
        return found.text.strip()
    # Fallback senza namespace
    try:
        found = el.find(path.replace("p:", "").replace("p3:", ""))
        if found is not None and found.text:
            return found.text.strip()
    except Exception:
        pass
    return None


def _float(el, path: str, ns=None) -> float:
    v = _txt(el, path, ns)
    if v:
        try:
            return float(v.replace(",", "."))
        except ValueError:
            pass
    return 0.0


def _strip_ns(tag: str) -> str:
    """Rimuove il namespace da un tag XML."""
    if "}" in tag:
        return tag.split("}", 1)[1]
    return tag


def _find_any(root: ET.Element, local_name: str) -> Optional[ET.Element]:
    """Cerca un elemento per nome locale, ignorando il namespace."""
    for el in root.iter():
        if _strip_ns(el.tag) == local_name:
            return el
    return None


def _find_all(root: ET.Element, local_name: str):
    """Trova tutti gli elementi per nome locale."""
    return [el for el in root.iter() if _strip_ns(el.tag) == local_name]


def _child_text(el: ET.Element, local_name: str) -> Optional[str]:
    """Testo di un figlio diretto per nome locale."""
    if el is None:
        return None
    for child in el:
        if _strip_ns(child.tag) == local_name:
            return (child.text or "").strip() or None
    return None


def _child_float(el: ET.Element, local_name: str) -> float:
    v = _child_text(el, local_name)
    if v:
        try:
            return float(v.replace(",", "."))
        except ValueError:
            pass
    return 0.0


# ==========================================
# PARSER PRINCIPALE
# ==========================================

def parse_fattura_pa(xml_content: str) -> dict:
    """
    Parsa un XML FatturaPA e ritorna un dizionario strutturato.

    Returns:
        dict con chiavi:
          - fornitore: dati cedente/prestatore
          - destinatario: dati cessionario/committente  
          - documento: numero, data, tipo
          - righe: lista DettaglioLinee
          - riepilogo_iva: lista DatiRiepilogo
          - pagamento: dati DatiPagamento
          - totali: calcolati da riepilogo
          - errori: lista di warning/errori di parsing
    """
    errori = []

    try:
        root = ET.fromstring(xml_content.encode("utf-8") if isinstance(xml_content, str) else xml_content)
    except ET.ParseError as e:
        return {"errori": [f"XML non valido: {e}"], "fornitore": {}, "documento": {}, "righe": [], "totali": {}}

    # ---- Cedente/Prestatore (fornitore) ----
    cedente_el = _find_any(root, "CedentePrestatore")
    fornitore = {}
    if cedente_el is not None:
        anag = _find_any(cedente_el, "Anagrafica")
        id_fiscale = _find_any(cedente_el, "IdFiscaleIVA")
        sede = _find_any(cedente_el, "Sede")

        fornitore = {
            "denominazione":  _child_text(anag, "Denominazione") if anag else None,
            "nome":           _child_text(anag, "Nome") if anag else None,
            "cognome":        _child_text(anag, "Cognome") if anag else None,
            "partita_iva":    _child_text(id_fiscale, "IdCodice") if id_fiscale else None,
            "nazione_piva":   _child_text(id_fiscale, "IdPaese") if id_fiscale else None,
            "codice_fiscale": _child_text(cedente_el, "CodiceFiscale"),
            "indirizzo":      _child_text(sede, "Indirizzo") if sede else None,
            "numero_civico":  _child_text(sede, "NumeroCivico") if sede else None,
            "cap":            _child_text(sede, "CAP") if sede else None,
            "comune":         _child_text(sede, "Comune") if sede else None,
            "provincia":      _child_text(sede, "Provincia") if sede else None,
            "nazione":        _child_text(sede, "Nazione") if sede else None,
            "pec":            _child_text(cedente_el, "PECDestinatario"),
            "codice_sdi":     _child_text(cedente_el, "CodiceDestinatario"),
        }
        # Costruisce denominazione se non presente
        if not fornitore["denominazione"] and (fornitore.get("nome") or fornitore.get("cognome")):
            fornitore["denominazione"] = " ".join(filter(None, [
                fornitore.get("nome"), fornitore.get("cognome")
            ]))

    # ---- Cessionario/Committente (noi) ----
    cessionario_el = _find_any(root, "CessionarioCommittente")
    destinatario = {}
    if cessionario_el is not None:
        anag = _find_any(cessionario_el, "Anagrafica")
        id_fiscale = _find_any(cessionario_el, "IdFiscaleIVA")
        destinatario = {
            "denominazione": _child_text(anag, "Denominazione") if anag else None,
            "partita_iva":   _child_text(id_fiscale, "IdCodice") if id_fiscale else None,
            "codice_fiscale": _child_text(cessionario_el, "CodiceFiscale"),
        }

    # ---- Dati Generali Documento ----
    dati_gen = _find_any(root, "DatiGeneraliDocumento")
    documento = {}
    if dati_gen is not None:
        documento = {
            "tipo_documento":    _child_text(dati_gen, "TipoDocumento"),
            "divisa":            _child_text(dati_gen, "Divisa"),
            "data":              _child_text(dati_gen, "Data"),
            "numero":            _child_text(dati_gen, "Numero"),
            "importo_totale":    _child_float(dati_gen, "ImportoTotaleDocumento"),
            "arrotondamento":    _child_float(dati_gen, "Arrotondamento"),
            "causale":           _child_text(dati_gen, "Causale"),
            "art73":             _child_text(dati_gen, "Art73"),
        }

        # Ritenuta d'acconto
        ritenuta_el = _find_any(dati_gen, "DatiRitenuta")
        if ritenuta_el is not None:
            documento["ritenuta"] = {
                "tipo":      _child_text(ritenuta_el, "TipoRitenuta"),
                "importo":   _child_float(ritenuta_el, "ImportoRitenuta"),
                "aliquota":  _child_float(ritenuta_el, "AliquotaRitenuta"),
                "causale":   _child_text(ritenuta_el, "CausalePagamento"),
            }

        # Bollo virtuale
        bollo_el = _find_any(dati_gen, "DatiBollo")
        if bollo_el is not None:
            documento["bollo"] = {
                "bollo_virtuale": _child_text(bollo_el, "BolloVirtuale"),
                "importo":        _child_float(bollo_el, "ImportoBollo"),
            }

        # Cassa previdenziale
        cassa_el = _find_any(dati_gen, "DatiCassaPrevidenziale")
        if cassa_el is not None:
            documento["cassa_previdenziale"] = {
                "tipo":      _child_text(cassa_el, "TipoCassa"),
                "aliquota":  _child_float(cassa_el, "AlCassa"),
                "importo":   _child_float(cassa_el, "ImportoContributoCassa"),
                "imponibile":_child_float(cassa_el, "ImponibileCassa"),
                "aliquota_iva": _child_float(cassa_el, "AliquotaIVA"),
                "ritenuta":  _child_text(cassa_el, "Ritenuta"),
                "natura":    _child_text(cassa_el, "Natura"),
            }

    # ---- Dati Ordine Acquisto (se presente) ----
    ordine_acquisto = _find_any(root, "DatiOrdineAcquisto")
    if ordine_acquisto is not None:
        documento["riferimento_ordine"] = {
            "id_documento": _child_text(ordine_acquisto, "IdDocumento"),
            "data":         _child_text(ordine_acquisto, "Data"),
            "codice_cup":   _child_text(ordine_acquisto, "CodiceCUP"),
            "codice_cig":   _child_text(ordine_acquisto, "CodiceCIG"),
        }

    # ---- Righe DettaglioLinee ----
    righe = []
    for linea_el in _find_all(root, "DettaglioLinee"):
        riga = {
            "numero_riga":     int(_child_text(linea_el, "NumeroLinea") or 0),
            "descrizione":     _child_text(linea_el, "Descrizione") or "",
            "quantita":        _child_float(linea_el, "Quantita") or 1.0,
            "unita_misura":    _child_text(linea_el, "UnitaMisura"),
            "prezzo_unitario": _child_float(linea_el, "PrezzoUnitario"),
            "prezzo_totale":   _child_float(linea_el, "PrezzoTotale"),
            "aliquota_iva":    _child_float(linea_el, "AliquotaIVA"),
            "natura":          _child_text(linea_el, "Natura"),
            "ritenuta":        _child_text(linea_el, "Ritenuta"),
        }

        # Codice articolo (può essere multiplo)
        codici = []
        for codice_el in _find_all(linea_el, "CodiceArticolo"):
            codici.append({
                "tipo":  _child_text(codice_el, "CodiceTipo"),
                "valore": _child_text(codice_el, "CodiceValore"),
            })
        if codici:
            riga["codici_articolo"] = codici
            # Prendi il primo come principale
            riga["codice_tipo"] = codici[0]["tipo"]
            riga["codice_valore"] = codici[0]["valore"]

        # Sconto/Maggiorazione
        sc_el = _find_any(linea_el, "ScontoMaggiorazione")
        if sc_el is not None:
            riga["sconto_tipo"] = _child_text(sc_el, "Tipo")
            riga["sconto_percentuale"] = _child_float(sc_el, "Percentuale")

        righe.append(riga)

    # ---- Riepilogo IVA ----
    riepilogo_iva = []
    for riep_el in _find_all(root, "DatiRiepilogo"):
        riepilogo_iva.append({
            "aliquota_iva":   _child_float(riep_el, "AliquotaIVA"),
            "natura":         _child_text(riep_el, "Natura"),
            "imponibile":     _child_float(riep_el, "ImponibileImporto"),
            "imposta":        _child_float(riep_el, "Imposta"),
            "esigibilita":    _child_text(riep_el, "EsigibilitaIVA"),
            "rif_normativo":  _child_text(riep_el, "RiferimentoNormativo"),
        })

    # ---- Dati Pagamento ----
    pagamento = {}
    pag_el = _find_any(root, "DatiPagamento")
    if pag_el is not None:
        pagamento["condizioni"] = _child_text(pag_el, "CondizioniPagamento")
        dettagli = []
        for det_el in _find_all(pag_el, "DettaglioPagamento"):
            dettagli.append({
                "modalita":       _child_text(det_el, "ModalitaPagamento"),
                "data_scadenza":  _child_text(det_el, "DataScadenzaPagamento"),
                "importo":        _child_float(det_el, "ImportoPagamento"),
                "iban":           _child_text(det_el, "IBAN"),
                "istituto":       _child_text(det_el, "IstitutoFinanziario"),
                "bic":            _child_text(det_el, "BIC"),
            })
        pagamento["dettagli"] = dettagli

    # ---- Calcola totali da riepilogo ----
    imponibile_totale = sum(r["imponibile"] for r in riepilogo_iva)
    iva_totale = sum(r["imposta"] for r in riepilogo_iva)
    totali = {
        "imponibile_totale": round(imponibile_totale, 2),
        "iva_totale":        round(iva_totale, 2),
        "totale_documento":  documento.get("importo_totale") or round(imponibile_totale + iva_totale, 2),
        "ritenuta_importo":  documento.get("ritenuta", {}).get("importo", 0.0),
        "bollo_importo":     documento.get("bollo", {}).get("importo", 0.0),
        "cassa_importo":     documento.get("cassa_previdenziale", {}).get("importo", 0.0),
    }

    return {
        "fornitore":       fornitore,
        "destinatario":    destinatario,
        "documento":       documento,
        "righe":           righe,
        "riepilogo_iva":   riepilogo_iva,
        "pagamento":       pagamento,
        "totali":          totali,
        "errori":          errori,
    }


def data_iso(data_str: Optional[str]) -> Optional[str]:
    """Converte una data da formato FatturaPA (YYYY-MM-DD) a ISO datetime."""
    if not data_str:
        return None
    try:
        dt = datetime.strptime(data_str[:10], "%Y-%m-%d")
        return dt.isoformat()
    except ValueError:
        return data_str
