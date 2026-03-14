/**
 * RicercaOrdiniPage.tsx — Ricerca ordini con filtri + selezione multipla per fatturazione
 */
import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search, Filter, X, FileText, Building2, Calendar,
  ChevronRight, SlidersHorizontal, Package, Receipt,
  CheckCircle2, Loader2, AlertTriangle, Boxes, Clock,
  Ban, ArrowRight
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL ?? '';

// ============================================================
// TIPI
// ============================================================

interface OrdineResult {
  id: number;
  numero_ordine: string;
  preventivo_id: number;
  cliente_id: number | null;
  stato: string;
  tipo_impianto: string | null;
  totale_materiali: number;
  totale_netto: number;
  lead_time_giorni: number;
  data_consegna_prevista: string | null;
  bom_esplosa: boolean;
  created_at: string;
  updated_at: string | null;
  riferimento_cliente: string | null;
  condizioni_pagamento: string | null;
  cliente_ragione_sociale: string | null;
  cliente_codice: string | null;
  n_materiali: number;
}

// ============================================================
// COSTANTI
// ============================================================

const STATO_OPTIONS = [
  { value: '', label: 'Tutti gli stati' },
{ value: 'confermato', label: 'Confermato' },
{ value: 'in_produzione', label: 'In Produzione' },
{ value: 'completato', label: 'Completato' },
{ value: 'spedito', label: 'Spedito' },
{ value: 'fatturato', label: 'Fatturato' },
{ value: 'sospeso', label: 'Sospeso' },
{ value: 'annullato', label: 'Annullato' },
];

const STATO_BADGE: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  confermato:      { bg: 'bg-green-50 border-green-200',  text: 'text-green-700',  icon: <CheckCircle2 className="w-3 h-3" /> },
  in_produzione:   { bg: 'bg-amber-50 border-amber-200',  text: 'text-amber-700',  icon: <Boxes className="w-3 h-3" /> },
  completato:      { bg: 'bg-blue-50 border-blue-200',    text: 'text-blue-700',   icon: <Package className="w-3 h-3" /> },
  fatturato:       { bg: 'bg-violet-50 border-violet-200', text: 'text-violet-700', icon: <Receipt className="w-3 h-3" /> },
  annullato:       { bg: 'bg-red-50 border-red-200',      text: 'text-red-700',    icon: <Ban className="w-3 h-3" /> },
};

const fmt = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

// ============================================================
// COMPONENTE PRINCIPALE
// ============================================================

