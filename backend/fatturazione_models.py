"""
fatturazione_models.py - Modelli DB per il modulo Fatturazione Elettronica

Supporta:
- Fatture attive (emesse), note di credito, fatture di acconto
- Fatture passive (ricevute)
- Ritenuta d'acconto, cassa previdenziale, split payment
- Numerazione configurabile per tipo documento
- Integrazione provider SDI (Aruba, ecc.)
"""

import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey,
    Text, JSON, Enum as SAEnum, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from database import Base


# ==========================================
# CONFIGURAZIONE FATTURAZIONE
# ==========================================

class ConfigurazioneFatturazione(Base):
    """Configurazione globale fatturazione elettronica per tenant/azienda"""
    __tablename__ = "fe_configurazione"

    id = Column(Integer, primary_key=True, index=True)

    # --- Dati cedente/prestatore (chi emette) ---
    denominazione = Column(String(200), nullable=False)
    partita_iva = Column(String(20), nullable=False)
    codice_fiscale = Column(String(20), nullable=True)
    regime_fiscale = Column(String(10), default="RF01")  # RF01=Ordinario, RF02=Contribuenti minimi, ecc.
    indirizzo = Column(String(200))
    numero_civico = Column(String(20))
    cap = Column(String(10))
    comune = Column(String(100))
    provincia = Column(String(5))
    nazione = Column(String(5), default="IT")

    # --- Contatti ---
    telefono = Column(String(30))
    email = Column(String(200))
    pec = Column(String(200))

    # --- Iscrizione REA ---
    rea_ufficio = Column(String(5))      # Es: "VA"
    rea_numero = Column(String(20))      # Es: "123456"
    rea_capitale_sociale = Column(Float)
    rea_socio_unico = Column(String(5))  # SU=socio unico, SM=più soci
    rea_stato_liquidazione = Column(String(5), default="LN")  # LN=non in liquidazione, LS=in liquidazione

    # --- SDI ---
    codice_destinatario_default = Column(String(10), default="0000000")
    id_paese_trasmittente = Column(String(5), default="IT")
    id_codice_trasmittente = Column(String(30))  # P.IVA del trasmittente (di solito = P.IVA azienda)
    formato_trasmissione = Column(String(10), default="FPR12")  # FPR12=privati, FPA12=PA

    # --- Provider SDI ---
    sdi_provider = Column(String(50), default="aruba")  # aruba, fattureincloud, manuale
    sdi_username = Column(String(200))
    sdi_password_encrypted = Column(String(500))  # Password criptata
    sdi_ambiente = Column(String(20), default="demo")  # demo, produzione
    sdi_codice_destinatario_ricezione = Column(String(10))  # Codice per ricevere (Aruba: KRRH6B9)

    # --- IVA defaults ---
    aliquota_iva_default = Column(Float, default=22.0)
    esigibilita_iva_default = Column(String(5), default="I")  # I=immediata, D=differita, S=split payment
    natura_iva_default = Column(String(10))  # N1..N7 per operazioni esenti/escluse/non imponibili

    # --- Ritenuta d'acconto ---
    ritenuta_tipo_default = Column(String(10))  # RT01=persone fisiche, RT02=giuridiche, RT03, RT04, ecc.
    ritenuta_aliquota_default = Column(Float)   # Es: 20.0
    ritenuta_causale_default = Column(String(5))  # A, B, C, ... Z (causale pagamento)

    # --- Cassa previdenziale ---
    cassa_tipo_default = Column(String(10))     # TC01=INPS, TC02=cassa avvocati, TC22=INPS gestione separata
    cassa_aliquota_default = Column(Float)      # Es: 4.0
    cassa_imponibile_tipo = Column(String(20), default="percentuale")  # percentuale o fisso
    cassa_ritenuta = Column(Boolean, default=False)  # Se soggetta a ritenuta

    # --- Bollo virtuale ---
    bollo_virtuale_soglia = Column(Float, default=77.47)  # Importo sopra cui si applica bollo
    bollo_virtuale_importo = Column(Float, default=2.0)

    # --- Pagamento default ---
    condizioni_pagamento_default = Column(String(10), default="TP02")  # TP01=a rate, TP02=completo, TP03=anticipo
    modalita_pagamento_default = Column(String(10), default="MP05")    # MP05=bonifico
    iban = Column(String(40))
    bic = Column(String(20))
    istituto_finanziario = Column(String(200))

    # --- Audit ---
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class NumerazioneFatture(Base):
    """Contatori numerazione per ogni tipo documento, per anno"""
    __tablename__ = "fe_numerazione"
    __table_args__ = (
        UniqueConstraint("tipo_documento", "anno", "sezionale", name="uq_numerazione"),
    )

    id = Column(Integer, primary_key=True, index=True)
    tipo_documento = Column(String(10), nullable=False)  # TD01, TD02, TD04, TD06, ecc.
    anno = Column(Integer, nullable=False)
    sezionale = Column(String(20), default="")  # Sezionale opzionale (es: "A", "B")

    # --- Formato numerazione ---
    prefisso = Column(String(20), default="")     # Es: "FT", "NC", "FA"
    ultimo_numero = Column(Integer, default=0)
    formato = Column(String(100), default="{prefisso}{numero}/{anno}")  # Template numerazione
    padding_cifre = Column(Integer, default=1)    # Cifre minime (0=no padding, 4=0001)

    # Audit
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# ==========================================
# FATTURA (Testata)
# ==========================================

