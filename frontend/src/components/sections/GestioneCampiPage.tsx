import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Plus, Trash2, Save, X, ChevronDown, ChevronRight,
  Settings, Edit2, Check, AlertCircle, Database, FileJson,
  Download, Copy, Search, ArrowRightLeft, Layers, Filter,
  CheckSquare, Square, ExternalLink, List, Zap, Calendar, Link2
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const API_BASE = 'http://localhost:8000';

// ==========================================
// INTERFACES
// ==========================================
interface Campo {
  id: number;
  codice: string;
  etichetta: string;
  label?: string;
  tipo: string;
  sezione: string;
  gruppo_dropdown?: string;
  gruppo_opzioni?: string;
  unita_misura?: string;
  valore_min?: number;
  valore_max?: number;
  valore_default?: string;
  descrizione?: string;
  obbligatorio: boolean;
  ordine: number;
  attivo: boolean;
  visibile_form: boolean;
  usabile_regole: boolean;
  opzioni?: { value: string; label: string }[];
  product_template_ids?: number[] | null;
}

interface SezioneInfo {
  codice: string;
  etichetta: string;
  totale: number;
  attivi: number;
}

interface OpzioneDD {
  id: number;
  gruppo: string;
  valore: string;
  etichetta: string;
  ordine: number;
  attivo: boolean;
}

interface ProductTemplate {
  id: number;
  categoria: string;
  sottocategoria: string;
  nome_display: string;
}

// ==========================================
// DEFAULT VALUE EXPRESSION ENGINE
// ==========================================

const GLOBALI_VAR = [
  { id: 'TODAY', label: 'Data odierna (gg/mm/aaaa)', tipi: ['data', 'testo'] },
  { id: 'YEAR',  label: 'Anno corrente',              tipi: ['numero', 'testo'] },
  { id: 'MONTH', label: 'Mese corrente (numero)',     tipi: ['numero', 'testo'] },
];

type DefaultMode = 'fisso' | 'globale' | 'campo';

