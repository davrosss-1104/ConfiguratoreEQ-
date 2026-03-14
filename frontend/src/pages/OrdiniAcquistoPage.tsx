import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart, Plus, Search, RefreshCw, Loader2,
  ChevronRight, Building2, Calendar, AlertTriangle,
  Package, FileText, BarChart3, CheckCircle2, Clock, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const API = '/api/oda';
const fmt  = (n: number) => (n ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const fmtD = (s?: string) => s ? new Date(s).toLocaleDateString('it-IT') : '—';

// ==========================================
// CONFIG STATI
// ==========================================
const STATI: Record<string, { label: string; bg: string; text: string; icona: React.ReactNode }> = {
  bozza:                  { label: 'Bozza',               bg: 'bg-gray-100',    text: 'text-gray-600',    icona: <FileText     className="h-3.5 w-3.5" /> },
  inviato:                { label: 'Inviato',              bg: 'bg-blue-100',    text: 'text-blue-700',    icona: <Clock        className="h-3.5 w-3.5" /> },
  parzialmente_ricevuto:  { label: 'Parz. ricevuto',       bg: 'bg-amber-100',   text: 'text-amber-700',   icona: <Package      className="h-3.5 w-3.5" /> },
  ricevuto:               { label: 'Ricevuto',             bg: 'bg-emerald-100', text: 'text-emerald-700', icona: <CheckCircle2 className="h-3.5 w-3.5" /> },
  chiuso:                 { label: 'Chiuso',               bg: 'bg-violet-100',  text: 'text-violet-700',  icona: <CheckCircle2 className="h-3.5 w-3.5" /> },
  annullato:              { label: 'Annullato',            bg: 'bg-red-100',     text: 'text-red-600',     icona: <XCircle      className="h-3.5 w-3.5" /> },
};

function StatoBadge({ stato }: { stato: string }) {
  const cfg = STATI[stato] ?? { label: stato, bg: 'bg-gray-100', text: 'text-gray-600', icona: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.icona}{cfg.label}
    </span>
  );
}

