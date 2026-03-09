import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, ChevronDown, ChevronUp, Play, Code, Eye, EyeOff, GripVertical, X, Check } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface Parametro {
  nome: string;
  valore: number | string;
  descrizione?: string;
}

interface VariabileDerivata {
  id?: number;
  nome: string;
  descrizione?: string;
  formula: string;
  parametri: Parametro[];
  tipo_risultato: 'numero' | 'intero' | 'booleano' | 'testo';
  unita_misura?: string;
  attivo: boolean;
  ordine: number;
  scope?: string;
  tipo_variabile: 'flat';
  dipendenze: string[];
  meta: Record<string, unknown>;
}

interface CampoContesto {
  nome: string;
  valore_esempio: unknown;
  tipo: string;
}

const API = (window as any).__API_BASE__ || '';

// ─────────────────────────────────────────────────────────────────────────────
// API CALLS
// ─────────────────────────────────────────────────────────────────────────────

const api = {
  getAll: async (): Promise<VariabileDerivata[]> => {
    const r = await fetch(`${API}/variabili-derivate`);
    if (!r.ok) throw new Error('Errore caricamento');
    return r.json();
  },
  create: async (data: Omit<VariabileDerivata, 'id'>): Promise<{ id: number }> => {
    const r = await fetch(`${API}/variabili-derivate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || 'Errore creazione');
    }
    return r.json();
  },
  update: async (id: number, data: Partial<VariabileDerivata>): Promise<void> => {
    const r = await fetch(`${API}/variabili-derivate/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || 'Errore aggiornamento');
    }
  },
  delete: async (id: number): Promise<void> => {
    const r = await fetch(`${API}/variabili-derivate/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error('Errore eliminazione');
  },
  testa: async (payload: {
    formula: string;
    parametri: Parametro[];
    tipo_risultato: string;
    contesto_test: Record<string, unknown>;
  }): Promise<{ status: string; valore: unknown; errore?: string }> => {
    const r = await fetch(`${API}/variabili-derivate/testa`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  },
  getContesto: async (preventivoId: number): Promise<{ campi: CampoContesto[] }> => {
    const r = await fetch(`${API}/variabili-derivate/contesto-disponibile/${preventivoId}`);
    if (!r.ok) throw new Error('Errore contesto');
    return r.json();
  },
};

const VUOTA: Omit<VariabileDerivata, 'id'> = {
  nome: '',
  descrizione: '',
  formula: '',
  parametri: [],
  tipo_risultato: 'numero',
  unita_misura: '',
  attivo: true,
  ordine: 0,
  tipo_variabile: 'flat',
  dipendenze: [],
  meta: {},
};

// ─────────────────────────────────────────────────────────────────────────────
// FORMULA EDITOR con autocomplete
// ─────────────────────────────────────────────────────────────────────────────

interface FormulaEditorProps {
  value: string;
  onChange: (v: string) => void;
  campiDisponibili: CampoContesto[];
  parametri: Parametro[];
}

function FormulaEditor({ value, onChange, campiDisponibili, parametri }: FormulaEditorProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggIdx, setSuggIdx] = useState(0);
  const [cursorWord, setCursorWord] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const allTokens = [
    ...campiDisponibili.map(c => c.nome),
    ...parametri.map(p => p.nome),
    'if(', 'ceil(', 'floor(', 'round(', 'abs(', 'min(', 'max(', 'sqrt(',
  ].filter(Boolean);

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const match = before.match(/[a-zA-Z_][a-zA-Z0-9_.]*$/);
    const word = match ? match[0] : '';
    setCursorWord(word);

    if (word.length >= 2) {
      const filtered = allTokens.filter(t => t.toLowerCase().includes(word.toLowerCase()) && t !== word);
      setSuggestions(filtered.slice(0, 8));
      setSuggIdx(0);
    } else {
      setSuggestions([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setSuggIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSuggIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Tab' || e.key === 'Enter') {
      if (suggestions.length > 0) {
        e.preventDefault();
        applySuggestion(suggestions[suggIdx]);
      }
    }
    if (e.key === 'Escape') setSuggestions([]);
  };

  const applySuggestion = (sugg: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const after = ta.value.slice(pos);
    const match = before.match(/[a-zA-Z_][a-zA-Z0-9_.]*$/);
    const wordStart = match ? pos - match[0].length : pos;
    const newVal = before.slice(0, wordStart) + sugg + after;
    onChange(newVal);
    setSuggestions([]);
    // Rimetti focus dopo il token inserito
    setTimeout(() => {
      if (ta) {
        const newPos = wordStart + sugg.length;
        ta.setSelectionRange(newPos, newPos);
        ta.focus();
      }
    }, 0);
  };

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyUp={handleKeyUp}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
        rows={3}
        placeholder="es: corsa + param_testa + vano.qm_distanza"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
      />
      {suggestions.length > 0 && (
        <div className="absolute z-50 left-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={() => applySuggestion(s)}
              className={`w-full text-left px-3 py-1.5 text-sm font-mono hover:bg-blue-50 ${i === suggIdx ? 'bg-blue-100 text-blue-900' : 'text-gray-700'}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400 mt-1">
        Digita 2+ caratteri per autocomplete · Tab per selezionare · Usa <code className="bg-gray-100 px-1 rounded">if(cond, val_vero, val_falso)</code> per condizionali
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER CONDIZIONALE GUIDATO
// ─────────────────────────────────────────────────────────────────────────────

interface ConditionalBuilderProps {
  campiDisponibili: CampoContesto[];
  parametri: Parametro[];
  onInsert: (snippet: string) => void;
}

function ConditionalBuilder({ campiDisponibili, parametri, onInsert }: ConditionalBuilderProps) {
  const [campo, setCampo] = useState('');
  const [op, setOp] = useState('==');
  const [valore, setValore] = useState('');
  const [seVero, setSeVero] = useState('');
  const [seFalso, setSeFalso] = useState('');
  const [open, setOpen] = useState(false);

  const allTokens = [...campiDisponibili.map(c => c.nome), ...parametri.map(p => p.nome)];

  const genera = () => {
    if (!campo || !seVero || !seFalso) return;
    const snippet = `if(${campo} ${op} ${valore.includes("'") || isNaN(Number(valore)) ? `'${valore}'` : valore}, ${seVero}, ${seFalso})`;
    onInsert(snippet);
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-blue-600 hover:text-blue-800 underline"
      >
        + Aggiungi condizionale guidato
      </button>
    );
  }

  return (
    <div className="mt-2 p-3 border border-blue-200 rounded-lg bg-blue-50 space-y-2">
      <p className="text-xs font-semibold text-blue-800">Builder condizionale — genera if(condizione, se_vero, se_falso)</p>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-600 block mb-1">Campo</label>
          <select value={campo} onChange={e => setCampo(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1">
            <option value="">Seleziona...</option>
            {allTokens.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Operatore</label>
          <select value={op} onChange={e => setOp(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1">
            {['==','!=','>','<','>=','<='].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Valore</label>
          <input value={valore} onChange={e => setValore(e.target.value)} placeholder="es: oleodinamica" className="w-full text-xs border border-gray-300 rounded px-2 py-1" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-600 block mb-1">Se vero</label>
          <input value={seVero} onChange={e => setSeVero(e.target.value)} placeholder="es: corsa * 2" className="w-full text-xs border border-gray-300 rounded px-2 py-1 font-mono" />
        </div>
        <div>
          <label className="text-xs text-gray-600 block mb-1">Se falso</label>
          <input value={seFalso} onChange={e => setSeFalso(e.target.value)} placeholder="es: corsa" className="w-full text-xs border border-gray-300 rounded px-2 py-1 font-mono" />
        </div>
      </div>
      {campo && seVero && seFalso && (
        <div className="text-xs font-mono bg-white border border-gray-200 rounded px-2 py-1 text-gray-700">
          Preview: if({campo} {op} {valore}, {seVero}, {seFalso})
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={genera} disabled={!campo || !seVero || !seFalso} className="text-xs bg-blue-600 text-white rounded px-3 py-1 disabled:opacity-40">
          Inserisci
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:text-gray-700">
          Annulla
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITOR VARIABILE (form completo)
// ─────────────────────────────────────────────────────────────────────────────

interface EditorVariabileProps {
  variabile: Omit<VariabileDerivata, 'id'> & { id?: number };
  campiDisponibili: CampoContesto[];
  onSave: (v: Omit<VariabileDerivata, 'id'> & { id?: number }) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function EditorVariabile({ variabile, campiDisponibili, onSave, onCancel, isSaving }: EditorVariabileProps) {
  const [form, setForm] = useState({ ...variabile });
  const [showJson, setShowJson] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [testCtx, setTestCtx] = useState<Record<string, unknown>>({});
  const [testResult, setTestResult] = useState<{ status: string; valore: unknown; errore?: string } | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const set = (k: keyof typeof form, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const addParametro = () => {
    set('parametri', [...form.parametri, { nome: '', valore: 0, descrizione: '' }]);
  };

  const updateParametro = (i: number, k: keyof Parametro, v: unknown) => {
    const p = [...form.parametri];
    (p[i] as any)[k] = v;
    set('parametri', p);
  };

  const removeParametro = (i: number) => {
    set('parametri', form.parametri.filter((_, idx) => idx !== i));
  };

  const insertSnippet = (snippet: string) => {
    set('formula', form.formula ? `${form.formula} + ${snippet}` : snippet);
  };

  const runTest = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await api.testa({
        formula: form.formula,
        parametri: form.parametri,
        tipo_risultato: form.tipo_risultato,
        contesto_test: testCtx,
      });
      setTestResult(res);
    } catch {
      setTestResult({ status: 'error', valore: null, errore: 'Errore connessione' });
    } finally {
      setTestLoading(false);
    }
  };

  const toggleJson = () => {
    if (!showJson) {
      setJsonText(JSON.stringify(form, null, 2));
    } else {
      try {
        const parsed = JSON.parse(jsonText);
        setForm(f => ({ ...f, ...parsed }));
      } catch {
        toast.error('JSON non valido');
        return;
      }
    }
    setShowJson(v => !v);
  };

  // Costruisci contesto test dai campi disponibili con valori di esempio
  const initTestCtx = () => {
    const ctx: Record<string, unknown> = {};
    for (const c of campiDisponibili) {
      if (c.valore_esempio !== null && c.valore_esempio !== undefined) {
        ctx[c.nome] = c.valore_esempio;
      }
    }
    setTestCtx(ctx);
    toast.success('Contesto di test inizializzato con valori di esempio');
  };

  return (
    <div className="space-y-5">
      {/* Header toggle JSON */}
      <div className="flex justify-end">
        <button type="button" onClick={toggleJson} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2 py-1">
          <Code size={12} />
          {showJson ? 'Vista form' : 'Modifica JSON'}
        </button>
      </div>

      {showJson ? (
        <textarea
          value={jsonText}
          onChange={e => setJsonText(e.target.value)}
          rows={16}
          className="w-full font-mono text-xs border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
        />
      ) : (
        <>
          {/* Nome + tipo */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                value={form.nome}
                onChange={e => set('nome', e.target.value.replace(/\s+/g, '_').toLowerCase())}
                placeholder="es: lunghezza_cavo_vano"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Usata come <code className="bg-gray-100 px-1 rounded">_vd.{form.nome || 'nome'}</code> nelle regole</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo risultato</label>
              <select
                value={form.tipo_risultato}
                onChange={e => set('tipo_risultato', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="numero">Numero (float)</option>
                <option value="intero">Intero</option>
                <option value="booleano">Booleano</option>
                <option value="testo">Testo</option>
              </select>
            </div>
          </div>

          {/* Descrizione + unità */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
              <input
                value={form.descrizione || ''}
                onChange={e => set('descrizione', e.target.value)}
                placeholder="A cosa serve questa variabile"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unità misura</label>
              <input
                value={form.unita_misura || ''}
                onChange={e => set('unita_misura', e.target.value)}
                placeholder="m, kg, kW..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Parametri configurabili */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Parametri configurabili</label>
              <button type="button" onClick={addParametro} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                <Plus size={12} /> Aggiungi parametro
              </button>
            </div>
            {form.parametri.length === 0 && (
              <p className="text-xs text-gray-400 italic">Nessun parametro — la formula usa solo campi di input</p>
            )}
            <div className="space-y-2">
              {form.parametri.map((p, i) => (
                <div key={i} className="flex gap-2 items-start p-2 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <input
                      value={p.nome}
                      onChange={e => updateParametro(i, 'nome', e.target.value.replace(/\s+/g, '_').toLowerCase())}
                      placeholder="nome_param"
                      className="px-2 py-1 text-xs border border-gray-300 rounded font-mono"
                    />
                    <input
                      type="number"
                      step="any"
                      value={p.valore as number}
                      onChange={e => updateParametro(i, 'valore', parseFloat(e.target.value) || 0)}
                      placeholder="Valore"
                      className="px-2 py-1 text-xs border border-gray-300 rounded"
                    />
                    <input
                      value={p.descrizione || ''}
                      onChange={e => updateParametro(i, 'descrizione', e.target.value)}
                      placeholder="Descrizione (opzionale)"
                      className="px-2 py-1 text-xs border border-gray-300 rounded"
                    />
                  </div>
                  <button type="button" onClick={() => removeParametro(i)} className="text-red-400 hover:text-red-600 mt-1">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Formula */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Formula *</label>
            <FormulaEditor
              value={form.formula}
              onChange={v => set('formula', v)}
              campiDisponibili={campiDisponibili}
              parametri={form.parametri}
            />
            <ConditionalBuilder
              campiDisponibili={campiDisponibili}
              parametri={form.parametri}
              onInsert={insertSnippet}
            />
          </div>

          {/* Test formula */}
          <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <Play size={14} className="text-green-600" /> Testa formula
              </span>
              <button type="button" onClick={initTestCtx} className="text-xs text-blue-600 hover:underline">
                Carica valori di esempio
              </button>
            </div>
            <div className="mb-2">
              <label className="text-xs text-gray-500 block mb-1">Contesto di test (JSON)</label>
              <textarea
                value={JSON.stringify(testCtx, null, 2)}
                onChange={e => { try { setTestCtx(JSON.parse(e.target.value)); } catch {} }}
                rows={4}
                className="w-full font-mono text-xs border border-gray-300 rounded px-2 py-1"
              />
            </div>
            <button
              type="button"
              onClick={runTest}
              disabled={!form.formula || testLoading}
              className="flex items-center gap-1.5 bg-green-600 text-white text-xs rounded px-3 py-1.5 disabled:opacity-40 hover:bg-green-700"
            >
              <Play size={12} />
              {testLoading ? 'Calcolo...' : 'Esegui test'}
            </button>
            {testResult && (
              <div className={`mt-2 px-3 py-2 rounded text-sm ${testResult.status === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                {testResult.status === 'ok' ? (
                  <span>Risultato: <strong className="font-mono">{String(testResult.valore)}</strong> {form.unita_misura}</span>
                ) : (
                  <span>Errore: {testResult.errore}</span>
                )}
              </div>
            )}
          </div>

          {/* Attivo */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="attivo" checked={form.attivo} onChange={e => set('attivo', e.target.checked)} className="w-4 h-4 accent-blue-600" />
            <label htmlFor="attivo" className="text-sm text-gray-700">Variabile attiva</label>
          </div>
        </>
      )}

      {/* Azioni */}
      <div className="flex gap-3 pt-2 border-t border-gray-200">
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={isSaving || !form.nome || !form.formula}
          className="flex items-center gap-1.5 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-40 hover:bg-blue-700"
        >
          <Check size={14} />
          {isSaving ? 'Salvataggio...' : (form.id ? 'Salva modifiche' : 'Crea variabile')}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-200 rounded-lg">
          Annulla
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGINA PRINCIPALE
// ─────────────────────────────────────────────────────────────────────────────

export default function GestioneVariabiliDerivatePage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<(Omit<VariabileDerivata, 'id'> & { id?: number }) | null>(null);
  const [preventivoIdTest, setPreventivoIdTest] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: variabili = [], isLoading } = useQuery({
    queryKey: ['variabili-derivate'],
    queryFn: api.getAll,
  });

  const { data: contestoData } = useQuery({
    queryKey: ['variabili-derivate-contesto', preventivoIdTest],
    queryFn: () => preventivoIdTest ? api.getContesto(preventivoIdTest) : Promise.resolve({ campi: [] }),
    enabled: !!preventivoIdTest,
  });

  const campiDisponibili = contestoData?.campi ?? [];

  const saveMutation = useMutation({
    mutationFn: async (v: Omit<VariabileDerivata, 'id'> & { id?: number }) => {
      if (v.id) return api.update(v.id, v);
      return api.create(v as Omit<VariabileDerivata, 'id'>);
    },
    onSuccess: () => {
      toast.success(editing?.id ? 'Variabile aggiornata' : 'Variabile creata');
      qc.invalidateQueries({ queryKey: ['variabili-derivate'] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(id),
    onSuccess: () => {
      toast.success('Variabile eliminata');
      qc.invalidateQueries({ queryKey: ['variabili-derivate'] });
    },
    onError: () => toast.error('Errore eliminazione'),
  });

  const handleNew = () => setEditing({ ...VUOTA, ordine: variabili.length });
  const handleEdit = (v: VariabileDerivata) => setEditing({ ...v });
  const handleDelete = (id: number, nome: string) => {
    if (confirm(`Eliminare la variabile "${nome}"?`)) deleteMutation.mutate(id);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Variabili Derivate</h1>
          <p className="text-gray-500 text-sm mt-1">
            Valori calcolati a partire dai campi di input, disponibili nelle regole come <code className="bg-gray-100 px-1 rounded text-xs">_vd.nome_variabile</code>
          </p>
        </div>
        <button
          onClick={handleNew}
          className="flex items-center gap-2 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-blue-700"
        >
          <Plus size={16} /> Nuova variabile
        </button>
      </div>

      {/* Contesto test */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
        <span className="text-sm text-blue-800 font-medium">Preventivo per autocomplete e test:</span>
        <input
          type="number"
          value={preventivoIdTest || ''}
          onChange={e => setPreventivoIdTest(e.target.value ? parseInt(e.target.value) : null)}
          placeholder="ID preventivo"
          className="w-32 px-2 py-1 text-sm border border-blue-300 rounded"
        />
        {campiDisponibili.length > 0 && (
          <span className="text-xs text-blue-600">{campiDisponibili.length} campi disponibili</span>
        )}
      </div>

      {/* Editor (nuovo/modifica) */}
      {editing && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editing.id ? `Modifica: ${editing.nome}` : 'Nuova variabile derivata'}
          </h2>
          <EditorVariabile
            variabile={editing}
            campiDisponibili={campiDisponibili}
            onSave={v => saveMutation.mutate(v)}
            onCancel={() => setEditing(null)}
            isSaving={saveMutation.isPending}
          />
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Caricamento...</div>
      ) : variabili.length === 0 && !editing ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">Nessuna variabile derivata</p>
          <p className="text-sm">Crea la prima per iniziare</p>
        </div>
      ) : (
        <div className="space-y-2">
          {variabili.map(v => (
            <div key={v.id} className={`bg-white rounded-xl border shadow-sm transition-all ${!v.attivo ? 'opacity-60' : ''}`}>
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 rounded-xl"
                onClick={() => setExpanded(expanded === v.id ? null : (v.id ?? null))}
              >
                <GripVertical size={16} className="text-gray-300" />

                {/* Nome + badge */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-gray-900 text-sm">{v.nome}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{v.tipo_risultato}</span>
                    {v.unita_misura && <span className="text-xs text-gray-400">[{v.unita_misura}]</span>}
                    {!v.attivo && <span className="text-xs bg-yellow-100 text-yellow-700 rounded px-1.5 py-0.5">disattiva</span>}
                    {v.parametri.length > 0 && (
                      <span className="text-xs bg-blue-50 text-blue-600 rounded px-1.5 py-0.5">
                        {v.parametri.length} param
                      </span>
                    )}
                  </div>
                  {v.descrizione && <p className="text-xs text-gray-400 mt-0.5 truncate">{v.descrizione}</p>}
                  <code className="text-xs text-gray-500 font-mono truncate block mt-0.5 max-w-xl">{v.formula}</code>
                </div>

                {/* Azioni */}
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => handleEdit(v)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                    title="Modifica"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(v.id!, v.nome)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                    title="Elimina"
                  >
                    <Trash2 size={14} />
                  </button>
                  {expanded === v.id ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </div>
              </div>

              {/* Dettaglio espanso */}
              {expanded === v.id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 rounded-b-xl space-y-2">
                  <div>
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Formula</span>
                    <code className="block mt-1 text-sm font-mono text-gray-800 bg-white border border-gray-200 rounded px-3 py-2">
                      {v.formula}
                    </code>
                  </div>
                  {v.parametri.length > 0 && (
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Parametri</span>
                      <div className="mt-1 grid grid-cols-3 gap-1.5">
                        {v.parametri.map((p, i) => (
                          <div key={i} className="bg-white border border-gray-200 rounded px-2 py-1 text-xs">
                            <span className="font-mono text-gray-700">{p.nome}</span>
                            <span className="text-gray-400"> = </span>
                            <span className="font-semibold text-blue-700">{String(p.valore)}</span>
                            {p.descrizione && <div className="text-gray-400 truncate">{p.descrizione}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="text-xs text-gray-400">
                    Disponibile nelle regole come: <code className="bg-gray-100 px-1 rounded">_vd.{v.nome}</code> oppure <code className="bg-gray-100 px-1 rounded">{v.nome}</code>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
