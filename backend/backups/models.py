from sqlalchemy import Column, Integer, String, Boolean, Float, DateTime, ForeignKey, Text, Numeric, Enum as SQLEnum
from sqlalchemy.orm import relationship
from database import Base
import datetime
import enum

# ==========================================
# ENUMS
# ==========================================
class TipoPreventivo(str, enum.Enum):
    COMPLETO = "COMPLETO"
    RICAMBIO = "RICAMBIO"

class TipoArticolo(str, enum.Enum):
    PRODUZIONE = "PRODUZIONE"
    ACQUISTO = "ACQUISTO"

class StatoPreventivo(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    APPROVED = "approved"
    REJECTED = "rejected"

# ==========================================
# PARAMETRI SISTEMA
# ==========================================
class ParametriSistema(Base):
    """Parametri globali del sistema (ricarichi, valori default, ecc.)"""
    __tablename__ = "parametri_sistema"
    
    id = Column(Integer, primary_key=True, index=True)
    chiave = Column(String(100), unique=True, nullable=False, index=True)
    valore = Column(String(255), nullable=False)
    descrizione = Column(String(500), nullable=True)
    tipo_dato = Column(String(50), default="string")  # string, number, boolean, json
    gruppo = Column(String(100), nullable=True)  # Per raggruppare parametri correlati
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


# ==========================================
# GRUPPI UTENTI
# ==========================================
class GruppoUtenti(Base):
    """Gruppi per gestione autorizzazioni"""
    __tablename__ = "gruppi_utenti"
    
    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(100), unique=True, nullable=False, index=True)
    descrizione = Column(String(500), nullable=True)
    is_admin = Column(Boolean, default=False)  # Flag per gruppo amministratori
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    # Relazioni
    utenti = relationship("Utente", back_populates="gruppo")
    permessi = relationship("PermessoGruppo", back_populates="gruppo", cascade="all, delete-orphan")


# ==========================================
# PERMESSI GRUPPO
# ==========================================
class PermessoGruppo(Base):
    """Permessi assegnati ai gruppi"""
    __tablename__ = "permessi_gruppi"
    
    id = Column(Integer, primary_key=True, index=True)
    gruppo_id = Column(Integer, ForeignKey("gruppi_utenti.id", ondelete="CASCADE"), nullable=False)
    
    # Permessi specifici
    permesso = Column(String(100), nullable=False)  # es: "preventivi.read", "articoli.write", "admin.users"
    descrizione = Column(String(255), nullable=True)
    
    # Relazione
    gruppo = relationship("GruppoUtenti", back_populates="permessi")


# ==========================================
# UTENTI
# ==========================================
class Utente(Base):
    """Utenti del sistema"""
    __tablename__ = "utenti"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True)
    nome = Column(String(100), nullable=True)
    cognome = Column(String(100), nullable=True)
    password_hash = Column(String(255), nullable=True)  # Per autenticazione futura
    
    gruppo_id = Column(Integer, ForeignKey("gruppi_utenti.id"), nullable=True)
    
    is_active = Column(Boolean, default=True)
    ultimo_accesso = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    # Relazioni
    gruppo = relationship("GruppoUtenti", back_populates="utenti")


# ==========================================
# CLIENTI
# ==========================================
class Cliente(Base):
    """Anagrafica clienti con sconti personalizzati"""
    __tablename__ = "clienti"
    
    id = Column(Integer, primary_key=True, index=True)
    codice = Column(String(50), unique=True, nullable=False, index=True)
    ragione_sociale = Column(String(255), nullable=False)
    partita_iva = Column(String(20), nullable=True)
    codice_fiscale = Column(String(20), nullable=True)
    
    # Indirizzo principale
    indirizzo = Column(String(255), nullable=True)
    cap = Column(String(10), nullable=True)
    citta = Column(String(100), nullable=True)
    provincia = Column(String(5), nullable=True)
    nazione = Column(String(50), default="Italia")
    
    # Contatti
    telefono = Column(String(50), nullable=True)
    email = Column(String(255), nullable=True)
    pec = Column(String(255), nullable=True)
    
    # Sconti personalizzati (in percentuale)
    sconto_produzione = Column(Numeric(5, 2), default=0.00)  # Sconto per articoli PRODUZIONE
    sconto_acquisto = Column(Numeric(5, 2), default=0.00)    # Sconto per articoli ACQUISTO
    sconto_globale = Column(Numeric(5, 2), default=0.00)     # Sconto aggiuntivo su tutto
    
    # Condizioni commerciali
    pagamento_default = Column(String(100), nullable=True)
    listino_id = Column(Integer, nullable=True)  # Per listini personalizzati futuri
    
    # Note e stato
    note = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    # Relazioni
    preventivi = relationship("Preventivo", back_populates="cliente")


