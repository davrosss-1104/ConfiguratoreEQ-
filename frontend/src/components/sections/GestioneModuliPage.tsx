/**
 * GestioneModuliPage.tsx
 * 
 * Pagina admin renderizzata inline nel PreventivoPage.
 * Due sezioni:
 *   1. Moduli attivabili (toggle on/off con card)
 *   2. Parametri sistema (tabella editabile raggruppata)
 * 
 * POSIZIONE: frontend/src/components/sections/GestioneModuliPage.tsx
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Power, Settings, Save, Loader2, CheckCircle, XCircle,
  ChevronDown, ChevronRight, Edit2, X, AlertTriangle,
  Receipt, Package, Database, ToggleLeft, ToggleRight,
  Search
} from 'lucide-react';

const API_BASE = 'http://localhost:8000';

// ============================================================
// TIPI
// ============================================================

interface Modulo {
  codice: string;
  nome: string;
  descrizione: string;
  attivo: boolean;
}

interface Parametro {
  id: number;
  chiave: string;
  valore: string;
  descrizione: string;
  tipo_dato: string;
  gruppo: string;
}

// Icone per moduli noti
const MODULO_ICONS: Record<string, React.ReactNode> = {
  fatturazione: <Receipt className="w-6 h-6" />,
  magazzino: <Package className="w-6 h-6" />,
};

const MODULO_COLORS: Record<string, { bg: string; border: string; accent: string }> = {
  fatturazione: { bg: 'bg-blue-50', border: 'border-blue-200', accent: 'text-blue-600' },
  magazzino: { bg: 'bg-amber-50', border: 'border-amber-200', accent: 'text-amber-600' },
};

const DEFAULT_COLOR = { bg: 'bg-gray-50', border: 'border-gray-200', accent: 'text-gray-600' };

// ============================================================
// COMPONENTE
// ============================================================

export default function GestioneModuliPage() {
  const [activeTab, setActiveTab] = useState<'moduli' | 'parametri'>('moduli');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Moduli & Parametri</h1>
        <p className="text-sm text-gray-500 mt-1">Attiva/disattiva moduli opzionali e configura i parametri di sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b">
        <button onClick={() => setActiveTab('moduli')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'moduli' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          <Power className="w-4 h-4" /> Moduli
        </button>
        <button onClick={() => setActiveTab('parametri')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'parametri' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}>
          <Settings className="w-4 h-4" /> Parametri Sistema
        </button>
      </div>

      {activeTab === 'moduli' && <ModuliSection />}
      {activeTab === 'parametri' && <ParametriSection />}
    </div>
  );
}


// ============================================================
// SEZIONE MODULI
// ============================================================

function ModuliSection() {
  const [moduli, setModuli] = useState<Modulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ codice: string; ok: boolean; msg: string } | null>(null);

  const loadModuli = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/moduli-disponibili`);
      if (r.ok) setModuli(await r.json());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadModuli(); }, [loadModuli]);

  const handleToggle = async (codice: string, nuovoStato: boolean) => {
    setToggling(codice);
    setFeedback(null);
    try {
      const r = await fetch(`${API_BASE}/moduli-attivi/${codice}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attivo: nuovoStato }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Errore');
      setModuli(prev => prev.map(m => m.codice === codice ? { ...m, attivo: nuovoStato } : m));
      setFeedback({
        codice,
        ok: true,
        msg: nuovoStato ? 'Modulo attivato. Ricaricare la pagina per vedere le modifiche al menu.' : 'Modulo disattivato.',
      });
      setTimeout(() => setFeedback(null), 5000);
    } catch (e: any) {
      setFeedback({ codice, ok: false, msg: e.message });
    } finally {
      setToggling(null);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  if (moduli.length === 0) return (
    <div className="text-center py-12 text-gray-400">
      <Database className="w-12 h-12 mx-auto mb-3 text-gray-300" />
      <p>Nessun modulo disponibile.</p>
      <p className="text-xs mt-1">Eseguire la migrazione: <code className="bg-gray-100 px-1 rounded">python moduli_attivabili.py configuratore.db</code></p>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        I moduli opzionali aggiungono funzionalità all'applicazione. Attivando un modulo compariranno
        nuove voci nel menu e saranno disponibili i relativi endpoint API.
      </p>

      <div className="grid gap-4">
        {moduli.map(m => {
          const colors = MODULO_COLORS[m.codice] || DEFAULT_COLOR;
          const icon = MODULO_ICONS[m.codice] || <Power className="w-6 h-6" />;
          const isToggling = toggling === m.codice;

          return (
            <div key={m.codice}
              className={`rounded-xl border-2 p-5 transition-all ${
                m.attivo ? `${colors.bg} ${colors.border}` : 'bg-white border-gray-200'
              }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg ${m.attivo ? colors.bg : 'bg-gray-100'}`}>
                    <span className={m.attivo ? colors.accent : 'text-gray-400'}>{icon}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg">{m.nome}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">{m.descrizione}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        m.attivo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {m.attivo ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {m.attivo ? 'Attivo' : 'Disattivato'}
                      </span>
                      <span className="text-xs text-gray-400">codice: {m.codice}</span>
                    </div>
                  </div>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => handleToggle(m.codice, !m.attivo)}
                  disabled={isToggling}
                  className={`flex-shrink-0 relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    m.attivo ? 'bg-blue-600' : 'bg-gray-300'
                  } ${isToggling ? 'opacity-50' : 'cursor-pointer'}`}
                >
                  {isToggling ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white absolute left-1/2 -translate-x-1/2" />
                  ) : (
                    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      m.attivo ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  )}
                </button>
              </div>

              {/* Feedback per questo modulo */}
              {feedback && feedback.codice === m.codice && (
                <div className={`mt-3 px-3 py-2 rounded-lg text-sm flex items-center gap-2 ${
                  feedback.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {feedback.ok ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                  {feedback.msg}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ============================================================
// SEZIONE PARAMETRI
// ============================================================

function ParametriSection() {
  const [parametri, setParametri] = useState<Parametro[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const loadParametri = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/parametri-sistema`);
      if (r.ok) setParametri(await r.json());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadParametri(); }, [loadParametri]);

  // Raggruppa per gruppo, filtra per search
  const grouped = useMemo(() => {
    const s = search.toLowerCase();
    const filtered = s
      ? parametri.filter(p =>
          p.chiave.toLowerCase().includes(s) ||
          (p.descrizione || '').toLowerCase().includes(s) ||
          (p.gruppo || '').toLowerCase().includes(s) ||
          p.valore.toLowerCase().includes(s))
      : parametri;

    const result: Record<string, Parametro[]> = {};
    filtered.forEach(p => {
      const g = p.gruppo || 'altro';
      if (!result[g]) result[g] = [];
      result[g].push(p);
    });
    return result;
  }, [parametri, search]);

  const startEdit = (p: Parametro) => {
    setEditingId(p.id);
    setEditValue(p.valore);
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const saveEdit = async (p: Parametro) => {
    setSaving(true); setError('');
    try {
      const r = await fetch(`${API_BASE}/parametri-sistema/${p.chiave}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valore: editValue }),
      });
      if (!r.ok) throw new Error('Errore salvataggio');
      setParametri(prev => prev.map(x => x.id === p.id ? { ...x, valore: editValue } : x));
      setEditingId(null);
      setSuccess(`Parametro "${p.chiave}" aggiornato`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Search + feedback */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            placeholder="Cerca parametro..." />
        </div>
        <span className="text-xs text-gray-400">{parametri.length} parametri</span>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4" /> {success}
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Grouped parametri */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          {search ? 'Nessun parametro trovato' : 'Nessun parametro di sistema configurato'}
        </div>
      ) : (
        Object.entries(grouped).map(([gruppo, params]) => (
          <div key={gruppo} className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b">
              <h3 className="font-semibold text-gray-900 capitalize flex items-center gap-2">
                <Settings className="w-4 h-4 text-gray-400" />
                {gruppo}
                <span className="text-xs font-normal text-gray-400 ml-1">({params.length})</span>
              </h3>
            </div>
            <div className="divide-y">
              {params.map(p => {
                const isEditing = editingId === p.id;
                return (
                  <div key={p.id} className={`px-4 py-3 flex items-center gap-4 ${isEditing ? 'bg-blue-50/30' : 'hover:bg-gray-50'}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm text-gray-700">{p.chiave}</div>
                      {p.descrizione && <div className="text-xs text-gray-400 mt-0.5 truncate">{p.descrizione}</div>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isEditing ? (
                        <>
                          {p.tipo_dato === 'boolean' ? (
                            <select value={editValue} onChange={e => setEditValue(e.target.value)}
                              className="px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-blue-500">
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : (
                            <input
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              type={p.tipo_dato === 'number' ? 'number' : 'text'}
                              step={p.tipo_dato === 'number' ? '0.01' : undefined}
                              className="px-2 py-1 border rounded text-sm w-32 focus:ring-2 focus:ring-blue-500"
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') saveEdit(p); if (e.key === 'Escape') cancelEdit(); }}
                            />
                          )}
                          <button onClick={() => saveEdit(p)} disabled={saving}
                            className="p-1 text-green-600 hover:bg-green-50 rounded">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          </button>
                          <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className={`font-semibold text-sm px-2 py-0.5 rounded ${
                            p.tipo_dato === 'boolean'
                              ? (p.valore === 'true' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')
                              : p.tipo_dato === 'number'
                                ? 'bg-blue-50 text-blue-700'
                                : 'text-gray-800'
                          }`}>
                            {p.tipo_dato === 'number' && p.gruppo === 'ricarichi' ? `${p.valore}%` : p.valore}
                          </span>
                          <button onClick={() => startEdit(p)}
                            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ opacity: 1 }}>
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