export default function RicercaOrdiniPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Filtri
  const [searchText, setSearchText] = useState('');
  const [stato, setStato] = useState('');
  const [dataDa, setDataDa] = useState('');
  const [dataA, setDataA] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Selezione multipla
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [fatturaLoading, setFatturaLoading] = useState(false);

  // Debounce
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearchText(val);
    if (debounceTimer) clearTimeout(debounceTimer);
    const t = setTimeout(() => setDebouncedSearch(val), 300);
    setDebounceTimer(t);
  }, [debounceTimer]);

  // Query params
  const buildParams = () => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set('q', debouncedSearch);
    if (stato) p.set('stato', stato);
    if (dataDa) p.set('data_da', dataDa);
    if (dataA) p.set('data_a', dataA);
    return p.toString();
  };

  const hasActiveFilters = stato || dataDa || dataA;

  const { data: results = [], isLoading } = useQuery<OrdineResult[]>({
    queryKey: ['search-ordini', debouncedSearch, stato, dataDa, dataA],
    queryFn: async () => {
      const params = buildParams();
      const res = await fetch(`${API}/ordini/search?${params}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const clearFilters = () => {
    setStato('');
    setDataDa('');
    setDataA('');
  };

  // ── Selezione ──

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = results.filter(r => r.stato === 'completato');
    if (selectable.every(r => selectedIds.has(r.id))) {
      // Deseleziona tutti
      setSelectedIds(prev => {
        const next = new Set(prev);
        selectable.forEach(r => next.delete(r.id));
        return next;
      });
    } else {
      // Seleziona tutti completati
      setSelectedIds(prev => {
        const next = new Set(prev);
        selectable.forEach(r => next.add(r.id));
        return next;
      });
    }
  };

  // Dati selezione
  const selectedOrdini = useMemo(
    () => results.filter(r => selectedIds.has(r.id)),
    [results, selectedIds]
  );

  const selectedTotal = useMemo(
    () => selectedOrdini.reduce((s, o) => s + (o.totale_netto || o.totale_materiali || 0), 0),
    [selectedOrdini]
  );

  // Validazione: tutti stesso cliente
  const selectedClienti = useMemo(
    () => new Set(selectedOrdini.map(o => o.cliente_id).filter(Boolean)),
    [selectedOrdini]
  );
  const clienteMismatch = selectedClienti.size > 1;

  const selectableCount = results.filter(r => r.stato === 'completato').length;
  const allSelectableSelected = selectableCount > 0 &&
    results.filter(r => r.stato === 'completato').every(r => selectedIds.has(r.id));

  // ── Creazione fattura ──

  const handleCreaFattura = async () => {
    if (selectedIds.size === 0 || clienteMismatch) return;
    setFatturaLoading(true);
    try {
      const r = await fetch('/api/fatturazione/fatture/da-ordini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordine_ids: Array.from(selectedIds) }),
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.detail || 'Errore creazione fattura');
      }
      const data = await r.json();
      toast.success(`Fattura #${data.id} creata per ${data.totale_ordini} ordine/i`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['search-ordini'] });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setFatturaLoading(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" />
                Ricerca Ordini
              </h1>
            </div>
            <span className="text-sm text-gray-500">
              {results.length} risultat{results.length === 1 ? 'o' : 'i'}
              {selectableCount > 0 && (
                <span className="ml-2 text-blue-600 font-medium">
                  · {selectableCount} fatturabil{selectableCount === 1 ? 'e' : 'i'}
                </span>
              )}
            </span>
          </div>

          {/* Barra ricerca */}
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Cerca per numero ordine, cliente, tipo impianto, rif. cliente..."
                className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                autoFocus
              />
              {searchText && (
                <button onClick={() => { setSearchText(''); setDebouncedSearch(''); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm font-medium transition-colors
                ${showFilters || hasActiveFilters
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtri
              {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-indigo-500" />}
            </button>
          </div>

          {/* Pannello filtri */}
          {showFilters && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Filter className="w-4 h-4" /> Filtri avanzati
                </span>
                {hasActiveFilters && (
                  <button onClick={clearFilters}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                    Pulisci filtri
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Stato</label>
                  <select value={stato} onChange={(e) => setStato(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400">
                    {STATO_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Dal</label>
                  <input type="date" value={dataDa} onChange={(e) => setDataDa(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Al</label>
                  <input type="date" value={dataA} onChange={(e) => setDataA(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Risultati ── */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto" />
            <p className="mt-3 text-sm text-gray-500">Ricerca in corso...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nessun ordine trovato</p>
            <p className="text-sm text-gray-400 mt-1">Prova a modificare i criteri di ricerca</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <th className="px-3 py-3 text-center w-10">
                    {selectableCount > 0 && (
                      <input type="checkbox"
                        checked={allSelectableSelected}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                        title="Seleziona tutti i completati"
                      />
                    )}
                  </th>
                  <th className="px-3 py-3 text-left">N° Ordine</th>
                  <th className="px-3 py-3 text-left">Cliente</th>
                  <th className="px-3 py-3 text-left">Tipo Impianto</th>
                  <th className="px-3 py-3 text-center">Stato</th>
                  <th className="px-3 py-3 text-center">Articoli</th>
                  <th className="px-3 py-3 text-right">Totale</th>
                  <th className="px-3 py-3 text-right">Data</th>
                  <th className="px-3 py-3 text-right">Consegna</th>
                  <th className="px-3 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r) => {
                  const isSelected = selectedIds.has(r.id);
                  const canSelect = r.stato === 'completato';
                  const sb = STATO_BADGE[r.stato] || STATO_BADGE.confermato;

                  return (
                    <tr key={r.id}
                      className={`transition-colors group ${
                        isSelected
                          ? 'bg-indigo-50/60'
                          : 'hover:bg-gray-50/70'
                      } ${canSelect ? 'cursor-pointer' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3 text-center"
                        onClick={(e) => { e.stopPropagation(); if (canSelect) toggleSelect(r.id); }}
                      >
                        {canSelect ? (
                          <input type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(r.id)}
                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          />
                        ) : (
                          <span className="w-4 h-4 block" />
                        )}
                      </td>

                      {/* Numero ordine */}
                      <td className="px-3 py-3"
                        onClick={() => navigate(`/preventivo/${r.preventivo_id}`)}
                      >
                        <div className="flex items-center gap-2 cursor-pointer">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                            {r.numero_ordine}
                          </span>
                        </div>
                        {r.riferimento_cliente && (
                          <div className="text-[11px] text-gray-400 mt-0.5 ml-6">
                            Rif: {r.riferimento_cliente}
                          </div>
                        )}
                      </td>

                      {/* Cliente */}
                      <td className="px-3 py-3" onClick={() => navigate(`/preventivo/${r.preventivo_id}`)}>
                        {r.cliente_ragione_sociale ? (
                          <div className="flex items-center gap-1.5 cursor-pointer">
                            <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="text-gray-800 truncate max-w-[180px]">{r.cliente_ragione_sociale}</span>
                            {r.cliente_codice && (
                              <span className="text-gray-400 text-[10px]">({r.cliente_codice})</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 italic">—</span>
                        )}
                      </td>

                      {/* Tipo impianto */}
                      <td className="px-3 py-3 text-gray-700 text-xs"
                        onClick={() => navigate(`/preventivo/${r.preventivo_id}`)}>
                        {r.tipo_impianto || '—'}
                      </td>

                      {/* Stato */}
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${sb.bg} ${sb.text}`}>
                          {sb.icon}
                          {STATO_OPTIONS.find(s => s.value === r.stato)?.label || r.stato}
                        </span>
                      </td>

                      {/* Articoli */}
                      <td className="px-3 py-3 text-center text-gray-500">
                        {r.n_materiali || 0}
                      </td>

                      {/* Totale */}
                      <td className="px-3 py-3 text-right font-medium text-gray-900">
                        {fmt(r.totale_netto || r.totale_materiali || 0)}
                      </td>

                      {/* Data creazione */}
                      <td className="px-3 py-3 text-right text-gray-500">
                        <div className="flex items-center gap-1 justify-end text-xs">
                          <Calendar className="w-3 h-3" />
                          {r.created_at ? new Date(r.created_at).toLocaleDateString('it-IT') : '—'}
                        </div>
                      </td>

                      {/* Data consegna */}
                      <td className="px-3 py-3 text-right text-gray-500">
                        <div className="flex items-center gap-1 justify-end text-xs">
                          {r.data_consegna_prevista ? (
                            <>
                              <Clock className="w-3 h-3" />
                              {new Date(r.data_consegna_prevista).toLocaleDateString('it-IT')}
                            </>
                          ) : '—'}
                        </div>
                      </td>

                      {/* Arrow */}
                      <td className="px-3 py-3 text-right cursor-pointer"
                        onClick={() => navigate(`/preventivo/${r.preventivo_id}`)}>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Floating Action Bar — selezione attiva ── */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40">
          <div className="max-w-5xl mx-auto px-6 pb-6">
            <div className="bg-gray-900 text-white rounded-xl shadow-2xl px-6 py-4 flex items-center gap-4">

              {/* Info selezione */}
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {selectedIds.size} ordine/i selezionato/i
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Totale: {fmt(selectedTotal)}
                  {selectedOrdini[0]?.cliente_ragione_sociale && (
                    <span> · {selectedOrdini[0].cliente_ragione_sociale}</span>
                  )}
                </div>
              </div>

              {/* Warning clienti diversi */}
              {clienteMismatch && (
                <div className="flex items-center gap-2 text-amber-400 text-xs bg-amber-950/50 px-3 py-2 rounded-lg">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Clienti diversi — seleziona ordini dello stesso cliente</span>
                </div>
              )}

              {/* Azioni */}
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedIds(new Set())}
                  className="px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                  Deseleziona
                </button>
                <button
                  onClick={handleCreaFattura}
                  disabled={fatturaLoading || clienteMismatch || selectedIds.size === 0}
                  className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {fatturaLoading
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Receipt className="w-4 h-4" />
                  }
                  Crea Fattura
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
