import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Filter, RefreshCw, ChevronDown,
  Ticket, AlertCircle, Clock, User, Building2,
  CheckCircle2, XCircle, Pause, Wrench, Package,
  ArrowRight, ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const API_BASE = '/api';

// ==========================================
// TIPI
// ==========================================
interface TicketItem {
  id: number;
  numero_ticket: string;
  tipo: 'interno' | 'esterno';
  titolo: string;
  stato: string;
  priorita: string;
  cliente_nome?: string;
  assegnato_nome?: string;
  impianto_codice?: string;
  categoria_nome?: string;
  categoria_colore?: string;
  scadenza?: string;
  created_at: string;
  updated_at: string;
}

interface Utente {
  id: number;
  username: string;
  nome_completo?: string;
}

interface Cliente {
  id: number;
  ragione_sociale: string;
}

interface Categoria {
  id: number;
  nome: string;
  tipo: string;
  colore: string;
}

// ==========================================
// COSTANTI UI
// ==========================================
const PRIORITA_CONFIG: Record<string, { label: string; colore: string; bg: string }> = {
  bassa:    { label: 'Bassa',    colore: 'text-gray-600',  bg: 'bg-gray-100'   },
  normale:  { label: 'Normale',  colore: 'text-blue-600',  bg: 'bg-blue-100'   },
  alta:     { label: 'Alta',     colore: 'text-orange-600',bg: 'bg-orange-100' },
  urgente:  { label: 'Urgente',  colore: 'text-red-600',   bg: 'bg-red-100'    },
};

const STATO_CONFIG: Record<string, { label: string; colore: string; bg: string; icona: React.ReactNode }> = {
  aperto:             { label: 'Aperto',          colore: 'text-gray-700',   bg: 'bg-gray-100',    icona: <Ticket      className="h-3.5 w-3.5" /> },
  ricevuto:           { label: 'Ricevuto',         colore: 'text-gray-700',   bg: 'bg-gray-100',    icona: <Ticket      className="h-3.5 w-3.5" /> },
  assegnato:          { label: 'Assegnato',        colore: 'text-indigo-700', bg: 'bg-indigo-100',  icona: <User        className="h-3.5 w-3.5" /> },
  in_lavorazione:     { label: 'In lavorazione',   colore: 'text-amber-700',  bg: 'bg-amber-100',   icona: <Wrench      className="h-3.5 w-3.5" /> },
  in_attesa_ricambi:  { label: 'Attesa ricambi',   colore: 'text-purple-700', bg: 'bg-purple-100',  icona: <Package     className="h-3.5 w-3.5" /> },
  sospeso:            { label: 'Sospeso',          colore: 'text-gray-500',   bg: 'bg-gray-100',    icona: <Pause       className="h-3.5 w-3.5" /> },
  risolto:            { label: 'Risolto',          colore: 'text-emerald-700',bg: 'bg-emerald-100', icona: <CheckCircle2 className="h-3.5 w-3.5" /> },
  chiuso:             { label: 'Chiuso',           colore: 'text-gray-500',   bg: 'bg-gray-200',    icona: <CheckCircle2 className="h-3.5 w-3.5" /> },
  annullato:          { label: 'Annullato',        colore: 'text-red-700',    bg: 'bg-red-100',     icona: <XCircle     className="h-3.5 w-3.5" /> },
};

// ==========================================
// BADGE STATO
// ==========================================
function StatoBadge({ stato }: { stato: string }) {
  const cfg = STATO_CONFIG[stato] ?? { label: stato, colore: 'text-gray-600', bg: 'bg-gray-100', icona: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.colore}`}>
      {cfg.icona}
      {cfg.label}
    </span>
  );
}

function PrioritaBadge({ priorita }: { priorita: string }) {
  const cfg = PRIORITA_CONFIG[priorita] ?? { label: priorita, colore: 'text-gray-600', bg: 'bg-gray-100' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.colore}`}>
      {cfg.label}
    </span>
  );
}

