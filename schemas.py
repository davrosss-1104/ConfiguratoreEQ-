"""
schemas.py - Pydantic Schemas per validazione e serializzazione
"""
from pydantic import BaseModel, EmailStr, Field
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
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    is_admin: bool = False


class UserCreate(UserBase):
    password: str


class UserOut(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    username: str
    password: str


# ============================================================================
# CLIENTE SCHEMAS
# ============================================================================

class ClienteBase(BaseModel):
    ragione_sociale: str
    partita_iva: Optional[str] = None
    codice_fiscale: Optional[str] = None
    indirizzo: Optional[str] = None
    citta: Optional[str] = None
    cap: Optional[str] = None
    provincia: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[EmailStr] = None
    referente: Optional[str] = None
    note: Optional[str] = None


class ClienteCreate(ClienteBase):
    pass


class ClienteUpdate(BaseModel):
    ragione_sociale: Optional[str] = None
    partita_iva: Optional[str] = None
    codice_fiscale: Optional[str] = None
    indirizzo: Optional[str] = None
    citta: Optional[str] = None
    cap: Optional[str] = None
    provincia: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[EmailStr] = None
    referente: Optional[str] = None
    note: Optional[str] = None


class ClienteOut(ClienteBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# MATERIALE SCHEMAS
# ============================================================================

class MaterialeBase(BaseModel):
    codice: str
    descrizione: Optional[str] = None
    categoria: Optional[str] = None
    quantita: float = 1.0
    unita_misura: str = "pz"
    prezzo_unitario: float = 0.0
    prezzo_totale: float = 0.0
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
    aggiunto_da_regola: bool = False
    regola_id: Optional[str] = None
    lato: Optional[str] = None
    note: Optional[str] = None
    ordine: int = 0


class MaterialeCreate(MaterialeBase):
    preventivo_id: int


class MaterialeUpdate(BaseModel):
    codice: Optional[str] = None
    descrizione: Optional[str] = None
    categoria: Optional[str] = None
    quantita: Optional[float] = None
    unita_misura: Optional[str] = None
    prezzo_unitario: Optional[float] = None
    prezzo_totale: Optional[float] = None
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
    lato: Optional[str] = None
    note: Optional[str] = None
    ordine: Optional[int] = None


class MaterialeOut(MaterialeBase):
    id: int
    preventivo_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# PREVENTIVO SCHEMAS
# ============================================================================

class PreventivoBase(BaseModel):
    tipo: str = Field(..., pattern="^(prodotto_completo|ricambi)$")
    cliente_id: int
    nome_commessa: Optional[str] = None
    indirizzo_cantiere: Optional[str] = None
    referente_cantiere: Optional[str] = None
    configurazione: Optional[Dict[str, Any]] = None
    totale_materiali: float = 0.0
    totale_manodopera: float = 0.0
    totale_trasporto: float = 0.0
    sconto_percentuale: float = 0.0
    totale_netto: float = 0.0
    totale_iva: float = 0.0
    totale_lordo: float = 0.0
    note_interne: Optional[str] = None
    note_cliente: Optional[str] = None


class PreventivoCreate(PreventivoBase):
    pass


class PreventivoUpdate(BaseModel):
    stato: Optional[str] = None
    nome_commessa: Optional[str] = None
    indirizzo_cantiere: Optional[str] = None
    referente_cantiere: Optional[str] = None
    configurazione: Optional[Dict[str, Any]] = None
    totale_materiali: Optional[float] = None
    totale_manodopera: Optional[float] = None
    totale_trasporto: Optional[float] = None
    sconto_percentuale: Optional[float] = None
    totale_netto: Optional[float] = None
    totale_iva: Optional[float] = None
    totale_lordo: Optional[float] = None
    note_interne: Optional[str] = None
    note_cliente: Optional[str] = None


class PreventivoOut(PreventivoBase):
    id: int
    numero: str
    stato: str
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    data_invio: Optional[datetime] = None
    data_accettazione: Optional[datetime] = None
    
    # Nested relationships
    cliente: ClienteOut
    materiali: List[MaterialeOut] = []
    
    class Config:
        from_attributes = True


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
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============================================================================
# RULE ENGINE SCHEMAS
# ============================================================================

class EvaluateRulesRequest(BaseModel):
    """Request per valutazione regole"""
    preventivo_id: int
    force_refresh: bool = False


class EvaluateRulesResponse(BaseModel):
    """Response valutazione regole"""
    success: bool
    materiali_aggiunti: int
    materiali_rimossi: int
    regole_applicate: List[str]
    warnings: List[str] = []
    errors: List[str] = []
