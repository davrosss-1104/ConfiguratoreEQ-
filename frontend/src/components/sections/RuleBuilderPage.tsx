/**
 * RuleBuilderPage.tsx — Editor regole JSON + Rule Designer iframe
 *
 * Supporta TUTTI i formati regola:
 *   - Vecchio: conditions + materials
 *   - Nuovo:   conditions + actions (set_field, lookup_table, accumulate_from_lookup, catalog_match, add_material)
 *   - Misto:   conditions + materials + actions
 *
 * Ogni action supporta skip_if per condizioni di salto inline.
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Settings2, Plus, Trash2, Save, Copy, Power, PowerOff,
  ChevronDown, ChevronRight, Loader2, Search,
  GripVertical, X, Zap, Database,
  Calculator, Package, ArrowUpDown, Folder, FolderOpen
} from 'lucide-react';

const API = 'http://localhost:8000';

const OPERATORS = [
  { value: 'equals', label: 'Uguale a' },
  { value: 'not_equals', label: 'Diverso da' },
  { value: 'contains', label: 'Contiene' },
  { value: 'greater_than', label: 'Maggiore di' },
  { value: 'greater_equal', label: 'Maggiore o uguale' },
  { value: 'less_than', label: 'Minore di' },
  { value: 'less_equal', label: 'Minore o uguale' },
  { value: 'in', label: 'In lista' },
];

const ACTION_TYPES = [
  { value: 'add_material', label: 'Aggiungi Materiale', icon: Package, color: 'green' },
  { value: 'set_field', label: 'Imposta Variabile', icon: Calculator, color: 'blue' },
  { value: 'lookup_table', label: 'Lookup Tabella', icon: Database, color: 'purple' },
  { value: 'lookup_multi', label: 'Lookup Multi-chiave', icon: Database, color: 'violet' },
  { value: 'accumulate_from_lookup', label: 'Accumula da Lookup', icon: ArrowUpDown, color: 'amber' },
  { value: 'catalog_match', label: 'Match Catalogo', icon: Search, color: 'rose' },
];

interface Condition { field: string; operator: string; value: any; description?: string; }
interface RuleAction { action: string; skip_if?: string; [key: string]: any; }
interface Rule { id: string; name: string; description?: string; version?: string; enabled: boolean; priority: number; conditions?: Condition[]; materials?: any[]; actions?: RuleAction[]; [key: string]: any; }
interface ArticoloResult { id: number; codice: string; descrizione: string; costo_fisso: number; tipo_articolo: string; }

const emptyRule: Rule = {
  id: '', name: '', description: '', version: '1.0', enabled: true, priority: 50,
  conditions: [{ field: '', operator: 'equals', value: '' }],
  actions: [],
};

const EMPTY_ACTIONS: Record<string, RuleAction> = {
  add_material: { action: 'add_material', material: { codice: '', descrizione: '', quantita: 1, prezzo_unitario: 0, categoria: '', note: '' } },
  set_field: { action: 'set_field', field: '_calc.', value: '' },
  lookup_table: { action: 'lookup_table', tabella: '', input_field: '', partition_field: '', output_prefix: '_calc.' },
  accumulate_from_lookup: { action: 'accumulate_from_lookup', tabella: '', campi_da_verificare: [], accumula_campo: '', raggruppa_per: '', output_prefix: '_calc.', output_suffix: '', output_totale: '_calc.totale' },
  catalog_match: { action: 'catalog_match', tabella: '', criteri_dinamici: { pattern: '', sorgente_prefix: '_calc.', sorgente_suffix: '', operatore: '>=', solo_se_maggiore_di: 0 }, criteri_fissi: [], ordinamento: { colonna: '', direzione: 'ASC' }, output: {} },
  lookup_multi: { action: 'lookup_multi', tabella: '', input_fields: [], output_prefix: '_calc.' },
};

const inputCls = "w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400";
const inputSmCls = "w-full border border-gray-300 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400";
const btnIcon = "p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors";


// =======================================================
// AUTOCOMPLETE ARTICOLI
// =======================================================
function ArticoloAutocomplete({ value, field, onSelect, placeholder }: {
  value: string; field: 'codice' | 'descrizione'; onSelect: (art: ArticoloResult) => void; placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<ArticoloResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/articoli/search?q=${encodeURIComponent(q)}&limit=8`);
      if (res.ok) { const data = await res.json(); setResults(data); setOpen(data.length > 0); }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value; setQuery(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(v), 300);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input value={query} onChange={handleChange} onFocus={() => results.length > 0 && setOpen(true)} className={inputCls} placeholder={placeholder || 'Cerca...'} />
        {loading && <Loader2 className="absolute right-2 top-2 w-3.5 h-3.5 animate-spin text-gray-400" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {results.map(art => (
            <button key={art.id} onClick={() => { setQuery(field === 'codice' ? art.codice : art.descrizione); setOpen(false); onSelect(art); }}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-gray-100 last:border-0">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-indigo-700">{art.codice}</span>
                {art.costo_fisso > 0 && <span className="text-[10px] text-green-700 bg-green-50 px-1.5 py-0.5 rounded">€{art.costo_fisso.toFixed(2)}</span>}
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
// EDITOR PER OGNI TIPO DI ACTION
// =======================================================

function ActionEditorSetField({ action, onChange }: { action: RuleAction; onChange: (a: RuleAction) => void }) {
  const mode = action.add_value !== undefined ? 'add' : action.value_from ? 'from' : 'direct';
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] text-gray-500">Campo destinazione</label>
          <input value={action.field || ''} onChange={e => onChange({ ...action, field: e.target.value })} className={inputSmCls} placeholder="_calc.nome_var" />
        </div>
        <div>
          <label className="text-[10px] text-gray-500">Modalità</label>
          <select value={mode} onChange={e => {
            const m = e.target.value;
            const base: any = { action: 'set_field', field: action.field || '', skip_if: action.skip_if };
            if (m === 'direct') onChange({ ...base, value: '' });
            else if (m === 'from') onChange({ ...base, value_from: '', multiply_by: 1 });
            else onChange({ ...base, add_value: 0 });
          }} className={inputSmCls}>
            <option value="direct">Valore diretto</option>
            <option value="from">Da altro campo</option>
            <option value="add">Somma a esistente</option>
          </select>
        </div>
        <div>
          {mode === 'direct' && <><label className="text-[10px] text-gray-500">Valore</label><input value={action.value ?? ''} onChange={e => onChange({ ...action, value: e.target.value })} className={inputSmCls} placeholder="150 oppure {{campo}}" /></>}
          {mode === 'from' && <><label className="text-[10px] text-gray-500">Campo sorgente</label><input value={action.value_from || ''} onChange={e => onChange({ ...action, value_from: e.target.value })} className={inputSmCls} placeholder="argano.potenza_motore_kw" /></>}
          {mode === 'add' && <><label className="text-[10px] text-gray-500">Valore da sommare</label><input type="number" value={action.add_value ?? 0} onChange={e => onChange({ ...action, add_value: parseFloat(e.target.value) || 0 })} className={inputSmCls} /></>}
        </div>
      </div>
      {mode === 'from' && (
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[10px] text-gray-500">Moltiplica per (opz.)</label><input type="number" step="0.1" value={action.multiply_by ?? ''} onChange={e => onChange({ ...action, multiply_by: parseFloat(e.target.value) || undefined })} className={inputSmCls} /></div>
          <div><label className="text-[10px] text-gray-500">Somma (opz.)</label><input type="number" step="0.1" value={action.add ?? ''} onChange={e => onChange({ ...action, add: parseFloat(e.target.value) || undefined })} className={inputSmCls} /></div>
        </div>
      )}
    </div>
  );
}

function ActionEditorLookupTable({ action, onChange }: { action: RuleAction; onChange: (a: RuleAction) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div><label className="text-[10px] text-gray-500">Tabella (nome JSON in data/)</label><input value={action.tabella || ''} onChange={e => onChange({ ...action, tabella: e.target.value })} className={inputSmCls} placeholder="contattori_oleo" /></div>
      <div><label className="text-[10px] text-gray-500">Campo input (da context)</label><input value={action.input_field || ''} onChange={e => onChange({ ...action, input_field: e.target.value })} className={inputSmCls} placeholder="argano.potenza_motore_kw" /></div>
      <div><label className="text-[10px] text-gray-500">Campo partizione (opz.)</label><input value={action.partition_field || ''} onChange={e => onChange({ ...action, partition_field: e.target.value })} className={inputSmCls} placeholder="_calc.partizione" /></div>
      <div><label className="text-[10px] text-gray-500">Prefisso output</label><input value={action.output_prefix || '_calc.'} onChange={e => onChange({ ...action, output_prefix: e.target.value })} className={inputSmCls} /></div>
    </div>
  );
}

function ActionEditorLookupMulti({ action, onChange }: { action: RuleAction; onChange: (a: RuleAction) => void }) {
  const inputFields = (action.input_fields || []) as any[];
  const updateField = (idx: number, patch: any) => {
    const next = [...inputFields]; next[idx] = { ...next[idx], ...patch };
    onChange({ ...action, input_fields: next });
  };
  const addField = () => onChange({ ...action, input_fields: [...inputFields, { colonna_tabella: '', match: 'exact', type: 'single', field: '' }] });
  const removeField = (idx: number) => onChange({ ...action, input_fields: inputFields.filter((_, i) => i !== idx) });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div><label className="text-[10px] text-gray-500">Tabella (nome JSON in data/)</label><input value={action.tabella || ''} onChange={e => onChange({ ...action, tabella: e.target.value })} className={inputSmCls} placeholder="contattori_oleo" /></div>
        <div><label className="text-[10px] text-gray-500">Prefisso output</label><input value={action.output_prefix || '_calc.'} onChange={e => onChange({ ...action, output_prefix: e.target.value })} className={inputSmCls} /></div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-gray-600">Chiavi di input ({inputFields.length})</span>
          <button onClick={addField} className="text-[10px] px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded hover:bg-violet-200">+ Chiave</button>
        </div>
        {inputFields.map((inp, idx) => (
          <div key={idx} className="grid grid-cols-12 gap-1 items-end bg-gray-50 rounded p-1.5">
            <div className="col-span-2"><label className="text-[9px] text-gray-400">Col. tabella</label>
              <input value={inp.colonna_tabella || ''} onChange={e => updateField(idx, { colonna_tabella: e.target.value })} className={inputSmCls} placeholder="kw" /></div>
            <div className="col-span-2"><label className="text-[9px] text-gray-400">Match</label>
              <select value={inp.match || 'exact'} onChange={e => updateField(idx, { match: e.target.value })} className={inputSmCls}>
                <option value="exact">= esatto</option><option value="lte">≤ prima ≥</option></select></div>
            <div className="col-span-2"><label className="text-[9px] text-gray-400">Tipo</label>
              <select value={inp.type || 'single'} onChange={e => updateField(idx, { type: e.target.value })} className={inputSmCls}>
                <option value="single">Singolo</option><option value="composite">Composto</option></select></div>
            {inp.type === 'composite' ? (
              <>
                <div className="col-span-4"><label className="text-[9px] text-gray-400">Campi (virgola)</label>
                  <input value={(inp.fields || []).join(', ')} onChange={e => updateField(idx, { fields: e.target.value.split(',').map((s: string) => s.trim()) })} className={inputSmCls} placeholder="argano.tipo_avv, tensioni.freq" /></div>
                <div className="col-span-1"><label className="text-[9px] text-gray-400">Sep</label>
                  <input value={inp.separator || '_'} onChange={e => updateField(idx, { separator: e.target.value })} className={inputSmCls} /></div>
              </>
            ) : (
              <div className="col-span-5"><label className="text-[9px] text-gray-400">Campo configuratore</label>
                <input value={inp.field || ''} onChange={e => updateField(idx, { field: e.target.value })} className={inputSmCls} placeholder="argano.potenza_motore_kw" /></div>
            )}
            <div className="col-span-1 flex justify-end">
              <button onClick={() => removeField(idx)} className="p-0.5 text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionEditorAccumulate({ action, onChange }: { action: RuleAction; onChange: (a: RuleAction) => void }) {
  const campi = (action.campi_da_verificare || []) as string[];
  const [newCampo, setNewCampo] = useState('');
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div><label className="text-[10px] text-gray-500">Tabella</label><input value={action.tabella || ''} onChange={e => onChange({ ...action, tabella: e.target.value })} className={inputSmCls} placeholder="utilizzatori_elettrici" /></div>
        <div><label className="text-[10px] text-gray-500">Campo da accumulare</label><input value={action.accumula_campo || ''} onChange={e => onChange({ ...action, accumula_campo: e.target.value })} className={inputSmCls} placeholder="va" /></div>
        <div><label className="text-[10px] text-gray-500">Raggruppa per</label><input value={action.raggruppa_per || ''} onChange={e => onChange({ ...action, raggruppa_per: e.target.value })} className={inputSmCls} placeholder="uscita_trasf_v" /></div>
        <div><label className="text-[10px] text-gray-500">Output totale</label><input value={action.output_totale || ''} onChange={e => onChange({ ...action, output_totale: e.target.value })} className={inputSmCls} placeholder="_calc.va_totali" /></div>
        <div><label className="text-[10px] text-gray-500">Prefisso output</label><input value={action.output_prefix || ''} onChange={e => onChange({ ...action, output_prefix: e.target.value })} className={inputSmCls} placeholder="_calc.va_richiesti_" /></div>
        <div><label className="text-[10px] text-gray-500">Suffisso output</label><input value={action.output_suffix || ''} onChange={e => onChange({ ...action, output_suffix: e.target.value })} className={inputSmCls} placeholder="v" /></div>
      </div>
      <div>
        <label className="text-[10px] text-gray-500">Campi da verificare nel context ({campi.length})</label>
        <div className="flex flex-wrap gap-1 mt-1">
          {campi.map((c, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 rounded text-xs border border-amber-200">
              {c}
              <button onClick={() => onChange({ ...action, campi_da_verificare: campi.filter((_, j) => j !== i) })} className="hover:text-red-600"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-1 mt-1">
          <input value={newCampo} onChange={e => setNewCampo(e.target.value)} onKeyDown={e => {
            if (e.key === 'Enter' && newCampo.trim()) { onChange({ ...action, campi_da_verificare: [...campi, newCampo.trim()] }); setNewCampo(''); }
          }} className={inputSmCls} placeholder="nome_campo + Invio" />
          <button onClick={() => { if (newCampo.trim()) { onChange({ ...action, campi_da_verificare: [...campi, newCampo.trim()] }); setNewCampo(''); } }}
            className="px-2 py-1 bg-amber-100 text-amber-700 rounded text-xs hover:bg-amber-200 flex-shrink-0"><Plus className="w-3 h-3" /></button>
        </div>
      </div>
    </div>
  );
}

function ActionEditorCatalogMatch({ action, onChange }: { action: RuleAction; onChange: (a: RuleAction) => void }) {
  const cd = action.criteri_dinamici || {};
  const cf = (action.criteri_fissi || []) as any[];
  const ord = action.ordinamento || {};
  const out = action.output || {};
  const [newOutKey, setNewOutKey] = useState('');
  const [newOutVal, setNewOutVal] = useState('');
  const [newCfCol, setNewCfCol] = useState('');
  const [newCfOp, setNewCfOp] = useState('>=');
  const [newCfVal, setNewCfVal] = useState('');

  return (
    <div className="space-y-3">
      <div><label className="text-[10px] text-gray-500">Tabella catalogo</label><input value={action.tabella || ''} onChange={e => onChange({ ...action, tabella: e.target.value })} className={inputSmCls} placeholder="catalogo_trasformatori" /></div>

      <div className="border border-rose-200 rounded p-2 bg-rose-50/30">
        <p className="text-[10px] font-bold text-rose-700 mb-1">Criteri dinamici (generati da _calc.*)</p>
        <div className="grid grid-cols-2 gap-1">
          <div><label className="text-[10px] text-gray-500">Pattern colonna</label><input value={cd.pattern || ''} onChange={e => onChange({ ...action, criteri_dinamici: { ...cd, pattern: e.target.value } })} className={inputSmCls} placeholder="usc_{key}v_va" /></div>
          <div><label className="text-[10px] text-gray-500">Operatore</label><input value={cd.operatore || '>='} onChange={e => onChange({ ...action, criteri_dinamici: { ...cd, operatore: e.target.value } })} className={inputSmCls} /></div>
          <div><label className="text-[10px] text-gray-500">Sorgente prefix</label><input value={cd.sorgente_prefix || ''} onChange={e => onChange({ ...action, criteri_dinamici: { ...cd, sorgente_prefix: e.target.value } })} className={inputSmCls} placeholder="_calc.va_richiesti_" /></div>
          <div><label className="text-[10px] text-gray-500">Sorgente suffix</label><input value={cd.sorgente_suffix || ''} onChange={e => onChange({ ...action, criteri_dinamici: { ...cd, sorgente_suffix: e.target.value } })} className={inputSmCls} placeholder="v" /></div>
        </div>
      </div>

      <div className="border border-rose-200 rounded p-2 bg-rose-50/30">
        <p className="text-[10px] font-bold text-rose-700 mb-1">Criteri fissi ({cf.length})</p>
        {cf.map((c, i) => (
          <div key={i} className="flex items-center gap-1 mb-1">
            <input value={c.colonna || ''} onChange={e => { const arr = [...cf]; arr[i] = { ...arr[i], colonna: e.target.value }; onChange({ ...action, criteri_fissi: arr }); }} className={inputSmCls} placeholder="colonna" />
            <select value={c.operatore || '>='} onChange={e => { const arr = [...cf]; arr[i] = { ...arr[i], operatore: e.target.value }; onChange({ ...action, criteri_fissi: arr }); }} className={inputSmCls + " w-20"}>
              {['>=', '<=', '==', '!=', '>', '<'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <input value={c.valore || ''} onChange={e => { const arr = [...cf]; arr[i] = { ...arr[i], valore: e.target.value }; onChange({ ...action, criteri_fissi: arr }); }} className={inputSmCls} placeholder="{{_calc.var}}" />
            <button onClick={() => onChange({ ...action, criteri_fissi: cf.filter((_, j) => j !== i) })} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <input value={newCfCol} onChange={e => setNewCfCol(e.target.value)} className={inputSmCls} placeholder="colonna" />
          <select value={newCfOp} onChange={e => setNewCfOp(e.target.value)} className={inputSmCls + " w-20"}>{['>=', '<=', '==', '!=', '>', '<'].map(o => <option key={o} value={o}>{o}</option>)}</select>
          <input value={newCfVal} onChange={e => setNewCfVal(e.target.value)} className={inputSmCls} placeholder="valore" />
          <button onClick={() => { if (newCfCol) { onChange({ ...action, criteri_fissi: [...cf, { colonna: newCfCol, operatore: newCfOp, valore: newCfVal }] }); setNewCfCol(''); setNewCfVal(''); } }}
            className="px-2 py-1 bg-rose-100 text-rose-700 rounded text-xs hover:bg-rose-200 flex-shrink-0"><Plus className="w-3 h-3" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div><label className="text-[10px] text-gray-500">Ordina per colonna</label><input value={ord.colonna || ''} onChange={e => onChange({ ...action, ordinamento: { ...ord, colonna: e.target.value } })} className={inputSmCls} placeholder="potenza_va" /></div>
        <div><label className="text-[10px] text-gray-500">Direzione</label><select value={ord.direzione || 'ASC'} onChange={e => onChange({ ...action, ordinamento: { ...ord, direzione: e.target.value } })} className={inputSmCls}><option value="ASC">ASC (più piccolo)</option><option value="DESC">DESC (più grande)</option></select></div>
      </div>

      <div className="border border-rose-200 rounded p-2 bg-rose-50/30">
        <p className="text-[10px] font-bold text-rose-700 mb-1">Output mapping ({Object.keys(out).length})</p>
        {Object.entries(out).map(([k, v], i) => (
          <div key={i} className="flex items-center gap-1 mb-1">
            <input value={k} className={inputSmCls + " bg-gray-50"} readOnly /><span className="text-gray-400 text-xs">←</span>
            <input value={v as string} className={inputSmCls + " bg-gray-50"} readOnly />
            <button onClick={() => { const o = { ...out }; delete o[k]; onChange({ ...action, output: o }); }} className="text-red-400 hover:text-red-600"><X className="w-3 h-3" /></button>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <input value={newOutKey} onChange={e => setNewOutKey(e.target.value)} className={inputSmCls} placeholder="_calc.codice" />
          <span className="text-gray-400 text-xs">←</span>
          <input value={newOutVal} onChange={e => setNewOutVal(e.target.value)} className={inputSmCls} placeholder="colonna_tabella" />
          <button onClick={() => { if (newOutKey && newOutVal) { onChange({ ...action, output: { ...out, [newOutKey]: newOutVal } }); setNewOutKey(''); setNewOutVal(''); } }}
            className="px-2 py-1 bg-rose-100 text-rose-700 rounded text-xs hover:bg-rose-200 flex-shrink-0"><Plus className="w-3 h-3" /></button>
        </div>
      </div>
    </div>
  );
}

function ActionEditorAddMaterial({ action, onChange }: { action: RuleAction; onChange: (a: RuleAction) => void }) {
  const mat = action.material || { codice: '', descrizione: '', quantita: 1, prezzo_unitario: 0, categoria: '', note: '' };
  const updateMat = (field: string, value: any) => onChange({ ...action, material: { ...mat, [field]: value } });

  return (
    <div className="grid grid-cols-4 gap-2">
      <div>
        <label className="text-[10px] text-gray-500">Codice (cerca o placeholder)</label>
        <ArticoloAutocomplete value={mat.codice || ''} field="codice"
          onSelect={(art) => onChange({ ...action, material: { ...mat, codice: art.codice, descrizione: art.descrizione, prezzo_unitario: art.costo_fisso || mat.prezzo_unitario, categoria: art.tipo_articolo || mat.categoria } })}
          placeholder="Codice o {{_calc.var}}" />
      </div>
      <div className="col-span-2">
        <label className="text-[10px] text-gray-500">Descrizione</label>
        <input value={mat.descrizione || ''} onChange={e => updateMat('descrizione', e.target.value)} className={inputSmCls} placeholder="Descrizione o {{_calc.var}}" />
      </div>
      <div><label className="text-[10px] text-gray-500">Categoria</label><input value={mat.categoria || ''} onChange={e => updateMat('categoria', e.target.value)} className={inputSmCls} placeholder="Contattori" /></div>
      <div><label className="text-[10px] text-gray-500">Quantità</label><input type="number" value={mat.quantita ?? 1} onChange={e => updateMat('quantita', parseFloat(e.target.value) || 1)} className={inputSmCls} min={1} /></div>
      <div><label className="text-[10px] text-gray-500">Prezzo unitario</label><input type="number" step="0.01" value={mat.prezzo_unitario ?? 0} onChange={e => updateMat('prezzo_unitario', parseFloat(e.target.value) || 0)} className={inputSmCls} /></div>
      <div className="col-span-2"><label className="text-[10px] text-gray-500">Note</label><input value={mat.note || ''} onChange={e => updateMat('note', e.target.value)} className={inputSmCls} placeholder="Note opzionali o {{campo}}" /></div>
    </div>
  );
}


// =======================================================
// WRAPPER: SINGOLA ACTION CON HEADER + SKIP_IF
// =======================================================
function ActionCard({ action, index, total, onChange, onRemove, onMove }: {
  action: RuleAction; index: number; total: number;
  onChange: (a: RuleAction) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const typeDef = ACTION_TYPES.find(t => t.value === action.action);
  const Icon = typeDef?.icon || Zap;
  const colorMap: Record<string, string> = { green: 'border-green-200 bg-green-50/40', blue: 'border-blue-200 bg-blue-50/40', purple: 'border-purple-200 bg-purple-50/40', violet: 'border-violet-200 bg-violet-50/40', amber: 'border-amber-200 bg-amber-50/40', rose: 'border-rose-200 bg-rose-50/40' };
  const hdrMap: Record<string, string> = { green: 'text-green-700', blue: 'text-blue-700', purple: 'text-purple-700', violet: 'text-violet-700', amber: 'text-amber-700', rose: 'text-rose-700' };

  const summary = !expanded ? (
    action.action === 'add_material' ? action.material?.codice :
    action.action === 'set_field' ? action.field :
    action.action === 'lookup_table' ? action.tabella :
    action.action === 'lookup_multi' ? `${action.tabella} (${(action.input_fields || []).length} chiavi)` :
    action.action === 'accumulate_from_lookup' ? action.tabella :
    action.action === 'catalog_match' ? action.tabella : ''
  ) : '';

  return (
    <div className={`border rounded-lg ${colorMap[typeDef?.color || 'blue'] || 'border-gray-200'}`}>
      <div className="flex items-center justify-between px-3 py-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 font-mono w-5">{index + 1}.</span>
          <Icon className={`w-3.5 h-3.5 ${hdrMap[typeDef?.color || 'blue']}`} />
          <span className={`text-xs font-bold ${hdrMap[typeDef?.color || 'blue']}`}>{typeDef?.label || action.action}</span>
          {action.skip_if && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded border border-yellow-200">skip_if</span>}
          {summary && <span className="text-[10px] text-gray-500 truncate max-w-[200px]">{summary}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          {index > 0 && <button onClick={e => { e.stopPropagation(); onMove(-1); }} className={btnIcon} title="Sposta su"><ChevronDown className="w-3 h-3 rotate-180" /></button>}
          {index < total - 1 && <button onClick={e => { e.stopPropagation(); onMove(1); }} className={btnIcon} title="Sposta giù"><ChevronDown className="w-3 h-3" /></button>}
          <button onClick={e => { e.stopPropagation(); onRemove(); }} className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </div>
      {expanded && (
        <div className="border-t px-3 py-2 space-y-2">
          <div><label className="text-[10px] text-gray-500">skip_if (salta questa azione se la condizione è vera — opzionale)</label>
            <input value={action.skip_if || ''} onChange={e => onChange({ ...action, skip_if: e.target.value || undefined })} className={inputSmCls} placeholder="_calc.va_totali <= 0  |  campo is_empty" /></div>
          {action.action === 'set_field' && <ActionEditorSetField action={action} onChange={onChange} />}
          {action.action === 'lookup_table' && <ActionEditorLookupTable action={action} onChange={onChange} />}
          {action.action === 'lookup_multi' && <ActionEditorLookupMulti action={action} onChange={onChange} />}
          {action.action === 'accumulate_from_lookup' && <ActionEditorAccumulate action={action} onChange={onChange} />}
          {action.action === 'catalog_match' && <ActionEditorCatalogMatch action={action} onChange={onChange} />}
          {action.action === 'add_material' && <ActionEditorAddMaterial action={action} onChange={onChange} />}
        </div>
      )}
    </div>
  );
}


// =======================================================
// TAB 1: EDITOR INTEGRATO
// =======================================================
function EditorRegole({ initialRuleId, onRuleSelect }: { initialRuleId?: string; onRuleSelect?: (rule: Rule | null) => void }) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editRule, setEditRule] = useState<Rule | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'priority' | 'name' | 'date'>('priority');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['conditions', 'actions']));
  const [showAddAction, setShowAddAction] = useState(false);
  const addActionRef = useRef<HTMLDivElement>(null);

  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey: ['regole', sortBy, sortOrder],
    queryFn: async () => { const r = await fetch(`${API}/regole?sort=${sortBy}&order=${sortOrder}`); return r.ok ? r.json() : []; },
  });

  const { data: campiDisponibili = [] } = useQuery<{ field: string; source: string; label: string }[]>({
    queryKey: ['regole-campi'],
    queryFn: async () => { const r = await fetch(`${API}/regole-campi-disponibili`); return r.ok ? r.json() : []; },
  });

  const saveMutation = useMutation({
    mutationFn: async (rule: Rule) => {
      const toSave = JSON.parse(JSON.stringify(rule));
      if (toSave.actions?.length > 0 && (!toSave.materials || toSave.materials.length === 0)) delete toSave.materials;
      if (toSave.materials?.length > 0 && (!toSave.actions || toSave.actions.length === 0)) delete toSave.actions;
      if (!toSave.conditions || toSave.conditions.length === 0) toSave.conditions = [];
      const url = isNew ? `${API}/regole` : `${API}/regole/${rule.id}`;
      const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toSave) });
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

  useEffect(() => {
    if (initialRuleId && rules.length > 0 && !editRule) {
      const found = rules.find(r => r.id === initialRuleId);
      if (found) selectRule(found);
    }
  }, [initialRuleId, rules]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (addActionRef.current && !addActionRef.current.contains(e.target as Node)) setShowAddAction(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectRule = (rule: Rule) => {
    setSelectedId(rule.id);
    const clone: Rule = JSON.parse(JSON.stringify(rule));
    if (!Array.isArray(clone.conditions)) clone.conditions = [];
    let actions: RuleAction[] = clone.actions ? [...clone.actions] : [];
    // Converti materials legacy in actions add_material
    if (clone.materials && clone.materials.length > 0 && actions.filter(a => a.action === 'add_material').length === 0) {
      for (const mat of clone.materials) actions.push({ action: 'add_material', material: mat });
    }
    clone.actions = actions;
    if (actions.length > 0) clone.materials = [];
    setEditRule(clone);
    setIsNew(false);
    onRuleSelect?.(rule);
  };

  const newRule = () => { const r = JSON.parse(JSON.stringify(emptyRule)); r.id = `RULE_${Date.now()}`; setEditRule(r); setSelectedId(null); setIsNew(true); };
  const duplicateRule = (rule: Rule) => { selectRule(rule); setTimeout(() => { setEditRule(prev => prev ? { ...prev, id: `${rule.id}_COPY`, name: `${rule.name} (copia)` } : null); setSelectedId(null); setIsNew(true); }, 0); };

  const updateField = (path: string, value: any) => {
    if (!editRule) return;
    const r = { ...editRule } as any;
    const parts = path.split('.');
    let obj = r;
    for (let i = 0; i < parts.length - 1; i++) obj = obj[parts[i]];
    obj[parts[parts.length - 1]] = value;
    setEditRule({ ...r });
  };

  const updateCondition = (index: number, field: string, value: any) => {
    if (!editRule) return;
    const arr = [...(editRule.conditions || [])];
    (arr[index] as any)[field] = value;
    setEditRule({ ...editRule, conditions: arr });
  };
  const addCondition = () => { if (!editRule) return; setEditRule({ ...editRule, conditions: [...(editRule.conditions || []), { field: '', operator: 'equals', value: '' }] }); };
  const removeCondition = (index: number) => { if (!editRule) return; setEditRule({ ...editRule, conditions: (editRule.conditions || []).filter((_, i) => i !== index) }); };

  const updateAction = (index: number, a: RuleAction) => { if (!editRule) return; const arr = [...(editRule.actions || [])]; arr[index] = a; setEditRule({ ...editRule, actions: arr }); };
  const addAction = (type: string) => { if (!editRule) return; setEditRule({ ...editRule, actions: [...(editRule.actions || []), JSON.parse(JSON.stringify(EMPTY_ACTIONS[type] || { action: type }))] }); };
  const removeAction = (index: number) => { if (!editRule) return; setEditRule({ ...editRule, actions: (editRule.actions || []).filter((_, i) => i !== index) }); };
  const moveAction = (index: number, dir: -1 | 1) => { if (!editRule) return; const arr = [...(editRule.actions || [])]; const n = index + dir; if (n < 0 || n >= arr.length) return; [arr[index], arr[n]] = [arr[n], arr[index]]; setEditRule({ ...editRule, actions: arr }); };

  const toggleSection = (s: string) => { setExpandedSections(prev => { const next = new Set(prev); next.has(s) ? next.delete(s) : next.add(s); return next; }); };

  const filteredRules = useMemo(() => {
    const seen = new Set<string>();
    return rules.filter(r => { if (seen.has(r.id)) return false; seen.add(r.id);
      return !searchTerm || r.name?.toLowerCase().includes(searchTerm.toLowerCase()) || r.id?.toLowerCase().includes(searchTerm.toLowerCase())
        || (r.group || '').toLowerCase().includes(searchTerm.toLowerCase()); });
  }, [rules, searchTerm]);

  // Gruppi disponibili per il datalist
  const availableGroups = useMemo(() => {
    const groups = new Set<string>();
    rules.forEach(r => { if (r.group) groups.add(r.group); });
    return Array.from(groups).sort();
  }, [rules]);

  // Regole raggruppate per cartella
  const groupedRules = useMemo(() => {
    const groups: Record<string, Rule[]> = {};
    for (const rule of filteredRules) {
      const g = rule.group || '';
      if (!groups[g]) groups[g] = [];
      groups[g].push(rule);
    }
    // Ordina: cartelle nominate prima (alfabetico), poi "senza cartella"
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (!a) return 1; if (!b) return -1;
      return a.localeCompare(b, 'it');
    });
    return sortedKeys.map(k => ({ group: k, rules: groups[k] }));
  }, [filteredRules]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (g: string) => {
    setCollapsedGroups(prev => { const next = new Set(prev); next.has(g) ? next.delete(g) : next.add(g); return next; });
  };

  // Render singola riga regola nella sidebar
  const renderRuleItem = (rule: Rule) => {
    const nCond = rule.conditions?.length || 0;
    const nAct = rule.actions?.length || 0;
    const nMat = (rule.materials?.length || 0) + (rule.actions || []).filter(a => a.action === 'add_material').length;
    const hasAdvanced = (rule.actions || []).some(a => a.action !== 'add_material');
    const isFromImport = rule._source === 'excel_import' || rule._source === 'excel_import_v3';
    const hasTodo = JSON.stringify(rule).includes('TODO.');
    const isDraft = isFromImport && !rule.enabled;
    return (
      <div onClick={() => selectRule(rule)}
        className={`px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${
          selectedId === rule.id ? 'bg-indigo-50 border-l-2 border-indigo-600' :
          isFromImport ? 'border-l-2 border-teal-400' : ''
        }`}>
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm text-gray-900 truncate flex-1">{rule.name || rule.id}</span>
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[10px] text-gray-400">P{rule.priority}</span>
            <button onClick={e => { e.stopPropagation(); toggleMutation.mutate({ rule, enabled: !rule.enabled }); }} className={btnIcon} title={rule.enabled ? 'Disabilita' : 'Abilita'}>
              {rule.enabled ? <Power className="w-3.5 h-3.5 text-green-600" /> : <PowerOff className="w-3.5 h-3.5 text-red-400" />}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 truncate mt-0.5">{rule.description || rule.id}</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {isFromImport && (
            <span className="text-[10px] px-1.5 py-0.5 bg-teal-50 text-teal-700 rounded font-semibold" title={`Da ${rule._source_file || 'Excel'} — ${rule._imported_at || ''}`}>
              📥 da Excel
            </span>
          )}
          {hasTodo && (
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold">
              ⚠ TODO
            </span>
          )}
          {isDraft && (
            <span className="text-[10px] px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded font-semibold">
              📝 bozza
            </span>
          )}
          <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{nCond} cond</span>
          {nAct > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded">{nAct} azioni</span>}
          {nMat > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-green-50 text-green-700 rounded">{nMat} mat</span>}
          {hasAdvanced && !isFromImport && <span className="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">avanzata</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-240px)]">
      {/* Lista regole */}
      <div className="w-80 flex-shrink-0 bg-white rounded-lg shadow flex flex-col">
        <div className="p-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 flex items-center gap-2"><Settings2 className="w-4 h-4 text-indigo-600" /> Regole ({rules.length})</h3>
            <button onClick={newRule} className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700"><Plus className="w-3.5 h-3.5" /> Nuova</button>
          </div>
          <div className="relative"><Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
            <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Cerca regole..." className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-400" /></div>
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
            {(['priority', 'name', 'date'] as const).map(s => (
              <button key={s} onClick={() => {
                if (sortBy === s) setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
                else { setSortBy(s); setSortOrder(s === 'date' ? 'desc' : 'asc'); }
              }} className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                sortBy === s ? 'bg-indigo-100 border-indigo-300 text-indigo-700 font-bold' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
              }`}>{s === 'priority' ? 'Priorità' : s === 'name' ? 'A→Z' : 'Data'}
                {sortBy === s && <span className="ml-0.5">{sortOrder === 'asc' ? '↑' : '↓'}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && <div className="p-4 text-center text-gray-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Caricamento...</div>}
          {groupedRules.map(({ group, rules: groupRules }) => {
            const isUngrouped = !group;
            const isCollapsed = collapsedGroups.has(group);
            // Se c'è solo il gruppo "senza cartella" e nessun altro gruppo, non mostrare l'header
            const showHeader = !(isUngrouped && groupedRules.length === 1);
            return (
              <div key={group || '__ungrouped__'}>
                {showHeader && (
                  <div onClick={() => toggleGroup(group)}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-t cursor-pointer hover:bg-gray-100 sticky top-0 z-10">
                    {isCollapsed
                      ? <><FolderOpen className="w-3.5 h-3.5 text-gray-400" /><ChevronRight className="w-3 h-3 text-gray-400" /></>
                      : <><Folder className="w-3.5 h-3.5 text-indigo-500" /><ChevronDown className="w-3 h-3 text-gray-400" /></>}
                    <span className="text-xs font-bold text-gray-700 flex-1">{isUngrouped ? 'Senza cartella' : group}</span>
                    <span className="text-[10px] text-gray-400">{groupRules.length}</span>
                  </div>
                )}
                {!isCollapsed && (
                  <div className="divide-y">
                    {groupRules.map((rule, idx) => (
                      <div key={`${rule.id}_${idx}`}>{renderRuleItem(rule)}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!isLoading && filteredRules.length === 0 && <div className="p-4 text-center text-gray-400 text-sm">{searchTerm ? 'Nessun risultato' : 'Nessuna regola. Clicca "Nuova".'}</div>}
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 bg-white rounded-lg shadow flex flex-col overflow-hidden">
        {!editRule ? (
          <div className="flex-1 flex items-center justify-center text-gray-400"><div className="text-center"><Settings2 className="w-12 h-12 mx-auto mb-3 opacity-30" /><p>Seleziona una regola o creane una nuova</p></div></div>
        ) : (
          <>
            <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-gray-900">{isNew ? 'Nuova Regola' : `Modifica: ${editRule.name || editRule.id}`}</h3>
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${editRule.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>{editRule.enabled ? 'Attiva' : 'Disattiva'}</span>
              </div>
              <div className="flex items-center gap-2">
                {!isNew && <>
                  <button onClick={() => duplicateRule(editRule)} className={btnIcon} title="Duplica"><Copy className="w-4 h-4" /></button>
                  <button onClick={() => { if (confirm('Eliminare questa regola?')) deleteMutation.mutate(editRule.id); }} className="p-1.5 rounded hover:bg-red-50 text-red-500 hover:text-red-700" title="Elimina"><Trash2 className="w-4 h-4" /></button>
                </>}
                <button onClick={() => saveMutation.mutate(editRule)} disabled={saveMutation.isPending || !editRule.id || !editRule.name}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salva
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Info base */}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-medium text-gray-600 mb-1 block">ID Regola *</label>
                  <input value={editRule.id} onChange={e => updateField('id', e.target.value.toUpperCase().replace(/\s/g, '_'))} className={inputCls} placeholder="ES: CONTATTORI_OLEO" disabled={!isNew} /></div>
                <div><label className="text-xs font-medium text-gray-600 mb-1 block">Nome *</label>
                  <input value={editRule.name} onChange={e => updateField('name', e.target.value)} className={inputCls} placeholder="Selezione contattori oleo" /></div>
                <div><label className="text-xs font-medium text-gray-600 mb-1 block">Descrizione</label>
                  <input value={editRule.description || ''} onChange={e => updateField('description', e.target.value)} className={inputCls} placeholder="Descrizione opzionale" /></div>
                <div><label className="text-xs font-medium text-gray-600 mb-1 block">Cartella</label>
                  <input value={editRule.group || ''} onChange={e => updateField('group', e.target.value)} className={inputCls} placeholder="Es: Contattori, Normative..." list="rule-groups-list" />
                  <datalist id="rule-groups-list">{availableGroups.map(g => <option key={g} value={g} />)}</datalist></div>
                <div><label className="text-xs font-medium text-gray-600 mb-1 block">Priorità (1=alta)</label>
                  <input type="number" value={editRule.priority} onChange={e => updateField('priority', parseInt(e.target.value) || 50)} className={inputCls} min={1} max={100} /></div>
                <div className="flex items-end"><label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={editRule.enabled} onChange={e => updateField('enabled', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-indigo-600" />
                  <span className="text-sm text-gray-700">Regola attiva</span></label></div>
              </div>

              {/* CONDIZIONI */}
              <div className="border rounded-lg">
                <button onClick={() => toggleSection('conditions')} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                  <span className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    {expandedSections.has('conditions') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Condizioni ({(editRule.conditions || []).length})
                  </span>
                  <span onClick={e => { e.stopPropagation(); addCondition(); }} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Aggiungi</span>
                </button>
                {expandedSections.has('conditions') && (
                  <div className="border-t px-4 py-3 space-y-2">
                    <p className="text-xs text-gray-500 mb-2">Tutte le condizioni devono essere soddisfatte (AND). Se vuoto, la regola si applica sempre.</p>
                    {(editRule.conditions || []).map((cond, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                        <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                        <select value={cond.field} onChange={e => updateCondition(idx, 'field', e.target.value)} className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                          <option value="">-- Campo --</option>
                          {Object.entries(campiDisponibili.reduce((acc: Record<string, typeof campiDisponibili>, c) => { if (!acc[c.source]) acc[c.source] = []; acc[c.source].push(c); return acc; }, {})).map(([source, fields]) => (
                            <optgroup key={source} label={source}>{fields.map(f => (<option key={f.field} value={f.field}>{f.label}</option>))}</optgroup>
                          ))}
                        </select>
                        <select value={cond.operator} onChange={e => updateCondition(idx, 'operator', e.target.value)} className="w-40 border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                          {OPERATORS.map(op => (<option key={op.value} value={op.value}>{op.label}</option>))}
                        </select>
                        <input value={typeof cond.value === 'object' ? JSON.stringify(cond.value) : cond.value}
                          onChange={e => { let v: any = e.target.value; if (cond.operator === 'in') { try { v = JSON.parse(v); } catch { } } updateCondition(idx, 'value', v); }}
                          className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder={cond.operator === 'in' ? '["val1","val2"]' : 'Valore'} />
                        <button onClick={() => removeCondition(idx)} className={btnIcon}><X className="w-3.5 h-3.5 text-red-400" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AZIONI */}
              <div className="border rounded-lg border-purple-200">
                <button onClick={() => toggleSection('actions')} className="w-full flex items-center justify-between px-4 py-3 hover:bg-purple-50/30">
                  <span className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    {expandedSections.has('actions') ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <Zap className="w-4 h-4 text-purple-600" />
                    Azioni ({(editRule.actions || []).length})
                  </span>
                  <div ref={addActionRef} className="relative">
                    <span onClick={e => { e.stopPropagation(); setShowAddAction(!showAddAction); }} className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1 cursor-pointer"><Plus className="w-3.5 h-3.5" /> Aggiungi azione</span>
                    {showAddAction && (
                      <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-56">
                        {ACTION_TYPES.map(at => { const Ic = at.icon; return (
                          <button key={at.value} onClick={e => { e.stopPropagation(); addAction(at.value); setShowAddAction(false); }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2 text-sm"><Ic className="w-4 h-4 text-gray-500" />{at.label}</button>
                        ); })}
                      </div>
                    )}
                  </div>
                </button>
                {expandedSections.has('actions') && (
                  <div className="border-t px-4 py-3 space-y-2">
                    <p className="text-xs text-gray-500 mb-2">Le azioni si eseguono in sequenza dall'alto verso il basso. Ogni azione aggiorna il context per le successive.</p>
                    {(editRule.actions || []).length === 0 && <p className="text-center text-gray-400 text-sm py-4">Nessuna azione. Clicca "Aggiungi azione" per iniziare.</p>}
                    {(editRule.actions || []).map((act, idx) => (
                      <ActionCard key={idx} action={act} index={idx} total={(editRule.actions || []).length}
                        onChange={a => updateAction(idx, a)} onRemove={() => removeAction(idx)} onMove={dir => moveAction(idx, dir)} />
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
// COMPONENTE PRINCIPALE
// =======================================================
export default function RuleBuilderPage({ initialRuleId }: { initialRuleId?: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg"><Settings2 className="h-5 w-5 text-white" /></div>
          <div><h2 className="text-xl font-bold text-slate-900">Rule Engine</h2><p className="text-sm text-slate-500">Gestione regole per calcolo automatico materiali e prezzi</p></div>
        </div>
      </div>
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg px-4 py-2.5">
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span><strong>Editor Regole:</strong> Crea e modifica regole con condizioni, azioni avanzate (lookup, calcolo, catalogo) e materiali.</span>
          <span className="text-slate-400">|</span>
          <span>Salva in <code className="bg-white/60 px-1 rounded">./rules/</code></span>
        </div>
      </div>
      <EditorRegole initialRuleId={initialRuleId} />
    </div>
  );
}
