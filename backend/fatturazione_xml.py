"""
fatturazione_xml.py - Generatore XML FatturaPA (formato SDI 1.2.2)

Genera XML conforme allo schema FatturaPA per:
- Fatture B2B/B2C (FPR12) e PA (FPA12)
- Note di credito (TD04)
- Fatture di acconto (TD02)
- Parcelle (TD06)
- Con supporto per: ritenuta d'acconto, cassa previdenziale, split payment, bollo virtuale
"""

import xml.etree.ElementTree as ET
from xml.dom import minidom
from datetime import datetime
from typing import Optional, List, Dict, Any
import re
import hashlib


# Namespace FatturaPA 1.2.2
NS = "http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"
NS_DS = "http://www.w3.org/2000/09/xmldsig#"
NS_XSI = "http://www.w3.org/2001/XMLSchema-instance"
SCHEMA_LOCATION = (
    "http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 "
    "http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/"
    "v1.2.2/Schema_del_file_xml_FatturaPA_v1.2.2.xsd"
)


def _add_element(parent: ET.Element, tag: str, text: Optional[str] = None) -> ET.Element:
    """Aggiunge sotto-elemento con testo opzionale"""
    el = ET.SubElement(parent, tag)
    if text is not None:
        el.text = str(text)
    return el


def _add_if(parent: ET.Element, tag: str, value: Any) -> Optional[ET.Element]:
    """Aggiunge elemento solo se value è valorizzato"""
    if value is not None and str(value).strip():
        return _add_element(parent, tag, str(value).strip())
    return None


def _format_importo(value: float) -> str:
    """Formatta importo con 2 decimali (formato SDI)"""
    return f"{value:.2f}"


def _format_quantita(value: float) -> str:
    """Formatta quantità con fino a 8 decimali (formato SDI)"""
    s = f"{value:.8f}".rstrip("0")
    if s.endswith("."):
        s += "00"
    elif len(s.split(".")[1]) < 2:
        s += "0"
    return s


def _format_data(dt) -> str:
    """Formatta data YYYY-MM-DD"""
    if isinstance(dt, str):
        return dt[:10]
    if isinstance(dt, datetime):
        return dt.strftime("%Y-%m-%d")
    return str(dt)[:10]


def genera_progressivo_invio(fattura_id: int, anno: int) -> str:
    """
    Genera progressivo invio univoco (max 5 char alfanumerico).
    Usato nel campo 1.1.1.2 ProgressivoInvio.
    """
    raw = f"{fattura_id}-{anno}"
    h = hashlib.md5(raw.encode()).hexdigest()[:5].upper()
    # Assicura che contenga solo [A-Z0-9]
    return re.sub(r'[^A-Z0-9]', 'X', h)


def genera_nome_file(partita_iva_trasmittente: str, progressivo: str, paese: str = "IT") -> str:
    """
    Genera nome file secondo specifiche SDI:
    <IdPaese><IdCodice>_<Progressivo>.xml
    Es: IT01234567890_ABC12.xml
    """
    id_fiscale = f"{paese}{partita_iva_trasmittente}"
    return f"{id_fiscale}_{progressivo}.xml"


