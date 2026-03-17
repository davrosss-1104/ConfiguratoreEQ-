import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Package, AlertTriangle, TrendingUp, TrendingDown, RefreshCw,
  Search, Plus, ChevronDown, ChevronRight, X, Loader2,
  ArrowUpCircle, ArrowDownCircle, History, BarChart2,
  Warehouse, ShoppingCart, CheckCircle,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface ArticoloGiacenza {
  id: number;
  codice: string;
  descrizione: string;
  unita_misura: string;
  giacenza: number;
  scorta_minima: number;
  categoria: string | null;
  fornitore: string | null;
  sotto_scorta: boolean;
  n_movimenti: number;
}

interface Movimento {
  id: number;
  tipo: string;
  segno: number;
  quantita: number;
  variazione: number;
  riferimento_tipo: string | null;
  riferimento_id: number | null;
  note: string | null;
  utente: string | null;
  data_movimento: string;
}

interface TipoMovimento {
  codice: string;
  label: string;
  segno: number;
}

interface Statistiche {
  n_articoli: number;
  n_sotto_scorta: number;
  n_con_giacenza: number;
  movimenti_30gg: number;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const fmtQty = (n: number) =>
  Number.isInteger(n) ? n.toString() : n.toFixed(2);

const fmtDate = (s: string) => {
  try { return new Date(s).toLocaleDateString('it-IT'); } catch { return s; }
};

const TIPO_COLORS: Record<string, string> = {
  inventario_iniziale: 'text-gray-500',
  carico_acquisto:     'text-emerald-600',
  carico_rettifica:    'text-teal-600',
  reso_cliente:        'text-cyan-600',
  scarico_commessa:    'text-red-500',
  scarico_rettifica:   'text-orange-500',
  reso_fornitore:      'text-pink-500',
};

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPALE
// ─────────────────────────────────────────────────────────────

export default function MagazzinoPage() {
  const qc = useQueryClient();

  const [tab, setTab]                   = useState<'giacenze' | 'movimenti' | 'sotto_scorta'>('giacenze');
  const [search, setSearch]             = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [selectedArticolo, setSelectedArticolo] = useState<ArticoloGiacenza | null>(null);
  const [showMovimentoForm, setShowMovimentoForm] = useState(false);
  const [page, setPage]                 = useState(1);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [searchDebounced, tab]);

  // ── Statistiche ──────────────────────────────────────────
  const { data: stats } = useQuery<Statistiche>({
    queryKey: ['magazzino-stats'],
    queryFn:  () => fetch(`${API_BASE}/magazzino/statistiche`).then(r => r.json()),
    refetchInterval: 30000,
  });

