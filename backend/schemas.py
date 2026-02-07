from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ==========================================
# PARAMETRI SISTEMA
# ==========================================
class ParametriSistemaBase(BaseModel):
    chiave: str
    valore: str
    descrizione: Optional[str] = None
    tipo_dato: str = "string"
    gruppo: Optional[str] = None

class ParametriSistemaCreate(ParametriSistemaBase):
    pass

class ParametriSistemaUpdate(BaseModel):
    valore: Optional[str] = None
    descrizione: Optional[str] = None

class ParametriSistema(ParametriSistemaBase):
    id: int
    class Config:
        from_attributes = True


# ==========================================
# OPZIONI DROPDOWN
# ==========================================
class OpzioneDropdownBase(BaseModel):
    gruppo: str
    valore: str
    etichetta: str
    ordine: int = 0
    attivo: bool = True
    descrizione: Optional[str] = None

class OpzioneDropdownCreate(OpzioneDropdownBase):
    pass

class OpzioneDropdownUpdate(BaseModel):
    valore: Optional[str] = None
    etichetta: Optional[str] = None
    ordine: Optional[int] = None
    attivo: Optional[bool] = None
    descrizione: Optional[str] = None

class OpzioneDropdown(OpzioneDropdownBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ==========================================
# CAMPI CONFIGURATORE
# ==========================================
class CampoConfiguratoreBase(BaseModel):
    codice: str
    etichetta: str
    tipo: str  # "dropdown", "numero", "testo", "booleano"
    sezione: str
    gruppo_dropdown: Optional[str] = None
    unita_misura: Optional[str] = None
    valore_min: Optional[float] = None
    valore_max: Optional[float] = None
    valore_default: Optional[str] = None
    descrizione: Optional[str] = None
    obbligatorio: bool = False
    ordine: int = 0
    attivo: bool = True
    visibile_form: bool = True
    usabile_regole: bool = True

class CampoConfiguratoreCreate(CampoConfiguratoreBase):
    pass

class CampoConfiguratoreUpdate(BaseModel):
    etichetta: Optional[str] = None
    tipo: Optional[str] = None
    sezione: Optional[str] = None
    gruppo_dropdown: Optional[str] = None
    unita_misura: Optional[str] = None
    valore_min: Optional[float] = None
    valore_max: Optional[float] = None
    valore_default: Optional[str] = None
    descrizione: Optional[str] = None
    obbligatorio: Optional[bool] = None
    ordine: Optional[int] = None
    attivo: Optional[bool] = None
    visibile_form: Optional[bool] = None
    usabile_regole: Optional[bool] = None

class CampoConfiguratore(CampoConfiguratoreBase):
    id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # Campo calcolato: opzioni dropdown se tipo=dropdown
    opzioni: Optional[List[dict]] = None
    
    class Config:
        from_attributes = True


# ==========================================
# CLIENTE
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
    nazione: str = "Italia"
    telefono: Optional[str] = None
    email: Optional[str] = None
    pec: Optional[str] = None
    sconto_globale: float = 0
    sconto_produzione: float = 0
    sconto_acquisto: float = 0
    aliquota_iva: float = 22
    # Condizioni commerciali DEFAULT
    pagamento_default: Optional[str] = None
    imballo_default: Optional[str] = None
    reso_fco_default: Optional[str] = None
    trasporto_default: Optional[str] = None
    destinazione_default: Optional[str] = None
    riferimento_cliente_default: Optional[str] = None
    listino: Optional[str] = None
    note: Optional[str] = None

class ClienteCreate(ClienteBase):
    pass

class ClienteUpdate(BaseModel):
    codice: Optional[str] = None
    ragione_sociale: Optional[str] = None
    partita_iva: Optional[str] = None
    citta: Optional[str] = None
    provincia: Optional[str] = None
    sconto_globale: Optional[float] = None
    sconto_produzione: Optional[float] = None
    sconto_acquisto: Optional[float] = None
    pagamento_default: Optional[str] = None
    imballo_default: Optional[str] = None
    reso_fco_default: Optional[str] = None
    trasporto_default: Optional[str] = None
    destinazione_default: Optional[str] = None
    riferimento_cliente_default: Optional[str] = None
    is_active: Optional[bool] = None

class Cliente(ClienteBase):
    id: int
    is_active: bool = True
    class Config:
        from_attributes = True


# ==========================================
# CATEGORIA ARTICOLO
# ==========================================
class CategoriaArticoloBase(BaseModel):
    codice: str
    nome: str
    descrizione: Optional[str] = None
    ordine: int = 0

class CategoriaArticolo(CategoriaArticoloBase):
    id: int
    is_active: bool = True
    class Config:
        from_attributes = True


# ==========================================
# ARTICOLO
# ==========================================
class ArticoloBase(BaseModel):
    codice: str
    descrizione: str
    descrizione_estesa: Optional[str] = None
    tipo_articolo: str = "PRODUZIONE"
    categoria_id: Optional[int] = None
    
    # Costi - fino a 4 parametri variabili
    costo_fisso: float = 0
    costo_variabile_1: float = 0
    unita_misura_var_1: Optional[str] = None
    descrizione_var_1: Optional[str] = None
    costo_variabile_2: float = 0
    unita_misura_var_2: Optional[str] = None
    descrizione_var_2: Optional[str] = None
    costo_variabile_3: float = 0
    unita_misura_var_3: Optional[str] = None
    descrizione_var_3: Optional[str] = None
    costo_variabile_4: float = 0
    unita_misura_var_4: Optional[str] = None
    descrizione_var_4: Optional[str] = None
    
    rule_id_calcolo: Optional[str] = None
    ricarico_percentuale: Optional[float] = None
    unita_misura: str = "PZ"
    giacenza: int = 0
    scorta_minima: int = 0
    fornitore: Optional[str] = None
    codice_fornitore: Optional[str] = None
    
    # Lead Time (giorni lavorativi)
    lead_time_giorni: int = 0  # Tempo approvvigionamento
    manodopera_giorni: int = 0  # Tempo lavorazione

class ArticoloCreate(ArticoloBase):
    pass

class ArticoloUpdate(BaseModel):
    codice: Optional[str] = None
    descrizione: Optional[str] = None
    tipo_articolo: Optional[str] = None
    categoria_id: Optional[int] = None
    costo_fisso: Optional[float] = None
    costo_variabile_1: Optional[float] = None
    unita_misura_var_1: Optional[str] = None
    descrizione_var_1: Optional[str] = None
    costo_variabile_2: Optional[float] = None
    unita_misura_var_2: Optional[str] = None
    descrizione_var_2: Optional[str] = None
    costo_variabile_3: Optional[float] = None
    unita_misura_var_3: Optional[str] = None
    descrizione_var_3: Optional[str] = None
    costo_variabile_4: Optional[float] = None
    unita_misura_var_4: Optional[str] = None
    descrizione_var_4: Optional[str] = None
    ricarico_percentuale: Optional[float] = None
    unita_misura: Optional[str] = None
    is_active: Optional[bool] = None

class Articolo(ArticoloBase):
    id: int
    is_active: bool = True
    class Config:
        from_attributes = True


# ==========================================
# CALCOLO PREZZO OUTPUT
# ==========================================
class ParametroCalcolo(BaseModel):
    valore: float
    costo_variabile: float
    unita_misura: Optional[str] = None
    descrizione: Optional[str] = None
    subtotale: float  # costo_variabile × valore

class CalcoloPrezzoOutput(BaseModel):
    # Step 1: Costo
    costo_fisso: float
    parametri: List[ParametroCalcolo]  # Lista di max 4 parametri
    costo_base_unitario: float  # fisso + Σ(var_i × param_i)
    
    # Step 2: Ricarico
    ricarico_percentuale: float
    prezzo_listino_unitario: float
    
    # Step 3: Sconto cliente
    sconto_cliente_percentuale: float
    prezzo_cliente_unitario: float
    
    # Totali
    quantita: float
    prezzo_totale_listino: float
    prezzo_totale_cliente: float
    
    # Info
    tipo_articolo: str
    dettaglio_calcolo: str


# ==========================================
# PREVENTIVO
# ==========================================
class PreventivoBase(BaseModel):
    numero_preventivo: Optional[str] = None
    tipo_preventivo: str = "COMPLETO"
    cliente_id: Optional[int] = None
    customer_name: Optional[str] = None
    status: Optional[str] = "draft"
    total_price: Optional[float] = 0.0  # Totale a listino
    sconto_cliente: Optional[float] = 0.0  # Sconto da anagrafica cliente
    sconto_extra_admin: Optional[float] = 0.0  # Sconto extra (solo admin)
    total_price_finale: Optional[float] = 0.0  # Totale dopo tutti gli sconti
    note: Optional[str] = None

class PreventivoCreate(BaseModel):
    tipo_preventivo: str = "COMPLETO"
    cliente_id: Optional[int] = None
    customer_name: Optional[str] = None
    user_id: Optional[int] = None  # Chi crea il preventivo

class PreventivoUpdate(BaseModel):
    tipo_preventivo: Optional[str] = None
    cliente_id: Optional[int] = None
    customer_name: Optional[str] = None
    status: Optional[str] = None
    total_price: Optional[float] = None
    sconto_cliente: Optional[float] = None
    sconto_extra_admin: Optional[float] = None  # Solo admin può modificare
    total_price_finale: Optional[float] = None
    note: Optional[str] = None

class Preventivo(PreventivoBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[int] = None
    class Config:
        from_attributes = True


# ==========================================
# DATI COMMESSA
# ==========================================
class DatiCommessaBase(BaseModel):
    numero_offerta: Optional[str] = None
    data_offerta: Optional[str] = None
    riferimento_cliente: Optional[str] = None
    quantita: Optional[int] = None
    data_consegna_richiesta: Optional[str] = None  # Data ISO (YYYY-MM-DD) per calcolo lead time
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
# DATI PRINCIPALI
# ==========================================
class DatiPrincipaliBase(BaseModel):
    tipo_impianto: Optional[str] = None
    nuovo_impianto: Optional[bool] = None
    numero_fermate: Optional[int] = None
    numero_servizi: Optional[int] = None
    velocita: Optional[float] = None
    corsa: Optional[float] = None
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
# NORMATIVE
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
# DISPOSIZIONE VANO
# ==========================================
class DisposizioneVanoBase(BaseModel):
    posizione_quadro_lato: Optional[str] = None
    posizione_quadro_piano: Optional[str] = None
    altezza_vano: Optional[float] = None
    piano_piu_alto: Optional[str] = None
    piano_piu_basso: Optional[str] = None
    posizioni_elementi: Optional[str] = None
    sbarchi: Optional[str] = None
    note: Optional[str] = None

class DisposizioneVanoCreate(DisposizioneVanoBase):
    preventivo_id: int

class DisposizioneVanoUpdate(DisposizioneVanoBase):
    pass

class DisposizioneVano(DisposizioneVanoBase):
    id: int
    preventivo_id: int
    class Config:
        from_attributes = True


# ==========================================
# PORTE
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
# ARGANO
# ==========================================
class ArganoBase(BaseModel):
    trazione: Optional[str] = None
    potenza_motore_kw: Optional[float] = None
    corrente_nom_motore_amp: Optional[float] = None
    tipo_vvvf: Optional[str] = None
    vvvf_nel_vano: Optional[bool] = False
    freno_tensione: Optional[str] = None
    ventilazione_forzata: Optional[str] = None
    tipo_teleruttore: Optional[str] = None

class ArganoCreate(ArganoBase):
    preventivo_id: int

class ArganoUpdate(ArganoBase):
    pass

class Argano(ArganoBase):
    id: int
    preventivo_id: int
    class Config:
        from_attributes = True


# ==========================================
# MATERIALE
# ==========================================
class MaterialeBase(BaseModel):
    codice: str
    descrizione: str
    quantita: float = 1
    prezzo_unitario: float = 0.0
    prezzo_totale: float = 0.0
    categoria: Optional[str] = None
    aggiunto_da_regola: bool = False
    regola_id: Optional[str] = None
    note: Optional[str] = None
    lead_time_giorni: int = 0
    manodopera_giorni: int = 0

class MaterialeCreate(BaseModel):
    codice: str
    descrizione: str
    quantita: float = 1
    prezzo_unitario: float = 0.0
    categoria: Optional[str] = None
    aggiunto_da_regola: bool = False
    regola_id: Optional[str] = None
    note: Optional[str] = None
    lead_time_giorni: int = 0
    manodopera_giorni: int = 0

class MaterialeUpdate(BaseModel):
    codice: Optional[str] = None
    descrizione: Optional[str] = None
    quantita: Optional[float] = None
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
# RIGA RICAMBIO
# ==========================================
class RigaRicambioBase(BaseModel):
    articolo_id: Optional[int] = None
    codice: str
    descrizione: str
    tipo_articolo: str = "PRODUZIONE"
    quantita: float = 1
    
    # 4 parametri variabili
    parametro_1: Optional[float] = None
    unita_param_1: Optional[str] = None
    desc_param_1: Optional[str] = None
    costo_var_1: float = 0
    
    parametro_2: Optional[float] = None
    unita_param_2: Optional[str] = None
    desc_param_2: Optional[str] = None
    costo_var_2: float = 0
    
    parametro_3: Optional[float] = None
    unita_param_3: Optional[str] = None
    desc_param_3: Optional[str] = None
    costo_var_3: float = 0
    
    parametro_4: Optional[float] = None
    unita_param_4: Optional[str] = None
    desc_param_4: Optional[str] = None
    costo_var_4: float = 0
    
    # Costi calcolati
    costo_fisso: float = 0
    costo_base_unitario: float = 0
    ricarico_percentuale: float = 0
    prezzo_listino_unitario: float = 0
    sconto_cliente: float = 0
    prezzo_cliente_unitario: float = 0
    prezzo_totale_listino: float = 0
    prezzo_totale_cliente: float = 0
    note: Optional[str] = None

class RigaRicambioCreate(RigaRicambioBase):
    pass

class RigaRicambioUpdate(BaseModel):
    quantita: Optional[float] = None
    parametro_1: Optional[float] = None
    parametro_2: Optional[float] = None
    parametro_3: Optional[float] = None
    parametro_4: Optional[float] = None
    costo_base_unitario: Optional[float] = None
    ricarico_percentuale: Optional[float] = None
    prezzo_listino_unitario: Optional[float] = None
    sconto_cliente: Optional[float] = None
    prezzo_cliente_unitario: Optional[float] = None
    prezzo_totale_listino: Optional[float] = None
    prezzo_totale_cliente: Optional[float] = None
    note: Optional[str] = None

class RigaRicambio(RigaRicambioBase):
    id: int
    preventivo_id: int
    ordine: int = 0
    class Config:
        from_attributes = True


# ==========================================
# TEMPLATE PREVENTIVO
# ==========================================
class TemplatePreventivoBase(BaseModel):
    nome: str
    descrizione: Optional[str] = None
    is_public: bool = False
    dati_json: Optional[str] = None

class TemplatePreventivoCreate(TemplatePreventivoBase):
    pass

class TemplatePreventivoUpdate(BaseModel):
    nome: Optional[str] = None
    descrizione: Optional[str] = None
    dati_json: Optional[str] = None

class TemplatePreventivo(TemplatePreventivoBase):
    id: int
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True