# ==========================================
# CATEGORIA ARTICOLI
# ==========================================
class CategoriaArticolo(Base):
    """Categorie per organizzare gli articoli"""
    __tablename__ = "categorie_articoli"
    
    id = Column(Integer, primary_key=True, index=True)
    codice = Column(String(50), unique=True, nullable=False, index=True)
    nome = Column(String(255), nullable=False)
    descrizione = Column(Text, nullable=True)
    categoria_padre_id = Column(Integer, ForeignKey("categorie_articoli.id"), nullable=True)
    ordine = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    
    # Relazioni
    categoria_padre = relationship("CategoriaArticolo", remote_side=[id])
    articoli = relationship("Articolo", back_populates="categoria")


# ==========================================
# ARTICOLI
# ==========================================
class Articolo(Base):
    """Anagrafica articoli con gestione costi e prezzi"""
    __tablename__ = "articoli"
    
    id = Column(Integer, primary_key=True, index=True)
    codice = Column(String(50), unique=True, nullable=False, index=True)
    descrizione = Column(String(500), nullable=False)
    descrizione_estesa = Column(Text, nullable=True)
    
    # Tipo articolo (determina il ricarico da applicare)
    tipo_articolo = Column(String(20), default="PRODUZIONE")  # PRODUZIONE o ACQUISTO
    
    # Categoria
    categoria_id = Column(Integer, ForeignKey("categorie_articoli.id"), nullable=True)
    
    # ========== COSTI ==========
    # Costo fisso (indipendente dalla quantità/dimensione)
    costo_fisso = Column(Numeric(12, 4), default=0.0000)
    
    # Costo variabile (moltiplicato per un parametro come lunghezza, peso, ecc.)
    costo_variabile = Column(Numeric(12, 4), default=0.0000)
    unita_misura_variabile = Column(String(20), nullable=True)  # m, kg, pz, ecc.
    
    # Costo ultimo acquisto (per articoli ACQUISTO)
    costo_ultimo_acquisto = Column(Numeric(12, 4), default=0.0000)
    data_ultimo_acquisto = Column(DateTime, nullable=True)
    
    # ========== PREZZI ==========
    # Prezzo di listino base (può essere calcolato o inserito manualmente)
    prezzo_listino = Column(Numeric(12, 4), default=0.0000)
    
    # Ricarico personalizzato (se NULL usa quello di sistema)
    ricarico_percentuale = Column(Numeric(5, 2), nullable=True)
    
    # ========== REGOLE CALCOLO ==========
    # ID della regola per calcolo costo dinamico (es: cavi a metro)
    rule_id_calcolo = Column(String(100), nullable=True)
    
    # Parametri JSON per la regola (es: {"formula": "costo_fisso + costo_variabile * lunghezza"})
    rule_params = Column(Text, nullable=True)
    
    # ========== GIACENZA (opzionale) ==========
    giacenza = Column(Integer, default=0)
    scorta_minima = Column(Integer, default=0)
    
    # ========== ALTRI DATI ==========
    unita_misura = Column(String(20), default="PZ")
    peso = Column(Numeric(10, 3), nullable=True)  # kg
    volume = Column(Numeric(10, 3), nullable=True)  # m³
    
    # Codici esterni
    codice_fornitore = Column(String(100), nullable=True)
    codice_ean = Column(String(20), nullable=True)
    
    # BOM - per ricerca in distinte base
    complessivo_padre_id = Column(Integer, ForeignKey("articoli.id"), nullable=True)
    
    # Note e stato
    note = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    # Relazioni
    categoria = relationship("CategoriaArticolo", back_populates="articoli")
    complessivo_padre = relationship("Articolo", remote_side=[id])


