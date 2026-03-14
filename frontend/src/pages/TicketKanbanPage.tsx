import { useState, useEffect, useCallback } from 'react';
import {
  Ticket, User, Wrench, Package, CheckCircle2, XCircle,
  Pause, RefreshCw, Loader2, Building2, Clock, AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '/api';

// ==========================================
// TIPI
// ==========================================
interface TicketKanban {
  id: number;
  numero_ticket: string;
  tipo: 'interno' | 'esterno';
  titolo: string;
  stato: string;
  priorita: string;
  cliente_nome?: string;
  impianto_codice?: string;
  assegnato_nome?: string;
  categoria_nome?: string;
  categoria_colore?: string;
  scadenza?: string;
  created_at: string;
}

// ==========================================
// CONFIG COLONNE
// ==========================================
const COLONNE_INTERNE = [
  { stato: 'aperto',         label: 'Aperto',         colore: 'border-gray-300',   bg: 'bg-gray-50' },
  { stato: 'assegnato',      label: 'Assegnato',      colore: 'border-indigo-300', bg: 'bg-indigo-50' },
  { stato: 'in_lavorazione', label: 'In lavorazione', colore: 'border-amber-300',  bg: 'bg-amber-50' },
  { stato: 'sospeso',        label: 'Sospeso',        colore: 'border-gray-300',   bg: 'bg-gray-100' },
  { stato: 'risolto',        label: 'Risolto',        colore: 'border-emerald-300',bg: 'bg-emerald-50' },
];

const COLONNE_ESTERNE = [
  { stato: 'ricevuto',           label: 'Ricevuto',       colore: 'border-gray-300',   bg: 'bg-gray-50' },
  { stato: 'assegnato',          label: 'Assegnato',      colore: 'border-indigo-300', bg: 'bg-indigo-50' },
  { stato: 'in_lavorazione',     label: 'In lavorazione', colore: 'border-amber-300',  bg: 'bg-amber-50' },
  { stato: 'in_attesa_ricambi',  label: 'Attesa ricambi', colore: 'border-purple-300', bg: 'bg-purple-50' },
  { stato: 'risolto',            label: 'Risolto',        colore: 'border-emerald-300',bg: 'bg-emerald-50' },
];

const PRIORITA_CONFIG: Record<string, { dot: string; label: string }> = {
  urgente: { dot: 'bg-red-500',    label: 'Urgente' },
  alta:    { dot: 'bg-orange-400', label: 'Alta' },
  media:   { dot: 'bg-yellow-400', label: 'Media' },
  bassa:   { dot: 'bg-green-400',  label: 'Bassa' },
};

// ==========================================
// CARD TICKET
// ==========================================
function TicketCard({
  ticket,
  onApri,
  onSposta,
  statiAvanti,
}: {
  ticket: TicketKanban;
  onApri: () => void;
  onSposta: (statoNuovo: string) => void;
  statiAvanti: string[];
}) {
  const scaduto = ticket.scadenza && new Date(ticket.scadenza) < new Date()
    && !['chiuso', 'annullato', 'risolto'].includes(ticket.stato);

  const priorita = PRIORITA_CONFIG[ticket.priorita] ?? { dot: 'bg-gray-300', label: ticket.priorita };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow p-3 space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-mono text-gray-400">{ticket.numero_ticket}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
            ticket.tipo === 'interno' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {ticket.tipo === 'interno' ? '🔧' : '📞'}
          </span>
          <span className={`h-2 w-2 rounded-full ${priorita.dot}`} title={priorita.label} />
        </div>
        <button
          onClick={onApri}
          className="shrink-0 p-0.5 text-gray-400 hover:text-blue-600"
          title="Apri dettaglio"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Titolo */}
      <p
        className="text-sm font-medium text-gray-800 leading-snug cursor-pointer hover:text-blue-700 line-clamp-2"
        onClick={onApri}
      >
        {ticket.titolo}
      </p>

      {/* Meta */}
      <div className="space-y-1">
        {ticket.cliente_nome && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{ticket.cliente_nome}</span>
          </div>
        )}
        {ticket.impianto_codice && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{ticket.impianto_codice}</span>
          </div>
        )}
        {ticket.assegnato_nome && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Wrench className="h-3 w-3 shrink-0" />
            <span className="truncate">{ticket.assegnato_nome}</span>
          </div>
        )}
        {ticket.scadenza && (
          <div className={`flex items-center gap-1 text-xs ${scaduto ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
            <Clock className="h-3 w-3 shrink-0" />
            <span>
              {scaduto && '⚠ '}
              {new Date(ticket.scadenza).toLocaleDateString('it-IT', {
                day: '2-digit', month: '2-digit', year: '2-digit'
              })}
            </span>
          </div>
        )}
      </div>

      {/* Categoria */}
      {ticket.categoria_nome && (
        <span
          className="inline-block text-xs px-2 py-0.5 rounded-full text-white"
          style={{ backgroundColor: ticket.categoria_colore || '#6B7280' }}
        >
          {ticket.categoria_nome}
        </span>
      )}

      {/* Azioni rapide */}
      {statiAvanti.length > 0 && (
        <div className="pt-1 border-t flex flex-wrap gap-1">
          {statiAvanti.map(s => (
            <button
              key={s}
              onClick={() => onSposta(s)}
              className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-blue-100 hover:text-blue-700 rounded-full text-gray-600 transition-colors"
            >
              → {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// COLONNA KANBAN
// ==========================================
function Colonna({
  config,
  tickets,
  onApriTicket,
  onSpostaTicket,
  transizioni,
}: {
  config: { stato: string; label: string; colore: string; bg: string };
  tickets: TicketKanban[];
  onApriTicket: (id: number) => void;
  onSpostaTicket: (id: number, statoNuovo: string) => void;
  transizioni: Record<string, string[]>;
}) {
  return (
    <div className={`flex flex-col rounded-xl border-2 ${config.colore} ${config.bg} min-w-[240px] max-w-[280px] flex-1`}>
      {/* Header colonna */}
      <div className="px-3 py-2.5 border-b border-current/20 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{config.label}</span>
        <span className="text-xs bg-white px-2 py-0.5 rounded-full text-gray-500 font-medium">
          {tickets.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-220px)]">
        {tickets.length === 0 ? (
          <p className="text-xs text-gray-300 text-center py-4">Nessun ticket</p>
        ) : (
          tickets.map(t => (
            <TicketCard
              key={t.id}
              ticket={t}
              onApri={() => onApriTicket(t.id)}
              onSposta={(s) => onSpostaTicket(t.id, s)}
              statiAvanti={(transizioni[t.stato] ?? []).filter(s => !['sospeso', 'annullato'].includes(s))}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ==========================================
// PAGINA KANBAN
// ==========================================
export default function TicketKanbanPage() {
  const [tickets,  setTickets]  = useState<TicketKanban[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [tipoView, setTipoView] = useState<'interno' | 'esterno'>('interno');
  const [filtroAssegnato, setFiltroAssegnato] = useState('');
  const [utenti, setUtenti] = useState<{ id: number; nome: string }[]>([]);

  const TRANSIZIONI_INTERNE: Record<string, string[]> = {
    aperto:         ['assegnato'],
    assegnato:      ['in_lavorazione', 'sospeso'],
    in_lavorazione: ['risolto', 'sospeso'],
    sospeso:        ['in_lavorazione'],
    risolto:        ['chiuso'],
  };

  const TRANSIZIONI_ESTERNE: Record<string, string[]> = {
    ricevuto:          ['assegnato'],
    assegnato:         ['in_lavorazione', 'sospeso'],
    in_lavorazione:    ['in_attesa_ricambi', 'risolto', 'sospeso'],
    in_attesa_ricambi: ['in_lavorazione', 'risolto'],
    sospeso:           ['in_lavorazione'],
    risolto:           ['chiuso'],
  };

  const transizioni = tipoView === 'interno' ? TRANSIZIONI_INTERNE : TRANSIZIONI_ESTERNE;
  const colonne     = tipoView === 'interno' ? COLONNE_INTERNE      : COLONNE_ESTERNE;

  useEffect(() => {
    fetch(`${API_BASE}/utenti`).then(r => r.ok ? r.json() : []).then(setUtenti).catch(() => {});
  }, []);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tipo: tipoView, limit: '200' });
      if (filtroAssegnato) params.set('assegnato_a', filtroAssegnato);
      const res = await fetch(`${API_BASE}/tickets?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTickets(data.items ?? data.tickets ?? data);
    } catch {
      toast.error('Errore caricamento ticket');
    } finally {
      setLoading(false);
    }
  }, [tipoView, filtroAssegnato]);

  useEffect(() => { carica(); }, [carica]);

  const handleSposta = async (ticketId: number, statoNuovo: string) => {
    try {
      const res = await fetch(`${API_BASE}/tickets/${ticketId}/transizione`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stato_nuovo: statoNuovo }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail);
      }
      // Aggiorna localmente senza reload completo
      setTickets(prev => prev.map(t =>
        t.id === ticketId ? { ...t, stato: statoNuovo } : t
      ));
    } catch (e: any) {
      toast.error(e.message);
      carica();
    }
  };

  const ticketPerColonna = (stato: string) =>
    tickets.filter(t => t.stato === stato && t.tipo === tipoView);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Ticket className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Kanban Ticket</h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Toggle tipo */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              {(['interno', 'esterno'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTipoView(t)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    tipoView === t
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t === 'interno' ? '🔧 Interni' : '📞 Esterni'}
                </button>
              ))}
            </div>

            {/* Filtro tecnico */}
            <select
              value={filtroAssegnato}
              onChange={e => setFiltroAssegnato(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tutti i tecnici</option>
              {utenti.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>

            <button
              onClick={carica}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-4 h-full" style={{ minWidth: `${colonne.length * 260}px` }}>
            {colonne.map(col => (
              <Colonna
                key={col.stato}
                config={col}
                tickets={ticketPerColonna(col.stato)}
                onApriTicket={id => window.open(`/tickets/${id}`, '_blank')}
                onSpostaTicket={handleSposta}
                transizioni={transizioni}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
