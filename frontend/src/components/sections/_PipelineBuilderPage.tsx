/**
 * PipelineBuilderPage.tsx
 * Visual Pipeline Builder per calcoli multi-step nel rule engine.
 * Interfaccia a card verticali collegate per costruire pipeline di calcolo.
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Download,
  Calculator,
  Search,
  Package,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Play,
  Save,
  Copy,
  ArrowDown,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Eye,
  X,
} from 'lucide-react';

const API = 'http://localhost:8000';

// ======================================================
// TYPES
// ======================================================
interface PipelineStep {
  id: string;
  action: 'collect_sum' | 'math_expr' | 'catalog_select' | 'lookup_each' | 'group_sum' | 'multi_match' | 'add_material';
  // collect_sum
  sources?: Source[];
  output?: string;
  // math_expr
  expression?: string;
  round?: string;
  // catalog_select
  tabella?: string;
  criterio?: { colonna: string; operatore: string; valore: string };
  filtri?: { colonna: string; operatore: string; valore: string }[];
  ordinamento?: { colonna: string; direzione: string };
  limit?: number;
  output_prefix?: string;
  // lookup_each
  sezione?: string;
  campo_lookup?: string;
  // group_sum
  pattern_value?: string;
  pattern_group?: string;
  power_factor?: string;
  // multi_match
  requisiti_prefix?: string;
  colonna_codice?: string;
  colonna_tensione?: string;
  colonna_va?: string;
  colonna_ordinamento?: string;
  // add_material
  material?: {
    codice: string;
    descrizione: string;
    quantita: string | number;
    categoria: string;
  };
}

interface Source {
  type: 'calc' | 'materials' | 'context';
  pattern?: string;
  field?: string;
  filter?: Record<string, string>;
}

interface PipelineRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  phase: number;
  conditions: any[];
  pipeline_steps: PipelineStep[];
}

interface DataTable {
  nome: string;
  tipo: string;
  colonne?: string[];
  records_count?: number;
}

interface SimulationResult {
  steps: { step: number; action: string; status: string; output?: Record<string, any>; error?: string }[];
  final_context_calc: Record<string, any>;
  warnings: string[];
  errors: string[];
}

// ======================================================
// TEMPLATES PREDEFINITI
// ======================================================
const TEMPLATES: { id: string; name: string; desc: string; icon: React.ReactNode; steps: PipelineStep[] }[] = [
  {
    id: 'trasformatore',
    name: 'Selezione Trasformatore da utilizzatori',
    desc: 'Lookup componenti → raggruppa per tensione → match multi-criterio su catalogo',
    icon: <Sparkles className="h-5 w-5" />,
    steps: [
      {
        id: 's1',
        action: 'lookup_each',
        sezione: 'selezione_trasformatore',
        tabella: 'utilizzatori_trasformatore',
        campo_lookup: 'componente',
        output_prefix: '_calc.util.',
      },
      {
        id: 's2',
        action: 'group_sum',
        pattern_value: '_calc.util.*.watt',
        pattern_group: '_calc.util.*.tensione_uscita',
        output_prefix: '_calc.va_per_tensione.',
        power_factor: 'selezione_trasformatore.power_factor',
      },
      {
        id: 's3',
        action: 'multi_match',
        tabella: 'catalogo_trasformatori_flat',
        requisiti_prefix: '_calc.va_per_tensione.',
        colonna_codice: 'codice_trasf',
        colonna_tensione: 'tensione_uscita',
        colonna_va: 'va_disponibili',
        colonna_ordinamento: 'potenza_totale_va',
        output_prefix: '_calc.trasformatore.',
      },
      {
        id: 's4',
        action: 'add_material',
        material: {
          codice: '_calc.trasformatore.codice_trasf',
          descrizione: 'Trasformatore auto-selezionato',
          quantita: 1,
          categoria: 'Trasformatore',
        },
      },
    ],
  },
  {
    id: 'interruttore',
    name: 'Somma Correnti → Seleziona Interruttore',
    desc: 'Somma correnti nominali, seleziona interruttore adeguato',
    icon: <Sparkles className="h-5 w-5" />,
    steps: [
      {
        id: 's1',
        action: 'collect_sum',
        sources: [{ type: 'calc', pattern: '_calc.*.corrente_nom' }],
        output: '_calc.pipeline.totale_corrente',
      },
      {
        id: 's2',
        action: 'math_expr',
        expression: '_calc.pipeline.totale_corrente * 1.25',
        output: '_calc.pipeline.corrente_sicurezza',
        round: 'ceil',
      },
    ],
  },
  {
    id: 'vuoto',
    name: 'Pipeline Vuota',
    desc: 'Inizia da zero con una pipeline personalizzata',
    icon: <Plus className="h-5 w-5" />,
    steps: [],
  },
];

// ======================================================
// STEP CONFIGS
// ======================================================
const STEP_META: Record<string, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  lookup_each: {
    label: 'LOOKUP',
    icon: <Search className="h-4 w-4" />,
    color: 'text-cyan-700',
    bgColor: 'bg-cyan-50 border-cyan-200',
  },
  collect_sum: {
    label: 'RACCOGLI',
    icon: <Download className="h-4 w-4" />,
    color: 'text-blue-700',
    bgColor: 'bg-blue-50 border-blue-200',
  },
  group_sum: {
    label: 'RAGGRUPPA',
    icon: <Download className="h-4 w-4" />,
    color: 'text-indigo-700',
    bgColor: 'bg-indigo-50 border-indigo-200',
  },
  math_expr: {
    label: 'CALCOLA',
    icon: <Calculator className="h-4 w-4" />,
    color: 'text-amber-700',
    bgColor: 'bg-amber-50 border-amber-200',
  },
  catalog_select: {
    label: 'SELEZIONA',
    icon: <Search className="h-4 w-4" />,
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50 border-emerald-200',
  },
  multi_match: {
    label: 'MULTI-MATCH',
    icon: <Search className="h-4 w-4" />,
    color: 'text-teal-700',
    bgColor: 'bg-teal-50 border-teal-200',
  },
  add_material: {
    label: 'MATERIALE',
    icon: <Package className="h-4 w-4" />,
    color: 'text-purple-700',
    bgColor: 'bg-purple-50 border-purple-200',
  },
};

const ROUND_OPTIONS = [
  { value: '', label: 'Nessuno' },
  { value: 'ceil', label: 'Per eccesso (ceil)' },
  { value: 'floor', label: 'Per difetto (floor)' },
  { value: 'round', label: 'Arrotonda' },
  { value: 'round_2', label: '2 decimali' },
  { value: 'up_10', label: '↑ al multiplo di 10' },
  { value: 'up_50', label: '↑ al multiplo di 50' },
  { value: 'up_100', label: '↑ al multiplo di 100' },
];

// ======================================================
// MAIN COMPONENT
// ======================================================
export default function PipelineBuilderPage() {
  // State
  const [pipelines, setPipelines] = useState<PipelineRule[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dataTables, setDataTables] = useState<DataTable[]>([]);
  const [tableColumns, setTableColumns] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [simPreventivoId, setSimPreventivoId] = useState(1);

  // Pipeline attiva
  const pipeline = pipelines.find(p => p.id === selectedId) || null;

  // ======================================================
  // DATA LOADING
  // ======================================================
  const loadPipelines = useCallback(async () => {
    try {
      const res = await fetch(`${API}/regole`);
      if (!res.ok) return;
      const rules = await res.json();
      // Filtra solo le regole con pipeline_steps
      const pipelineRules = rules.filter((r: any) => r.pipeline_steps && r.pipeline_steps.length > 0);
      setPipelines(pipelineRules);
    } catch (e) {
      console.error('Errore caricamento pipelines:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDataTables = useCallback(async () => {
    try {
      const res = await fetch(`${API}/data-tables`);
      if (!res.ok) return;
      const data = await res.json();
      const tables = (data.tables || []).map((t: any) => ({
        nome: t.nome || t.name,
        tipo: t.tipo || t.type || 'unknown',
        colonne: t.colonne || [],
        records_count: t.records_count || t.righe || 0,
      }));
      setDataTables(tables);
    } catch (e) {
      console.error('Errore caricamento data tables:', e);
    }
  }, []);

  const loadTableColumns = useCallback(async (tableName: string) => {
    if (tableColumns[tableName]) return;
    try {
      const res = await fetch(`${API}/data-tables/${tableName}`);
      if (!res.ok) return;
      const data = await res.json();
      const cols = data.colonne || Object.keys(data.records?.[0] || {});
      setTableColumns(prev => ({ ...prev, [tableName]: cols }));
    } catch (e) {
      console.error(`Errore caricamento colonne ${tableName}:`, e);
    }
  }, [tableColumns]);

  useEffect(() => {
    loadPipelines();
    loadDataTables();
  }, [loadPipelines, loadDataTables]);

  // ======================================================
  // PIPELINE CRUD
  // ======================================================
  const createFromTemplate = (template: typeof TEMPLATES[0]) => {
    const newId = `PIPELINE_${Date.now()}`;
    const newPipeline: PipelineRule = {
      id: newId,
      name: template.id === 'vuoto' ? 'Nuova Pipeline' : template.name,
      description: template.desc,
      enabled: true,
      priority: 15, // phase 1.5
      phase: 1.5,
      conditions: [],
      pipeline_steps: template.steps.map((s, i) => ({
        ...s,
        id: `step_${i}_${Date.now()}`,
      })),
    };
    setPipelines(prev => [...prev, newPipeline]);
    setSelectedId(newId);
    setShowTemplates(false);
  };

  const updatePipeline = (updates: Partial<PipelineRule>) => {
    if (!selectedId) return;
    setPipelines(prev =>
      prev.map(p => (p.id === selectedId ? { ...p, ...updates } : p))
    );
  };

  const updateStep = (stepId: string, updates: Partial<PipelineStep>) => {
    if (!pipeline) return;
    const newSteps = pipeline.pipeline_steps.map(s =>
      s.id === stepId ? { ...s, ...updates } : s
    );
    updatePipeline({ pipeline_steps: newSteps });
  };

  const addStep = (action: PipelineStep['action'], afterIndex?: number) => {
    if (!pipeline) return;
    const newStep: PipelineStep = {
      id: `step_${Date.now()}`,
      action,
      ...(action === 'collect_sum' && { sources: [], output: '_calc.pipeline.sum_result' }),
      ...(action === 'math_expr' && { expression: '', output: '_calc.pipeline.expr_result', round: '' }),
      ...(action === 'catalog_select' && {
        tabella: '',
        criterio: { colonna: '', operatore: '>=', valore: '' },
        ordinamento: { colonna: '', direzione: 'ASC' },
        limit: 1,
        output_prefix: '_calc.catalog.',
      }),
      ...(action === 'lookup_each' && {
        sezione: '',
        tabella: '',
        campo_lookup: 'componente',
        output_prefix: '_calc.util.',
      }),
      ...(action === 'group_sum' && {
        pattern_value: '_calc.util.*.watt',
        pattern_group: '_calc.util.*.tensione_uscita',
        output_prefix: '_calc.grouped.',
        power_factor: '',
      }),
      ...(action === 'multi_match' && {
        tabella: '',
        requisiti_prefix: '_calc.grouped.',
        colonna_codice: 'codice_trasf',
        colonna_tensione: 'tensione_uscita',
        colonna_va: 'va_disponibili',
        colonna_ordinamento: 'potenza_totale_va',
        output_prefix: '_calc.trasformatore.',
      }),
      ...(action === 'add_material' && {
        material: { codice: '', descrizione: '', quantita: 1, categoria: 'Materiale Automatico' },
      }),
    };
    const newSteps = [...pipeline.pipeline_steps];
    if (afterIndex !== undefined) {
      newSteps.splice(afterIndex + 1, 0, newStep);
    } else {
      newSteps.push(newStep);
    }
    updatePipeline({ pipeline_steps: newSteps });
  };

  const removeStep = (stepId: string) => {
    if (!pipeline) return;
    updatePipeline({
      pipeline_steps: pipeline.pipeline_steps.filter(s => s.id !== stepId),
    });
  };

  const moveStep = (stepId: string, direction: 'up' | 'down') => {
    if (!pipeline) return;
    const steps = [...pipeline.pipeline_steps];
    const idx = steps.findIndex(s => s.id === stepId);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= steps.length) return;
    [steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]];
    updatePipeline({ pipeline_steps: steps });
  };

  const deletePipeline = async () => {
    if (!pipeline) return;
    if (!confirm(`Eliminare la pipeline "${pipeline.name}"?`)) return;
    try {
      await fetch(`${API}/regole/${pipeline.id}`, { method: 'DELETE' });
    } catch {}
    setPipelines(prev => prev.filter(p => p.id !== selectedId));
    setSelectedId(null);
  };

  // ======================================================
  // SAVE
  // ======================================================
  const savePipeline = async () => {
    if (!pipeline) return;
    setSaving(true);
    try {
      const ruleJson = {
        id: pipeline.id,
        name: pipeline.name,
        description: pipeline.description,
        enabled: pipeline.enabled,
        priority: pipeline.priority || 15,
        phase: 1.5,
        conditions: pipeline.conditions || [],
        pipeline_steps: pipeline.pipeline_steps,
        materials: [],
        _source: 'pipeline_builder',
      };

      // Prova PUT (update) prima, poi POST (create)
      let res = await fetch(`${API}/regole/${pipeline.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleJson),
      });
      if (!res.ok) {
        res = await fetch(`${API}/regole`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ruleJson),
        });
      }
      if (res.ok) {
        // reload
        await loadPipelines();
      }
    } catch (e) {
      console.error('Errore salvataggio:', e);
    } finally {
      setSaving(false);
    }
  };

  // ======================================================
  // SIMULATE
  // ======================================================
  const simulatePipeline = async (preventivoId?: number) => {
    if (!pipeline) return;
    setSimulating(true);
    setSimResult(null);
    try {
      const res = await fetch(`${API}/pipeline/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_rule: {
            id: pipeline.id,
            pipeline_steps: pipeline.pipeline_steps,
          },
          preventivo_id: preventivoId || 1,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSimResult(data);
      }
    } catch (e) {
      console.error('Errore simulazione:', e);
    } finally {
      setSimulating(false);
    }
  };

  // ======================================================
  // RENDER: SOURCE EDITOR (per collect_sum)
  // ======================================================
  const renderSourceEditor = (step: PipelineStep) => {
    const sources = step.sources || [];

    const addSource = (type: Source['type']) => {
      const newSource: Source = { type };
      if (type === 'calc') newSource.pattern = '_calc.*.va_24v';
      if (type === 'materials') {
        newSource.field = '';
        newSource.filter = {};
      }
      if (type === 'context') newSource.field = '';
      updateStep(step.id, { sources: [...sources, newSource] });
    };

    const updateSource = (idx: number, updates: Partial<Source>) => {
      const newSources = sources.map((s, i) => (i === idx ? { ...s, ...updates } : s));
      updateStep(step.id, { sources: newSources });
    };

    const removeSource = (idx: number) => {
      updateStep(step.id, { sources: sources.filter((_, i) => i !== idx) });
    };

    return (
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-500 uppercase">Fonti dati</div>
        {sources.map((src, idx) => (
          <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded border">
            <Badge variant="secondary" className="text-xs shrink-0">
              {src.type === 'calc' ? '🔢 Calc' : src.type === 'materials' ? '📦 DB' : '📋 Context'}
            </Badge>
            {src.type === 'calc' && (
              <Input
                value={src.pattern || ''}
                onChange={e => updateSource(idx, { pattern: e.target.value })}
                placeholder="_calc.*.va_24v"
                className="h-7 text-xs font-mono"
              />
            )}
            {src.type === 'materials' && (
              <Input
                value={src.field || ''}
                onChange={e => updateSource(idx, { field: e.target.value })}
                placeholder="nome_colonna"
                className="h-7 text-xs font-mono"
              />
            )}
            {src.type === 'context' && (
              <Input
                value={src.field || ''}
                onChange={e => updateSource(idx, { field: e.target.value })}
                placeholder="campo_context"
                className="h-7 text-xs font-mono"
              />
            )}
            <button onClick={() => removeSource(idx)} className="text-red-400 hover:text-red-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => addSource('calc')}>
            + Calc
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => addSource('materials')}>
            + DB
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => addSource('context')}>
            + Context
          </Button>
        </div>
      </div>
    );
  };

  // ======================================================
  // RENDER: STEP CARD
  // ======================================================
  const renderStepCard = (step: PipelineStep, index: number) => {
    const meta = STEP_META[step.action] || STEP_META.collect_sum;
    const simStep = simResult?.steps?.find(s => s.step === index);

    return (
      <div key={step.id}>
        {/* Arrow connector */}
        {index > 0 && (
          <div className="flex justify-center py-1">
            <div className="flex flex-col items-center">
              <div className="w-0.5 h-3 bg-gray-300" />
              <ArrowDown className="h-4 w-4 text-gray-400" />
            </div>
          </div>
        )}

        <Card className={`border-2 ${meta.bgColor} transition-all hover:shadow-md`}>
          <CardHeader className="py-2 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded ${meta.color} bg-white/80`}>
                  {meta.icon}
                </div>
                <span className={`text-xs font-bold uppercase tracking-wider ${meta.color}`}>
                  Step {index + 1} — {meta.label}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {simStep && (
                  <Badge
                    variant={simStep.status === 'ok' ? 'secondary' : 'destructive'}
                    className="text-xs"
                  >
                    {simStep.status === 'ok' ? (
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                    ) : (
                      <AlertCircle className="h-3 w-3 mr-1" />
                    )}
                    {simStep.status}
                  </Badge>
                )}
                <Button
                  size="sm" variant="ghost" className="h-6 w-6 p-0"
                  onClick={() => moveStep(step.id, 'up')}
                  disabled={index === 0}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 w-6 p-0"
                  onClick={() => moveStep(step.id, 'down')}
                  disabled={index === (pipeline?.pipeline_steps.length || 0) - 1}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                  onClick={() => removeStep(step.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="px-4 pb-3 pt-0 space-y-3">
            {/* === LOOKUP_EACH === */}
            {step.action === 'lookup_each' && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-500">Sezione configuratore</label>
                  <Input
                    value={(step as any).sezione || ''}
                    onChange={e => updateStep(step.id, { sezione: e.target.value } as any)}
                    placeholder="selezione_trasformatore"
                    className="h-7 text-xs font-mono mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Tabella lookup</label>
                    <select
                      value={(step as any).tabella || ''}
                      onChange={e => updateStep(step.id, { tabella: e.target.value } as any)}
                      className="w-full h-7 text-xs border rounded px-2 mt-1 bg-white"
                    >
                      <option value="">— Seleziona —</option>
                      {dataTables.map(t => (
                        <option key={t.nome} value={t.nome}>{t.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Campo lookup</label>
                    <Input
                      value={(step as any).campo_lookup || 'componente'}
                      onChange={e => updateStep(step.id, { campo_lookup: e.target.value } as any)}
                      className="h-7 text-xs font-mono mt-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Output prefix →</label>
                  <Input
                    value={(step as any).output_prefix || '_calc.util.'}
                    onChange={e => updateStep(step.id, { output_prefix: e.target.value } as any)}
                    className="h-7 text-xs font-mono mt-1"
                  />
                </div>
                {/* Bottone crea campi */}
                {(step as any).tabella && (step as any).sezione && (
                  <Button
                    size="sm" variant="outline"
                    className="h-7 text-xs gap-1 w-full border-cyan-300 text-cyan-700 hover:bg-cyan-50"
                    onClick={async () => {
                      const sezione = (step as any).sezione || '';
                      const tabella = (step as any).tabella || '';
                      const campo_lookup = (step as any).campo_lookup || 'componente';
                      if (!sezione || !tabella) return;
                      
                      const label = prompt('Etichetta sezione (visibile in sidebar):', sezione.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));
                      if (!label) return;
                      
                      try {
                        const res = await fetch(`${API}/pipeline/crea-campi-da-tabella`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            tabella,
                            colonna_chiave: campo_lookup,
                            colonna_label: 'label',
                            sezione_codice: sezione,
                            sezione_etichetta: label,
                            sezione_icona: 'Zap',
                            campi_extra: [
                              { codice: 'power_factor', etichetta: 'Power Factor', tipo: 'testo', default: '0.8' }
                            ],
                          }),
                        });
                        const data = await res.json();
                        if (res.ok) {
                          alert(`Sezione "${label}" creata!\n${data.campi_creati} checkbox (da ${data.componenti_unici} componenti unici, ${data.totale_record_tabella} righe totali) + ${data.campi_extra_creati} extra.\n${data.campi_skipped} già esistenti.\nRicarica la pagina per vederli nella sidebar.`);
                          window.dispatchEvent(new Event('sezioni-updated'));
                        } else {
                          alert(`Errore: ${data.detail || JSON.stringify(data)}`);
                        }
                      } catch (e) {
                        alert(`Errore: ${e}`);
                      }
                    }}
                  >
                    <Plus className="h-3 w-3" />
                    Crea campi configuratore da tabella
                  </Button>
                )}
              </>
            )}

            {/* === GROUP_SUM === */}
            {step.action === 'group_sum' && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-500">Pattern valore da sommare</label>
                  <Input
                    value={(step as any).pattern_value || ''}
                    onChange={e => updateStep(step.id, { pattern_value: e.target.value } as any)}
                    placeholder="_calc.util.*.watt"
                    className="h-7 text-xs font-mono mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Pattern campo raggruppamento</label>
                  <Input
                    value={(step as any).pattern_group || ''}
                    onChange={e => updateStep(step.id, { pattern_group: e.target.value } as any)}
                    placeholder="_calc.util.*.tensione_uscita"
                    className="h-7 text-xs font-mono mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Output prefix →</label>
                    <Input
                      value={(step as any).output_prefix || '_calc.grouped.'}
                      onChange={e => updateStep(step.id, { output_prefix: e.target.value } as any)}
                      className="h-7 text-xs font-mono mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Power Factor (opz.)</label>
                    <Input
                      value={(step as any).power_factor || ''}
                      onChange={e => updateStep(step.id, { power_factor: e.target.value } as any)}
                      placeholder="selezione_trasformatore.power_factor"
                      className="h-7 text-xs font-mono mt-1"
                    />
                  </div>
                </div>
              </>
            )}

            {/* === MULTI_MATCH === */}
            {step.action === 'multi_match' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Tabella catalogo</label>
                    <select
                      value={(step as any).tabella || ''}
                      onChange={e => updateStep(step.id, { tabella: e.target.value } as any)}
                      className="w-full h-7 text-xs border rounded px-2 mt-1 bg-white"
                    >
                      <option value="">— Seleziona —</option>
                      {dataTables.map(t => (
                        <option key={t.nome} value={t.nome}>{t.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Prefix requisiti</label>
                    <Input
                      value={(step as any).requisiti_prefix || '_calc.grouped.'}
                      onChange={e => updateStep(step.id, { requisiti_prefix: e.target.value } as any)}
                      className="h-7 text-xs font-mono mt-1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Col. codice</label>
                    <Input
                      value={(step as any).colonna_codice || 'codice_trasf'}
                      onChange={e => updateStep(step.id, { colonna_codice: e.target.value } as any)}
                      className="h-7 text-xs font-mono mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Col. tensione</label>
                    <Input
                      value={(step as any).colonna_tensione || 'tensione_uscita'}
                      onChange={e => updateStep(step.id, { colonna_tensione: e.target.value } as any)}
                      className="h-7 text-xs font-mono mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Col. VA</label>
                    <Input
                      value={(step as any).colonna_va || 'va_disponibili'}
                      onChange={e => updateStep(step.id, { colonna_va: e.target.value } as any)}
                      className="h-7 text-xs font-mono mt-1"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Output prefix →</label>
                  <Input
                    value={(step as any).output_prefix || '_calc.trasformatore.'}
                    onChange={e => updateStep(step.id, { output_prefix: e.target.value } as any)}
                    className="h-7 text-xs font-mono mt-1"
                  />
                </div>
              </>
            )}

            {/* === COLLECT_SUM === */}
            {step.action === 'collect_sum' && (
              <>
                {renderSourceEditor(step)}
                <div>
                  <label className="text-xs font-medium text-gray-500">Output →</label>
                  <Input
                    value={step.output || ''}
                    onChange={e => updateStep(step.id, { output: e.target.value })}
                    placeholder="_calc.pipeline.totale_va_raw"
                    className="h-7 text-xs font-mono mt-1"
                  />
                </div>
              </>
            )}

            {/* === MATH_EXPR === */}
            {step.action === 'math_expr' && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-500">Espressione</label>
                  <Input
                    value={step.expression || ''}
                    onChange={e => updateStep(step.id, { expression: e.target.value })}
                    placeholder="_calc.pipeline.totale_va_raw * 1.3"
                    className="h-7 text-xs font-mono mt-1"
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Usa +, -, *, / e riferimenti _calc.xxx
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-500">Arrotondamento</label>
                    <select
                      value={step.round || ''}
                      onChange={e => updateStep(step.id, { round: e.target.value })}
                      className="w-full h-7 text-xs border rounded px-2 mt-1 bg-white"
                    >
                      {ROUND_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-gray-500">Output →</label>
                    <Input
                      value={step.output || ''}
                      onChange={e => updateStep(step.id, { output: e.target.value })}
                      placeholder="_calc.pipeline.result"
                      className="h-7 text-xs font-mono mt-1"
                    />
                  </div>
                </div>
              </>
            )}

            {/* === CATALOG_SELECT === */}
            {step.action === 'catalog_select' && (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-500">Tabella catalogo</label>
                  <select
                    value={step.tabella || ''}
                    onChange={e => {
                      const tn = e.target.value;
                      updateStep(step.id, {
                        tabella: tn,
                        output_prefix: `_calc.${tn}.`,
                      });
                      if (tn) loadTableColumns(tn);
                    }}
                    className="w-full h-7 text-xs border rounded px-2 mt-1 bg-white"
                  >
                    <option value="">— Seleziona tabella —</option>
                    {dataTables.map(t => (
                      <option key={t.nome} value={t.nome}>
                        {t.nome} ({t.tipo}, {t.records_count} record)
                      </option>
                    ))}
                  </select>
                </div>

                {step.tabella && (
                  <>
                    {/* Criterio principale */}
                    <div className="p-2 bg-white rounded border space-y-1.5">
                      <div className="text-xs font-medium text-gray-500">Criterio selezione</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <select
                          value={step.criterio?.colonna || ''}
                          onChange={e =>
                            updateStep(step.id, {
                              criterio: { ...step.criterio!, colonna: e.target.value },
                            })
                          }
                          className="h-7 text-xs border rounded px-1.5 bg-white"
                        >
                          <option value="">Colonna</option>
                          {(tableColumns[step.tabella] || []).map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        <select
                          value={step.criterio?.operatore || '>='}
                          onChange={e =>
                            updateStep(step.id, {
                              criterio: { ...step.criterio!, operatore: e.target.value },
                            })
                          }
                          className="h-7 text-xs border rounded px-1.5 bg-white"
                        >
                          <option value=">=">≥ (maggiore uguale)</option>
                          <option value=">">{'>'} (maggiore)</option>
                          <option value="<=">≤ (minore uguale)</option>
                          <option value="<">{'<'} (minore)</option>
                          <option value="==">= (uguale)</option>
                        </select>
                        <Input
                          value={step.criterio?.valore || ''}
                          onChange={e =>
                            updateStep(step.id, {
                              criterio: { ...step.criterio!, valore: e.target.value },
                            })
                          }
                          placeholder="_calc.pipeline.xxx"
                          className="h-7 text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Ordinamento */}
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="text-xs font-medium text-gray-500">Ordina per</label>
                        <select
                          value={step.ordinamento?.colonna || ''}
                          onChange={e =>
                            updateStep(step.id, {
                              ordinamento: { ...step.ordinamento!, colonna: e.target.value },
                            })
                          }
                          className="w-full h-7 text-xs border rounded px-2 mt-1 bg-white"
                        >
                          <option value="">—</option>
                          {(tableColumns[step.tabella] || []).map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                      <div className="w-24">
                        <label className="text-xs font-medium text-gray-500">Direzione</label>
                        <select
                          value={step.ordinamento?.direzione || 'ASC'}
                          onChange={e =>
                            updateStep(step.id, {
                              ordinamento: { ...step.ordinamento!, direzione: e.target.value },
                            })
                          }
                          className="w-full h-7 text-xs border rounded px-2 mt-1 bg-white"
                        >
                          <option value="ASC">↑ ASC</option>
                          <option value="DESC">↓ DESC</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-500">Output prefix →</label>
                      <Input
                        value={step.output_prefix || ''}
                        onChange={e => updateStep(step.id, { output_prefix: e.target.value })}
                        placeholder={`_calc.${step.tabella}.`}
                        className="h-7 text-xs font-mono mt-1"
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {/* === ADD_MATERIAL === */}
            {step.action === 'add_material' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-500">Codice articolo</label>
                  <Input
                    value={step.material?.codice || ''}
                    onChange={e =>
                      updateStep(step.id, {
                        material: { ...step.material!, codice: e.target.value },
                      })
                    }
                    placeholder="_calc.trasformatore.art_trasformatore"
                    className="h-7 text-xs font-mono mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Descrizione</label>
                  <Input
                    value={step.material?.descrizione || ''}
                    onChange={e =>
                      updateStep(step.id, {
                        material: { ...step.material!, descrizione: e.target.value },
                      })
                    }
                    placeholder="Trasformatore auto-selezionato"
                    className="h-7 text-xs mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Quantità</label>
                  <Input
                    value={step.material?.quantita || ''}
                    onChange={e =>
                      updateStep(step.id, {
                        material: { ...step.material!, quantita: e.target.value },
                      })
                    }
                    placeholder="1"
                    className="h-7 text-xs font-mono mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Categoria</label>
                  <Input
                    value={step.material?.categoria || ''}
                    onChange={e =>
                      updateStep(step.id, {
                        material: { ...step.material!, categoria: e.target.value },
                      })
                    }
                    placeholder="Trasformatore"
                    className="h-7 text-xs mt-1"
                  />
                </div>
              </div>
            )}

            {/* Simulation output */}
            {simStep?.output && Object.keys(simStep.output).length > 0 && (
              <div className="p-2 bg-white/80 rounded border border-dashed border-green-300">
                <div className="text-[10px] font-bold text-green-700 mb-1 flex items-center gap-1">
                  <Eye className="h-3 w-3" /> Output simulazione
                </div>
                {Object.entries(simStep.output).map(([k, v]) => (
                  <div key={k} className="text-xs font-mono flex justify-between">
                    <span className="text-gray-500">{k}</span>
                    <span className="font-semibold text-gray-800">
                      {typeof v === 'number' ? v.toFixed(2) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {simStep?.error && (
              <div className="p-2 bg-red-50 rounded border border-red-200 text-xs text-red-700">
                {simStep.error}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // ======================================================
  // RENDER: ADD STEP BUTTONS
  // ======================================================
  const renderAddStepButtons = () => (
    <div className="flex justify-center py-2">
      <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-dashed border-gray-300">
        <span className="text-xs text-gray-400">Aggiungi step:</span>
        {(Object.keys(STEP_META) as PipelineStep['action'][]).map(action => {
          const meta = STEP_META[action];
          return (
            <Button
              key={action}
              size="sm"
              variant="outline"
              className={`h-7 text-xs gap-1 ${meta.color}`}
              onClick={() => addStep(action)}
            >
              {meta.icon}
              {meta.label}
            </Button>
          );
        })}
      </div>
    </div>
  );

  // ======================================================
  // RENDER: JSON PREVIEW
  // ======================================================
  const renderJsonPreview = () => {
    if (!pipeline) return null;
    const json = JSON.stringify(
      {
        id: pipeline.id,
        name: pipeline.name,
        enabled: pipeline.enabled,
        priority: pipeline.priority,
        phase: 1.5,
        conditions: pipeline.conditions,
        pipeline_steps: pipeline.pipeline_steps,
      },
      null,
      2
    );
    return (
      <Card className="border-gray-200">
        <CardHeader className="py-2 px-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-medium text-gray-500">JSON Regola</CardTitle>
            <Button
              size="sm" variant="ghost" className="h-6 text-xs"
              onClick={() => navigator.clipboard.writeText(json)}
            >
              <Copy className="h-3 w-3 mr-1" /> Copia
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <pre className="text-[10px] leading-tight font-mono bg-gray-900 text-green-400 p-3 rounded-b max-h-60 overflow-auto">
            {json}
          </pre>
        </CardContent>
      </Card>
    );
  };

  // ======================================================
  // MAIN RENDER
  // ======================================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg">
            <Calculator className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Pipeline di Calcolo</h2>
            <p className="text-sm text-slate-500">
              Calcoli multi-step: somma, formula, selezione da catalogo → materiale
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadPipelines()}>
            <RefreshCw className="h-4 w-4 mr-1" /> Ricarica
          </Button>
          <Button size="sm" onClick={() => setShowTemplates(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuova Pipeline
          </Button>
        </div>
      </div>

      {/* Template selector modal */}
      {showTemplates && (
        <Card className="border-2 border-blue-200 bg-blue-50/50">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Scegli un template</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setShowTemplates(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-3 gap-3">
              {TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => createFromTemplate(t)}
                  className="text-left p-3 bg-white rounded-lg border-2 border-transparent hover:border-blue-400 hover:shadow transition-all"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-blue-600">{t.icon}</div>
                    <span className="text-sm font-semibold">{t.name}</span>
                  </div>
                  <p className="text-xs text-gray-500">{t.desc}</p>
                  {t.steps.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {t.steps.map((s, i) => (
                        <Badge key={i} variant="secondary" className="text-[10px]">
                          {STEP_META[s.action]?.label || s.action}
                        </Badge>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4">
        {/* Left: Pipeline list */}
        <div className="w-64 shrink-0 space-y-2">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-1">
            Pipeline salvate ({pipelines.length})
          </div>
          {pipelines.length === 0 && (
            <div className="text-sm text-gray-400 px-1">
              Nessuna pipeline. Creane una nuova!
            </div>
          )}
          {pipelines.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${
                selectedId === p.id
                  ? 'bg-blue-50 border-blue-300 shadow-sm'
                  : 'bg-white border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium truncate">{p.name}</span>
                <Badge
                  variant={p.enabled ? 'default' : 'secondary'}
                  className="text-[10px] shrink-0 ml-1"
                >
                  {p.enabled ? 'ON' : 'OFF'}
                </Badge>
              </div>
              <div className="flex gap-1 mt-1">
                {p.pipeline_steps.map((s, i) => (
                  <span
                    key={i}
                    className={`text-[9px] px-1 rounded ${STEP_META[s.action]?.bgColor || 'bg-gray-100'}`}
                  >
                    {STEP_META[s.action]?.label || s.action}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* Right: Editor */}
        <div className="flex-1">
          {!pipeline ? (
            <Card className="border-dashed border-2 border-gray-300 bg-gray-50/50">
              <CardContent className="py-16 text-center">
                <Calculator className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm">
                  Seleziona una pipeline dalla lista o creane una nuova
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Pipeline header */}
              <Card>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={pipeline.name}
                          onChange={e => updatePipeline({ name: e.target.value })}
                          className="h-8 font-semibold text-sm"
                          placeholder="Nome pipeline"
                        />
                        <label className="flex items-center gap-1.5 text-xs shrink-0 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={pipeline.enabled}
                            onChange={e => updatePipeline({ enabled: e.target.checked })}
                            className="rounded"
                          />
                          Attiva
                        </label>
                      </div>
                      <Input
                        value={pipeline.description}
                        onChange={e => updatePipeline({ description: e.target.value })}
                        className="h-7 text-xs"
                        placeholder="Descrizione..."
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button
                        size="sm"
                        onClick={savePipeline}
                        disabled={saving}
                        className="h-7 text-xs"
                      >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                        Salva
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => simulatePipeline(simPreventivoId)}
                        disabled={simulating}
                        className="h-7 text-xs"
                      >
                        {simulating ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Play className="h-3 w-3 mr-1" />
                        )}
                        Simula
                      </Button>
                      <div className="flex items-center gap-1">
                        <label className="text-[10px] text-gray-400">Prev.#</label>
                        <Input
                          type="number"
                          value={simPreventivoId}
                          onChange={e => setSimPreventivoId(parseInt(e.target.value) || 1)}
                          className="h-7 w-14 text-xs text-center"
                          min={1}
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={deletePipeline}
                        className="h-7 text-xs text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Elimina
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Steps */}
              <div className="max-w-xl mx-auto">
                {pipeline.pipeline_steps.length === 0 && (
                  <Card className="border-dashed border-2 border-gray-300 bg-gray-50/50">
                    <CardContent className="py-8 text-center">
                      <p className="text-gray-400 text-sm mb-2">
                        Nessuno step. Aggiungi il primo!
                      </p>
                    </CardContent>
                  </Card>
                )}

                {pipeline.pipeline_steps.map((step, index) => renderStepCard(step, index))}

                {renderAddStepButtons()}
              </div>

              {/* Simulation results summary */}
              {simResult && (
                <Card className={`border-2 ${
                  simResult.errors.length > 0 ? 'border-red-200 bg-red-50/50' : 'border-green-200 bg-green-50/50'
                }`}>
                  <CardHeader className="py-2 px-4">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      {simResult.errors.length > 0 ? (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      Risultato simulazione
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    {Object.keys(simResult.final_context_calc).length > 0 && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-gray-500">Valori _calc finali:</div>
                        {Object.entries(simResult.final_context_calc).map(([k, v]) => (
                          <div key={k} className="text-xs font-mono flex justify-between bg-white px-2 py-1 rounded">
                            <span className="text-gray-600">{k}</span>
                            <span className="font-bold">
                              {typeof v === 'number' ? v.toFixed(2) : String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {simResult.warnings.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {simResult.warnings.map((w, i) => (
                          <div key={i} className="text-xs text-amber-600">⚠ {w}</div>
                        ))}
                      </div>
                    )}
                    {simResult.errors.length > 0 && (
                      <div className="mt-2 space-y-0.5">
                        {simResult.errors.map((e, i) => (
                          <div key={i} className="text-xs text-red-600">✗ {e}</div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* JSON Preview */}
              {renderJsonPreview()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
