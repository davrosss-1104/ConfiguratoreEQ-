import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitBranch, Plus, Trash2, Loader2, Search, X, Save, ChevronRight, ChevronDown,
  Package, Layers, ShoppingCart, Wrench, GripVertical, Copy, AlertTriangle,
  ArrowDown, Info
} from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface Articolo {
  id: number;
  codice: string;
  descrizione: string;
  tipo_articolo: string;
  costo_fisso: number;
  unita_misura: string;
  fornitore?: string;
  is_active: boolean;
}

interface BomRiga {
  id: number;
  articolo_padre_id: number;
  articolo_figlio_id: number;
  articolo_figlio?: Articolo;
  quantita: number;
  formula_quantita?: string;
  unita_misura?: string;
  condizione_esistenza?: string;
  note?: string;
  ordine: number;
  // Per tree rendering
  children?: BomRiga[];
  level?: number;
  expanded?: boolean;
}

const inputClass = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm";
const labelClass = "block text-xs font-medium text-gray-600 mb-1";

const TIPO_COLORS: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  'MASTER':       { bg: 'bg-blue-100',   text: 'text-blue-700',   icon: <Package className="w-3.5 h-3.5" /> },
  'SEMILAVORATO': { bg: 'bg-amber-100',  text: 'text-amber-700',  icon: <Wrench className="w-3.5 h-3.5" /> },
  'ACQUISTO':     { bg: 'bg-green-100',  text: 'text-green-700',  icon: <ShoppingCart className="w-3.5 h-3.5" /> },
  'PRODUZIONE':   { bg: 'bg-purple-100', text: 'text-purple-700', icon: <Layers className="w-3.5 h-3.5" /> },
};

