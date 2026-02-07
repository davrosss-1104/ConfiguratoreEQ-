import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  getAllTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type ProductTemplate,
  type ProductTemplateCreate,
  type ProductTemplateUpdate,
} from '@/services/preventivi.service';

// ==========================================
// COSTANTI
// ==========================================
const CATEGORIES = ['RISE', 'HOME'] as const;

const AVAILABLE_FIELDS: Record<string, { label: string; fields: { key: string; label: string; type: string; options?: string[] }[] }> = {
  dati_principali: {
    label: 'Dati Principali',
    fields: [
      { key: 'tipo_impianto', label: 'Tipo Impianto', type: 'select', options: ['elettrico', 'oleodinamico', 'piattaforma'] },
      { key: 'nuovo_impianto', label: 'Nuovo Impianto', type: 'boolean' },
      { key: 'tipo_trazione', label: 'Tipo Trazione', type: 'select', options: ['geared', 'gearless', 'hydraulic'] },
      { key: 'numero_fermate', label: 'Numero Fermate', type: 'number' },
      { key: 'numero_servizi', label: 'Numero Servizi', type: 'number' },
      { key: 'velocita', label: 'Velocità (m/s)', type: 'number' },
      { key: 'corsa', label: 'Corsa (m)', type: 'number' },
      { key: 'con_locale_macchina', label: 'Con Locale Macchina', type: 'boolean' },
      { key: 'posizione_locale_macchina', label: 'Posizione Locale Macchina', type: 'text' },
      { key: 'forza_motrice', label: 'Forza Motrice', type: 'text' },
      { key: 'luce', label: 'Luce', type: 'text' },
      { key: 'tensione_manovra', label: 'Tensione Manovra', type: 'text' },
      { key: 'tensione_freno', label: 'Tensione Freno', type: 'text' },
    ],
  },
  normative: {
    label: 'Normative',
    fields: [
      { key: 'en_81_1', label: 'EN 81-1', type: 'select', options: ['1998', '2010'] },
      { key: 'en_81_20', label: 'EN 81-20', type: 'select', options: ['2014', '2020'] },
      { key: 'en_81_21', label: 'EN 81-21', type: 'select', options: ['2018'] },
      { key: 'en_81_28', label: 'EN 81-28', type: 'boolean' },
      { key: 'en_81_70', label: 'EN 81-70', type: 'boolean' },
      { key: 'en_81_72', label: 'EN 81-72', type: 'boolean' },
      { key: 'en_81_73', label: 'EN 81-73', type: 'boolean' },
      { key: 'a3_95_16', label: 'A3 95/16', type: 'boolean' },
      { key: 'dm236_legge13', label: 'DM 236 Legge 13', type: 'boolean' },
      { key: 'emendamento_a3', label: 'Emendamento A3', type: 'boolean' },
      { key: 'uni_10411_1', label: 'UNI 10411-1', type: 'boolean' },
    ],
  },
  porte: {
    label: 'Porte',
    fields: [
      { key: 'tipo_porte_piano', label: 'Tipo Porte Piano', type: 'text' },
      { key: 'tipo_porte_cabina', label: 'Tipo Porte Cabina', type: 'text' },
      { key: 'numero_accessi', label: 'Numero Accessi', type: 'number' },
      { key: 'tipo_operatore', label: 'Tipo Operatore', type: 'text' },
      { key: 'marca_operatore', label: 'Marca Operatore', type: 'text' },
      { key: 'tipo_apertura', label: 'Tipo Apertura', type: 'text' },
    ],
  },
};

// ==========================================
// INTERFACCE INTERNE
// ==========================================
interface TemplateDataParsed {
  dati_principali?: Record<string, any>;
  normative?: Record<string, any>;
  dati_commessa?: Record<string, any>;
  disposizione_vano?: Record<string, any>;
  porte?: Record<string, any>;
  materiali?: { codice: string; descrizione: string; quantita: number; prezzo_unitario: number }[];
}

