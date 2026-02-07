from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

# ==========================================
# PARAMETRI SISTEMA SCHEMAS
# ==========================================
class ParametriSistemaBase(BaseModel):
    chiave: str
    valore: str
    descrizione: Optional[str] = None
    tipo_dato: Optional[str] = "string"
    gruppo: Optional[str] = None

class ParametriSistemaCreate(ParametriSistemaBase):
    pass

class ParametriSistemaUpdate(BaseModel):
    valore: Optional[str] = None
    descrizione: Optional[str] = None
    tipo_dato: Optional[str] = None
    gruppo: Optional[str] = None

class ParametriSistema(ParametriSistemaBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==========================================
# GRUPPI UTENTI SCHEMAS
# ==========================================
class GruppoUtentiBase(BaseModel):
    nome: str
    descrizione: Optional[str] = None
    is_admin: Optional[bool] = False
    is_active: Optional[bool] = True

class GruppoUtentiCreate(GruppoUtentiBase):
    pass

class GruppoUtentiUpdate(BaseModel):
    nome: Optional[str] = None
    descrizione: Optional[str] = None
    is_admin: Optional[bool] = None
    is_active: Optional[bool] = None

class GruppoUtenti(GruppoUtentiBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==========================================
# PERMESSI GRUPPO SCHEMAS
# ==========================================
class PermessoGruppoBase(BaseModel):
    permesso: str
    descrizione: Optional[str] = None

class PermessoGruppoCreate(PermessoGruppoBase):
    gruppo_id: int

class PermessoGruppo(PermessoGruppoBase):
    id: int
    gruppo_id: int

    class Config:
        from_attributes = True


class GruppoUtentiConPermessi(GruppoUtenti):
    """Gruppo con lista permessi inclusi"""
    permessi: List[PermessoGruppo] = []

    class Config:
        from_attributes = True


# ==========================================
# UTENTI SCHEMAS
# ==========================================
class UtenteBase(BaseModel):
    username: str
    email: Optional[str] = None
    nome: Optional[str] = None
    cognome: Optional[str] = None
    gruppo_id: Optional[int] = None
    is_active: Optional[bool] = True

class UtenteCreate(UtenteBase):
    password: Optional[str] = None  # Per autenticazione futura

class UtenteUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    nome: Optional[str] = None
    cognome: Optional[str] = None
    gruppo_id: Optional[int] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None

class Utente(UtenteBase):
    id: int
    ultimo_accesso: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UtenteConGruppo(Utente):
    """Utente con dettagli gruppo inclusi"""
    gruppo: Optional[GruppoUtenti] = None

    class Config:
        from_attributes = True


# ==========================================
# CLIENTI SCHEMAS
# ==========================================
class ClienteBase(BaseModel):
    codice: str
    ragione_sociale: str
    partita_iva: Optional[str] = None
    codice_fiscale: Optional[str] = None
    indirizzo: Optional[str] = None
    cap: Optional[str] = None
    citta: Optional[str] = None
    provincia: Optional[str] = None
    nazione: Optional[str] = "Italia"
    telefono: Optional[str] = None
    email: Optional[str] = None
    pec: Optional[str] = None
    sconto_produzione: Optional[float] = 0.00
    sconto_acquisto: Optional[float] = 0.00
    sconto_globale: Optional[float] = 0.00
    pagamento_default: Optional[str] = None
    listino_id: Optional[int] = None
    note: Optional[str] = None
    is_active: Optional[bool] = True

class ClienteCreate(ClienteBase):
    pass

class ClienteUpdate(BaseModel):
    codice: Optional[str] = None
    ragione_sociale: Optional[str] = None
    partita_iva: Optional[str] = None
    codice_fiscale: Optional[str] = None
    indirizzo: Optional[str] = None
    cap: Optional[str] = None
    citta: Optional[str] = None
    provincia: Optional[str] = None
    nazione: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    pec: Optional[str] = None
    sconto_produzione: Optional[float] = None
    sconto_acquisto: Optional[float] = None
    sconto_globale: Optional[float] = None
    pagamento_default: Optional[str] = None
    listino_id: Optional[int] = None
    note: Optional[str] = None
    is_active: Optional[bool] = None

class Cliente(ClienteBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ==========================================
# CATEGORIA ARTICOLI SCHEMAS
# ==========================================
class CategoriaArticoloBase(BaseModel):
    codice: str
    nome: str
    descrizione: Optional[str] = None
    categoria_padre_id: Optional[int] = None
    ordine: Optional[int] = 0
    is_active: Optional[bool] = True

class CategoriaArticoloCreate(CategoriaArticoloBase):
    pass

class CategoriaArticoloUpdate(BaseModel):
    codice: Optional[str] = None
    nome: Optional[str] = None
    descrizione: Optional[str] = None
    categoria_padre_id: Optional[int] = None
    ordine: Optional[int] = None
    is_active: Optional[bool] = None

class CategoriaArticolo(CategoriaArticoloBase):
    id: int

    class Config:
        from_attributes = True


# ==========================================
# ARTICOLI SCHEMAS
# ==========================================
class ArticoloBase(BaseModel):
    codice: str
    descrizione: str
    descrizione_estesa: Optional[str] = None
    tipo_articolo: Optional[str] = "PRODUZIONE"  # PRODUZIONE o ACQUISTO
    categoria_id: Optional[int] = None
    costo_fisso: Optional[float] = 0.0
    costo_variabile: Optional[float] = 0.0
    unita_misura_variabile: Optional[str] = None
    costo_ultimo_acquisto: Optional[float] = 0.0
    data_ultimo_acquisto: Optional[datetime] = None
    prezzo_listino: Optional[float] = 0.0
    ricarico_percentuale: Optional[float] = None
    rule_id_calcolo: Optional[str] = None
    rule_params: Optional[str] = None
    giacenza: Optional[int] = 0
    scorta_minima: Optional[int] = 0
    unita_misura: Optional[str] = "PZ"
    peso: Optional[float] = None
    volume: Optional[float] = None
    codice_fornitore: Optional[str] = None
    codice_ean: Optional[str] = None
    complessivo_padre_id: Optional[int] = None
    note: Optional[str] = None
    is_active: Optional[bool] = True

class ArticoloCreate(ArticoloBase):
    pass

class ArticoloUpdate(BaseModel):
    codice: Optional[str] = None
    descrizione: Optional[str] = None
    descrizione_estesa: Optional[str] = None
    tipo_articolo: Optional[str] = None
    categoria_id: Optional[int] = None
    costo_fisso: Optional[float] = None
    costo_variabile: Optional[float] = None
    unita_misura_variabile: Optional[str] = None
    costo_ultimo_acquisto: Optional[float] = None
    data_ultimo_acquisto: Optional[datetime] = None
    prezzo_listino: Optional[float] = None
    ricarico_percentuale: Optional[float] = None
    rule_id_calcolo: Optional[str] = None
    rule_params: Optional[str] = None
    giacenza: Optional[int] = None
    scorta_minima: Optional[int] = None
    unita_misura: Optional[str] = None
    peso: Optional[float] = None
    volume: Optional[float] = None
    codice_fornitore: Optional[str] = None
    codice_ean: Optional[str] = None
    complessivo_padre_id: Optional[int] = None
    note: Optional[str] = None
    is_active: Optional[bool] = None

class Articolo(ArticoloBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ArticoloConCategoria(Articolo):
    """Articolo con dettagli categoria inclusi"""
    categoria: Optional[CategoriaArticolo] = None

    class Config:
        from_attributes = True


# ==========================================
# RICERCA ARTICOLI SCHEMAS
# ==========================================
class ArticoloSearchResult(BaseModel):
    """Risultato ricerca per autocomplete"""
    id: int
    codice: str
    descrizione: str
    tipo_articolo: str
    prezzo_listino: float
    unita_misura: str
    categoria_nome: Optional[str] = None

    class Config:
        from_attributes = True


class ArticoloSearchFilters(BaseModel):
    """Filtri per ricerca avanzata"""
    query: Optional[str] = None  # Ricerca su codice e descrizione
    categoria_id: Optional[int] = None
    tipo_articolo: Optional[str] = None
    complessivo_id: Optional[int] = None  # Per ricerca BOM
    codice_fornitore: Optional[str] = None
    solo_attivi: Optional[bool] = True
    limit: Optional[int] = 50
    offset: Optional[int] = 0


# ==========================================
# CALCOLO PREZZO SCHEMAS
# ==========================================
class CalcoloPrezzoInput(BaseModel):
    """Input per calcolo prezzo articolo"""
    articolo_id: int
    quantita: float = 1.0
    parametro_calcolo: Optional[float] = None  # Es: lunghezza per cavi
    cliente_id: Optional[int] = None  # Per applicare sconti cliente

class CalcoloPrezzoOutput(BaseModel):
    """Output del calcolo prezzo a 3 livelli"""
    articolo_id: int
    codice: str
    descrizione: str
    tipo_articolo: str
    
    # Step 1: Costo base
    costo_base_unitario: float
    dettaglio_costo: str  # Descrizione del calcolo
    
    # Step 2: Prezzo listino
    ricarico_percentuale: float
    prezzo_listino_unitario: float
    
    # Step 3: Prezzo finale (se cliente specificato)
    sconto_cliente_percentuale: float = 0.0
    prezzo_finale_unitario: float
    
    # Totali
    quantita: float
    prezzo_totale: float


# ==========================================
# RIGHE RICAMBIO SCHEMAS
# ==========================================
class RigaRicambioBase(BaseModel):
    articolo_id: Optional[int] = None
    codice_articolo: str
    descrizione: str
    quantita: float = 1.0
    unita_misura: Optional[str] = "PZ"
    parametro_calcolo: Optional[float] = None
    costo_base: Optional[float] = 0.0
    prezzo_listino: Optional[float] = 0.0
    ricarico_applicato: Optional[float] = 0.0
    sconto_cliente: Optional[float] = 0.0
    prezzo_unitario: Optional[float] = 0.0
    prezzo_totale: Optional[float] = 0.0
    note: Optional[str] = None
    ordine: Optional[int] = 0

class RigaRicambioCreate(RigaRicambioBase):
    preventivo_id: int

class RigaRicambioUpdate(BaseModel):
    articolo_id: Optional[int] = None
    codice_articolo: Optional[str] = None
    descrizione: Optional[str] = None
    quantita: Optional[float] = None
    unita_misura: Optional[str] = None
    parametro_calcolo: Optional[float] = None
    costo_base: Optional[float] = None
    prezzo_listino: Optional[float] = None
    ricarico_applicato: Optional[float] = None
    sconto_cliente: Optional[float] = None
    prezzo_unitario: Optional[float] = None
    prezzo_totale: Optional[float] = None
    note: Optional[str] = None
    ordine: Optional[int] = None

class RigaRicambio(RigaRicambioBase):
    id: int
    preventivo_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RigaRicambioConArticolo(RigaRicambio):
    """Riga ricambio con dettagli articolo"""
    articolo: Optional[Articolo] = None

    class Config:
        from_attributes = True


# ==========================================
# PREVENTIVO SCHEMAS (AGGIORNATI)
# ==========================================
class PreventivoBase(BaseModel):
    numero_preventivo: Optional[str] = None
    tipo_preventivo: Optional[str] = "COMPLETO"  # COMPLETO o RICAMBIO
    cliente_id: Optional[int] = None
    customer_name: Optional[str] = None
    status: Optional[str] = "draft"
    total_price: Optional[float] = 0.0
    totale_lordo: Optional[float] = 0.0
    totale_sconti: Optional[float] = 0.0
    totale_netto: Optional[float] = 0.0

class PreventivoCreate(BaseModel):
    """Schema per creazione - tutti i campi opzionali (generazione automatica)"""
    numero_preventivo: Optional[str] = None
    tipo_preventivo: Optional[str] = "COMPLETO"
    cliente_id: Optional[int] = None
    customer_name: Optional[str] = None
    status: Optional[str] = "draft"
    total_price: Optional[float] = 0.0

class PreventivoUpdate(BaseModel):
    numero_preventivo: Optional[str] = None
    tipo_preventivo: Optional[str] = None
    cliente_id: Optional[int] = None
    customer_name: Optional[str] = None
    status: Optional[str] = None
    total_price: Optional[float] = None
    totale_lordo: Optional[float] = None
    totale_sconti: Optional[float] = None
    totale_netto: Optional[float] = None

class Preventivo(PreventivoBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PreventivoConCliente(Preventivo):
    """Preventivo con dettagli cliente"""
    cliente: Optional[Cliente] = None

    class Config:
        from_attributes = True


class PreventivoCompleto(Preventivo):
    """Preventivo con tutte le relazioni"""
    cliente: Optional[Cliente] = None
    righe_ricambio: List[RigaRicambio] = []

    class Config:
        from_attributes = True


# ==========================================
# DATI COMMESSA SCHEMAS
# ==========================================
class DatiCommessaBase(BaseModel):
    numero_offerta: Optional[str] = None
    data_offerta: Optional[str] = None
    riferimento_cliente: Optional[str] = None
    quantita: Optional[int] = None
    consegna_richiesta: Optional[str] = None
    prezzo_unitario: Optional[float] = None
    imballo: Optional[str] = None
    reso_fco: Optional[str] = None
    pagamento: Optional[str] = None
    trasporto: Optional[str] = None
    destinazione: Optional[str] = None

class DatiCommessaCreate(DatiCommessaBase):
    preventivo_id: int

class DatiCommessaUpdate(DatiCommessaBase):
    pass

class DatiCommessa(DatiCommessaBase):
    id: int
    preventivo_id: int

    class Config:
        from_attributes = True


# ==========================================
# DATI PRINCIPALI SCHEMAS
# ==========================================
class DatiPrincipaliBase(BaseModel):
    tipo_impianto: Optional[str] = None
    nuovo_impianto: Optional[bool] = None
    numero_fermate: Optional[int] = None
    numero_servizi: Optional[int] = None
    velocita: Optional[float] = None
    corsa: Optional[float] = None
    con_locale_macchina: Optional[bool] = None
    posizione_locale_macchina: Optional[str] = None
    tipo_trazione: Optional[str] = None
    forza_motrice: Optional[str] = None
    luce: Optional[str] = None
    tensione_manovra: Optional[str] = None
    tensione_freno: Optional[str] = None

class DatiPrincipaliCreate(DatiPrincipaliBase):
    preventivo_id: int

class DatiPrincipaliUpdate(DatiPrincipaliBase):
    pass

class DatiPrincipali(DatiPrincipaliBase):
    id: int
    preventivo_id: int

    class Config:
        from_attributes = True


# ==========================================
# NORMATIVE SCHEMAS
# ==========================================
class NormativeBase(BaseModel):
    # Normative con versioni (String)
    en_81_1: Optional[str] = None
    en_81_20: Optional[str] = None
    en_81_21: Optional[str] = None
    
    # Normative boolean
    en_81_28: Optional[bool] = False
    en_81_70: Optional[bool] = False
    en_81_72: Optional[bool] = False
    en_81_73: Optional[bool] = False
    a3_95_16: Optional[bool] = False
    dm236_legge13: Optional[bool] = False
    emendamento_a3: Optional[bool] = False
    uni_10411_1: Optional[bool] = False

class NormativeCreate(NormativeBase):
    preventivo_id: int

class NormativeUpdate(NormativeBase):
    pass

class Normative(NormativeBase):
    id: int
    preventivo_id: int

    class Config:
        from_attributes = True


# ==========================================
# DISPOSIZIONE VANO SCHEMAS
# ==========================================
class DisposizioneVanoBase(BaseModel):
    posizione_quadro_lato: Optional[str] = Field(None, description="Lato quadro: Piano Alto, Piano Basso, Al Piano")
    posizione_quadro_piano: Optional[str] = Field(None, description="Numero piano se 'Al Piano'")
    altezza_vano: Optional[float] = Field(None, description="Altezza totale vano in metri")
    piano_piu_alto: Optional[str] = Field(None, description="Nome piano più alto")
    piano_piu_basso: Optional[str] = Field(None, description="Nome piano più basso")
    posizioni_elementi: Optional[str] = Field(None, description="JSON string con posizioni elementi drag&drop")
    sbarchi: Optional[str] = Field(None, description="JSON string con array sbarchi/piani")
    note: Optional[str] = Field(None, description="Note aggiuntive")

class DisposizioneVanoCreate(DisposizioneVanoBase):
    preventivo_id: int

class DisposizioneVanoUpdate(BaseModel):
    posizione_quadro_lato: Optional[str] = None
    posizione_quadro_piano: Optional[str] = None
    altezza_vano: Optional[float] = None
    piano_piu_alto: Optional[str] = None
    piano_piu_basso: Optional[str] = None
    posizioni_elementi: Optional[str] = None
    sbarchi: Optional[str] = None
    note: Optional[str] = None

class DisposizioneVano(DisposizioneVanoBase):
    id: int
    preventivo_id: int

    class Config:
        from_attributes = True


# ==========================================
# PORTE SCHEMAS
# ==========================================
class PorteBase(BaseModel):
    tipo_porte_piano: Optional[str] = None
    tipo_porte_cabina: Optional[str] = None
    numero_accessi: Optional[int] = None
    tipo_operatore: Optional[str] = None
    marca_operatore: Optional[str] = None
    stazionamento_porte: Optional[str] = None
    tipo_apertura: Optional[str] = None
    distanza_minima_accessi: Optional[float] = None
    alimentazione_operatore: Optional[str] = None
    con_scheda: Optional[bool] = None

class PorteCreate(PorteBase):
    preventivo_id: int

class PorteUpdate(PorteBase):
    pass

class Porte(PorteBase):
    id: int
    preventivo_id: int

    class Config:
        from_attributes = True


# ==========================================
# MATERIALE SCHEMAS
# ==========================================
class MaterialeBase(BaseModel):
    codice: str
    descrizione: str
    quantita: int = 1
    prezzo_unitario: float = 0.0
    prezzo_totale: float = 0.0
    categoria: Optional[str] = None
    aggiunto_da_regola: bool = False
    regola_id: Optional[str] = None
    note: Optional[str] = None

class MaterialeCreate(MaterialeBase):
    preventivo_id: int

class MaterialeUpdate(BaseModel):
    codice: Optional[str] = None
    descrizione: Optional[str] = None
    quantita: Optional[int] = None
    prezzo_unitario: Optional[float] = None
    prezzo_totale: Optional[float] = None
    categoria: Optional[str] = None
    note: Optional[str] = None

class Materiale(MaterialeBase):
    id: int
    preventivo_id: int

    class Config:
        from_attributes = True


# ==========================================
# AGGIUNTA BATCH ARTICOLI (per ricerca avanzata)
# ==========================================
class AggiuntaBatchArticoli(BaseModel):
    """Per aggiungere multipli articoli in una volta"""
    preventivo_id: int
    cliente_id: Optional[int] = None
    articoli: List[dict]  # Lista di {articolo_id, quantita, parametro_calcolo}


# ==========================================
# RESPONSE SCHEMAS
# ==========================================
class PaginatedResponse(BaseModel):
    """Risposta paginata generica"""
    items: List
    total: int
    limit: int
    offset: int
    has_more: bool


class SuccessResponse(BaseModel):
    """Risposta generica di successo"""
    success: bool = True
    message: str
    data: Optional[dict] = None