  // ── Giacenze ─────────────────────────────────────────────
  const { data: giacenzeData, isLoading: loadingGiacenze } = useQuery({
    queryKey: ['magazzino-giacenze', searchDebounced, tab === 'sotto_scorta', page],
    queryFn:  () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        ...(searchDebounced && { q: searchDebounced }),
        ...(tab === 'sotto_scorta' && { solo_sotto_scorta: 'true' }),
      });
      return fetch(`${API_BASE}/magazzino/giacenze?${params}`).then(r => r.json());
    },
    enabled: tab !== 'movimenti',
  });

  // ── Movimenti globali ─────────────────────────────────────
  const { data: movimentiData, isLoading: loadingMovimenti } = useQuery({
    queryKey: ['magazzino-movimenti', searchDebounced, page],
    queryFn:  () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        ...(searchDebounced && { codice: searchDebounced }),
      });
      return fetch(`${API_BASE}/magazzino/movimenti?${params}`).then(r => r.json());
    },
    enabled: tab === 'movimenti',
  });

  // ── Movimenti articolo selezionato ────────────────────────
  const { data: movimentiArticolo } = useQuery({
    queryKey: ['mag-mov-articolo', selectedArticolo?.id],
    queryFn:  () =>
      fetch(`${API_BASE}/magazzino/giacenze/${selectedArticolo!.id}/movimenti?limit=30`)
        .then(r => r.json()),
    enabled: !!selectedArticolo,
  });

  // ── Tipi movimento ────────────────────────────────────────
  const { data: tipiMovimento = [] } = useQuery<TipoMovimento[]>({
    queryKey: ['mag-tipi'],
    queryFn:  () => fetch(`${API_BASE}/magazzino/tipi-movimento`).then(r => r.json()),
  });

  const articoli: ArticoloGiacenza[] = giacenzeData?.articoli ?? [];
  const totaleArticoli: number       = giacenzeData?.totale ?? 0;
  const movimenti: Movimento[]       = movimentiData?.movimenti ?? [];
  const totaleMovimenti: number      = movimentiData?.totale ?? 0;
  const totalePagine = Math.ceil(
    (tab === 'movimenti' ? totaleMovimenti : totaleArticoli) / 50
  );

  const handleRowClick = (art: ArticoloGiacenza) => {
    setSelectedArticolo(p => p?.id === art.id ? null : art);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* ── Header ────────────────────────────────────────── */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Warehouse className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Magazzino</h1>
        </div>
        <button
          onClick={() => setShowMovimentoForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Nuovo movimento
        </button>
      </div>

      {/* ── KPI strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 shrink-0">
        <KpiCard
          icon={<Package className="h-5 w-5 text-blue-500" />}
          label="Articoli attivi"
          value={stats?.n_articoli ?? '—'}
          bg="bg-blue-50"
        />
        <KpiCard
          icon={<CheckCircle className="h-5 w-5 text-emerald-500" />}
          label="Con giacenza"
          value={stats?.n_con_giacenza ?? '—'}
          bg="bg-emerald-50"
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
          label="Sotto scorta"
          value={stats?.n_sotto_scorta ?? '—'}
          bg="bg-amber-50"
          alert={!!stats?.n_sotto_scorta}
          onClick={() => setTab('sotto_scorta')}
        />
        <KpiCard
          icon={<History className="h-5 w-5 text-purple-500" />}
          label="Movimenti (30gg)"
          value={stats?.movimenti_30gg ?? '—'}
          bg="bg-purple-50"
        />
      </div>

      {/* ── Tab bar + search ──────────────────────────────── */}
      <div className="bg-white border-b px-6 flex items-center justify-between shrink-0">
        <div className="flex gap-1">
          {([
            ['giacenze',    'Giacenze'],
            ['movimenti',   'Movimenti'],
            ['sotto_scorta','Sotto scorta'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setTab(id); setPage(1); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
              {id === 'sotto_scorta' && !!stats?.n_sotto_scorta && (
                <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {stats.n_sotto_scorta}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="relative py-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca codice o descrizione..."
            className="pl-9 pr-8 py-1.5 text-sm border rounded-lg w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Tabella principale */}
        <div className={`flex-1 overflow-auto ${selectedArticolo ? 'w-0' : ''}`}>

          {/* ── GIACENZE / SOTTO SCORTA ── */}
          {(tab === 'giacenze' || tab === 'sotto_scorta') && (
            <table className="w-full text-sm">
              <thead className="bg-white border-b sticky top-0 z-10">
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 text-left">Codice</th>
                  <th className="px-4 py-3 text-left">Descrizione</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-right">Giacenza</th>
                  <th className="px-4 py-3 text-right">Scorta min.</th>
                  <th className="px-4 py-3 text-left">UM</th>
                  <th className="px-4 py-3 text-left">Fornitore</th>
                  <th className="px-4 py-3 text-center">Stato</th>
                  <th className="px-4 py-3 text-right">Mov.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loadingGiacenze ? (
                  <tr><td colSpan={9} className="py-12 text-center text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </td></tr>
                ) : articoli.length === 0 ? (
                  <tr><td colSpan={9} className="py-12 text-center text-gray-400">
                    {tab === 'sotto_scorta' ? 'Nessun articolo sotto scorta 🎉' : 'Nessun articolo trovato'}
                  </td></tr>
                ) : articoli.map(art => (
                  <tr
                    key={art.id}
                    onClick={() => handleRowClick(art)}
                    className={`cursor-pointer transition-colors ${
                      selectedArticolo?.id === art.id
                        ? 'bg-blue-50 border-l-4 border-l-blue-500'
                        : art.sotto_scorta
                          ? 'bg-amber-50/60 hover:bg-amber-50 border-l-4 border-l-amber-400'
                          : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700 font-medium">{art.codice}</td>
                    <td className="px-4 py-2.5 text-gray-800 max-w-[240px] truncate">{art.descrizione}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{art.categoria || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                      {fmtQty(art.giacenza)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{fmtQty(art.scorta_minima)}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{art.unita_misura}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs truncate max-w-[120px]">{art.fornitore || '—'}</td>
                    <td className="px-4 py-2.5 text-center">
                      {art.sotto_scorta ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          <AlertTriangle className="h-3 w-3" />
                          Sotto scorta
                        </span>
                      ) : art.giacenza > 0 ? (
                        <span className="text-xs text-emerald-600">✓ Disponibile</span>
                      ) : (
                        <span className="text-xs text-gray-400">Esaurito</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{art.n_movimenti}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* ── MOVIMENTI GLOBALI ── */}
          {tab === 'movimenti' && (
            <table className="w-full text-sm">
              <thead className="bg-white border-b sticky top-0 z-10">
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Codice</th>
                  <th className="px-4 py-3 text-left">Descrizione</th>
                  <th className="px-4 py-3 text-right">Quantità</th>
                  <th className="px-4 py-3 text-left">Riferimento</th>
                  <th className="px-4 py-3 text-left">Note</th>
                  <th className="px-4 py-3 text-left">Utente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loadingMovimenti ? (
                  <tr><td colSpan={8} className="py-12 text-center">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" />
                  </td></tr>
                ) : movimenti.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-gray-400">Nessun movimento</td></tr>
                ) : movimenti.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtDate(m.data_movimento)}</td>
                    <td className="px-4 py-2.5">
                      <MovimentoBadge tipo={m.tipo} segno={m.segno} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{(m as any).codice_articolo}</td>
                    <td className="px-4 py-2.5 text-gray-700 truncate max-w-[200px]">{(m as any).descrizione_articolo || '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-semibold ${m.segno > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {m.segno > 0 ? '+' : '-'}{fmtQty(m.quantita)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                      {m.riferimento_tipo && m.riferimento_id
                        ? `${m.riferimento_tipo} #${m.riferimento_id}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs truncate max-w-[160px]">{m.note || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{m.utente || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Paginazione */}
          {totalePagine > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-white">
              <span className="text-xs text-gray-500">
                Pagina {page} di {totalePagine} &middot;{' '}
                {tab === 'movimenti' ? totaleMovimenti : totaleArticoli} risultati
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  ← Prec
                </button>
                <button
                  disabled={page >= totalePagine}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-40"
                >
                  Succ →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Pannello dettaglio articolo ─────────────────── */}
        {selectedArticolo && (
          <div className="w-80 border-l bg-white overflow-y-auto flex-shrink-0">
            <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between">
              <span className="font-semibold text-gray-800 text-sm truncate">{selectedArticolo.codice}</span>
              <button onClick={() => setSelectedArticolo(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Giacenza */}
              <div className={`rounded-xl p-4 ${selectedArticolo.sotto_scorta ? 'bg-amber-50 border border-amber-200' : 'bg-emerald-50 border border-emerald-100'}`}>
                <p className="text-xs text-gray-500 mb-1">Giacenza attuale</p>
                <p className={`text-3xl font-bold ${selectedArticolo.sotto_scorta ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {fmtQty(selectedArticolo.giacenza)}
                  <span className="text-sm font-normal ml-1 text-gray-500">{selectedArticolo.unita_misura}</span>
                </p>
                {selectedArticolo.scorta_minima > 0 && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Scorta minima: {fmtQty(selectedArticolo.scorta_minima)}</span>
                      {selectedArticolo.sotto_scorta && (
                        <span className="text-amber-600 font-medium">
                          Mancano {fmtQty(selectedArticolo.scorta_minima - selectedArticolo.giacenza)}
                        </span>
                      )}
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${selectedArticolo.sotto_scorta ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${Math.min(100, (selectedArticolo.giacenza / selectedArticolo.scorta_minima) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="space-y-1.5 text-sm">
                <p className="text-gray-700">{selectedArticolo.descrizione}</p>
                {selectedArticolo.categoria && <p className="text-xs text-gray-400">{selectedArticolo.categoria}</p>}
                {selectedArticolo.fornitore && (
                  <p className="text-xs text-gray-500">Fornitore: {selectedArticolo.fornitore}</p>
                )}
              </div>

              {/* Azione rapida */}
              <button
                onClick={() => setShowMovimentoForm(true)}
                className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 text-sm font-medium"
              >
                <Plus className="h-4 w-4" />
                Registra movimento
              </button>

              {/* Ultimi movimenti */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Ultimi movimenti</p>
                {!movimentiArticolo ? (
                  <div className="text-center py-4"><Loader2 className="h-4 w-4 animate-spin mx-auto text-gray-300" /></div>
                ) : movimentiArticolo.movimenti?.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">Nessun movimento registrato</p>
                ) : (
                  <div className="space-y-2">
                    {movimentiArticolo.movimenti?.map((m: Movimento) => (
                      <div key={m.id} className="flex items-start gap-2 text-xs">
                        <span className={`mt-0.5 shrink-0 ${m.segno > 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                          {m.segno > 0
                            ? <ArrowUpCircle className="h-3.5 w-3.5" />
                            : <ArrowDownCircle className="h-3.5 w-3.5" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between">
                            <span className="text-gray-600 truncate">{m.note || m.tipo}</span>
                            <span className={`font-semibold shrink-0 ml-1 ${m.segno > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {m.segno > 0 ? '+' : '-'}{fmtQty(m.quantita)}
                            </span>
                          </div>
                          <span className="text-gray-400">{fmtDate(m.data_movimento)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modale nuovo movimento ─────────────────────────── */}
      {showMovimentoForm && (
        <MovimentoModal
          tipi={tipiMovimento}
          articoloPreselezionato={selectedArticolo}
          onClose={() => setShowMovimentoForm(false)}
          onSuccess={() => {
            setShowMovimentoForm(false);
            qc.invalidateQueries({ queryKey: ['magazzino-giacenze'] });
            qc.invalidateQueries({ queryKey: ['magazzino-movimenti'] });
            qc.invalidateQueries({ queryKey: ['magazzino-stats'] });
            if (selectedArticolo) {
              qc.invalidateQueries({ queryKey: ['mag-mov-articolo', selectedArticolo.id] });
            }
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, bg, alert, onClick }: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  bg: string;
  alert?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`${bg} rounded-xl p-4 flex items-center gap-3 ${onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''} ${alert ? 'ring-2 ring-amber-300' : ''}`}
    >
      <div className="shrink-0">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MOVIMENTO BADGE
// ─────────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, string> = {
  inventario_iniziale: 'Inventario iniziale',
  carico_acquisto:     'Carico acquisto',
  carico_rettifica:    'Rettifica entrata',
  reso_cliente:        'Reso cliente',
  scarico_commessa:    'Scarico commessa',
  scarico_rettifica:   'Rettifica uscita',
  reso_fornitore:      'Reso fornitore',
};

function MovimentoBadge({ tipo, segno }: { tipo: string; segno: number }) {
  const color = TIPO_COLORS[tipo] ?? 'text-gray-500';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      {segno > 0
        ? <TrendingUp className="h-3.5 w-3.5" />
        : <TrendingDown className="h-3.5 w-3.5" />}
      {TIPO_LABELS[tipo] ?? tipo}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// MODALE NUOVO MOVIMENTO
// ─────────────────────────────────────────────────────────────

function MovimentoModal({ tipi, articoloPreselezionato, onClose, onSuccess }: {
  tipi: TipoMovimento[];
  articoloPreselezionato: ArticoloGiacenza | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tipo, setTipo]             = useState('carico_rettifica');
  const [articoloId, setArticoloId] = useState<number | ''>(articoloPreselezionato?.id ?? '');
  const [quantita, setQuantita]     = useState('');
  const [note, setNote]             = useState('');
  const [cercaArt, setCercaArt]     = useState(articoloPreselezionato?.codice ?? '');
  const [risultati, setRisultati]   = useState<ArticoloGiacenza[]>([]);
  const [cercando, setCercando]     = useState(false);
  const [saving, setSaving]         = useState(false);

  const segnoCorrente = tipi.find(t => t.codice === tipo)?.segno ?? 1;

  const cercaArticoli = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setRisultati([]); return; }
    setCercando(true);
    try {
      const r = await fetch(`${API_BASE}/magazzino/giacenze?q=${encodeURIComponent(q)}&limit=8`);
      const d = await r.json();
      setRisultati(d.articoli ?? []);
    } finally {
      setCercando(false);
    }
  }, []);

  useEffect(() => {
    if (articoloPreselezionato) return;
    const t = setTimeout(() => cercaArticoli(cercaArt), 300);
    return () => clearTimeout(t);
  }, [cercaArt, articoloPreselezionato]);

  const selezionaArticolo = (art: ArticoloGiacenza) => {
    setArticoloId(art.id);
    setCercaArt(art.codice);
    setRisultati([]);
  };

  const salva = async () => {
    if (!articoloId) { toast.error('Seleziona un articolo'); return; }
    if (!quantita || Number(quantita) <= 0) { toast.error('Quantità deve essere > 0'); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/magazzino/movimenti`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          articolo_id: articoloId,
          quantita: Number(quantita),
          note: note || undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.detail || 'Errore'); return; }
      toast.success('Movimento registrato');
      onSuccess();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Nuovo movimento magazzino</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo movimento</label>
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              {tipi.map(t => (
                <option key={t.codice} value={t.codice}>{t.label}</option>
              ))}
            </select>
            <p className={`text-xs mt-1 font-medium ${segnoCorrente > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {segnoCorrente > 0 ? '↑ Incrementa la giacenza' : '↓ Riduce la giacenza'}
            </p>
          </div>

          {/* Articolo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Articolo</label>
            {articoloPreselezionato ? (
              <div className="border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {articoloPreselezionato.codice} — {articoloPreselezionato.descrizione}
              </div>
            ) : (
              <div className="relative">
                <input
                  value={cercaArt}
                  onChange={e => { setCercaArt(e.target.value); setArticoloId(''); }}
                  placeholder="Cerca per codice o descrizione..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
                {cercando && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
                )}
                {risultati.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {risultati.map(art => (
                      <button
                        key={art.id}
                        onClick={() => selezionaArticolo(art)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex justify-between"
                      >
                        <span className="font-mono text-gray-700">{art.codice}</span>
                        <span className="text-gray-500 truncate ml-2">{art.descrizione}</span>
                        <span className="text-gray-400 ml-2 shrink-0">{fmtQty(art.giacenza)} {art.unita_misura}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quantità */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quantità</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={quantita}
              onChange={e => setQuantita(e.target.value)}
              placeholder="0"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Motivo del movimento..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
          >
            Annulla
          </button>
          <button
            onClick={salva}
            disabled={saving || !articoloId || !quantita}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Registra
          </button>
        </div>
      </div>
    </div>
  );
}