# ==========================================
# PREVENTIVO (Tabella principale - AGGIORNATA)
# ==========================================
class Preventivo(Base):
    __tablename__ = "preventivi"

    id = Column(Integer, primary_key=True, index=True)
    numero_preventivo = Column(String, unique=True, nullable=False, index=True)
    
    # NUOVO: Tipo preventivo
    tipo_preventivo = Column(String(20), default="COMPLETO")  # COMPLETO o RICAMBIO
    
    # NUOVO: Cliente collegato
    cliente_id = Column(Integer, ForeignKey("clienti.id"), nullable=True)
    customer_name = Column(String, nullable=True)  # Mantenuto per retrocompatibilità
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    status = Column(String, default="draft")  # draft, sent, approved, rejected
    total_price = Column(Float, default=0.0)
    
    # NUOVO: Totali separati per tipo
    totale_lordo = Column(Numeric(12, 2), default=0.00)
    totale_sconti = Column(Numeric(12, 2), default=0.00)
    totale_netto = Column(Numeric(12, 2), default=0.00)

    # Relazioni (uselist=False per relazioni 1-to-1)
    cliente = relationship("Cliente", back_populates="preventivi")
    dati_commessa = relationship("DatiCommessa", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    dati_principali = relationship("DatiPrincipali", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    normative = relationship("Normative", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    disposizione_vano = relationship("DisposizioneVano", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    porte = relationship("Porte", back_populates="preventivo", uselist=False, cascade="all, delete-orphan")
    materiali = relationship("Materiale", back_populates="preventivo", cascade="all, delete-orphan")
    righe_ricambio = relationship("RigaRicambio", back_populates="preventivo", cascade="all, delete-orphan")


# ==========================================
# RIGA RICAMBIO (per preventivi RICAMBIO)
# ==========================================
class RigaRicambio(Base):
    """Righe dettaglio per preventivi di tipo RICAMBIO"""
    __tablename__ = "righe_ricambio"
    
    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False)
    
    # Riferimento all'articolo
    articolo_id = Column(Integer, ForeignKey("articoli.id"), nullable=True)
    codice_articolo = Column(String(50), nullable=False)
    descrizione = Column(String(500), nullable=False)
    
    # Quantità e misure
    quantita = Column(Numeric(10, 2), default=1.00)
    unita_misura = Column(String(20), default="PZ")
    
    # Parametri calcolo (es: lunghezza per cavi)
    parametro_calcolo = Column(Numeric(12, 4), nullable=True)  # Es: lunghezza in metri
    
    # ========== PREZZI CALCOLATI ==========
    # Step 1: Costo base (da regola o fisso)
    costo_base = Column(Numeric(12, 4), default=0.0000)
    
    # Step 2: Prezzo listino (costo + ricarico)
    prezzo_listino = Column(Numeric(12, 4), default=0.0000)
    ricarico_applicato = Column(Numeric(5, 2), default=0.00)
    
    # Step 3: Prezzo finale (listino - sconto cliente)
    sconto_cliente = Column(Numeric(5, 2), default=0.00)
    prezzo_unitario = Column(Numeric(12, 4), default=0.0000)
    
    # Totale riga
    prezzo_totale = Column(Numeric(12, 4), default=0.0000)
    
    # Metadata
    note = Column(Text, nullable=True)
    ordine = Column(Integer, default=0)  # Per ordinamento righe
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    
    # Relazioni
    preventivo = relationship("Preventivo", back_populates="righe_ricambio")
    articolo = relationship("Articolo")


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

    tipo_impianto = Column(String, nullable=True)  # elettrico, oleodinamico, piattaforma
    nuovo_impianto = Column(Boolean, nullable=True)
    numero_fermate = Column(Integer, nullable=True)
    numero_servizi = Column(Integer, nullable=True)
    velocita = Column(Float, nullable=True)
    corsa = Column(Float, nullable=True)
    con_locale_macchina = Column(Boolean, nullable=True)
    posizione_locale_macchina = Column(String, nullable=True)
    tipo_trazione = Column(String, nullable=True)  # geared, gearless, hydraulic
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

    # Normative con versioni → String
    en_81_1 = Column(String, nullable=True)     # "2010", "1998", etc.
    en_81_20 = Column(String, nullable=True)    # "2020", "2014", etc.
    en_81_21 = Column(String, nullable=True)    # "2018", etc.
    
    # Normative boolean (on/off)
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
# DISPOSIZIONE VANO (COMPLETO)
# ==========================================
class DisposizioneVano(Base):
    __tablename__ = "disposizione_vano"

    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id", ondelete="CASCADE"), nullable=False, unique=True)
    
    # Posizione quadro
    posizione_quadro_lato = Column(String, nullable=True)  # "Piano Alto", "Piano Basso", "Al Piano"
    posizione_quadro_piano = Column(String, nullable=True)  # Numero piano se "Al Piano"
    
    # Dati vano
    altezza_vano = Column(Float, nullable=True)  # Altezza totale in metri
    piano_piu_alto = Column(String, nullable=True)  # Nome piano più alto
    piano_piu_basso = Column(String, nullable=True)  # Nome piano più basso
    
    # Campi JSON salvati come Text
    posizioni_elementi = Column(Text, nullable=True)  # JSON string: {"QM": {"lato": "A", "segmento": 1}, ...}
    sbarchi = Column(Text, nullable=True)              # JSON string: [{"piano": 0, "lato": "A", ...}, ...]
    
    # Note aggiuntive
    note = Column(Text, nullable=True)
    
    # Relazione
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
# MATERIALI (per preventivi COMPLETO)
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
# NOTE IMPLEMENTAZIONE v2.0
# ==========================================
"""
NUOVE TABELLE AGGIUNTE:

1. ✅ ParametriSistema
   - Parametri globali (ricarichi, valori default)
   - Chiave-valore con tipo dato
   
2. ✅ GruppoUtenti + PermessoGruppo
   - Gestione gruppi utenti
   - Permessi granulari per gruppo
   - Flag is_admin per amministratori
   
3. ✅ Utente
   - Anagrafica utenti
   - Collegamento a gruppo
   - Preparato per autenticazione futura
   
4. ✅ Cliente
   - Anagrafica completa
   - Sconti personalizzati per tipo articolo
   - Condizioni commerciali
   
5. ✅ CategoriaArticolo
   - Categorie gerarchiche
   
6. ✅ Articolo
   - Anagrafica completa con costi
   - Sistema costo fisso + variabile
   - Collegamento a regole calcolo
   - Ricarico personalizzabile
   
7. ✅ RigaRicambio
   - Dettaglio righe per preventivi RICAMBIO
   - Calcolo prezzo a 3 livelli (costo → listino → finale)
   - Tracciamento ricarichi e sconti applicati

MODIFICHE A TABELLE ESISTENTI:

1. ✅ Preventivo
   - Aggiunto tipo_preventivo (COMPLETO/RICAMBIO)
   - Aggiunto cliente_id
   - Aggiunto totale_lordo, totale_sconti, totale_netto

SISTEMA CALCOLO PREZZO (3 LIVELLI):

Step 1 - COSTO BASE:
  Se rule_id_calcolo:
    costo = esegui_regola(parametri)
  Altrimenti:
    costo = costo_fisso + (costo_variabile × parametro)

Step 2 - PREZZO LISTINO:
  ricarico = articolo.ricarico_percentuale ?? parametri_sistema[tipo_articolo]
  prezzo_listino = costo × (1 + ricarico/100)

Step 3 - PREZZO FINALE:
  sconto = cliente.sconto_[tipo_articolo]
  prezzo_finale = prezzo_listino × (1 - sconto/100)

IMPORTANTE:
- Dopo aver sostituito questo file, DEVI ricreare il database!
- Opzione 1: python reset_db.py (cancella tutti i dati)
- Opzione 2: Script migrazione incrementale
"""
