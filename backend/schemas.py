from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# ==========================================
# PREVENTIVO SCHEMAS
# ==========================================
class PreventivoBase(BaseModel):
    numero_preventivo: Optional[str] = None
    status: Optional[str] = "draft"
    total_price: Optional[float] = 0.0
    customer_name: Optional[str] = None
    categoria: Optional[str] = None
    template_id: Optional[int] = None

class PreventivoCreate(BaseModel):
    numero_preventivo: Optional[str] = None
    status: Optional[str] = "draft"
    total_price: Optional[float] = 0.0
    customer_name: Optional[str] = None
    template_id: Optional[int] = None  # Se specificato, pre-compila dal template

class PreventivoUpdate(BaseModel):
    numero_preventivo: Optional[str] = None
    status: Optional[str] = None
    total_price: Optional[float] = None
    customer_name: Optional[str] = None

class Preventivo(PreventivoBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    template_id: Optional[int] = None

    class Config:
        from_attributes = True


# ==========================================
# PRODUCT TEMPLATE SCHEMAS
# ==========================================
class ProductTemplateBase(BaseModel):
    categoria: str
    sottocategoria: str
    nome_display: str
    descrizione: Optional[str] = None
    icona: Optional[str] = None
    ordine: Optional[int] = 1
    attivo: Optional[bool] = True
    template_data: Optional[str] = None  # JSON string

class ProductTemplateCreate(ProductTemplateBase):
    pass

class ProductTemplateUpdate(BaseModel):
    categoria: Optional[str] = None
    sottocategoria: Optional[str] = None
    nome_display: Optional[str] = None
    descrizione: Optional[str] = None
    icona: Optional[str] = None
    ordine: Optional[int] = None
    attivo: Optional[bool] = None
    template_data: Optional[str] = None

class ProductTemplate(ProductTemplateBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

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
    en_81_1: Optional[str] = None
    en_81_20: Optional[str] = None
    en_81_21: Optional[str] = None
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
    posizione_quadro_lato: Optional[str] = Field(None)
    posizione_quadro_piano: Optional[str] = Field(None)
    altezza_vano: Optional[float] = Field(None)
    piano_piu_alto: Optional[str] = Field(None)
    piano_piu_basso: Optional[str] = Field(None)
    posizioni_elementi: Optional[str] = Field(None)
    sbarchi: Optional[str] = Field(None)
    note: Optional[str] = Field(None)

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
