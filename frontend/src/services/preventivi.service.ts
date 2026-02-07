import { api } from '@/lib/api';

// ==========================================
// TYPES
// ==========================================

export interface Preventivo {
  id: number;
  numero_preventivo: string;
  status: string;
  total_price: number;
  customer_name?: string;
  created_at: string;
  updated_at?: string;
  template_id?: number;
}

export interface PreventivoCreate {
  customer_name?: string;
  status?: string;
  template_id?: number;
}

export interface PreventivoUpdate {
  customer_name?: string;
  status?: string;
  total_price?: number;
}

export interface DatiCommessa {
  id: number;
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
  id: number;
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
  id: number;
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
  id: number;
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

export interface Materiale {
  id: number;
  preventivo_id: number;
  codice: string;
  descrizione: string;
  quantita: number;
  prezzo_unitario: number;
  prezzo_totale: number;
  categoria?: string;
  aggiunto_da_regola: boolean;
  regola_id?: string;
  note?: string;
}

export interface MaterialeCreate {
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

export interface MaterialeUpdate {
  codice?: string;
  descrizione?: string;
  quantita?: number;
  prezzo_unitario?: number;
  prezzo_totale?: number;
  categoria?: string;
  note?: string;
}

// ==========================================
// PRODUCT TEMPLATE TYPES
// ==========================================

export interface ProductTemplate {
  id: number;
  categoria: string;
  sottocategoria: string;
  nome_display: string;
  descrizione?: string;
  icona?: string;
  ordine: number;
  attivo: boolean;
  template_data?: string;
  created_at: string;
  updated_at?: string;
}

export interface ProductTemplateCreate {
  categoria: string;
  sottocategoria: string;
  nome_display: string;
  descrizione?: string;
  icona?: string;
  ordine?: number;
  attivo?: boolean;
  template_data?: string;
}

export interface ProductTemplateUpdate {
  categoria?: string;
  sottocategoria?: string;
  nome_display?: string;
  descrizione?: string;
  icona?: string;
  ordine?: number;
  attivo?: boolean;
  template_data?: string;
}

export interface CategorySummary {
  categoria: string;
  sottocategorie: {
    id: number;
    sottocategoria: string;
    nome_display: string;
    descrizione?: string;
    icona?: string;
    ordine: number;
  }[];
}

// ==========================================
// PREVENTIVI
// ==========================================

export const getPreventivi = async (): Promise<Preventivo[]> => {
  const response = await api.get('/preventivi');
  return response.data;
};

export const getPreventivo = async (id: number): Promise<Preventivo> => {
  const response = await api.get(`/preventivi/${id}`);
  return response.data;
};

export const createPreventivo = async (data: PreventivoCreate): Promise<Preventivo> => {
  const response = await api.post('/preventivi', data);
  return response.data;
};

export const updatePreventivo = async (id: number, data: PreventivoUpdate): Promise<Preventivo> => {
  const response = await api.put(`/preventivi/${id}`, data);
  return response.data;
};

export const deletePreventivo = async (id: number): Promise<void> => {
  await api.delete(`/preventivi/${id}`);
};

// ==========================================
// DATI COMMESSA
// ==========================================

export const getDatiCommessa = async (preventivoId: number): Promise<DatiCommessa> => {
  const response = await api.get(`/preventivi/${preventivoId}/dati-commessa`);
  return response.data;
};

export const updateDatiCommessa = async (
  preventivoId: number,
  data: Partial<DatiCommessa>
): Promise<DatiCommessa> => {
  const response = await api.put(`/preventivi/${preventivoId}/dati-commessa`, data);
  return response.data;
};

// ==========================================
// DATI PRINCIPALI
// ==========================================

export const getDatiPrincipali = async (preventivoId: number): Promise<DatiPrincipali> => {
  const response = await api.get(`/preventivi/${preventivoId}/dati-principali`);
  return response.data;
};

export const updateDatiPrincipali = async (
  preventivoId: number,
  data: Partial<DatiPrincipali>
): Promise<DatiPrincipali> => {
  const response = await api.put(`/preventivi/${preventivoId}/dati-principali`, data);
  return response.data;
};

// ==========================================
// NORMATIVE
// ==========================================

export const getNormative = async (preventivoId: number): Promise<Normative> => {
  const response = await api.get(`/preventivi/${preventivoId}/normative`);
  return response.data;
};

export const updateNormative = async (
  preventivoId: number,
  data: Partial<Normative>
): Promise<Normative> => {
  const response = await api.put(`/preventivi/${preventivoId}/normative`, data);
  return response.data;
};

// ==========================================
// DISPOSIZIONE VANO
// ==========================================

export const getDisposizioneVano = async (preventivoId: number): Promise<DisposizioneVano> => {
  const response = await api.get(`/preventivi/${preventivoId}/disposizione-vano`);
  return response.data;
};

export const updateDisposizioneVano = async (
  preventivoId: number,
  data: Partial<DisposizioneVano>
): Promise<DisposizioneVano> => {
  const response = await api.put(`/preventivi/${preventivoId}/disposizione-vano`, data);
  return response.data;
};

// ==========================================
// MATERIALI
// ==========================================

export const getMateriali = async (preventivoId: number): Promise<Materiale[]> => {
  const response = await api.get(`/preventivi/${preventivoId}/materiali`);
  return response.data;
};

export const createMateriale = async (
  preventivoId: number,
  data: MaterialeCreate
): Promise<Materiale> => {
  const response = await api.post(`/preventivi/${preventivoId}/materiali`, data);
  return response.data;
};

export const updateMateriale = async (
  preventivoId: number,
  materialeId: number,
  data: MaterialeUpdate
): Promise<Materiale> => {
  const response = await api.put(`/preventivi/${preventivoId}/materiali/${materialeId}`, data);
  return response.data;
};

export const deleteMateriale = async (preventivoId: number, materialeId: number): Promise<void> => {
  await api.delete(`/preventivi/${preventivoId}/materiali/${materialeId}`);
};

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

export const evaluateRules = async (preventivoId: number): Promise<RuleEvaluationResult> => {
  const response = await api.post(`/preventivi/${preventivoId}/evaluate-rules`);
  return response.data;
};

// ==========================================
// PRODUCT TEMPLATES
// ==========================================

export const getTemplates = async (categoria?: string): Promise<ProductTemplate[]> => {
  const params = categoria ? { categoria } : {};
  const response = await api.get('/templates', { params });
  return response.data;
};

export const getAllTemplates = async (): Promise<ProductTemplate[]> => {
  const response = await api.get('/templates/all');
  return response.data;
};

export const getTemplate = async (id: number): Promise<ProductTemplate> => {
  const response = await api.get(`/templates/${id}`);
  return response.data;
};

export const createTemplate = async (data: ProductTemplateCreate): Promise<ProductTemplate> => {
  const response = await api.post('/templates', data);
  return response.data;
};

export const updateTemplate = async (id: number, data: ProductTemplateUpdate): Promise<ProductTemplate> => {
  const response = await api.put(`/templates/${id}`, data);
  return response.data;
};

export const deleteTemplate = async (id: number): Promise<void> => {
  await api.delete(`/templates/${id}`);
};

export const getCategoriesSummary = async (): Promise<CategorySummary[]> => {
  const response = await api.get('/templates/categories/summary');
  return response.data;
};

// ==========================================
// SERVICE OBJECT (per compatibilità con HomePage)
// ==========================================

export const preventiviService = {
  getPreventivi,
  getPreventivo,
  createPreventivo,
  updatePreventivo,
  deletePreventivo,
};

export const templateService = {
  getTemplates,
  getAllTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getCategoriesSummary,
};
