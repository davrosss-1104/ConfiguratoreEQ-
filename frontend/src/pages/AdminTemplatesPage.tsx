import { useState, useEffect } from 'react';
import TemplateFieldConfigPanel from './TemplateFieldConfigPanel';
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

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ==========================================
// COSTANTI
// ==========================================
const CATEGORIES = ['RISE', 'HOME'] as const;

// Fallback se API sezioni non risponde
const FALLBACK_SECTIONS = [
  { codice: 'dati_principali', etichetta: 'Dati Principali' },
  { codice: 'normative', etichetta: 'Normative' },
  { codice: 'porte', etichetta: 'Porte' },
];

// ==========================================
// INTERFACCE
// ==========================================
interface SezioneAPI {
  id: number;
  codice: string;
  etichetta: string;
  ordine: number;
  attivo: boolean;
}

interface CampoDB {
  id: number;
  codice: string;
  label: string;
  tipo: string;        // testo, numero, booleano, dropdown, data
  sezione: string;
  gruppo_opzioni?: string;
  ordine: number;
  attivo: boolean;
  obbligatorio: boolean;
  unita_misura?: string;
  valore_min?: number;
  valore_max?: number;
  valore_default?: string;
  descrizione?: string;
  visibile_form: boolean;
  usabile_regole: boolean;
}

interface OpzioneDB {
  id: number;
  valore: string;
  label: string;
  ordine: number;
}

interface TemplateDataParsed {
  [key: string]: any;
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
  const [activeSection, setActiveSection] = useState<string>('');

  // ---- Sezioni e campi dinamici ----
  const [sezioni, setSezioni] = useState<SezioneAPI[]>([]);
  const [campiPerSezione, setCampiPerSezione] = useState<Record<string, CampoDB[]>>({});
  const [opzioniPerGruppo, setOpzioniPerGruppo] = useState<Record<string, OpzioneDB[]>>({});
  const [loadingCampi, setLoadingCampi] = useState(false);

