import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Timer, Users, Building2, Ticket, Download,
  RefreshCw, Loader2, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '/api';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(minuti: number | null | undefined): string {
  if (minuti === null || minuti === undefined || minuti === 0) return '0 min';
  if (minuti < 60) return `${minuti} min`;
  const h = Math.floor(minuti / 60);
  const m = minuti % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function pct(num: number, den: number): string {
  if (!den) return '—';
  return `${Math.round((num / den) * 100)}%`;
}

// ── Filtri ────────────────────────────────────────────────────────────────────

interface Filtri {
  utente_id:  string;
  cliente_id: string;
  da:         string;
  a:          string;
}

// ── Componenti sub ────────────────────────────────────────────────────────────

function CardTotale({ label, valore, sub, color = 'text-gray-900' }: {
  label: string; valore: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{valore}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function BarraPercentuale({ valore, massimo, color }: { valore: number; massimo: number; color: string }) {
  const w = massimo > 0 ? Math.min(100, Math.round((valore / massimo) * 100)) : 0;
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}

// ── Pagina ────────────────────────────────────────────────────────────────────

export default function ReportTempiPage() {
  const navigate = useNavigate();
  const [dati,    setDati]    = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab,     setTab]     = useState<'tecnici' | 'clienti' | 'ticket'>('tecnici');

  // Filtri
  const oggi = new Date().toISOString().slice(0, 10);
  const primoMese = oggi.slice(0, 8) + '01';
  const [filtri, setFiltri] = useState<Filtri>({
    utente_id: '', cliente_id: '', da: primoMese, a: oggi,
  });

  // Liste per dropdown
  const [utenti,  setUtenti]  = useState<any[]>([]);
  const [clienti, setClienti] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/utenti`).then(r => r.ok ? r.json() : []),
      fetch(`${API_BASE}/clienti`).then(r => r.ok ? r.json() : []),
    ]).then(([u, c]) => {
      setUtenti(Array.isArray(u) ? u : []);
      setClienti(Array.isArray(c) ? c : []);
    });
  }, []);

  const carica = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtri.utente_id)  params.set('utente_id',  filtri.utente_id);
    if (filtri.cliente_id) params.set('cliente_id', filtri.cliente_id);
    if (filtri.da)         params.set('da',         filtri.da);
    if (filtri.a)          params.set('a',          filtri.a);
    try {
      const res = await fetch(`${API_BASE}/report/tempi?${params}`);
      if (!res.ok) throw new Error();
      setDati(await res.json());
    } catch { toast.error('Errore caricamento report'); }
    setLoading(false);
  }, [filtri]);

  useEffect(() => { carica(); }, [carica]);

  const esportaCSV = () => {
    if (!dati) return;
    const rows: string[][] = [];
    rows.push(['Tipo', 'Nome', 'Totale (min)', 'Fatturabili (min)', 'Interni (min)', 'Ticket', 'Sessioni']);
    dati.per_tecnico.forEach((r: any) => {
      rows.push(['Tecnico', r.nome_completo || r.username,
        r.totale_minuti, r.fatturabili_minuti, (r.totale_minuti || 0) - (r.fatturabili_minuti || 0),
        r.num_ticket, r.num_sessioni]);
    });
    rows.push([]);
    rows.push(['Tipo', 'Cliente', 'Totale (min)', 'Fatturabili (min)', 'Ticket', '', '']);
    dati.per_cliente.forEach((r: any) => {
      rows.push(['Cliente', r.ragione_sociale || '—',
        r.totale_minuti, r.fatturabili_minuti, r.num_ticket, '', '']);
    });
    const csv = rows.map(r => r.join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `report_tempi_${filtri.da}_${filtri.a}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const maxTecnico = Math.max(...(dati?.per_tecnico ?? []).map((r: any) => r.totale_minuti || 0), 1);
  const maxCliente = Math.max(...(dati?.per_cliente ?? []).map((r: any) => r.totale_minuti || 0), 1);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Timer className="h-6 w-6 text-blue-500" />
            <h1 className="text-xl font-bold text-gray-900">Report Tempi</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={carica} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button onClick={esportaCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-100">
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>

        {/* Filtri */}
        <div className="bg-white rounded-xl border p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Tecnico</label>
            <select value={filtri.utente_id}
              onChange={e => setFiltri(f => ({ ...f, utente_id: e.target.value }))}
              className="w-full border rounded-lg px-2 py-1.5 text-sm">
              <option value="">Tutti</option>
              {utenti.map((u: any) => (
                <option key={u.id} value={u.id}>{u.nome} {u.cognome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Cliente</label>
            <select value={filtri.cliente_id}
              onChange={e => setFiltri(f => ({ ...f, cliente_id: e.target.value }))}
              className="w-full border rounded-lg px-2 py-1.5 text-sm">
              <option value="">Tutti</option>
              {clienti.map((c: any) => (
                <option key={c.id} value={c.id}>{c.ragione_sociale}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Dal</label>
            <input type="date" value={filtri.da}
              onChange={e => setFiltri(f => ({ ...f, da: e.target.value }))}
              className="w-full border rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Al</label>
            <input type="date" value={filtri.a}
              onChange={e => setFiltri(f => ({ ...f, a: e.target.value }))}
              className="w-full border rounded-lg px-2 py-1.5 text-sm" />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : dati ? (
          <>
            {/* Card totali */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <CardTotale label="Tempo totale" valore={fmt(dati.totale_minuti)} color="text-blue-700" />
              <CardTotale label="Fatturabili"  valore={fmt(dati.fatturabili_minuti)}
                sub={pct(dati.fatturabili_minuti, dati.totale_minuti)} color="text-emerald-700" />
              <CardTotale label="Interni"      valore={fmt(dati.interni_minuti)}
                sub={pct(dati.interni_minuti, dati.totale_minuti)} color="text-gray-600" />
              <CardTotale label="Ticket tracciati" valore={String(dati.per_ticket?.length ?? 0)} />
            </div>

            {/* Tabs */}
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="flex border-b">
                {([
                  { id: 'tecnici',  label: 'Per tecnico', icon: <Users className="h-4 w-4" /> },
                  { id: 'clienti',  label: 'Per cliente', icon: <Building2 className="h-4 w-4" /> },
                  { id: 'ticket',   label: 'Per ticket',  icon: <Ticket className="h-4 w-4" /> },
                ] as const).map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                      tab === t.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              <div className="p-4">
                {/* PER TECNICO */}
                {tab === 'tecnici' && (
                  <div className="space-y-3">
                    {dati.per_tecnico.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Nessun dato nel periodo</p>
                    ) : dati.per_tecnico.map((r: any) => (
                      <div key={r.id} className="p-3 rounded-lg border bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">
                              {r.nome_completo?.trim() || r.username}
                            </p>
                            <p className="text-xs text-gray-400">{r.num_sessioni} sessioni · {r.num_ticket} ticket</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-gray-900">{fmt(r.totale_minuti)}</p>
                            <p className="text-xs text-emerald-600">{fmt(r.fatturabili_minuti)} fatt.</p>
                          </div>
                        </div>
                        <BarraPercentuale valore={r.totale_minuti || 0} massimo={maxTecnico} color="bg-blue-400" />
                        <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
                          <span className="text-emerald-600">{pct(r.fatturabili_minuti, r.totale_minuti)} fatturabile</span>
                          <span>{pct((r.totale_minuti || 0) - (r.fatturabili_minuti || 0), r.totale_minuti)} interno</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* PER CLIENTE */}
                {tab === 'clienti' && (
                  <div className="space-y-3">
                    {dati.per_cliente.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Nessun dato nel periodo</p>
                    ) : dati.per_cliente.map((r: any, i: number) => (
                      <div key={r.id ?? i} className="p-3 rounded-lg border bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{r.ragione_sociale || '— Senza cliente —'}</p>
                            <p className="text-xs text-gray-400">{r.num_ticket} ticket</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-gray-900">{fmt(r.totale_minuti)}</p>
                            <p className="text-xs text-emerald-600">{fmt(r.fatturabili_minuti)} fatt.</p>
                          </div>
                        </div>
                        <BarraPercentuale valore={r.totale_minuti || 0} massimo={maxCliente} color="bg-indigo-400" />
                      </div>
                    ))}
                  </div>
                )}

                {/* PER TICKET */}
                {tab === 'ticket' && (
                  <div className="overflow-x-auto">
                    {dati.per_ticket.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-8">Nessun dato nel periodo</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-gray-400 border-b">
                            <th className="text-left py-2 font-medium">Ticket</th>
                            <th className="text-left py-2 font-medium">Cliente</th>
                            <th className="text-left py-2 font-medium">Tecnico</th>
                            <th className="text-right py-2 font-medium">Previsto</th>
                            <th className="text-right py-2 font-medium">Effettivo</th>
                            <th className="text-right py-2 font-medium">Delta</th>
                            <th className="text-right py-2 font-medium">Fatt.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {dati.per_ticket.map((r: any) => {
                            const delta = r.delta_minuti;
                            return (
                              <tr key={r.id} className="hover:bg-gray-50">
                                <td className="py-2 pr-3">
                                  <p className="font-mono text-xs text-gray-400">{r.numero_ticket}</p>
                                  <p className="text-gray-800 text-xs truncate max-w-[160px]">{r.titolo}</p>
                                </td>
                                <td className="py-2 pr-3 text-xs text-gray-500 max-w-[120px] truncate">{r.cliente_nome || '—'}</td>
                                <td className="py-2 pr-3 text-xs text-gray-500">{r.assegnato_nome || '—'}</td>
                                <td className="py-2 pr-3 text-right text-xs text-gray-400">{fmt(r.tempo_previsto_minuti)}</td>
                                <td className="py-2 pr-3 text-right text-xs font-medium text-gray-800">{fmt(r.totale_minuti)}</td>
                                <td className="py-2 pr-3 text-right text-xs">
                                  {delta === null ? (
                                    <span className="text-gray-300">—</span>
                                  ) : delta === 0 ? (
                                    <Minus className="h-3 w-3 text-gray-400 inline" />
                                  ) : delta > 0 ? (
                                    <span className="text-red-500 flex items-center justify-end gap-0.5">
                                      <TrendingUp className="h-3 w-3" />{fmt(delta)}
                                    </span>
                                  ) : (
                                    <span className="text-emerald-600 flex items-center justify-end gap-0.5">
                                      <TrendingDown className="h-3 w-3" />{fmt(Math.abs(delta))}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 text-right text-xs text-emerald-600">{fmt(r.fatturabili_minuti)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