class Fattura(Base):
    """Testata fattura elettronica (attiva e passiva)"""
    __tablename__ = "fe_fatture"
    __table_args__ = (
        Index("ix_fe_fatture_numero", "numero_fattura", "anno"),
        Index("ix_fe_fatture_stato", "stato_sdi"),
    )

    id = Column(Integer, primary_key=True, index=True)

    # --- Tipo e direzione ---
    direzione = Column(String(10), nullable=False, default="attiva")  # attiva, passiva
    tipo_documento = Column(String(10), nullable=False, default="TD01")
    # TD01=Fattura, TD02=Acconto/Anticipo su fattura, TD03=Acconto/Anticipo su parcella
    # TD04=Nota di credito, TD05=Nota di debito, TD06=Parcella
    # TD16=Integrazione reverse charge interno, TD17=Integrazione/autofattura acquisti servizi estero
    # TD20=Autofattura, TD24=Fattura differita, TD25=Fattura differita art.36-bis
    # TD26=Cessione beni ammortizzabili / passaggi interni
    # TD27=Fattura autoconsumo / cessioni gratuite senza rivalsa

    # --- Numerazione ---
    numero_fattura = Column(String(50), nullable=True)  # Numero assegnato (es: "FT-1/2026")
    anno = Column(Integer, nullable=True)
    progressivo_invio = Column(String(10))  # Progressivo univoco per SDI (5 char alfanumerico)

    # --- Collegamento ordine/preventivo ---
    ordine_id = Column(Integer, nullable=True)
    preventivo_id = Column(Integer, nullable=True)
    fattura_origine_id = Column(Integer, ForeignKey("fe_fatture.id"), nullable=True)
    # Per NC: fattura a cui si riferisce

    # --- Soggetti ---
    cliente_id = Column(Integer, nullable=True)

    # Dati cessionario/committente (denormalizzati per storicizzazione)
    dest_denominazione = Column(String(200))
    dest_partita_iva = Column(String(20))
    dest_codice_fiscale = Column(String(20))
    dest_indirizzo = Column(String(200))
    dest_numero_civico = Column(String(20))
    dest_cap = Column(String(10))
    dest_comune = Column(String(100))
    dest_provincia = Column(String(5))
    dest_nazione = Column(String(5), default="IT")
    dest_pec = Column(String(200))
    dest_codice_destinatario = Column(String(10), default="0000000")

    # --- Date ---
    data_fattura = Column(DateTime, nullable=True)
    data_scadenza = Column(DateTime, nullable=True)

    # --- Totali ---
    imponibile_totale = Column(Float, default=0.0)
    iva_totale = Column(Float, default=0.0)
    totale_fattura = Column(Float, default=0.0)  # = imponibile + iva - ritenuta + bollo + cassa_prev

    # --- Ritenuta d'acconto ---
    ritenuta_tipo = Column(String(10))    # RT01, RT02, ecc.
    ritenuta_aliquota = Column(Float)
    ritenuta_importo = Column(Float, default=0.0)
    ritenuta_causale = Column(String(5))  # Causale pagamento (A, B, C, ...)

    # --- Cassa previdenziale ---
    cassa_tipo = Column(String(10))        # TC01, TC02, TC22 ecc.
    cassa_aliquota = Column(Float)
    cassa_importo = Column(Float, default=0.0)
    cassa_imponibile = Column(Float, default=0.0)
    cassa_aliquota_iva = Column(Float)
    cassa_ritenuta = Column(Boolean, default=False)
    cassa_natura = Column(String(10))      # Se esente: N1..N7

    # --- Bollo ---
    bollo_virtuale = Column(Boolean, default=False)
    bollo_importo = Column(Float, default=0.0)

    # --- Esigibilità IVA ---
    esigibilita_iva = Column(String(5), default="I")  # I, D, S(split payment)

    # --- Pagamento ---
    condizioni_pagamento = Column(String(10))  # TP01, TP02, TP03
    modalita_pagamento = Column(String(10))    # MP01..MP23
    iban_pagamento = Column(String(40))
    istituto_finanziario = Column(String(200))

    # --- Dati ordine acquisto (per tracciabilità) ---
    dati_ordine_id_documento = Column(String(50))
    dati_ordine_data = Column(DateTime)
    dati_ordine_codice_commessa = Column(String(100))
    dati_ordine_codice_cup = Column(String(50))   # Codice Unico di Progetto (PA)
    dati_ordine_codice_cig = Column(String(50))   # Codice Identificativo Gara (PA)

    # --- Stato SDI ---
    stato_sdi = Column(String(30), default="bozza")
    # bozza, generata, inviata, consegnata, accettata, rifiutata, 
    # scartata, mancata_consegna, decorrenza_termini, errore

    # --- File e riferimenti SDI ---
    xml_filename = Column(String(200))       # Nome file XML generato
    xml_content = Column(Text)               # Contenuto XML (base64 o testo)
    sdi_identificativo = Column(String(100)) # ID restituito da SDI
    sdi_filename = Column(String(200))       # Filename assegnato da SDI
    sdi_data_invio = Column(DateTime)
    sdi_data_consegna = Column(DateTime)
    sdi_notifica_json = Column(JSON)         # Ultima notifica SDI ricevuta

    # --- Per fatture passive ---
    fornitore_denominazione = Column(String(200))
    fornitore_partita_iva = Column(String(20))
    fornitore_codice_fiscale = Column(String(20))
    data_ricezione = Column(DateTime)
    registrata = Column(Boolean, default=False)  # Se è stata registrata in contabilità

    # --- Note ---
    causale = Column(Text)  # Causale fattura (campo 2.1.1.11 FatturaPA)
    note_interne = Column(Text)

    # --- Audit ---
    created_by = Column(String(100))
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    righe = relationship("RigaFattura", back_populates="fattura", cascade="all, delete-orphan",
                         order_by="RigaFattura.numero_riga")
    allegati = relationship("AllegatoFattura", back_populates="fattura", cascade="all, delete-orphan")
    notifiche = relationship("NotificaSDI", back_populates="fattura", cascade="all, delete-orphan",
                             order_by="NotificaSDI.data_ricezione.desc()")
    fattura_origine = relationship("Fattura", remote_side=[id], foreign_keys=[fattura_origine_id])


