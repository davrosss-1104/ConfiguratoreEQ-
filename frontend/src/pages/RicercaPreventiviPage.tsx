/**
 * RicercaPreventiviPage.tsx — Ricerca preventivi con filtri multipli
 */
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getAuthHeaders } from '@/hooks/useAuth';
import {
  Search, Filter, X, FileText, Building, Calendar,
  ChevronRight, SlidersHorizontal
} from 'lucide-react';

const API = 'http://localhost:8000';

interface SearchResult {
  id: number;
  numero_preventivo: string;
  status: string;
  categoria: string;
  total_price: number;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  cliente_id: number | null;
  cliente_ragione_sociale?: string;
  cliente_codice?: string;
  template_id: number | null;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Tutti gli stati' },
  { value: 'draft', label: 'Bozza' },
  { value: 'confermato', label: 'Confermato' },
  { value: 'inviato', label: 'Inviato' },
];

const CATEGORIA_OPTIONS = [
  { value: '', label: 'Tutte le linee' },
  { value: 'RISE', label: 'RISE' },
  { value: 'HOME', label: 'HOME' },
];

const statusBadge = (status: string) => {
  switch (status) {
    case 'draft': return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'confermato': return 'bg-green-50 text-green-700 border-green-200';
    case 'inviato': return 'bg-blue-50 text-blue-700 border-blue-200';
    default: return 'bg-gray-50 text-gray-600 border-gray-200';
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'draft': return 'Bozza';
    case 'confermato': return 'Confermato';
    case 'inviato': return 'Inviato';
    default: return status;
  }
};

const catBadge = (cat: string) => {
  switch (cat) {
    case 'RISE': return 'bg-green-100 text-green-800';
    case 'HOME': return 'bg-amber-100 text-amber-800';
    default: return 'bg-gray-100 text-gray-600';
  }
};

const fmt = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

export default function RicercaPreventiviPage() {
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState('');
  const [status, setStatus] = useState('');
  const [categoria, setCategoria] = useState('');
  const [dataDa, setDataDa] = useState('');
  const [dataA, setDataA] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearchText(val);
    if (debounceTimer) clearTimeout(debounceTimer);
    const t = setTimeout(() => setDebouncedSearch(val), 300);
    setDebounceTimer(t);
  }, [debounceTimer]);

  // Costruisci query params
  const buildParams = () => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set('q', debouncedSearch);
    if (status) p.set('status', status);
    if (categoria) p.set('categoria', categoria);
    if (dataDa) p.set('data_da', dataDa);
    if (dataA) p.set('data_a', dataA);
    return p.toString();
  };

  const hasActiveFilters = status || categoria || dataDa || dataA;

  const { data: results = [], isLoading } = useQuery<SearchResult[]>({
    queryKey: ['search-preventivi', debouncedSearch, status, categoria, dataDa, dataA],
    queryFn: async () => {
      const params = buildParams();
      const res = await fetch(`${API}/preventivi/search?${params}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const clearFilters = () => {
    setStatus('');
    setCategoria('');
    setDataDa('');
    setDataA('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-gray-900">Ricerca Preventivi</h1>
            </div>
            <span className="text-sm text-gray-500">
              {results.length} risultat{results.length === 1 ? 'o' : 'i'}
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
                placeholder="Cerca per numero preventivo, cliente, ragione sociale..."
                className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg 
                  focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                autoFocus
              />
              {searchText && (
                <button
                  onClick={() => { setSearchText(''); setDebouncedSearch(''); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
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
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
              )}
            </button>
          </div>

          {/* Pannello filtri */}
          {showFilters && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Filter className="w-4 h-4" />
                  Filtri avanzati
                </span>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Pulisci filtri
                  </button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-3">
                {/* Stato */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Stato</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm 
                      focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  >
                    {STATUS_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Linea prodotto */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Linea prodotto</label>
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm
                      focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  >
                    {CATEGORIA_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {/* Data da */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Dal</label>
                  <input
                    type="date"
                    value={dataDa}
                    onChange={(e) => setDataDa(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm
                      focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  />
                </div>

                {/* Data a */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Al</label>
                  <input
                    type="date"
                    value={dataA}
                    onChange={(e) => setDataA(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm
                      focus:ring-1 focus:ring-indigo-400 focus:border-indigo-400"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Risultati */}
      <div className="max-w-6xl mx-auto px-6 py-6">
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto" />
            <p className="mt-3 text-sm text-gray-500">Ricerca in corso...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-16">
            <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Nessun preventivo trovato</p>
            <p className="text-sm text-gray-400 mt-1">Prova a modificare i criteri di ricerca</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <th className="px-5 py-3 text-left">N° Preventivo</th>
                  <th className="px-3 py-3 text-left">Cliente</th>
                  <th className="px-3 py-3 text-center">Linea</th>
                  <th className="px-3 py-3 text-center">Stato</th>
                  <th className="px-3 py-3 text-right">Totale</th>
                  <th className="px-3 py-3 text-right">Data</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {results.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/preventivo/${r.id}`)}
                    className="hover:bg-indigo-50/30 cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-400" />
                        <span className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                          {r.numero_preventivo}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {r.cliente_ragione_sociale ? (
                        <div className="flex items-center gap-1.5">
                          <Building className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-gray-800">{r.cliente_ragione_sociale}</span>
                          <span className="text-gray-400 text-xs">({r.cliente_codice})</span>
                        </div>
                      ) : r.customer_name ? (
                        <span className="text-gray-600">{r.customer_name}</span>
                      ) : (
                        <span className="text-gray-300 italic">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {r.categoria && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${catBadge(r.categoria)}`}>
                          {r.categoria}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${statusBadge(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-medium text-gray-900">
                      {fmt(r.total_price || 0)}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-500">
                      <div className="flex items-center gap-1 justify-end">
                        <Calendar className="w-3.5 h-3.5" />
                        {r.created_at ? new Date(r.created_at).toLocaleDateString('it-IT') : '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-500 transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
