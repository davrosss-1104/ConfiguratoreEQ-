from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, Date, ForeignKey, Text, Numeric
from sqlalchemy.orm import relationship
from database import Base
import datetime


# ==========================================
# PARAMETRI SISTEMA
# ==========================================
class ParametriSistema(Base):
    __tablename__ = "parametri_sistema"

    id = Column(Integer, primary_key=True, index=True)
    chiave = Column(String(100), unique=True, nullable=False, index=True)
    valore = Column(String(500), nullable=False)
    descrizione = Column(String(500), nullable=True)
    tipo_dato = Column(String(50), default="string")
    gruppo = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# ==========================================
# OPZIONI DROPDOWN
# ==========================================
class OpzioneDropdown(Base):
    __tablename__ = "opzioni_dropdown"

    id = Column(Integer, primary_key=True, index=True)
    gruppo = Column(String(100), nullable=False, index=True)  # es: "tipo_impianto", "forza_motrice"
    valore = Column(String(200), nullable=False)              # valore salvato nel DB
    etichetta = Column(String(200), nullable=False)           # testo visualizzato
    ordine = Column(Integer, default=0)                       # ordinamento
    attivo = Column(Boolean, default=True)                    # se mostrare l'opzione
    descrizione = Column(String(500), nullable=True)          # note opzionali
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# ==========================================
# CAMPI CONFIGURATORE (per Rule Designer)
# ==========================================
class CampoConfiguratore(Base):
    """
    Definisce tutti i campi del modulo d'ordine.
    Usato da:
    - Frontend: per costruire form dinamici
    - Rule Designer: per creare condizioni e azioni
    - Validazione: per verificare valori ammessi
    """
    __tablename__ = "campi_configuratore"

    id = Column(Integer, primary_key=True, index=True)
    codice = Column(String(100), unique=True, nullable=False, index=True)  # es: "dati_principali.numero_fermate"
    etichetta = Column(String(200), nullable=False)                         # es: "Numero Fermate"
    tipo = Column(String(50), nullable=False)                               # "dropdown", "numero", "testo", "booleano"
    sezione = Column(String(100), nullable=False, index=True)               # es: "dati_principali", "normative", "argano"
    
    # Per dropdown
    gruppo_dropdown = Column(String(100), nullable=True)                    # riferimento a opzioni_dropdown.gruppo
    
    # Per numeri
    unita_misura = Column(String(20), nullable=True)                        # "m", "kg", "kW", "mm", ecc.
    valore_min = Column(Float, nullable=True)
    valore_max = Column(Float, nullable=True)
    valore_default = Column(String(200), nullable=True)                     # valore di default (stringa per flessibilità)
    
    # Metadati
    descrizione = Column(String(500), nullable=True)
    obbligatorio = Column(Boolean, default=False)
    ordine = Column(Integer, default=0)
    attivo = Column(Boolean, default=True)
    visibile_form = Column(Boolean, default=True)                           # se mostrare nei form
    usabile_regole = Column(Boolean, default=True)                          # se usabile nel Rule Designer
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# ==========================================
# GRUPPI UTENTI E PERMESSI
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
# TEMPLATE PREVENTIVI
# ==========================================
class TemplatePreventivo(Base):
    __tablename__ = "template_preventivi"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(255), nullable=False)
    descrizione = Column(Text, nullable=True)
    
    # Chi ha creato il template
    created_by = Column(Integer, ForeignKey("utenti.id"), nullable=True)
    
    # Se True, visibile a tutti (solo admin può creare pubblici)
    is_public = Column(Boolean, default=False)
    
    # Dati del template serializzati in JSON
    dati_json = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    # Relazione con utente creatore
    creatore = relationship("Utente")


# ==========================================
# CLIENTI (Anagrafica)
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
    
    # Sconti personalizzati
    sconto_globale = Column(Numeric(5, 2), default=0)
    sconto_produzione = Column(Numeric(5, 2), default=0)
    sconto_acquisto = Column(Numeric(5, 2), default=0)
    
    # Aliquota IVA (default 22%)
    aliquota_iva = Column(Numeric(5, 2), default=22)
    
    # Condizioni commerciali DEFAULT
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

    preventivi = relationship("Preventivo", back_populates="cliente")