class FatturaPAGenerator:
    """
    Generatore XML FatturaPA completo.
    
    Uso:
        gen = FatturaPAGenerator(config, fattura, righe)
        xml_string = gen.genera()
        filename = gen.get_filename()
    """

    def __init__(self, config: dict, fattura: dict, righe: list,
                 allegati: list = None):
        """
        Args:
            config: dict con dati ConfigurazioneFatturazione
            fattura: dict con dati Fattura
            righe: list di dict con dati RigaFattura
            allegati: list di dict con dati AllegatoFattura (opzionale)
        """
        self.config = config
        self.fattura = fattura
        self.righe = righe
        self.allegati = allegati or []
        self._progressivo = None

    def genera(self) -> str:
        """Genera XML FatturaPA completo. Ritorna stringa XML."""
        root = self._crea_root()
        self._build_header(root)
        self._build_body(root)
        return self._to_string(root)

    def get_filename(self) -> str:
        """Ritorna il nome file per SDI"""
        if not self._progressivo:
            self._progressivo = genera_progressivo_invio(
                self.fattura.get("id", 0),
                self.fattura.get("anno", datetime.now().year)
            )
        return genera_nome_file(
            self.config.get("partita_iva", ""),
            self._progressivo,
            self.config.get("nazione", "IT")
        )

    def get_progressivo(self) -> str:
        if not self._progressivo:
            self._progressivo = genera_progressivo_invio(
                self.fattura.get("id", 0),
                self.fattura.get("anno", datetime.now().year)
            )
        return self._progressivo

    # ================================================================
    # ROOT
    # ================================================================

    def _crea_root(self) -> ET.Element:
        root = ET.Element("p:FatturaElettronica")
        root.set("xmlns:p", NS)
        root.set("xmlns:ds", NS_DS)
        root.set("xmlns:xsi", NS_XSI)
        root.set("xsi:schemaLocation", SCHEMA_LOCATION)
        root.set("versione", self.config.get("formato_trasmissione", "FPR12"))
        return root

    # ================================================================
    # 1. HEADER (FatturaElettronicaHeader)
    # ================================================================

    def _build_header(self, root: ET.Element):
        header = _add_element(root, "FatturaElettronicaHeader")
        self._build_dati_trasmissione(header)
        self._build_cedente_prestatore(header)
        self._build_cessionario_committente(header)

    def _build_dati_trasmissione(self, header: ET.Element):
        """1.1 DatiTrasmissione"""
        dt = _add_element(header, "DatiTrasmissione")

        # 1.1.1 IdTrasmittente
        id_trasm = _add_element(dt, "IdTrasmittente")
        _add_element(id_trasm, "IdPaese",
                     self.config.get("id_paese_trasmittente", "IT"))
        _add_element(id_trasm, "IdCodice",
                     self.config.get("id_codice_trasmittente") or self.config.get("partita_iva"))

        # 1.1.2 ProgressivoInvio
        self._progressivo = genera_progressivo_invio(
            self.fattura.get("id", 0),
            self.fattura.get("anno", datetime.now().year)
        )
        _add_element(dt, "ProgressivoInvio", self._progressivo)

        # 1.1.3 FormatoTrasmissione
        _add_element(dt, "FormatoTrasmissione",
                     self.config.get("formato_trasmissione", "FPR12"))

        # 1.1.4 CodiceDestinatario
        codice_dest = self.fattura.get("dest_codice_destinatario") or \
                      self.config.get("codice_destinatario_default", "0000000")
        _add_element(dt, "CodiceDestinatario", codice_dest)

        # 1.1.6 PECDestinatario (se codice dest = 0000000 e c'è PEC)
        if codice_dest == "0000000":
            pec = self.fattura.get("dest_pec")
            if pec:
                _add_element(dt, "PECDestinatario", pec)

    def _build_cedente_prestatore(self, header: ET.Element):
        """1.2 CedentePrestatore"""
        cp = _add_element(header, "CedentePrestatore")

        # 1.2.1 DatiAnagrafici
        da = _add_element(cp, "DatiAnagrafici")

        id_fisc = _add_element(da, "IdFiscaleIVA")
        _add_element(id_fisc, "IdPaese", self.config.get("nazione", "IT"))
        _add_element(id_fisc, "IdCodice", self.config.get("partita_iva"))

        _add_if(da, "CodiceFiscale", self.config.get("codice_fiscale"))

        anag = _add_element(da, "Anagrafica")
        _add_element(anag, "Denominazione", self.config.get("denominazione"))

        _add_element(da, "RegimeFiscale", self.config.get("regime_fiscale", "RF01"))

        # 1.2.2 Sede
        sede = _add_element(cp, "Sede")
        _add_element(sede, "Indirizzo", self.config.get("indirizzo", ""))
        _add_if(sede, "NumeroCivico", self.config.get("numero_civico"))
        _add_element(sede, "CAP", self.config.get("cap", "00000"))
        _add_element(sede, "Comune", self.config.get("comune", ""))
        _add_if(sede, "Provincia", self.config.get("provincia"))
        _add_element(sede, "Nazione", self.config.get("nazione", "IT"))

        # 1.2.4 IscrizioneREA
        if self.config.get("rea_ufficio"):
            rea = _add_element(cp, "IscrizioneREA")
            _add_element(rea, "Ufficio", self.config.get("rea_ufficio"))
            _add_element(rea, "NumeroREA", self.config.get("rea_numero"))
            if self.config.get("rea_capitale_sociale"):
                _add_element(rea, "CapitaleSociale",
                             _format_importo(self.config["rea_capitale_sociale"]))
            _add_if(rea, "SocioUnico", self.config.get("rea_socio_unico"))
            _add_element(rea, "StatoLiquidazione",
                         self.config.get("rea_stato_liquidazione", "LN"))

        # 1.2.5 Contatti
        if self.config.get("telefono") or self.config.get("email"):
            contatti = _add_element(cp, "Contatti")
            _add_if(contatti, "Telefono", self.config.get("telefono"))
            _add_if(contatti, "Email", self.config.get("email"))

    def _build_cessionario_committente(self, header: ET.Element):
        """1.4 CessionarioCommittente"""
        cc = _add_element(header, "CessionarioCommittente")

        # 1.4.1 DatiAnagrafici
        da = _add_element(cc, "DatiAnagrafici")

        dest_piva = self.fattura.get("dest_partita_iva")
        dest_cf = self.fattura.get("dest_codice_fiscale")
        dest_nazione = self.fattura.get("dest_nazione", "IT")

        if dest_piva:
            id_fisc = _add_element(da, "IdFiscaleIVA")
            _add_element(id_fisc, "IdPaese", dest_nazione)
            _add_element(id_fisc, "IdCodice", dest_piva)

        if dest_cf:
            _add_element(da, "CodiceFiscale", dest_cf)

        anag = _add_element(da, "Anagrafica")
        _add_element(anag, "Denominazione",
                     self.fattura.get("dest_denominazione", ""))

        # 1.4.2 Sede
        sede = _add_element(cc, "Sede")
        _add_element(sede, "Indirizzo", self.fattura.get("dest_indirizzo", ""))
        _add_if(sede, "NumeroCivico", self.fattura.get("dest_numero_civico"))
        _add_element(sede, "CAP", self.fattura.get("dest_cap", "00000"))
        _add_element(sede, "Comune", self.fattura.get("dest_comune", ""))
        _add_if(sede, "Provincia", self.fattura.get("dest_provincia"))
        _add_element(sede, "Nazione", dest_nazione)

    # ================================================================
    # 2. BODY (FatturaElettronicaBody)
    # ================================================================

    def _build_body(self, root: ET.Element):
        body = _add_element(root, "FatturaElettronicaBody")
        self._build_dati_generali(body)
        self._build_dati_beni_servizi(body)
        self._build_dati_pagamento(body)
        self._build_allegati(body)

    def _build_dati_generali(self, body: ET.Element):
        """2.1 DatiGenerali"""
        dg = _add_element(body, "DatiGenerali")
        dgd = _add_element(dg, "DatiGeneraliDocumento")

        # 2.1.1.1 TipoDocumento
        _add_element(dgd, "TipoDocumento",
                     self.fattura.get("tipo_documento", "TD01"))

        # 2.1.1.2 Divisa
        _add_element(dgd, "Divisa", "EUR")

        # 2.1.1.3 Data
        data_fatt = self.fattura.get("data_fattura")
        if data_fatt:
            _add_element(dgd, "Data", _format_data(data_fatt))
        else:
            _add_element(dgd, "Data", datetime.now().strftime("%Y-%m-%d"))

        # 2.1.1.4 Numero
        _add_element(dgd, "Numero", self.fattura.get("numero_fattura", ""))

        # --- Ritenuta d'acconto (2.1.1.5) ---
        if self.fattura.get("ritenuta_tipo"):
            drd = _add_element(dgd, "DatiRitenuta")
            _add_element(drd, "TipoRitenuta", self.fattura["ritenuta_tipo"])
            _add_element(drd, "ImportoRitenuta",
                         _format_importo(self.fattura.get("ritenuta_importo", 0)))
            _add_element(drd, "AliquotaRitenuta",
                         _format_importo(self.fattura.get("ritenuta_aliquota", 0)))
            _add_element(drd, "CausalePagamento",
                         self.fattura.get("ritenuta_causale", "A"))

        # --- Bollo virtuale (2.1.1.6) ---
        if self.fattura.get("bollo_virtuale"):
            db = _add_element(dgd, "DatiBollo")
            _add_element(db, "BolloVirtuale", "SI")
            _add_element(db, "ImportoBollo",
                         _format_importo(self.fattura.get("bollo_importo", 2.0)))

        # --- Cassa previdenziale (2.1.1.7) ---
        if self.fattura.get("cassa_tipo"):
            dcp = _add_element(dgd, "DatiCassaPrevidenziale")
            _add_element(dcp, "TipoCassa", self.fattura["cassa_tipo"])
            _add_element(dcp, "AlCassa",
                         _format_importo(self.fattura.get("cassa_aliquota", 0)))
            _add_element(dcp, "ImportoContributoCassa",
                         _format_importo(self.fattura.get("cassa_importo", 0)))
            _add_if(dcp, "ImponibileCassa",
                    _format_importo(self.fattura["cassa_imponibile"])
                    if self.fattura.get("cassa_imponibile") else None)
            _add_element(dcp, "AliquotaIVA",
                         _format_importo(self.fattura.get("cassa_aliquota_iva",
                                                           self.config.get("aliquota_iva_default", 22))))
            if self.fattura.get("cassa_ritenuta"):
                _add_element(dcp, "Ritenuta", "SI")
            _add_if(dcp, "Natura", self.fattura.get("cassa_natura"))

        # --- Importo totale documento (2.1.1.9) ---
        _add_element(dgd, "ImportoTotaleDocumento",
                     _format_importo(self.fattura.get("totale_fattura", 0)))

        # --- Causale (2.1.1.11) ---
        causale = self.fattura.get("causale")
        if causale:
            # SDI: max 200 char per blocco Causale, si possono ripetere
            chunks = [causale[i:i+200] for i in range(0, len(causale), 200)]
            for chunk in chunks:
                _add_element(dgd, "Causale", chunk)

        # --- DatiOrdineAcquisto (2.1.2) ---
        if self.fattura.get("dati_ordine_id_documento"):
            doa = _add_element(dg, "DatiOrdineAcquisto")
            _add_element(doa, "IdDocumento",
                         self.fattura["dati_ordine_id_documento"])
            _add_if(doa, "Data",
                    _format_data(self.fattura["dati_ordine_data"])
                    if self.fattura.get("dati_ordine_data") else None)
            _add_if(doa, "CodiceCommessaConvenzione",
                    self.fattura.get("dati_ordine_codice_commessa"))
            _add_if(doa, "CodiceCUP", self.fattura.get("dati_ordine_codice_cup"))
            _add_if(doa, "CodiceCIG", self.fattura.get("dati_ordine_codice_cig"))

        # --- DatiFattureCollegate (2.1.6) — per note di credito ---
        if self.fattura.get("tipo_documento") == "TD04" and self.fattura.get("fattura_origine_numero"):
            dfc = _add_element(dg, "DatiFattureCollegate")
            _add_element(dfc, "IdDocumento", self.fattura["fattura_origine_numero"])
            if self.fattura.get("fattura_origine_data"):
                _add_element(dfc, "Data",
                             _format_data(self.fattura["fattura_origine_data"]))

    def _build_dati_beni_servizi(self, body: ET.Element):
        """2.2 DatiBeniServizi"""
        dbs = _add_element(body, "DatiBeniServizi")

        # --- 2.2.1 DettaglioLinee ---
        for riga in self.righe:
            dl = _add_element(dbs, "DettaglioLinee")
            _add_element(dl, "NumeroLinea", str(riga.get("numero_riga", 1)))

            # CodiceArticolo
            if riga.get("codice_tipo") and riga.get("codice_valore"):
                ca = _add_element(dl, "CodiceArticolo")
                _add_element(ca, "CodiceTipo", riga["codice_tipo"])
                _add_element(ca, "CodiceValore", riga["codice_valore"])

            _add_element(dl, "Descrizione", riga.get("descrizione", ""))

            if riga.get("quantita") is not None:
                _add_element(dl, "Quantita", _format_quantita(riga["quantita"]))

            _add_if(dl, "UnitaMisura", riga.get("unita_misura"))
            _add_if(dl, "DataInizioPeriodo",
                    _format_data(riga["data_inizio_periodo"])
                    if riga.get("data_inizio_periodo") else None)
            _add_if(dl, "DataFinePeriodo",
                    _format_data(riga["data_fine_periodo"])
                    if riga.get("data_fine_periodo") else None)

            _add_element(dl, "PrezzoUnitario",
                         _format_importo(riga.get("prezzo_unitario", 0)))

            # Sconto/Maggiorazione per riga
            if riga.get("sconto_percentuale") and riga["sconto_percentuale"] > 0:
                sm = _add_element(dl, "ScontoMaggiorazione")
                _add_element(sm, "Tipo", "SC")
                _add_element(sm, "Percentuale",
                             _format_importo(riga["sconto_percentuale"]))
            elif riga.get("maggiorazione_percentuale") and riga["maggiorazione_percentuale"] > 0:
                sm = _add_element(dl, "ScontoMaggiorazione")
                _add_element(sm, "Tipo", "MG")
                _add_element(sm, "Percentuale",
                             _format_importo(riga["maggiorazione_percentuale"]))

            _add_element(dl, "PrezzoTotale",
                         _format_importo(riga.get("prezzo_totale", 0)))

            _add_element(dl, "AliquotaIVA",
                         _format_importo(riga.get("aliquota_iva", 22)))

            if riga.get("natura"):
                _add_element(dl, "Natura", riga["natura"])

            if riga.get("ritenuta"):
                _add_element(dl, "Ritenuta", "SI")

            if riga.get("riferimento_normativo"):
                # Messo come AltriDatiGestionali
                adg = _add_element(dl, "AltriDatiGestionali")
                _add_element(adg, "TipoDato", "RIF_NORM")
                _add_element(adg, "RiferimentoTesto", riga["riferimento_normativo"][:60])

        # --- 2.2.2 DatiRiepilogo (raggruppamento per aliquota IVA) ---
        riepilogo_iva = self._calcola_riepilogo_iva()
        for riep in riepilogo_iva:
            dr = _add_element(dbs, "DatiRiepilogo")
            _add_element(dr, "AliquotaIVA", _format_importo(riep["aliquota"]))

            if riep.get("natura"):
                _add_element(dr, "Natura", riep["natura"])

            _add_element(dr, "ImponibileImporto",
                         _format_importo(riep["imponibile"]))
            _add_element(dr, "Imposta",
                         _format_importo(riep["imposta"]))

            esigibilita = self.fattura.get("esigibilita_iva",
                                           self.config.get("esigibilita_iva_default", "I"))
            _add_element(dr, "EssigibilitaIVA", esigibilita)

            if riep.get("riferimento_normativo"):
                _add_element(dr, "RiferimentoNormativo",
                             riep["riferimento_normativo"][:100])

    def _calcola_riepilogo_iva(self) -> list:
        """Raggruppa righe per aliquota IVA e calcola totali"""
        gruppi = {}
        for riga in self.righe:
            aliq = riga.get("aliquota_iva", 22)
            natura = riga.get("natura") or ""
            key = f"{aliq}_{natura}"
            if key not in gruppi:
                gruppi[key] = {
                    "aliquota": aliq,
                    "natura": natura if natura else None,
                    "imponibile": 0.0,
                    "imposta": 0.0,
                    "riferimento_normativo": riga.get("riferimento_normativo"),
                }
            gruppi[key]["imponibile"] += riga.get("prezzo_totale", 0)

        for g in gruppi.values():
            if g["aliquota"] > 0:
                g["imposta"] = round(g["imponibile"] * g["aliquota"] / 100, 2)
            else:
                g["imposta"] = 0.0

        return list(gruppi.values())

    def _build_dati_pagamento(self, body: ET.Element):
        """2.4 DatiPagamento"""
        condizioni = self.fattura.get("condizioni_pagamento") or \
                     self.config.get("condizioni_pagamento_default")
        modalita = self.fattura.get("modalita_pagamento") or \
                   self.config.get("modalita_pagamento_default")

        if not condizioni and not modalita:
            return

        dp = _add_element(body, "DatiPagamento")
        _add_element(dp, "CondizioniPagamento", condizioni or "TP02")

        dpm = _add_element(dp, "DettaglioPagamento")
        _add_element(dpm, "ModalitaPagamento", modalita or "MP05")

        # Data scadenza
        if self.fattura.get("data_scadenza"):
            _add_element(dpm, "DataScadenzaPagamento",
                         _format_data(self.fattura["data_scadenza"]))

        # Importo = totale - ritenuta
        importo_pagamento = self.fattura.get("totale_fattura", 0)
        ritenuta = self.fattura.get("ritenuta_importo", 0)
        _add_element(dpm, "ImportoPagamento",
                     _format_importo(importo_pagamento - ritenuta))

        # IBAN
        iban = self.fattura.get("iban_pagamento") or self.config.get("iban")
        if iban:
            _add_element(dpm, "IBAN", iban.replace(" ", ""))
        _add_if(dpm, "IstitutoFinanziario",
                self.fattura.get("istituto_finanziario") or
                self.config.get("istituto_finanziario"))

    def _build_allegati(self, body: ET.Element):
        """2.5 Allegati"""
        for all in self.allegati:
            att = _add_element(body, "Allegati")
            _add_element(att, "NomeAttachment", all.get("nome_attachment", ""))
            _add_if(att, "FormatoAttachment", all.get("formato_attachment"))
            _add_if(att, "DescrizioneAttachment", all.get("descrizione"))
            if all.get("contenuto_base64"):
                _add_element(att, "Attachment", all["contenuto_base64"])

    # ================================================================
    # OUTPUT
    # ================================================================

    def _to_string(self, root: ET.Element) -> str:
        """Converte ElementTree in stringa XML formattata"""
        rough = ET.tostring(root, encoding="unicode", xml_declaration=False)
        # Aggiungi dichiarazione XML
        xml_decl = '<?xml version="1.0" encoding="UTF-8"?>\n'
        try:
            dom = minidom.parseString(rough)
            pretty = dom.toprettyxml(indent="  ", encoding=None)
            # Rimuovi dichiarazione generata da minidom (la mettiamo noi)
            lines = pretty.split("\n")
            if lines[0].startswith("<?xml"):
                lines = lines[1:]
            return xml_decl + "\n".join(lines)
        except Exception:
            return xml_decl + rough