// ==========================================
// FORM NUOVO TICKET
// ==========================================
function NuovoTicketModal({
  onClose,
  onCreato,
  utenti,
  clienti,
  categorie,
  utenteCorrente,
}: {
  onClose: () => void;
  onCreato: () => void;
  utenti: Utente[];
  clienti: Cliente[];
  categorie: Categoria[];
  utenteCorrente?: number;
}) {
  const [form, setForm] = useState({
    tipo: 'esterno',
    titolo: '',
    descrizione: '',
    priorita: 'normale',
    categoria_id: '',
    cliente_id: '',
    assegnato_a: '',
    scadenza: '',
    impianto_id: '',
  });
  const [impianti, setImpianti] = useState<{ id: number; codice_cliente: string; descrizione?: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Carica impianti quando cambia il cliente
  useEffect(() => {
    if (!form.cliente_id) { setImpianti([]); return; }
    fetch(`${API_BASE}/impianti?cliente_id=${form.cliente_id}`)
      .then(r => r.ok ? r.json() : [])
      .then(setImpianti)
      .catch(() => {});
  }, [form.cliente_id]);

  const handleSalva = async () => {
    if (!form.titolo.trim()) { toast.error('Titolo obbligatorio'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        categoria_id:  form.categoria_id  ? Number(form.categoria_id)  : null,
        cliente_id:    form.cliente_id     ? Number(form.cliente_id)     : null,
        assegnato_a:   form.assegnato_a    ? Number(form.assegnato_a)    : null,
        impianto_id:   form.impianto_id    ? Number(form.impianto_id)    : null,
        creato_da:     utenteCorrente ?? null,
        scadenza:      form.scadenza || null,
      };
      const res = await fetch(`${API_BASE}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Errore creazione ticket');
      }
      const data = await res.json();
      toast.success(`Ticket ${data.numero_ticket} creato`);
      onCreato();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const categorieFiltered = categorie.filter(c => c.tipo === form.tipo || c.tipo === 'entrambi');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Nuovo Ticket</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="p-6 space-y-4">
          {/* Tipo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <div className="flex gap-3">
              {(['interno', 'esterno'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => set('tipo', t)}
                  className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    form.tipo === t
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {t === 'interno' ? '🔧 Interno' : '📞 Esterno'}
                </button>
              ))}
            </div>
          </div>

          {/* Titolo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titolo *</label>
            <input
              value={form.titolo}
              onChange={e => set('titolo', e.target.value)}
              placeholder="Descrivi brevemente il problema o il lavoro..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Descrizione */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
            <textarea
              value={form.descrizione}
              onChange={e => set('descrizione', e.target.value)}
              rows={3}
              placeholder="Dettagli aggiuntivi..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Priorità + Categoria */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priorità</label>
              <select
                value={form.priorita}
                onChange={e => set('priorita', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="bassa">Bassa</option>
                <option value="normale">Normale</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select
                value={form.categoria_id}
                onChange={e => set('categoria_id', e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— nessuna —</option>
                {categorieFiltered.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cliente (solo esterno) */}
          {form.tipo === 'esterno' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                <select
                  value={form.cliente_id}
                  onChange={e => set('cliente_id', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— seleziona cliente —</option>
                  {clienti.map(c => (
                    <option key={c.id} value={c.id}>{c.ragione_sociale}</option>
                  ))}
                </select>
              </div>
              {form.cliente_id && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Impianto</label>
                  <select
                    value={form.impianto_id}
                    onChange={e => set('impianto_id', e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— seleziona impianto —</option>
                    {impianti.map(i => (
                      <option key={i.id} value={i.id}>
                        {i.codice_cliente}{i.descrizione ? ` — ${i.descrizione}` : ''}
                      </option>
                    ))}
                  </select>
                  {impianti.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">Nessun impianto registrato per questo cliente</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Assegnato a */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assegna a</label>
            <select
              value={form.assegnato_a}
              onChange={e => set('assegnato_a', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— non assegnato —</option>
              {utenti.map(u => (
                <option key={u.id} value={u.id}>{u.nome_completo || u.username}</option>
              ))}
            </select>
          </div>

          {/* Scadenza */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scadenza</label>
            <input
              type="datetime-local"
              value={form.scadenza}
              onChange={e => set('scadenza', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-6 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Annulla
          </button>
          <button
            onClick={handleSalva}
            disabled={saving}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Salvataggio...' : 'Crea Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// PAGINA PRINCIPALE
// ==========================================
export default function TicketsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets]       = useState<TicketItem[]>([]);
  const [totale, setTotale]         = useState(0);
  const [loading, setLoading]       = useState(true);
  const [showNuovo, setShowNuovo]   = useState(false);

  // Filtri
  const [filtroTipo,     setFiltroTipo]     = useState('');
  const [filtroStato,    setFiltroStato]    = useState('');
  const [filtroPriorita, setFiltroPriorita] = useState('');
  const [filtroQ,        setFiltroQ]        = useState('');
  const [filtroAssegnato,setFiltroAssegnato]= useState('');

  // Dati accessori
  const [utenti,    setUtenti]    = useState<Utente[]>([]);
  const [clienti,   setClienti]   = useState<Cliente[]>([]);
  const [categorie, setCategorie] = useState<Categoria[]>([]);

  // Carica dati accessori una volta sola
  useEffect(() => {
    fetch(`${API_BASE}/utenti`).then(r => r.ok ? r.json() : []).then(setUtenti).catch(() => {});
    fetch(`${API_BASE}/clienti`).then(r => r.ok ? r.json() : []).then(setClienti).catch(() => {});
    fetch(`${API_BASE}/categorie-ticket`).then(r => r.ok ? r.json() : []).then(setCategorie).catch(() => {});
  }, []);

  const caricaTickets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroTipo)      params.set('tipo',        filtroTipo);
      if (filtroStato)     params.set('stato',       filtroStato);
      if (filtroPriorita)  params.set('priorita',    filtroPriorita);
      if (filtroQ)         params.set('q',           filtroQ);
      if (filtroAssegnato) params.set('assegnato_a', filtroAssegnato);
      params.set('limit', '50');

      const res = await fetch(`${API_BASE}/tickets?${params}`);
      if (!res.ok) throw new Error('Errore caricamento ticket');
      const data = await res.json();
      setTickets(data.items ?? []);
      setTotale(data.totale ?? 0);
    } catch {
      toast.error('Impossibile caricare i ticket');
    } finally {
      setLoading(false);
    }
  }, [filtroTipo, filtroStato, filtroPriorita, filtroQ, filtroAssegnato]);

  useEffect(() => { caricaTickets(); }, [caricaTickets]);

  const apriDettaglio = (id: number) => {
    navigate(`/tickets/${id}`);
  };

  const statoOptions = [
    'aperto','ricevuto','assegnato','in_lavorazione',
    'in_attesa_ricambi','sospeso','risolto','chiuso','annullato',
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Ticket className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Ticket</h1>
              <p className="text-sm text-gray-500">{totale} ticket totali</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={caricaTickets}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="Aggiorna"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setShowNuovo(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Nuovo Ticket
            </button>
          </div>
        </div>
      </div>

      {/* Filtri */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Ricerca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={filtroQ}
              onChange={e => setFiltroQ(e.target.value)}
              placeholder="Cerca ticket..."
              className="pl-9 pr-3 py-1.5 border rounded-lg text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Tipo */}
          <select
            value={filtroTipo}
            onChange={e => setFiltroTipo(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tutti i tipi</option>
            <option value="interno">Interno</option>
            <option value="esterno">Esterno</option>
          </select>

          {/* Stato */}
          <select
            value={filtroStato}
            onChange={e => setFiltroStato(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tutti gli stati</option>
            {statoOptions.map(s => (
              <option key={s} value={s}>{STATO_CONFIG[s]?.label ?? s}</option>
            ))}
          </select>

          {/* Priorità */}
          <select
            value={filtroPriorita}
            onChange={e => setFiltroPriorita(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tutte le priorità</option>
            <option value="urgente">Urgente</option>
            <option value="alta">Alta</option>
            <option value="normale">Normale</option>
            <option value="bassa">Bassa</option>
          </select>

          {/* Assegnato */}
          <select
            value={filtroAssegnato}
            onChange={e => setFiltroAssegnato(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tutti i tecnici</option>
            {utenti.map(u => (
              <option key={u.id} value={u.id}>{u.nome_completo || u.username}</option>
            ))}
          </select>

          {(filtroTipo || filtroStato || filtroPriorita || filtroQ || filtroAssegnato) && (
            <button
              onClick={() => {
                setFiltroTipo(''); setFiltroStato(''); setFiltroPriorita('');
                setFiltroQ(''); setFiltroAssegnato('');
              }}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Azzera filtri
            </button>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Ticket className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Nessun ticket trovato</p>
            <p className="text-sm mt-1">Prova a modificare i filtri o crea un nuovo ticket</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tickets.map(ticket => {
              const scaduto = ticket.scadenza &&
                new Date(ticket.scadenza) < new Date() &&
                !['chiuso','annullato','risolto'].includes(ticket.stato);

              return (
                <div
                  key={ticket.id}
                  onClick={() => apriDettaglio(ticket.id)}
                  className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all ${
                    scaduto ? 'border-red-200 bg-red-50' : 'border-gray-200 hover:border-blue-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-gray-400">{ticket.numero_ticket}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          ticket.tipo === 'interno'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {ticket.tipo === 'interno' ? '🔧 Interno' : '📞 Esterno'}
                        </span>
                        {ticket.categoria_nome && (
                          <span
                            className="text-xs px-1.5 py-0.5 rounded font-medium text-white"
                            style={{ backgroundColor: ticket.categoria_colore || '#6B7280' }}
                          >
                            {ticket.categoria_nome}
                          </span>
                        )}
                        {scaduto && (
                          <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> Scaduto
                          </span>
                        )}
                      </div>

                      <p className="font-medium text-gray-900 truncate">{ticket.titolo}</p>

                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        {ticket.cliente_nome && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {ticket.cliente_nome}
                          </span>
                        )}
                        {ticket.impianto_codice && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {ticket.impianto_codice}
                          </span>
                        )}
                        {ticket.assegnato_nome && (
                          <span className="flex items-center gap-1">
                            <ArrowRight className="h-3 w-3" />
                            {ticket.assegnato_nome}
                          </span>
                        )}
                        {ticket.scadenza && (
                          <span className={`flex items-center gap-1 ${scaduto ? 'text-red-500' : ''}`}>
                            <Clock className="h-3 w-3" />
                            {new Date(ticket.scadenza).toLocaleDateString('it-IT')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <PrioritaBadge priorita={ticket.priorita} />
                      <StatoBadge stato={ticket.stato} />
                      <ExternalLink className="h-4 w-4 text-gray-300" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal nuovo ticket */}
      {showNuovo && (
        <NuovoTicketModal
          onClose={() => setShowNuovo(false)}
          onCreato={caricaTickets}
          utenti={utenti}
          clienti={clienti}
          categorie={categorie}
        />
      )}
    </div>
  );
}
