from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Text, Numeric
from sqlalchemy.orm import relationship
from database import Base
import datetime

# ==========================================
# GRUPPI UTENTI
# ==========================================
class GruppoUtenti(Base):
    __tablename__ = "gruppi_utenti"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), unique=True, nullable=False)
    descrizione = Column(String(500), nullable=True)
    is_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    utenti = relationship("Utente", back_populates="gruppo")
    permessi = relationship("PermessoGruppo", back_populates="gruppo", cascade="all, delete-orphan")


# ==========================================
# PERMESSI GRUPPI
# ==========================================
class PermessoGruppo(Base):
    __tablename__ = "permessi_gruppi"

    id = Column(Integer, primary_key=True, index=True)
    gruppo_id = Column(Integer, ForeignKey("gruppi_utenti.id", ondelete="CASCADE"), nullable=False)
    codice_permesso = Column(String(100), nullable=False)
    descrizione = Column(String(500), nullable=True)

    gruppo = relationship("GruppoUtenti", back_populates="permessi")


# ==========================================
# UTENTI
# ==========================================
class Utente(Base):
    __tablename__ = "utenti"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    nome = Column(String(100), nullable=True)
    cognome = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    gruppo_id = Column(Integer, ForeignKey("gruppi_utenti.id"), nullable=True)
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    gruppo = relationship("GruppoUtenti", back_populates="utenti")


# ==========================================
# PARAMETRI SISTEMA
# ==========================================
class ParametriSistema(Base):
    __tablename__ = "parametri_sistema"

    id = Column(Integer, primary_key=True, index=True)
    chiave = Column(String(100), unique=True, nullable=False)
    valore = Column(String(500), nullable=False)
    descrizione = Column(String(500), nullable=True)
    tipo_dato = Column(String(50), default="string")
    gruppo = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# ==========================================
# CATEGORIE ARTICOLI
# ==========================================
class CategoriaArticoli(Base):
    __tablename__ = "categorie_articoli"

    id = Column(Integer, primary_key=True, index=True)
    codice = Column(String(50), unique=True, nullable=False)
    nome = Column(String(255), nullable=False)
    descrizione = Column(Text, nullable=True)
    ordine = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    articoli = relationship("Articolo", back_populates="categoria_rel")


# ==========================================
# ARTICOLI
# ==========================================
class Articolo(Base):
    __tablename__ = "articoli"

    id = Column(Integer, primary_key=True, index=True)
    codice = Column(String(50), unique=True, nullable=False, index=True)
    descrizione = Column(String(500), nullable=False)
    descrizione_estesa = Column(Text, nullable=True)
    tipo_articolo = Column(String(20), default="PRODUZIONE")
    categoria_id = Column(Integer, ForeignKey("categorie_articoli.id"), nullable=True)
    costo_fisso = Column(Float, default=0)
    costo_variabile_1 = Column(Float, default=0)
    unita_misura_var_1 = Column(String(20), nullable=True)
    descrizione_var_1 = Column(String(100), nullable=True)
    costo_variabile_2 = Column(Float, default=0)
    unita_misura_var_2 = Column(String(20), nullable=True)
    descrizione_var_2 = Column(String(100), nullable=True)
    costo_variabile_3 = Column(Float, default=0)
    unita_misura_var_3 = Column(String(20), nullable=True)
    descrizione_var_3 = Column(String(100), nullable=True)
    costo_variabile_4 = Column(Float, default=0)
    unita_misura_var_4 = Column(String(20), nullable=True)
    descrizione_var_4 = Column(String(100), nullable=True)
    rule_id_calcolo = Column(String(100), nullable=True)
    ricarico_percentuale = Column(Float, nullable=True)
    unita_misura = Column(String(20), default="PZ")
    giacenza = Column(Integer, default=0)
    scorta_minima = Column(Integer, default=0)
    fornitore = Column(String(255), nullable=True)
    codice_fornitore = Column(String(50), nullable=True)
    lead_time_giorni = Column(Integer, default=0)
    manodopera_giorni = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    categoria_rel = relationship("CategoriaArticoli", back_populates="articoli")


# ==========================================
# CLIENTI
# ==========================================
class Cliente(Base):
    __tablename__ = "clienti"

    id = Column(Integer, primary_key=True, index=True)
    codice = Column(String(50), unique=True, nullable=False, index=True)
    ragione_sociale = Column(String(255), nullable=False)
    partita_iva = Column(String(20), nullable=True)
    codice_fiscale = Column(String(20), nullable=True)
    indirizzo = Column(String(255), nullable=True)
    cap = Column(String(10), nullable=True)
    citta = Column(String(100), nullable=True)
    provincia = Column(String(5), nullable=True)
    nazione = Column(String(100), default="Italia")
    telefono = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    pec = Column(String(255), nullable=True)
    sconto_globale = Column(Float, default=0)
    sconto_produzione = Column(Float, default=0)
    sconto_acquisto = Column(Float, default=0)
    aliquota_iva = Column(Float, default=22)
    pagamento_default = Column(String(100), nullable=True)
    imballo_default = Column(String(100), nullable=True)
    reso_fco_default = Column(String(100), nullable=True)
    trasporto_default = Column(String(100), nullable=True)
    destinazione_default = Column(String(255), nullable=True)
    riferimento_cliente_default = Column(String(100), nullable=True)
    listino = Column(String(50), nullable=True)
    note = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# ==========================================
