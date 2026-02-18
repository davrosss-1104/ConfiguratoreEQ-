/**
 * OrdinePanel.tsx - Flusso Preventivo -> Ordine -> BOM + Revisioni + Sconti
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2, Package, Loader2, AlertTriangle,
  ArrowRight, Boxes, Truck, ChevronDown, ChevronRight,
  ClipboardList, FileText, History,
  Tag, Percent, RotateCcw, Plus, Eye
} from 'lucide-react';

const API = 'http://localhost:8000';
const fmt = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

interface MaterialeItem {
  id: number;
  codice: string;
  descrizione: string;
  quantita: number;
  prezzo_unitario: number;
  prezzo_totale: number;
  aggiunto_da_regola: boolean;
}

interface ClienteInfo {
  id: number;
  ragione_sociale: string;
  codice: string;
  sconto_produzione?: number;
  sconto_acquisto?: number;
}

interface OrdineInfo {
  id: number;
  numero_ordine: string;
  stato: string;
  tipo_impianto: string;
  totale_materiali: number;
  totale_netto: number;
  lead_time_giorni: number;
  data_consegna_prevista: string;
  bom_esplosa: boolean;
  created_at: string;
  preventivo_id: number;
}

interface RevisioneInfo {
  id: number;
  preventivo_id: number;
  numero_revisione: number;
  motivo: string;
  created_by: string;
  created_at: string;
}

interface EsplosoItem {
  codice: string;
  descrizione: string;
  tipo: string;
  categoria: string;
  quantita: number;
  unita_misura: string;
  costo_unitario: number;
  costo_totale: number;
  livello_esplosione: number;
  lead_time_giorni: number;
}

export default function OrdinePanel() {
  const { id } = useParams<{ id: string }>();
  const preventivoId = parseInt(id || '0', 10);
  const queryClient = useQueryClient();
  const [expandedCategorie, setExpandedCategorie] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'tipo' | 'categoria'>('tipo');
  const [scontoExtra, setScontoExtra] = useState<number>(0);
  const [showRevisioni, setShowRevisioni] = useState(false);
  const [revisioneDettaglio, setRevisioneDettaglio] = useState<any>(null);

  // --- Queries ---
  const { data: preventivo } = useQuery({
    queryKey: ['preventivo', preventivoId],
    queryFn: async () => { const r = await fetch(`${API}/preventivi/${preventivoId}`); return r.ok ? r.json() : null; },
    enabled: preventivoId > 0,
  });

  const { data: materiali = [] } = useQuery<MaterialeItem[]>({
    queryKey: ['materiali', preventivoId],
    queryFn: async () => { const r = await fetch(`${API}/preventivi/${preventivoId}/materiali`); return r.ok ? r.json() : []; },
    enabled: preventivoId > 0,
  });

  const clienteId = (preventivo as any)?.cliente_id;
  const { data: cliente } = useQuery<ClienteInfo | null>({
    queryKey: ['cliente', clienteId],
    queryFn: async () => { const r = await fetch(`${API}/clienti/${clienteId}`); return r.ok ? r.json() : null; },
    enabled: !!clienteId,
  });

  const { data: ordini = [] } = useQuery<OrdineInfo[]>({
    queryKey: ['ordini-preventivo', preventivoId],
    queryFn: async () => {
      const r = await fetch(`${API}/ordini`);
      if (!r.ok) return [];
      const all = await r.json();
      return all.filter((o: any) => o.preventivo_id === preventivoId);
    },
    enabled: preventivoId > 0,
  });
  const ordine = ordini.length > 0 ? ordini[0] : null;

  const { data: revisioni = [] } = useQuery<RevisioneInfo[]>({
    queryKey: ['revisioni', preventivoId],
    queryFn: async () => { const r = await fetch(`${API}/preventivi/${preventivoId}/revisioni`); return r.ok ? r.json() : []; },
    enabled: preventivoId > 0,
  });

  const { data: esplosiData } = useQuery({
    queryKey: ['esplosi', ordine?.id],
    queryFn: async () => { const r = await fetch(`${API}/ordini/${ordine!.id}/esplosi`); return r.ok ? r.json() : null; },
    enabled: !!ordine?.bom_esplosa,
  });

  const { data: listaAcquisti } = useQuery({
    queryKey: ['lista-acquisti', ordine?.id],
    queryFn: async () => { const r = await fetch(`${API}/ordini/${ordine!.id}/lista-acquisti`); return r.ok ? r.json() : null; },
    enabled: !!ordine?.bom_esplosa,
  });

  useEffect(() => {
    if (preventivo?.sconto_extra_admin) setScontoExtra(preventivo.sconto_extra_admin);
  }, [preventivo]);

  // --- Calcoli sconti ---
  const subtotale = materiali.reduce((s, m) => s + (m.prezzo_totale || 0), 0);
  const scontoProd = cliente?.sconto_produzione || 0;
  const scontoAcq = cliente?.sconto_acquisto || 0;
  const scontoCliente = Math.max(scontoProd, scontoAcq);
  const importoScontoCliente = subtotale * (scontoCliente / 100);
  const prezzoDopoScontoCliente = subtotale - importoScontoCliente;
  const importoScontoExtra = prezzoDopoScontoCliente * (scontoExtra / 100);
  const totaleFinale = prezzoDopoScontoCliente - importoScontoExtra;

  // --- Mutations ---
  const confermaMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/preventivi/${preventivoId}/conferma`, { method: 'POST' });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Errore conferma'); }
      return r.json();
    },
    onSuccess: (data) => {
      toast.success(`Ordine ${data.numero_ordine} creato!`);
      queryClient.invalidateQueries({ queryKey: ['ordini-preventivo'] });
      queryClient.invalidateQueries({ queryKey: ['preventivo'] });
      queryClient.invalidateQueries({ queryKey: ['revisioni'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const esplodiMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/ordini/${ordine!.id}/esplodi-bom`, { method: 'POST' });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Errore BOM'); }
      return r.json();
    },
    onSuccess: (data) => {
      toast.success(`BOM esplosa: ${data.componenti_aggregati} componenti`);
      queryClient.invalidateQueries({ queryKey: ['ordini-preventivo'] });
      queryClient.invalidateQueries({ queryKey: ['esplosi'] });
      queryClient.invalidateQueries({ queryKey: ['lista-acquisti'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const creaRevisioneMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/preventivi/${preventivoId}/revisioni`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: 'Snapshot manuale' }),
      });
      if (!r.ok) throw new Error('Errore creazione revisione');
      return r.json();
    },
    onSuccess: (data) => {
      toast.success(`Revisione #${data.numero_revisione} creata`);
      queryClient.invalidateQueries({ queryKey: ['revisioni'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const ripristinaMutation = useMutation({
    mutationFn: async (revId: number) => {
      const r = await fetch(`${API}/preventivi/${preventivoId}/revisioni/${revId}/ripristina`, { method: 'POST' });
      if (!r.ok) throw new Error('Errore ripristino');
      return r.json();
    },
    onSuccess: () => {
      toast.success('Preventivo ripristinato dalla revisione');
      queryClient.invalidateQueries({ queryKey: ['preventivo'] });
      queryClient.invalidateQueries({ queryKey: ['materiali'] });
      queryClient.invalidateQueries({ queryKey: ['revisioni'] });
      setRevisioneDettaglio(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveScontoExtra = async (val: number) => {
    setScontoExtra(val);
    await fetch(`${API}/preventivi/${preventivoId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sconto_extra_admin: val }),
    });
  };

  const toggleCategoria = (cat: string) => {
    setExpandedCategorie(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; });
  };

  const isConfermato = preventivo?.status === 'confermato';
  const canConferma = preventivo && ['draft', 'bozza', 'inviato'].includes(preventivo.status);

  const raggruppati = (esplosiData?.esplosi || []).reduce((acc: Record<string, EsplosoItem[]>, item: EsplosoItem) => {
    const key = viewMode === 'tipo' ? (item.tipo || 'ALTRO') : (item.categoria || 'Altro');
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const tipoColors: Record<string, string> = {
    MASTER: 'bg-blue-100 text-blue-800', SEMILAVORATO: 'bg-amber-100 text-amber-800',
    ACQUISTO: 'bg-green-100 text-green-800', ALTRO: 'bg-gray-100 text-gray-700',
  };

  const caricaDettaglioRevisione = async (rev: RevisioneInfo) => {
    const r = await fetch(`${API}/preventivi/${preventivoId}/revisioni/${rev.id}`);
    if (r.ok) setRevisioneDettaglio(await r.json());
  };

  return (
    <div className="space-y-4">

      {/* === RIEPILOGO MATERIALI + SCONTI === */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-600" />
            Riepilogo Preventivo
          </h2>
          <span className="text-sm text-gray-500">{materiali.length} articoli</span>
        </div>

        {materiali.length > 0 && (
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-xs text-gray-500 uppercase border-b">
                  <th className="px-5 py-2 text-left">Codice</th>
                  <th className="px-3 py-2 text-left">Descrizione</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Prezzo</th>
                  <th className="px-3 py-2 text-right">Totale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materiali.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50/50">
                    <td className="px-5 py-1.5 font-mono text-xs text-gray-800">{m.codice}</td>
                    <td className="px-3 py-1.5 text-gray-700 truncate max-w-[250px]">{m.descrizione}</td>
                    <td className="px-3 py-1.5 text-right">{m.quantita}</td>
                    <td className="px-3 py-1.5 text-right text-gray-600">{fmt(m.prezzo_unitario || 0)}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{fmt(m.prezzo_totale || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sconti e totali */}
        <div className="border-t bg-gray-50/50 px-5 py-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Subtotale ({materiali.length} articoli)</span>
            <span className="font-medium">{fmt(subtotale)}</span>
          </div>
          {scontoCliente > 0 && (
            <>
              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-600 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-green-600" />
                  Sconto cliente
                  <span className="text-xs text-gray-400">(prod {scontoProd}% / acq {scontoAcq}%)</span>
                </span>
                <span className="text-green-700 font-medium">-{fmt(importoScontoCliente)} ({scontoCliente}%)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Prezzo scontato</span>
                <span className="font-medium">{fmt(prezzoDopoScontoCliente)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-sm items-center">
            <span className="text-gray-600 flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-orange-500" />
              Sconto extra
            </span>
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="100" step="0.5"
                value={scontoExtra || ''} onChange={(e) => saveScontoExtra(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                className="w-16 text-right border border-gray-300 rounded px-2 py-0.5 text-sm focus:ring-1 focus:ring-indigo-400" />
              <span className="text-xs text-gray-400">%</span>
              {scontoExtra > 0 && <span className="text-orange-600 font-medium">-{fmt(importoScontoExtra)}</span>}
            </div>
          </div>
          <div className="flex justify-between pt-2 border-t border-gray-300">
            <span className="text-base font-bold text-gray-900">TOTALE</span>
            <span className="text-xl font-bold text-indigo-700">{fmt(totaleFinale)}</span>
          </div>
        </div>
      </div>

      {/* === REVISIONI === */}
      <div className="bg-white rounded-lg shadow">
        <button onClick={() => setShowRevisioni(!showRevisioni)}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-purple-600" />
            <span className="font-bold text-gray-900">Revisioni</span>
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">{revisioni.length}</span>
          </div>
          {showRevisioni ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>

        {showRevisioni && (
          <div className="border-t px-5 py-3 space-y-3">
            <button onClick={() => creaRevisioneMutation.mutate()} disabled={creaRevisioneMutation.isPending}
              className="flex items-center gap-2 text-sm text-purple-700 hover:text-purple-900 font-medium">
              {creaRevisioneMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Crea snapshot manuale
            </button>

            {revisioni.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Nessuna revisione ancora</p>
            ) : (
              <div className="space-y-2">
                {revisioni.map(rev => (
                  <div key={rev.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="bg-purple-200 text-purple-800 font-bold text-xs w-7 h-7 rounded-full flex items-center justify-center">
                        #{rev.numero_revisione}
                      </span>
                      <div>
                        <span className="font-medium text-gray-800">{rev.motivo || 'Revisione'}</span>
                        <p className="text-xs text-gray-400">
                          {rev.created_at ? new Date(rev.created_at).toLocaleString('it-IT') : ''}
                          {rev.created_by && <span> - {rev.created_by}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => caricaDettaglioRevisione(rev)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Visualizza">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => {
                          if (confirm(`Ripristinare la revisione #${rev.numero_revisione}? Lo stato attuale verra' salvato automaticamente.`))
                            ripristinaMutation.mutate(rev.id);
                        }}
                        disabled={ripristinaMutation.isPending}
                        className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded" title="Ripristina">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Dettaglio revisione */}
            {revisioneDettaglio && (
              <div className="mt-3 bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-purple-900">Rev. #{revisioneDettaglio.numero_revisione} - {revisioneDettaglio.motivo}</h4>
                  <button onClick={() => setRevisioneDettaglio(null)} className="text-purple-400 hover:text-purple-700 text-xs">Chiudi</button>
                </div>
                {revisioneDettaglio.snapshot_totali && (
                  <div className="text-sm space-y-1 mb-3">
                    <div className="flex justify-between">
                      <span className="text-purple-700">Totale listino</span>
                      <span className="font-medium">{fmt(revisioneDettaglio.snapshot_totali.total_price || 0)}</span>
                    </div>
                  </div>
                )}
                {revisioneDettaglio.snapshot_materiali?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-purple-700 mb-1">Materiali ({revisioneDettaglio.snapshot_materiali.length}):</p>
                    <div className="max-h-40 overflow-y-auto text-xs">
                      <table className="w-full">
                        <tbody className="divide-y divide-purple-200">
                          {revisioneDettaglio.snapshot_materiali.map((m: any, i: number) => (
                            <tr key={i} className="text-purple-800">
                              <td className="py-1 font-mono">{m.codice}</td>
                              <td className="py-1 truncate max-w-[200px]">{m.descrizione}</td>
                              <td className="py-1 text-right">{m.quantita}</td>
                              <td className="py-1 text-right">{fmt(m.prezzo_totale || 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* === CONFERMA + ORDINE === */}
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <Package className="w-5 h-5 text-indigo-600" />
          Ordine e Distinta Base
        </h2>

        {/* Timeline */}
        <div className="flex items-center gap-3 mb-6">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${isConfermato || ordine ? 'bg-green-100 text-green-800' : 'bg-indigo-100 text-indigo-800'}`}>
            <FileText className="w-4 h-4" /> Preventivo {(isConfermato || ordine) && <CheckCircle2 className="w-4 h-4" />}
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${ordine ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            <Package className="w-4 h-4" /> Ordine {ordine && <CheckCircle2 className="w-4 h-4" />}
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400" />
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${ordine?.bom_esplosa ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            <Boxes className="w-4 h-4" /> BOM {ordine?.bom_esplosa && <CheckCircle2 className="w-4 h-4" />}
          </div>
        </div>

        {/* Conferma */}
        {canConferma && !ordine && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <p className="text-sm text-indigo-800 mb-3">
              Totale netto: <strong>{fmt(totaleFinale)}</strong>
              {scontoCliente > 0 && <span className="text-indigo-500 ml-2">(listino {fmt(subtotale)} - {scontoCliente}%{scontoExtra > 0 ? ` - ${scontoExtra}%` : ''})</span>}
            </p>
            <button onClick={() => confermaMutation.mutate()} disabled={confermaMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium">
              {confermaMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Conferma Preventivo e Genera Ordine
            </button>
          </div>
        )}

        {/* Ordine info */}
        {ordine && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-green-900 text-lg">{ordine.numero_ordine}</p>
                <p className="text-sm text-green-700">
                  Preventivo {preventivo?.numero_preventivo} confermato il {ordine.created_at ? new Date(ordine.created_at).toLocaleDateString('it-IT') : ''}
                </p>
              </div>
              <span className="bg-green-200 text-green-800 px-3 py-1 rounded-full text-xs font-bold uppercase">{ordine.stato}</span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><span className="text-green-600">Totale</span><p className="font-bold text-green-900">{fmt(ordine.totale_netto || ordine.totale_materiali || 0)}</p></div>
              <div><span className="text-green-600">Lead time</span><p className="font-bold text-green-900">{ordine.lead_time_giorni || 15} giorni</p></div>
              <div><span className="text-green-600">Consegna prevista</span><p className="font-bold text-green-900">{ordine.data_consegna_prevista ? new Date(ordine.data_consegna_prevista).toLocaleDateString('it-IT') : '-'}</p></div>
            </div>
            {!ordine.bom_esplosa && (
              <button onClick={() => esplodiMutation.mutate()} disabled={esplodiMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium text-sm">
                {esplodiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Boxes className="w-4 h-4" />}
                Esplodi Distinta Base
              </button>
            )}
          </div>
        )}

        {!ordine && !canConferma && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">Preventivo non confermabile</p>
              <p className="text-sm text-amber-700 mt-1">Stato: <strong>{preventivo?.status || 'sconosciuto'}</strong>. Solo preventivi in stato "draft" o "inviato".</p>
            </div>
          </div>
        )}
      </div>

      {/* === DISTINTA ESPLOSA === */}
      {ordine?.bom_esplosa && esplosiData && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Boxes className="w-5 h-5 text-amber-600" /> Distinta Base Esplosa</h3>
              <p className="text-sm text-gray-500 mt-0.5">{esplosiData.totale_componenti} componenti - Costo: <strong>{fmt(esplosiData.costo_totale || 0)}</strong></p>
            </div>
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {(['tipo', 'categoria'] as const).map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}>
                  Per {mode === 'tipo' ? 'Tipo' : 'Categoria'}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y">
            {Object.entries(raggruppati).sort().map(([gruppo, items]) => (
              <div key={gruppo}>
                <button onClick={() => toggleCategoria(gruppo)} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  {expandedCategorie.has(gruppo) ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${tipoColors[gruppo] || 'bg-gray-100 text-gray-700'}`}>{gruppo}</span>
                  <span className="text-sm text-gray-700 font-medium">{(items as EsplosoItem[]).length} componenti</span>
                  <span className="text-sm text-gray-500 ml-auto">{fmt((items as EsplosoItem[]).reduce((s, i) => s + (i.costo_totale || 0), 0))}</span>
                </button>
                {expandedCategorie.has(gruppo) && (
                  <div className="bg-gray-50/50">
                    <table className="w-full text-sm">
                      <thead><tr className="text-xs text-gray-500 uppercase border-b">
                        <th className="px-5 py-2 text-left">Codice</th><th className="px-3 py-2 text-left">Descrizione</th>
                        <th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">UM</th>
                        <th className="px-3 py-2 text-right">Costo Unit.</th><th className="px-3 py-2 text-right">Totale</th><th className="px-3 py-2 text-right">LT</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-200">
                        {(items as EsplosoItem[]).map((item, idx) => (
                          <tr key={`${item.codice}-${idx}`} className="hover:bg-white/80">
                            <td className="px-5 py-2 font-mono text-xs font-medium text-gray-800">{'  '.repeat(item.livello_esplosione || 0)}{item.codice}</td>
                            <td className="px-3 py-2 text-gray-700">{item.descrizione}</td>
                            <td className="px-3 py-2 text-right font-medium">{item.quantita}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{item.unita_misura}</td>
                            <td className="px-3 py-2 text-right text-gray-600">{(item.costo_unitario || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2 text-right font-medium">{fmt(item.costo_totale || 0)}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{item.lead_time_giorni || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* === LISTA ACQUISTI === */}
      {listaAcquisti && Object.keys(listaAcquisti.fornitori || {}).length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-5 py-4 border-b">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Truck className="w-5 h-5 text-green-600" /> Lista Acquisti</h3>
            <p className="text-sm text-gray-500 mt-0.5">{listaAcquisti.num_fornitori} fornitori - Totale: <strong>{fmt(listaAcquisti.costo_totale_acquisti || 0)}</strong></p>
          </div>
          <div className="divide-y">
            {Object.entries(listaAcquisti.fornitori as Record<string, any>).map(([fornitore, data]) => (
              <div key={fornitore}>
                <button onClick={() => toggleCategoria(`f-${fornitore}`)} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  {expandedCategorie.has(`f-${fornitore}`) ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                  <Truck className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-gray-900">{fornitore}</span>
                  <span className="text-xs text-gray-500">{data.num_articoli} articoli</span>
                  <span className="text-sm font-medium text-gray-700 ml-auto">{fmt(data.totale || 0)}</span>
                </button>
                {expandedCategorie.has(`f-${fornitore}`) && (
                  <div className="bg-gray-50/50 px-5 pb-3">
                    <table className="w-full text-sm">
                      <thead><tr className="text-xs text-gray-500 uppercase border-b">
                        <th className="py-2 text-left">Codice</th><th className="py-2 text-left">Cod. Forn.</th>
                        <th className="py-2 text-left">Descrizione</th><th className="py-2 text-right">Qty</th>
                        <th className="py-2 text-right">Costo</th><th className="py-2 text-right">LT</th>
                      </tr></thead>
                      <tbody className="divide-y divide-gray-200">
                        {data.articoli.map((art: any, idx: number) => (
                          <tr key={idx} className="hover:bg-white/80">
                            <td className="py-2 font-mono text-xs">{art.codice}</td>
                            <td className="py-2 text-xs text-gray-600">{art.codice_fornitore || '-'}</td>
                            <td className="py-2 text-gray-700">{art.descrizione}</td>
                            <td className="py-2 text-right font-medium">{art.quantita}</td>
                            <td className="py-2 text-right">{fmt(art.costo_totale || 0)}</td>
                            <td className="py-2 text-right text-gray-500">{art.lead_time_giorni || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
