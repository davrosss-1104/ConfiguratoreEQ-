from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base
import datetime

# ==========================================
# PREVENTIVO (Tabella principale)
# ==========================================
class Preventivo(Base):
    __tablename__ = "preventivi"

    id = Column(Integer, primary_key=True, index=True)
    numero_preventivo = Column(String, unique=True, nullable=False, index=True)
    categoria = Column(String, nullable=True)
    template_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    status = Column(String, default="draft")
    total_price = Column(Float, default=0.0)
    # Riferimento al template usato per creare questo preventivo
    template_id = Column(Integer, ForeignKey("product_templates.id", ondelete="SET NULL"), nullable=True)

    # Relazioni
    dati_commessa = relationship("DatiCommessa", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    dati_principali = relationship("DatiPrincipali", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    normative = relationship("Normative", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    disposizione_vano = relationship("DisposizioneVano", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    porte = relationship("Porte", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    materiali = relationship("Materiale", back_populates="preventivo", cascade="all, delete-orphan")
    template = relationship("ProductTemplate", back_populates="preventivi")


# ==========================================
# PRODUCT TEMPLATE (Template per categorie prodotto)
# ==========================================
class ProductTemplate(Base):
    __tablename__ = "product_templates"

    id = Column(Integer, primary_key=True, index=True)
    categoria = Column(String, nullable=False, index=True)       # "RISE" o "HOME"
    sottocategoria = Column(String, nullable=False)               # Nome sotto-categoria
    nome_display = Column(String, nullable=False)                 # Nome mostrato nel pulsante
    descrizione = Column(String, nullable=True)                   # Descrizione breve
    icona = Column(String, nullable=True)                         # Nome icona o SVG path
    ordine = Column(Integer, default=1)                           # Ordine visualizzazione
    attivo = Column(Boolean, default=True)                        # Attivo/disattivo
    # JSON con dati da pre-compilare:
    # {
    #   "dati_principali": {"tipo_impianto": "...", "tipo_trazione": "...", ...},
    #   "normative": {"en_81_20": "2020", ...},
    #   "dati_commessa": {...},
    #   "disposizione_vano": {...},
    #   "porte": {...},
    #   "materiali": [{"codice": "X", "descrizione": "Y", "quantita": 1, "prezzo_unitario": 100.0}, ...]
    # }
    template_data = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    preventivi = relationship("Preventivo", back_populates="template")


# ==========================================
# DATI COMMESSA
# ==========================================
class DatiCommessa(Base):
    __tablename__ = "dati_commessa"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False, unique=True)

    numero_offerta = Column(String, nullable=True)
    data_offerta = Column(String, nullable=True)
    riferimento_cliente = Column(String, nullable=True)
    quantita = Column(Integer, nullable=True)
    consegna_richiesta = Column(String, nullable=True)
    prezzo_unitario = Column(Float, nullable=True)
    imballo = Column(String, nullable=True)
    reso_fco = Column(String, nullable=True)
    pagamento = Column(String, nullable=True)
    trasporto = Column(String, nullable=True)
    destinazione = Column(String, nullable=True)

    preventivo = relationship("Preventivo", back_populates="dati_commessa")


# ==========================================
# DATI PRINCIPALI
# ==========================================
class DatiPrincipali(Base):
    __tablename__ = "dati_principali"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False, unique=True)

    tipo_impianto = Column(String, nullable=True)
    nuovo_impianto = Column(Boolean, nullable=True)
    numero_fermate = Column(Integer, nullable=True)
    numero_servizi = Column(Integer, nullable=True)
    velocita = Column(Float, nullable=True)
    corsa = Column(Float, nullable=True)
    con_locale_macchina = Column(Boolean, nullable=True)
    posizione_locale_macchina = Column(String, nullable=True)
    tipo_trazione = Column(String, nullable=True)
    forza_motrice = Column(String, nullable=True)
    luce = Column(String, nullable=True)
    tensione_manovra = Column(String, nullable=True)
    tensione_freno = Column(String, nullable=True)

    preventivo = relationship("Preventivo", back_populates="dati_principali")


# ==========================================
# NORMATIVE
# ==========================================
class Normative(Base):
    __tablename__ = "normative"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False, unique=True)

    en_81_1 = Column(String, nullable=True)
    en_81_20 = Column(String, nullable=True)
    en_81_21 = Column(String, nullable=True)
    en_81_28 = Column(Boolean, default=False)
    en_81_70 = Column(Boolean, default=False)
    en_81_72 = Column(Boolean, default=False)
    en_81_73 = Column(Boolean, default=False)
    a3_95_16 = Column(Boolean, default=False)
    dm236_legge13 = Column(Boolean, default=False)
    emendamento_a3 = Column(Boolean, default=False)
    uni_10411_1 = Column(Boolean, default=False)

    preventivo = relationship("Preventivo", back_populates="normative")


# ==========================================
# DISPOSIZIONE VANO
# ==========================================
class DisposizioneVano(Base):
    __tablename__ = "disposizione_vano"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    posizione_quadro_lato = Column(String, nullable=True)
    posizione_quadro_piano = Column(String, nullable=True)
    altezza_vano = Column(Float, nullable=True)
    piano_piu_alto = Column(String, nullable=True)
    piano_piu_basso = Column(String, nullable=True)
    posizioni_elementi = Column(Text, nullable=True)
    sbarchi = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    
    preventivo = relationship("Preventivo", back_populates="disposizione_vano")


# ==========================================
# PORTE
# ==========================================
class Porte(Base):
    __tablename__ = "porte"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False, unique=True)

    tipo_porte_piano = Column(String, nullable=True)
    tipo_porte_cabina = Column(String, nullable=True)
    numero_accessi = Column(Integer, nullable=True)
    tipo_operatore = Column(String, nullable=True)
    marca_operatore = Column(String, nullable=True)
    stazionamento_porte = Column(String, nullable=True)
    tipo_apertura = Column(String, nullable=True)
    distanza_minima_accessi = Column(Float, nullable=True)
    alimentazione_operatore = Column(String, nullable=True)
    con_scheda = Column(Boolean, nullable=True)

    preventivo = relationship("Preventivo", back_populates="porte")


# ==========================================
# MATERIALI
# ==========================================
class Materiale(Base):
    __tablename__ = "materiali"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False)

    codice = Column(String, nullable=False)
    descrizione = Column(String, nullable=False)
    quantita = Column(Integer, nullable=False, default=1)
    prezzo_unitario = Column(Float, nullable=False, default=0.0)
    prezzo_totale = Column(Float, nullable=False, default=0.0)
    categoria = Column(String, nullable=True)
    aggiunto_da_regola = Column(Boolean, default=False)
    regola_id = Column(String, nullable=True)
    note = Column(Text, nullable=True)

    preventivo = relationship("Preventivo", back_populates="materiali")
