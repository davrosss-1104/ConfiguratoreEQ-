/**
 * OrdinePanel.tsx - Flusso Preventivo → Ordine → BOM
 * Con tracciamento revisioni, auto-snapshot, conflict dialogs, filiera compatta,
 * macchina a stati ordine, timeline cambi stato, conferma d'ordine documento.
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
  Play, Ban, Receipt, Download,
  Clock, MessageSquare, Edit3, Save, XCircle
} from 'lucide-react';

const API = 'http://localhost:8000';
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
  note?: string; note_interne?: string;
  condizioni_pagamento?: string; condizioni_consegna?: string;
  riferimento_cliente?: string;
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
interface StoricoStatoItem {
  id: number; stato_precedente: string | null; stato_nuovo: string;
  motivo: string; utente: string; created_at: string;
}

// --- Configurazione stati ---
const STATO_CONFIG: Record<string, {
  label: string; color: string; bgClass: string; textClass: string;
  badgeClass: string; icon: React.ReactNode;
}> = {
  confermato: {
    label: 'Confermato', color: 'green',
    bgClass: 'bg-green-50 border-green-200',
    textClass: 'text-green-800',
    badgeClass: 'bg-green-200 text-green-800',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  in_produzione: {
    label: 'In Produzione', color: 'amber',
    bgClass: 'bg-amber-50 border-amber-200',
    textClass: 'text-amber-800',
    badgeClass: 'bg-amber-200 text-amber-800',
    icon: <Play className="w-4 h-4" />,
  },
  completato: {
    label: 'Completato', color: 'blue',
    bgClass: 'bg-blue-50 border-blue-200',
    textClass: 'text-blue-800',
    badgeClass: 'bg-blue-200 text-blue-800',
    icon: <CheckCircle2 className="w-4 h-4" />,
  },
  fatturato: {
    label: 'Fatturato', color: 'purple',
    bgClass: 'bg-purple-50 border-purple-200',
    textClass: 'text-purple-800',
    badgeClass: 'bg-purple-200 text-purple-800',
    icon: <Receipt className="w-4 h-4" />,
  },
  annullato: {
    label: 'Annullato', color: 'red',
    bgClass: 'bg-red-50 border-red-200',
    textClass: 'text-red-800',
    badgeClass: 'bg-red-200 text-red-800',
    icon: <Ban className="w-4 h-4" />,
  },
};

const TRANSIZIONI_AZIONI: Record<string, {
  label: string; color: string; icon: React.ReactNode; confirmMsg: string;
}> = {
  in_produzione: {
    label: 'Metti in Produzione', color: 'bg-amber-500 hover:bg-amber-600',
    icon: <Play className="w-4 h-4" />, confirmMsg: 'Confermi di voler mettere l\'ordine in produzione?',
  },
  completato: {
    label: 'Segna Completato', color: 'bg-blue-600 hover:bg-blue-700',
    icon: <CheckCircle2 className="w-4 h-4" />, confirmMsg: 'Confermi che l\'ordine è completato?',
  },
  fatturato: {
    label: 'Crea Fattura', color: 'bg-violet-600 hover:bg-violet-700',
    icon: <Receipt className="w-4 h-4" />, confirmMsg: 'Confermi che l\'ordine è stato fatturato?',
  },
  annullato: {
    label: 'Annulla Ordine', color: 'bg-red-500 hover:bg-red-600',
    icon: <Ban className="w-4 h-4" />, confirmMsg: 'ATTENZIONE: L\'annullamento è irreversibile. Confermi?',
  },
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

// --- Timeline Stati ---
function TimelineStati({ storico }: { storico: StoricoStatoItem[] }) {
  if (!storico || storico.length === 0) return null;
  return (
    <div className="relative pl-6 space-y-3">
      <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-gray-200" />
      {storico.map((item, idx) => {
        const config = STATO_CONFIG[item.stato_nuovo];
        const isLast = idx === storico.length - 1;
        return (
          <div key={item.id} className="relative flex items-start gap-3">
            <div className={`absolute -left-3.5 w-5 h-5 rounded-full border-2 flex items-center justify-center
              ${isLast
                ? `${config?.badgeClass || 'bg-gray-200 text-gray-700'} border-current`
                : 'bg-white border-gray-300 text-gray-400'
              }`}
              style={{ zIndex: 1 }}
            >
              <div className="w-2 h-2 rounded-full bg-current" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${config?.badgeClass || 'bg-gray-100 text-gray-600'}`}>
                  {config?.label || item.stato_nuovo}
                </span>
                {item.stato_precedente && (
                  <span className="text-[10px] text-gray-400">
                    da {STATO_CONFIG[item.stato_precedente]?.label || item.stato_precedente}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                <Clock className="w-3 h-3" />
                <span>{item.created_at ? new Date(item.created_at).toLocaleString('it-IT') : ''}</span>
                {item.utente && <span>- {item.utente}</span>}
              </div>
              {item.motivo && (
                <p className="text-xs text-gray-600 mt-0.5 flex items-start gap-1">
                  <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  {item.motivo}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- Filiera Compatta ---
function FilieraCompatta({ filiera, revCorrente }: { filiera: FilieraData | null; revCorrente: number }) {
  if (!filiera) return null;
  const ordine = filiera.ordini?.[0];
  const hasBom = ordine?.bom_esplosa;

  const prevColor = ordine ? 'bg-green-100 text-green-800 border-green-300' : 'bg-indigo-100 text-indigo-800 border-indigo-300';

  const statoConfig = ordine ? STATO_CONFIG[ordine.stato] : null;
  const ordColor = ordine
    ? ordine.outdated
      ? 'bg-amber-100 text-amber-800 border-amber-300'
      : (statoConfig ? `${statoConfig.bgClass} ${statoConfig.textClass}` : 'bg-green-100 text-green-800 border-green-300')
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
          {ordine && !ordine.outdated && statoConfig?.icon}
          {ordine?.outdated && <AlertTriangle className="w-3.5 h-3.5" />}
        </div>
        {ordine ? (
          <div className="space-y-0.5">
            <div className="font-mono font-medium">{ordine.numero_ordine}</div>
            <div className="flex items-center gap-1">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statoConfig?.badgeClass || 'bg-gray-200 text-gray-700'}`}>
                {statoConfig?.label || ordine.stato}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <GitBranch className="w-3 h-3" /> da REV.{ordine.numero_revisione_origine || '?'}
            </div>
            {ordine.outdated && (
              <div className="text-amber-700 font-medium">
                +{ordine.revisioni_dietro} rev dopo
              </div>
            )}
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


export default function OrdinePanel() {
  const { id } = useParams<{ id: string }>();
  const preventivoId = parseInt(id || '0', 10);
  const queryClient = useQueryClient();
  const [expandedCategorie, setExpandedCategorie] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'tipo' | 'categoria'>('tipo');
  const [scontoExtra, setScontoExtra] = useState<number>(0);
  const [showRevisioni, setShowRevisioni] = useState(false);
  const [revisioneDettaglio, setRevisioneDettaglio] = useState<any>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [noteForm, setNoteForm] = useState({ note: '', note_interne: '', condizioni_pagamento: '', condizioni_consegna: '', riferimento_cliente: '' });
  const [cambioStatoMotivo, setCambioStatoMotivo] = useState('');
  const [showCambioStatoDialog, setShowCambioStatoDialog] = useState<string | null>(null);
  const [showFatturaDialog, setShowFatturaDialog] = useState(false);
  const [selectedOrdiniIds, setSelectedOrdiniIds] = useState<number[]>([]);
  const [fatturaLoading, setFatturaLoading] = useState(false);
  const [fatturaError, setFatturaError] = useState('');

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

  // Storico stati ordine
  const { data: storicoStati } = useQuery<{ storico: StoricoStatoItem[] }>({
    queryKey: ['storico-stati', ordine?.id],
    queryFn: async () => { const r = await fetch(`${API}/ordini/${ordine!.id}/storico-stati`); return r.ok ? r.json() : { storico: [] }; },
    enabled: !!ordine,
  });

  useEffect(() => {
    if (preventivo?.sconto_extra_admin) setScontoExtra(preventivo.sconto_extra_admin);
  }, [preventivo]);

  // Inizializza form note quando ordine cambia
  useEffect(() => {
    if (ordine) {
      setNoteForm({
        note: ordine.note || '',
        note_interne: ordine.note_interne || '',
        condizioni_pagamento: ordine.condizioni_pagamento || '',
        condizioni_consegna: ordine.condizioni_consegna || '',
        riferimento_cliente: ordine.riferimento_cliente || '',
      });
    }
  }, [ordine?.id]);

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
    queryClient.invalidateQueries({ queryKey: ['storico-stati'] });
  }, [queryClient]);

  // --- Mutations ---

  // Conferma con check conflitto
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

  // Cambio stato ordine
  const cambioStatoMutation = useMutation({
    mutationFn: async ({ stato, motivo }: { stato: string; motivo: string }) => {
      const r = await fetch(`${API}/ordini/${ordine!.id}/stato`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stato, motivo, utente: 'admin' }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Errore cambio stato'); }
      return r.json();
    },
    onSuccess: (data) => {
      const statoLabel = STATO_CONFIG[data.stato_nuovo]?.label || data.stato_nuovo;
      toast.success(`Ordine ${data.numero_ordine} → ${statoLabel}`);
      setShowCambioStatoDialog(null);
      setCambioStatoMotivo('');
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Salva note/condizioni ordine
  const saveNoteMutation = useMutation({
    mutationFn: async (formData: typeof noteForm) => {
      const r = await fetch(`${API}/ordini/${ordine!.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || 'Errore salvataggio'); }
      return r.json();
    },
    onSuccess: () => {
      toast.success('Note e condizioni salvate');
      setEditingNote(false);
      invalidateAll();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Query ordini fatturabili dello stesso cliente (per dialog fattura multi-ordine)
  const { data: ordiniFatturabili, refetch: refetchOrdiniFatturabili } = useQuery({
    queryKey: ['ordini-fatturabili', clienteId],
    queryFn: async () => {
      const r = await fetch(`/api/fatturazione/ordini-fatturabili/${clienteId}`);
      if (!r.ok) return { ordini: [] };
      return r.json();
    },
    enabled: false, // caricato on-demand
  });

  // Apri dialog fattura: preseleziona ordine corrente e carica altri
  const openFatturaDialog = () => {
    if (!ordine || !clienteId) return;
    setSelectedOrdiniIds([ordine.id]);
    setFatturaError('');
    setShowFatturaDialog(true);
    refetchOrdiniFatturabili();
  };

  // Crea fattura da ordini selezionati
  const handleCreaFattura = async () => {
    if (selectedOrdiniIds.length === 0) return;
    setFatturaLoading(true);
    setFatturaError('');
    try {
      const r = await fetch('/api/fatturazione/fatture/da-ordini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordine_ids: selectedOrdiniIds }),
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.detail || 'Errore creazione fattura');
      }
      const data = await r.json();
      toast.success(`Fattura creata per ${data.totale_ordini} ordine/i`);
      setShowFatturaDialog(false);
      invalidateAll();
    } catch (err: any) {
      setFatturaError(err.message);
    } finally {
      setFatturaLoading(false);
    }
  };

  // Esplodi BOM con check conflitto
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

  // Download conferma d'ordine (link diretto, no CORS)
  const downloadConferma = () => {
    if (!ordine) return;
    window.open(`${API}/ordini/${ordine.id}/conferma-ordine/docx`, '_blank');
  };

  const isConfermato = preventivo?.status === 'confermato';
  const canConferma = preventivo && ['draft', 'bozza', 'inviato'].includes(preventivo.status);
  const canRiconferma = isConfermato && ordine;
  const missingCliente = !preventivo?.cliente_id;

  // Transizioni disponibili per lo stato corrente
  const statoAttuale = ordine?.stato || 'confermato';
  const transizioniDisponibili = ordine && ordine.stato !== 'annullato' && ordine.stato !== 'fatturato'
    ? (STATO_CONFIG[statoAttuale]?.color ? getTransizioniStato(statoAttuale) : [])
    : [];

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

        {/* ══════ ORDINE ESISTENTE ══════ */}
        {ordine && (
          <div className={`border rounded-lg overflow-hidden ${STATO_CONFIG[ordine.stato]?.bgClass || 'bg-green-50 border-green-200'}`}>
            {/* Header ordine con badge stato */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold text-gray-900 text-lg">{ordine.numero_ordine}</p>
                  <p className="text-sm text-gray-600">
                    Creato il {ordine.created_at ? new Date(ordine.created_at).toLocaleDateString('it-IT') : ''}
                    {ordine.numero_revisione_origine ? ` dalla REV.${ordine.numero_revisione_origine}` : ''}
                  </p>
                </div>
                <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase ${STATO_CONFIG[ordine.stato]?.badgeClass || 'bg-gray-200 text-gray-700'}`}>
                  {STATO_CONFIG[ordine.stato]?.icon}
                  {STATO_CONFIG[ordine.stato]?.label || ordine.stato}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-gray-500">Totale</span><p className="font-bold text-gray-900">{fmt(ordine.totale_netto || ordine.totale_materiali || 0)}</p></div>
                <div><span className="text-gray-500">Lead time</span><p className="font-bold text-gray-900">{ordine.lead_time_giorni || 15} giorni</p></div>
                <div><span className="text-gray-500">Consegna</span><p className="font-bold text-gray-900">{ordine.data_consegna_prevista ? new Date(ordine.data_consegna_prevista).toLocaleDateString('it-IT') : '-'}</p></div>
              </div>

              {/* ── Azioni stato ── */}
              <div className="flex flex-wrap items-center gap-2 mt-4 pt-3 border-t border-gray-200/50">
                {/* Download conferma d'ordine */}
                <button onClick={downloadConferma}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium shadow-sm">
                  <Download className="w-4 h-4" /> Conferma d'Ordine
                </button>

                {/* Pulsanti cambio stato */}
                {transizioniDisponibili.map(stato => {
                  const azione = TRANSIZIONI_AZIONI[stato];
                  if (!azione) return null;
                  const handleClick = stato === 'fatturato'
                    ? openFatturaDialog
                    : () => setShowCambioStatoDialog(stato);
                  return (
                    <button key={stato}
                      onClick={handleClick}
                      disabled={cambioStatoMutation.isPending}
                      className={`flex items-center gap-2 px-3 py-2 text-white rounded-lg text-sm font-medium shadow-sm ${azione.color} disabled:opacity-50`}
                    >
                      {cambioStatoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : azione.icon}
                      {azione.label}
                    </button>
                  );
                })}

                {/* BOM button */}
                {!ordine.bom_esplosa && ordine.stato !== 'annullato' && (
                  <button onClick={handleEsplodiBom} disabled={esplodiMutation.isPending}
                    className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 font-medium text-sm shadow-sm">
                    {esplodiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Boxes className="w-4 h-4" />}
                    Esplodi BOM
                  </button>
                )}
                {!!ordine.bom_esplosa && !!ordine.bom_outdated && (
                  <button onClick={handleEsplodiBom} disabled={esplodiMutation.isPending}
                    className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 text-sm font-medium shadow-sm">
                    <RefreshCw className="w-3.5 h-3.5" /> Riesplodi BOM
                  </button>
                )}
              </div>
            </div>

            {/* ── Note e condizioni ── */}
            <div className="border-t border-gray-200/50 bg-white/50 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-bold text-gray-700 flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5" /> Note e Condizioni
                </h4>
                {!editingNote ? (
                  <button onClick={() => setEditingNote(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                    <Edit3 className="w-3 h-3" /> Modifica
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => saveNoteMutation.mutate(noteForm)} disabled={saveNoteMutation.isPending}
                      className="text-xs text-green-600 hover:text-green-800 font-medium flex items-center gap-1">
                      {saveNoteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Salva
                    </button>
                    <button onClick={() => setEditingNote(false)}
                      className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                      <XCircle className="w-3 h-3" /> Annulla
                    </button>
                  </div>
                )}
              </div>

              {editingNote ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Rif. Cliente</label>
                    <input type="text" value={noteForm.riferimento_cliente}
                      onChange={e => setNoteForm(f => ({ ...f, riferimento_cliente: e.target.value }))}
                      className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400"
                      placeholder="Numero ordine/riferimento del cliente" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600">Condizioni Pagamento</label>
                      <input type="text" value={noteForm.condizioni_pagamento}
                        onChange={e => setNoteForm(f => ({ ...f, condizioni_pagamento: e.target.value }))}
                        className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400"
                        placeholder="Es: 30gg DFFM" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Condizioni Consegna</label>
                      <input type="text" value={noteForm.condizioni_consegna}
                        onChange={e => setNoteForm(f => ({ ...f, condizioni_consegna: e.target.value }))}
                        className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400"
                        placeholder="Es: Franco destino" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Note (visibili al cliente)</label>
                    <textarea value={noteForm.note}
                      onChange={e => setNoteForm(f => ({ ...f, note: e.target.value }))}
                      rows={2}
                      className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Note Interne (non visibili al cliente)</label>
                    <textarea value={noteForm.note_interne}
                      onChange={e => setNoteForm(f => ({ ...f, note_interne: e.target.value }))}
                      rows={2}
                      className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-1 focus:ring-indigo-400 bg-yellow-50" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {noteForm.riferimento_cliente && (
                    <div className="col-span-2"><span className="text-gray-500">Rif. cliente:</span> <span className="font-medium">{noteForm.riferimento_cliente}</span></div>
                  )}
                  {noteForm.condizioni_pagamento && (
                    <div><span className="text-gray-500">Pagamento:</span> <span className="font-medium">{noteForm.condizioni_pagamento}</span></div>
                  )}
                  {noteForm.condizioni_consegna && (
                    <div><span className="text-gray-500">Consegna:</span> <span className="font-medium">{noteForm.condizioni_consegna}</span></div>
                  )}
                  {noteForm.note && (
                    <div className="col-span-2 mt-1"><span className="text-gray-500">Note:</span> <span>{noteForm.note}</span></div>
                  )}
                  {noteForm.note_interne && (
                    <div className="col-span-2 mt-1 bg-yellow-50 rounded px-2 py-1"><span className="text-gray-500">Note interne:</span> <span>{noteForm.note_interne}</span></div>
                  )}
                  {!noteForm.riferimento_cliente && !noteForm.condizioni_pagamento && !noteForm.note && (
                    <p className="col-span-2 text-gray-400 italic">Nessuna nota o condizione impostata</p>
                  )}
                </div>
              )}
            </div>

            {/* ── Timeline stati ── */}
            <div className="border-t border-gray-200/50 bg-white/30">
              <button onClick={() => setShowTimeline(!showTimeline)}
                className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-white/50 transition-colors">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700">Timeline Stati</span>
                  <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                    {storicoStati?.storico?.length || 0}
                  </span>
                </div>
                {showTimeline ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
              </button>
              {showTimeline && (
                <div className="px-4 pb-4">
                  <TimelineStati storico={storicoStati?.storico || []} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Confermato senza ordine (ordine perso o errore) — permetti riconferma */}
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
      {!!ordine?.bom_esplosa && esplosiData && (
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

      {/* === DIALOG: Conflitto Ordine Esistente === */}
      <ConflictDialog open={showOrdineConflict} title="Ordine esistente" onClose={() => setShowOrdineConflict(false)}>
        <div className="space-y-4">
          {conflictOrdini.map(o => (
            <div key={o.id} className="bg-gray-50 rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-gray-900">{o.numero_ordine}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_CONFIG[o.stato]?.badgeClass || 'bg-gray-200 text-gray-700'}`}>
                  {STATO_CONFIG[o.stato]?.label || o.stato}
                </span>
              </div>
              <p className="text-gray-600 mt-1">
                Creato dalla REV.{o.numero_revisione_origine || '?'}
                {!!o.bom_esplosa && <span> &middot; BOM esplosa (REV.{o.bom_numero_revisione || '?'})</span>}
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

      {/* === DIALOG: Cambio Stato === */}
      <ConflictDialog
        open={!!showCambioStatoDialog}
        title={`Cambio Stato → ${showCambioStatoDialog ? (STATO_CONFIG[showCambioStatoDialog]?.label || showCambioStatoDialog) : ''}`}
        onClose={() => { setShowCambioStatoDialog(null); setCambioStatoMotivo(''); }}
      >
        {showCambioStatoDialog && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              {TRANSIZIONI_AZIONI[showCambioStatoDialog]?.confirmMsg}
            </p>
            <div>
              <label className="text-sm font-medium text-gray-700">Motivo (opzionale)</label>
              <input type="text" value={cambioStatoMotivo}
                onChange={e => setCambioStatoMotivo(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400"
                placeholder="Aggiungi una nota al cambio stato..."
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => cambioStatoMutation.mutate({ stato: showCambioStatoDialog, motivo: cambioStatoMotivo })}
                disabled={cambioStatoMutation.isPending}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-lg font-medium text-sm disabled:opacity-50 ${TRANSIZIONI_AZIONI[showCambioStatoDialog]?.color || 'bg-indigo-600'}`}
              >
                {cambioStatoMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : TRANSIZIONI_AZIONI[showCambioStatoDialog]?.icon}
                Conferma
              </button>
              <button onClick={() => { setShowCambioStatoDialog(null); setCambioStatoMotivo(''); }}
                className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm">
                Annulla
              </button>
            </div>
          </div>
        )}
      </ConflictDialog>

      {/* === DIALOG: Crea Fattura da Ordini === */}
      <ConflictDialog
        open={showFatturaDialog}
        title="Crea Fattura da Ordini"
        onClose={() => setShowFatturaDialog(false)}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Seleziona gli ordini completati da includere nella fattura.
            {cliente && (
              <span className="font-medium text-gray-800"> Cliente: {cliente.ragione_sociale}</span>
            )}
          </p>

          {fatturaError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
              {fatturaError}
            </div>
          )}

          {/* Lista ordini selezionabili */}
          <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
            {(ordiniFatturabili?.ordini || []).length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                Nessun altro ordine completato per questo cliente
              </div>
            )}
            {(ordiniFatturabili?.ordini || []).map((o: any) => {
              const isSelected = selectedOrdiniIds.includes(o.id);
              const isCurrent = ordine && o.id === ordine.id;
              return (
                <label key={o.id}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${isSelected ? 'bg-indigo-50/50' : ''}`}
                >
                  <input type="checkbox" checked={isSelected}
                    onChange={e => {
                      setSelectedOrdiniIds(prev =>
                        e.target.checked
                          ? [...prev, o.id]
                          : prev.filter(id => id !== o.id)
                      );
                    }}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900">{o.numero_ordine}</span>
                      {isCurrent && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-medium">
                          CORRENTE
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {o.tipo_impianto || 'N/D'} · {o.n_materiali || 0} articoli · {new Date(o.created_at).toLocaleDateString('it-IT')}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                    € {(o.totale_netto || o.totale_materiali || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Riepilogo */}
          {selectedOrdiniIds.length > 0 && (
            <div className="bg-gray-50 rounded-lg px-4 py-3 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {selectedOrdiniIds.length} ordine/i selezionato/i
              </span>
              <span className="text-sm font-bold text-gray-900">
                Totale: € {
                  (ordiniFatturabili?.ordini || [])
                    .filter((o: any) => selectedOrdiniIds.includes(o.id))
                    .reduce((s: number, o: any) => s + (o.totale_netto || o.totale_materiali || 0), 0)
                    .toLocaleString('it-IT', { minimumFractionDigits: 2 })
                }
              </span>
            </div>
          )}

          {/* Azioni */}
          <div className="flex gap-2">
            <button
              onClick={handleCreaFattura}
              disabled={fatturaLoading || selectedOrdiniIds.length === 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-lg font-medium text-sm hover:bg-violet-700 disabled:opacity-50"
            >
              {fatturaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
              Crea Fattura
            </button>
            <button onClick={() => setShowFatturaDialog(false)}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm">
              Annulla
            </button>
          </div>
        </div>
      </ConflictDialog>

    </div>
  );
}

// Helper per ottenere transizioni valide dato uno stato
function getTransizioniStato(stato: string): string[] {
  const map: Record<string, string[]> = {
    confermato: ['in_produzione', 'annullato'],
    in_produzione: ['completato', 'annullato'],
    completato: ['fatturato'],
    fatturato: [],
    annullato: [],
  };
  return map[stato] || [];
}
