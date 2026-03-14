/**
 * DocumentTemplateEditorPage.tsx — Editor visuale per template documenti
 * 
 * Permette di configurare layout e campi dei documenti DOCX
 * generati per preventivi e ordini tramite drag-and-drop.
 * 
 * Posizionare in: src/pages/DocumentTemplateEditorPage.tsx
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GripVertical, Eye, EyeOff, ChevronUp, ChevronDown, Plus, Save,
  Trash2, FileText, Settings, User, Shield, Table, Calculator,
  MessageSquare, AlignVerticalSpaceAround, Building2, Cog, Loader2,
  Upload, X, Check, Copy, RotateCcw, Download, Palette, Type,
  Image as ImageIcon, ArrowLeft
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ==========================================
// TYPES
// ==========================================

interface AvailableField {
  key: string;
  label: string;
  source?: string;
  default?: string;
  format?: string;
  computed?: boolean;
  editable?: boolean;
}

interface AvailableSection {
  label: string;
  icon: string;
  type: string;
  fields?: AvailableField[];
  columns?: ColumnDef[];
}

interface ColumnDef {
  key: string;
  label: string;
  width_pct: number;
  format?: string;
  enabled?: boolean;
}

interface FieldConfig {
  key: string;
  label: string;
  enabled: boolean;
  value?: string;
}

interface SectionConfig {
  id: string;
  type: string;
  title: string;
  enabled: boolean;
  order: number;
  fields?: FieldConfig[];
  columns?: ColumnDef[];
  show_totals?: boolean;
}

interface StyleConfig {
  font: string;
  font_size: number;
  heading_color: string;
  table_header_bg: string;
  table_header_text: string;
  table_alt_row_bg: string;
}

interface PageConfig {
  size: string;
  orientation: string;
  margins: { top: number; bottom: number; left: number; right: number };
}

interface TemplateConfig {
  page: PageConfig;
  style: StyleConfig;
  sections: SectionConfig[];
}

interface DocumentTemplate {
  id: number;
  nome: string;
  tipo: string;
  descrizione: string;
  attivo: boolean;
  is_default: boolean;
  has_logo: boolean;
  logo_filename?: string;
  logo_base64?: string;
  logo_mime?: string;
  config: TemplateConfig;
  created_at?: string;
}

// ==========================================
// ICON MAP
// ==========================================
const ICON_MAP: Record<string, React.ReactNode> = {
  Building2: <Building2 className="w-4 h-4" />,
  FileText: <FileText className="w-4 h-4" />,
  User: <User className="w-4 h-4" />,
  Settings: <Settings className="w-4 h-4" />,
  Cog: <Cog className="w-4 h-4" />,
  Shield: <Shield className="w-4 h-4" />,
  Table: <Table className="w-4 h-4" />,
  Calculator: <Calculator className="w-4 h-4" />,
  MessageSquare: <MessageSquare className="w-4 h-4" />,
  AlignBottom: <AlignVerticalSpaceAround className="w-4 h-4" />,
};

// ==========================================
// API CALLS
// ==========================================

const fetchAvailableFields = async (): Promise<Record<string, AvailableSection>> => {
  const res = await fetch(`${API_BASE}/document-templates/available-fields`);
  return res.json();
};

const fetchDefaultConfig = async (tipo: string): Promise<TemplateConfig> => {
  const res = await fetch(`${API_BASE}/document-templates/default-config/${tipo}`);
  return res.json();
};

const fetchTemplates = async (tipo?: string): Promise<DocumentTemplate[]> => {
  const url = tipo
    ? `${API_BASE}/document-templates?tipo=${tipo}`
    : `${API_BASE}/document-templates`;
  const res = await fetch(url);
  return res.json();
};

const fetchTemplate = async (id: number): Promise<DocumentTemplate> => {
  const res = await fetch(`${API_BASE}/document-templates/${id}`);
  return res.json();
};

const saveTemplate = async (data: {
  id?: number;
  nome: string;
  tipo: string;
  descrizione: string;
  config: TemplateConfig;
  is_default: boolean;
  logoFile?: File | null;
  removeLogo?: boolean;
}): Promise<any> => {
  const formData = new FormData();
  formData.append('nome', data.nome);
  formData.append('tipo', data.tipo);
  formData.append('descrizione', data.descrizione);
  formData.append('config_json', JSON.stringify(data.config));
  formData.append('is_default', String(data.is_default));

  if (data.removeLogo) {
    formData.append('remove_logo', 'true');
  }
  if (data.logoFile) {
    formData.append('logo', data.logoFile);
  }

  const url = data.id
    ? `${API_BASE}/document-templates/${data.id}`
    : `${API_BASE}/document-templates`;
  const method = data.id ? 'PUT' : 'POST';

  const res = await fetch(url, { method, body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Errore salvataggio');
  }
  return res.json();
};

const deleteTemplate = async (id: number): Promise<void> => {
  const res = await fetch(`${API_BASE}/document-templates/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Errore eliminazione');
};


// ==========================================
// MAIN COMPONENT
// ==========================================

export default function DocumentTemplateEditorPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateNome, setTemplateNome] = useState('Nuovo Template');
  const [templateTipo, setTemplateTipo] = useState<'preventivo' | 'ordine'>('preventivo');
  const [templateDescrizione, setTemplateDescrizione] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [config, setConfig] = useState<TemplateConfig | null>(null);
  const [selectedSectionIdx, setSelectedSectionIdx] = useState<number | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // Queries
  const { data: availableFields } = useQuery({
    queryKey: ['available-fields'],
    queryFn: fetchAvailableFields,
  });

  const { data: templates, refetch: refetchTemplates } = useQuery({
    queryKey: ['document-templates'],
    queryFn: () => fetchTemplates(),
  });

  // Mutations
  const saveMut = useMutation({
    mutationFn: saveTemplate,
    onSuccess: (data) => {
      toast({ title: 'Salvato', description: `Template "${templateNome}" salvato` });
      setIsDirty(false);
      refetchTemplates();
      if (data.id && !selectedTemplateId) setSelectedTemplateId(data.id);
    },
    onError: (e: any) => {
      toast({ title: 'Errore', description: e.message, variant: 'destructive' });
    }
  });

  const deleteMut = useMutation({
    mutationFn: deleteTemplate,
    onSuccess: () => {
      toast({ title: 'Eliminato' });
      handleNew();
      refetchTemplates();
    }
  });

  // ── Load default config on mount ──
  useEffect(() => {
    if (!config) {
      fetchDefaultConfig('preventivo').then(setConfig);
    }
  }, []);

  // ── Load template ──
  const handleLoadTemplate = async (id: number) => {
    try {
      const tmpl = await fetchTemplate(id);
      setSelectedTemplateId(tmpl.id);
      setTemplateNome(tmpl.nome);
      setTemplateTipo(tmpl.tipo as 'preventivo' | 'ordine');
      setTemplateDescrizione(tmpl.descrizione || '');
      setIsDefault(tmpl.is_default);
      setConfig(tmpl.config);
      setSelectedSectionIdx(null);
      setIsDirty(false);
      setLogoFile(null);
      setRemoveLogo(false);
      if (tmpl.logo_base64) {
        setLogoPreview(`data:${tmpl.logo_mime || 'image/png'};base64,${tmpl.logo_base64}`);
      } else {
        setLogoPreview(null);
      }
    } catch {
      toast({ title: 'Errore caricamento template', variant: 'destructive' });
    }
  };

  // ── New ──
  const handleNew = async () => {
    setSelectedTemplateId(null);
    setTemplateNome('Nuovo Template');
    setTemplateDescrizione('');
    setIsDefault(false);
    setSelectedSectionIdx(null);
    setLogoFile(null);
    setLogoPreview(null);
    setRemoveLogo(false);
    setIsDirty(false);
    const cfg = await fetchDefaultConfig(templateTipo);
    setConfig(cfg);
  };

  // ── Change tipo ──
  const handleTipoChange = async (newTipo: 'preventivo' | 'ordine') => {
    setTemplateTipo(newTipo);
    if (!selectedTemplateId) {
      const cfg = await fetchDefaultConfig(newTipo);
      setConfig(cfg);
    }
  };

  // ── Save ──
  const handleSave = () => {
    if (!config) return;
    saveMut.mutate({
      id: selectedTemplateId || undefined,
      nome: templateNome,
      tipo: templateTipo,
      descrizione: templateDescrizione,
      config,
      is_default: isDefault,
      logoFile,
      removeLogo,
    });
  };

  // ── Config update helpers ──
  const updateConfig = (updater: (c: TemplateConfig) => TemplateConfig) => {
    if (!config) return;
    setConfig(updater(config));
    setIsDirty(true);
  };

  const updateSection = (idx: number, updater: (s: SectionConfig) => SectionConfig) => {
    updateConfig(c => ({
      ...c,
      sections: c.sections.map((s, i) => i === idx ? updater(s) : s)
    }));
  };

  const moveSection = (idx: number, direction: -1 | 1) => {
    if (!config) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= config.sections.length) return;
    updateConfig(c => {
      const secs = [...c.sections];
      [secs[idx], secs[newIdx]] = [secs[newIdx], secs[idx]];
      return { ...c, sections: secs.map((s, i) => ({ ...s, order: i })) };
    });
    setSelectedSectionIdx(newIdx);
  };

  const toggleField = (sectionIdx: number, fieldKey: string) => {
    updateSection(sectionIdx, s => ({
      ...s,
      fields: (s.fields || []).map(f =>
        f.key === fieldKey ? { ...f, enabled: !f.enabled } : f
      )
    }));
  };

  const toggleColumn = (sectionIdx: number, colKey: string) => {
    updateSection(sectionIdx, s => ({
      ...s,
      columns: (s.columns || []).map(c =>
        c.key === colKey ? { ...c, enabled: c.enabled === false ? true : false } : c
      )
    }));
  };

  // ── Drag and drop ──
  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    updateConfig(c => {
      const secs = [...c.sections];
      const [moved] = secs.splice(dragIdx, 1);
      secs.splice(idx, 0, moved);
      setDragIdx(idx);
      return { ...c, sections: secs.map((s, i) => ({ ...s, order: i })) };
    });
  };

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  // ── Logo ──
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      setRemoveLogo(false);
      const reader = new FileReader();
      reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
      setIsDirty(true);
    }
  };

  // ── Render ──
  if (!config || !availableFields) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const selectedSection = selectedSectionIdx !== null ? config.sections[selectedSectionIdx] : null;
  const selectedSectionMeta = selectedSection ? availableFields[selectedSection.id] : null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ═══ TOP BAR ═══ */}
      <header className="bg-white border-b shadow-sm px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-3 flex-1">
          <FileText className="w-6 h-6 text-red-700" />
          <div>
            <input
              value={templateNome}
              onChange={e => { setTemplateNome(e.target.value); setIsDirty(true); }}
              className="text-lg font-bold bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-1 py-0.5 w-64"
              placeholder="Nome template..."
            />
            <div className="flex items-center gap-3 mt-1">
              <select
                value={templateTipo}
                onChange={e => handleTipoChange(e.target.value as 'preventivo' | 'ordine')}
                className="text-xs bg-gray-100 rounded px-2 py-1 border-0"
              >
                <option value="preventivo">Preventivo</option>
                <option value="ordine">Ordine</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={e => { setIsDefault(e.target.checked); setIsDirty(true); }}
                  className="rounded"
                />
                Template predefinito
              </label>
              {isDirty && <span className="text-xs text-amber-600 font-medium">● Non salvato</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Template selector */}
          <select
            value={selectedTemplateId || ''}
            onChange={e => {
              const v = e.target.value;
              if (v) handleLoadTemplate(Number(v));
              else handleNew();
            }}
            className="text-sm border rounded-lg px-3 py-2 bg-white min-w-48"
          >
            <option value="">+ Nuovo template</option>
            {templates?.map(t => (
              <option key={t.id} value={t.id}>
                {t.nome} ({t.tipo}) {t.is_default ? '★' : ''}
              </option>
            ))}
          </select>

          <button
            onClick={() => setShowStylePanel(!showStylePanel)}
            className={`p-2 rounded-lg border transition-colors ${
              showStylePanel ? 'bg-blue-50 border-blue-300 text-blue-700' : 'hover:bg-gray-100'
            }`}
            title="Stile documento"
          >
            <Palette className="w-5 h-5" />
          </button>

          {selectedTemplateId && (
            <button
              onClick={() => {
                if (confirm('Eliminare questo template?')) deleteMut.mutate(selectedTemplateId);
              }}
              className="p-2 rounded-lg border hover:bg-red-50 text-red-600"
              title="Elimina template"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saveMut.isPending || !isDirty}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salva
          </button>
        </div>
      </header>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Document sections ── */}
        <div className="w-80 bg-white border-r overflow-y-auto">
          <div className="p-3 border-b bg-gray-50">
            <h3 className="font-semibold text-sm text-gray-700">Sezioni Documento</h3>
            <p className="text-xs text-gray-500 mt-0.5">Trascina per riordinare, clicca per modificare</p>
          </div>

          <div className="p-2 space-y-1">
            {config.sections.map((sec, idx) => {
              const meta = availableFields[sec.id];
              const icon = meta ? ICON_MAP[meta.icon] || <FileText className="w-4 h-4" /> : <FileText className="w-4 h-4" />;
              const isSelected = selectedSectionIdx === idx;
              const enabledCount = (sec.fields || []).filter(f => f.enabled).length;
              const totalCount = (sec.fields || []).length;

              return (
                <div
                  key={sec.id + '-' + idx}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setSelectedSectionIdx(idx)}
                  className={`
                    flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all
                    ${isSelected
                      ? 'bg-blue-50 border border-blue-200 shadow-sm'
                      : 'hover:bg-gray-50 border border-transparent'
                    }
                    ${!sec.enabled ? 'opacity-50' : ''}
                    ${dragIdx === idx ? 'opacity-30' : ''}
                  `}
                >
                  <GripVertical className="w-4 h-4 text-gray-400 cursor-grab flex-shrink-0" />
                  <span className={`flex-shrink-0 ${isSelected ? 'text-blue-600' : 'text-gray-500'}`}>
                    {icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{sec.title}</div>
                    {totalCount > 0 && (
                      <div className="text-xs text-gray-400">{enabledCount}/{totalCount} campi</div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateSection(idx, s => ({ ...s, enabled: !s.enabled }));
                    }}
                    className="flex-shrink-0 p-1 rounded hover:bg-gray-200 transition-colors"
                    title={sec.enabled ? 'Nascondi sezione' : 'Mostra sezione'}
                  >
                    {sec.enabled
                      ? <Eye className="w-3.5 h-3.5 text-green-600" />
                      : <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                    }
                  </button>
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveSection(idx, -1); }}
                      disabled={idx === 0}
                      className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveSection(idx, 1); }}
                      disabled={idx === config.sections.length - 1}
                      className="p-0.5 rounded hover:bg-gray-200 disabled:opacity-30"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Logo section */}
          <div className="p-3 border-t mt-2">
            <h4 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
              <ImageIcon className="w-4 h-4" /> Logo
            </h4>
            {logoPreview && !removeLogo ? (
              <div className="relative inline-block">
                <img src={logoPreview} alt="Logo" className="max-h-16 rounded border" />
                <button
                  onClick={() => { setRemoveLogo(true); setLogoPreview(null); setLogoFile(null); setIsDirty(true); }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                <Upload className="w-4 h-4 mx-auto mb-1" />
                Carica logo
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* ── CENTER: Preview ── */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-100">
          <div className="max-w-[21cm] mx-auto bg-white shadow-lg rounded-sm border"
               style={{ minHeight: '29.7cm', padding: `${config.page.margins.top}cm ${config.page.margins.right}cm ${config.page.margins.bottom}cm ${config.page.margins.left}cm` }}>

            {config.sections.filter(s => s.enabled).sort((a, b) => a.order - b.order).map((sec, idx) => {
              const actualIdx = config.sections.findIndex(s => s.id === sec.id && s.order === sec.order);
              const isSelected = selectedSectionIdx === actualIdx;

              return (
                <div
                  key={sec.id + '-preview-' + sec.order}
                  onClick={() => setSelectedSectionIdx(actualIdx)}
                  className={`
                    relative mb-4 rounded transition-all cursor-pointer
                    ${isSelected ? 'ring-2 ring-blue-400 ring-offset-2' : 'hover:ring-1 hover:ring-gray-300 hover:ring-offset-1'}
                  `}
                >
                  {/* Section type badge */}
                  {isSelected && (
                    <div className="absolute -top-3 left-2 bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full z-10">
                      {sec.title}
                    </div>
                  )}

                  {/* Render preview based on type */}
                  {sec.type === 'header' && (
                    <div className="text-center py-2">
                      {logoPreview && !removeLogo && (
                        <img src={logoPreview} alt="Logo" className="max-h-12 mx-auto mb-2" />
                      )}
                      {sec.fields?.find(f => f.key === 'company_name' && f.enabled) && (
                        <h1 style={{
                          color: config.style.heading_color,
                          fontFamily: config.style.font,
                          fontSize: '18px',
                          fontWeight: 'bold'
                        }}>
                          {sec.fields.find(f => f.key === 'company_name')?.value
                            || availableFields.intestazione?.fields?.find((f: any) => f.key === 'company_name')?.default
                            || 'Nome Azienda'}
                        </h1>
                      )}
                      <p className="text-xs text-gray-500 mt-1" style={{ fontFamily: config.style.font }}>
                        {['company_address', 'company_phone', 'company_email'].filter(k =>
                          sec.fields?.find(f => f.key === k && f.enabled)
                        ).map(k => {
                          const f = sec.fields?.find(ff => ff.key === k);
                          return f?.value || availableFields.intestazione?.fields?.find((af: any) => af.key === k)?.default || '';
                        }).filter(Boolean).join(' — ')}
                      </p>
                    </div>
                  )}

                  {sec.type === 'key_value' && (
                    <div>
                      <h2 className="font-bold text-sm mb-2" style={{ color: config.style.heading_color, fontFamily: config.style.font }}>
                        {sec.title}
                      </h2>
                      <div className="border rounded text-xs" style={{ fontFamily: config.style.font }}>
                        {(sec.fields || []).filter(f => f.enabled).map((f, fi) => (
                          <div key={f.key} className={`flex ${fi > 0 ? 'border-t' : ''}`}>
                            <div className="w-1/3 px-2 py-1 bg-gray-50 font-medium border-r">{f.label}</div>
                            <div className="w-2/3 px-2 py-1 text-gray-400 italic">{'{{' + f.key + '}}'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {sec.type === 'normative_list' && (
                    <div>
                      <h2 className="font-bold text-sm mb-2" style={{ color: config.style.heading_color, fontFamily: config.style.font }}>
                        {sec.title}
                      </h2>
                      <p className="text-xs text-gray-400 italic" style={{ fontFamily: config.style.font }}>
                        {(sec.fields || []).filter(f => f.enabled).map(f => f.label).join(', ')}
                      </p>
                    </div>
                  )}

                  {sec.type === 'materials_table' && (
                    <div>
                      <h2 className="font-bold text-sm mb-2" style={{ color: config.style.heading_color, fontFamily: config.style.font }}>
                        {sec.title}
                      </h2>
                      <table className="w-full text-xs border-collapse" style={{ fontFamily: config.style.font }}>
                        <thead>
                          <tr>
                            {(sec.columns || []).filter(c => c.enabled !== false).map(col => (
                              <th key={col.key}
                                  className="px-2 py-1.5 text-left text-white text-[10px] font-medium"
                                  style={{
                                    backgroundColor: config.style.table_header_bg,
                                    width: `${col.width_pct}%`
                                  }}>
                                {col.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[1, 2, 3].map(r => (
                            <tr key={r} className="border-b">
                              {(sec.columns || []).filter(c => c.enabled !== false).map(col => (
                                <td key={col.key} className="px-2 py-1 text-gray-300 text-[10px]">
                                  {col.format === 'euro' ? '€ 0,00' : '...'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                        {sec.show_totals && (
                          <tfoot>
                            <tr className="font-bold">
                              <td colSpan={(sec.columns || []).filter(c => c.enabled !== false).length - 1}
                                  className="px-2 py-1 text-right text-[10px]">TOTALE</td>
                              <td className="px-2 py-1 text-[10px]">€ 0,00</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}

                  {sec.type === 'price_summary' && (
                    <div>
                      <h2 className="font-bold text-sm mb-2" style={{ color: config.style.heading_color, fontFamily: config.style.font }}>
                        {sec.title}
                      </h2>
                      <div className="border rounded text-xs w-64" style={{ fontFamily: config.style.font }}>
                        {(sec.fields || []).filter(f => f.enabled).map((f, fi) => {
                          const isBold = ['totale_netto', 'totale_lordo'].includes(f.key);
                          return (
                            <div key={f.key} className={`flex ${fi > 0 ? 'border-t' : ''} ${isBold ? 'font-bold text-sm' : ''}`}>
                              <div className="w-1/2 px-2 py-1 bg-gray-50 border-r">{f.label}</div>
                              <div className="w-1/2 px-2 py-1 text-gray-400 italic text-right">€ 0,00</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {sec.type === 'text_block' && (
                    <div>
                      <h2 className="font-bold text-sm mb-2" style={{ color: config.style.heading_color, fontFamily: config.style.font }}>
                        {sec.title}
                      </h2>
                      {(sec.fields || []).filter(f => f.enabled).map(f => (
                        <p key={f.key} className="text-xs text-gray-400 italic mb-1" style={{ fontFamily: config.style.font }}>
                          <span className="font-medium text-gray-600">{f.label}:</span> {'{{testo}}'}
                        </p>
                      ))}
                    </div>
                  )}

                  {sec.type === 'footer' && (
                    <div className="text-center pt-4 border-t mt-4">
                      <p className="text-[10px] text-gray-400" style={{ fontFamily: config.style.font }}>
                        {(sec.fields || []).filter(f => f.enabled).map(f => {
                          if (f.key === 'data_generazione') return 'Documento generato il DD/MM/YYYY HH:MM';
                          if (f.key === 'numero_pagina') return 'Pagina X';
                          if (f.key === 'testo_libero_footer') return f.value || 'Testo personalizzato';
                          return '';
                        }).filter(Boolean).join(' — ')}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Properties panel ── */}
        <div className="w-80 bg-white border-l overflow-y-auto">
          {showStylePanel ? (
            /* ── Style panel ── */
            <div>
              <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
                <h3 className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                  <Palette className="w-4 h-4" /> Stile Documento
                </h3>
                <button onClick={() => setShowStylePanel(false)} className="p-1 hover:bg-gray-200 rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Font</label>
                  <select
                    value={config.style.font}
                    onChange={e => updateConfig(c => ({ ...c, style: { ...c.style, font: e.target.value } }))}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    {['Arial', 'Calibri', 'Times New Roman', 'Helvetica', 'Verdana', 'Georgia', 'Tahoma'].map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Dimensione font (pt)</label>
                  <input
                    type="number"
                    value={config.style.font_size}
                    onChange={e => updateConfig(c => ({ ...c, style: { ...c.style, font_size: Number(e.target.value) } }))}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    min={8} max={16}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Colore titoli</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={config.style.heading_color}
                      onChange={e => updateConfig(c => ({ ...c, style: { ...c.style, heading_color: e.target.value } }))}
                      className="w-8 h-8 rounded border cursor-pointer"
                    />
                    <input
                      value={config.style.heading_color}
                      onChange={e => updateConfig(c => ({ ...c, style: { ...c.style, heading_color: e.target.value } }))}
                      className="flex-1 border rounded px-2 py-1 text-sm font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Header tabella (sfondo)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={config.style.table_header_bg}
                      onChange={e => updateConfig(c => ({ ...c, style: { ...c.style, table_header_bg: e.target.value } }))}
                      className="w-8 h-8 rounded border cursor-pointer"
                    />
                    <input
                      value={config.style.table_header_bg}
                      onChange={e => updateConfig(c => ({ ...c, style: { ...c.style, table_header_bg: e.target.value } }))}
                      className="flex-1 border rounded px-2 py-1 text-sm font-mono"
                    />
                  </div>
                </div>

                <h4 className="font-medium text-sm text-gray-700 pt-2 border-t">Margini pagina (cm)</h4>
                <div className="grid grid-cols-2 gap-2">
                  {(['top', 'bottom', 'left', 'right'] as const).map(side => (
                    <div key={side}>
                      <label className="text-xs text-gray-500 capitalize">{
                        side === 'top' ? 'Sopra' : side === 'bottom' ? 'Sotto' : side === 'left' ? 'Sinistra' : 'Destra'
                      }</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="5"
                        value={config.page.margins[side]}
                        onChange={e => updateConfig(c => ({
                          ...c,
                          page: { ...c.page, margins: { ...c.page.margins, [side]: Number(e.target.value) } }
                        }))}
                        className="w-full border rounded px-2 py-1 text-sm"
                      />
                    </div>
                  ))}
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Descrizione template</label>
                  <textarea
                    value={templateDescrizione}
                    onChange={e => { setTemplateDescrizione(e.target.value); setIsDirty(true); }}
                    className="w-full border rounded px-2 py-1.5 text-sm h-20 resize-none"
                    placeholder="Descrizione opzionale..."
                  />
                </div>
              </div>
            </div>
          ) : selectedSection ? (
            /* ── Section properties ── */
            <div>
              <div className="p-3 border-b bg-gray-50">
                <div className="flex items-center gap-2">
                  {ICON_MAP[selectedSectionMeta?.icon || 'FileText']}
                  <h3 className="font-semibold text-sm text-gray-700">{selectedSection.title}</h3>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tipo: {selectedSection.type}
                </p>
              </div>

              <div className="p-4 space-y-4">
                {/* Section title edit */}
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Titolo sezione</label>
                  <input
                    value={selectedSection.title}
                    onChange={e => updateSection(selectedSectionIdx!, s => ({ ...s, title: e.target.value }))}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>

                {/* Enable/disable */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedSection.enabled}
                    onChange={() => updateSection(selectedSectionIdx!, s => ({ ...s, enabled: !s.enabled }))}
                    className="rounded"
                  />
                  <span className="text-sm">Sezione visibile nel documento</span>
                </label>

                {/* Fields list */}
                {selectedSection.fields && selectedSection.fields.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm text-gray-700 mb-2">Campi</h4>
                    <div className="space-y-1 max-h-96 overflow-y-auto">
                      {selectedSection.fields.map(f => (
                        <label
                          key={f.key}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={f.enabled}
                            onChange={() => toggleField(selectedSectionIdx!, f.key)}
                            className="rounded"
                          />
                          <span className="text-sm flex-1">{f.label}</span>
                          <code className="text-[10px] text-gray-400 bg-gray-100 px-1 rounded">{f.key}</code>
                        </label>
                      ))}
                    </div>

                    <div className="flex gap-2 mt-3 pt-2 border-t">
                      <button
                        onClick={() => updateSection(selectedSectionIdx!, s => ({
                          ...s,
                          fields: (s.fields || []).map(f => ({ ...f, enabled: true }))
                        }))}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Seleziona tutti
                      </button>
                      <button
                        onClick={() => updateSection(selectedSectionIdx!, s => ({
                          ...s,
                          fields: (s.fields || []).map(f => ({ ...f, enabled: false }))
                        }))}
                        className="text-xs text-gray-500 hover:underline"
                      >
                        Deseleziona tutti
                      </button>
                    </div>
                  </div>
                )}

                {/* Columns (for materials table) */}
                {selectedSection.columns && selectedSection.columns.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm text-gray-700 mb-2">Colonne tabella</h4>
                    <div className="space-y-1">
                      {selectedSection.columns.map(col => (
                        <label
                          key={col.key}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={col.enabled !== false}
                            onChange={() => toggleColumn(selectedSectionIdx!, col.key)}
                            className="rounded"
                          />
                          <span className="text-sm flex-1">{col.label}</span>
                          <span className="text-[10px] text-gray-400">{col.width_pct}%</span>
                        </label>
                      ))}
                    </div>

                    <label className="flex items-center gap-2 mt-3 pt-2 border-t cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedSection.show_totals !== false}
                        onChange={() => updateSection(selectedSectionIdx!, s => ({
                          ...s,
                          show_totals: !s.show_totals
                        }))}
                        className="rounded"
                      />
                      <span className="text-sm">Mostra riga totale</span>
                    </label>
                  </div>
                )}

                {/* Header fields with custom values */}
                {selectedSection.type === 'header' && selectedSection.fields && (
                  <div>
                    <h4 className="font-medium text-sm text-gray-700 mb-2">Valori personalizzati</h4>
                    {selectedSection.fields.filter(f => f.enabled).map(f => {
                      const af = availableFields.intestazione?.fields?.find((a: any) => a.key === f.key);
                      return (
                        <div key={f.key} className="mb-2">
                          <label className="text-xs text-gray-600">{f.label}</label>
                          <input
                            value={f.value || ''}
                            onChange={e => updateSection(selectedSectionIdx!, s => ({
                              ...s,
                              fields: (s.fields || []).map(ff =>
                                ff.key === f.key ? { ...ff, value: e.target.value } : ff
                              )
                            }))}
                            placeholder={af?.default || ''}
                            className="w-full border rounded px-2 py-1 text-sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Footer custom text */}
                {selectedSection.type === 'footer' && (
                  <div>
                    {selectedSection.fields?.find(f => f.key === 'testo_libero_footer' && f.enabled) && (
                      <div>
                        <label className="text-xs font-medium text-gray-600 block mb-1">Testo personalizzato</label>
                        <input
                          value={selectedSection.fields.find(f => f.key === 'testo_libero_footer')?.value || ''}
                          onChange={e => updateSection(selectedSectionIdx!, s => ({
                            ...s,
                            fields: (s.fields || []).map(f =>
                              f.key === 'testo_libero_footer' ? { ...f, value: e.target.value } : f
                            )
                          }))}
                          placeholder="Es: Condizioni di vendita su www...."
                          className="w-full border rounded px-2 py-1.5 text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── No selection ── */
            <div className="p-6 text-center text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Seleziona una sezione per modificarne le proprietà</p>
              <p className="text-xs mt-2">Oppure clicca <Palette className="w-3 h-3 inline" /> per le impostazioni di stile</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
