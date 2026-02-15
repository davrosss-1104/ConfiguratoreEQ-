/**
 * OrdinePanel.tsx — Flusso Preventivo → Ordine → Esplosione BOM
 * 
 * Posizionare in: frontend/src/components/sections/OrdinePanel.tsx
 * Aggiungere in Sidebar.tsx e PreventivoPage.tsx (vedi istruzioni in fondo)
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2, Package, Loader2, AlertTriangle,
  ArrowRight, Boxes, Truck, ChevronDown, ChevronRight,
  ClipboardList, FileText, RefreshCw
} from 'lucide-react';

const API = 'http://localhost:8000';

// --- Tipi ---
interface OrdineInfo {
  id: number;
  numero_ordine: string;
  stato: string;
  tipo_impianto: string;
  totale_materiali: number;
  lead_time_giorni: number;
  data_consegna_prevista: string;
  bom_esplosa: boolean;
  created_at: string;
  cliente: string;
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
  percorso: string;
  lead_time_giorni: number;
}

// --- Componente ---
export default function OrdinePanel() {
  const { id } = useParams<{ id: string }>();
  const preventivoId = parseInt(id || '0', 10);
  const queryClient = useQueryClient();
  const [expandedCategorie, setExpandedCategorie] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'tipo' | 'categoria' | 'fornitore'>('tipo');

  // 1. Carica preventivo per stato
  const { data: preventivo } = useQuery({
    queryKey: ['preventivo', preventivoId],
    queryFn: async () => {
      const res = await fetch(`${API}/preventivi/${preventivoId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: preventivoId > 0,
  });

  // 2. Carica ordine se esiste
  const { data: ordini = [] } = useQuery<OrdineInfo[]>({
    queryKey: ['ordini-preventivo', preventivoId],
    queryFn: async () => {
      const res = await fetch(`${API}/ordini`);
      if (!res.ok) return [];
      const all = await res.json();
      return all.filter((o: OrdineInfo) => o.preventivo_id === preventivoId);
    },
    enabled: preventivoId > 0,
  });

  const ordine = ordini.length > 0 ? ordini[0] : null;

  // 3. Carica esplosi se BOM esplosa
  const { data: esplosiData } = useQuery({
    queryKey: ['esplosi', ordine?.id],
    queryFn: async () => {
      const res = await fetch(`${API}/ordini/${ordine!.id}/esplosi`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!ordine?.bom_esplosa,
  });

  // 4. Carica lista acquisti
  const { data: listaAcquisti } = useQuery({
    queryKey: ['lista-acquisti', ordine?.id],
    queryFn: async () => {
      const res = await fetch(`${API}/ordini/${ordine!.id}/lista-acquisti`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!ordine?.bom_esplosa,
  });

  // Mutation: conferma preventivo
  const confermaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/preventivi/${preventivoId}/conferma`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Errore conferma');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Ordine ${data.numero_ordine} creato!`);
      queryClient.invalidateQueries({ queryKey: ['ordini-preventivo'] });
      queryClient.invalidateQueries({ queryKey: ['preventivo'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Mutation: esplodi BOM
  const esplodiMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/ordini/${ordine!.id}/esplodi-bom`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Errore esplosione BOM');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`BOM esplosa: ${data.componenti_aggregati} componenti`);
      queryClient.invalidateQueries({ queryKey: ['ordini-preventivo'] });
      queryClient.invalidateQueries({ queryKey: ['esplosi'] });
      queryClient.invalidateQueries({ queryKey: ['lista-acquisti'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleCategoria = (cat: string) => {
    setExpandedCategorie(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  };

  const isConfermato = preventivo?.status === 'confermato';
  const canConferma = preventivo && ['draft', 'bozza', 'inviato'].includes(preventivo.status);

  // Raggruppa esplosi per tipo o categoria
  const raggruppati = (esplosiData?.esplosi || []).reduce((acc: Record<string, EsplosoItem[]>, item: EsplosoItem) => {
    const key = viewMode === 'tipo' ? (item.tipo || 'ALTRO') : (item.categoria || 'Altro');
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  // Colori per tipo
  const tipoColors: Record<string, string> = {
    MASTER: 'bg-blue-100 text-blue-800',
    SEMILAVORATO: 'bg-amber-100 text-amber-800',
    ACQUISTO: 'bg-green-100 text-green-800',
    ALTRO: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="space-y-4">
      {/* === STEP 1: Stato Preventivo === */}
      <div className="bg-white rounded-lg shadow p-5">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-indigo-600" />
          Ordine e Distinta Base
        </h2>

        {/* Timeline Steps */}
        <div className="flex items-center gap-3 mb-6">
          {/* Step 1: Preventivo */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            ${isConfermato || ordine ? 'bg-green-100 text-green-800' : 'bg-indigo-100 text-indigo-800'}`}>
            <FileText className="w-4 h-4" />
            Preventivo
            {(isConfermato || ordine) && <CheckCircle2 className="w-4 h-4" />}
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400" />

          {/* Step 2: Ordine */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            ${ordine ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            <Package className="w-4 h-4" />
            Ordine
            {ordine && <CheckCircle2 className="w-4 h-4" />}
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400" />

          {/* Step 3: BOM */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
            ${ordine?.bom_esplosa ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
            <Boxes className="w-4 h-4" />
            Distinta Esplosa
            {ordine?.bom_esplosa && <CheckCircle2 className="w-4 h-4" />}
          </div>
        </div>

        {/* Azione: Conferma Preventivo */}
        {canConferma && !ordine && (
          <div className="border border-indigo-200 bg-indigo-50/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">Conferma il preventivo per generare l'ordine</p>
                <p className="text-sm text-gray-600 mt-1">
                  Stato attuale: <span className="font-medium">{preventivo?.status}</span>
                  {' — '}Totale: <span className="font-bold">
                    {(preventivo?.total_price || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                  </span>
                </p>
              </div>
              <button
                onClick={() => confermaMutation.mutate()}
                disabled={confermaMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg
                  hover:bg-indigo-700 disabled:opacity-50 font-medium shadow-sm transition-colors"
              >
                {confermaMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Conferma Preventivo
              </button>
            </div>
          </div>
        )}

        {/* Info Ordine creato */}
        {ordine && (
          <div className="border border-green-200 bg-green-50/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-bold text-green-900 text-lg">{ordine.numero_ordine}</p>
                <div className="flex items-center gap-4 text-sm text-green-800">
                  <span>Stato: <strong>{ordine.stato}</strong></span>
                  <span>Lead time: <strong>{ordine.lead_time_giorni}gg</strong></span>
                  <span>Consegna: <strong>
                    {ordine.data_consegna_prevista
                      ? new Date(ordine.data_consegna_prevista).toLocaleDateString('it-IT')
                      : '-'}
                  </strong></span>
                  {ordine.cliente && <span>Cliente: <strong>{ordine.cliente}</strong></span>}
                </div>
              </div>

              {/* Pulsante Esplodi BOM */}
              {!ordine.bom_esplosa && (
                <button
                  onClick={() => esplodiMutation.mutate()}
                  disabled={esplodiMutation.isPending}
                  className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white rounded-lg
                    hover:bg-amber-700 disabled:opacity-50 font-medium shadow-sm transition-colors"
                >
                  {esplodiMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Boxes className="w-4 h-4" />
                  )}
                  Esplodi Distinta Base
                </button>
              )}

              {/* Ri-esplodi */}
              {ordine.bom_esplosa && (
                <button
                  onClick={() => esplodiMutation.mutate()}
                  disabled={esplodiMutation.isPending}
                  className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 text-gray-700
                    rounded-lg hover:bg-gray-50 text-sm transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${esplodiMutation.isPending ? 'animate-spin' : ''}`} />
                  Ri-esplodi
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* === STEP 2: Distinta Esplosa === */}
      {ordine?.bom_esplosa && esplosiData && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Boxes className="w-5 h-5 text-amber-600" />
                Distinta Base Esplosa
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {esplosiData.totale_componenti} componenti — Costo totale:{' '}
                <strong>{(esplosiData.costo_totale || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}</strong>
              </p>
            </div>
            {/* Tabs visualizzazione */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              {(['tipo', 'categoria'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                    ${viewMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Per {mode === 'tipo' ? 'Tipo' : 'Categoria'}
                </button>
              ))}
            </div>
          </div>

          {/* Tabella raggruppata */}
          <div className="divide-y">
            {Object.entries(raggruppati).sort().map(([gruppo, items]) => (
              <div key={gruppo}>
                {/* Header gruppo */}
                <button
                  onClick={() => toggleCategoria(gruppo)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  {expandedCategorie.has(gruppo)
                    ? <ChevronDown className="w-4 h-4 text-gray-500" />
                    : <ChevronRight className="w-4 h-4 text-gray-500" />}
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${tipoColors[gruppo] || 'bg-gray-100 text-gray-700'}`}>
                    {gruppo}
                  </span>
                  <span className="text-sm text-gray-700 font-medium">
                    {(items as EsplosoItem[]).length} componenti
                  </span>
                  <span className="text-sm text-gray-500 ml-auto">
                    {(items as EsplosoItem[]).reduce((s, i) => s + (i.costo_totale || 0), 0)
                      .toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                  </span>
                </button>

                {/* Righe dettaglio */}
                {expandedCategorie.has(gruppo) && (
                  <div className="bg-gray-50/50">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase border-b">
                          <th className="px-5 py-2 text-left">Codice</th>
                          <th className="px-3 py-2 text-left">Descrizione</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">UM</th>
                          <th className="px-3 py-2 text-right">Costo Unit.</th>
                          <th className="px-3 py-2 text-right">Totale</th>
                          <th className="px-3 py-2 text-right">LT gg</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {(items as EsplosoItem[]).map((item, idx) => (
                          <tr key={`${item.codice}-${idx}`} className="hover:bg-white/80">
                            <td className="px-5 py-2 font-mono text-xs font-medium text-gray-800">
                              {'  '.repeat(item.livello_esplosione || 0)}{item.codice}
                            </td>
                            <td className="px-3 py-2 text-gray-700">{item.descrizione}</td>
                            <td className="px-3 py-2 text-right font-medium">{item.quantita}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{item.unita_misura}</td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {(item.costo_unitario || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {(item.costo_totale || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                            </td>
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

      {/* === STEP 3: Lista Acquisti per Fornitore === */}
      {listaAcquisti && Object.keys(listaAcquisti.fornitori || {}).length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-5 py-4 border-b">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Truck className="w-5 h-5 text-green-600" />
              Lista Acquisti per Fornitore
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {listaAcquisti.num_fornitori} fornitori — Totale acquisti:{' '}
              <strong>
                {(listaAcquisti.costo_totale_acquisti || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
              </strong>
            </p>
          </div>

          <div className="divide-y">
            {Object.entries(listaAcquisti.fornitori as Record<string, any>).map(([fornitore, data]) => (
              <div key={fornitore}>
                <button
                  onClick={() => toggleCategoria(`f-${fornitore}`)}
                  className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  {expandedCategorie.has(`f-${fornitore}`)
                    ? <ChevronDown className="w-4 h-4 text-gray-500" />
                    : <ChevronRight className="w-4 h-4 text-gray-500" />}
                  <Truck className="w-4 h-4 text-green-600" />
                  <span className="font-medium text-gray-900">{fornitore}</span>
                  <span className="text-xs text-gray-500">{data.num_articoli} articoli</span>
                  <span className="text-sm font-medium text-gray-700 ml-auto">
                    {(data.totale || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                  </span>
                </button>

                {expandedCategorie.has(`f-${fornitore}`) && (
                  <div className="bg-gray-50/50 px-5 pb-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase border-b">
                          <th className="py-2 text-left">Codice</th>
                          <th className="py-2 text-left">Cod. Fornitore</th>
                          <th className="py-2 text-left">Descrizione</th>
                          <th className="py-2 text-right">Qty</th>
                          <th className="py-2 text-right">Costo</th>
                          <th className="py-2 text-right">LT gg</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {data.articoli.map((art: any, idx: number) => (
                          <tr key={idx} className="hover:bg-white/80">
                            <td className="py-2 font-mono text-xs">{art.codice}</td>
                            <td className="py-2 text-xs text-gray-600">{art.codice_fornitore || '-'}</td>
                            <td className="py-2 text-gray-700">{art.descrizione}</td>
                            <td className="py-2 text-right font-medium">{art.quantita}</td>
                            <td className="py-2 text-right">
                              {(art.costo_totale || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}
                            </td>
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

      {/* Empty state */}
      {!ordine && !canConferma && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900">Preventivo non confermabile</p>
            <p className="text-sm text-amber-700 mt-1">
              Stato attuale: <strong>{preventivo?.status || 'sconosciuto'}</strong>.
              Solo preventivi in stato "draft" o "inviato" possono essere confermati.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
