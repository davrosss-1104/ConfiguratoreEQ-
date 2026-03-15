import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Ticket, User, Building2, Clock, AlertCircle,
  CheckCircle2, XCircle, Pause, Wrench, Package, Send,
  Paperclip, ExternalLink, RefreshCw, Edit2, Save, X,
  BookOpen, Search, ChevronRight, Tag, MessageSquare,
  Link2, Plus, Loader2, ShoppingCart, Trash2, Eye, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import PannelloTempi from '@/components/PannelloTempi';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function getTokenPayload() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return null;
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch { return null; }
}

// ==========================================
// TIPI
// ==========================================
interface TicketDettaglio {
  id: number;
  numero_ticket: string;
  tipo: 'interno' | 'esterno';
  titolo: string;
  descrizione?: string;
  stato: string;
  priorita: string;
  cliente_id?: number;
  cliente_nome?: string;
  assegnato_a?: number;
  assegnato_nome?: string;
  creato_da?: number;
  creato_da_nome?: string;
  impianto_id?: number;
  impianto_codice?: string;
  impianto_descrizione?: string;
  categoria_nome?: string;
  categoria_colore?: string;
  scadenza?: string;
  risolto_at?: string;
  chiuso_at?: string;
  soluzione?: string;
  nexum_regola_id?: string;
  nexum_proposta?: string;
  ordine_id?: number;
  created_at: string;
  updated_at: string;
  commenti: Commento[];
  allegati: Allegato[];
}

interface Commento {
  id: number;
  utente_id?: number;
  utente_nome?: string;
  testo: string;
  tipo: string;
  visibile_cliente: number;
  created_at: string;
}

interface Allegato {
  id: number;
  nome_file: string;
  path: string;
  dimensione?: number;
  caricato_da_nome?: string;
  created_at: string;
}

interface RegolaNextum {
  id: number | string;
  numero_regola?: string;
  titolo: string;
  categoria?: string;
  stato?: string;
  prodotto?: string;
  background?: string;
}

// ==========================================
// CONFIG STATI (duplicata dal page per autonomia)
// ==========================================
const STATO_CONFIG: Record<string, { label: string; colore: string; bg: string; icona: React.ReactNode }> = {
  aperto:             { label: 'Aperto',          colore: 'text-gray-700',   bg: 'bg-gray-100',    icona: <Ticket       className="h-4 w-4" /> },
  ricevuto:           { label: 'Ricevuto',         colore: 'text-gray-700',   bg: 'bg-gray-100',    icona: <Ticket       className="h-4 w-4" /> },
  assegnato:          { label: 'Assegnato',        colore: 'text-indigo-700', bg: 'bg-indigo-100',  icona: <User         className="h-4 w-4" /> },
  in_lavorazione:     { label: 'In lavorazione',   colore: 'text-amber-700',  bg: 'bg-amber-100',   icona: <Wrench       className="h-4 w-4" /> },
  in_attesa_ricambi:  { label: 'Attesa ricambi',   colore: 'text-purple-700', bg: 'bg-purple-100',  icona: <Package      className="h-4 w-4" /> },
  sospeso:            { label: 'Sospeso',          colore: 'text-gray-500',   bg: 'bg-gray-100',    icona: <Pause        className="h-4 w-4" /> },
  risolto:            { label: 'Risolto',          colore: 'text-emerald-700',bg: 'bg-emerald-100', icona: <CheckCircle2 className="h-4 w-4" /> },
  chiuso:             { label: 'Chiuso',           colore: 'text-gray-500',   bg: 'bg-gray-200',    icona: <CheckCircle2 className="h-4 w-4" /> },
  annullato:          { label: 'Annullato',        colore: 'text-red-700',    bg: 'bg-red-100',     icona: <XCircle      className="h-4 w-4" /> },
};

const TRANSIZIONI_INTERNE: Record<string, string[]> = {
  aperto:         ['assegnato', 'annullato'],
  assegnato:      ['in_lavorazione', 'sospeso', 'annullato'],
  in_lavorazione: ['risolto', 'sospeso', 'annullato'],
  sospeso:        ['in_lavorazione', 'annullato'],
  risolto:        ['chiuso', 'in_lavorazione'],
  chiuso: [], annullato: [],
};

