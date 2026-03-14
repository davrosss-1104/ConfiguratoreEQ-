import { useState, useEffect, useCallback } from 'react';
import {
  Ticket, TrendingUp, Clock, AlertCircle, CheckCircle2,
  Wrench, Building2, RefreshCw, Loader2, User,
} from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ==========================================
// TIPI
// ==========================================
interface DashboardData {
  totale:               number;
  aperti:               number;
  in_lavorazione:       number;
  risolti_oggi:         number;
  scaduti:              number;
  tempo_medio_ore:      number | null;
  per_stato:            Record<string, number>;
  per_priorita:         Record<string, number>;
  per_tipo:             Record<string, number>;
  per_categoria:        { nome: string; colore: string; count: number }[];
  per_tecnico:          { nome: string; count: number; risolti: number }[];
  ultimi_aperti:        { id: number; numero_ticket: string; titolo: string; stato: string; priorita: string; created_at: string }[];
  ultimi_scaduti:       { id: number; numero_ticket: string; titolo: string; stato: string; scadenza: string }[];
}

// ==========================================
// CARD STAT
// ==========================================
function StatCard({
  label, valore, icona, colore, sottoTitolo,
}: {
  label: string;
  valore: number | string;
  icona: React.ReactNode;
  colore: string;
  sottoTitolo?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className={`text-3xl font-bold mt-1 ${colore}`}>{valore}</p>
          {sottoTitolo && <p className="text-xs text-gray-400 mt-1">{sottoTitolo}</p>}
        </div>
        <div className={`p-3 rounded-xl ${colore.replace('text-', 'bg-').replace('600', '100').replace('700', '100')}`}>
          {icona}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// BARRA PROGRESSO SEMPLICE
// ==========================================
function BarraProgresso({
  label, valore, totale, colore, extra,
}: {
  label: string;
  valore: number;
  totale: number;
  colore: string;
  extra?: string;
}) {
  const pct = totale > 0 ? Math.round((valore / totale) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-700 font-medium">{label}</span>
        <span className="text-gray-500">{valore} {extra && <span className="text-xs text-gray-400">{extra}</span>}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colore}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ==========================================
// PAGINA DASHBOARD
// ==========================================
export default function TicketDashboardPage() {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<'7' | '30' | '90'>('30');

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/tickets/dashboard?giorni=${periodo}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error('Errore caricamento dashboard');
    } finally {
      setLoading(false);
    }
  }, [periodo]);

  useEffect(() => { carica(); }, [carica]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!data) return null;

  const totaleNonChiusi = data.per_stato
    ? Object.entries(data.per_stato)
        .filter(([s]) => !['chiuso', 'annullato'].includes(s))
        .reduce((acc, [, n]) => acc + n, 0)
    : 0;

  const STATO_COLORI: Record<string, string> = {
    aperto: 'bg-gray-400', ricevuto: 'bg-gray-400',
    assegnato: 'bg-indigo-500', in_lavorazione: 'bg-amber-500',
    in_attesa_ricambi: 'bg-purple-500', sospeso: 'bg-gray-300',
    risolto: 'bg-emerald-500', chiuso: 'bg-gray-200', annullato: 'bg-red-400',
  };

  const PRIORITA_COLORI: Record<string, string> = {
    urgente: 'bg-red-500', alta: 'bg-orange-400', media: 'bg-yellow-400', bassa: 'bg-green-400',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Dashboard Ticketing</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Periodo */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              {(['7', '30', '90'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriodo(p)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    periodo === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {p === '7' ? '7 giorni' : p === '30' ? '30 giorni' : '90 giorni'}
                </button>
              ))}
            </div>
            <button onClick={carica} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* KPI principali */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            label="Totale ticket"
            valore={data.totale}
            icona={<Ticket className="h-6 w-6 text-blue-600" />}
            colore="text-blue-600"
          />
          <StatCard
            label="Aperti / In attesa"
            valore={data.aperti}
            icona={<AlertCircle className="h-6 w-6 text-gray-600" />}
            colore="text-gray-700"
          />
          <StatCard
            label="In lavorazione"
            valore={data.in_lavorazione}
            icona={<Wrench className="h-6 w-6 text-amber-600" />}
            colore="text-amber-600"
          />
          <StatCard
            label="Risolti oggi"
            valore={data.risolti_oggi}
            icona={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
            colore="text-emerald-600"
          />
          <StatCard
            label="Scaduti"
            valore={data.scaduti}
            icona={<Clock className="h-6 w-6 text-red-600" />}
            colore={data.scaduti > 0 ? 'text-red-600' : 'text-gray-400'}
            sottoTitolo={data.scaduti > 0 ? 'Richiedono attenzione' : undefined}
          />
        </div>

        {/* Tempo medio risoluzione */}
        {data.tempo_medio_ore !== null && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <Clock className="h-8 w-8 text-indigo-400" />
            <div>
              <p className="text-sm text-gray-500">Tempo medio risoluzione (ultimi {periodo} giorni)</p>
              <p className="text-2xl font-bold text-indigo-700">
                {data.tempo_medio_ore < 24
                  ? `${Math.round(data.tempo_medio_ore)}h`
                  : `${Math.round(data.tempo_medio_ore / 24)}gg`
                }
              </p>
            </div>
          </div>
        )}

        {/* Grid analisi */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Per stato */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Per stato</h3>
            <div className="space-y-3">
              {Object.entries(data.per_stato ?? {})
                .sort(([, a], [, b]) => b - a)
                .map(([stato, count]) => (
                  <BarraProgresso
                    key={stato}
                    label={stato.replace(/_/g, ' ')}
                    valore={count}
                    totale={data.totale}
                    colore={STATO_COLORI[stato] ?? 'bg-gray-400'}
                  />
                ))
              }
            </div>
          </div>

          {/* Per priorità */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Per priorità</h3>
            <div className="space-y-3">
              {(['urgente', 'alta', 'media', 'bassa'] as const).map(p => (
                <BarraProgresso
                  key={p}
                  label={p.charAt(0).toUpperCase() + p.slice(1)}
                  valore={data.per_priorita?.[p] ?? 0}
                  totale={data.totale}
                  colore={PRIORITA_COLORI[p]}
                />
              ))}
            </div>
          </div>

          {/* Per categoria */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Per categoria</h3>
            {(data.per_categoria ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">Nessun dato</p>
            ) : (
              <div className="space-y-3">
                {data.per_categoria.sort((a, b) => b.count - a.count).map(c => (
                  <BarraProgresso
                    key={c.nome}
                    label={c.nome}
                    valore={c.count}
                    totale={data.totale}
                    colore=""
                    extra=""
                  />
                ))}
              </div>
            )}
            {/* Visuale a pallini colorati */}
            <div className="flex flex-wrap gap-2 mt-4">
              {(data.per_categoria ?? []).map(c => (
                <span
                  key={c.nome}
                  className="inline-flex items-center gap-1 text-xs text-white px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: c.colore || '#6B7280' }}
                >
                  {c.nome} ({c.count})
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Tecnici + Ticket scaduti */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Per tecnico */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-gray-500" /> Carico tecnici
            </h3>
            {(data.per_tecnico ?? []).length === 0 ? (
              <p className="text-sm text-gray-400">Nessun ticket assegnato</p>
            ) : (
              <div className="space-y-3">
                {data.per_tecnico.sort((a, b) => b.count - a.count).map(t => (
                  <div key={t.nome} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                      {t.nome[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-gray-700 truncate">{t.nome}</span>
                        <span className="text-gray-500 shrink-0">
                          {t.count} aperti · <span className="text-emerald-600">{t.risolti} risolti</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{
                            width: `${Math.max(...(data.per_tecnico ?? []).map(x => x.count)) > 0
                              ? (t.count / Math.max(...(data.per_tecnico ?? []).map(x => x.count))) * 100
                              : 0}%`
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ticket scaduti */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-red-500" /> Ticket scaduti
            </h3>
            {(data.ultimi_scaduti ?? []).length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Nessun ticket scaduto</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.ultimi_scaduti.map(t => (
                  <div
                    key={t.id}
                    className="flex items-start gap-3 p-2 bg-red-50 rounded-lg border border-red-100 cursor-pointer hover:bg-red-100 transition-colors"
                    onClick={() => window.open(`/tickets/${t.id}`, '_blank')}
                  >
                    <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-gray-400">{t.numero_ticket}</p>
                      <p className="text-sm text-gray-700 truncate font-medium">{t.titolo}</p>
                      <p className="text-xs text-red-600">
                        Scaduto il {new Date(t.scadenza).toLocaleDateString('it-IT')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Ultimi ticket aperti */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Ultimi ticket aperti</h3>
          {(data.ultimi_aperti ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">Nessun ticket recente</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="pb-2 text-xs font-medium text-gray-500">Numero</th>
                    <th className="pb-2 text-xs font-medium text-gray-500">Titolo</th>
                    <th className="pb-2 text-xs font-medium text-gray-500">Stato</th>
                    <th className="pb-2 text-xs font-medium text-gray-500">Priorità</th>
                    <th className="pb-2 text-xs font-medium text-gray-500">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.ultimi_aperti.map(t => (
                    <tr
                      key={t.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => window.open(`/tickets/${t.id}`, '_blank')}
                    >
                      <td className="py-2 font-mono text-xs text-gray-400">{t.numero_ticket}</td>
                      <td className="py-2 text-gray-700 max-w-xs truncate">{t.titolo}</td>
                      <td className="py-2">
                        <span className="text-xs text-gray-500">{t.stato.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full text-white ${
                          { urgente: 'bg-red-500', alta: 'bg-orange-400', media: 'bg-yellow-400', bassa: 'bg-green-400' }[t.priorita] ?? 'bg-gray-400'
                        }`}>
                          {t.priorita}
                        </span>
                      </td>
                      <td className="py-2 text-xs text-gray-400">
                        {new Date(t.created_at).toLocaleDateString('it-IT')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
