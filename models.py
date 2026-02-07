"""
models.py - SQLAlchemy Models
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


class User(Base):
    """Utenti sistema (commerciali + admin)"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, index=True, nullable=False)
    email = Column(String(200), unique=True, index=True)
    hashed_password = Column(String(200), nullable=False)
    full_name = Column(String(200))
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    preventivi = relationship("Preventivo", back_populates="user")


class Cliente(Base):
    """Clienti"""
    __tablename__ = "clienti"
    
    id = Column(Integer, primary_key=True, index=True)
    ragione_sociale = Column(String(200), nullable=False)
    partita_iva = Column(String(50))
    codice_fiscale = Column(String(50))
    indirizzo = Column(String(300))
    citta = Column(String(100))
    cap = Column(String(20))
    provincia = Column(String(10))
    telefono = Column(String(50))
    email = Column(String(200))
    referente = Column(String(200))
    note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    preventivi = relationship("Preventivo", back_populates="cliente")


class Preventivo(Base):
    """Preventivi"""
    __tablename__ = "preventivi"
    
    id = Column(Integer, primary_key=True, index=True)
    numero = Column(String(50), unique=True, index=True, nullable=False)
    tipo = Column(String(50), nullable=False)  # "prodotto_completo" o "ricambi"
    stato = Column(String(50), default="bozza")  # bozza, inviato, accettato, rifiutato
    
    # Foreign keys
    cliente_id = Column(Integer, ForeignKey("clienti.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Dati configurazione (JSON per flessibilità)
    configurazione = Column(JSON)  # Dati form configuratore
    
    # Dati commessa
    nome_commessa = Column(String(200))
    indirizzo_cantiere = Column(String(300))
    referente_cantiere = Column(String(200))
    
    # Totali
    totale_materiali = Column(Float, default=0.0)
    totale_manodopera = Column(Float, default=0.0)
    totale_trasporto = Column(Float, default=0.0)
    sconto_percentuale = Column(Float, default=0.0)
    totale_netto = Column(Float, default=0.0)
    totale_iva = Column(Float, default=0.0)
    totale_lordo = Column(Float, default=0.0)
    
    # Note
    note_interne = Column(Text)
    note_cliente = Column(Text)
    
    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    data_invio = Column(DateTime(timezone=True))
    data_accettazione = Column(DateTime(timezone=True))
    
    # Relationships
    cliente = relationship("Cliente", back_populates="preventivi")
    user = relationship("User", back_populates="preventivi")
    materiali = relationship("Materiale", back_populates="preventivo", cascade="all, delete-orphan")


class Materiale(Base):
    """Materiali/Componenti BOM primo livello"""
    __tablename__ = "materiali"
    
    id = Column(Integer, primary_key=True, index=True)
    preventivo_id = Column(Integer, ForeignKey("preventivi.id"), nullable=False)
    
    # Identificativo materiale
    codice = Column(String(100), nullable=False)
    descrizione = Column(String(500))
    categoria = Column(String(100))  # Es: "quadro", "cabina", "meccanica", ecc.
    
    # Quantità e prezzi
    quantita = Column(Float, nullable=False, default=1.0)
    unita_misura = Column(String(20), default="pz")
    prezzo_unitario = Column(Float, default=0.0)
    prezzo_totale = Column(Float, default=0.0)
    
    # Parametri (per codici parametrici)
    parametro1_nome = Column(String(50))
    parametro1_valore = Column(String(100))
    parametro2_nome = Column(String(50))
    parametro2_valore = Column(String(100))
    parametro3_nome = Column(String(50))
    parametro3_valore = Column(String(100))
    parametro4_nome = Column(String(50))
    parametro4_valore = Column(String(100))
    parametro5_nome = Column(String(50))
    parametro5_valore = Column(String(100))
    
    # Metadati
    aggiunto_da_regola = Column(Boolean, default=False)
    regola_id = Column(String(100))  # ID regola che ha aggiunto questo materiale
    lato = Column(String(10))  # A, B, C, D per materiali posizionati
    note = Column(Text)
    
    # Ordine visualizzazione
    ordine = Column(Integer, default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    preventivo = relationship("Preventivo", back_populates="materiali")


class Regola(Base):
    """Regole business (per Rule Designer)"""
    __tablename__ = "regole"
    
    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(String(100), unique=True, index=True, nullable=False)
    nome = Column(String(200), nullable=False)
    descrizione = Column(Text)
    categoria = Column(String(100))  # "BOM", "VALIDAZIONE", "CALCOLO", ecc.
    
    # Regola JSON completa
    rule_json = Column(JSON, nullable=False)
    
    # Metadati
    priorita = Column(Integer, default=100)
    attiva = Column(Boolean, default=True)
    versione = Column(Integer, default=1)
    
    # Audit
    created_by = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def to_dict(self):
        """Converte regola in dizionario per rule engine"""
        return {
            "rule_id": self.rule_id,
            "nome": self.nome,
            "descrizione": self.descrizione,
            "categoria": self.categoria,
            "priorita": self.priorita,
            **self.rule_json
        }