# ==========================================
# CATEGORIE ARTICOLI
# ==========================================
class CategoriaArticolo(Base):
    __tablename__ = "categorie_articoli"

    id = Column(Integer, primary_key=True, index=True)
    codice = Column(String(50), unique=True, nullable=False, index=True)
    nome = Column(String(255), nullable=False)
    descrizione = Column(Text, nullable=True)
    ordine = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    articoli = relationship("Articolo", back_populates="categoria")


# ==========================================
# ARTICOLI (Anagrafica prodotti/ricambi)
# ==========================================
class Articolo(Base):
    __tablename__ = "articoli"

    id = Column(Integer, primary_key=True, index=True)
    codice = Column(String(50), unique=True, nullable=False, index=True)
    descrizione = Column(String(500), nullable=False)
    descrizione_estesa = Column(Text, nullable=True)
    
    # Tipo articolo: PRODUZIONE o ACQUISTO
    tipo_articolo = Column(String(20), default="PRODUZIONE")
    
    # Categoria
    categoria_id = Column(Integer, ForeignKey("categorie_articoli.id"), nullable=True)
    
    # === COSTI (Step 1) - fino a 4 parametri variabili ===
    costo_fisso = Column(Numeric(12, 4), default=0)
    
    costo_variabile_1 = Column(Numeric(12, 4), default=0)
    unita_misura_var_1 = Column(String(20), nullable=True)  # es: "metro", "kg"
    descrizione_var_1 = Column(String(100), nullable=True)  # es: "Lunghezza cavo"
    
    costo_variabile_2 = Column(Numeric(12, 4), default=0)
    unita_misura_var_2 = Column(String(20), nullable=True)
    descrizione_var_2 = Column(String(100), nullable=True)
    
    costo_variabile_3 = Column(Numeric(12, 4), default=0)
    unita_misura_var_3 = Column(String(20), nullable=True)
    descrizione_var_3 = Column(String(100), nullable=True)
    
    costo_variabile_4 = Column(Numeric(12, 4), default=0)
    unita_misura_var_4 = Column(String(20), nullable=True)
    descrizione_var_4 = Column(String(100), nullable=True)
    
    rule_id_calcolo = Column(String(100), nullable=True)
    
    # === RICARICO (Step 2) ===
    ricarico_percentuale = Column(Numeric(5, 2), nullable=True)
    
    # Unità di misura
    unita_misura = Column(String(20), default="PZ")
    
    # Scorte
    giacenza = Column(Integer, default=0)
    scorta_minima = Column(Integer, default=0)
    
    # Fornitore
    fornitore = Column(String(255), nullable=True)
    codice_fornitore = Column(String(50), nullable=True)
    
    # Lead Time (giorni lavorativi)
    lead_time_giorni = Column(Integer, default=0)  # Tempo approvvigionamento
    manodopera_giorni = Column(Integer, default=0)  # Tempo lavorazione
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    categoria = relationship("CategoriaArticolo", back_populates="articoli")