// ==========================================
// DIALOG NUOVO ODA
// ==========================================
function NuovoOdaDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (id: number) => void }) {
  const [form, setForm] = useState({
    fornitore_denominazione: '',
    fornitore_partita_iva: '',
    codice_commessa: '',
    data_consegna_richiesta: '',
    condizioni_pagamento: '',
    note: '',
  });
  const [loading, setLoading] = useState(false);

  // Ricerca fornitori esistenti
  const { data: fornitori } = useQuery({
    queryKey: ['fornitori-search', form.fornitore_denominazione],
    queryFn: async () => {
      if (!form.fornitore_denominazione || form.fornitore_denominazione.length < 2) return [];
      const res = await fetch(`/api/fatturazione/passive/fornitori/lista?q=${encodeURIComponent(form.fornitore_denominazione)}`);
      return res.ok ? res.json() : [];
    },
    enabled: form.fornitore_denominazione.length >= 2,
  });

  const selezionaFornitore = (f: any) => {
    setForm(prev => ({
      ...prev,
      fornitore_denominazione: f.denominazione,
      fornitore_partita_iva: f.partita_iva || '',
    }));
  };

  const handleCrea = async () => {
    if (!form.fornitore_denominazione) { toast.error('Inserire il fornitore'); return; }
    setLoading(true);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, anno: new Date().getFullYear() }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      const data = await res.json();
      toast.success(`ODA ${data.numero_oda} creato`);
      onCreate(data.id);
    } catch (e: any) {
      toast.error(e.message || 'Errore creazione');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-5 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Nuovo Ordine di Acquisto</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          {/* Fornitore con suggerimenti */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Fornitore *</label>
            <input
              value={form.fornitore_denominazione}
              onChange={e => setForm(p => ({ ...p, fornitore_denominazione: e.target.value }))}
              placeholder="Ragione sociale fornitore..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {fornitori && fornitori.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                {fornitori.map((f: any) => (
                  <button
                    key={f.id}
                    onClick={() => selezionaFornitore(f)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
                  >
                    <Building2 className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    <div>
                      <p className="font-medium text-gray-800">{f.denominazione}</p>
                      {f.partita_iva && <p className="text-xs text-gray-400">P.IVA: {f.partita_iva}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">P.IVA fornitore</label>
            <input
              value={form.fornitore_partita_iva}
              onChange={e => setForm(p => ({ ...p, fornitore_partita_iva: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="es. IT12345678901"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Codice commessa</label>
              <input
                value={form.codice_commessa}
                onChange={e => setForm(p => ({ ...p, codice_commessa: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Consegna richiesta</label>
              <input
                type="date"
                value={form.data_consegna_richiesta}
                onChange={e => setForm(p => ({ ...p, data_consegna_richiesta: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Condizioni di pagamento</label>
            <input
              value={form.condizioni_pagamento}
              onChange={e => setForm(p => ({ ...p, condizioni_pagamento: e.target.value }))}
              placeholder="es. 30gg data fattura"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <textarea
              value={form.note}
              onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annulla</button>
          <button
            onClick={handleCrea}
            disabled={loading}
            className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Crea ODA
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// PAGINA LISTA ODA
// ==========================================
export default function OrdiniAcquistoPage() {
  const navigate = useNavigate();
  const [q,          setQ]          = useState('');
  const [stato,      setStato]      = useState('');
  const [anno,       setAnno]       = useState(new Date().getFullYear());
  const [daRicevere, setDaRicevere] = useState(false);
  const [showNuovo,  setShowNuovo]  = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['oda-lista', q, stato, anno, daRicevere],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (q)          p.set('q', q);
      if (stato)      p.set('stato', stato);
      if (anno)       p.set('anno', String(anno));
      if (daRicevere) p.set('da_ricevere', 'true');
      p.set('limit', '100');
      const res = await fetch(`${API}?${p}`);
      if (!res.ok) throw new Error();
      return res.json();
    },
    staleTime: 30000,
  });

  const { data: stats } = useQuery({
    queryKey: ['oda-stats', anno],
    queryFn: async () => {
      const res = await fetch(`${API}/statistiche?anno=${anno}`);
      return res.ok ? res.json() : null;
    },
    staleTime: 60000,
  });

  const lista = data?.oda ?? [];
  const totale = data?.totale ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Ordini di Acquisto</h1>
              <p className="text-sm text-gray-500">{totale} ordini</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => refetch()} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowNuovo(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Nuovo ODA
            </button>
          </div>
        </div>
      </div>

      {/* KPI bar */}
      {stats && (
        <div className="bg-white border-b px-6 py-3">
          <div className="flex items-center gap-6 text-sm flex-wrap">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500">Totale {anno}:</span>
              <span className="font-semibold text-gray-900">{fmt(stats.totale_importo)}</span>
            </div>
            {(stats.per_stato?.inviato?.count || 0) + (stats.per_stato?.parzialmente_ricevuto?.count || 0) > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 bg-blue-400 rounded-full" />
                <span className="text-gray-500">
                  {(stats.per_stato?.inviato?.count || 0) + (stats.per_stato?.parzialmente_ricevuto?.count || 0)} in attesa ricezione
                </span>
              </div>
            )}
            {stats.in_ritardo > 0 && (
              <div className="flex items-center gap-1.5 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-medium">{stats.in_ritardo} in ritardo</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filtri */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Cerca numero, fornitore, commessa..."
              className="pl-9 pr-3 py-1.5 border rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={stato}
            onChange={e => setStato(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tutti gli stati</option>
            {Object.entries(STATI).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <select
            value={anno}
            onChange={e => setAnno(Number(e.target.value))}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {[2026, 2025, 2024, 2023].map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={daRicevere}
              onChange={e => setDaRicevere(e.target.checked)}
              className="rounded"
            />
            Da ricevere
          </label>
        </div>
      </div>

      {/* Tabella */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : lista.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Nessun ordine di acquisto</p>
            <p className="text-sm mt-1">Crea il primo ODA con il pulsante in alto a destra</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">N. ODA</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Fornitore</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Commessa</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Emissione</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Consegna</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Totale</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Righe</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Stato</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lista.map((oda: any) => {
                  const inRitardo = oda.data_consegna_richiesta
                    && new Date(oda.data_consegna_richiesta) < new Date()
                    && !['ricevuto', 'chiuso', 'annullato'].includes(oda.stato);

                  return (
                    <tr key={oda.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-semibold text-blue-700">{oda.numero_oda}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                          <div>
                            <p className="font-medium text-gray-800 truncate max-w-[180px]">
                              {oda.fornitore_denominazione || '—'}
                            </p>
                            {oda.fornitore_partita_iva && (
                              <p className="text-xs text-gray-400">{oda.fornitore_partita_iva}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                        {oda.codice_commessa || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtD(oda.data_emissione)}</td>
                      <td className={`px-4 py-3 text-xs ${inRitardo ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                        {inRitardo && <AlertTriangle className="h-3 w-3 inline mr-0.5" />}
                        {fmtD(oda.data_consegna_richiesta)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {fmt(oda.totale_oda)}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500">
                        {oda.n_righe}
                        {oda.n_fatture > 0 && (
                          <span className="ml-1 text-xs text-violet-600">+{oda.n_fatture}f</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatoBadge stato={oda.stato} />
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/acquisti/oda/${oda.id}`} className="text-gray-400 hover:text-blue-600">
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNuovo && (
        <NuovoOdaDialog
          onClose={() => setShowNuovo(false)}
          onCreate={id => { setShowNuovo(false); navigate(`/acquisti/oda/${id}`); }}
        />
      )}
    </div>
  );
}