const TRANSIZIONI_ESTERNE: Record<string, string[]> = {
  ricevuto:          ['assegnato', 'annullato'],
  assegnato:         ['in_lavorazione', 'sospeso', 'annullato'],
  in_lavorazione:    ['in_attesa_ricambi', 'risolto', 'sospeso', 'annullato'],
  in_attesa_ricambi: ['in_lavorazione', 'risolto', 'annullato'],
  sospeso:           ['in_lavorazione', 'annullato'],
  risolto:           ['chiuso', 'in_lavorazione'],
  chiuso: [], annullato: [],
};

// ==========================================
// BADGE
// ==========================================
function StatoBadge({ stato }: { stato: string }) {
  const cfg = STATO_CONFIG[stato] ?? { label: stato, colore: 'text-gray-600', bg: 'bg-gray-100', icona: null };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.colore}`}>
      {cfg.icona}{cfg.label}
    </span>
  );
}

// ==========================================
// PANNELLO NEXUM
// ==========================================
function PannelloNexum({
  ticketTitolo,
  nexumRegola,
  nexumProposta,
  onCollegaRegola,
  onSalvaProposta,
}: {
  ticketTitolo: string;
  nexumRegola?: string;
  nexumProposta?: string;
  onCollegaRegola: (id: string) => void;
  onSalvaProposta: (testo: string) => void;
}) {
  const [query,       setQuery]       = useState(ticketTitolo.slice(0, 50));
  const [risultati,   setRisultati]   = useState<RegolaNextum[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [disponibile, setDisponibile] = useState<boolean | null>(null);
  const [proposta,    setProposta]    = useState(nexumProposta ?? '');
  const [tab,         setTab]         = useState<'cerca' | 'proposta'>('cerca');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Verifica stato Nexum al mount
  useEffect(() => {
    fetch(`${API_BASE}/nexum/stato`)
      .then(r => r.ok ? r.json() : {})
      .then(d => setDisponibile(!!d.raggiungibile))
      .catch(() => setDisponibile(false));
  }, []);

  const cerca = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 3) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/nexum/cerca?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setRisultati(data.results ?? []);
      if (data.nexum_disponibile === false) setDisponibile(false);
    } catch {
      setRisultati([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleQueryChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => cerca(v), 600);
  };

  // Cerca automaticamente al mount se Nexum disponibile
  useEffect(() => {
    if (disponibile) cerca(query);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disponibile]);

  if (disponibile === false) {
    return (
      <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-4 text-center">
        <BookOpen className="h-8 w-8 mx-auto text-gray-300 mb-2" />
        <p className="text-sm text-gray-400 font-medium">Nexum non disponibile</p>
        <p className="text-xs text-gray-400 mt-1">Configurare l'URL in Parametri Sistema</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-indigo-600" />
          <span className="text-sm font-semibold text-gray-800">Conoscenza Nexum</span>
          {disponibile === null && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
          {disponibile === true && <span className="h-2 w-2 bg-green-400 rounded-full" title="Nexum connesso" />}
        </div>
        <div className="flex gap-1">
          {(['cerca', 'proposta'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs px-2 py-1 rounded font-medium ${
                tab === t ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'cerca' ? 'Cerca' : 'Proponi'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'cerca' ? (
        <div className="p-4 space-y-3">
          {/* Regola già collegata */}
          {nexumRegola && (
            <div className="flex items-center gap-2 bg-indigo-50 rounded-lg px-3 py-2 text-sm">
              <Link2 className="h-4 w-4 text-indigo-600 shrink-0" />
              <span className="text-indigo-700 text-xs">Regola collegata: <strong>{nexumRegola}</strong></span>
            </div>
          )}

          {/* Campo ricerca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              placeholder="Cerca nelle regole Nexum..."
              className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Risultati */}
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            </div>
          ) : risultati.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">Nessuna regola trovata</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {risultati.map((r, i) => (
                <div
                  key={r.id ?? i}
                  className="border border-gray-100 rounded-lg p-3 hover:border-indigo-200 hover:bg-indigo-50 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {r.numero_regola && (
                        <span className="text-xs font-mono text-gray-400 block">{r.numero_regola}</span>
                      )}
                      <p className="text-xs font-medium text-gray-800 leading-snug">{r.titolo}</p>
                      {r.categoria && (
                        <span className="text-xs text-gray-400 mt-0.5 block">{r.categoria}</span>
                      )}
                    </div>
                    <button
                      onClick={() => onCollegaRegola(String(r.id))}
                      className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Collega questa regola al ticket"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500">
            Alla chiusura del ticket, puoi proporre una nuova regola da aggiungere a Nexum basandoti sulla soluzione trovata.
          </p>
          <textarea
            value={proposta}
            onChange={e => setProposta(e.target.value)}
            rows={5}
            placeholder="Descrivi la regola/conoscenza da aggiungere a Nexum..."
            className="w-full border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
          <button
            onClick={() => { onSalvaProposta(proposta); toast.success('Proposta salvata'); }}
            disabled={!proposta.trim()}
            className="w-full py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-40"
          >
            Salva proposta
          </button>
        </div>
      )}
    </div>
  );
}

// ==========================================
// PANNELLO ORDINE COLLEGATO
// ==========================================
const STATO_ORDINE_CFG: Record<string, { label: string; bg: string; text: string }> = {
  confermato:   { label: 'Confermato',   bg: 'bg-indigo-100',  text: 'text-indigo-700'  },
  in_produzione:{ label: 'In produzione',bg: 'bg-amber-100',   text: 'text-amber-700'   },
  completato:   { label: 'Completato',   bg: 'bg-emerald-100', text: 'text-emerald-700' },
  spedito:      { label: 'Spedito',      bg: 'bg-blue-100',    text: 'text-blue-700'    },
  fatturato:    { label: 'Fatturato',    bg: 'bg-green-100',   text: 'text-green-700'   },
  sospeso:      { label: 'Sospeso',      bg: 'bg-gray-100',    text: 'text-gray-500'    },
  annullato:    { label: 'Annullato',    bg: 'bg-red-100',     text: 'text-red-700'     },
};

function PannelloOrdine({ ticketId, ordineId, navigate }: {
  ticketId: number;
  ordineId?: number;
  navigate: (p: string) => void;
}) {
  const [ordine, setOrdine] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ordini, setOrdini]   = useState<any[]>([]);
  const [cerca, setCerca]     = useState('');

  useEffect(() => {
    if (!ordineId) return;
    setLoading(true);
    fetch(`/api/tickets/${ticketId}/ordine`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setOrdine(d))
      .finally(() => setLoading(false));
  }, [ticketId, ordineId]);

  const apriRicerca = async () => {
    setEditing(true);
    const res = await fetch('/api/ordini?limit=50').catch(() => null);
    if (res?.ok) setOrdini(await res.json());
  };

  const collegaOrdine = async (oId: number) => {
    await fetch(`/api/tickets/${ticketId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordine_id: oId }),
    });
    setEditing(false);
    window.location.reload();
  };

  const filtrati = ordini.filter(o =>
    !cerca ||
    o.numero_ordine?.toLowerCase().includes(cerca.toLowerCase()) ||
    o.tipo_impianto?.toLowerCase().includes(cerca.toLowerCase())
  );

  const cfg = ordine ? (STATO_ORDINE_CFG[ordine.stato] ?? { label: ordine.stato, bg: 'bg-gray-100', text: 'text-gray-600' }) : null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-blue-500" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ordine collegato</span>
        </div>
        {!editing && (
          <button onClick={apriRicerca} className="text-xs text-blue-600 hover:text-blue-800">
            {ordine ? 'Cambia' : '+ Collega'}
          </button>
        )}
      </div>

      {loading && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-blue-400" /></div>}

      {!loading && !editing && !ordine && (
        <p className="text-xs text-gray-400 text-center py-2">Nessun ordine collegato</p>
      )}

      {!loading && !editing && ordine && (
        <button
          onClick={() => navigate(`/ordini/${ordine.id}`)}
          className="w-full text-left hover:bg-blue-50 rounded-lg p-2 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-900">{ordine.numero_ordine}</span>
            <div className="flex items-center gap-2">
              {cfg && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>
                  {cfg.label}
                </span>
              )}
              <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-400" />
            </div>
          </div>
          {ordine.tipo_impianto && (
            <p className="text-xs text-gray-500 mt-0.5">{ordine.tipo_impianto}</p>
          )}
          {ordine.numero_preventivo && (
            <p className="text-xs text-gray-400 mt-0.5">Prev. {ordine.numero_preventivo}</p>
          )}
          {ordine.data_consegna_prevista && (
            <p className="text-xs text-gray-400 mt-0.5">
              Consegna: {new Date(ordine.data_consegna_prevista).toLocaleDateString('it-IT')}
            </p>
          )}
        </button>
      )}

      {editing && (
        <div className="space-y-2">
          <input
            value={cerca}
            onChange={e => setCerca(e.target.value)}
            placeholder="Cerca numero ordine..."
            className="w-full border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
            autoFocus
          />
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filtrati.slice(0, 20).map((o: any) => (
              <button key={o.id} onClick={() => collegaOrdine(o.id)}
                className="w-full text-left p-2 hover:bg-blue-50 rounded text-xs border border-transparent hover:border-blue-200">
                <span className="font-mono font-bold text-gray-800">{o.numero_ordine}</span>
                {o.tipo_impianto && <span className="text-gray-500 ml-2">{o.tipo_impianto}</span>}
                {o.stato && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded-full ${STATO_ORDINE_CFG[o.stato]?.bg ?? 'bg-gray-100'} ${STATO_ORDINE_CFG[o.stato]?.text ?? 'text-gray-600'}`}>
                    {STATO_ORDINE_CFG[o.stato]?.label ?? o.stato}
                  </span>
                )}
              </button>
            ))}
            {!filtrati.length && <p className="text-xs text-gray-400 text-center py-2">Nessun risultato</p>}
          </div>
          <button onClick={() => setEditing(false)} className="text-xs text-gray-400 hover:text-gray-600 w-full text-center">
            Annulla
          </button>
        </div>
      )}
    </div>
  );
}

// ==========================================
// PANNELLO MATERIALI IMPIEGATI
// ==========================================

interface Materiale {
  id: number;
  articolo_id?: number;
  codice: string;
  descrizione: string;
  quantita: number;
  unita_misura: string;
  note: string;
  visibile_cliente: number;
  created_at: string;
  aggiunto_da_nome?: string;
}

function PannelloMateriali({ ticketId, terminale }: { ticketId: number; terminale: boolean }) {
  const [materiali, setMateriali]       = useState<Materiale[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [cercaArt, setCercaArt]         = useState('');
  const [risultatiArt, setRisultatiArt] = useState<any[]>([]);
  const [cercandoArt, setCercandoArt]   = useState(false);
  const [form, setForm] = useState({
    codice: '', descrizione: '', quantita: 1,
    unita_misura: 'pz', note: '', visibile_cliente: false,
    articolo_id: undefined as number | undefined,
  });
  const [saving, setSaving] = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/tickets/${ticketId}/materiali`);
      if (r.ok) setMateriali(await r.json());
    } finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { carica(); }, [carica]);

  const cercaArticoli = async (q: string) => {
    if (!q.trim() || q.length < 2) { setRisultatiArt([]); return; }
    setCercandoArt(true);
    try {
      const r = await fetch(`/api/articoli?search=${encodeURIComponent(q)}&limit=10`);
      if (r.ok) setRisultatiArt(await r.json());
    } finally { setCercandoArt(false); }
  };

  const handleCercaArt = (v: string) => {
    setCercaArt(v);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => cercaArticoli(v), 400);
  };

  const selezionaArticolo = (a: any) => {
    setForm(f => ({
      ...f,
      articolo_id: a.id,
      codice: a.codice ?? a.cod_articolo ?? '',
      descrizione: a.descrizione ?? a.desc_articolo ?? '',
      unita_misura: a.unita_misura ?? 'pz',
    }));
    setCercaArt(a.codice ?? a.cod_articolo ?? '');
    setRisultatiArt([]);
  };

  const handleAggiungi = async () => {
    if (!form.descrizione.trim()) { toast.error('Descrizione obbligatoria'); return; }
    setSaving(true);
    try {
      const r = await fetch(`/api/tickets/${ticketId}/materiali`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error((await r.json()).detail);
      toast.success('Materiale aggiunto');
      setShowForm(false);
      setForm({ codice: '', descrizione: '', quantita: 1, unita_misura: 'pz', note: '', visibile_cliente: false, articolo_id: undefined });
      setCercaArt('');
      carica();
    } catch (e: any) { toast.error(e.message || 'Errore'); }
    setSaving(false);
  };

  const handleElimina = async (matId: number) => {
    await fetch(`/api/tickets/${ticketId}/materiali/${matId}`, { method: 'DELETE' });
    carica();
  };

  const toggleVisibile = async (mat: Materiale) => {
    await fetch(`/api/tickets/${ticketId}/materiali/${mat.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibile_cliente: !mat.visibile_cliente }),
    });
    carica();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-purple-500" />
          <span className="text-sm font-semibold text-gray-800">
            Materiali impiegati {materiali.length > 0 && <span className="text-gray-400">({materiali.length})</span>}
          </span>
        </div>
        {!terminale && (
          <button
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 px-2 py-1 rounded hover:bg-purple-50"
          >
            <Plus className="h-3.5 w-3.5" /> Aggiungi
          </button>
        )}
      </div>

      {/* Form aggiunta */}
      {showForm && (
        <div className="p-4 border-b bg-purple-50 space-y-3">
          <p className="text-xs font-semibold text-purple-700">Nuovo materiale</p>

          {/* Ricerca articolo da anagrafica */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={cercaArt}
              onChange={e => handleCercaArt(e.target.value)}
              placeholder="Cerca in anagrafica articoli (cod./descrizione)..."
              className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
            />
            {cercandoArt && (
              <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-gray-400" />
            )}
          </div>

          {/* Risultati ricerca */}
          {risultatiArt.length > 0 && (
            <div className="border rounded-lg bg-white divide-y max-h-36 overflow-y-auto shadow-sm">
              {risultatiArt.map((a: any) => (
                <button key={a.id} onClick={() => selezionaArticolo(a)}
                  className="w-full text-left px-3 py-2 hover:bg-purple-50 text-xs">
                  <span className="font-mono text-gray-500 mr-2">{a.codice ?? a.cod_articolo}</span>
                  <span className="text-gray-800">{a.descrizione ?? a.desc_articolo}</span>
                  {a.unita_misura && <span className="text-gray-400 ml-1">({a.unita_misura})</span>}
                </button>
              ))}
            </div>
          )}

          {/* Campi manuali */}
          <div className="grid grid-cols-4 gap-2">
            <input value={form.codice} onChange={e => setForm(f => ({ ...f, codice: e.target.value }))}
              placeholder="Codice" className="col-span-1 border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400" />
            <input value={form.descrizione} onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))}
              placeholder="Descrizione *" className="col-span-3 border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400" />
          </div>
          <div className="grid grid-cols-4 gap-2">
            <input type="number" min="0.001" step="any" value={form.quantita}
              onChange={e => setForm(f => ({ ...f, quantita: parseFloat(e.target.value) || 1 }))}
              className="col-span-1 border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400" />
            <input value={form.unita_misura} onChange={e => setForm(f => ({ ...f, unita_misura: e.target.value }))}
              placeholder="UM" className="col-span-1 border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400" />
            <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Note" className="col-span-2 border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400" />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-600">
              <input type="checkbox" checked={form.visibile_cliente}
                onChange={e => setForm(f => ({ ...f, visibile_cliente: e.target.checked }))}
                className="rounded" />
              Visibile al cliente
            </label>
            <div className="flex gap-2">
              <button onClick={() => { setShowForm(false); setCercaArt(''); setRisultatiArt([]); }}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Annulla</button>
              <button onClick={handleAggiungi} disabled={saving || !form.descrizione.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700 disabled:opacity-40">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                Aggiungi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista materiali */}
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>
      ) : materiali.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-5">Nessun materiale registrato</p>
      ) : (
        <div className="divide-y">
          {materiali.map(m => (
            <div key={m.id} className="px-4 py-2.5 flex items-start gap-2 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {m.codice && <span className="text-xs font-mono text-gray-400">{m.codice}</span>}
                  <span className="text-xs font-medium text-gray-800 truncate">{m.descrizione}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-gray-500">
                    {m.quantita} {m.unita_misura || 'pz'}
                  </span>
                  {m.note && <span className="text-xs text-gray-400 truncate">{m.note}</span>}
                  {!!m.visibile_cliente
                    ? <span className="text-xs text-blue-500 flex items-center gap-0.5"><Eye className="h-3 w-3" />cliente</span>
                    : <span className="text-xs text-gray-300 flex items-center gap-0.5"><EyeOff className="h-3 w-3" />interno</span>
                  }
                </div>
                {m.aggiunto_da_nome && (
                  <span className="text-xs text-gray-300">{m.aggiunto_da_nome} · {new Date(m.created_at).toLocaleDateString('it-IT')}</span>
                )}
              </div>
              {!terminale && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => toggleVisibile(m)} title="Cambia visibilità cliente"
                    className="p-1 text-gray-400 hover:text-blue-500 rounded">
                    {!!m.visibile_cliente ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => handleElimina(m.id)} title="Rimuovi"
                    className="p-1 text-gray-400 hover:text-red-500 rounded">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// DIALOG TRANSIZIONE STATO
// ==========================================
function TransizioneDialog({
  statoNuovo,
  richiediSoluzione,
  onConferma,
  onAnnulla,
}: {
  statoNuovo: string;
  richiediSoluzione: boolean;
  onConferma: (motivo: string, soluzione: string) => void;
  onAnnulla: () => void;
}) {
  const [motivo,    setMotivo]    = useState('');
  const [soluzione, setSoluzione] = useState('');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b">
          <h3 className="font-semibold text-gray-900">
            Cambia stato → <StatoBadge stato={statoNuovo} />
          </h3>
        </div>
        <div className="p-5 space-y-4">
          {richiediSoluzione && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Soluzione *
              </label>
              <textarea
                value={soluzione}
                onChange={e => setSoluzione(e.target.value)}
                rows={4}
                placeholder="Descrivi come è stato risolto il problema..."
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Note {!richiediSoluzione && '(opzionale)'}
            </label>
            <input
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Motivazione del cambio stato..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onAnnulla} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Annulla
          </button>
          <button
            onClick={() => onConferma(motivo, soluzione)}
            disabled={richiediSoluzione && !soluzione.trim()}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            Conferma
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// PAGINA DETTAGLIO TICKET
// ==========================================
export default function TicketDettaglioPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ticket,       setTicket]       = useState<TicketDettaglio | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [transitioning,setTransitioning]= useState(false);
  const [statoDialog,  setStatoDialog]  = useState<string | null>(null);

  // Commento
  const [nuovoCommento,    setNuovoCommento]    = useState('');
  const [inviandoCommento, setInviandoCommento] = useState(false);
  const [visibileCliente,  setVisibileCliente]  = useState(false);

  // Edit titolo/descrizione inline
  const [editMode,    setEditMode]    = useState(false);
  const [editTitolo,  setEditTitolo]  = useState('');
  const [editDescr,   setEditDescr]   = useState('');

  const caricaTicket = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/tickets/${id}`);
      if (!res.ok) throw new Error('Ticket non trovato');
      const data = await res.json();
      setTicket(data);
      setEditTitolo(data.titolo);
      setEditDescr(data.descrizione ?? '');
    } catch {
      toast.error('Impossibile caricare il ticket');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { caricaTicket(); }, [caricaTicket]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Ticket non trovato
      </div>
    );
  }

  const transizioni = ticket.tipo === 'interno'
    ? TRANSIZIONI_INTERNE[ticket.stato] ?? []
    : TRANSIZIONI_ESTERNE[ticket.stato] ?? [];

  const richiediSoluzione = (s: string) => ['risolto', 'chiuso'].includes(s);

  // ---- Azioni ----

  const handleTransizione = async (statoNuovo: string, motivo: string, soluzione: string) => {
    setTransitioning(true);
    try {
      const res = await fetch(`${API_BASE}/tickets/${ticket.id}/transizione`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stato_nuovo: statoNuovo, motivo, soluzione: soluzione || undefined }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail);
      }
      toast.success(`Stato aggiornato: ${STATO_CONFIG[statoNuovo]?.label ?? statoNuovo}`);
      setStatoDialog(null);
      caricaTicket();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTransitioning(false);
    }
  };

  const handleInviaCommento = async () => {
    if (!nuovoCommento.trim()) return;
    setInviandoCommento(true);
    try {
      const res = await fetch(`${API_BASE}/tickets/${ticket.id}/commenti`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testo: nuovoCommento,
          visibile_cliente: visibileCliente,
        }),
      });
      if (!res.ok) throw new Error('Errore invio commento');
      setNuovoCommento('');
      setVisibileCliente(false);
      caricaTicket();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setInviandoCommento(false);
    }
  };

  const handleSalvaEdit = async () => {
    try {
      await fetch(`${API_BASE}/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titolo: editTitolo, descrizione: editDescr }),
      });
      toast.success('Aggiornato');
      setEditMode(false);
      caricaTicket();
    } catch {
      toast.error('Errore aggiornamento');
    }
  };

  const handleCollegaRegola = async (regolaId: string) => {
    await fetch(`${API_BASE}/tickets/${ticket.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nexum_regola_id: regolaId }),
    });
    toast.success('Regola Nexum collegata');
    caricaTicket();
  };

  const handleSalvaProposta = async (testo: string) => {
    await fetch(`${API_BASE}/tickets/${ticket.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nexum_proposta: testo }),
    });
    caricaTicket();
  };

  const terminale = ['chiuso', 'annullato'].includes(ticket.stato);
  const tokenPayload = getTokenPayload();
  const currentUserId = tokenPayload?.user_id;
  const isAdmin = tokenPayload?.is_admin ?? false;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/tickets')}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="text-sm font-mono text-gray-400">{ticket.numero_ticket}</span>
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${
              ticket.tipo === 'interno' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {ticket.tipo === 'interno' ? '🔧 Interno' : '📞 Esterno'}
            </span>
            <StatoBadge stato={ticket.stato} />
          </div>
          <button onClick={caricaTicket} className="p-2 text-gray-400 hover:text-gray-600">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 grid grid-cols-3 gap-6">
        {/* ===== COLONNA SINISTRA (2/3) ===== */}
        <div className="col-span-2 space-y-4">

          {/* Titolo e descrizione */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            {editMode ? (
              <div className="space-y-3">
                <input
                  value={editTitolo}
                  onChange={e => setEditTitolo(e.target.value)}
                  className="w-full text-lg font-bold border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <textarea
                  value={editDescr}
                  onChange={e => setEditDescr(e.target.value)}
                  rows={4}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSalvaEdit}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                  >
                    <Save className="h-4 w-4" /> Salva
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-xl font-bold text-gray-900 flex-1">{ticket.titolo}</h1>
                  {!terminale && (
                    <button
                      onClick={() => setEditMode(true)}
                      className="text-gray-400 hover:text-gray-600 p-1"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {ticket.descrizione && (
                  <p className="mt-3 text-sm text-gray-600 whitespace-pre-wrap">{ticket.descrizione}</p>
                )}
              </div>
            )}
          </div>

          {/* Soluzione (se presente o in risoluzione) */}
          {ticket.soluzione && (
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-semibold text-emerald-700">Soluzione</span>
              </div>
              <p className="text-sm text-emerald-800 whitespace-pre-wrap">{ticket.soluzione}</p>
            </div>
          )}

          {/* Pulsanti transizione stato */}
          {!terminale && transizioni.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Avanza stato</p>
              <div className="flex flex-wrap gap-2">
                {transizioni.map(s => {
                  const cfg = STATO_CONFIG[s];
                  return (
                    <button
                      key={s}
                      onClick={() => setStatoDialog(s)}
                      disabled={transitioning}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium border-2 transition-colors
                        ${s === 'annullato'
                          ? 'border-red-200 text-red-600 hover:bg-red-50'
                          : `border-gray-200 ${cfg?.colore ?? 'text-gray-700'} hover:bg-gray-50`
                        }`}
                    >
                      {cfg?.icona}
                      {cfg?.label ?? s}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Commenti e attività */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-semibold text-gray-800">
                Attività ({ticket.commenti.length})
              </span>
            </div>

            {/* Lista commenti */}
            <div className="divide-y max-h-96 overflow-y-auto">
              {ticket.commenti.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Nessuna attività</p>
              ) : (
                ticket.commenti.map(c => (
                  <div
                    key={c.id}
                    className={`p-4 ${c.tipo === 'cambio_stato' ? 'bg-gray-50' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold
                        ${c.tipo === 'cambio_stato'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {c.tipo === 'cambio_stato' ? '↕' : (c.utente_nome?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-medium text-gray-700">
                            {c.utente_nome ?? 'Sistema'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(c.created_at).toLocaleString('it-IT', {
                              day: '2-digit', month: '2-digit', year: '2-digit',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                          {!!c.visibile_cliente && (
                            <span className="text-xs bg-blue-100 text-blue-600 px-1.5 rounded">visibile cliente</span>
                          )}
                        </div>
                        <p className={`text-sm mt-0.5 ${c.tipo === 'cambio_stato' ? 'text-gray-500 italic' : 'text-gray-700'}`}>
                          {c.testo}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input nuovo commento */}
            {!terminale && (
              <div className="p-4 border-t">
                <textarea
                  value={nuovoCommento}
                  onChange={e => setNuovoCommento(e.target.value)}
                  placeholder="Aggiungi un commento o nota di lavoro..."
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && e.ctrlKey) handleInviaCommento();
                  }}
                />
                <div className="flex items-center justify-between mt-2">
                  <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibileCliente}
                      onChange={e => setVisibileCliente(e.target.checked)}
                      className="rounded"
                    />
                    Visibile al cliente
                  </label>
                  <button
                    onClick={handleInviaCommento}
                    disabled={!nuovoCommento.trim() || inviandoCommento}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
                  >
                    {inviandoCommento ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Invia
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ===== COLONNA DESTRA (1/3) ===== */}
        <div className="space-y-4">

          {/* Info ticket */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Dettagli</p>

            {ticket.cliente_nome && (
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Cliente</p>
                  <p className="text-sm text-gray-700 font-medium">{ticket.cliente_nome}</p>
                </div>
              </div>
            )}

            {ticket.impianto_codice && (
              <div className="flex items-start gap-2">
                <Building2 className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Impianto</p>
                  <p className="text-sm text-gray-700 font-medium">{ticket.impianto_codice}</p>
                  {ticket.impianto_descrizione && (
                    <p className="text-xs text-gray-400">{ticket.impianto_descrizione}</p>
                  )}
                </div>
              </div>
            )}

            {ticket.assegnato_nome && (
              <div className="flex items-start gap-2">
                <Wrench className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Assegnato a</p>
                  <p className="text-sm text-gray-700 font-medium">{ticket.assegnato_nome}</p>
                </div>
              </div>
            )}

            {ticket.scadenza && (
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Scadenza</p>
                  <p className={`text-sm font-medium ${
                    new Date(ticket.scadenza) < new Date() && !terminale
                      ? 'text-red-600' : 'text-gray-700'
                  }`}>
                    {new Date(ticket.scadenza).toLocaleString('it-IT', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            )}

            {ticket.categoria_nome && (
              <div className="flex items-start gap-2">
                <Tag className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Categoria</p>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                    style={{ backgroundColor: ticket.categoria_colore || '#6B7280' }}
                  >
                    {ticket.categoria_nome}
                  </span>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-gray-400">Creato</p>
                <p className="text-xs text-gray-500">
                  {new Date(ticket.created_at).toLocaleDateString('it-IT')}
                  {ticket.creato_da_nome && ` da ${ticket.creato_da_nome}`}
                </p>
              </div>
            </div>

            {ticket.risolto_at && (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">Risolto</p>
                  <p className="text-xs text-gray-500">
                    {new Date(ticket.risolto_at).toLocaleDateString('it-IT')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Pannello Nexum */}
          <PannelloNexum
            ticketTitolo={ticket.titolo}
            nexumRegola={ticket.nexum_regola_id ?? undefined}
            nexumProposta={ticket.nexum_proposta ?? undefined}
            onCollegaRegola={handleCollegaRegola}
            onSalvaProposta={handleSalvaProposta}
          />

          {/* Ordine collegato */}
          <PannelloOrdine
            ticketId={ticket.id}
            ordineId={ticket.ordine_id}
            navigate={navigate}
          />

          {/* Materiali impiegati */}
          <PannelloMateriali
            ticketId={ticket.id}
            terminale={terminale}
          />
          {/* Tempi di lavoro */}
          <PannelloTempi
            ticketId={ticket.id}
            assegnatoId={ticket.assegnato_a}
            terminale={terminale}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
          />
        </div>
      </div>

      {/* Dialog transizione */}
      {statoDialog && (
        <TransizioneDialog
          statoNuovo={statoDialog}
          richiediSoluzione={richiediSoluzione(statoDialog)}
          onConferma={(motivo, soluzione) => handleTransizione(statoDialog, motivo, soluzione)}
          onAnnulla={() => setStatoDialog(null)}
        />
      )}
    </div>
  );
}