# ==========================================
# RIGHE FATTURA
# ==========================================

class RigaFattura(Base):
    """Righe dettaglio fattura (DettaglioLinee in FatturaPA)"""
    __tablename__ = "fe_righe_fattura"

    id = Column(Integer, primary_key=True, index=True)
    fattura_id = Column(Integer, ForeignKey("fe_fatture.id", ondelete="CASCADE"), nullable=False)

    numero_riga = Column(Integer, nullable=False)
    
    # --- Codice articolo ---
    codice_tipo = Column(String(50))    # Es: "INTERNO", "EAN", "CODICE_FORNITORE"
    codice_valore = Column(String(100))

    descrizione = Column(String(1000), nullable=False)
    quantita = Column(Float, default=1.0)
    unita_misura = Column(String(20))
    prezzo_unitario = Column(Float, default=0.0)

    # Sconti/Maggiorazioni per riga
    sconto_percentuale = Column(Float, default=0.0)
    sconto_importo = Column(Float, default=0.0)
    maggiorazione_percentuale = Column(Float, default=0.0)
    maggiorazione_importo = Column(Float, default=0.0)

    prezzo_totale = Column(Float, default=0.0)  # = qta * prezzo_unit * (1 - sconto%) oppure calcolato

    # --- IVA per riga ---
    aliquota_iva = Column(Float, default=22.0)
    natura = Column(String(10))        # N1..N7 se aliquota=0
    riferimento_normativo = Column(String(200))  # Riferimento normativo per esenzione

    # --- Ritenuta ---
    ritenuta = Column(Boolean, default=False)  # Se soggetto a ritenuta

    # --- Date ---
    data_inizio_periodo = Column(DateTime)
    data_fine_periodo = Column(DateTime)

    # --- Riferimento ordine ---
    riferimento_ordine = Column(String(50))
    riferimento_ddt = Column(String(50))
    riferimento_ddt_data = Column(DateTime)

    # --- Note ---
    note = Column(Text)

    # Relationships
    fattura = relationship("Fattura", back_populates="righe")


