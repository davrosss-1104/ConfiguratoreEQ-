"""
schemas.py - Pydantic Schemas per validazione e serializzazione
Allineato con DB reale e frontend
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


# ============================================================================
# AUTH SCHEMAS
# ============================================================================

class Token(BaseModel):
    access_token: str
    token_type: str
    user: "UserOut"


class TokenData(BaseModel):
    username: Optional[str] = None


class UserBase(BaseModel):
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    is_admin: bool = False


class UserCreate(UserBase):
    password: str


class UserOut(UserBase):
    id: int
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    username: str
    password: str


# ============================================================================
# CLIENTE SCHEMAS
# ============================================================================

class ClienteBase(BaseModel):
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
    sconto_globale: Optional[float] = None
    sconto_produzione: Optional[float] = None
    sconto_acquisto: Optional[float] = None
    aliquota_iva: Optional[float] = None
    pagamento_default: Optional[str] = None
    imballo_default: Optional[str] = None
    reso_fco_default: Optional[str] = None
    trasporto_default: Optional[str] = None
    destinazione_default: Optional[str] = None
    riferimento_cliente_default: Optional[str] = None
    listino: Optional[str] = None
    note: Optional[str] = None
    is_active: Optional[bool] = True


class ClienteCreate(ClienteBase):
    ragione_sociale: str


class ClienteUpdate(ClienteBase):
    pass


class ClienteOut(ClienteBase):
    id: int

    class Config:
        from_attributes = True


# ============================================================================
# MATERIALE SCHEMAS
# ============================================================================

class MaterialeBase(BaseModel):
    codice: Optional[str] = None
    descrizione: Optional[str] = None
    categoria: Optional[str] = None
    quantita: Optional[float] = 1.0
    unita_misura: Optional[str] = "pz"
    prezzo_unitario: Optional[float] = 0.0
    prezzo_totale: Optional[float] = 0.0
    parametro1_nome: Optional[str] = None
    parametro1_valore: Optional[str] = None
    parametro2_nome: Optional[str] = None
    parametro2_valore: Optional[str] = None
    parametro3_nome: Optional[str] = None
    parametro3_valore: Optional[str] = None
    parametro4_nome: Optional[str] = None
    parametro4_valore: Optional[str] = None
    parametro5_nome: Optional[str] = None
    parametro5_valore: Optional[str] = None
    aggiunto_da_regola: Optional[bool] = False
    regola_id: Optional[str] = None
    lato: Optional[str] = None
    note: Optional[str] = None
    ordine: Optional[int] = 0


class MaterialeCreate(MaterialeBase):
    codice: str
    preventivo_id: Optional[int] = None


class MaterialeUpdate(MaterialeBase):
    pass


class MaterialeOut(MaterialeBase):
    id: int
    preventivo_id: int

    class Config:
        from_attributes = True

Materiale = MaterialeOut


# ============================================================================
# PREVENTIVO SCHEMAS
# ============================================================================

class PreventivoCreate(BaseModel):
    numero_preventivo: Optional[str] = None
    tipo_preventivo: Optional[str] = "COMPLETO"
    categoria: Optional[str] = None
    template_id: Optional[int] = None
    cliente_id: Optional[int] = None
    customer_name: Optional[str] = None
    status: Optional[str] = "draft"
    note: Optional[str] = None


class PreventivoUpdate(BaseModel):
    numero_preventivo: Optional[str] = None
    tipo_preventivo: Optional[str] = None
    categoria: Optional[str] = None
    template_id: Optional[int] = None
    cliente_id: Optional[int] = None
    customer_name: Optional[str] = None
    status: Optional[str] = None
    total_price: Optional[float] = None
    sconto_cliente: Optional[float] = None
    sconto_extra_admin: Optional[float] = None
    total_price_finale: Optional[float] = None
    data_scadenza: Optional[str] = None
    note: Optional[str] = None
    lead_time_giorni: Optional[int] = None


class PreventivoOut(BaseModel):
    id: int
    numero_preventivo: Optional[str] = None
    tipo_preventivo: Optional[str] = None
    categoria: Optional[str] = None
    template_id: Optional[int] = None
    cliente_id: Optional[int] = None
    customer_name: Optional[str] = None
    status: Optional[str] = None
    total_price: Optional[float] = 0
    sconto_cliente: Optional[float] = 0
    sconto_extra_admin: Optional[float] = 0
    total_price_finale: Optional[float] = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

Preventivo = PreventivoOut


# ============================================================================
# DATI COMMESSA SCHEMAS
# ============================================================================

class DatiCommessaBase(BaseModel):
    numero_offerta: Optional[str] = None
    riferimento_cliente: Optional[str] = None
    imballo: Optional[str] = None
    reso_fco: Optional[str] = None
    pagamento: Optional[str] = None
    trasporto: Optional[str] = None
    destinazione: Optional[str] = None
    cliente_id: Optional[int] = None


class DatiCommessaCreate(DatiCommessaBase):
    preventivo_id: int


class DatiCommessaUpdate(DatiCommessaBase):
    pass


class DatiCommessaOut(DatiCommessaBase):
    id: int
    preventivo_id: int

    class Config:
        from_attributes = True

DatiCommessa = DatiCommessaOut


# ============================================================================
# DATI PRINCIPALI SCHEMAS
# ============================================================================

class DatiPrincipaliBase(BaseModel):
    tipo_impianto: Optional[str] = None
    tipo_azionamento: Optional[str] = None
    tipo_manovra: Optional[str] = None
    num_fermate: Optional[int] = None
    corsa: Optional[float] = None
    portata: Optional[float] = None
    velocita: Optional[float] = None
    alimentazione: Optional[str] = None
    frequenza: Optional[str] = None


class DatiPrincipaliCreate(DatiPrincipaliBase):
    preventivo_id: int


class DatiPrincipaliUpdate(DatiPrincipaliBase):
    pass


class DatiPrincipaliOut(DatiPrincipaliBase):
    id: int
    preventivo_id: int

    class Config:
        from_attributes = True

DatiPrincipali = DatiPrincipaliOut


# ============================================================================
# NORMATIVE SCHEMAS
# ============================================================================

class NormativeBase(BaseModel):
    en81_20: Optional[bool] = None
    en81_50: Optional[bool] = None
    en81_70: Optional[bool] = None
    en81_72: Optional[bool] = None
    en81_73: Optional[bool] = None
    en81_28: Optional[bool] = None
    a3_95_16: Optional[bool] = None
    dm236_l13: Optional[bool] = None
    en81_20_2020: Optional[bool] = None


class NormativeCreate(NormativeBase):
    preventivo_id: int


class NormativeUpdate(NormativeBase):
    pass


class NormativeOut(NormativeBase):
    id: int
    preventivo_id: int

    class Config:
        from_attributes = True

Normative = NormativeOut


# ============================================================================
# DISPOSIZIONE VANO SCHEMAS
# ============================================================================

class DisposizioneVanoBase(BaseModel):
    larghezza_vano: Optional[float] = None
    profondita_vano: Optional[float] = None
    fossa: Optional[float] = None
    testata: Optional[float] = None
    tipo_fossa: Optional[str] = None
    tipo_testata: Optional[str] = None


class DisposizioneVanoCreate(DisposizioneVanoBase):
    preventivo_id: int


class DisposizioneVanoUpdate(DisposizioneVanoBase):
    pass


class DisposizioneVanoOut(DisposizioneVanoBase):
    id: int
    preventivo_id: int

    class Config:
        from_attributes = True

DisposizioneVano = DisposizioneVanoOut


# ============================================================================
# PORTE SCHEMAS
# ============================================================================

class PorteBase(BaseModel):
    tipo_porta_cabina: Optional[str] = None
    tipo_porta_piano: Optional[str] = None
    larghezza_porta: Optional[float] = None
    altezza_porta: Optional[float] = None
    operatore: Optional[str] = None
    num_ante: Optional[int] = None


class PorteCreate(PorteBase):
    preventivo_id: int


class PorteUpdate(PorteBase):
    pass


class PorteOut(PorteBase):
    id: int
    preventivo_id: int

    class Config:
        from_attributes = True

Porte = PorteOut


# ============================================================================
# PRODUCT TEMPLATE SCHEMAS
# ============================================================================

class ProductTemplateBase(BaseModel):
    nome_display: Optional[str] = None
    categoria: Optional[str] = None
    sotto_categoria: Optional[str] = None
    codice_template: Optional[str] = None
    descrizione: Optional[str] = None
    template_data: Optional[str] = None
    ordine: Optional[int] = 0
    attivo: Optional[bool] = True


class ProductTemplateCreate(ProductTemplateBase):
    nome_display: str
    categoria: str


class ProductTemplateUpdate(ProductTemplateBase):
    pass


class ProductTemplateOut(ProductTemplateBase):
    id: int

    class Config:
        from_attributes = True

ProductTemplate = ProductTemplateOut


# ============================================================================
# REGOLA SCHEMAS
# ============================================================================

class RegolaBase(BaseModel):
    rule_id: str
    nome: str
    descrizione: Optional[str] = None
    categoria: Optional[str] = "BOM"
    rule_json: Dict[str, Any]
    priorita: int = 100
    attiva: bool = True


class RegolaCreate(RegolaBase):
    pass


class RegolaUpdate(BaseModel):
    nome: Optional[str] = None
    descrizione: Optional[str] = None
    categoria: Optional[str] = None
    rule_json: Optional[Dict[str, Any]] = None
    priorita: Optional[int] = None
    attiva: Optional[bool] = None


class RegolaOut(RegolaBase):
    id: int
    versione: int
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ============================================================================
# RULE ENGINE SCHEMAS
# ============================================================================

class EvaluateRulesRequest(BaseModel):
    preventivo_id: int
    force_refresh: bool = False


class EvaluateRulesResponse(BaseModel):
    success: bool
    materiali_aggiunti: int
    materiali_rimossi: int
    regole_applicate: List[str]
    warnings: List[str] = []
    errors: List[str] = []
