import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import {
  Play, RefreshCw, ChevronDown, ChevronRight, ArrowRight,
  CheckCircle, XCircle, Clock, AlertTriangle, Package,
  ShoppingCart, BarChart2, Filter, Loader2, Building2,
  CalendarDays, Boxes,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface Run {
  id: number;
  data_run: string;
  orizzonte_giorni: number;
  utente: string;
  stato: string;
  commesse_elaborate: number;
  righe_fabbisogno: number;
  proposte_generate: number;
  completed_at: string | null;
}

interface Proposta {
  id: number;
  run_id: number;
  fornitore: string;
  fornitore_id: number | null;
  data_consegna_suggerita: string | null;
  stato: string;
  n_righe: number;
  righe: RigaProposta[];
  oda_id: number | null;
}

interface RigaProposta {
  articolo_id: number | null;
  codice_articolo: string;
  descrizione: string;
  unita_misura: string;
  quantita: number;
  lead_time_giorni: number;
  commesse: { numero_preventivo: string; quantita_componente: number }[];
}

interface Commessa {
  id: number;
  numero_preventivo: string;
  customer_name: string;
  status: string;
  data_consegna: string;
  quantita: number;
  n_materiali: number;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

const fmtDate = (s: string | null) => {
  if (!s) return '—';
  try { return new Date(s).toLocaleDateString('it-IT'); } catch { return s; }
};

const fmtQty = (n: number) =>
  Number.isInteger(n) ? n.toString() : n.toFixed(2);

const STATO_BADGE: Record<string, { label: string; cls: string }> = {
  proposta:   { label: 'Da evadere',  cls: 'bg-amber-100 text-amber-800' },
  convertita: { label: 'Convertita',  cls: 'bg-green-100 text-green-800' },
  rifiutata:  { label: 'Rifiutata',   cls: 'bg-red-100 text-red-800' },
};

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPALE
// ─────────────────────────────────────────────────────────────

export default function MrpPage() {
  const [tab, setTab]               = useState<'proposte' | 'runs' | 'lancia'>('proposte');
  const [runs, setRuns]             = useState<Run[]>([]);
  const [runAttivo, setRunAttivo]   = useState<Run | null>(null);
  const [proposte, setProposte]     = useState<Proposta[]>([]);
  const [commesse, setCommesse]     = useState<Commessa[]>([]);
  const [loading, setLoading]       = useState(false);
  const [running, setRunning]       = useState(false);
  const [expanded, setExpanded]     = useState<Set<number>>(new Set());

  // Form lancio run
  const [orizzonte, setOrizzonte]   = useState(90);
  const [soloSelezionate, setSoloSelezionate] = useState(false);
  const [commesseSel, setCommesseSel]         = useState<Set<number>>(new Set());

  // ── Carica runs ──────────────────────────────────────────
  const caricaRuns = useCallback(async () => {
    const r = await fetch(`${API_BASE}/mrp/runs`);
    if (!r.ok) return;
    const d = await r.json();
    setRuns(d.runs || []);
    if (d.runs?.length) setRunAttivo(d.runs[0]);
  }, []);

  // ── Carica proposte dell'ultimo run ──────────────────────
  const caricaProposte = useCallback(async (runId?: number) => {
    setLoading(true);
    try {
      const url = runId
        ? `${API_BASE}/mrp/proposte?run_id=${runId}`
        : `${API_BASE}/mrp/proposte`;
      const r = await fetch(url);
      if (!r.ok) return;
      const d = await r.json();
      setProposte(d.proposte || []);
      if (d.run_id && !runId) {
        const run = runs.find(r => r.id === d.run_id);
        if (run) setRunAttivo(run);
      }
    } finally {
      setLoading(false);
    }
  }, [runs]);

  // ── Carica commesse selezionabili ────────────────────────
  const caricaCommesse = useCallback(async () => {
    const r = await fetch(`${API_BASE}/mrp/commesse-selezionabili?orizzonte_giorni=${orizzonte}`);
    if (!r.ok) return;
    setCommesse(await r.json());
  }, [orizzonte]);

  useEffect(() => { caricaRuns(); }, []);
  useEffect(() => { if (tab === 'proposte') caricaProposte(); }, [tab]);
  useEffect(() => { if (tab === 'lancia') caricaCommesse(); }, [tab, orizzonte]);

  // ── Lancia run ───────────────────────────────────────────
  const lanciaRun = async () => {
    setRunning(true);
    try {
      const body: Record<string, unknown> = { orizzonte_giorni: orizzonte };
      if (soloSelezionate && commesseSel.size > 0) {
        body.commessa_ids = Array.from(commesseSel);
      }
      const r = await fetch(`${API_BASE}/mrp/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.detail || 'Errore run MRP'); return; }

      toast.success(
        `Run completato — ${d.commesse_elaborate} commesse, ${d.proposte_generate} proposte`
      );
      if (d.avvisi?.length) {
        d.avvisi.forEach((a: string) => toast.warning(a, { duration: 6000 }));
      }
      await caricaRuns();
      setTab('proposte');
      await caricaProposte(d.run_id);
    } finally {
      setRunning(false);
    }
  };

  // ── Converti proposta → ODA ──────────────────────────────
  const convertiProposta = async (proposta: Proposta) => {
    const r = await fetch(`${API_BASE}/mrp/proposte/${proposta.id}/converti-oda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.detail || 'Errore conversione'); return; }
    toast.success(`ODA ${d.numero_oda} creato — apri Acquisti per completare i prezzi`);
    await caricaProposte(runAttivo?.id);
  };

  // ── Converti tutte ───────────────────────────────────────
  const convertiTutte = async () => {
    if (!runAttivo) return;
    const r = await fetch(`${API_BASE}/mrp/proposte/converti-tutte`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: runAttivo.id }),
    });
    const d = await r.json();
    if (!r.ok) { toast.error(d.detail || 'Errore'); return; }
    toast.success(`${d.convertite} ODA creati`);
    if (d.errori?.length) toast.warning(`${d.errori.length} proposte non convertite`);
    await caricaProposte(runAttivo.id);
  };

  // ── Rifiuta proposta ─────────────────────────────────────
  const rifiutaProposta = async (id: number, statoAttuale: string) => {
    const nuovoStato = statoAttuale === 'rifiutata' ? 'proposta' : 'rifiutata';
    const r = await fetch(`${API_BASE}/mrp/proposte/${id}/stato`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stato: nuovoStato }),
    });
    if (!r.ok) { toast.error('Errore aggiornamento stato'); return; }
    await caricaProposte(runAttivo?.id);
  };

  const toggleExpand = (id: number) =>
    setExpanded(p => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleCommessa = (id: number) =>
    setCommesseSel(p => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const proposteAperte = proposte.filter(p => p.stato === 'proposta');

  // ─────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">MRP — Pianificazione Acquisti</h1>
            {runAttivo && (
              <p className="text-xs text-gray-500 mt-0.5">
                Ultimo run: {fmtDate(runAttivo.data_run)} &middot; {runAttivo.commesse_elaborate} commesse &middot; {runAttivo.proposte_generate} proposte
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {proposteAperte.length > 0 && (
            <button
              onClick={convertiTutte}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
            >
              <ShoppingCart className="h-4 w-4" />
              Converti tutte ({proposteAperte.length})
            </button>
          )}
          <button
            onClick={() => setTab('lancia')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Play className="h-4 w-4" />
            Nuovo run
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b px-6">
        <div className="flex gap-1">
          {(['proposte', 'runs', 'lancia'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'proposte' ? 'Proposte d\'ordine' : t === 'runs' ? 'Storico run' : 'Nuovo run'}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">

        {/* ═══════════════════════════════════════════════
            TAB: PROPOSTE
        ═══════════════════════════════════════════════ */}
        {tab === 'proposte' && (
          <div>
            {loading ? (
              <div className="flex items-center justify-center py-20 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Caricamento...
              </div>
            ) : proposte.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <BarChart2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nessuna proposta disponibile</p>
                <p className="text-sm mt-1">Lancia un nuovo run MRP per generare le proposte d'ordine.</p>
                <button
                  onClick={() => setTab('lancia')}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                >
                  Lancia run MRP
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Selezione run */}
                {runs.length > 1 && (
                  <div className="flex items-center gap-3 mb-4">
                    <Filter className="h-4 w-4 text-gray-400" />
                    <select
                      value={runAttivo?.id ?? ''}
                      onChange={e => {
                        const r = runs.find(r => r.id === Number(e.target.value));
                        if (r) { setRunAttivo(r); caricaProposte(r.id); }
                      }}
                      className="text-sm border rounded px-2 py-1 text-gray-700"
                    >
                      {runs.map(r => (
                        <option key={r.id} value={r.id}>
                          Run #{r.id} — {fmtDate(r.data_run)} ({r.proposte_generate} proposte)
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {proposte.map(p => (
                  <PropostaCard
                    key={p.id}
                    proposta={p}
                    expanded={expanded.has(p.id)}
                    onToggle={() => toggleExpand(p.id)}
                    onConverti={() => convertiProposta(p)}
                    onRifiuta={() => rifiutaProposta(p.id, p.stato)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            TAB: STORICO RUN
        ═══════════════════════════════════════════════ */}
        {tab === 'runs' && (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Run</th>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Orizzonte</th>
                  <th className="px-4 py-3 text-right">Commesse</th>
                  <th className="px-4 py-3 text-right">Fabbisogni</th>
                  <th className="px-4 py-3 text-right">Proposte</th>
                  <th className="px-4 py-3 text-left">Stato</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">#{r.id}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(r.data_run)}</td>
                    <td className="px-4 py-3 text-gray-600">{r.orizzonte_giorni}gg</td>
                    <td className="px-4 py-3 text-right">{r.commesse_elaborate}</td>
                    <td className="px-4 py-3 text-right">{r.righe_fabbisogno}</td>
                    <td className="px-4 py-3 text-right">{r.proposte_generate}</td>
                    <td className="px-4 py-3">
                      <RunStatoBadge stato={r.stato} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { setRunAttivo(r); caricaProposte(r.id); setTab('proposte'); }}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Vedi proposte
                      </button>
                    </td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Nessun run eseguito</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ═══════════════════════════════════════════════
            TAB: NUOVO RUN
        ═══════════════════════════════════════════════ */}
        {tab === 'lancia' && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-xl border p-6 space-y-6">
              <h2 className="text-base font-semibold text-gray-800">Configura nuovo run MRP</h2>

              {/* Orizzonte */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Orizzonte pianificazione
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={30} max={365} step={15}
                    value={orizzonte}
                    onChange={e => setOrizzonte(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-sm font-bold text-blue-600 w-16 text-right">{orizzonte} giorni</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Considera commesse con data consegna entro il {fmtDate(
                    new Date(Date.now() + orizzonte * 86400000).toISOString()
                  )}
                </p>
              </div>

              {/* Selezione commesse */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={soloSelezionate}
                    onChange={e => setSoloSelezionate(e.target.checked)}
                    className="rounded"
                  />
                  Seleziona commesse specifiche (default: tutte aperte nell'orizzonte)
                </label>

                {soloSelezionate && (
                  <div className="mt-3 border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    {commesse.length === 0 ? (
                      <p className="p-4 text-sm text-gray-400 text-center">
                        Nessuna commessa aperta nell'orizzonte selezionato
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 w-8" />
                            <th className="px-3 py-2 text-left">Commessa</th>
                            <th className="px-3 py-2 text-left">Cliente</th>
                            <th className="px-3 py-2 text-right">Consegna</th>
                            <th className="px-3 py-2 text-right">Materiali</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {commesse.map(c => (
                            <tr
                              key={c.id}
                              className="hover:bg-blue-50 cursor-pointer"
                              onClick={() => toggleCommessa(c.id)}
                            >
                              <td className="px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={commesseSel.has(c.id)}
                                  onChange={() => toggleCommessa(c.id)}
                                  className="rounded"
                                />
                              </td>
                              <td className="px-3 py-2 font-medium">{c.numero_preventivo}</td>
                              <td className="px-3 py-2 text-gray-600 truncate max-w-[160px]">{c.customer_name || '—'}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{fmtDate(c.data_consegna)}</td>
                              <td className="px-3 py-2 text-right">
                                <span className={c.n_materiali === 0 ? 'text-red-400' : 'text-gray-600'}>
                                  {c.n_materiali}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
                {soloSelezionate && (
                  <p className="text-xs text-gray-400 mt-1">
                    {commesseSel.size === 0 ? 'Nessuna commessa selezionata — verranno incluse tutte' : `${commesseSel.size} commesse selezionate`}
                  </p>
                )}
              </div>

              {/* Riepilogo */}
              <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 space-y-1">
                <p className="font-medium">Il run MRP eseguirà:</p>
                <p>1. Lettura commesse aperte nell'orizzonte di {orizzonte} giorni</p>
                <p>2. Esplosione BOM per ogni commessa</p>
                <p>3. Confronto con giacenze e ODA già in corso</p>
                <p>4. Generazione proposte d'ordine raggruppate per fornitore</p>
              </div>

              <button
                onClick={lanciaRun}
                disabled={running}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60"
              >
                {running ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Elaborazione in corso...</>
                ) : (
                  <><Play className="h-4 w-4" /> Lancia run MRP</>
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PROPOSTA CARD
// ─────────────────────────────────────────────────────────────

function PropostaCard({
  proposta, expanded, onToggle, onConverti, onRifiuta,
}: {
  proposta: Proposta;
  expanded: boolean;
  onToggle: () => void;
  onConverti: () => void;
  onRifiuta: () => void;
}) {
  const badge = STATO_BADGE[proposta.stato] ?? { label: proposta.stato, cls: 'bg-gray-100 text-gray-600' };
  const fmtDate = (s: string | null) => {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('it-IT'); } catch { return s; }
  };

  return (
    <div className={`bg-white rounded-xl border overflow-hidden transition-shadow hover:shadow-sm ${
      proposta.stato === 'rifiutata' ? 'opacity-60' : ''
    }`}>
      {/* Header card */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={onToggle}
      >
        <span className="text-gray-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>

        <Building2 className="h-4 w-4 text-gray-400 shrink-0" />

        <div className="flex-1 min-w-0">
          <span className="font-semibold text-gray-800 truncate">{proposta.fornitore}</span>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Boxes className="h-3.5 w-3.5" />
            {proposta.n_righe} articoli
          </div>
          {proposta.data_consegna_suggerita && (
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <CalendarDays className="h-3.5 w-3.5" />
              entro {fmtDate(proposta.data_consegna_suggerita)}
            </div>
          )}
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.cls}`}>
            {badge.label}
          </span>
          {proposta.oda_id && (
            <span className="text-xs text-blue-600 font-medium">→ ODA #{proposta.oda_id}</span>
          )}
        </div>

        {/* Azioni */}
        {proposta.stato !== 'convertita' && (
          <div className="flex items-center gap-2 ml-2" onClick={e => e.stopPropagation()}>
            {proposta.stato === 'proposta' && (
              <button
                onClick={onConverti}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Crea ODA
              </button>
            )}
            <button
              onClick={onRifiuta}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
                proposta.stato === 'rifiutata'
                  ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  : 'border-red-200 text-red-600 hover:bg-red-50'
              }`}
            >
              {proposta.stato === 'rifiutata' ? (
                <><CheckCircle className="h-3.5 w-3.5" /> Ripristina</>
              ) : (
                <><XCircle className="h-3.5 w-3.5" /> Rifiuta</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Dettaglio righe */}
      {expanded && (
        <div className="border-t">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Codice</th>
                <th className="px-4 py-2 text-left">Descrizione</th>
                <th className="px-4 py-2 text-right">Qtà</th>
                <th className="px-4 py-2 text-left">UM</th>
                <th className="px-4 py-2 text-left">Commesse</th>
                <th className="px-4 py-2 text-right">Lead time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {proposta.righe.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.codice_articolo}</td>
                  <td className="px-4 py-2 text-gray-700">{r.descrizione}</td>
                  <td className="px-4 py-2 text-right font-semibold text-gray-800">{fmtQty(r.quantita)}</td>
                  <td className="px-4 py-2 text-gray-500">{r.unita_misura}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {r.commesse?.slice(0, 3).map(c => c.numero_preventivo).join(', ')}
                    {(r.commesse?.length ?? 0) > 3 && ` +${r.commesse.length - 3}`}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500">
                    {r.lead_time_giorni ? `${r.lead_time_giorni}gg` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RUN STATO BADGE
// ─────────────────────────────────────────────────────────────

function RunStatoBadge({ stato }: { stato: string }) {
  if (stato === 'completato')
    return <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle className="h-3.5 w-3.5" />Completato</span>;
  if (stato === 'in_corso')
    return <span className="flex items-center gap-1 text-blue-600 text-xs"><Clock className="h-3.5 w-3.5 animate-spin" />In corso</span>;
  return <span className="flex items-center gap-1 text-red-500 text-xs"><AlertTriangle className="h-3.5 w-3.5" />{stato}</span>;
}