# ==========================================
# ALLEGATI FATTURA
# ==========================================

class AllegatoFattura(Base):
    """Allegati alla fattura elettronica"""
    __tablename__ = "fe_allegati"

    id = Column(Integer, primary_key=True, index=True)
    fattura_id = Column(Integer, ForeignKey("fe_fatture.id", ondelete="CASCADE"), nullable=False)

    nome_attachment = Column(String(200), nullable=False)
    formato_attachment = Column(String(20))  # pdf, xml, ecc.
    descrizione = Column(String(500))
    contenuto_base64 = Column(Text)  # Contenuto in base64

    fattura = relationship("Fattura", back_populates="allegati")


# ==========================================
# NOTIFICHE SDI
# ==========================================

class NotificaSDI(Base):
    """Notifiche ricevute da SDI per una fattura"""
    __tablename__ = "fe_notifiche_sdi"

    id = Column(Integer, primary_key=True, index=True)
    fattura_id = Column(Integer, ForeignKey("fe_fatture.id", ondelete="CASCADE"), nullable=False)

    tipo_notifica = Column(String(50))  # RC=ricevuta consegna, NS=notifica scarto, MC=mancata consegna,
                                         # NE=notifica esito, DT=decorrenza termini, AT=attestazione
    filename_notifica = Column(String(200))
    descrizione = Column(String(500))
    data_ricezione = Column(DateTime, default=datetime.datetime.utcnow)
    contenuto_json = Column(JSON)  # Payload completo notifica

    fattura = relationship("Fattura", back_populates="notifiche")


# ==========================================
# REGISTRO IVA
# ==========================================