interface EditingTemplate {
  id?: number;
  categoria: string;
  sottocategoria: string;
  nome_display: string;
  descrizione: string;
  icona: string;
  ordine: number;
  attivo: boolean;
  templateData: TemplateDataParsed;
}

const emptyTemplate: EditingTemplate = {
  categoria: 'RISE',
  sottocategoria: '',
  nome_display: '',
  descrizione: '',
  icona: '',
  ordine: 1,
  attivo: true,
  templateData: {},
};

// ==========================================
// COMPONENTE PRINCIPALE
// ==========================================
export const AdminTemplatesPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EditingTemplate | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<string>('dati_principali');

  // Query
  const { data: templates = [], isLoading } = useQuery<ProductTemplate[]>({
    queryKey: ['templates-all'],
    queryFn: getAllTemplates,
  });

  // Mutations
  const createMut = useMutation({
    mutationFn: (data: ProductTemplateCreate) => createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates-all'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setEditing(null);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ProductTemplateUpdate }) => updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates-all'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setEditing(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates-all'] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
      setDeleteConfirm(null);
    },
  });

  // Helpers
  const openEdit = (t: ProductTemplate) => {
    let parsed: TemplateDataParsed = {};
    if (t.template_data) {
      try { parsed = JSON.parse(t.template_data); } catch { parsed = {}; }
    }
    setEditing({
      id: t.id,
      categoria: t.categoria,
      sottocategoria: t.sottocategoria,
      nome_display: t.nome_display,
      descrizione: t.descrizione || '',
      icona: t.icona || '',
      ordine: t.ordine,
      attivo: t.attivo,
      templateData: parsed,
    });
  };

  const handleSave = () => {
    if (!editing) return;

    const payload = {
      categoria: editing.categoria,
      sottocategoria: editing.sottocategoria,
      nome_display: editing.nome_display,
      descrizione: editing.descrizione || undefined,
      icona: editing.icona || undefined,
      ordine: editing.ordine,
      attivo: editing.attivo,
      template_data: JSON.stringify(editing.templateData),
    };

    if (editing.id) {
      updateMut.mutate({ id: editing.id, data: payload });
    } else {
      createMut.mutate(payload as ProductTemplateCreate);
    }
  };

  const setField = (section: string, key: string, value: any) => {
    if (!editing) return;
    setEditing({
      ...editing,
      templateData: {
        ...editing.templateData,
        [section]: {
          ...(editing.templateData[section as keyof TemplateDataParsed] as Record<string, any> || {}),
          [key]: value,
        },
      },
    });
  };

  const removeField = (section: string, key: string) => {
    if (!editing) return;
    const sectionData = { ...(editing.templateData[section as keyof TemplateDataParsed] as Record<string, any> || {}) };
    delete sectionData[key];
    setEditing({
      ...editing,
      templateData: {
        ...editing.templateData,
        [section]: Object.keys(sectionData).length > 0 ? sectionData : undefined,
      },
    });
  };

  // Materiali helpers
  const addMateriale = () => {
    if (!editing) return;
    const materiali = [...(editing.templateData.materiali || [])];
    materiali.push({ codice: '', descrizione: '', quantita: 1, prezzo_unitario: 0 });
    setEditing({ ...editing, templateData: { ...editing.templateData, materiali } });
  };

  const updateMateriale = (index: number, field: string, value: any) => {
    if (!editing) return;
    const materiali = [...(editing.templateData.materiali || [])];
    materiali[index] = { ...materiali[index], [field]: value };
    setEditing({ ...editing, templateData: { ...editing.templateData, materiali } });
  };

  const removeMateriale = (index: number) => {
    if (!editing) return;
    const materiali = [...(editing.templateData.materiali || [])];
    materiali.splice(index, 1);
    setEditing({ ...editing, templateData: { ...editing.templateData, materiali: materiali.length > 0 ? materiali : undefined } });
  };

  // Raggruppa templates per categoria
  const grouped = CATEGORIES.map(cat => ({
    categoria: cat,
    templates: templates.filter(t => t.categoria === cat).sort((a, b) => a.ordine - b.ordine),
  }));

  // ==========================================
  // RENDER - FORM EDITING
  // ==========================================
  if (editing) {
    const sectionData = (editing.templateData[activeSection as keyof TemplateDataParsed] as Record<string, any>) || {};
    const sectionConfig = AVAILABLE_FIELDS[activeSection];

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header form */}
        <div className="bg-white shadow">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setEditing(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-gray-900">
                {editing.id ? 'Modifica Template' : 'Nuovo Template'}
              </h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={createMut.isPending || updateMut.isPending || !editing.nome_display || !editing.sottocategoria}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
              >
                {(createMut.isPending || updateMut.isPending) ? 'Salvataggio...' : 'Salva'}
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="grid grid-cols-3 gap-6">
            {/* Colonna SX - Info base */}
            <div className="col-span-1 space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Informazioni Base</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Categoria</label>
                  <select
                    value={editing.categoria}
                    onChange={(e) => setEditing({ ...editing, categoria: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Sotto-categoria</label>
                  <input
                    type="text"
                    value={editing.sottocategoria}
                    onChange={(e) => setEditing({ ...editing, sottocategoria: e.target.value })}
                    placeholder="es: Gearless MRL"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Nome Visualizzato</label>
                  <input
                    type="text"
                    value={editing.nome_display}
                    onChange={(e) => setEditing({ ...editing, nome_display: e.target.value })}
                    placeholder="Testo nel pulsante"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Descrizione</label>
                  <textarea
                    value={editing.descrizione}
                    onChange={(e) => setEditing({ ...editing, descrizione: e.target.value })}
                    rows={2}
                    placeholder="Breve descrizione..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Icona</label>
                  <select
                    value={editing.icona}
                    onChange={(e) => setEditing({ ...editing, icona: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Nessuna</option>
                    <optgroup label="RISE">
                      <option value="equa-rise-GL-color">RISE Gearless</option>
                      <option value="equa-rise-GD-color">RISE Geared</option>
                      <option value="equa-rise-HY-color">RISE Hydraulic</option>
                    </optgroup>
                    <optgroup label="HOME">
                      <option value="equa-home-GL-color">HOME Gearless</option>
                      <option value="equa-home-2GL-color">HOME Double Gearless</option>
                      <option value="equa-home-HY-color">HOME Hydraulic</option>
                    </optgroup>
                  </select>
                  {editing.icona && (
                    <div className="mt-2 flex items-center gap-2">
                      <img src={`/icons/${editing.icona}.svg`} alt="" className="w-8 h-8" />
                      <span className="text-xs text-gray-400">{editing.icona}.svg</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Ordine</label>
                  <input
                    type="number"
                    value={editing.ordine}
                    onChange={(e) => setEditing({ ...editing, ordine: parseInt(e.target.value) || 1 })}
                    min={1}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="attivo"
                    checked={editing.attivo}
                    onChange={(e) => setEditing({ ...editing, attivo: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="attivo" className="text-sm text-gray-600">Attivo</label>
                </div>
              </div>

              {/* Preview JSON */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">Template Data (JSON)</h3>
                <pre className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg overflow-auto max-h-64 font-mono">
                  {JSON.stringify(editing.templateData, null, 2)}
                </pre>
              </div>
            </div>

            {/* Colonna DX - Configurazione campi */}
            <div className="col-span-2">
              <div className="bg-white rounded-xl border border-gray-200">
                {/* Tabs sezioni */}
                <div className="flex border-b border-gray-200">
                  {Object.entries(AVAILABLE_FIELDS).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => setActiveSection(key)}
                      className={`px-5 py-3 text-sm font-medium transition-colors ${
                        activeSection === key
                          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {config.label}
                      {editing.templateData[key as keyof TemplateDataParsed] && Object.keys(editing.templateData[key as keyof TemplateDataParsed] as any || {}).length > 0 && (
                        <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs bg-blue-100 text-blue-600 rounded-full">
                          {Object.keys(editing.templateData[key as keyof TemplateDataParsed] as any || {}).length}
                        </span>
                      )}
                    </button>
                  ))}
                  <button
                    onClick={() => setActiveSection('materiali')}
                    className={`px-5 py-3 text-sm font-medium transition-colors ${
                      activeSection === 'materiali'
                        ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Materiali
                    {editing.templateData.materiali && editing.templateData.materiali.length > 0 && (
                      <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs bg-blue-100 text-blue-600 rounded-full">
                        {editing.templateData.materiali.length}
                      </span>
                    )}
                  </button>
                </div>

                {/* Contenuto sezione */}
                <div className="p-5">
                  {activeSection !== 'materiali' && sectionConfig ? (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-400 mb-4">
                        Seleziona i campi da pre-compilare e imposta i valori predefiniti.
                      </p>
                      {sectionConfig.fields.map((field) => {
                        const isActive = field.key in sectionData;
                        const value = sectionData[field.key];
                        return (
                          <div
                            key={field.key}
                            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                              isActive ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100 bg-gray-50/50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isActive}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const defaultVal = field.type === 'boolean' ? false : field.type === 'number' ? 0 : '';
                                  setField(activeSection, field.key, defaultVal);
                                } else {
                                  removeField(activeSection, field.key);
                                }
                              }}
                              className="rounded border-gray-300"
                            />
                            <label className="text-sm font-medium text-gray-700 w-44 shrink-0">
                              {field.label}
                            </label>
                            {isActive && (
                              <div className="flex-1">
                                {field.type === 'boolean' ? (
                                  <select
                                    value={value ? 'true' : 'false'}
                                    onChange={(e) => setField(activeSection, field.key, e.target.value === 'true')}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="true">Sì</option>
                                    <option value="false">No</option>
                                  </select>
                                ) : field.type === 'select' ? (
                                  <select
                                    value={value || ''}
                                    onChange={(e) => setField(activeSection, field.key, e.target.value)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="">-- Seleziona --</option>
                                    {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                ) : field.type === 'number' ? (
                                  <input
                                    type="number"
                                    value={value ?? ''}
                                    onChange={(e) => setField(activeSection, field.key, parseFloat(e.target.value) || 0)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                ) : (
                                  <input
                                    type="text"
                                    value={value || ''}
                                    onChange={(e) => setField(activeSection, field.key, e.target.value)}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : activeSection === 'materiali' ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-gray-400">
                          Materiali che verranno aggiunti automaticamente.
                        </p>
                        <button
                          onClick={addMateriale}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          Aggiungi Materiale
                        </button>
                      </div>

                      {(!editing.templateData.materiali || editing.templateData.materiali.length === 0) ? (
                        <div className="text-center py-8 text-gray-300 text-sm">
                          Nessun materiale configurato
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* Header */}
                          <div className="grid grid-cols-12 gap-2 px-3 text-xs font-semibold text-gray-500 uppercase">
                            <div className="col-span-3">Codice</div>
                            <div className="col-span-4">Descrizione</div>
                            <div className="col-span-2">Quantità</div>
                            <div className="col-span-2">Prezzo Unit.</div>
                            <div className="col-span-1"></div>
                          </div>
                          {editing.templateData.materiali.map((mat, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-lg p-2">
                              <div className="col-span-3">
                                <input
                                  type="text"
                                  value={mat.codice}
                                  onChange={(e) => updateMateriale(idx, 'codice', e.target.value)}
                                  placeholder="Codice"
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div className="col-span-4">
                                <input
                                  type="text"
                                  value={mat.descrizione}
                                  onChange={(e) => updateMateriale(idx, 'descrizione', e.target.value)}
                                  placeholder="Descrizione"
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div className="col-span-2">
                                <input
                                  type="number"
                                  value={mat.quantita}
                                  onChange={(e) => updateMateriale(idx, 'quantita', parseInt(e.target.value) || 1)}
                                  min={1}
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div className="col-span-2">
                                <input
                                  type="number"
                                  value={mat.prezzo_unitario}
                                  onChange={(e) => updateMateriale(idx, 'prezzo_unitario', parseFloat(e.target.value) || 0)}
                                  step="0.01"
                                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                              <div className="col-span-1 flex justify-center">
                                <button
                                  onClick={() => removeMateriale(idx)}
                                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Rimuovi"
                                >
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER - LISTA TEMPLATES
  // ==========================================
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 rounded-lg">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Gestione Template</h1>
              <p className="text-sm text-gray-500">Configura i template per categorie prodotto</p>
            </div>
          </div>
          <button
            onClick={() => setEditing({ ...emptyTemplate })}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Nuovo Template
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(({ categoria, templates: catTemplates }) => (
              <div key={categoria}>
                <div className="flex items-center gap-2 mb-4">
                  <div className={`w-2 h-6 rounded-full ${categoria === 'RISE' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                  <h2 className="text-lg font-bold text-gray-800">{categoria}</h2>
                  <span className="text-sm text-gray-400 ml-2">{catTemplates.length} template</span>
                </div>

                {catTemplates.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center">
                    <p className="text-sm text-gray-400">Nessun template per {categoria}</p>
                    <button
                      onClick={() => setEditing({ ...emptyTemplate, categoria })}
                      className="mt-2 text-sm text-blue-500 hover:text-blue-600"
                    >
                      Crea il primo template
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {catTemplates.map((t) => {
                      let fieldCount = 0;
                      let matCount = 0;
                      if (t.template_data) {
                        try {
                          const parsed = JSON.parse(t.template_data);
                          for (const [key, val] of Object.entries(parsed)) {
                            if (key === 'materiali' && Array.isArray(val)) {
                              matCount = val.length;
                            } else if (val && typeof val === 'object') {
                              fieldCount += Object.keys(val).length;
                            }
                          }
                        } catch {}
                      }

                      return (
                        <div
                          key={t.id}
                          className={`bg-white rounded-xl border ${t.attivo ? 'border-gray-200' : 'border-gray-200 opacity-60'} overflow-hidden group`}
                        >
                          <div className="p-5">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <h3 className="font-semibold text-gray-900">{t.nome_display}</h3>
                                <p className="text-xs text-gray-400 mt-0.5">{t.sottocategoria} · Ordine: {t.ordine}</p>
                              </div>
                              {!t.attivo && (
                                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Disattivo</span>
                              )}
                            </div>
                            {t.descrizione && (
                              <p className="text-sm text-gray-500 mb-3 line-clamp-2">{t.descrizione}</p>
                            )}
                            <div className="flex gap-3 text-xs text-gray-400">
                              <span>{fieldCount} campi pre-compilati</span>
                              <span>·</span>
                              <span>{matCount} materiali</span>
                            </div>
                          </div>
                          <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 flex items-center justify-between">
                            <button
                              onClick={() => openEdit(t)}
                              className="text-sm font-medium text-blue-600 hover:text-blue-700"
                            >
                              Modifica
                            </button>
                            {deleteConfirm === t.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-red-500">Conferma?</span>
                                <button
                                  onClick={() => deleteMut.mutate(t.id)}
                                  className="text-xs font-medium text-red-600 hover:text-red-700"
                                >
                                  Sì, elimina
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="text-xs text-gray-400 hover:text-gray-600"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(t.id)}
                                className="text-sm text-red-400 hover:text-red-600"
                              >
                                Elimina
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