# ==========================================
# UTILITY: Calcolo totali fattura
# ==========================================

def calcola_totali_fattura(righe: list, fattura: dict, config: dict) -> dict:
    """
    Calcola tutti i totali di una fattura partendo dalle righe.
    
    Ritorna dict con:
        imponibile_totale, iva_totale, ritenuta_importo, cassa_importo,
        bollo_importo, totale_fattura
    """
    imponibile = sum(r.get("prezzo_totale", 0) for r in righe)
    
    # Raggruppamento IVA
    iva_totale = 0.0
    gruppi_iva = {}
    for r in righe:
        aliq = r.get("aliquota_iva", 22)
        if aliq not in gruppi_iva:
            gruppi_iva[aliq] = 0.0
        gruppi_iva[aliq] += r.get("prezzo_totale", 0)
    
    for aliq, imp in gruppi_iva.items():
        iva_totale += round(imp * aliq / 100, 2)

    # Cassa previdenziale
    cassa_importo = 0.0
    if fattura.get("cassa_tipo") and fattura.get("cassa_aliquota"):
        cassa_importo = round(imponibile * fattura["cassa_aliquota"] / 100, 2)

    # Ritenuta d'acconto
    ritenuta_importo = 0.0
    if fattura.get("ritenuta_tipo") and fattura.get("ritenuta_aliquota"):
        # Base ritenuta = righe con ritenuta=True
        base_ritenuta = sum(
            r.get("prezzo_totale", 0)
            for r in righe if r.get("ritenuta")
        )
        if not base_ritenuta:
            base_ritenuta = imponibile  # Se nessuna riga è marcata, applica su tutto
        if fattura.get("cassa_ritenuta") and cassa_importo:
            base_ritenuta += cassa_importo
        ritenuta_importo = round(base_ritenuta * fattura["ritenuta_aliquota"] / 100, 2)

    # Bollo virtuale
    bollo_importo = 0.0
    soglia_bollo = config.get("bollo_virtuale_soglia", 77.47)
    if imponibile > soglia_bollo:
        # Verifica se ci sono righe esenti (N1..N4) che richiedono bollo
        has_esenti = any(
        (r.get("natura") or "").startswith(("N1", "N2", "N3", "N4"))
            for r in righe
        )
        if has_esenti:
            bollo_importo = config.get("bollo_virtuale_importo", 2.0)

    # Totale fattura
    totale = imponibile + iva_totale + cassa_importo + bollo_importo
    # Nota: la ritenuta NON si sottrae dal totale documento, ma dall'importo pagamento

    return {
        "imponibile_totale": round(imponibile, 2),
        "iva_totale": round(iva_totale, 2),
        "cassa_importo": round(cassa_importo, 2),
        "ritenuta_importo": round(ritenuta_importo, 2),
        "bollo_virtuale": bollo_importo > 0,
        "bollo_importo": round(bollo_importo, 2),
        "totale_fattura": round(totale, 2),
    }