class RegistroIVA(Base):
    """Registro IVA (vendite e acquisti)"""
    __tablename__ = "fe_registro_iva"
    __table_args__ = (
        UniqueConstraint("tipo_registro", "anno", "numero_protocollo", name="uq_registro_iva"),
    )

    id = Column(Integer, primary_key=True, index=True)
    fattura_id = Column(Integer, ForeignKey("fe_fatture.id"), nullable=True)

    tipo_registro = Column(String(20), nullable=False)  # vendite, acquisti, corrispettivi
    anno = Column(Integer, nullable=False)
    numero_protocollo = Column(Integer, nullable=False)  # Progressivo nel registro

    data_registrazione = Column(DateTime, nullable=False)
    data_documento = Column(DateTime)
    numero_documento = Column(String(50))

    # Controparte
    controparte_denominazione = Column(String(200))
    controparte_partita_iva = Column(String(20))

    # Importi
    imponibile = Column(Float, default=0.0)
    imposta = Column(Float, default=0.0)
    aliquota_iva = Column(Float)
    natura = Column(String(10))

    # Ritenuta
    ritenuta_importo = Column(Float, default=0.0)

    note = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# ==========================================
# HELPER: Mapping tipi documento
# ==========================================

TIPI_DOCUMENTO = {
    "TD01": "Fattura",
    "TD02": "Acconto/Anticipo su fattura",
    "TD03": "Acconto/Anticipo su parcella",
    "TD04": "Nota di credito",
    "TD05": "Nota di debito",
    "TD06": "Parcella",
    "TD16": "Integrazione reverse charge interno",
    "TD17": "Integrazione/autofattura servizi estero",
    "TD20": "Autofattura",
    "TD24": "Fattura differita",
    "TD25": "Fattura differita art.36-bis",
    "TD26": "Cessione beni ammortizzabili",
    "TD27": "Autoconsumo/cessioni gratuite",
}

REGIMI_FISCALI = {
    "RF01": "Regime ordinario",
    "RF02": "Regime contribuenti minimi (art.1, c.96-117, L.244/2007)",
    "RF04": "Agricoltura e attività connesse e pesca (artt.34 e 34-bis, DPR 633/1972)",
    "RF05": "Vendita sali e tabacchi (art.74, c.1, DPR 633/1972)",
    "RF06": "Commercio fiammiferi (art.74, c.1, DPR 633/1972)",
    "RF07": "Editoria (art.74, c.1, DPR 633/1972)",
    "RF08": "Gestione servizi telefonia pubblica (art.74, c.1, DPR 633/1972)",
    "RF09": "Rivendita documenti trasporto (art.74, c.1, DPR 633/1972)",
    "RF10": "Intrattenimenti, giochi e altre attività (art.74, c.6, DPR 633/1972)",
    "RF11": "Agenzie viaggi e turismo (art.74-ter, DPR 633/1972)",
    "RF12": "Agriturismo (art.5, c.2, L.413/1991)",
    "RF13": "Vendite a domicilio (art.25-bis, c.6, DPR 600/1973)",
    "RF14": "Rivendita beni usati, oggetti d'arte, d'antiquariato o da collezione (art.36, DL 41/1995)",
    "RF15": "Agenzie di vendite all'asta di oggetti d'arte, antiquariato o da collezione (art.40-bis, DL 41/1995)",
    "RF16": "IVA per cassa P.A. (art.6, c.5, DPR 633/1972)",
    "RF17": "IVA per cassa (art.32-bis, DL 83/2012)",
    "RF18": "Altro",
    "RF19": "Regime forfettario (art.1, c.54-89, L.190/2014)",
}

MODALITA_PAGAMENTO = {
    "MP01": "Contanti",
    "MP02": "Assegno",
    "MP03": "Assegno circolare",
    "MP04": "Contanti presso Tesoreria",
    "MP05": "Bonifico",
    "MP06": "Vaglia cambiario",
    "MP07": "Bollettino bancario",
    "MP08": "Carta di pagamento",
    "MP09": "RID",
    "MP10": "RID utenze",
    "MP11": "RID veloce",
    "MP12": "RIBA",
    "MP13": "MAV",
    "MP14": "Quietanza erario",
    "MP15": "Giroconto su conti di contabilità speciale",
    "MP16": "Domiciliazione bancaria",
    "MP17": "Domiciliazione postale",
    "MP18": "Bollettino di c/c postale",
    "MP19": "SEPA Direct Debit",
    "MP20": "SEPA Direct Debit CORE",
    "MP21": "SEPA Direct Debit B2B",
    "MP22": "Trattenuta su somme già riscosse",
    "MP23": "PagoPA",
}

