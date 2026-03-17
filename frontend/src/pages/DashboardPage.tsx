import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import {
  Factory, ShoppingCart, Receipt, Ticket,
  AlertTriangle, AlertCircle, RefreshCw, ChevronRight,
  TrendingUp, TrendingDown, Minus, Clock, CheckCircle,
  Warehouse,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Tipi ─────────────────────────────────────────────────────────────────────

interface KpiProduzione {
  commesse_in_produzione: number;
  commesse_in_ritardo: number;
  fasi_in_corso: number;
  fasi_completate_oggi: number;
  efficienza_percent: number | null;
  wip_da_prelevare: number;
  wip_parziale: number;
  trend_completate: { mese: string; n: number }[];
}

interface KpiAcquisti {
  oda_aperti: number;
  oda_in_ritardo: number;
  oda_in_scadenza: number;
  valore_aperto: number;
  per_stato: { stato: string; n: number; valore: number }[];
  top_fornitori: { fornitore: string; n_oda: number; valore: number }[];
  trend: { mese: string; n: number; valore: number }[];
}

interface KpiFatturazione {
  fatture_emesse_mese: number;
  fatturato_mese: number;
  fatturato_anno: number;
  fatture_scadute: number;
  passive_da_approvare: number;
  trend_mensile: { mese: string; n: number; valore: number }[];
}

interface KpiTempi {
  ticket_aperti: number;
  ticket_in_ritardo: number;
  ticket_oggi: number;
  ore_settimana: number;
  per_stato: { stato: string; n: number }[];
  top_operatori: { operatore: string; ore: number }[];
  trend: { mese: string; n: number }[];
}

interface DashboardData {
  produzione: KpiProduzione;
  acquisti: KpiAcquisti;
  fatturazione: KpiFatturazione;
  tempi: KpiTempi;
  aggiornato_il: string;
}

interface Alert {
  tipo: 'warning' | 'danger';
  modulo: string;
  titolo: string;
  dettaglio: string;
  azione: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtEur = (n: number) =>
  n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const fmtMese = (s: string) => {
  try {
    const [y, m] = s.split('-');
    return new Date(Number(y), Number(m) - 1).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
  } catch { return s; }
};

const COLORI = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4'];

// ── Componenti UI ─────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, trend, color = 'blue', onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: 'up' | 'down' | 'neutral';
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple';
  onClick?: () => void;
}) {
  const colors = {
    blue:   'bg-blue-50 text-blue-700',
    green:  'bg-green-50 text-green-700',
    amber:  'bg-amber-50 text-amber-700',
    red:    'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
  };
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-gray-400';

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-gray-200 p-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-bold mt-1 ${colors[color].split(' ')[1]}`}>{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        {trend && (
          <TrendIcon className={`h-4 w-4 mt-1 ${trendColor}`} />
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  icon, title, color = 'blue', onNavigate,
}: {
  icon: React.ReactNode;
  title: string;
  color?: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className={`flex items-center gap-2 text-${color}-700`}>
        {icon}
        <h2 className="text-base font-bold text-gray-800">{title}</h2>
      </div>
      {onNavigate && (
        <button
          onClick={onNavigate}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
        >
          Apri <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function AlertBanner({ alerts, onNavigate }: { alerts: Alert[]; onNavigate: (path: string) => void }) {
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-2 mb-6">
      {alerts.map((a, i) => (
        <div
          key={i}
          onClick={() => onNavigate(a.azione)}
          className={`flex items-start gap-3 px-4 py-3 rounded-xl cursor-pointer border transition-colors
            ${a.tipo === 'danger'
              ? 'bg-red-50 border-red-200 hover:bg-red-100'
              : 'bg-amber-50 border-amber-200 hover:bg-amber-100'
            }`}
        >
          {a.tipo === 'danger'
            ? <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            : <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          }
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-semibold ${a.tipo === 'danger' ? 'text-red-800' : 'text-amber-800'}`}>
              {a.titolo}
            </p>
            <p className={`text-xs ${a.tipo === 'danger' ? 'text-red-600' : 'text-amber-600'}`}>
              {a.dettaglio}
            </p>
          </div>
          <ChevronRight className={`h-4 w-4 shrink-0 ${a.tipo === 'danger' ? 'text-red-400' : 'text-amber-400'}`} />
        </div>
      ))}
    </div>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded-lg ${className}`} />;
}

// ── Sezioni KPI ───────────────────────────────────────────────────────────────

function SezioneProduzione({ data, navigate }: { data: KpiProduzione; navigate: (p: string) => void }) {
  const trendData = data.trend_completate.map(t => ({ mese: fmtMese(t.mese), n: t.n }));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <SectionHeader
        icon={<Factory className="h-5 w-5" />}
        title="Produzione"
        color="blue"
        onNavigate={() => navigate('/produzione')}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="In produzione"
          value={data.commesse_in_produzione}
          color="blue"
          onClick={() => navigate('/produzione')}
        />
        <KpiCard
          label="In ritardo"
          value={data.commesse_in_ritardo}
          color={data.commesse_in_ritardo > 0 ? 'red' : 'green'}
          onClick={() => navigate('/produzione')}
        />
        <KpiCard
          label="Fasi in corso"
          value={data.fasi_in_corso}
          sub={`${data.fasi_completate_oggi} completate oggi`}
          color="purple"
        />
        <KpiCard
          label="Efficienza"
          value={data.efficienza_percent !== null ? `${data.efficienza_percent}%` : '—'}
          sub="ore stimate vs reali"
          color={
            data.efficienza_percent === null ? 'blue' :
            data.efficienza_percent >= 90 ? 'green' :
            data.efficienza_percent >= 70 ? 'amber' : 'red'
          }
        />
      </div>

      {/* WIP */}
      {(data.wip_da_prelevare > 0 || data.wip_parziale > 0) && (
        <div className="flex gap-3 mb-5">
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm">
            <Warehouse className="h-4 w-4 text-amber-500" />
            <span className="text-amber-800 font-medium">{data.wip_da_prelevare} da prelevare</span>
          </div>
          {data.wip_parziale > 0 && (
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2 text-sm">
              <Clock className="h-4 w-4 text-orange-500" />
              <span className="text-orange-800 font-medium">{data.wip_parziale} parziali</span>
            </div>
          )}
        </div>
      )}

      {trendData.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-2 font-medium">Commesse completate (ultimi 8 mesi)</p>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={trendData} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="mese" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                formatter={(v: number) => [v, 'commesse']}
              />
              <Bar dataKey="n" fill="#3B82F6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function SezioneAcquisti({ data, navigate }: { data: KpiAcquisti; navigate: (p: string) => void }) {
  const trendData = data.trend.map(t => ({ mese: fmtMese(t.mese), valore: t.valore, n: t.n }));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <SectionHeader
        icon={<ShoppingCart className="h-5 w-5" />}
        title="Acquisti"
        color="green"
        onNavigate={() => navigate('/acquisti/oda')}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="ODA aperti"
          value={data.oda_aperti}
          color="blue"
          onClick={() => navigate('/acquisti/oda')}
        />
        <KpiCard
          label="In ritardo"
          value={data.oda_in_ritardo}
          color={data.oda_in_ritardo > 0 ? 'red' : 'green'}
          onClick={() => navigate('/acquisti/oda')}
        />
        <KpiCard
          label="In scadenza 7gg"
          value={data.oda_in_scadenza}
          color={data.oda_in_scadenza > 0 ? 'amber' : 'green'}
          onClick={() => navigate('/acquisti/oda')}
        />
        <KpiCard
          label="Valore aperto"
          value={fmtEur(data.valore_aperto)}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Top fornitori */}
        {data.top_fornitori.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium">Top fornitori (90 gg)</p>
            <div className="space-y-1.5">
              {data.top_fornitori.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-3">{i + 1}</span>
                  <span className="text-xs text-gray-700 flex-1 truncate">{f.fornitore}</span>
                  <span className="text-xs font-medium text-gray-600">{fmtEur(f.valore)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trend valore */}
        {trendData.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium">Valore ODA (ultimi 8 mesi)</p>
            <ResponsiveContainer width="100%" height={90}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="mese" tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0' }}
                  formatter={(v: number) => [fmtEur(v), 'valore']}
                />
                <Line type="monotone" dataKey="valore" stroke="#10B981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

function SezioneFatturazione({ data, navigate }: { data: KpiFatturazione; navigate: (p: string) => void }) {
  const trendData = data.trend_mensile.map(t => ({ mese: fmtMese(t.mese), valore: t.valore }));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <SectionHeader
        icon={<Receipt className="h-5 w-5" />}
        title="Fatturazione"
        color="purple"
        onNavigate={() => navigate('/fatturazione')}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Fatturato mese"
          value={fmtEur(data.fatturato_mese)}
          sub={`${data.fatture_emesse_mese} fatture`}
          color="blue"
        />
        <KpiCard
          label="Fatturato anno"
          value={fmtEur(data.fatturato_anno)}
          color="green"
        />
        <KpiCard
          label="Fatture scadute"
          value={data.fatture_scadute}
          color={data.fatture_scadute > 0 ? 'red' : 'green'}
          onClick={() => navigate('/fatturazione')}
        />
        <KpiCard
          label="Passive in attesa"
          value={data.passive_da_approvare}
          color={data.passive_da_approvare > 0 ? 'amber' : 'green'}
          onClick={() => navigate('/fatturazione/passive')}
        />
      </div>

      {trendData.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-2 font-medium">Fatturato mensile (anno corrente)</p>
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={trendData} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="mese" tick={{ fontSize: 10, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                formatter={(v: number) => [fmtEur(v), 'fatturato']}
              />
              <Bar dataKey="valore" radius={[3, 3, 0, 0]}>
                {trendData.map((_, i) => (
                  <Cell key={i} fill={COLORI[i % COLORI.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function SezioneTempi({ data, navigate }: { data: KpiTempi; navigate: (p: string) => void }) {
  const trendData = data.trend.map(t => ({ mese: fmtMese(t.mese), n: t.n }));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <SectionHeader
        icon={<Ticket className="h-5 w-5" />}
        title="Assistenza & Tempi"
        color="amber"
        onNavigate={() => navigate('/tickets')}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Ticket aperti"
          value={data.ticket_aperti}
          color="blue"
          onClick={() => navigate('/tickets')}
        />
        <KpiCard
          label="In ritardo / urgenti"
          value={data.ticket_in_ritardo}
          color={data.ticket_in_ritardo > 0 ? 'red' : 'green'}
          onClick={() => navigate('/tickets')}
        />
        <KpiCard
          label="Aperti oggi"
          value={data.ticket_oggi}
          color="amber"
        />
        <KpiCard
          label="Ore questa settimana"
          value={`${data.ore_settimana}h`}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Stato ticket */}
        {data.per_stato.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium">Distribuzione stati</p>
            <div className="space-y-1.5">
              {data.per_stato.slice(0, 5).map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORI[i] }} />
                  <span className="text-xs text-gray-600 flex-1 capitalize">{s.stato.replace(/_/g, ' ')}</span>
                  <span className="text-xs font-semibold text-gray-700">{s.n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top operatori */}
        {data.top_operatori.length > 0 && (
          <div>
            <p className="text-xs text-gray-400 mb-2 font-medium">Top operatori (questa settimana)</p>
            <div className="space-y-1.5">
              {data.top_operatori.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-3">{i + 1}</span>
                  <span className="text-xs text-gray-700 flex-1 truncate">{o.operatore}</span>
                  <span className="text-xs font-medium text-gray-600">{o.ore}h</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {trendData.length > 0 && (
        <div className="mt-4">
          <p className="text-xs text-gray-400 mb-2 font-medium">Ticket aperti (ultimi 8 mesi)</p>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="mese" tick={{ fontSize: 9, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0' }}
                formatter={(v: number) => [v, 'ticket']}
              />
              <Line type="monotone" dataKey="n" stroke="#F59E0B" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Pagina principale ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const [data, setData]       = useState<DashboardData | null>(null);
  const [alerts, setAlerts]   = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  const carica = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [kpiRes, alertRes] = await Promise.all([
        fetch(`${API_BASE}/dashboard/kpi`, { headers }),
        fetch(`${API_BASE}/dashboard/alert`, { headers }),
      ]);
      if (!kpiRes.ok) throw new Error();
      const kpiData: DashboardData = await kpiRes.json();
      const alertData: Alert[] = alertRes.ok ? await alertRes.json() : [];
      setData(kpiData);
      setAlerts(alertData);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carica(); }, [carica]);

  // Auto-refresh ogni 5 minuti
  useEffect(() => {
    const id = setInterval(carica, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [carica]);

  const fmtOra = (iso: string) => {
    try { return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500">
              {data ? `Aggiornato alle ${fmtOra(data.aggiornato_il)}` : 'Caricamento in corso...'}
            </p>
          </div>
          <button
            onClick={carica}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Aggiorna
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-6">

        {/* Errore */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">Impossibile caricare i dati. Verifica la connessione al server.</p>
            <button onClick={carica} className="ml-auto text-sm text-red-600 font-medium hover:underline">
              Riprova
            </button>
          </div>
        )}

        {/* Alert */}
        {!loading && alerts.length > 0 && (
          <AlertBanner alerts={alerts} onNavigate={navigate} />
        )}

        {/* Skeleton loading */}
        {loading && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5">
                <Skeleton className="h-5 w-32 mb-4" />
                <div className="grid grid-cols-4 gap-3 mb-5">
                  {[...Array(4)].map((_, j) => <Skeleton key={j} className="h-16" />)}
                </div>
                <Skeleton className="h-24" />
              </div>
            ))}
          </div>
        )}

        {/* Contenuto */}
        {!loading && data && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <SezioneProduzione data={data.produzione} navigate={navigate} />
            <SezioneAcquisti   data={data.acquisti}   navigate={navigate} />
            <SezioneFatturazione data={data.fatturazione} navigate={navigate} />
            <SezioneTempi      data={data.tempi}      navigate={navigate} />
          </div>
        )}

        {/* Nessun dato + no errore */}
        {!loading && !data && !error && (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 h-64 flex flex-col items-center justify-center text-gray-400">
            <CheckCircle className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">Nessun dato disponibile</p>
          </div>
        )}
      </div>
    </div>
  );
}