  // Carica sezioni all'avvio
  useEffect(() => {
    fetch(`${API_BASE}/sezioni-configuratore`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          const attive = data.filter((s: SezioneAPI) => s.attivo);
          setSezioni(attive);
          if (attive.length > 0 && !activeSection) {
            setActiveSection(attive[0].codice);
          }
        } else {
          setSezioni(FALLBACK_SECTIONS.map((s, i) => ({ id: i, codice: s.codice, etichetta: s.etichetta, ordine: i, attivo: true })));
          if (!activeSection) setActiveSection(FALLBACK_SECTIONS[0].codice);
        }
      })
      .catch(() => {
        setSezioni(FALLBACK_SECTIONS.map((s, i) => ({ id: i, codice: s.codice, etichetta: s.etichetta, ordine: i, attivo: true })));
        if (!activeSection) setActiveSection(FALLBACK_SECTIONS[0].codice);
      });
  }, []);

  // Carica campi quando cambia la sezione attiva
  useEffect(() => {
    if (!activeSection || activeSection === 'materiali') return;
    // Se gia' caricati, skip
    if (campiPerSezione[activeSection]) return;

    setLoadingCampi(true);
    fetch(`${API_BASE}/campi-configuratore/${activeSection}?solo_attivi=true`)
      .then(res => res.ok ? res.json() : [])
      .then(async (campi: CampoDB[]) => {
        setCampiPerSezione(prev => ({ ...prev, [activeSection]: campi }));

        // Carica opzioni per i campi dropdown
        const gruppi = [...new Set(campi.filter(c => c.tipo === 'dropdown' && c.gruppo_opzioni).map(c => c.gruppo_opzioni!))];
        const nuoveOpzioni: Record<string, OpzioneDB[]> = {};
        
        await Promise.all(gruppi.map(async (gruppo) => {
          if (opzioniPerGruppo[gruppo]) return; // gia' caricato
          try {
            const res = await fetch(`${API_BASE}/opzioni-dropdown/${gruppo}`);
            if (res.ok) nuoveOpzioni[gruppo] = await res.json();
          } catch {}
        }));

        if (Object.keys(nuoveOpzioni).length > 0) {
          setOpzioniPerGruppo(prev => ({ ...prev, ...nuoveOpzioni }));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingCampi(false));
  }, [activeSection]);

  // Query templates
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
          ...(editing.templateData[section] as Record<string, any> || {}),
          [key]: value,
        },
      },
    });
  };

  const removeField = (section: string, key: string) => {
    if (!editing) return;
    const sectionData = { ...(editing.templateData[section] as Record<string, any> || {}) };
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

  // Tab sezioni: filtra via "materiali" e sezioni non utili per template default
  const sezioniTab = sezioni.filter(s => s.codice !== 'materiali' && s.codice !== 'dati_commessa');

  // Campi della sezione attiva
  const campiSezioneAttiva = campiPerSezione[activeSection] || [];

  // ==========================================
  // RENDER CAMPO DINAMICO (per template defaults)
  // ==========================================
  const renderCampoTemplate = (campo: CampoDB) => {
    const sectionData = (editing?.templateData[activeSection] as Record<string, any>) || {};
    const isActive = campo.codice in sectionData;
    const value = sectionData[campo.codice];

    return (
      <div
        key={campo.codice}
        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
          isActive ? 'border-blue-200 bg-blue-50/30' : 'border-gray-100 bg-gray-50/50'
        }`}
      >
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => {
            if (e.target.checked) {
              let defaultVal: any = '';
              if (campo.tipo === 'booleano') defaultVal = false;
              else if (campo.tipo === 'numero') defaultVal = campo.valore_default ? parseFloat(campo.valore_default) : 0;
              else if (campo.valore_default) defaultVal = campo.valore_default;
              setField(activeSection, campo.codice, defaultVal);
            } else {
              removeField(activeSection, campo.codice);
            }
          }}
          className="rounded border-gray-300"
        />
        <label className="text-sm font-medium text-gray-700 w-44 shrink-0">
          {campo.label}
          {campo.unita_misura && <span className="text-gray-400 ml-1">({campo.unita_misura})</span>}
        </label>
        {isActive && (
          <div className="flex-1">
            {campo.tipo === 'booleano' ? (
              <select
                value={value ? 'true' : 'false'}
                onChange={(e) => setField(activeSection, campo.codice, e.target.value === 'true')}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="true">Si</option>
                <option value="false">No</option>
              </select>
            ) : campo.tipo === 'dropdown' && campo.gruppo_opzioni ? (
              <select
                value={value || ''}
                onChange={(e) => setField(activeSection, campo.codice, e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Seleziona --</option>
                {(opzioniPerGruppo[campo.gruppo_opzioni] || []).map(opt => (
                  <option key={opt.valore} value={opt.valore}>{opt.label}</option>
                ))}
              </select>
            ) : campo.tipo === 'numero' ? (
              <input
                type="number"
                value={value ?? ''}
                onChange={(e) => setField(activeSection, campo.codice, parseFloat(e.target.value) || 0)}
                min={campo.valore_min}
                max={campo.valore_max}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            ) : (
              <input
                type="text"
                value={value || ''}
                onChange={(e) => setField(activeSection, campo.codice, e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          </div>
        )}
      </div>
    );
  };

  // ==========================================
  // RENDER - FORM EDITING
  // ==========================================
  if (editing) {
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
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
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

            {/* Colonna DX - Configurazione campi (DINAMICA) */}
            <div className="col-span-2">
              <div className="bg-white rounded-xl border border-gray-200">
                {/* Tabs sezioni - DINAMICHE da DB */}
                <div className="flex border-b border-gray-200 overflow-x-auto">
                  {sezioniTab.map((sez) => {
                    const sectionData = editing.templateData[sez.codice];
                    const count = sectionData && typeof sectionData === 'object' && !Array.isArray(sectionData) 
                      ? Object.keys(sectionData).length : 0;
                    return (
                      <button
                        key={sez.codice}
                        onClick={() => setActiveSection(sez.codice)}
                        className={`px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                          activeSection === sez.codice
                            ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {sez.etichetta}
                        {count > 0 && (
                          <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs bg-blue-100 text-blue-600 rounded-full">
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                  {/* Tab Materiali (sempre presente) */}
                  <button
                    onClick={() => setActiveSection('materiali')}
                    className={`px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
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
                  {/* Tab Config Preventivo (solo per template esistenti) */}
                  {editing.id && (
                    <button
                      onClick={() => setActiveSection('_field_config')}
                      className={`px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                        activeSection === '_field_config'
                          ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50/50'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      ⚙ Config Preventivo
                    </button>
                  )}
                </div>
                <div className="p-5">
                  {activeSection === '_field_config' && editing.id ? (
                    <TemplateFieldConfigPanel templateId={editing.id} />
                  ) : activeSection !== 'materiali' ? (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-400 mb-4">
                        Seleziona i campi da pre-compilare e imposta i valori predefiniti.
                      </p>
                      {loadingCampi ? (
                        <div className="text-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
                          <p className="text-sm text-gray-400 mt-2">Caricamento campi...</p>
                        </div>
                      ) : campiSezioneAttiva.length === 0 ? (
                        <div className="text-center py-8 text-gray-300 text-sm">
                          Nessun campo configurato per questa sezione.
                          <br />
                          <span className="text-xs">Vai in Gestione Campi per aggiungerne.</span>
                        </div>
                      ) : (
                        campiSezioneAttiva.map(renderCampoTemplate)
                      )}
                    </div>
                  ) : (
                    /* ---- TAB MATERIALI (invariato) ---- */
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
                          <div className="grid grid-cols-12 gap-2 px-3 text-xs font-semibold text-gray-500 uppercase">
                            <div className="col-span-3">Codice</div>
                            <div className="col-span-4">Descrizione</div>
                            <div className="col-span-2">Quantita</div>
                            <div className="col-span-2">Prezzo Unit.</div>
                            <div className="col-span-1"></div>
                          </div>
                          {editing.templateData.materiali.map((mat: any, idx: number) => (
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
                  )}
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
                                <p className="text-xs text-gray-400 mt-0.5">{t.sottocategoria} - Ordine: {t.ordine}</p>
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
                              <span>-</span>
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
                                  Si, elimina
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