// === AUTOCOMPLETE ARTICOLI ===
function ArticoloSearch({ onSelect, exclude = [], placeholder = "Cerca articolo..." }: {
  onSelect: (a: Articolo) => void;
  exclude?: number[];
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Articolo[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/articoli/search?q=${encodeURIComponent(query)}&limit=15`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.filter((a: Articolo) => !exclude.includes(a.id)));
          setOpen(true);
        }
      } catch { /* ignore */ }
    }, 250);
  }, [query, exclude.join(',')]);

  const tipo = (t: string) => TIPO_COLORS[t] || TIPO_COLORS['PRODUZIONE'];

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={query} onChange={e => setQuery(e.target.value)} onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder} className={`${inputClass} pl-10 pr-8`} />
        {query && <button onClick={() => { setQuery(''); setResults([]); setOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-gray-400" /></button>}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {results.map(a => {
            const t = tipo(a.tipo_articolo);
            return (
              <button key={a.id} onClick={() => { onSelect(a); setQuery(''); setResults([]); setOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2 border-b last:border-0">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${t.bg} ${t.text} flex items-center gap-1`}>
                  {t.icon} {a.tipo_articolo}
                </span>
                <span className="font-mono text-xs text-indigo-600 font-medium">{a.codice}</span>
                <span className="text-sm text-gray-700 truncate flex-1">{a.descrizione}</span>
                {a.fornitore && <span className="text-[10px] text-gray-400">{a.fornitore}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// === MAIN PAGE ===
export function GestioneBomPage() {
  const queryClient = useQueryClient();
  const [selectedPadre, setSelectedPadre] = useState<Articolo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingRiga, setEditingRiga] = useState<Partial<BomRiga> | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());

  // Articoli che possono avere BOM (MASTER e SEMILAVORATO)
  const { data: articoliPadre = [], isLoading: loadingPadri } = useQuery({
    queryKey: ['articoli-bom-padri', searchQuery],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/articoli?search=${encodeURIComponent(searchQuery)}&limit=200`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      return data.filter((a: Articolo) => ['MASTER', 'SEMILAVORATO', 'PRODUZIONE'].includes(a.tipo_articolo));
    },
  });

  // BOM del padre selezionato
  const { data: bomRighe = [], isLoading: loadingBom } = useQuery({
    queryKey: ['bom', selectedPadre?.id],
    queryFn: async () => {
      if (!selectedPadre) return [];
      const res = await fetch(`${API_BASE}/bom/${selectedPadre.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!selectedPadre,
  });

  // Conteggio figli per ogni articolo (per badge nella lista)
  const { data: bomCounts = {} } = useQuery({
    queryKey: ['bom-counts'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/bom/counts`);
      if (!res.ok) return {};
      return res.json();
    },
  });

  // === MUTATIONS ===
  const addFiglioMutation = useMutation({
    mutationFn: async (data: { articolo_padre_id: number; articolo_figlio_id: number; quantita: number; formula_quantita?: string; condizione_esistenza?: string; note?: string }) => {
      const res = await fetch(`${API_BASE}/bom`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Errore aggiunta componente');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bom', selectedPadre?.id] });
      queryClient.invalidateQueries({ queryKey: ['bom-counts'] });
      toast.success('Componente aggiunto alla distinta');
      setEditingRiga(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateRigaMutation = useMutation({
    mutationFn: async (data: Partial<BomRiga> & { id: number }) => {
      const res = await fetch(`${API_BASE}/bom/${data.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Errore aggiornamento');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bom', selectedPadre?.id] });
      toast.success('Riga aggiornata');
      setEditingRiga(null);
    },
  });

  const deleteRigaMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/bom/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Errore eliminazione');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bom', selectedPadre?.id] });
      queryClient.invalidateQueries({ queryKey: ['bom-counts'] });
      toast.success('Componente rimosso');
    },
  });

  const duplicaBomMutation = useMutation({
    mutationFn: async ({ sourceId, targetId }: { sourceId: number; targetId: number }) => {
      const res = await fetch(`${API_BASE}/bom/duplica`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_articolo_id: sourceId, target_articolo_id: targetId }),
      });
      if (!res.ok) throw new Error('Errore duplicazione');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bom'] });
      queryClient.invalidateQueries({ queryKey: ['bom-counts'] });
      toast.success('BOM duplicata');
    },
  });

  // === HANDLERS ===
  const handleAddFiglio = (articolo: Articolo) => {
    if (!selectedPadre) return;
    if (articolo.id === selectedPadre.id) { toast.error('Un articolo non può contenere sé stesso'); return; }
    setEditingRiga({
      articolo_padre_id: selectedPadre.id,
      articolo_figlio_id: articolo.id,
      articolo_figlio: articolo,
      quantita: 1,
      formula_quantita: '',
      condizione_esistenza: '',
      note: '',
      ordine: bomRighe.length + 1,
    });
  };

  const handleSaveRiga = () => {
    if (!editingRiga) return;
    if (editingRiga.id) {
      updateRigaMutation.mutate(editingRiga as BomRiga);
    } else {
      addFiglioMutation.mutate({
        articolo_padre_id: editingRiga.articolo_padre_id!,
        articolo_figlio_id: editingRiga.articolo_figlio_id!,
        quantita: editingRiga.quantita || 1,
        formula_quantita: editingRiga.formula_quantita || undefined,
        condizione_esistenza: editingRiga.condizione_esistenza || undefined,
        note: editingRiga.note || undefined,
      });
    }
  };

  const toggleNode = (id: number) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const existingFigliIds = bomRighe.map((r: BomRiga) => r.articolo_figlio_id);

  const tipo = (t: string) => TIPO_COLORS[t] || TIPO_COLORS['PRODUZIONE'];

  // === RENDER ===
  return (
    <div className="bg-white/70 rounded-lg shadow">
      {/* HEADER */}
      <div className="px-6 py-4 border-b bg-gray-50/70">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <GitBranch className="w-6 h-6 text-blue-600" /> Gestione Distinte Base (BOM)
        </h2>
        <p className="text-sm text-gray-600 mt-0.5">
          Seleziona un articolo padre per vedere e modificare i suoi componenti
        </p>
      </div>

      <div className="flex" style={{ minHeight: 'calc(100vh - 260px)' }}>
        {/* COLONNA SINISTRA: Lista articoli padre */}
        <div className="w-[320px] border-r flex flex-col">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Cerca articolo padre..." className={`${inputClass} pl-10 pr-8 text-xs`} />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-gray-400" /></button>}
            </div>
          </div>

          <div className="overflow-auto flex-1">
            {loadingPadri ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
            ) : articoliPadre.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">Nessun articolo</div>
            ) : (
              articoliPadre.map((a: Articolo) => {
                const t = tipo(a.tipo_articolo);
                const count = (bomCounts as Record<number, number>)[a.id] || 0;
                const isSelected = selectedPadre?.id === a.id;
                return (
                  <button key={a.id} onClick={() => { setSelectedPadre(a); setEditingRiga(null); }}
                    className={`w-full text-left px-3 py-2.5 border-b transition-colors ${isSelected ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${t.bg} ${t.text}`}>{a.tipo_articolo.substring(0, 3)}</span>
                      <span className="font-mono text-xs text-indigo-700 font-medium">{a.codice}</span>
                      {count > 0 && <span className="ml-auto px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">{count}</span>}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 truncate">{a.descrizione}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* COLONNA CENTRALE: BOM Tree */}
        <div className="flex-1 flex flex-col">
          {!selectedPadre ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <GitBranch className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Seleziona un articolo dalla lista per vederne la distinta</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header articolo selezionato */}
              <div className="px-4 py-3 border-b bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${tipo(selectedPadre.tipo_articolo).bg}`}>
                      {tipo(selectedPadre.tipo_articolo).icon}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-indigo-700">{selectedPadre.codice}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tipo(selectedPadre.tipo_articolo).bg} ${tipo(selectedPadre.tipo_articolo).text}`}>
                          {selectedPadre.tipo_articolo}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{selectedPadre.descrizione}</p>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">{bomRighe.length} component{bomRighe.length === 1 ? 'e' : 'i'}</div>
                </div>
              </div>

              {/* Aggiungi componente */}
              <div className="px-4 py-3 border-b bg-blue-50/50">
                <div className="flex items-center gap-2 mb-2">
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">Aggiungi componente</span>
                </div>
                <ArticoloSearch
                  onSelect={handleAddFiglio}
                  exclude={[selectedPadre.id, ...existingFigliIds]}
                  placeholder="Cerca articolo da aggiungere alla distinta..."
                />
              </div>

              {/* Lista componenti */}
              <div className="flex-1 overflow-auto">
                {loadingBom ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
                ) : bomRighe.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <Layers className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">Nessun componente nella distinta</p>
                    <p className="text-xs mt-1">Usa la barra sopra per aggiungere articoli</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-xs text-gray-500 uppercase">
                        <th className="px-3 py-2 text-left w-8">#</th>
                        <th className="px-3 py-2 text-left">Tipo</th>
                        <th className="px-3 py-2 text-left">Codice</th>
                        <th className="px-3 py-2 text-left">Descrizione</th>
                        <th className="px-3 py-2 text-center w-20">Qtà</th>
                        <th className="px-3 py-2 text-left">Formula</th>
                        <th className="px-3 py-2 text-left">Condizione</th>
                        <th className="px-3 py-2 text-left w-32">Note</th>
                        <th className="px-3 py-2 text-center w-24">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bomRighe.map((r: BomRiga, idx: number) => {
                        const figlio = r.articolo_figlio;
                        const t = figlio ? tipo(figlio.tipo_articolo) : tipo('ACQUISTO');
                        const isEditing = editingRiga?.id === r.id;
                        const hasBom = figlio && (bomCounts as Record<number, number>)[figlio.id];

                        return (
                          <tr key={r.id} className={`border-b hover:bg-gray-50 ${isEditing ? 'bg-yellow-50' : ''}`}>
                            <td className="px-3 py-2 text-gray-400 text-xs">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-1 ${t.bg} ${t.text}`}>
                                {t.icon} {figlio?.tipo_articolo?.substring(0, 3) || '?'}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <span className="font-mono text-xs font-medium text-indigo-700">{figlio?.codice || '?'}</span>
                                {hasBom && (
                                  <button onClick={() => figlio && setSelectedPadre(figlio)} title="Ha sotto-componenti, clicca per aprire"
                                    className="p-0.5 rounded hover:bg-indigo-100">
                                    <ArrowDown className="w-3 h-3 text-indigo-400" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-gray-700 text-xs truncate max-w-[200px]">{figlio?.descrizione || '?'}</td>
                            <td className="px-3 py-2 text-center">
                              {isEditing ? (
                                <input type="number" step="0.01" min="0" value={editingRiga?.quantita || 1}
                                  onChange={e => setEditingRiga(prev => prev ? { ...prev, quantita: parseFloat(e.target.value) || 0 } : null)}
                                  className="w-16 text-center border rounded px-1 py-0.5 text-xs" />
                              ) : (
                                <span className="font-medium">{r.quantita}</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {isEditing ? (
                                <input value={editingRiga?.formula_quantita || ''} placeholder="[NUM_FERMATE]*2"
                                  onChange={e => setEditingRiga(prev => prev ? { ...prev, formula_quantita: e.target.value } : null)}
                                  className="w-full border rounded px-1 py-0.5 text-xs font-mono" />
                              ) : r.formula_quantita ? (
                                <span className="font-mono text-xs text-amber-700 bg-amber-50 px-1 py-0.5 rounded">{r.formula_quantita}</span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2">
                              {isEditing ? (
                                <input value={editingRiga?.condizione_esistenza || ''} placeholder="tipo_motore=GEARLESS"
                                  onChange={e => setEditingRiga(prev => prev ? { ...prev, condizione_esistenza: e.target.value } : null)}
                                  className="w-full border rounded px-1 py-0.5 text-xs font-mono" />
                              ) : r.condizione_esistenza ? (
                                <span className="font-mono text-xs text-purple-700 bg-purple-50 px-1 py-0.5 rounded">{r.condizione_esistenza}</span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[120px]">
                              {isEditing ? (
                                <input value={editingRiga?.note || ''} onChange={e => setEditingRiga(prev => prev ? { ...prev, note: e.target.value } : null)}
                                  className="w-full border rounded px-1 py-0.5 text-xs" />
                              ) : r.note || <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {isEditing ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <button onClick={handleSaveRiga} className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700"><Save className="w-3.5 h-3.5" /></button>
                                  <button onClick={() => setEditingRiga(null)} className="p-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300"><X className="w-3.5 h-3.5" /></button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 justify-center">
                                  <button onClick={() => setEditingRiga({ ...r })} className="p-1 rounded hover:bg-blue-100 text-gray-400 hover:text-blue-600" title="Modifica">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  </button>
                                  <button onClick={() => { if (confirm(`Rimuovere "${figlio?.codice}" dalla distinta?`)) deleteRigaMutation.mutate(r.id); }}
                                    className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600" title="Rimuovi">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer con info */}
              {bomRighe.length > 0 && (
                <div className="px-4 py-2 border-t bg-gray-50/70 flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1"><Info className="w-3.5 h-3.5" /> Legenda:</div>
                  <div className="flex items-center gap-1"><span className="font-mono bg-amber-50 text-amber-700 px-1 rounded">formula</span> = quantità calcolata con placeholder</div>
                  <div className="flex items-center gap-1"><span className="font-mono bg-purple-50 text-purple-700 px-1 rounded">condizione</span> = riga inclusa solo se condizione vera</div>
                  <div className="flex items-center gap-1"><ArrowDown className="w-3 h-3 text-indigo-400" /> = ha sotto-distinta</div>
                </div>
              )}
            </>
          )}
        </div>

        {/* COLONNA DESTRA: Form editing nuova riga */}
        {editingRiga && !editingRiga.id && (
          <div className="w-[300px] border-l bg-white">
            <div className="px-4 py-3 border-b bg-blue-50">
              <h3 className="font-semibold text-sm text-blue-800 flex items-center gap-2">
                <Plus className="w-4 h-4" /> Nuovo componente
              </h3>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className={labelClass}>Articolo</label>
                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${tipo(editingRiga.articolo_figlio?.tipo_articolo || '').bg} ${tipo(editingRiga.articolo_figlio?.tipo_articolo || '').text}`}>
                    {editingRiga.articolo_figlio?.tipo_articolo?.substring(0, 3)}
                  </span>
                  <div>
                    <p className="font-mono text-xs font-medium text-indigo-700">{editingRiga.articolo_figlio?.codice}</p>
                    <p className="text-xs text-gray-600">{editingRiga.articolo_figlio?.descrizione}</p>
                  </div>
                </div>
              </div>

              <div>
                <label className={labelClass}>Quantità *</label>
                <input type="number" step="0.01" min="0" value={editingRiga.quantita || 1}
                  onChange={e => setEditingRiga(prev => prev ? { ...prev, quantita: parseFloat(e.target.value) || 0 } : null)}
                  className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>Formula quantità</label>
                <input value={editingRiga.formula_quantita || ''} placeholder="Es: [NUM_FERMATE]*2"
                  onChange={e => setEditingRiga(prev => prev ? { ...prev, formula_quantita: e.target.value } : null)}
                  className={`${inputClass} font-mono`} />
                <p className="text-[10px] text-gray-400 mt-1">Se presente, la formula sovrascrive la quantità fissa durante l'esplosione</p>
              </div>

              <div>
                <label className={labelClass}>Condizione esistenza</label>
                <input value={editingRiga.condizione_esistenza || ''} placeholder="Es: tipo_motore=GEARLESS"
                  onChange={e => setEditingRiga(prev => prev ? { ...prev, condizione_esistenza: e.target.value } : null)}
                  className={`${inputClass} font-mono`} />
                <p className="text-[10px] text-gray-400 mt-1">Se presente, il componente è incluso solo quando la condizione è vera</p>
              </div>

              <div>
                <label className={labelClass}>Note</label>
                <textarea value={editingRiga.note || ''} rows={2}
                  onChange={e => setEditingRiga(prev => prev ? { ...prev, note: e.target.value } : null)}
                  className={`${inputClass} resize-none`} />
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={handleSaveRiga} disabled={addFiglioMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                  {addFiglioMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Aggiungi
                </button>
                <button onClick={() => setEditingRiga(null)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
                  Annulla
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GestioneBomPage;