# ==========================================
# PREVENTIVO
# ==========================================
class Preventivo(Base):
    __tablename__ = "preventivi"

    id = Column(Integer, primary_key=True, index=True)
    numero_preventivo = Column(String(50), unique=True, nullable=False, index=True)
    
    # TIPO: COMPLETO o RICAMBIO
    tipo_preventivo = Column(String(20), default="COMPLETO")
    
    # Cliente
    cliente_id = Column(Integer, ForeignKey("clienti.id"), nullable=True)
    customer_name = Column(String(255), nullable=True)
    
    # Date
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    data_scadenza = Column(DateTime, nullable=True)
    
    # Stato
    status = Column(String(20), default="draft")
    
    # Totali
    total_price = Column(Numeric(12, 2), default=0)  # Totale listino
    sconto_cliente = Column(Numeric(5, 2), default=0)  # Sconto da anagrafica cliente
    sconto_extra_admin = Column(Numeric(5, 2), default=0)  # Sconto extra (solo admin)
    total_price_finale = Column(Numeric(12, 2), default=0)  # Totale dopo sconti
    note = Column(Text, nullable=True)
    
    created_by = Column(Integer, ForeignKey("utenti.id"), nullable=True)

    # Relazioni
    cliente = relationship("Cliente", back_populates="preventivi")
    dati_commessa = relationship("DatiCommessa", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    dati_principali = relationship("DatiPrincipali", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    normative = relationship("Normative", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    disposizione_vano = relationship("DisposizioneVano", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    argano = relationship("Argano", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    porte = relationship("Porte", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    materiali = relationship("Materiale", back_populates="preventivo", cascade="all, delete-orphan")
    righe_ricambio = relationship("RigaRicambio", back_populates="preventivo", cascade="all, delete-orphan")


# ==========================================
# DATI COMMESSA
# ==========================================
class DatiCommessa(Base):
    __tablename__ = "dati_commessa"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False, unique=True)

    numero_offerta = Column(String(50), nullable=True)
    data_offerta = Column(String(20), nullable=True)
    riferimento_cliente = Column(String(255), nullable=True)
    quantita = Column(Integer, nullable=True)
    data_consegna_richiesta = Column(Date, nullable=True)  # Data per calcolo lead time
    imballo = Column(String(100), nullable=True)
    reso_fco = Column(String(100), nullable=True)
    pagamento = Column(String(100), nullable=True)
    trasporto = Column(String(100), nullable=True)
    destinazione = Column(String(255), nullable=True)

    preventivo = relationship("Preventivo", back_populates="dati_commessa")


# ==========================================
# DATI PRINCIPALI
# ==========================================
class DatiPrincipali(Base):
    __tablename__ = "dati_principali"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False, unique=True)

    tipo_impianto = Column(String(50), nullable=True)
    nuovo_impianto = Column(Boolean, nullable=True)
    numero_fermate = Column(Integer, nullable=True)
    numero_servizi = Column(Integer, nullable=True)
    velocita = Column(Float, nullable=True)
    corsa = Column(Float, nullable=True)
    forza_motrice = Column(String(50), nullable=True)
    luce = Column(String(50), nullable=True)
    tensione_manovra = Column(String(50), nullable=True)
    tensione_freno = Column(String(50), nullable=True)

    preventivo = relationship("Preventivo", back_populates="dati_principali")


# ==========================================
# NORMATIVE
# ==========================================
class Normative(Base):
    __tablename__ = "normative"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False, unique=True)

    en_81_1 = Column(String(10), nullable=True)
    en_81_20 = Column(String(10), nullable=True)
    en_81_21 = Column(String(10), nullable=True)
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
    
    posizione_quadro_lato = Column(String(50), nullable=True)
    posizione_quadro_piano = Column(String(50), nullable=True)
    altezza_vano = Column(Float, nullable=True)
    piano_piu_alto = Column(String(50), nullable=True)
    piano_piu_basso = Column(String(50), nullable=True)
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

    tipo_porte_piano = Column(String(100), nullable=True)
    tipo_porte_cabina = Column(String(100), nullable=True)
    numero_accessi = Column(Integer, nullable=True)
    tipo_operatore = Column(String(100), nullable=True)
    marca_operatore = Column(String(100), nullable=True)
    stazionamento_porte = Column(String(100), nullable=True)
    tipo_apertura = Column(String(100), nullable=True)
    distanza_minima_accessi = Column(Float, nullable=True)
    alimentazione_operatore = Column(String(100), nullable=True)
    con_scheda = Column(Boolean, nullable=True)

    preventivo = relationship("Preventivo", back_populates="porte")


# ==========================================
# ARGANO
# ==========================================
class Argano(Base):
    __tablename__ = "argano"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False, unique=True)

    trazione = Column(String(100), nullable=True)  # Gearless MRL, Geared, Gearless
    potenza_motore_kw = Column(Numeric(10, 2), nullable=True)
    corrente_nom_motore_amp = Column(Numeric(10, 2), nullable=True)
    tipo_vvvf = Column(String(100), nullable=True)
    vvvf_nel_vano = Column(Boolean, default=False)
    freno_tensione = Column(String(50), nullable=True)  # Es: 48 Vcc
    ventilazione_forzata = Column(String(50), nullable=True)  # Es: 24 Vcc
    tipo_teleruttore = Column(String(100), nullable=True)  # Es: Schneider

    preventivo = relationship("Preventivo", back_populates="argano")


# ==========================================
# MATERIALI (per preventivi COMPLETO)
# ==========================================
class Materiale(Base):
    __tablename__ = "materiali"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False)

    codice = Column(String(50), nullable=False)
    descrizione = Column(String(500), nullable=False)
    quantita = Column(Numeric(10, 2), nullable=False, default=1)
    prezzo_unitario = Column(Numeric(12, 4), nullable=False, default=0)
    prezzo_totale = Column(Numeric(12, 2), nullable=False, default=0)
    categoria = Column(String(100), nullable=True)
    aggiunto_da_regola = Column(Boolean, default=False)
    regola_id = Column(String(100), nullable=True)
    note = Column(Text, nullable=True)
    
    # Lead Time (giorni lavorativi)
    lead_time_giorni = Column(Integer, default=0)  # Tempo approvvigionamento
    manodopera_giorni = Column(Integer, default=0)  # Tempo lavorazione

    preventivo = relationship("Preventivo", back_populates="materiali")


# ==========================================
# RIGHE RICAMBIO (per preventivi RICAMBIO)
# ==========================================
class RigaRicambio(Base):
    __tablename__ = "righe_ricambio"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False)
    
    articolo_id = Column(Integer, ForeignKey("articoli.id"), nullable=True)
    
    codice = Column(String(50), nullable=False)
    descrizione = Column(String(500), nullable=False)
    tipo_articolo = Column(String(20), default="PRODUZIONE")  # Per sapere quale ricarico/sconto applicare
    
    # Quantità e parametri calcolo (fino a 4)
    quantita = Column(Numeric(10, 2), nullable=False, default=1)
    
    parametro_1 = Column(Numeric(10, 2), nullable=True)
    unita_param_1 = Column(String(20), nullable=True)
    desc_param_1 = Column(String(100), nullable=True)
    costo_var_1 = Column(Numeric(12, 4), default=0)
    
    parametro_2 = Column(Numeric(10, 2), nullable=True)
    unita_param_2 = Column(String(20), nullable=True)
    desc_param_2 = Column(String(100), nullable=True)
    costo_var_2 = Column(Numeric(12, 4), default=0)
    
    parametro_3 = Column(Numeric(10, 2), nullable=True)
    unita_param_3 = Column(String(20), nullable=True)
    desc_param_3 = Column(String(100), nullable=True)
    costo_var_3 = Column(Numeric(12, 4), default=0)
    
    parametro_4 = Column(Numeric(10, 2), nullable=True)
    unita_param_4 = Column(String(20), nullable=True)
    desc_param_4 = Column(String(100), nullable=True)
    costo_var_4 = Column(Numeric(12, 4), default=0)
    
    # Step 1: Costo base = fisso + Σ(costo_var_i × param_i)
    costo_fisso = Column(Numeric(12, 4), default=0)
    costo_base_unitario = Column(Numeric(12, 4), default=0)
    
    # Step 2: Ricarico (da articolo o default sistema)
    ricarico_percentuale = Column(Numeric(5, 2), default=0)
    prezzo_listino_unitario = Column(Numeric(12, 4), default=0)  # costo × (1 + ricarico%)
    
    # Step 3: Sconto cliente (da anagrafica cliente)
    sconto_cliente = Column(Numeric(5, 2), default=0)
    prezzo_cliente_unitario = Column(Numeric(12, 4), default=0)  # listino × (1 - sconto%)
    
    # Totali riga
    prezzo_totale_listino = Column(Numeric(12, 2), default=0)  # listino × quantità
    prezzo_totale_cliente = Column(Numeric(12, 2), default=0)  # cliente × quantità
    
    ordine = Column(Integer, default=0)
    note = Column(Text, nullable=True)
    
    preventivo = relationship("Preventivo", back_populates="righe_ricambio")
    articolo = relationship("Articolo")
