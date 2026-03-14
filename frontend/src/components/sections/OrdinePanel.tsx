/**
 * OrdinePanel.tsx - Flusso Preventivo → Ordine → BOM + Macchina a Stati
 * Con tracciamento revisioni, auto-snapshot, conflict dialogs, filiera compatta,
 * transizioni stato, storico timeline
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CheckCircle2, Package, Loader2, AlertTriangle,
  ArrowRight, Boxes, Truck, ChevronDown, ChevronRight,
  ClipboardList, FileText, History,
  Tag, Percent, RotateCcw, Plus, Eye, RefreshCw, X, GitBranch,
  PauseCircle, PlayCircle, XCircle, Settings, PackageCheck,
  Clock, User, MessageSquare, ArrowDown, ShoppingCart, Send, AlertCircle, CheckCircle
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL ?? '';
const fmt = (n: number) => n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });

// --- Types ---
interface MaterialeItem {
  id: number; codice: string; descrizione: string;
  quantita: number; prezzo_unitario: number; prezzo_totale: number;
  aggiunto_da_regola: boolean;
}
interface ClienteInfo {
  id: number; ragione_sociale: string; codice: string;
  sconto_produzione?: number; sconto_acquisto?: number;
}
interface OrdineInfo {
  id: number; numero_ordine: string; stato: string; tipo_impianto: string;
  totale_materiali: number; totale_netto: number;
  lead_time_giorni: number; data_consegna_prevista: string;
  bom_esplosa: boolean; created_at: string; preventivo_id: number;
  revisione_id?: number; numero_revisione_origine?: number;
  bom_revisione_id?: number; bom_numero_revisione?: number; bom_esplosa_at?: string;
  outdated?: boolean; revisioni_dietro?: number;
  bom_outdated?: boolean; bom_revisioni_dietro?: number;
  stato_precedente?: string;
}
interface RevisioneInfo {
  id: number; preventivo_id: number; numero_revisione: number;
  motivo: string; created_by: string; created_at: string;
}
interface EsplosoItem {
  codice: string; descrizione: string; tipo: string; categoria: string;
  quantita: number; unita_misura: string; costo_unitario: number;
  costo_totale: number; livello_esplosione: number; lead_time_giorni: number;
}
interface FilieraData {
  preventivo: any;
  ordini: OrdineInfo[];
  revisione_corrente: number;
}
interface TransizioneDisponibile {
  stato_a: string;
  etichetta: string;
  stile: string;
  icona: string;
  tipo: 'avanza' | 'sospendi' | 'annulla' | 'resume';
  richiede_note: boolean;
  bloccata?: boolean;
  motivo_blocco?: string;
}
interface TransizioniResponse {
  ordine_id: number;
  stato_corrente: string;
  stato_info: any;
  stato_precedente?: string;
  transizioni: TransizioneDisponibile[];
}
interface StoricoEntry {
  id: number;
  stato_da: string;
  stato_a: string;
  note: string;
  created_by: string;
  created_at: string;
  stato_a_info: any;
  stato_da_info: any;
}

// --- Icone per stati ---
const STATO_ICONE: Record<string, React.ReactNode> = {
  'confermato': <CheckCircle2 className="w-4 h-4" />,
  'in_produzione': <Settings className="w-4 h-4" />,
  'completato': <PackageCheck className="w-4 h-4" />,
  'spedito': <Truck className="w-4 h-4" />,
  'fatturato': <FileText className="w-4 h-4" />,
  'sospeso': <PauseCircle className="w-4 h-4" />,
  'annullato': <XCircle className="w-4 h-4" />,
  '__resume__': <PlayCircle className="w-4 h-4" />,
};

// Colori badge stato
const STATO_BADGE: Record<string, string> = {
  'confermato': 'bg-indigo-100 text-indigo-800',
  'in_produzione': 'bg-amber-100 text-amber-800',
  'completato': 'bg-emerald-100 text-emerald-800',
  'spedito': 'bg-blue-100 text-blue-800',
  'fatturato': 'bg-violet-100 text-violet-800',
  'sospeso': 'bg-red-100 text-red-800',
  'annullato': 'bg-gray-200 text-gray-600',
};

// Colori bordo card ordine
const STATO_CARD_BORDER: Record<string, string> = {
  'confermato': 'border-indigo-200 bg-indigo-50',
  'in_produzione': 'border-amber-200 bg-amber-50',
  'completato': 'border-emerald-200 bg-emerald-50',
  'spedito': 'border-blue-200 bg-blue-50',
  'fatturato': 'border-violet-200 bg-violet-50',
  'sospeso': 'border-red-200 bg-red-50',
  'annullato': 'border-gray-300 bg-gray-50',
};

// Label stato per display
const STATO_LABEL: Record<string, string> = {
  'confermato': 'Confermato',
  'in_produzione': 'In Produzione',
  'completato': 'Completato',
  'spedito': 'Spedito',
  'fatturato': 'Fatturato',
  'sospeso': 'Sospeso',
  'annullato': 'Annullato',
};

// --- Conflict Dialog ---
function ConflictDialog({ open, title, children, onClose }: {
  open: boolean; title: string; children: React.ReactNode; onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            {title}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// --- Filiera Compatta ---
function FilieraCompatta({ filiera, revCorrente }: { filiera: FilieraData | null; revCorrente: number }) {
  if (!filiera) return null;
  const ordine = filiera.ordini?.[0];
  const hasBom = ordine?.bom_esplosa;

  const prevColor = ordine ? 'bg-green-100 text-green-800 border-green-300' : 'bg-indigo-100 text-indigo-800 border-indigo-300';
  const ordColor = ordine
    ? ordine.outdated
      ? 'bg-amber-100 text-amber-800 border-amber-300'
      : 'bg-green-100 text-green-800 border-green-300'
    : 'bg-gray-100 text-gray-400 border-gray-200';
  const bomColor = hasBom
    ? ordine?.bom_outdated
      ? 'bg-amber-100 text-amber-800 border-amber-300'
      : 'bg-green-100 text-green-800 border-green-300'
    : 'bg-gray-100 text-gray-400 border-gray-200';

  return (
    <div className="flex items-stretch gap-2 text-xs">
      {/* PREVENTIVO */}
      <div className={`flex-1 border rounded-lg p-3 ${prevColor}`}>
        <div className="flex items-center gap-1.5 font-bold mb-1">
          <FileText className="w-3.5 h-3.5" /> PREVENTIVO
          {ordine && <CheckCircle2 className="w-3.5 h-3.5" />}
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center gap-1">
            <GitBranch className="w-3 h-3" /> REV.{revCorrente}
          </div>
        </div>
      </div>

      <ArrowRight className="w-4 h-4 text-gray-300 self-center flex-shrink-0" />

      {/* ORDINE */}
      <div className={`flex-1 border rounded-lg p-3 ${ordColor}`}>
        <div className="flex items-center gap-1.5 font-bold mb-1">
          <Package className="w-3.5 h-3.5" /> ORDINE
          {ordine && !ordine.outdated && <CheckCircle2 className="w-3.5 h-3.5" />}
          {ordine?.outdated && <AlertTriangle className="w-3.5 h-3.5" />}
        </div>
        {ordine ? (
          <div className="space-y-0.5">
            <div className="font-mono font-medium">{ordine.numero_ordine}</div>
            <div className="flex items-center gap-1">
              <GitBranch className="w-3 h-3" /> da REV.{ordine.numero_revisione_origine || '?'}
            </div>
            {ordine.outdated && (
              <div className="text-amber-700 font-medium">
                +{ordine.revisioni_dietro} rev dopo
              </div>
            )}
            {/* Badge stato nell'ordine */}
            <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold mt-1 ${STATO_BADGE[ordine.stato] || 'bg-gray-100 text-gray-600'}`}>
              {STATO_ICONE[ordine.stato]} {STATO_LABEL[ordine.stato] || ordine.stato}
            </div>
          </div>
        ) : (
          <div className="text-gray-400 italic">Non generato</div>
        )}
      </div>

      <ArrowRight className="w-4 h-4 text-gray-300 self-center flex-shrink-0" />

      {/* BOM */}
      <div className={`flex-1 border rounded-lg p-3 ${bomColor}`}>
        <div className="flex items-center gap-1.5 font-bold mb-1">
          <Boxes className="w-3.5 h-3.5" /> BOM
          {hasBom && !ordine?.bom_outdated && <CheckCircle2 className="w-3.5 h-3.5" />}
          {ordine?.bom_outdated && <AlertTriangle className="w-3.5 h-3.5" />}
        </div>
        {hasBom ? (
          <div className="space-y-0.5">
            <div className="flex items-center gap-1">
              <GitBranch className="w-3 h-3" /> da REV.{ordine?.bom_numero_revisione || '?'}
            </div>
            {ordine?.bom_outdated && (
              <div className="text-amber-700 font-medium">
                +{ordine.bom_revisioni_dietro} rev dopo
              </div>
            )}
            {ordine?.bom_esplosa_at && (
              <div className="text-[10px] opacity-70">
                {new Date(ordine.bom_esplosa_at).toLocaleDateString('it-IT')}
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 italic">Non esplosa</div>
        )}
      </div>
    </div>
  );
}


// ========================================================
// COMPONENTE: Barra Transizioni Stato
// ========================================================
function StatoTransizioniBar({ ordine, onTransizione }: {
  ordine: OrdineInfo;
  onTransizione: () => void;
}) {
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [pendingTransizione, setPendingTransizione] = useState<TransizioneDisponibile | null>(null);
  const [isChanging, setIsChanging] = useState(false);

  const { data: transizioniData, refetch: refetchTransizioni } = useQuery<TransizioniResponse>({
    queryKey: ['transizioni', ordine.id],
    queryFn: async () => { const r = await fetch(`${API}/ordini/${ordine.id}/transizioni`); return r.ok ? r.json() : null; },
    enabled: !!ordine.id,
  });

  const cambiaStatoMutation = useMutation({
    mutationFn: async ({ stato_nuovo, note }: { stato_nuovo: string; note?: string }) => {
      const r = await fetch(`${API}/ordini/${ordine.id}/stato`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stato_nuovo, note }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Errore cambio stato'); }
      return r.json();
    },
    onSuccess: (data) => {
      const label = STATO_LABEL[data.stato_nuovo] || data.stato_nuovo;
      toast.success(`Ordine → ${label}`);
      setNoteDialogOpen(false);
      setNoteText('');
      setPendingTransizione(null);
      onTransizione();
      refetchTransizioni();
    },
    onError: (err: Error) => {
      toast.error(err.message);
      setIsChanging(false);
    },
  });

  const handleClickTransizione = (t: TransizioneDisponibile) => {
    if (t.bloccata) {
      toast.error(t.motivo_blocco || 'Transizione non disponibile');
      return;
    }
    if (t.richiede_note) {
      setPendingTransizione(t);
      setNoteText('');
      setNoteDialogOpen(true);
    } else {
      if (t.tipo === 'annulla') {
        // Conferma extra per annullamento
        if (!confirm('Sei sicuro di voler annullare questo ordine?')) return;
      }
      setIsChanging(true);
      cambiaStatoMutation.mutate({ stato_nuovo: t.stato_a });
    }
  };

  const handleConfirmWithNote = () => {
    if (!pendingTransizione) return;
    if (pendingTransizione.richiede_note && !noteText.trim()) {
      toast.error('Inserisci una nota per questa transizione');
      return;
    }
    setIsChanging(true);
    cambiaStatoMutation.mutate({ stato_nuovo: pendingTransizione.stato_a, note: noteText.trim() });
  };

  if (!transizioniData) return null;

  const transizioni = transizioniData.transizioni || [];
  const avanzamento = transizioni.filter(t => t.tipo === 'avanza' || t.tipo === 'resume');
  const azioni = transizioni.filter(t => t.tipo === 'sospendi' || t.tipo === 'annulla');

  const stato = ordine.stato;
  const isTerminale = stato === 'fatturato' || stato === 'annullato';

  return (
    <>
      {/* Barra Stato + Azioni */}
      <div className="border-t pt-3 mt-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Stato corrente */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium uppercase">Stato:</span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${STATO_BADGE[stato] || 'bg-gray-100 text-gray-700'}`}>
              {STATO_ICONE[stato]} {STATO_LABEL[stato] || stato}
            </span>
            {stato === 'sospeso' && ordine.stato_precedente && (
              <span className="text-xs text-red-600">(era: {STATO_LABEL[ordine.stato_precedente] || ordine.stato_precedente})</span>
            )}
          </div>

          {/* Bottoni transizione */}
          {!isTerminale && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Avanzamento principale */}
              {avanzamento.map(t => (
                <button key={t.stato_a} onClick={() => handleClickTransizione(t)}
                  disabled={cambiaStatoMutation.isPending || t.bloccata}
                  title={t.bloccata ? t.motivo_blocco : ''}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${t.stile}`}>
                  {cambiaStatoMutation.isPending && isChanging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : (STATO_ICONE[t.stato_a] || STATO_ICONE[t.icona])}
                  {t.etichetta}
                </button>
              ))}

              {/* Separatore */}
              {avanzamento.length > 0 && azioni.length > 0 && (
                <div className="w-px h-6 bg-gray-300" />
              )}

              {/* Sospendi / Annulla */}
              {azioni.map(t => (
                <button key={t.stato_a} onClick={() => handleClickTransizione(t)}
                  disabled={cambiaStatoMutation.isPending}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${t.stile}`}>
                  {STATO_ICONE[t.stato_a]} {t.etichetta}
                </button>
              ))}
            </div>
          )}

          {isTerminale && (
            <span className="text-xs text-gray-400 italic">Stato finale — nessuna transizione disponibile</span>
          )}
        </div>
      </div>

      {/* Dialog note per sospeso/annullato */}
      <ConflictDialog open={noteDialogOpen} title={pendingTransizione?.etichetta || 'Conferma'} onClose={() => { setNoteDialogOpen(false); setPendingTransizione(null); }}>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            {pendingTransizione?.tipo === 'sospendi'
              ? "L'ordine verrà sospeso. Potrai riprenderlo dallo stato attuale in qualsiasi momento."
              : "L'ordine verrà annullato. Questa azione non è reversibile."
            }
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo {pendingTransizione?.richiede_note ? '(obbligatorio)' : '(opzionale)'}
            </label>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
              placeholder="Inserisci il motivo..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
              rows={3} autoFocus />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => { setNoteDialogOpen(false); setPendingTransizione(null); }}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
              Annulla
            </button>
            <button onClick={handleConfirmWithNote}
              disabled={cambiaStatoMutation.isPending || (pendingTransizione?.richiede_note && !noteText.trim())}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg disabled:opacity-50 ${
                pendingTransizione?.tipo === 'annulla' ? 'bg-gray-700 text-white hover:bg-gray-800' : 'bg-red-600 text-white hover:bg-red-700'
              }`}>
              {cambiaStatoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (pendingTransizione?.tipo === 'annulla' ? <XCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />)}
              Conferma
            </button>
          </div>
        </div>
      </ConflictDialog>
    </>
  );
}


// ========================================================
// COMPONENTE: Timeline Storico Stati
// ========================================================
function StoricoStatiTimeline({ ordineId }: { ordineId: number }) {
  const [expanded, setExpanded] = useState(false);

  const { data } = useQuery<{ storico: StoricoEntry[] }>({
    queryKey: ['storico-stati', ordineId],
    queryFn: async () => { const r = await fetch(`${API}/ordini/${ordineId}/storico-stati`); return r.ok ? r.json() : { storico: [] }; },
    enabled: !!ordineId,
  });

  const storico = data?.storico || [];
  if (storico.length === 0) return null;

  return (
    <div className="mt-3">
      <button onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 font-medium">
        <Clock className="w-3.5 h-3.5" />
        Storico transizioni ({storico.length})
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="mt-2 ml-1 border-l-2 border-gray-200 pl-4 space-y-0">
          {storico.map((entry, idx) => {
            const isLast = idx === storico.length - 1;
            const badgeClass = STATO_BADGE[entry.stato_a] || 'bg-gray-100 text-gray-600';
            return (
              <div key={entry.id} className="relative pb-3">
                {/* Dot */}
                <div className={`absolute -left-[22px] top-1 w-3 h-3 rounded-full border-2 border-white ${
                  isLast ? 'bg-indigo-500' : 'bg-gray-300'
                }`} />
                {/* Content */}
                <div className="text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-bold ${badgeClass}`}>
                      {STATO_ICONE[entry.stato_a]} {STATO_LABEL[entry.stato_a] || entry.stato_a}
                    </span>
                    {entry.stato_da !== 'nuovo' && (
                      <span className="text-gray-400">da {STATO_LABEL[entry.stato_da] || entry.stato_da}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {entry.created_at ? new Date(entry.created_at).toLocaleString('it-IT') : '-'}
                    </span>
                    {entry.created_by && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" /> {entry.created_by}
                      </span>
                    )}
                  </div>
                  {entry.note && (
                    <div className="flex items-start gap-1 mt-1 text-gray-600 bg-gray-50 rounded px-2 py-1">
                      <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{entry.note}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ========================================================
// COMPONENTE PRINCIPALE
// ========================================================
export default function OrdinePanel() {
  const { id } = useParams<{ id: string }>();
  const preventivoId = parseInt(id || '0', 10);
  const queryClient = useQueryClient();
  const [expandedCategorie, setExpandedCategorie] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'tipo' | 'categoria'>('tipo');
  const [scontoExtra, setScontoExtra] = useState<number>(0);
  const [showRevisioni, setShowRevisioni] = useState(false);
  const [revisioneDettaglio, setRevisioneDettaglio] = useState<any>(null);

  // Conflict dialogs
  const [showOrdineConflict, setShowOrdineConflict] = useState(false);
  const [conflictOrdini, setConflictOrdini] = useState<OrdineInfo[]>([]);
  const [showBomConflict, setShowBomConflict] = useState(false);
  const [bomConflictInfo, setBomConflictInfo] = useState<any>(null);

  // Auto-snapshot on unmount
  const prevIdRef = useRef(preventivoId);
  useEffect(() => {
    prevIdRef.current = preventivoId;
  }, [preventivoId]);

  useEffect(() => {
    return () => {
      const pid = prevIdRef.current;
      if (pid > 0) {
        fetch(`${API}/preventivi/${pid}/auto-snapshot`, { method: 'POST' }).catch(() => {});
      }
    };
  }, []);

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

  const { data: filiera, refetch: refetchFiliera } = useQuery<FilieraData>({
    queryKey: ['filiera', preventivoId],
    queryFn: async () => { const r = await fetch(`${API}/preventivi/${preventivoId}/filiera`); return r.ok ? r.json() : null; },
    enabled: preventivoId > 0,
  });

  const ordini = filiera?.ordini || [];
  const ordine = ordini.length > 0 ? ordini[0] : null;
  const revCorrente = filiera?.revisione_corrente || preventivo?.revisione_corrente || 0;

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

  const { data: odaOrdine, refetch: refetchOda } = useQuery({
    queryKey: ['oda-ordine', ordine?.id],
    queryFn: async () => {
      const r = await fetch(`${API}/oda?ordine_id=${ordine!.id}&limit=50`);
      return r.ok ? r.json() : null;
    },
    enabled: !!ordine?.bom_esplosa,
  });

  const [showOdaDialog, setShowOdaDialog]     = useState(false);
  const [odaCheckData, setOdaCheckData]       = useState<any>(null);
  const [odaAzioni, setOdaAzioni]             = useState<Record<string, string>>({});
  const [odaLoading, setOdaLoading]           = useState(false);
  const [invioEmailOdaId, setInvioEmailOdaId]         = useState<number | null>(null);
  const [noteEmail, setNoteEmail]                     = useState('');
  const [emailOverride, setEmailOverride]             = useState('');
  const [emailOdaMancante, setEmailOdaMancante]       = useState(false);

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

  // --- Invalidate all ---
  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['filiera'] });
    queryClient.invalidateQueries({ queryKey: ['preventivo'] });
    queryClient.invalidateQueries({ queryKey: ['revisioni'] });
    queryClient.invalidateQueries({ queryKey: ['materiali'] });
    queryClient.invalidateQueries({ queryKey: ['esplosi'] });
    queryClient.invalidateQueries({ queryKey: ['lista-acquisti'] });
    queryClient.invalidateQueries({ queryKey: ['oda-ordine'] });
    queryClient.invalidateQueries({ queryKey: ['transizioni'] });
    queryClient.invalidateQueries({ queryKey: ['storico-stati'] });
  }, [queryClient]);

  // --- Mutations ---

  const handleConferma = async () => {
    try {
      const r = await fetch(`${API}/preventivi/${preventivoId}/conferma`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check' }),
      });
      const data = await r.json();

      if (data.existing_ordini && data.existing_ordini.length > 0) {
        setConflictOrdini(data.existing_ordini);
        setShowOrdineConflict(true);
      } else {
        doConferma('new');
      }
    } catch (err: any) {
      toast.error(err.message || 'Errore check ordine');
    }
  };

  const confermaMutation = useMutation({
    mutationFn: async ({ action, ordine_id }: { action: string; ordine_id?: number }) => {
      const r = await fetch(`${API}/preventivi/${preventivoId}/conferma`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ordine_id }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Errore conferma'); }
      return r.json();
    },
    onSuccess: (data) => {
      const msg = data.status === 'aggiornato'
        ? `Ordine ${data.numero_ordine} aggiornato a REV.${data.revisione_origine}!`
        : `Ordine ${data.numero_ordine} creato (REV.${data.revisione_origine})!`;
      toast.success(msg);
      setShowOrdineConflict(false);
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const doConferma = (action: string, ordine_id?: number) => {
    confermaMutation.mutate({ action, ordine_id });
  };

  const handleEsplodiBom = async () => {
    if (!ordine) return;
    if (ordine.bom_esplosa) {
      try {
        const r = await fetch(`${API}/ordini/${ordine.id}/esplodi-bom`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check' }),
        });
        const data = await r.json();
        setBomConflictInfo(data);
        setShowBomConflict(true);
      } catch (err: any) {
        toast.error(err.message);
      }
    } else {
      doEsplodiBom();
    }
  };

  const esplodiMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/ordini/${ordine!.id}/esplodi-bom`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'esplodi' }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Errore BOM'); }
      return r.json();
    },
    onSuccess: (data) => {
      toast.success(`BOM esplosa: ${data.componenti_aggregati} componenti (REV.${data.revisione_bom || '?'})`);
      setShowBomConflict(false);
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const doEsplodiBom = () => esplodiMutation.mutate();

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
      invalidateAll();
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
      invalidateAll();
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
  const canRiconferma = isConfermato && ordine;
  const missingCliente = !preventivo?.cliente_id;

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

      {/* === FILIERA COMPATTA === */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-indigo-500" /> Filiera Preventivo
          </h2>
          <button onClick={() => refetchFiliera()} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
        <FilieraCompatta filiera={filiera || null} revCorrente={revCorrente} />
      </div>

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
            {revCorrente > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-600 text-white">
                REV.{revCorrente}
              </span>
            )}
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
                {revisioni.map(rev => {
                  const ordineFromRev = ordini.find(o => o.numero_revisione_origine === rev.numero_revisione);
                  const bomFromRev = ordini.find(o => o.bom_numero_revisione === rev.numero_revisione);

                  return (
                    <div key={rev.id} className={`flex items-center justify-between rounded-lg px-4 py-2.5 text-sm ${
                      revCorrente === rev.numero_revisione
                        ? 'bg-purple-50 border border-purple-200'
                        : 'bg-gray-50'
                    }`}>
                      <div className="flex items-center gap-3">
                        <span className="bg-purple-200 text-purple-800 font-bold text-xs w-7 h-7 rounded-full flex items-center justify-center">
                          #{rev.numero_revisione}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-800">{rev.motivo || 'Revisione'}</span>
                            {ordineFromRev && (
                              <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                                ORD
                              </span>
                            )}
                            {bomFromRev && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                                BOM
                              </span>
                            )}
                          </div>
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
                  );
                })}
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

        {/* Avviso cliente mancante */}
        {missingCliente && (canConferma || canRiconferma) && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-red-900">Cliente non selezionato</p>
              <p className="text-sm text-red-700 mt-1">Seleziona un cliente nella sezione Dati Commessa prima di confermare il preventivo.</p>
            </div>
          </div>
        )}

        {/* Conferma: nuovo ordine (primo) */}
        {canConferma && !ordine && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-indigo-800 mb-3">
              Totale netto: <strong>{fmt(totaleFinale)}</strong>
              {scontoCliente > 0 && <span className="text-indigo-500 ml-2">(listino {fmt(subtotale)} - {scontoCliente}%{scontoExtra > 0 ? ` - ${scontoExtra}%` : ''})</span>}
            </p>
            <button onClick={handleConferma} disabled={confermaMutation.isPending || missingCliente}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium">
              {confermaMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Conferma Preventivo e Genera Ordine
            </button>
          </div>
        )}

        {/* Ordine esistente outdated — pulsante aggiorna */}
        {ordine?.outdated && (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-amber-900">
                  L'ordine {ordine.numero_ordine} e' stato creato dalla REV.{ordine.numero_revisione_origine || '?'}.
                  Il preventivo e' ora alla REV.{revCorrente} (+{ordine.revisioni_dietro} revisioni dopo).
                </p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => { setConflictOrdini([ordine]); setShowOrdineConflict(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium">
                    <RefreshCw className="w-4 h-4" /> Aggiorna ordine
                  </button>
                  <button onClick={handleConferma}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
                    <Plus className="w-4 h-4" /> Nuovo ordine
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Ordine info + Stato + Transizioni */}
        {ordine && (
          <div className={`border rounded-lg p-4 space-y-3 ${STATO_CARD_BORDER[ordine.stato] || 'border-green-200 bg-green-50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-gray-900 text-lg">{ordine.numero_ordine}</p>
                <p className="text-sm text-gray-600">
                  Confermato il {ordine.created_at ? new Date(ordine.created_at).toLocaleDateString('it-IT') : ''}
                  {ordine.numero_revisione_origine ? ` dalla REV.${ordine.numero_revisione_origine}` : ''}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1.5 ${STATO_BADGE[ordine.stato] || 'bg-green-200 text-green-800'}`}>
                {STATO_ICONE[ordine.stato]} {STATO_LABEL[ordine.stato] || ordine.stato}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div><span className="text-gray-500">Totale</span><p className="font-bold text-gray-900">{fmt(ordine.totale_netto || ordine.totale_materiali || 0)}</p></div>
              <div><span className="text-gray-500">Lead time</span><p className="font-bold text-gray-900">{ordine.lead_time_giorni || 15} giorni</p></div>
              <div><span className="text-gray-500">Consegna</span><p className="font-bold text-gray-900">{ordine.data_consegna_prevista ? new Date(ordine.data_consegna_prevista).toLocaleDateString('it-IT') : '-'}</p></div>
            </div>

            {/* BOM button */}
            {!ordine.bom_esplosa ? (
              <button onClick={handleEsplodiBom} disabled={esplodiMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium text-sm">
                {esplodiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Boxes className="w-4 h-4" />}
                Esplodi Distinta Base
              </button>
            ) : ordine.bom_outdated ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-amber-700">
                  BOM esplosa da REV.{ordine.bom_numero_revisione} (ora REV.{revCorrente})
                </span>
                <button onClick={handleEsplodiBom} disabled={esplodiMutation.isPending}
                  className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-xs font-medium">
                  <RefreshCw className="w-3.5 h-3.5" /> Riesplodi BOM
                </button>
              </div>
            ) : null}

            {/* === BARRA TRANSIZIONI STATO === */}
            <StatoTransizioniBar ordine={ordine} onTransizione={invalidateAll} />

            {/* === STORICO STATI TIMELINE === */}
            <StoricoStatiTimeline ordineId={ordine.id} />
          </div>
        )}

        {/* Confermato senza ordine */}
        {isConfermato && !ordine && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-indigo-800 mb-3">
              Il preventivo e' confermato ma non risulta nessun ordine associato.
              Totale netto: <strong>{fmt(totaleFinale)}</strong>
            </p>
            <button onClick={() => doConferma('new')} disabled={confermaMutation.isPending || missingCliente}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium">
              {confermaMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Genera Ordine
            </button>
          </div>
        )}

        {!ordine && !canConferma && !isConfermato && (
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

      {/* === ORDINI DI ACQUISTO === */}
      {ordine?.bom_esplosa && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-indigo-600" /> Ordini di Acquisto
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {odaOrdine?.totale ? `${odaOrdine.totale} ODA generati` : 'Nessun ODA generato'}
              </p>
            </div>
            <button
              onClick={async () => {
                setOdaLoading(true);
                try {
                  const r = await fetch(`${API}/oda/genera-da-bom/${ordine.id}/check`);
                  if (!r.ok) { const e = await r.json(); throw new Error(e.detail); }
                  const data = await r.json();
                  // Imposta azioni default: "crea" per nuovi, "salta" per conflitti
                  const azioniDefault: Record<string, string> = {};
                  for (const f of data.fornitori) {
                    azioniDefault[f.fornitore_nome] = f.conflitto ? 'salta' : 'crea';
                  }
                  setOdaAzioni(azioniDefault);
                  setOdaCheckData(data);
                  setShowOdaDialog(true);
                } catch (e: any) {
                  toast.error(e.message || 'Errore check ODA');
                } finally {
                  setOdaLoading(false);
                }
              }}
              disabled={odaLoading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
            >
              {odaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
              Genera ODA
            </button>
          </div>

          {/* Lista ODA esistenti */}
          {odaOrdine?.oda?.length > 0 && (
            <div className="divide-y">
              {odaOrdine.oda.map((oda: any) => {
                const STATO_COLOR: Record<string, string> = {
                  bozza:                 'bg-gray-100 text-gray-700',
                  inviato:               'bg-blue-100 text-blue-700',
                  parzialmente_ricevuto: 'bg-amber-100 text-amber-700',
                  ricevuto:              'bg-green-100 text-green-700',
                  chiuso:                'bg-gray-200 text-gray-600',
                  annullato:             'bg-red-100 text-red-600',
                };
                const STATO_LABEL: Record<string, string> = {
                  bozza:                 'Bozza',
                  inviato:               'Inviato',
                  parzialmente_ricevuto: 'Parz. ricevuto',
                  ricevuto:              'Ricevuto',
                  chiuso:                'Chiuso',
                  annullato:             'Annullato',
                };
                return (
                  <div key={oda.id} className="px-5 py-3 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-gray-900 text-sm">{oda.numero_oda}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATO_COLOR[oda.stato] || 'bg-gray-100'}`}>
                          {STATO_LABEL[oda.stato] || oda.stato}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 truncate">{oda.fornitore_denominazione}</p>
                      <p className="text-xs text-gray-400">{oda.n_righe} righe &middot; {fmt(oda.totale_oda || 0)}</p>
                    </div>
                    {/* Pulsante invio email */}
                    {['bozza', 'inviato'].includes(oda.stato) && (
                      <button
                        onClick={() => {
                          setInvioEmailOdaId(oda.id);
                          setNoteEmail('');
                          // Cerca email del fornitore nel check data (se disponibile)
                          const fCheck = odaCheckData?.fornitori?.find(
                            (f: any) => f.fornitore_nome === oda.fornitore_denominazione
                          );
                          const emailNota = fCheck?.fornitore_email || '';
                          setEmailOverride(emailNota);
                          setEmailOdaMancante(!emailNota);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-xs font-medium"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {oda.stato === 'inviato' ? 'Reinvia' : 'Invia email'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* === DIALOG: Genera ODA - Selezione azioni per fornitore === */}
      <ConflictDialog
        open={showOdaDialog}
        title="Genera Ordini di Acquisto"
        onClose={() => setShowOdaDialog(false)}
      >
        <div className="space-y-4">
          {odaCheckData?.fornitori?.map((f: any) => (
            <div key={f.fornitore_nome} className={`rounded-lg p-3 border ${f.conflitto ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{f.fornitore_nome}</p>
                  <p className="text-xs text-gray-500">{f.num_articoli} articoli &middot; {fmt(f.totale)}</p>
                  {!f.fornitore_email && (
                    <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Email non configurata — aggiornare anagrafica
                    </p>
                  )}
                  {f.conflitto && (
                    <p className="text-xs text-amber-700 mt-0.5">
                      ⚠️ ODA già esistente: {f.oda_esistente?.numero_oda} ({f.oda_esistente?.stato})
                    </p>
                  )}
                </div>
                <select
                  value={odaAzioni[f.fornitore_nome] || 'crea'}
                  onChange={e => setOdaAzioni(prev => ({ ...prev, [f.fornitore_nome]: e.target.value }))}
                  className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  {!f.conflitto && <option value="crea">Crea ODA</option>}
                  {f.conflitto && <option value="ricrea">Ricrea (elimina vecchio)</option>}
                  {f.conflitto && <option value="salta">Salta (mantieni esistente)</option>}
                  {!f.conflitto && <option value="salta">Salta</option>}
                </select>
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            <button
              onClick={async () => {
                setOdaLoading(true);
                try {
                  const fornitori = odaCheckData.fornitori.map((f: any) => ({
                    fornitore_nome: f.fornitore_nome,
                    azione: odaAzioni[f.fornitore_nome] || 'crea',
                  }));
                  const r = await fetch(`${API}/oda/genera-da-bom/${ordine!.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fornitori }),
                  });
                  if (!r.ok) { const e = await r.json(); throw new Error(e.detail); }
                  const data = await r.json();
                  toast.success(`${data.totale_creati} ODA generati`);
                  setShowOdaDialog(false);
                  refetchOda();
                } catch (e: any) {
                  toast.error(e.message || 'Errore generazione ODA');
                } finally {
                  setOdaLoading(false);
                }
              }}
              disabled={odaLoading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
            >
              {odaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
              Genera ODA
            </button>
            <button
              onClick={() => setShowOdaDialog(false)}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
            >
              Annulla
            </button>
          </div>
        </div>
      </ConflictDialog>

      {/* === DIALOG: Invio email ODA === */}
      <ConflictDialog
        open={invioEmailOdaId !== null}
        title="Invia ODA al fornitore"
        onClose={() => setInvioEmailOdaId(null)}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Verrà inviata un'email al fornitore con l'ODA in allegato (PDF).
            Lo stato dell'ODA passerà a <strong>Inviato</strong>.
          </p>

          {/* Campo email destinatario */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email destinatario
              {emailOdaMancante && (
                <span className="ml-2 text-amber-600 font-normal text-xs">⚠ non configurata in anagrafica</span>
              )}
            </label>
            <input
              type="email"
              value={emailOverride}
              onChange={e => setEmailOverride(e.target.value)}
              placeholder="fornitore@esempio.com"
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 ${
                emailOdaMancante && !emailOverride ? 'border-amber-400 bg-amber-50' : 'border-gray-300'
              }`}
            />
            {emailOdaMancante && (
              <p className="text-xs text-amber-600 mt-1">
                Inserisci l'email manualmente. Per salvare definitivamente, aggiorna l'anagrafica fornitore.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note aggiuntive (opzionale)</label>
            <textarea
              value={noteEmail}
              onChange={e => setNoteEmail(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500"
              placeholder="Testo aggiuntivo nel corpo dell'email..."
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                if (!emailOverride.trim()) {
                  toast.error('Inserire un indirizzo email destinatario');
                  return;
                }
                setOdaLoading(true);
                try {
                  const r = await fetch(`${API}/oda/${invioEmailOdaId}/invia-email`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      note_email: noteEmail,
                      email_override: emailOverride.trim(),
                    }),
                  });
                  if (!r.ok) { const e = await r.json(); throw new Error(e.detail); }
                  const data = await r.json();
                  toast.success(`Email inviata a ${data.email_dest}`);
                  setInvioEmailOdaId(null);
                  refetchOda();
                } catch (e: any) {
                  toast.error(e.message || 'Errore invio email');
                } finally {
                  setOdaLoading(false);
                }
              }}
              disabled={odaLoading || !emailOverride.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
            >
              {odaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Invia email
            </button>
            <button
              onClick={() => setInvioEmailOdaId(null)}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
            >
              Annulla
            </button>
          </div>
        </div>
      </ConflictDialog>

      {/* === DIALOG: Conflitto Ordine Esistente === */}
      <ConflictDialog open={showOrdineConflict} title="Ordine esistente" onClose={() => setShowOrdineConflict(false)}>
        <div className="space-y-4">
          {conflictOrdini.map(o => (
            <div key={o.id} className="bg-gray-50 rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900">{o.numero_ordine}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_BADGE[o.stato] || 'bg-green-100 text-green-800'}`}>
                  {STATO_LABEL[o.stato] || o.stato}
                </span>
              </div>
              <p className="text-gray-600 mt-1">
                Creato dalla REV.{o.numero_revisione_origine || '?'}
                {o.bom_esplosa && <span> &middot; BOM esplosa (REV.{o.bom_numero_revisione || '?'})</span>}
              </p>
            </div>
          ))}

          <p className="text-sm text-gray-700">
            Il preventivo e' ora alla <strong>REV.{revCorrente}</strong>. Come vuoi procedere?
          </p>

          <div className="flex flex-col gap-2">
            <button onClick={() => doConferma('update', conflictOrdini[0]?.id)}
              disabled={confermaMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium text-sm disabled:opacity-50">
              {confermaMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Aggiorna ordine esistente ({conflictOrdini[0]?.numero_ordine})
            </button>
            <button onClick={() => doConferma('new')}
              disabled={confermaMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm disabled:opacity-50">
              {confermaMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Crea nuovo ordine
            </button>
            <button onClick={() => setShowOrdineConflict(false)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm">
              <X className="w-4 h-4" /> Annulla
            </button>
          </div>
        </div>
      </ConflictDialog>

      {/* === DIALOG: Conflitto BOM === */}
      <ConflictDialog open={showBomConflict} title="BOM gia' esplosa" onClose={() => setShowBomConflict(false)}>
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="text-gray-700">
              La BOM e' stata esplosa dalla <strong>REV.{bomConflictInfo?.bom_numero_revisione || '?'}</strong>
              {bomConflictInfo?.bom_esplosa_at && (
                <span> il {new Date(bomConflictInfo.bom_esplosa_at).toLocaleDateString('it-IT')}</span>
              )}
            </p>
            <p className="text-gray-700 mt-1">
              Il preventivo e' ora alla <strong>REV.{bomConflictInfo?.revisione_corrente || revCorrente}</strong>.
              {bomConflictInfo?.outdated && (
                <span className="text-amber-700 font-medium"> La BOM non e' aggiornata.</span>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={doEsplodiBom}
              disabled={esplodiMutation.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 font-medium text-sm disabled:opacity-50">
              {esplodiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Riesplodi BOM dalla REV.{revCorrente}
            </button>
            <button onClick={() => setShowBomConflict(false)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm">
              <X className="w-4 h-4" /> Lascia BOM attuale
            </button>
          </div>
        </div>
      </ConflictDialog>

    </div>
  );
}
