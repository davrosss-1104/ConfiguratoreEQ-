/**
 * RuleBuilderPage.tsx — Editor regole JSON + Rule Designer iframe
 *
 * Tab 1: Editor integrato con autocomplete articoli
 * Tab 2: Rule Designer standalone via iframe
 *
 * Posizionare in: frontend/src/components/sections/RuleBuilderPage.tsx
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Settings2, Plus, Trash2, Save, Copy, Power, PowerOff,
  ChevronDown, ChevronRight, Loader2, Search,
  GripVertical, X, ExternalLink, RefreshCw, Maximize2,
  Minimize2, AlertCircle, CheckCircle2
} from 'lucide-react';

const API = 'http://localhost:8000';
const RULE_DESIGNER_URL = 'http://localhost:3001';

const OPERATORS = [
  { value: 'equals', label: 'Uguale a' },
  { value: 'not_equals', label: 'Diverso da' },
  { value: 'contains', label: 'Contiene' },
  { value: 'greater_than', label: 'Maggiore di' },
  { value: 'less_than', label: 'Minore di' },
  { value: 'in', label: 'In lista' },
];

interface Condition { field: string; operator: string; value: any; description?: string; }
interface MaterialItem { codice: string; descrizione: string; quantita: number; prezzo_unitario: number; categoria: string; note?: string; }
interface Rule { id: string; name: string; description?: string; version?: string; enabled: boolean; priority: number; conditions: Condition[]; materials: MaterialItem[]; }
interface ArticoloResult { id: number; codice: string; descrizione: string; costo_fisso: number; tipo_articolo: string; }

const emptyRule: Rule = {
  id: '', name: '', description: '', version: '1.0', enabled: true, priority: 50,
  conditions: [{ field: '', operator: 'equals', value: '' }],
  materials: [{ codice: '', descrizione: '', quantita: 1, prezzo_unitario: 0, categoria: '' }],
};

const inputCls = "w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400";
const btnIcon = "p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors";


// =======================================================
// AUTOCOMPLETE ARTICOLI
// =======================================================
function ArticoloAutocomplete({
  value, field, onSelect, placeholder
}: {
  value: string;
  field: 'codice' | 'descrizione';
  onSelect: (art: ArticoloResult) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<ArticoloResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync value from parent
  useEffect(() => { setQuery(value); }, [value]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/articoli/search?q=${encodeURIComponent(q)}&limit=8`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setOpen(data.length > 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(v), 300);
  };

  const handleSelect = (art: ArticoloResult) => {
    setQuery(field === 'codice' ? art.codice : art.descrizione);
    setOpen(false);
    onSelect(art);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input value={query} onChange={handleChange} onFocus={() => results.length > 0 && setOpen(true)}
          className={inputCls} placeholder={placeholder || 'Cerca...'} />
        {loading && <Loader2 className="absolute right-2 top-2 w-3.5 h-3.5 animate-spin text-gray-400" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map(art => (
            <button key={art.id} onClick={() => handleSelect(art)}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-gray-100 last:border-0">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-indigo-700">{art.codice}</span>
                {art.costo_fisso > 0 && (
                  <span className="text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                    €{art.costo_fisso.toFixed(2)}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-600 truncate">{art.descrizione}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


// =======================================================
// TAB 1: EDITOR INTEGRATO
// =======================================================
function EditorRegole() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editRule, setEditRule] = useState<Rule | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['conditions', 'materials']));

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey: ['regole'],
    queryFn: async () => { const r = await fetch(`${API}/regole`); return r.ok ? r.json() : []; },
  });

  const { data: campiDisponibili = [] } = useQuery<{ field: string; source: string; label: string }[]>({
    queryKey: ['regole-campi'],
    queryFn: async () => { const r = await fetch(`${API}/regole-campi-disponibili`); return r.ok ? r.json() : []; },
  });

  const saveMutation = useMutation({
    mutationFn: async (rule: Rule) => {
      const url = isNew ? `${API}/regole` : `${API}/regole/${rule.id}`;
      const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rule) });
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || 'Errore salvataggio'); }
      return res.json();
    },
    onSuccess: () => { toast.success(isNew ? 'Regola creata' : 'Regola salvata'); queryClient.invalidateQueries({ queryKey: ['regole'] }); setIsNew(false); },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ruleId: string) => { const r = await fetch(`${API}/regole/${ruleId}`, { method: 'DELETE' }); if (!r.ok) throw new Error('Errore'); return r.json(); },
    onSuccess: () => { toast.success('Regola eliminata'); setEditRule(null); setSelectedId(null); queryClient.invalidateQueries({ queryKey: ['regole'] }); },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ rule, enabled }: { rule: Rule; enabled: boolean }) => {
      const res = await fetch(`${API}/regole/${rule.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rule, enabled }) });
      if (!res.ok) throw new Error('Errore');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['regole'] }),
  });

  const selectRule = (rule: Rule) => { setSelectedId(rule.id); setEditRule(JSON.parse(JSON.stringify(rule))); setIsNew(false); };
  const newRule = () => { const r = JSON.parse(JSON.stringify(emptyRule)); r.id = `RULE_${Date.now()}`; setEditRule(r); setSelectedId(null); setIsNew(true); };
  const duplicateRule = (rule: Rule) => { const r = JSON.parse(JSON.stringify(rule)); r.id = `${rule.id}_COPY`; r.name = `${rule.name} (copia)`; setEditRule(r); setSelectedId(null); setIsNew(true); };

  const updateField = (path: string, value: any) => {
    if (!editRule) return;
    const r = { ...editRule } as any;
    const parts = path.split('.');
    let obj = r;
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = value;
    setEditRule({ ...r });
  };

  const updateArrayItem = (arrayName: 'conditions' | 'materials', index: number, field: string, value: any) => {
    if (!editRule) return;
    const arr = [...editRule[arrayName]];
    (arr[index] as any)[field] = value;
    setEditRule({ ...editRule, [arrayName]: arr });
  };

  const addArrayItem = (arrayName: 'conditions' | 'materials') => {
    if (!editRule) return;
    const item = arrayName === 'conditions'
      ? { field: '', operator: 'equals', value: '' }
      : { codice: '', descrizione: '', quantita: 1, prezzo_unitario: 0, categoria: '' };
    setEditRule({ ...editRule, [arrayName]: [...editRule[arrayName], item] });
  };

  const removeArrayItem = (arrayName: 'conditions' | 'materials', index: number) => {
    if (!editRule) return;
    setEditRule({ ...editRule, [arrayName]: editRule[arrayName].filter((_: any, i: number) => i !== index) });
  };

  const toggleSection = (s: string) => {
    setExpandedSections(prev => { const next = new Set(prev); next.has(s) ? next.delete(s) : next.add(s); return next; });
  };

  const filteredRules = rules.filter(r =>
    !searchTerm || r.name?.toLowerCase().includes(searchTerm.toLowerCase()) || r.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handler: seleziona articolo da autocomplete e popola campi materiale
  const handleArticoloSelect = (index: number, art: ArticoloResult) => {
    if (!editRule) return;
    const arr = [...editRule.materials];
    arr[index] = {
      ...arr[index],
      codice: art.codice,
      descrizione: art.descrizione,
      prezzo_unitario: art.costo_fisso || arr[index].prezzo_unitario,
      categoria: art.tipo_articolo || arr[index].categoria,
    };
    setEditRule({ ...editRule, materials: arr });
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-240px)]">
      {/* Lista regole */}
      <div className="w-80 flex-shrink-0 bg-white rounded-lg shadow flex flex-col">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-indigo-600" /> Regole ({rules.length})
            </h3>
            <button onClick={newRule} className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700">
              <Plus className="w-3.5 h-3.5" /> Nuova
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Cerca regole..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y">
          {isLoading && <div className="p-4 text-center text-gray-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Caricamento...</div>}
          {filteredRules.map(rule => (
            <div key={rule.id} onClick={() => selectRule(rule)}
              className={`px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${selectedId === rule.id ? 'bg-indigo-50 border-l-2 border-indigo-600' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-gray-900 truncate flex-1">{rule.name || rule.id}</span>
                <div className="flex items-center gap-1 ml-2">
                  <span className="text-[10px] text-gray-400">P{rule.priority}</span>
                  <button onClick={e => { e.stopPropagation(); toggleMutation.mutate({ rule, enabled: !rule.enabled }); }}
                    className={btnIcon} title={rule.enabled ? 'Disabilita' : 'Abilita'}>
                    {rule.enabled ? <Power className="w-3.5 h-3.5 text-green-600" /> : <PowerOff className="w-3.5 h-3.5 text-red-400" />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">{rule.description || rule.id}</p>
              <div className="flex gap-1 mt-1">
                <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{rule.conditions?.length || 0} cond</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded">{rule.materials?.length || 0} mat</span>
              </div>
            </div>
          ))}
          {!isLoading && filteredRules.length === 0 && (
            <div className="p-4 text-center text-gray-400 text-sm">{searchTerm ? 'Nessun risultato' : 'Nessuna regola. Clicca "Nuova".'}</div>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 bg-white rounded-lg shadow flex flex-col overflow-hidden">
        {!editRule ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center"><Settings2 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Seleziona una regola o creane una nuova</p></div>
          </div>
        ) : (
          <>
            {/* Header editor */}
            <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-gray-900">{isNew ? 'Nuova Regola' : `Modifica: ${editRule.name || editRule.id}`}</h3>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${editRule.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                  {editRule.enabled ? 'Attiva' : 'Disattiva'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!isNew && (
                  <>
                    <button onClick={() => duplicateRule(editRule)} className={btnIcon} title="Duplica"><Copy className="w-4 h-4" /></button>
                    <button onClick={() => { if (confirm('Eliminare questa regola?')) deleteMutation.mutate(editRule.id); }}
                      className="p-1.5 rounded hover:bg-red-50 text-red-500 hover:text-red-700" title="Elimina"><Trash2 className="w-4 h-4" /></button>
                  </>
                )}
                <button onClick={() => saveMutation.mutate(editRule)}
                  disabled={saveMutation.isPending || !editRule.id || !editRule.name}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva
                </button>
              </div>
            </div>

            {/* Form scrollabile */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Info base */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">ID Regola *</label>
                  <input value={editRule.id} onChange={e => updateField('id', e.target.value.toUpperCase().replace(/\s/g, '_'))}
                    className={inputCls} placeholder="ES: QUADRO_GEARLESS" disabled={!isNew} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Nome *</label>
                  <input value={editRule.name} onChange={e => updateField('name', e.target.value)} className={inputCls} placeholder="Quadro manovra Gearless" />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Descrizione</label>
                  <input value={editRule.description || ''} onChange={e => updateField('description', e.target.value)} className={inputCls} placeholder="Descrizione opzionale" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Priorita (1=alta)</label>
                  <input type="number" value={editRule.priority} onChange={e => updateField('priority', parseInt(e.target.value) || 50)} className={inputCls} min={1} max={100} />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editRule.enabled} onChange={e => updateField('enabled', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
                    <span className="text-sm text-gray-700">Regola attiva</span>
                  </label>
                </div>
              </div>

              {/* CONDIZIONI */}
              <div className="border rounded-lg">
                <button onClick={() => toggleSection('conditions')} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <span className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    {expandedSections.has('conditions') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Condizioni ({editRule.conditions.length})
                  </span>
                  <span onClick={e => { e.stopPropagation(); addArrayItem('conditions'); }} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer">
                    <Plus className="w-3.5 h-3.5" /> Aggiungi
                  </span>
                </button>
                {expandedSections.has('conditions') && (
                  <div className="border-t px-4 py-3 space-y-2">
                    <p className="text-xs text-gray-500 mb-2">Tutte le condizioni devono essere soddisfatte (AND)</p>
                    {editRule.conditions.map((cond, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                        <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        <select value={cond.field} onChange={e => updateArrayItem('conditions', idx, 'field', e.target.value)}
                          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                          <option value="">-- Campo --</option>
                          {Object.entries(
                            campiDisponibili.reduce((acc: Record<string, typeof campiDisponibili>, c) => { if (!acc[c.source]) acc[c.source] = []; acc[c.source].push(c); return acc; }, {})
                          ).map(([source, fields]) => (
                            <optgroup key={source} label={source}>
                              {fields.map(f => (<option key={f.field} value={f.field}>{f.label}</option>))}
                            </optgroup>
                          ))}
                        </select>
                        <select value={cond.operator} onChange={e => updateArrayItem('conditions', idx, 'operator', e.target.value)}
                          className="w-36 border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                          {OPERATORS.map(op => (<option key={op.value} value={op.value}>{op.label}</option>))}
                        </select>
                        <input value={typeof cond.value === 'object' ? JSON.stringify(cond.value) : cond.value}
                          onChange={e => { let v: any = e.target.value; if (cond.operator === 'in') { try { v = JSON.parse(v); } catch { } } updateArrayItem('conditions', idx, 'value', v); }}
                          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm"
                          placeholder={cond.operator === 'in' ? '["val1","val2"]' : 'Valore'} />
                        <button onClick={() => removeArrayItem('conditions', idx)} className={btnIcon}><X className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* MATERIALI con autocomplete */}
              <div className="border rounded-lg">
                <button onClick={() => toggleSection('materials')} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <span className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    {expandedSections.has('materials') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Materiali ({editRule.materials.length})
                  </span>
                  <span onClick={e => { e.stopPropagation(); addArrayItem('materials'); }} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer">
                    <Plus className="w-3.5 h-3.5" /> Aggiungi
                  </span>
                </button>
                {expandedSections.has('materials') && (
                  <div className="border-t px-4 py-3 space-y-2">
                    <p className="text-xs text-gray-500 mb-2">Cerca articoli digitando nel campo Codice o Descrizione</p>
                    {editRule.materials.map((mat, idx) => (
                      <div key={idx} className="bg-gray-50 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-500">Materiale #{idx + 1}</span>
                          <button onClick={() => removeArrayItem('materials', idx)} className={btnIcon}><X className="w-3.5 h-3.5 text-red-400" /></button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          <div>
                            <label className="text-[10px] text-gray-500">Codice (cerca)</label>
                            <ArticoloAutocomplete
                              value={mat.codice}
                              field="codice"
                              onSelect={(art) => handleArticoloSelect(idx, art)}
                              placeholder="Cerca codice..."
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] text-gray-500">Descrizione (cerca)</label>
                            <ArticoloAutocomplete
                              value={mat.descrizione}
                              field="descrizione"
                              onSelect={(art) => handleArticoloSelect(idx, art)}
                              placeholder="Cerca descrizione..."
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500">Categoria</label>
                            <input value={mat.categoria} onChange={e => updateArrayItem('materials', idx, 'categoria', e.target.value)}
                              className={inputCls} placeholder="Quadri Elettrici" />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500">Quantita</label>
                            <input type="number" value={mat.quantita} onChange={e => updateArrayItem('materials', idx, 'quantita', parseFloat(e.target.value) || 1)}
                              className={inputCls} min={1} />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500">Prezzo Unitario</label>
                            <input type="number" step="0.01" value={mat.prezzo_unitario}
                              onChange={e => updateArrayItem('materials', idx, 'prezzo_unitario', parseFloat(e.target.value) || 0)} className={inputCls} />
                          </div>
                          <div className="col-span-2">
                            <label className="text-[10px] text-gray-500">Note</label>
                            <input value={mat.note || ''} onChange={e => updateArrayItem('materials', idx, 'note', e.target.value)}
                              className={inputCls} placeholder="Note opzionali" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* JSON Preview */}
              <details className="border rounded-lg">
                <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-600 hover:bg-gray-50">Anteprima JSON</summary>
                <pre className="px-4 py-3 border-t bg-gray-50 text-xs font-mono overflow-x-auto max-h-80">{JSON.stringify(editRule, null, 2)}</pre>
              </details>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// =======================================================
// TAB 2: RULE DESIGNER (IFRAME)
// =======================================================
function RuleDesignerIframe() {
  const [isLoaded, setIsLoaded] = useState<boolean | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isLoaded === true && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-100 px-2.5 py-1 rounded-full"><CheckCircle2 className="h-3 w-3" /> Caricato</span>
          )}
          {isLoaded === false && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-100 px-2.5 py-1 rounded-full"><AlertCircle className="h-3 w-3" /> Non raggiungibile</span>
          )}
          {isLoaded === null && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full"><Loader2 className="h-3 w-3 animate-spin" /> Caricamento...</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setIframeKey(k => k + 1); setIsLoaded(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            <RefreshCw className="h-3.5 w-3.5" /> Ricarica
          </button>
          <button onClick={() => setIsFullscreen(!isFullscreen)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {isFullscreen ? 'Riduci' : 'Espandi'}
          </button>
          <button onClick={() => window.open(RULE_DESIGNER_URL, '_blank', 'width=1400,height=900')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
            <ExternalLink className="h-3.5 w-3.5" /> Apri in nuova finestra
          </button>
        </div>
      </div>

      {isLoaded === false && (
        <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">Rule Designer non raggiungibile</p>
              <p className="text-sm text-amber-700 mt-1">Avvia il Rule Designer:</p>
              <div className="mt-2 p-2 bg-amber-100 rounded font-mono text-xs text-amber-900">
                <p>cd C:\Users\david\Desktop\Python\rule_engine_mvp\frontend</p>
                <p>npm start</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`bg-white rounded-lg shadow overflow-hidden ${isFullscreen ? 'fixed inset-4 z-50' : ''}`}>
        {isFullscreen && (
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
            <span className="text-sm font-medium text-gray-600">Rule Designer - Editor Visuale Avanzato</span>
            <button onClick={() => setIsFullscreen(false)} className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-gray-900">
              <Minimize2 className="h-4 w-4" /> Chiudi
            </button>
          </div>
        )}
        <iframe key={iframeKey} src={RULE_DESIGNER_URL}
          className={`w-full border-0 ${isFullscreen ? 'h-[calc(100vh-120px)]' : 'h-[700px]'}`}
          title="Rule Designer" allow="clipboard-read; clipboard-write"
          onLoad={() => setIsLoaded(true)} onError={() => setIsLoaded(false)} />
      </div>
    </div>
  );
}


// =======================================================
// COMPONENTE PRINCIPALE CON TABS
// =======================================================
export default function RuleBuilderPage() {
  const [activeTab, setActiveTab] = useState<'editor' | 'designer'>('editor');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
            <Settings2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Rule Engine</h2>
            <p className="text-sm text-slate-500">Gestione regole per calcolo automatico materiali e prezzi</p>
          </div>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'editor' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            <Settings2 className="w-4 h-4" /> Editor Regole
          </button>
          <button onClick={() => setActiveTab('designer')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'designer' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
            <ExternalLink className="w-4 h-4" /> Rule Designer
          </button>
        </div>
      </div>
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-4 text-xs text-slate-600">
          {activeTab === 'editor' ? (
            <><span><strong>Editor Regole:</strong> Crea e modifica regole JSON. Cerca articoli nei campi Codice/Descrizione.</span><span className="text-slate-400">|</span><span>Salva in <code className="bg-white/60 px-1 rounded">./rules/</code></span></>
          ) : (
            <><span><strong>Rule Designer:</strong> Editor visuale avanzato con import Excel, lookup table, formule.</span><span className="text-slate-400">|</span><span>App standalone su <code className="bg-white/60 px-1 rounded">localhost:3001</code></span></>
          )}
        </div>
      </div>
      {activeTab === 'editor' ? <EditorRegole /> : <RuleDesignerIframe />}
    </div>
  );
}