function parseDefaultMode(v: string): DefaultMode {
  if (!v) return 'fisso';
  if (/^\{\{(TODAY|YEAR|MONTH)/.test(v)) return 'globale';
  if (v.startsWith('{{campo:')) return 'campo';
  return 'fisso';
}
function parseDefaultFallback(v: string): string {
  const m = v.match(/\{\{[^|]+\|([^}]*)\}\}/);
  return m ? m[1] : '';
}
function parseDefaultGlobale(v: string): string {
  const m = v.match(/\{\{(TODAY|YEAR|MONTH)/);
  return m ? m[1] : 'TODAY';
}
function parseDefaultCampoRef(v: string): string {
  const m = v.match(/\{\{campo:([^|}\s]+)/);
  return m ? m[1] : '';
}
function parseDefaultFixed(v: string): string {
  return (!v || v.startsWith('{{')) ? '' : v;
}
function buildDefaultValue(mode: DefaultMode, fixed: string, globale: string, campoRef: string, fallback: string): string {
  if (mode === 'fisso') return fixed;
  const fb = fallback ? `|${fallback}` : '';
  if (mode === 'globale') return `{{${globale}${fb}}}`;
  if (mode === 'campo') return campoRef ? `{{campo:${campoRef}${fb}}}` : '';
  return fixed;
}
function globaliCompatibili(tipo: string) {
  return GLOBALI_VAR.filter(g => tipo === 'testo' || g.tipi.includes(tipo));
}
function campiCompatibili(lista: Campo[], tipo: string): Campo[] {
  if (tipo === 'testo' || tipo === 'dropdown') return lista;
  return lista.filter(c => c.tipo === tipo);
}
function labelDefaultValue(raw: string): string {
  if (!raw || !raw.startsWith('{{')) return raw || '—';
  const m = raw.match(/\{\{(TODAY|YEAR|MONTH)/);
  if (m) return { TODAY: '📅 Data odierna', YEAR: '📅 Anno', MONTH: '📅 Mese' }[m[1]] || raw;
  const c = raw.match(/\{\{campo:([^|}\s]+)/);
  if (c) return `🔗 ${c[1]}`;
  return raw;
}

interface DefaultValueEditorProps {
  value: string;
  onChange: (v: string) => void;
  campoTipo: string;
  allCampi: Campo[];
  onRequestLoadCampi?: () => void;
}

function DefaultValueEditor({ value, onChange, campoTipo, allCampi, onRequestLoadCampi }: DefaultValueEditorProps) {
  const [mode, setMode] = React.useState<DefaultMode>(() => parseDefaultMode(value));
  const [fixed, setFixed] = React.useState(() => parseDefaultFixed(value));
  const [globale, setGlobale] = React.useState(() => parseDefaultGlobale(value));
  const [campoRef, setCampoRef] = React.useState(() => parseDefaultCampoRef(value));
  const [fallback, setFallback] = React.useState(() => parseDefaultFallback(value));
  const [search, setSearch] = React.useState('');
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const emit = (m: DefaultMode, f: string, g: string, r: string, fb: string) => {
    onChange(buildDefaultValue(m, f, g, r, fb));
  };

  const setModeAndEmit = (m: DefaultMode) => {
    setMode(m);
    setPickerOpen(false);
    if (m === 'campo' && allCampi.length === 0) onRequestLoadCampi?.();
    emit(m, fixed, globale, campoRef, fallback);
  };

  const globVars = globaliCompatibili(campoTipo);
  const campiList = campiCompatibili(allCampi, campoTipo);
  const campiFiltered = search
    ? campiList.filter(c =>
        c.codice.toLowerCase().includes(search.toLowerCase()) ||
        (c.etichetta || '').toLowerCase().includes(search.toLowerCase())
      )
    : campiList;

  const btnClass = (active: boolean) =>
    `flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
      active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
    }`;

  return (
    <div className="space-y-2 mt-1">
      <div className="flex gap-1">
        <button type="button" className={btnClass(mode === 'fisso')} onClick={() => setModeAndEmit('fisso')}>
          <Edit2 className="h-3 w-3" /> Fisso
        </button>
        {globVars.length > 0 && (
          <button type="button" className={btnClass(mode === 'globale')} onClick={() => setModeAndEmit('globale')}>
            <Calendar className="h-3 w-3" /> Variabile
          </button>
        )}
        <button type="button" className={btnClass(mode === 'campo')} onClick={() => setModeAndEmit('campo')}>
          <Link2 className="h-3 w-3" /> Campo
        </button>
      </div>

      {mode === 'fisso' && (
        <input
          className="w-full h-7 px-2 text-xs rounded border border-gray-300 focus:outline-none focus:border-blue-400"
          value={fixed}
          onChange={e => { setFixed(e.target.value); emit('fisso', e.target.value, globale, campoRef, fallback); }}
          placeholder="valore di default..."
        />
      )}

      {mode === 'globale' && (
        <div className="space-y-1.5">
          <select
            className="w-full h-7 px-2 text-xs rounded border border-gray-300 bg-white"
            value={globale}
            onChange={e => { setGlobale(e.target.value); emit('globale', fixed, e.target.value, campoRef, fallback); }}
          >
            {globVars.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 shrink-0">Fallback se non disponibile:</span>
            <input
              className="flex-1 h-6 px-2 text-xs rounded border border-gray-200 focus:outline-none focus:border-blue-400"
              value={fallback}
              onChange={e => { setFallback(e.target.value); emit('globale', fixed, globale, campoRef, e.target.value); }}
              placeholder="(vuoto)"
            />
          </div>
        </div>
      )}

      {mode === 'campo' && (
        <div className="space-y-1.5">
          <div
            className="flex items-center gap-1.5 h-7 px-2 rounded border border-gray-300 cursor-pointer hover:border-blue-400 bg-white"
            onClick={() => { setPickerOpen(p => !p); if (!pickerOpen && allCampi.length === 0) onRequestLoadCampi?.(); }}
          >
            {campoRef
              ? <><Link2 className="h-3 w-3 text-blue-500 shrink-0" /><span className="text-xs font-mono text-blue-700 flex-1 truncate">{campoRef}</span></>
              : <span className="text-xs text-gray-400 flex-1">Seleziona un campo...</span>}
            <ChevronDown className="h-3 w-3 text-gray-400 shrink-0" />
          </div>

          {pickerOpen && (
            <div className="border border-gray-200 rounded-lg bg-white shadow-lg overflow-hidden">
              <div className="p-1.5 border-b border-gray-100">
                <input
                  autoFocus
                  className="w-full h-6 px-2 text-xs rounded border border-gray-200 focus:outline-none focus:border-blue-400"
                  placeholder="Cerca codice o etichetta..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-40 overflow-y-auto">
                {allCampi.length === 0 && (
                  <div className="text-xs text-gray-400 text-center py-3 italic">Caricamento campi...</div>
                )}
                {campiFiltered.length === 0 && allCampi.length > 0 && (
                  <div className="text-xs text-gray-400 text-center py-3 italic">Nessun campo compatibile con tipo "{campoTipo}"</div>
                )}
                {campiFiltered.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 flex items-center gap-2 ${campoRef === c.codice ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}`}
                    onClick={() => { setCampoRef(c.codice); setPickerOpen(false); setSearch(''); emit('campo', fixed, globale, c.codice, fallback); }}
                  >
                    <span className="font-mono text-[10px] text-gray-400 shrink-0 w-32 truncate">{c.codice}</span>
                    <span className="flex-1 truncate">{c.etichetta}</span>
                    <span className="text-[10px] px-1 py-0 rounded bg-gray-100 text-gray-500 shrink-0">{c.tipo}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 shrink-0">Fallback se non disponibile:</span>
            <input
              className="flex-1 h-6 px-2 text-xs rounded border border-gray-200 focus:outline-none focus:border-blue-400"
              value={fallback}
              onChange={e => { setFallback(e.target.value); emit('campo', fixed, globale, campoRef, e.target.value); }}
              placeholder="(vuoto)"
            />
          </div>
        </div>
      )}
    </div>
  );
}

const TIPI_CAMPO = [
  { value: 'testo', label: 'Testo' },
  { value: 'numero', label: 'Numero' },
  { value: 'booleano', label: 'Booleano (Sì/No)' },
  { value: 'dropdown', label: 'Dropdown (scelta)' },
  { value: 'data', label: 'Data' },
];

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function GestioneCampiPage() {
  const { toast } = useToast();

  // ── State ──
  const [sezioni, setSezioni] = useState<SezioneInfo[]>([]);
  const [selectedSezione, setSelectedSezione] = useState<string | null>(null);
  const [campi, setCampi] = useState<Campo[]>([]);
  const [gruppiDropdown, setGruppiDropdown] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Campo>>({});
  const [newCampo, setNewCampo] = useState<Partial<Campo> | null>(null);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [jsonSchema, setJsonSchema] = useState<any>(null);
  const [productTemplates, setProductTemplates] = useState<ProductTemplate[]>([]);

  // ── TAB: 'sezione' | 'tutti' ──
  const [activeTab, setActiveTab] = useState<'sezione' | 'tutti'>('sezione');

  // ── "Tutti i Campi" state ──
  const [allCampi, setAllCampi] = useState<Campo[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [filterSezione, setFilterSezione] = useState<string>('');
  const [filterTipo, setFilterTipo] = useState<string>('');
  const [filterStato, setFilterStato] = useState<string>(''); // '' | 'attivo' | 'inattivo'
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkTargetSezione, setBulkTargetSezione] = useState<string>('');
  const [movingFieldId, setMovingFieldId] = useState<number | null>(null);

  // ── Inline options panel ──
  const [inlineGruppo, setInlineGruppo] = useState<string | null>(null);
  const [inlineOpzioni, setInlineOpzioni] = useState<OpzioneDD[]>([]);
  const [inlineLoading, setInlineLoading] = useState(false);
  const [quickAdd, setQuickAdd] = useState({ valore: '', etichetta: '' });
  // ── Default value picker ──
  const [pickerCampi, setPickerCampi] = useState<Campo[]>([]);
  const [pickerCampiLoaded, setPickerCampiLoaded] = useState(false);

  // ── New gruppo inline ──
  const [showNewGruppo, setShowNewGruppo] = useState(false);
  const [newGruppoForm, setNewGruppoForm] = useState({ codice: '', primaOpzione: '' });

  // ── Load on mount ──
  useEffect(() => { fetchSezioni(); fetchGruppiDropdown(); fetchProductTemplates(); }, []);
  useEffect(() => { if (selectedSezione) fetchCampi(selectedSezione); }, [selectedSezione]);
  useEffect(() => { if (activeTab === 'tutti') fetchAllCampi(); }, [activeTab]);

  // ══════════════════════════════════
  // API CALLS
  // ══════════════════════════════════
  const fetchSezioni = async () => {
    try {
      const res = await fetch(`${API_BASE}/campi-configuratore/sezioni`);
      const data = await res.json();
      setSezioni(data);
      setLoading(false);
    } catch { toast({ title: 'Errore', description: 'Impossibile caricare le sezioni', variant: 'destructive' }); }
  };

  const fetchCampi = async (sezione: string) => {
    try {
      const res = await fetch(`${API_BASE}/campi-configuratore/${sezione}?solo_attivi=false`);
      setCampi(await res.json());
    } catch { /* silent */ }
  };

  const fetchAllCampi = async () => {
    setAllLoading(true);
    try {
      const all: Campo[] = [];
      for (const s of sezioni) {
        const res = await fetch(`${API_BASE}/campi-configuratore/${s.codice}?solo_attivi=false`);
        const data = await res.json();
        all.push(...data.map((c: Campo) => ({ ...c, etichetta: c.etichetta || c.label || c.codice })));
      }
      setAllCampi(all);
    } catch { toast({ title: 'Errore', description: 'Impossibile caricare tutti i campi', variant: 'destructive' }); }
    setAllLoading(false);
  };

  const fetchGruppiDropdown = async () => {
    try {
      const res = await fetch(`${API_BASE}/opzioni-dropdown/gruppi`);
      const data = await res.json();
      setGruppiDropdown(data.map((g: any) => g.gruppo));
    } catch { /* silent */ }
  };

  const fetchProductTemplates = async () => {
    try {
      const res = await fetch(`${API_BASE}/templates`);
      if (res.ok) {
        const data = await res.json();
        setProductTemplates(data);
      }
    } catch { /* silent */ }
  };

  const loadPickerCampi = async () => {
    if (pickerCampiLoaded) return;
    try {
      const all: Campo[] = [];
      const sezRes = await fetch(`${API_BASE}/campi-configuratore/sezioni`);
      const sezList = sezRes.ok ? await sezRes.json() : sezioni;
      for (const s of sezList) {
        const r = await fetch(`${API_BASE}/campi-configuratore/${s.codice}?solo_attivi=true`);
        if (r.ok) {
          const data = await r.json();
          all.push(...data.map((c: Campo) => ({ ...c, etichetta: c.etichetta || c.label || c.codice })));
        }
      }
      // Campi ORM hardcoded (non in campi_configuratore ma disponibili come sorgente)
      const ORM_VIRTUAL: Campo[] = [
        { id: -1,  codice: 'dati_commessa.numero_offerta',    etichetta: 'Numero Offerta',       tipo: 'testo',  sezione: 'dati_commessa', obbligatorio: false, ordine: 0, attivo: true, visibile_form: true, usabile_regole: true },
        { id: -2,  codice: 'dati_commessa.data_offerta',      etichetta: 'Data Offerta',         tipo: 'data',   sezione: 'dati_commessa', obbligatorio: false, ordine: 1, attivo: true, visibile_form: true, usabile_regole: true },
        { id: -3,  codice: 'dati_commessa.riferimento_cliente', etichetta: 'Riferimento Cliente', tipo: 'testo',  sezione: 'dati_commessa', obbligatorio: false, ordine: 2, attivo: true, visibile_form: true, usabile_regole: true },
        { id: -4,  codice: 'dati_commessa.quantita',          etichetta: 'Quantità',             tipo: 'numero', sezione: 'dati_commessa', obbligatorio: false, ordine: 3, attivo: true, visibile_form: true, usabile_regole: true },
        { id: -5,  codice: 'dati_commessa.consegna_richiesta', etichetta: 'Consegna Richiesta',  tipo: 'testo',  sezione: 'dati_commessa', obbligatorio: false, ordine: 4, attivo: true, visibile_form: true, usabile_regole: true },
        { id: -6,  codice: 'dati_commessa.prezzo_unitario',   etichetta: 'Prezzo Unitario',      tipo: 'numero', sezione: 'dati_commessa', obbligatorio: false, ordine: 5, attivo: true, visibile_form: true, usabile_regole: true },
        { id: -7,  codice: 'dati_commessa.pagamento',         etichetta: 'Pagamento',            tipo: 'testo',  sezione: 'dati_commessa', obbligatorio: false, ordine: 6, attivo: true, visibile_form: true, usabile_regole: true },
        { id: -8,  codice: 'dati_commessa.trasporto',         etichetta: 'Trasporto',            tipo: 'testo',  sezione: 'dati_commessa', obbligatorio: false, ordine: 7, attivo: true, visibile_form: true, usabile_regole: true },
        { id: -9,  codice: 'dati_commessa.destinazione',      etichetta: 'Destinazione',         tipo: 'testo',  sezione: 'dati_commessa', obbligatorio: false, ordine: 8, attivo: true, visibile_form: true, usabile_regole: true },
        { id: -10, codice: 'disposizione_vano.altezza_vano',  etichetta: 'Altezza Vano',         tipo: 'numero', sezione: 'disposizione_vano', obbligatorio: false, ordine: 0, attivo: true, visibile_form: true, usabile_regole: true },
        { id: -11, codice: 'disposizione_vano.piano_piu_alto', etichetta: 'Piano più Alto',      tipo: 'testo',  sezione: 'disposizione_vano', obbligatorio: false, ordine: 1, attivo: true, visibile_form: true, usabile_regole: true },
        { id: -12, codice: 'disposizione_vano.piano_piu_basso', etichetta: 'Piano più Basso',    tipo: 'testo',  sezione: 'disposizione_vano', obbligatorio: false, ordine: 2, attivo: true, visibile_form: true, usabile_regole: true },
      ];
      setPickerCampi([...all, ...ORM_VIRTUAL]);
      setPickerCampiLoaded(true);
    } catch { /* silent */ }
  };

  // ── Inline options panel helpers ──
  const openInlineOpzioni = async (gruppo: string) => {
    if (inlineGruppo === gruppo) { setInlineGruppo(null); return; } // toggle
    setInlineGruppo(gruppo);
    setInlineLoading(true);
    setQuickAdd({ valore: '', etichetta: '' });
    try {
      const res = await fetch(`${API_BASE}/opzioni-dropdown/${gruppo}?solo_attive=false`);
      setInlineOpzioni(await res.json());
    } catch { setInlineOpzioni([]); }
    setInlineLoading(false);
  };

  const handleQuickAddOpzione = async () => {
    if (!inlineGruppo || !quickAdd.valore.trim() || !quickAdd.etichetta.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/opzioni-dropdown`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gruppo: inlineGruppo, valore: quickAdd.valore.toLowerCase().replace(/\s+/g, '_'), etichetta: quickAdd.etichetta, ordine: inlineOpzioni.length, attivo: true }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Errore');
      toast({ title: '✅ Opzione aggiunta' });
      setQuickAdd({ valore: '', etichetta: '' });
      // Ricarica opzioni
      const r2 = await fetch(`${API_BASE}/opzioni-dropdown/${inlineGruppo}?solo_attive=false`);
      setInlineOpzioni(await r2.json());
      fetchGruppiDropdown();
    } catch (e: any) { toast({ title: 'Errore', description: e.message, variant: 'destructive' }); }
  };

  const handleDeleteInlineOpzione = async (id: number) => {
    if (!confirm('Eliminare questa opzione?')) return;
    try {
      await fetch(`${API_BASE}/opzioni-dropdown/${id}`, { method: 'DELETE' });
      setInlineOpzioni(prev => prev.filter(o => o.id !== id));
      fetchGruppiDropdown();
      toast({ title: '✅ Eliminato' });
    } catch {}
  };

  const handleCreateNewGruppo = async () => {
    const codice = newGruppoForm.codice.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!codice) { toast({ title: 'Errore', description: 'Inserisci un codice', variant: 'destructive' }); return; }
    if (gruppiDropdown.includes(codice)) { toast({ title: 'Errore', description: 'Gruppo già esistente', variant: 'destructive' }); return; }
    try {
      const primaEtichetta = newGruppoForm.primaOpzione.trim() || 'Esempio (da modificare)';
      const primaValore = primaEtichetta.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const res = await fetch(`${API_BASE}/opzioni-dropdown`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gruppo: codice, valore: primaValore, etichetta: primaEtichetta, ordine: 0, attivo: true }),
      });
      if (!res.ok) throw new Error();
      toast({ title: '✅ Gruppo creato', description: `"${codice}" con prima opzione "${primaEtichetta}"` });
      await fetchGruppiDropdown();
      // Auto-select in edit form
      if (editingId) setEditForm(prev => ({ ...prev, gruppo_dropdown: codice }));
      if (newCampo) setNewCampo(prev => prev ? { ...prev, gruppo_dropdown: codice } : prev);
      setShowNewGruppo(false);
      setNewGruppoForm({ codice: '', primaOpzione: '' });
    } catch { toast({ title: 'Errore', description: 'Impossibile creare il gruppo', variant: 'destructive' }); }
  };

  const fetchJsonSchema = async () => {
    try {
      const res = await fetch(`${API_BASE}/campi-configuratore/schema.json`);
      setJsonSchema(await res.json());
      setShowJsonPreview(true);
    } catch { toast({ title: 'Errore', description: 'Impossibile caricare schema', variant: 'destructive' }); }
  };

  // ══════════════════════════════════
  // FIELD CRUD
  // ══════════════════════════════════
  const handleEdit = (campo: Campo) => { setEditingId(campo.id); setEditForm(campo); };
  const handleCancelEdit = () => { setEditingId(null); setEditForm({}); setInlineGruppo(null); setShowNewGruppo(false); };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    try {
      const res = await fetch(`${API_BASE}/campi-configuratore/${editingId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Errore');
      toast({ title: '✅ Salvato', description: 'Campo aggiornato' });
      setEditingId(null); setEditForm({});
      if (selectedSezione) fetchCampi(selectedSezione);
      if (activeTab === 'tutti') fetchAllCampi();
      fetchSezioni();
    } catch (e: any) { toast({ title: 'Errore', description: e.message, variant: 'destructive' }); }
  };

  const apiToggle = async (campo: Campo, field: string, newVal: any, msg: string) => {
    try {
      const res = await fetch(`${API_BASE}/campi-configuratore/${campo.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: newVal }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Errore');
      toast({ title: msg });
      if (selectedSezione) fetchCampi(selectedSezione);
      if (activeTab === 'tutti') fetchAllCampi();
      fetchSezioni();
    } catch (e: any) { toast({ title: 'Errore', description: e.message, variant: 'destructive' }); }
  };

  const handleToggleAttivo = (c: Campo) => apiToggle(c, 'attivo', !c.attivo, c.attivo ? '⏸️ Disattivato' : '✅ Attivato');
  const handleToggleObbligatorio = (c: Campo) => apiToggle(c, 'obbligatorio', !c.obbligatorio, c.obbligatorio ? '○ Opzionale' : '⚠️ Obbligatorio');
  const handleToggleRegole = (c: Campo) => apiToggle(c, 'usabile_regole', !c.usabile_regole, c.usabile_regole ? '✗ Non usabile' : '✓ Usabile in regole');

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo campo? Le regole che lo usano potrebbero non funzionare più.')) return;
    try {
      const res = await fetch(`${API_BASE}/campi-configuratore/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Errore');
      toast({ title: '✅ Eliminato' });
      if (selectedSezione) fetchCampi(selectedSezione);
      if (activeTab === 'tutti') fetchAllCampi();
      fetchSezioni();
    } catch { toast({ title: 'Errore', variant: 'destructive' }); }
  };

  // ══════════════════════════════════
  // MOVE FIELD TO SECTION
  // ══════════════════════════════════
  const moveFieldToSection = async (campoId: number, newSezione: string) => {
    setMovingFieldId(campoId);
    try {
      const res = await fetch(`${API_BASE}/campi-configuratore/${campoId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sezione: newSezione }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Errore');
      const campo = allCampi.find(c => c.id === campoId) || campi.find(c => c.id === campoId);
      toast({ title: '✅ Spostato', description: `"${campo?.etichetta || ''}" → ${getSezLabel(newSezione)}` });
      if (selectedSezione) fetchCampi(selectedSezione);
      fetchAllCampi();
      fetchSezioni();
    } catch (e: any) {
      toast({ title: 'Errore spostamento', description: e.message, variant: 'destructive' });
    }
    setMovingFieldId(null);
  };

  // ── Bulk move ──
  const handleBulkMove = async () => {
    if (!bulkTargetSezione || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await fetch(`${API_BASE}/campi-configuratore/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sezione: bulkTargetSezione }),
      });
    }
    toast({ title: '✅ Spostati', description: `${ids.length} campi spostati in ${getSezLabel(bulkTargetSezione)}` });
    setSelectedIds(new Set());
    setBulkTargetSezione('');
    fetchAllCampi();
    fetchSezioni();
    if (selectedSezione) fetchCampi(selectedSezione);
  };

  // ══════════════════════════════════
  // NEW CAMPO
  // ══════════════════════════════════
  const handleStartNew = () => {
    if (!selectedSezione) {
      toast({ title: 'Attenzione', description: 'Seleziona prima una sezione', variant: 'destructive' });
      return;
    }
    setNewCampo({
      codice: `${selectedSezione}.custom_`,
      etichetta: '', tipo: 'testo', sezione: selectedSezione,
      obbligatorio: false, ordine: campi.length, attivo: true,
      visibile_form: true, usabile_regole: true,
    });
  };

  const handleSaveNew = async () => {
    if (!newCampo?.codice || !newCampo?.etichetta || !newCampo?.tipo) {
      toast({ title: 'Errore', description: 'Compila codice, etichetta e tipo', variant: 'destructive' });
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/campi-configuratore`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCampo),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Errore');
      toast({ title: '✅ Creato', description: 'Nuovo campo aggiunto' });
      setNewCampo(null);
      if (selectedSezione) fetchCampi(selectedSezione);
      if (activeTab === 'tutti') fetchAllCampi();
      fetchSezioni();
    } catch (e: any) { toast({ title: 'Errore', description: e.message, variant: 'destructive' }); }
  };

  // ══════════════════════════════════
  // HELPERS
  // ══════════════════════════════════
  const getSezLabel = (cod: string) => sezioni.find(s => s.codice === cod)?.etichetta || cod;

  const copyJsonToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(jsonSchema, null, 2));
    toast({ title: '✅ Copiato' });
  };

  const downloadJson = async () => {
    try {
      const res = await fetch(`${API_BASE}/campi-configuratore/schema.json`);
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'schema_configuratore.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { toast({ title: 'Errore', variant: 'destructive' }); }
  };

  // ── Filtered list for "Tutti i Campi" tab ──
  const filteredAll = useMemo(() => {
    let list = allCampi;
    if (globalSearch) {
      const q = globalSearch.toLowerCase();
      list = list.filter(c =>
        (c.etichetta || '').toLowerCase().includes(q) ||
        c.codice.toLowerCase().includes(q) ||
        (c.descrizione || '').toLowerCase().includes(q)
      );
    }
    if (filterSezione) list = list.filter(c => c.sezione === filterSezione);
    if (filterTipo) list = list.filter(c => c.tipo === filterTipo);
    if (filterStato === 'attivo') list = list.filter(c => c.attivo);
    if (filterStato === 'inattivo') list = list.filter(c => !c.attivo);
    return list;
  }, [allCampi, globalSearch, filterSezione, filterTipo, filterStato]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAll.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredAll.map(c => c.id)));
  };

  // ══════════════════════════════════
  // RENDER
  // ══════════════════════════════════
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Sezione color map for badges
  const SEZ_COLORS: Record<string, string> = {};
  const palette = ['bg-blue-100 text-blue-700', 'bg-green-100 text-green-700', 'bg-purple-100 text-purple-700',
    'bg-amber-100 text-amber-700', 'bg-pink-100 text-pink-700', 'bg-cyan-100 text-cyan-700',
    'bg-red-100 text-red-700', 'bg-indigo-100 text-indigo-700', 'bg-teal-100 text-teal-700',
    'bg-orange-100 text-orange-700', 'bg-lime-100 text-lime-700', 'bg-rose-100 text-rose-700'];
  sezioni.forEach((s, i) => { SEZ_COLORS[s.codice] = palette[i % palette.length]; });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* ═══ HEADER ═══ */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="h-6 w-6" />
            Gestione Campi Configuratore
          </h1>
          <p className="text-gray-600 mt-1">
            Definisci i campi del modulo d'ordine per il Rule Designer
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadJson} className="gap-2">
            <Download className="h-4 w-4" /> Salva JSON
          </Button>
          <Button variant="outline" onClick={fetchJsonSchema} className="gap-2">
            <FileJson className="h-4 w-4" /> Anteprima JSON
          </Button>
        </div>
      </div>

      {/* ═══ TABS ═══ */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('sezione')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'sezione' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Layers className="h-4 w-4 inline mr-2" />
          Per Sezione
        </button>
        <button
          onClick={() => setActiveTab('tutti')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'tutti' ? 'bg-white shadow text-gray-900' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <Search className="h-4 w-4 inline mr-2" />
          Tutti i Campi
          <Badge variant="secondary" className="ml-2 text-xs">{allCampi.length || '...'}</Badge>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: PER SEZIONE (layout originale)                */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'sezione' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Lista Sezioni */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Sezioni</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {sezioni.map((s) => (
                  <div
                    key={s.codice}
                    className={`px-4 py-3 cursor-pointer transition-colors ${
                      selectedSezione === s.codice
                        ? 'bg-blue-50 border-l-4 border-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedSezione(s.codice)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{s.etichetta}</span>
                      <Badge variant="secondary" className="text-xs">{s.attivi}/{s.totale}</Badge>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{s.codice}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Dettaglio Campi della sezione */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">
                {selectedSezione ? getSezLabel(selectedSezione) : 'Seleziona una sezione'}
              </CardTitle>
              {selectedSezione && (
                <div className="flex gap-2">
                  {campi.some(c => !c.attivo) && (
                    <Button size="sm" variant="outline" onClick={async () => {
                      const inattivi = campi.filter(c => !c.attivo);
                      for (const campo of inattivi) {
                        await fetch(`${API_BASE}/campi-configuratore/${campo.id}`, {
                          method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ attivo: true }),
                        });
                      }
                      toast({ title: '✅ Attivati', description: `${inattivi.length} campi attivati` });
                      fetchCampi(selectedSezione); fetchSezioni();
                    }}>
                      Attiva Tutti ({campi.filter(c => !c.attivo).length})
                    </Button>
                  )}
                  <Button size="sm" onClick={handleStartNew} disabled={newCampo !== null}>
                    <Plus className="h-4 w-4 mr-1" /> Nuovo Campo
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {!selectedSezione ? (
                <div className="text-center py-12 text-gray-500">
                  <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Seleziona una sezione dalla lista</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* New campo form */}
                  {newCampo && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="text-sm font-medium text-green-800 mb-3">Nuovo Campo Personalizzato</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="col-span-2">
                          <Label className="text-xs">Etichetta <span className="text-red-500">*</span></Label>
                          <Input
                            value={newCampo.etichetta || ''}
                            onChange={(e) => {
                              const etichetta = e.target.value;
                              const nomeCampo = etichetta.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                              const basePrefix = `${selectedSezione}.custom_`;
                              const currentCodice = newCampo.codice || '';
                              const shouldUpdate = currentCodice === basePrefix ||
                                currentCodice === `${basePrefix}${(newCampo.etichetta || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;
                              setNewCampo({ ...newCampo, etichetta, codice: shouldUpdate ? `${basePrefix}${nomeCampo}` : currentCodice });
                            }}
                            placeholder="es: Tipo Armadio" className="h-8 text-sm" autoFocus
                          />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-xs">Codice (auto-generato)</Label>
                          <Input
                            value={newCampo.codice || ''}
                            onChange={(e) => setNewCampo({ ...newCampo, codice: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                            className="h-8 text-sm font-mono bg-gray-50"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Tipo <span className="text-red-500">*</span></Label>
                          <Select value={newCampo.tipo} onValueChange={(v) => setNewCampo({ ...newCampo, tipo: v })}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {TIPI_CAMPO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {newCampo.tipo === 'dropdown' && (
                          <div>
                            <Label className="text-xs">Gruppo Opzioni <span className="text-red-500">*</span></Label>
                            <div className="flex gap-1">
                              <Select value={newCampo.gruppo_dropdown || ''} onValueChange={(v) => { setNewCampo({ ...newCampo, gruppo_dropdown: v }); setInlineGruppo(null); setShowNewGruppo(false); }}>
                                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                                <SelectContent>
                                  {gruppiDropdown.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              {newCampo.gruppo_dropdown && (
                                <Button size="sm" variant={inlineGruppo === newCampo.gruppo_dropdown ? 'secondary' : 'ghost'}
                                  className="h-8 w-8 p-0 shrink-0" title="Gestisci opzioni"
                                  onClick={() => { openInlineOpzioni(newCampo.gruppo_dropdown!); setShowNewGruppo(false); }}>
                                  <List className="h-4 w-4" />
                                </Button>
                              )}
                              <Button size="sm" variant={showNewGruppo ? 'secondary' : 'ghost'}
                                className="h-8 w-8 p-0 shrink-0" title="Crea nuovo gruppo"
                                onClick={() => { setShowNewGruppo(!showNewGruppo); setInlineGruppo(null); }}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>

                            {/* New gruppo mini-form */}
                            {showNewGruppo && (
                              <div className="mt-2 border border-green-200 rounded-lg p-2 bg-green-50/30">
                                <div className="text-xs font-medium text-green-800 mb-1.5">Nuovo gruppo</div>
                                <div className="flex gap-1 mb-1">
                                  <Input value={newGruppoForm.codice}
                                    onChange={(e) => setNewGruppoForm({ ...newGruppoForm, codice: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
                                    placeholder="codice_gruppo" className="h-6 text-xs font-mono flex-1" autoFocus />
                                  <Input value={newGruppoForm.primaOpzione}
                                    onChange={(e) => setNewGruppoForm({ ...newGruppoForm, primaOpzione: e.target.value })}
                                    placeholder="Prima opzione" className="h-6 text-xs flex-1"
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNewGruppo(); }} />
                                  <Button size="sm" onClick={handleCreateNewGruppo} disabled={!newGruppoForm.codice.trim()}
                                    className="h-6 text-xs px-2 bg-green-600 hover:bg-green-700"><Check className="h-3 w-3" /></Button>
                                </div>
                                {newGruppoForm.codice && gruppiDropdown.includes(newGruppoForm.codice) && (
                                  <p className="text-xs text-red-500">Codice già esistente</p>
                                )}
                              </div>
                            )}

                            {/* Inline options panel for new campo */}
                            {inlineGruppo === newCampo.gruppo_dropdown && newCampo.gruppo_dropdown && !showNewGruppo && (
                              <div className="mt-2 border border-amber-200 rounded-lg p-2 bg-amber-50/30">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-xs font-medium text-gray-600">Opzioni: {inlineOpzioni.filter(o => o.attivo).length} attive</span>
                                  <button onClick={() => setInlineGruppo(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3 w-3" /></button>
                                </div>
                                {inlineLoading ? <div className="text-xs text-gray-400">Caricamento...</div> : (
                                  <>
                                    <div className="flex flex-wrap gap-1 mb-2">
                                      {inlineOpzioni.map(o => (
                                        <span key={o.id} className={`text-xs px-1.5 py-0.5 rounded border ${o.attivo ? 'bg-white border-gray-200' : 'bg-gray-50 text-gray-400 line-through'}`}>
                                          {o.etichetta}
                                        </span>
                                      ))}
                                      {inlineOpzioni.length === 0 && <span className="text-xs text-gray-400 italic">Nessuna</span>}
                                    </div>
                                    <div className="flex gap-1">
                                      <Input value={quickAdd.etichetta} onChange={(e) => {
                                          const v = e.target.value;
                                          setQuickAdd({
                                            etichetta: v,
                                            valore: v.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
                                          });
                                        }}
                                        placeholder="Nuova opzione..." className="h-6 text-xs flex-1"
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAddOpzione(); }} />
                                      <Button size="sm" onClick={handleQuickAddOpzione} disabled={!quickAdd.etichetta.trim()} className="h-6 text-xs px-2 bg-amber-600 hover:bg-amber-700">
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {newCampo.tipo === 'numero' && (
                          <>
                            <div>
                              <Label className="text-xs">Unità</Label>
                              <Input value={newCampo.unita_misura || ''} onChange={(e) => setNewCampo({ ...newCampo, unita_misura: e.target.value })} placeholder="m, kg, kW..." className="h-8 text-sm" />
                            </div>
                            <div>
                              <Label className="text-xs">Min</Label>
                              <Input type="number" value={newCampo.valore_min ?? ''} onChange={(e) => setNewCampo({ ...newCampo, valore_min: parseFloat(e.target.value) })} className="h-8 text-sm" />
                            </div>
                            <div>
                              <Label className="text-xs">Max</Label>
                              <Input type="number" value={newCampo.valore_max ?? ''} onChange={(e) => setNewCampo({ ...newCampo, valore_max: parseFloat(e.target.value) })} className="h-8 text-sm" />
                            </div>
                          </>
                        )}

                        <div className="col-span-2 md:col-span-4">
                          <Label className="text-xs flex items-center gap-1 mb-0.5">
                            <Zap className="h-3 w-3 text-amber-500" /> Valore Default
                          </Label>
                          <DefaultValueEditor
                            value={newCampo.valore_default || ''}
                            onChange={v => setNewCampo({ ...newCampo, valore_default: v })}
                            campoTipo={newCampo.tipo || 'testo'}
                            allCampi={pickerCampi}
                            onRequestLoadCampi={loadPickerCampi}
                          />
                        </div>

                        <div className="col-span-2 flex items-end gap-2">
                          <Button size="sm" onClick={handleSaveNew} className="bg-green-600 hover:bg-green-700">
                            <Check className="h-4 w-4 mr-1" /> Salva
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setNewCampo(null)}>
                            <X className="h-4 w-4 mr-1" /> Annulla
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Table */}
                  {renderCampiTable(campi, false)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════ */}
      {/* TAB: TUTTI I CAMPI (ricerca globale)               */}
      {/* ═══════════════════════════════════════════════════ */}
      {activeTab === 'tutti' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="h-5 w-5" />
                Tutti i Campi
                <Badge variant="secondary">{filteredAll.length} / {allCampi.length}</Badge>
              </CardTitle>
              <Button size="sm" variant="outline" onClick={fetchAllCampi} disabled={allLoading}>
                {allLoading ? <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" /> : 'Ricarica'}
              </Button>
            </div>

            {/* Search + Filters */}
            <div className="flex flex-wrap gap-3 mt-4">
              <div className="relative flex-1 min-w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Cerca per etichetta, codice o descrizione..."
                  className="pl-10 h-9"
                />
                {globalSearch && (
                  <button onClick={() => setGlobalSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                    <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>

              <select
                value={filterSezione}
                onChange={(e) => setFilterSezione(e.target.value)}
                className="h-9 rounded-md border px-3 text-sm bg-white min-w-40"
              >
                <option value="">Tutte le sezioni</option>
                {sezioni.map(s => <option key={s.codice} value={s.codice}>{s.etichetta} ({s.totale})</option>)}
              </select>

              <select
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value)}
                className="h-9 rounded-md border px-3 text-sm bg-white"
              >
                <option value="">Tutti i tipi</option>
                {TIPI_CAMPO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>

              <select
                value={filterStato}
                onChange={(e) => setFilterStato(e.target.value)}
                className="h-9 rounded-md border px-3 text-sm bg-white"
              >
                <option value="">Tutti gli stati</option>
                <option value="attivo">Solo attivi</option>
                <option value="inattivo">Solo inattivi</option>
              </select>
            </div>

            {/* Bulk move bar */}
            {selectedIds.size > 0 && (
              <div className="mt-3 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                <span className="text-sm font-medium text-blue-800">
                  {selectedIds.size} campo/i selezionato/i
                </span>
                <ArrowRightLeft className="h-4 w-4 text-blue-600" />
                <select
                  value={bulkTargetSezione}
                  onChange={(e) => setBulkTargetSezione(e.target.value)}
                  className="h-8 rounded border px-2 text-sm bg-white min-w-48"
                >
                  <option value="">Sposta in sezione...</option>
                  {sezioni.map(s => <option key={s.codice} value={s.codice}>{s.etichetta}</option>)}
                </select>
                <Button size="sm" onClick={handleBulkMove} disabled={!bulkTargetSezione} className="bg-blue-600 hover:bg-blue-700 text-white">
                  Sposta
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-0">
            {allLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : (
              renderCampiTable(filteredAll, true)
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══ INFO BOX ═══ */}
      <Card className="mt-6 bg-blue-50 border-blue-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Come funziona</p>
              <ul className="list-disc ml-4 space-y-1 text-blue-700">
                <li><strong>Codice:</strong> path univoco del campo (es: <code>normative.en_81_72</code>)</li>
                <li><strong>Tipo dropdown:</strong> collegalo a un gruppo di Gestione Opzioni</li>
                <li><strong>Regole:</strong> se attivo, il campo è disponibile nel Rule Designer</li>
                <li><strong>Stato:</strong> i campi OFF non vengono esportati nello schema JSON</li>
                <li><strong>Sposta:</strong> nella tab "Tutti i Campi" puoi riassegnare un campo a un'altra sezione</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ═══ JSON PREVIEW MODAL ═══ */}
      {showJsonPreview && jsonSchema && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileJson className="h-5 w-5" /> Schema JSON per Rule Designer
              </h3>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={copyJsonToClipboard}>
                  <Copy className="h-4 w-4 mr-1" /> Copia
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowJsonPreview(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto">
                {JSON.stringify(jsonSchema, null, 2)}
              </pre>
            </div>
            <div className="p-4 border-t bg-gray-50 text-sm text-gray-600">
              <strong>Endpoint:</strong> <code>GET /api/campi-configuratore/schema.json</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // ══════════════════════════════════
  // RENDER TABLE (shared between tabs)
  // ══════════════════════════════════
  function renderCampiTable(lista: Campo[], showSezione: boolean) {
    if (lista.length === 0) {
      return (
        <div className="text-center py-12 text-gray-500">
          {globalSearch || filterSezione || filterTipo || filterStato
            ? 'Nessun campo corrisponde ai filtri'
            : 'Nessun campo trovato'}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              {showSezione && (
                <th className="px-3 py-2 w-8">
                  <button onClick={toggleSelectAll} className="text-gray-400 hover:text-gray-600">
                    {selectedIds.size === filteredAll.length && filteredAll.length > 0
                      ? <CheckSquare className="h-4 w-4" />
                      : <Square className="h-4 w-4" />}
                  </button>
                </th>
              )}
              <th className="px-3 py-2 font-medium text-gray-700">Etichetta / Codice</th>
              {showSezione && <th className="px-3 py-2 font-medium text-gray-700">Sezione</th>}
              <th className="px-3 py-2 font-medium text-gray-700">Tipo</th>
              <th className="px-3 py-2 font-medium text-gray-700 text-center">Obb.</th>
              <th className="px-3 py-2 font-medium text-gray-700 text-center">Regole</th>
              <th className="px-3 py-2 font-medium text-gray-700 text-center">Stato</th>
              <th className="px-3 py-2 font-medium text-gray-700 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lista.map((campo) => {
              const isEditing = editingId === campo.id;
              const isMoving = movingFieldId === campo.id;

              return (
                <React.Fragment key={campo.id}>
                <tr className={`hover:bg-gray-50 transition-colors ${!campo.attivo ? 'opacity-60' : ''} ${isMoving ? 'bg-blue-50' : ''}`}>
                  {/* Checkbox (only in "tutti" tab) */}
                  {showSezione && (
                    <td className="px-3 py-2">
                      <button onClick={() => toggleSelect(campo.id)} className="text-gray-400 hover:text-gray-600">
                        {selectedIds.has(campo.id)
                          ? <CheckSquare className="h-4 w-4 text-blue-600" />
                          : <Square className="h-4 w-4" />}
                      </button>
                    </td>
                  )}

                  {/* Etichetta + Codice */}
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <div className="space-y-1">
                        <Input value={editForm.etichetta || ''} onChange={(e) => setEditForm({ ...editForm, etichetta: e.target.value })} className="h-7 text-sm" />
                        <Input value={editForm.codice || ''} onChange={(e) => setEditForm({ ...editForm, codice: e.target.value })} className="h-7 text-xs font-mono bg-gray-50" />
                        {/* Product visibility checkboxes */}
                        {productTemplates.length > 0 && (
                          <div className="pt-1">
                            <span className="text-xs text-gray-500 font-medium">Prodotti:</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {productTemplates.map(pt => {
                                const ptIds = editForm.product_template_ids || [];
                                const isAll = !ptIds || ptIds.length === 0;
                                const isChecked = isAll || ptIds.includes(pt.id);
                                return (
                                  <button key={pt.id} type="button"
                                    onClick={() => {
                                      const current = editForm.product_template_ids || [];
                                      if (!current || current.length === 0) {
                                        setEditForm({ ...editForm, product_template_ids: [pt.id] });
                                      } else if (current.includes(pt.id)) {
                                        const next = current.filter((id: number) => id !== pt.id);
                                        setEditForm({ ...editForm, product_template_ids: next.length === 0 ? null : next });
                                      } else {
                                        const next = [...current, pt.id];
                                        setEditForm({ ...editForm, product_template_ids: next.length === productTemplates.length ? null : next });
                                      }
                                    }}
                                    className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                      isChecked
                                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                                        : 'bg-gray-50 border-gray-200 text-gray-400'
                                    }`}
                                  >
                                    {pt.categoria} {pt.sottocategoria}
                                  </button>
                                );
                              })}
                              <button type="button"
                                onClick={() => setEditForm({ ...editForm, product_template_ids: null })}
                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                  !editForm.product_template_ids || editForm.product_template_ids.length === 0
                                    ? 'bg-green-100 border-green-300 text-green-700 font-medium'
                                    : 'bg-gray-50 border-gray-200 text-gray-400'
                                }`}
                              >
                                TUTTI
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium">{campo.etichetta}</div>
                        <div className="text-xs text-gray-400 font-mono">{campo.codice}</div>
                        {campo.valore_default && (
                          <div className="mt-0.5 flex items-center gap-1">
                            <Zap className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                            <span className="text-[10px] text-amber-700 truncate max-w-xs">{labelDefaultValue(campo.valore_default)}</span>
                          </div>
                        )}
                        {campo.product_template_ids && campo.product_template_ids.length > 0 && (
                          <div className="flex flex-wrap gap-0.5 mt-0.5">
                            {campo.product_template_ids.map(ptId => {
                              const pt = productTemplates.find(p => p.id === ptId);
                              return pt ? (
                                <span key={ptId} className="text-[9px] px-1 py-0 rounded bg-blue-50 text-blue-600 border border-blue-200">
                                  {pt.categoria} {pt.sottocategoria}
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Sezione badge + move dropdown (only in "tutti" tab) */}
                  {showSezione && (
                    <td className="px-3 py-2">
                      <select
                        value={campo.sezione}
                        onChange={(e) => moveFieldToSection(campo.id, e.target.value)}
                        disabled={isMoving}
                        className={`text-xs rounded-full px-2 py-1 border-0 cursor-pointer font-medium ${SEZ_COLORS[campo.sezione] || 'bg-gray-100 text-gray-700'}`}
                        title="Clicca per spostare in un'altra sezione"
                      >
                        {sezioni.map(s => (
                          <option key={s.codice} value={s.codice}>{s.etichetta}</option>
                        ))}
                      </select>
                    </td>
                  )}

                  {/* Tipo */}
                  <td className="px-3 py-2">
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Select value={editForm.tipo || campo.tipo} onValueChange={(v) => setEditForm({ ...editForm, tipo: v })}>
                          <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TIPI_CAMPO.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {(editForm.tipo || campo.tipo) === 'dropdown' && (
                          <>
                          <Select value={editForm.gruppo_dropdown || editForm.gruppo_opzioni || campo.gruppo_dropdown || campo.gruppo_opzioni || ''} onValueChange={(v) => { setEditForm({ ...editForm, gruppo_dropdown: v }); setInlineGruppo(null); setShowNewGruppo(false); }}>
                            <SelectTrigger className="h-7 text-xs w-28"><SelectValue placeholder="Gruppo..." /></SelectTrigger>
                            <SelectContent>
                              {gruppiDropdown.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant={inlineGruppo ? 'secondary' : 'ghost'}
                            className="h-7 w-7 p-0"
                            title="Gestisci opzioni del gruppo"
                            onClick={() => openInlineOpzioni(editForm.gruppo_dropdown || editForm.gruppo_opzioni || campo.gruppo_dropdown || campo.gruppo_opzioni || '')}
                            disabled={!(editForm.gruppo_dropdown || editForm.gruppo_opzioni || campo.gruppo_dropdown || campo.gruppo_opzioni)}>
                            <List className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant={showNewGruppo ? 'secondary' : 'ghost'}
                            className="h-7 w-7 p-0" title="Crea nuovo gruppo"
                            onClick={() => { setShowNewGruppo(!showNewGruppo); setInlineGruppo(null); }}>
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                          </>
                        )}
                      </div>
                    ) : (
                      <>
                        <Badge variant="outline" className="text-xs">
                          {campo.tipo}
                          {campo.tipo === 'numero' && campo.unita_misura && (
                            <span className="text-gray-400 ml-1">({campo.unita_misura})</span>
                          )}
                        </Badge>
                        {campo.tipo === 'dropdown' && campo.opzioni && (
                          <span className="text-xs text-gray-400 ml-1">[{campo.opzioni.length}]</span>
                        )}
                      </>
                    )}
                  </td>

                  {/* Obbligatorio */}
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => handleToggleObbligatorio(campo)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                        campo.obbligatorio ? 'bg-red-500 border-red-500 text-white' : 'border-gray-300 hover:border-red-300'
                      }`} title={campo.obbligatorio ? 'Obbligatorio' : 'Opzionale'}>
                      {campo.obbligatorio && <Check className="h-3 w-3" />}
                    </button>
                  </td>

                  {/* Regole */}
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => handleToggleRegole(campo)}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                        campo.usabile_regole ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-green-300'
                      }`} title={campo.usabile_regole ? 'Usabile in regole' : 'Non usabile'}>
                      {campo.usabile_regole && <Check className="h-3 w-3" />}
                    </button>
                  </td>

                  {/* Stato */}
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => handleToggleAttivo(campo)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                        campo.attivo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                      }`}>
                      {campo.attivo ? 'ON' : 'OFF'}
                    </button>
                  </td>

                  {/* Azioni */}
                  <td className="px-3 py-2 text-right">
                    {isEditing ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={handleSaveEdit} className="h-7 w-7 p-0">
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-7 w-7 p-0">
                          <X className="h-4 w-4 text-gray-400" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleEdit(campo)} className="h-7 w-7 p-0">
                          <Edit2 className="h-3.5 w-3.5 text-gray-500" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(campo.id)} className="h-7 w-7 p-0 hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>

                {/* New Gruppo inline form */}
                {isEditing && (editForm.tipo || campo.tipo) === 'dropdown' && showNewGruppo && (
                  <tr className="bg-green-50/50">
                    <td colSpan={showSezione ? 8 : 7} className="px-4 py-3">
                      <div className="border border-green-200 rounded-lg p-3 bg-white">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-green-800">Crea nuovo gruppo opzioni</span>
                          <button onClick={() => setShowNewGruppo(false)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <Label className="text-xs text-gray-500">Codice gruppo</Label>
                            <Input value={newGruppoForm.codice}
                              onChange={(e) => setNewGruppoForm({ ...newGruppoForm, codice: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
                              placeholder="es: tipo_cabina" className="h-7 text-xs font-mono" autoFocus />
                          </div>
                          <div className="flex-1">
                            <Label className="text-xs text-gray-500">Prima opzione (etichetta)</Label>
                            <Input value={newGruppoForm.primaOpzione}
                              onChange={(e) => setNewGruppoForm({ ...newGruppoForm, primaOpzione: e.target.value })}
                              placeholder="es: Standard" className="h-7 text-xs"
                              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateNewGruppo(); }} />
                          </div>
                          <Button size="sm" onClick={handleCreateNewGruppo}
                            disabled={!newGruppoForm.codice.trim()}
                            className="h-7 text-xs bg-green-600 hover:bg-green-700">
                            <Check className="h-3 w-3 mr-1" /> Crea
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setShowNewGruppo(false)} className="h-7 text-xs">
                            Annulla
                          </Button>
                        </div>
                        {newGruppoForm.codice && gruppiDropdown.includes(newGruppoForm.codice) && (
                          <p className="text-xs text-red-500 mt-1">⚠️ Questo codice esiste già</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}

                {/* Inline Options Panel - shown when editing a dropdown field */}
                {isEditing && (editForm.tipo || campo.tipo) === 'dropdown' && inlineGruppo && (
                  <tr className="bg-amber-50/50">
                    <td colSpan={showSezione ? 8 : 7} className="px-4 py-3">
                      <div className="border border-amber-200 rounded-lg p-3 bg-white">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <List className="h-4 w-4 text-amber-600" />
                            <span className="text-sm font-medium text-gray-700">
                              Opzioni di <code className="bg-gray-100 px-1 rounded text-xs">{inlineGruppo}</code>
                            </span>
                            <Badge variant="secondary" className="text-xs">{inlineOpzioni.filter(o => o.attivo).length} attive</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <a href="#" onClick={(e) => { e.preventDefault(); /* navigate to gestione opzioni */ }}
                              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                              <ExternalLink className="h-3 w-3" /> Gestione Opzioni
                            </a>
                            <button onClick={() => setInlineGruppo(null)} className="text-gray-400 hover:text-gray-600">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {inlineLoading ? (
                          <div className="text-center py-2 text-gray-400 text-sm">Caricamento...</div>
                        ) : (
                          <>
                            {/* Options list */}
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {inlineOpzioni.map(o => (
                                <div key={o.id}
                                  className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${
                                    o.attivo ? 'bg-white border-gray-200 text-gray-700' : 'bg-gray-50 border-gray-100 text-gray-400 line-through'
                                  }`}>
                                  <span>{o.etichetta}</span>
                                  <span className="text-gray-300">({o.valore})</span>
                                  <button onClick={() => handleDeleteInlineOpzione(o.id)}
                                    className="text-gray-300 hover:text-red-500 ml-0.5" title="Elimina">
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                              {inlineOpzioni.length === 0 && (
                                <span className="text-xs text-gray-400 italic">Nessuna opzione</span>
                              )}
                            </div>

                            {/* Quick add */}
                            <div className="flex items-end gap-2 pt-2 border-t border-gray-100">
                              <div className="flex-1">
                                <Label className="text-xs text-gray-500">Etichetta (UI)</Label>
                                <Input value={quickAdd.etichetta}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setQuickAdd({
                                      etichetta: v,
                                      valore: v.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
                                    });
                                  }}
                                  placeholder="es: Standard" className="h-7 text-xs"
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAddOpzione(); }}
                                  autoFocus />
                              </div>
                              <div className="flex-1">
                                <Label className="text-xs text-gray-500">Valore (DB)</Label>
                                <Input value={quickAdd.valore}
                                  onChange={(e) => setQuickAdd({ ...quickAdd, valore: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                                  placeholder="auto-generato" className="h-7 text-xs font-mono" />
                              </div>
                              <Button size="sm" onClick={handleQuickAddOpzione}
                                disabled={!quickAdd.valore.trim() || !quickAdd.etichetta.trim()}
                                className="h-7 text-xs bg-amber-600 hover:bg-amber-700">
                                <Plus className="h-3 w-3 mr-1" /> Aggiungi
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                {/* Default Value Editor sub-row */}
                {isEditing && (
                  <tr className="bg-purple-50/40">
                    <td colSpan={showSezione ? 8 : 7} className="px-4 py-2">
                      <div className="border border-purple-200 rounded-lg p-3 bg-white">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className="h-3.5 w-3.5 text-purple-500" />
                          <span className="text-xs font-medium text-purple-800">Valore Default</span>
                          {editForm.valore_default && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 max-w-xs truncate">
                              {editForm.valore_default}
                            </span>
                          )}
                        </div>
                        <DefaultValueEditor
                          value={editForm.valore_default || campo.valore_default || ''}
                          onChange={v => setEditForm({ ...editForm, valore_default: v })}
                          campoTipo={editForm.tipo || campo.tipo || 'testo'}
                          allCampi={pickerCampi}
                          onRequestLoadCampi={loadPickerCampi}
                        />
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
}