NATURE_IVA = {
    "N1": "Escluse ex art.15 del DPR 633/1972",
    "N2": "Non soggette",
    "N2.1": "Non soggette ad IVA - artt. da 7 a 7-septies del DPR 633/72",
    "N2.2": "Non soggette - altri casi",
    "N3": "Non imponibili",
    "N3.1": "Non imponibili - esportazioni",
    "N3.2": "Non imponibili - cessioni intracomunitarie",
    "N3.3": "Non imponibili - cessioni verso San Marino",
    "N3.4": "Non imponibili - operazioni assimilate alle cessioni all'esportazione",
    "N3.5": "Non imponibili - a seguito di dichiarazioni d'intento",
    "N3.6": "Non imponibili - altre operazioni",
    "N4": "Esenti",
    "N5": "Regime del margine / IVA non esposta in fattura",
    "N6": "Inversione contabile (reverse charge)",
    "N6.1": "Inversione contabile - cessione rottami",
    "N6.2": "Inversione contabile - cessione oro e argento",
    "N6.3": "Inversione contabile - subappalto settore edile",
    "N6.4": "Inversione contabile - cessione fabbricati",
    "N6.5": "Inversione contabile - cessione telefoni cellulari",
    "N6.6": "Inversione contabile - cessione prodotti elettronici",
    "N6.7": "Inversione contabile - prestazioni comparto edile e settori connessi",
    "N6.8": "Inversione contabile - operazioni settore energetico",
    "N6.9": "Inversione contabile - altri casi",
    "N7": "IVA assolta in altro stato UE",
}

TIPI_CASSA = {
    "TC01": "Cassa nazionale previdenza e assistenza avvocati e procuratori legali",
    "TC02": "Cassa previdenza dottori commercialisti",
    "TC03": "Cassa previdenza e assistenza geometri",
    "TC04": "Cassa nazionale previdenza e assistenza ingegneri e architetti liberi professionisti",
    "TC05": "Cassa nazionale del notariato",
    "TC06": "Cassa nazionale previdenza e assistenza ragionieri e periti commerciali",
    "TC07": "Ente nazionale assistenza agenti e rappresentanti di commercio (ENASARCO)",
    "TC08": "Ente nazionale previdenza e assistenza consulenti del lavoro (ENPACL)",
    "TC09": "Ente nazionale previdenza e assistenza medici (ENPAM)",
    "TC10": "Ente nazionale previdenza e assistenza farmacisti (ENPAF)",
    "TC11": "Ente nazionale previdenza e assistenza veterinari (ENPAV)",
    "TC12": "Ente nazionale previdenza e assistenza impiegati dell'agricoltura (ENPAIA)",
    "TC13": "Fondo previdenza impiegati imprese di spedizione e agenzie marittime",
    "TC14": "Istituto nazionale previdenza giornalisti italiani (INPGI)",
    "TC15": "Opera nazionale assistenza orfani sanitari italiani (ONAOSI)",
    "TC16": "Cassa autonoma assistenza integrativa giornalisti italiani (CASAGIT)",
    "TC17": "Ente previdenza periti industriali e periti industriali laureati (EPPI)",
    "TC18": "Ente previdenza e assistenza pluricategoriale (EPAP)",
    "TC19": "Ente nazionale previdenza e assistenza biologi (ENPAB)",
    "TC20": "Ente nazionale previdenza e assistenza della professione infermieristica (ENPAPI)",
    "TC21": "Ente nazionale previdenza e assistenza psicologi (ENPAP)",
    "TC22": "INPS gestione separata",
}
