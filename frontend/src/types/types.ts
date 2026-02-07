// ==========================================
// TIPI BASE CONFIGURATORE ELETTROQUADRI v2.0
// ==========================================

// ==========================================
// ENUMS
// ==========================================
export type TipoPreventivo = 'COMPLETO' | 'RICAMBIO';
export type TipoArticolo = 'PRODUZIONE' | 'ACQUISTO';
export type StatoPreventivo = 'draft' | 'sent' | 'approved' | 'rejected';

// ==========================================
// PARAMETRI SISTEMA
// ==========================================
export interface ParametroSistema {
  id: number;
  chiave: string;
  valore: string;
  descrizione?: string;
  tipo_dato: string;
  gruppo?: string;
  created_at: string;
  updated_at?: string;
}

export interface ParametroSistemaCreate {
  chiave: string;
  valore: string;
  descrizione?: string;
  tipo_dato?: string;
  gruppo?: string;
}

export interface ParametroSistemaUpdate {
  valore?: string;
  descrizione?: string;
  tipo_dato?: string;
  gruppo?: string;
}

// ==========================================
// GRUPPI UTENTI
// ==========================================
export interface GruppoUtenti {
  id: number;
  nome: string;
  descrizione?: string;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface PermessoGruppo {
  id: number;
  gruppo_id: number;
  permesso: string;
  descrizione?: string;
}

export interface GruppoUtentiConPermessi extends GruppoUtenti {
  permessi: PermessoGruppo[];
}

export interface GruppoUtentiCreate {
  nome: string;
  descrizione?: string;
  is_admin?: boolean;
  is_active?: boolean;
}

export interface GruppoUtentiUpdate {
  nome?: string;
  descrizione?: string;
  is_admin?: boolean;
  is_active?: boolean;
}

// ==========================================
// UTENTI
// ==========================================
export interface Utente {
  id: number;
  username: string;
  email?: string;
  nome?: string;
  cognome?: string;
  gruppo_id?: number;
  is_active: boolean;
  ultimo_accesso?: string;
  created_at: string;
  updated_at?: string;
}

export interface UtenteConGruppo extends Utente {
  gruppo?: GruppoUtenti;
}

export interface UtenteCreate {
  username: string;
  email?: string;
  nome?: string;
  cognome?: string;
  gruppo_id?: number;
  password?: string;
  is_active?: boolean;
}

export interface UtenteUpdate {
  username?: string;
  email?: string;
  nome?: string;
  cognome?: string;
  gruppo_id?: number;
  password?: string;
  is_active?: boolean;
}

// ==========================================
// CLIENTI
// ==========================================
export interface Cliente {
  id: number;
  codice: string;
  ragione_sociale: string;
  partita_iva?: string;
  codice_fiscale?: string;
  indirizzo?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  nazione: string;
  telefono?: string;
  email?: string;
  pec?: string;
  sconto_produzione: number;
  sconto_acquisto: number;
  sconto_globale: number;
  pagamento_default?: string;
  listino_id?: number;
  note?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ClienteCreate {
  codice: string;
  ragione_sociale: string;
  partita_iva?: string;
  codice_fiscale?: string;
  indirizzo?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  nazione?: string;
  telefono?: string;
  email?: string;
  pec?: string;
  sconto_produzione?: number;
  sconto_acquisto?: number;
  sconto_globale?: number;
  pagamento_default?: string;
  note?: string;
  is_active?: boolean;
}

export interface ClienteUpdate extends Partial<ClienteCreate> {}

// ==========================================
// CATEGORIE ARTICOLI
// ==========================================
export interface CategoriaArticolo {
  id: number;
  codice: string;
  nome: string;
  descrizione?: string;
  categoria_padre_id?: number;
  ordine: number;
  is_active: boolean;
}

export interface CategoriaArticoloCreate {
  codice: string;
  nome: string;
  descrizione?: string;
  categoria_padre_id?: number;
  ordine?: number;
  is_active?: boolean;
}

export interface CategoriaArticoloUpdate extends Partial<CategoriaArticoloCreate> {}

// ==========================================
// ARTICOLI
// ==========================================
export interface Articolo {
  id: number;
  codice: string;
  descrizione: string;
  descrizione_estesa?: string;
  tipo_articolo: TipoArticolo;
  categoria_id?: number;
  costo_fisso: number;
  costo_variabile: number;
  unita_misura_variabile?: string;
  costo_ultimo_acquisto: number;
  data_ultimo_acquisto?: string;
  prezzo_listino: number;
  ricarico_percentuale?: number;
  rule_id_calcolo?: string;
  rule_params?: string;
  giacenza: number;
  scorta_minima: number;
  unita_misura: string;
  peso?: number;
  volume?: number;
  codice_fornitore?: string;
  codice_ean?: string;
  complessivo_padre_id?: number;
  note?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ArticoloConCategoria extends Articolo {
  categoria?: CategoriaArticolo;
}

export interface ArticoloCreate {
  codice: string;
  descrizione: string;
  descrizione_estesa?: string;
  tipo_articolo?: TipoArticolo;
  categoria_id?: number;
  costo_fisso?: number;
  costo_variabile?: number;
  unita_misura_variabile?: string;
  costo_ultimo_acquisto?: number;
  prezzo_listino?: number;
  ricarico_percentuale?: number;
  rule_id_calcolo?: string;
  rule_params?: string;
  giacenza?: number;
  scorta_minima?: number;
  unita_misura?: string;
  peso?: number;
  volume?: number;
  codice_fornitore?: string;
  codice_ean?: string;
  complessivo_padre_id?: number;
  note?: string;
  is_active?: boolean;
}

export interface ArticoloUpdate extends Partial<ArticoloCreate> {}

// ==========================================
// RICERCA ARTICOLI
// ==========================================
export interface ArticoloSearchResult {
  id: number;
  codice: string;
  descrizione: string;
  tipo_articolo: TipoArticolo;
  prezzo_listino: number;
  unita_misura: string;
  categoria_nome?: string;
}

export interface ArticoloSearchFilters {
  query?: string;
  categoria_id?: number;
  tipo_articolo?: TipoArticolo;
  complessivo_id?: number;
  codice_fornitore?: string;
  solo_attivi?: boolean;
  limit?: number;
  offset?: number;
}

// ==========================================
// CALCOLO PREZZO
// ==========================================
export interface CalcoloPrezzoInput {
  articolo_id: number;
  quantita?: number;
  parametro_calcolo?: number;
  cliente_id?: number;
}

export interface CalcoloPrezzoOutput {
  articolo_id: number;
  codice: string;
  descrizione: string;
  tipo_articolo: TipoArticolo;
  costo_base_unitario: number;
  dettaglio_costo: string;
  ricarico_percentuale: number;
  prezzo_listino_unitario: number;
  sconto_cliente_percentuale: number;
  prezzo_finale_unitario: number;
  quantita: number;
  prezzo_totale: number;
}

// ==========================================
// RIGHE RICAMBIO
// ==========================================
export interface RigaRicambio {
  id: number;
  preventivo_id: number;
  articolo_id?: number;
  codice_articolo: string;
  descrizione: string;
  quantita: number;
  unita_misura: string;
  parametro_calcolo?: number;
  costo_base: number;
  prezzo_listino: number;
  ricarico_applicato: number;
  sconto_cliente: number;
  prezzo_unitario: number;
  prezzo_totale: number;
  note?: string;
  ordine: number;
  created_at: string;
  updated_at?: string;
}

export interface RigaRicambioCreate {
  preventivo_id: number;
  articolo_id?: number;
  codice_articolo: string;
  descrizione: string;
  quantita?: number;
  unita_misura?: string;
  parametro_calcolo?: number;
  costo_base?: number;
  prezzo_listino?: number;
  ricarico_applicato?: number;
  sconto_cliente?: number;
  prezzo_unitario?: number;
  prezzo_totale?: number;
  note?: string;
  ordine?: number;
}

export interface RigaRicambioUpdate extends Partial<Omit<RigaRicambioCreate, 'preventivo_id'>> {}

// ==========================================
// PREVENTIVI (AGGIORNATI)
// ==========================================
export interface Preventivo {
  id: number;
  numero_preventivo: string;
  tipo_preventivo: TipoPreventivo;
  cliente_id?: number;
  customer_name?: string;
  status: StatoPreventivo;
  total_price: number;
  totale_lordo: number;
  totale_sconti: number;
  totale_netto: number;
  created_at: string;
  updated_at?: string;
}

export interface PreventivoConCliente extends Preventivo {
  cliente?: Cliente;
}

export interface PreventivoCompleto extends Preventivo {
  cliente?: Cliente;
  righe_ricambio: RigaRicambio[];
}

export interface PreventivoCreate {
  numero_preventivo?: string;
  tipo_preventivo?: TipoPreventivo;
  cliente_id?: number;
  customer_name?: string;
  status?: StatoPreventivo;
  total_price?: number;
}

export interface PreventivoUpdate {
  numero_preventivo?: string;
  tipo_preventivo?: TipoPreventivo;
  cliente_id?: number;
  customer_name?: string;
  status?: StatoPreventivo;
  total_price?: number;
  totale_lordo?: number;
  totale_sconti?: number;
  totale_netto?: number;
}

// ==========================================
// BATCH OPERATIONS
// ==========================================
export interface AggiuntaBatchArticoli {
  preventivo_id: number;
  cliente_id?: number;
  articoli: Array<{
    articolo_id: number;
    quantita?: number;
    parametro_calcolo?: number;
  }>;
}

// ==========================================
// RESPONSES
// ==========================================
export interface SuccessResponse {
  success: boolean;
  message: string;
  data?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

// ==========================================
// DATI ESISTENTI (invariati)
// ==========================================
export interface DatiCommessa {
  id?: number;
  preventivo_id: number;
  numero_offerta?: string;
  data_offerta?: string;
  riferimento_cliente?: string;
  quantita?: number;
  consegna_richiesta?: string;
  prezzo_unitario?: number;
  imballo?: string;
  reso_fco?: string;
  pagamento?: string;
  trasporto?: string;
  destinazione?: string;
}

export interface DatiPrincipali {
  id?: number;
  preventivo_id: number;
  tipo_impianto?: string;
  nuovo_impianto?: boolean;
  numero_fermate?: number;
  numero_servizi?: number;
  velocita?: number;
  corsa?: number;
  con_locale_macchina?: boolean;
  posizione_locale_macchina?: string;
  tipo_trazione?: string;
  forza_motrice?: string;
  luce?: string;
  tensione_manovra?: string;
  tensione_freno?: string;
}

export interface Normative {
  id?: number;
  preventivo_id: number;
  en_81_1?: string;
  en_81_20?: string;
  en_81_21?: string;
  en_81_28?: boolean;
  en_81_70?: boolean;
  en_81_72?: boolean;
  en_81_73?: boolean;
  a3_95_16?: boolean;
  dm236_legge13?: boolean;
  emendamento_a3?: boolean;
  uni_10411_1?: boolean;
}

export interface DisposizioneVano {
  id?: number;
  preventivo_id: number;
  posizione_quadro_lato?: string;
  posizione_quadro_piano?: string;
  altezza_vano?: number;
  piano_piu_alto?: string;
  piano_piu_basso?: string;
  posizioni_elementi?: string;
  sbarchi?: string;
  note?: string;
}

export interface Porte {
  id?: number;
  preventivo_id: number;
  tipo_porte_piano?: string;
  tipo_porte_cabina?: string;
  numero_accessi?: number;
  tipo_operatore?: string;
  marca_operatore?: string;
  stazionamento_porte?: string;
  tipo_apertura?: string;
  distanza_minima_accessi?: number;
  alimentazione_operatore?: string;
  con_scheda?: boolean;
}

export interface Materiale {
  id?: number;
  preventivo_id: number;
  codice: string;
  descrizione: string;
  quantita: number;
  prezzo_unitario: number;
  prezzo_totale: number;
  categoria?: string;
  aggiunto_da_regola?: boolean;
  regola_id?: string;
  note?: string;
}

// ==========================================
// RULE ENGINE
// ==========================================
export interface RuleEvaluationResult {
  active_rules: string[];
  materials_added: number;
  materials_removed: number;
  total_materials: number;
  total_price: number;
}