# ==========================================
# VALIDAZIONE XML
# ==========================================

def valida_fattura_base(config: dict, fattura: dict, righe: list) -> list:
    """
    Validazione base della fattura prima della generazione XML.
    Ritorna lista di errori (vuota = tutto ok).
    """
    errori = []

    # Config
    if not config.get("partita_iva"):
        errori.append("Configurazione: Partita IVA cedente mancante")
    if not config.get("denominazione"):
        errori.append("Configurazione: Denominazione cedente mancante")

    # Fattura
    if not fattura.get("numero_fattura"):
        errori.append("Numero fattura mancante")
    if not fattura.get("tipo_documento"):
        errori.append("Tipo documento mancante")
    if not fattura.get("dest_denominazione"):
        errori.append("Denominazione destinatario mancante")
    if not fattura.get("dest_partita_iva") and not fattura.get("dest_codice_fiscale"):
        errori.append("P.IVA o Codice Fiscale destinatario mancante")

    # Righe
    if not righe:
        errori.append("Nessuna riga in fattura")
    for i, r in enumerate(righe):
        if not r.get("descrizione"):
            errori.append(f"Riga {i+1}: descrizione mancante")
        if r.get("aliquota_iva", 0) == 0 and not r.get("natura"):
            errori.append(f"Riga {i+1}: aliquota IVA = 0 senza Natura specificata")

    # Ritenuta
    if fattura.get("ritenuta_tipo") and not fattura.get("ritenuta_causale"):
        errori.append("Causale pagamento ritenuta mancante")

    return errori