# PREVENTIVO (Tabella principale)
# ==========================================
class Preventivo(Base):
    __tablename__ = "preventivi"

    id = Column(Integer, primary_key=True, index=True)
    numero_preventivo = Column(String, unique=True, nullable=False, index=True)
    tipo_preventivo = Column(String(20), default="COMPLETO")
    categoria = Column(String, nullable=True)
    template_id = Column(Integer, ForeignKey("product_templates.id", ondelete="SET NULL"), nullable=True)
    cliente_id = Column(Integer, ForeignKey("clienti.id"), nullable=True)
    customer_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    data_scadenza = Column(DateTime, nullable=True)
    status = Column(String, default="draft")
    total_price = Column(Float, default=0.0)
    sconto_cliente = Column(Float, default=0)
    sconto_extra_admin = Column(Float, default=0)
    total_price_finale = Column(Float, default=0)
    note = Column(Text, nullable=True)
    created_by = Column(Integer, ForeignKey("utenti.id"), nullable=True)

    # Relazioni
    dati_commessa = relationship("DatiCommessa", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    dati_principali = relationship("DatiPrincipali", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    normative = relationship("Normative", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    disposizione_vano = relationship("DisposizioneVano", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    porte = relationship("Porte", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    argano = relationship("Argano", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    materiali = relationship("Materiale", back_populates="preventivo", cascade="all, delete-orphan")
    righe_ricambio = relationship("RigaRicambio", back_populates="preventivo", cascade="all, delete-orphan")
    template = relationship("ProductTemplate", back_populates="preventivi")


# ==========================================
# PRODUCT TEMPLATE (Template per categorie prodotto)
# ==========================================
class ProductTemplate(Base):
    __tablename__ = "product_templates"

    id = Column(Integer, primary_key=True, index=True)
    categoria = Column(String, nullable=False, index=True)
    sottocategoria = Column(String, nullable=False)
    nome_display = Column(String, nullable=False)
    descrizione = Column(String, nullable=True)
    icona = Column(String, nullable=True)
    ordine = Column(Integer, default=1)
    attivo = Column(Boolean, default=True)
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
# ARGANO
# ==========================================
class Argano(Base):
    __tablename__ = "argano"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False, unique=True)

    trazione = Column(String(100), nullable=True)
    potenza_motore_kw = Column(Float, nullable=True)
    corrente_nom_motore_amp = Column(Float, nullable=True)
    tipo_vvvf = Column(String(100), nullable=True)
    vvvf_nel_vano = Column(Boolean, default=False)
    freno_tensione = Column(String(50), nullable=True)
    ventilazione_forzata = Column(String(50), nullable=True)
    tipo_teleruttore = Column(String(100), nullable=True)

    preventivo = relationship("Preventivo", back_populates="argano")


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


# ==========================================
# RIGHE RICAMBIO
# ==========================================
class RigaRicambio(Base):
    __tablename__ = "righe_ricambio"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False)
    articolo_id = Column(Integer, ForeignKey("articoli.id"), nullable=True)

    codice = Column(String(50), nullable=False)
    descrizione = Column(String(500), nullable=False)
    tipo_articolo = Column(String(20), default="PRODUZIONE")
    quantita = Column(Float, default=1)

    parametro_1 = Column(Float, nullable=True)
    unita_param_1 = Column(String(20), nullable=True)
    desc_param_1 = Column(String(100), nullable=True)
    costo_var_1 = Column(Float, default=0)

    parametro_2 = Column(Float, nullable=True)
    unita_param_2 = Column(String(20), nullable=True)
    desc_param_2 = Column(String(100), nullable=True)
    costo_var_2 = Column(Float, default=0)

    parametro_3 = Column(Float, nullable=True)
    unita_param_3 = Column(String(20), nullable=True)
    desc_param_3 = Column(String(100), nullable=True)
    costo_var_3 = Column(Float, default=0)

    parametro_4 = Column(Float, nullable=True)
    unita_param_4 = Column(String(20), nullable=True)
    desc_param_4 = Column(String(100), nullable=True)
    costo_var_4 = Column(Float, default=0)

    costo_fisso = Column(Float, default=0)
    costo_base_unitario = Column(Float, default=0)
    ricarico_percentuale = Column(Float, default=0)
    prezzo_listino_unitario = Column(Float, default=0)
    sconto_cliente = Column(Float, default=0)
    prezzo_cliente_unitario = Column(Float, default=0)
    prezzo_totale_listino = Column(Float, default=0)
    prezzo_totale_cliente = Column(Float, default=0)
    ordine = Column(Integer, default=0)
    note = Column(Text, nullable=True)

    preventivo = relationship("Preventivo", back_populates="righe_ricambio")
