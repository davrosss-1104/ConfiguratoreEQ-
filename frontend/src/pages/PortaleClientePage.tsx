import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ticket, Package, FileText, LogOut, RefreshCw, Loader2,
  CheckCircle2, Clock, Send, ChevronRight, ArrowLeft,
  MessageSquare, Plus, AlertCircle, Wrench, Building2,
  ChevronDown, MapPin, Calendar, X, ShoppingCart,
} from 'lucide-react';
import { toast } from 'sonner';

const API = '/api/portale';

// ── Auth helpers ──────────────────────────────────────────────────────────────

function getToken(): string | null { return localStorage.getItem('token'); }
function authH() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

// ── Stato badge ───────────────────────────────────────────────────────────────

const STATO_CFG: Record<string, { label: string; bg: string; text: string }> = {
  ricevuto:          { label: 'Ricevuto',        bg: 'bg-gray-100',    text: 'text-gray-700'    },
  assegnato:         { label: 'Preso in carico', bg: 'bg-indigo-100',  text: 'text-indigo-700'  },
  in_lavorazione:    { label: 'In lavorazione',  bg: 'bg-amber-100',   text: 'text-amber-700'   },
  in_attesa_ricambi: { label: 'Attesa ricambi',  bg: 'bg-purple-100',  text: 'text-purple-700'  },
  sospeso:           { label: 'Sospeso',         bg: 'bg-gray-100',    text: 'text-gray-500'    },
  risolto:           { label: 'Risolto',         bg: 'bg-emerald-100', text: 'text-emerald-700' },
  chiuso:            { label: 'Chiuso',          bg: 'bg-gray-200',    text: 'text-gray-500'    },
  annullato:         { label: 'Annullato',       bg: 'bg-red-100',     text: 'text-red-700'     },
  confermato:        { label: 'Confermato',      bg: 'bg-indigo-100',  text: 'text-indigo-700'  },
  in_produzione:     { label: 'In produzione',   bg: 'bg-amber-100',   text: 'text-amber-700'   },
  completato:        { label: 'Completato',      bg: 'bg-emerald-100', text: 'text-emerald-700' },
  spedito:           { label: 'Spedito',         bg: 'bg-blue-100',    text: 'text-blue-700'    },
  fatturato:         { label: 'Fatturato',       bg: 'bg-green-100',   text: 'text-green-700'   },
};

function Badge({ stato }: { stato: string }) {
  const c = STATO_CFG[stato] ?? { label: stato, bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function fmt(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDt(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

// ── Modale apertura ticket ────────────────────────────────────────────────────

function ModaleNuovoTicket({
  impianti,
  onClose,
  onCreato,
}: {
  impianti: any[];
  onClose: () => void;
  onCreato: (id: number) => void;
}) {
  const [form, setForm] = useState({ titolo: '', descrizione: '', impianto_id: '', priorita: 'normale' });
  const [saving, setSaving] = useState(false);

  const handleSalva = async () => {
    if (!form.titolo.trim()) { toast.error('Titolo obbligatorio'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/tickets`, {
        method: 'POST',
        headers: authH(),
        body: JSON.stringify({
          titolo: form.titolo,
          descrizione: form.descrizione,
          priorita: form.priorita,
          impianto_id: form.impianto_id ? parseInt(form.impianto_id) : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      const data = await res.json();
      toast.success(`Richiesta ${data.numero_ticket} aperta`);
      onCreato(data.id);
    } catch (e: any) {
      toast.error(e.message || 'Errore apertura ticket');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-base font-bold text-gray-900">Nuova richiesta di assistenza</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Oggetto *</label>
            <input
              value={form.titolo}
              onChange={e => setForm(f => ({ ...f, titolo: e.target.value }))}
              placeholder="Descrivi brevemente il problema..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione dettagliata</label>
            <textarea
              value={form.descrizione}
              onChange={e => setForm(f => ({ ...f, descrizione: e.target.value }))}
              placeholder="Fornisci tutti i dettagli utili per risolvere il problema..."
              rows={4}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {impianti.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Impianto</label>
                <select
                  value={form.impianto_id}
                  onChange={e => setForm(f => ({ ...f, impianto_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">— Seleziona —</option>
                  {impianti.map(i => (
                    <option key={i.id} value={i.id}>{i.codice_cliente}{i.descrizione ? ` — ${i.descrizione}` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priorità</label>
              <select
                value={form.priorita}
                onChange={e => setForm(f => ({ ...f, priorita: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="bassa">Bassa</option>
                <option value="normale">Normale</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Annulla
          </button>
          <button
            onClick={handleSalva}
            disabled={saving || !form.titolo.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Invia richiesta
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Timeline ordine ───────────────────────────────────────────────────────────

const STATI_ORDINE_ORDINE = ['confermato','in_produzione','completato','spedito','fatturato'];
const STATI_LABELS: Record<string, string> = {
  confermato:   'Ordine confermato',
  in_produzione:'In produzione',
  completato:   'Completato',
  spedito:      'Spedito',
  fatturato:    'Fatturato',
  sospeso:      'Sospeso',
  annullato:    'Annullato',
};

function TimelineOrdine({ storico }: { storico: any[] }) {
  if (!storico?.length) return null;
  const ultimoStato = storico[storico.length - 1]?.stato_nuovo;
  const idxCorrente = STATI_ORDINE_ORDINE.indexOf(ultimoStato);

  return (
    <div className="mt-4">
      {/* Barra progress desktop */}
      <div className="hidden sm:flex items-center mb-2">
        {STATI_ORDINE_ORDINE.map((stato, idx) => {
          const raggiunto = idxCorrente >= idx;
          const corrente  = idxCorrente === idx;
          return (
            <div key={stato} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  corrente  ? 'bg-blue-600 border-blue-600 text-white' :
                  raggiunto ? 'bg-emerald-500 border-emerald-500 text-white' :
                              'bg-white border-gray-200 text-gray-300'
                }`}>
                  {raggiunto && !corrente
                    ? <CheckCircle2 className="w-4 h-4" />
                    : idx + 1
                  }
                </div>
                <span className={`text-xs mt-1 text-center w-20 leading-tight ${
                  corrente ? 'text-blue-600 font-medium' :
                  raggiunto ? 'text-emerald-600' : 'text-gray-300'
                }`}>{STATI_LABELS[stato]}</span>
              </div>
              {idx < STATI_ORDINE_ORDINE.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${raggiunto && idxCorrente > idx ? 'bg-emerald-400' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Lista storico */}
      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Storico aggiornamenti</p>
        {storico.map((s, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-800">{STATI_LABELS[s.stato_nuovo] ?? s.stato_nuovo}</span>
              {s.motivo && <span className="text-sm text-gray-500"> — {s.motivo}</span>}
              <span className="block text-xs text-gray-400">{fmtDt(s.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sezione Homepage ──────────────────────────────────────────────────────────

function SezioneHome({
  dashboard, onNavigate,
}: {
  dashboard: any;
  onNavigate: (s: SezionePortale) => void;
}) {
  if (!dashboard) return null;
  const { ticket_stats: tk, ordine_stats: ord, n_preventivi, feed } = dashboard;

  const FEED_ICONE: Record<string, React.ReactNode> = {
    ticket: <Ticket className="w-4 h-4 text-indigo-500" />,
    ordine: <Package className="w-4 h-4 text-blue-500" />,
  };

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button onClick={() => onNavigate('tickets')}
          className="bg-white rounded-xl border p-4 text-left hover:shadow-md hover:border-indigo-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Richieste aperte</span>
            <Ticket className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-3xl font-bold text-indigo-600">{tk.aperti}</p>
          <p className="text-xs text-gray-400 mt-1">{tk.totale} totali</p>
        </button>

        <button onClick={() => onNavigate('ordini')}
          className="bg-white rounded-xl border p-4 text-left hover:shadow-md hover:border-blue-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Ordini in corso</span>
            <Package className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-blue-600">{ord.in_corso}</p>
          <p className="text-xs text-gray-400 mt-1">{ord.totale} totali</p>
        </button>

        <button onClick={() => onNavigate('preventivi')}
          className="bg-white rounded-xl border p-4 text-left hover:shadow-md hover:border-emerald-200 transition-all">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Preventivi</span>
            <FileText className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-3xl font-bold text-emerald-600">{n_preventivi}</p>
          <p className="text-xs text-gray-400 mt-1">&nbsp;</p>
        </button>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">Ticket risolti</span>
            <CheckCircle2 className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-3xl font-bold text-gray-600">{tk.risolti}</p>
          {tk.in_attesa_ricambi > 0 && (
            <p className="text-xs text-purple-500 mt-1">{tk.in_attesa_ricambi} in attesa ricambi</p>
          )}
        </div>
      </div>

      {/* Feed attività recenti */}
      {feed?.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-4">Attività recente</h3>
          <div className="space-y-3">
            {feed.map((item: any, i: number) => (
              <button
                key={i}
                onClick={() => onNavigate(item.tipo === 'ticket' ? 'tickets' : 'ordini')}
                className="w-full flex items-center gap-3 py-2 hover:bg-gray-50 rounded-lg px-2 transition-colors text-left"
              >
                <div className="p-1.5 bg-gray-100 rounded-lg shrink-0">
                  {FEED_ICONE[item.tipo]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400">{item.numero}</span>
                    <Badge stato={item.stato} />
                  </div>
                  <p className="text-sm text-gray-700 truncate">{item.descrizione}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0">{fmt(item.data)}</span>
                <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sezione Ticket ────────────────────────────────────────────────────────────

function TicketDettaglio({ ticketId, onBack }: { ticketId: number; onBack: () => void }) {
  const [ticket, setTicket] = useState<any>(null);
  const [materiali, setMateriali] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [testo, setTesto] = useState('');
  const [inviando, setInviando] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const [rTk, rMat] = await Promise.all([
        fetch(`${API}/tickets/${ticketId}`, { headers: authH() }),
        fetch(`${API}/tickets/${ticketId}/materiali`, { headers: authH() }),
      ]);
      if (!rTk.ok) throw new Error();
      setTicket(await rTk.json());
      if (rMat.ok) setMateriali(await rMat.json());
    } catch { toast.error('Errore caricamento'); }
    setLoading(false);
  }, [ticketId]);

  useEffect(() => { carica(); }, [carica]);

  const handleInvia = async () => {
    if (!testo.trim()) return;
    setInviando(true);
    try {
      const res = await fetch(`${API}/tickets/${ticketId}/rispondi`, {
        method: 'POST', headers: authH(), body: JSON.stringify({ testo }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      setTesto('');
      toast.success('Messaggio inviato');
      carica();
    } catch (e: any) { toast.error(e.message || 'Errore'); }
    setInviando(false);
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-500" /></div>;
  if (!ticket) return null;

  const terminale = ['chiuso', 'annullato'].includes(ticket.stato);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
        <ArrowLeft className="h-4 w-4" /> Torna alle richieste
      </button>

      <div className="bg-white rounded-xl border p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-mono text-gray-400 mb-1">{ticket.numero_ticket}</p>
            <h2 className="text-lg font-bold text-gray-900">{ticket.titolo}</h2>
          </div>
          <Badge stato={ticket.stato} />
        </div>
        {ticket.descrizione && (
          <p className="text-sm text-gray-600 whitespace-pre-wrap border-t pt-3">{ticket.descrizione}</p>
        )}
        <div className="flex flex-wrap gap-4 text-xs text-gray-400 border-t pt-3">
          <span>Aperto il {fmt(ticket.created_at)}</span>
          {ticket.impianto_codice && <span>· Impianto: <strong>{ticket.impianto_codice}</strong></span>}
          {ticket.categoria_nome && (
            <span className="inline-flex items-center gap-1">
              · <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ticket.categoria_colore || '#6B7280' }} />
              {ticket.categoria_nome}
            </span>
          )}
          {ticket.risolto_at && <span className="text-emerald-600">· Risolto il {fmt(ticket.risolto_at)}</span>}
        </div>
      </div>

      {ticket.soluzione && (
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-700">Soluzione</span>
          </div>
          <p className="text-sm text-emerald-800 whitespace-pre-wrap">{ticket.soluzione}</p>
        </div>
      )}

      {/* Materiali impiegati (visibili al cliente) */}
      {materiali.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-semibold text-gray-800">Parti/Materiali utilizzati</span>
          </div>
          <div className="divide-y">
            {materiali.map((m: any) => (
              <div key={m.id} className="py-2 flex items-center justify-between">
                <div>
                  {m.codice && <span className="text-xs font-mono text-gray-400 mr-2">{m.codice}</span>}
                  <span className="text-sm text-gray-700">{m.descrizione}</span>
                  {m.note && <span className="text-xs text-gray-400 block">{m.note}</span>}
                </div>
                <span className="text-sm font-medium text-gray-600 shrink-0 ml-4">
                  {m.quantita} {m.unita_misura || 'pz'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-semibold text-gray-800">
            Comunicazioni ({ticket.messaggi?.length ?? 0})
          </span>
        </div>
        <div className="divide-y max-h-96 overflow-y-auto">
          {!ticket.messaggi?.length
            ? <p className="text-sm text-gray-400 text-center py-8">Nessuna comunicazione</p>
            : ticket.messaggi.map((m: any) => {
                const isCliente = m.tipo === 'risposta_cliente';
                const isStato   = m.tipo === 'cambio_stato';
                return (
                  <div key={m.id} className={`p-4 ${isStato ? 'bg-gray-50' : isCliente ? 'bg-blue-50' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isStato   ? 'bg-gray-200 text-gray-600' :
                        isCliente ? 'bg-blue-200 text-blue-700' : 'bg-indigo-100 text-indigo-700'
                      }`}>
                        {isStato ? '↕' : isCliente ? 'Tu' : (m.autore?.[0] ?? 'A').toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-medium text-gray-700">
                            {isCliente ? 'Tu' : isStato ? 'Sistema' : (m.autore || 'Assistenza')}
                          </span>
                          <span className="text-xs text-gray-400">{fmtDt(m.created_at)}</span>
                        </div>
                        <p className={`text-sm mt-0.5 ${isStato ? 'text-gray-500 italic' : 'text-gray-700'}`}>
                          {m.testo}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
          }
        </div>
        {!terminale && (
          <div className="p-4 border-t bg-gray-50">
            <textarea
              value={testo}
              onChange={e => setTesto(e.target.value)}
              placeholder="Scrivi un messaggio..."
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none bg-white"
              onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleInvia(); }}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">Ctrl+Invio per inviare</span>
              <button
                onClick={handleInvia}
                disabled={!testo.trim() || inviando}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
              >
                {inviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Invia
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SezioneTickets({
  impianti,
  onApriDettaglio,
  ticketAperto,
  onChiudiDettaglio,
}: {
  impianti: any[];
  onApriDettaglio: (id: number) => void;
  ticketAperto: number | null;
  onChiudiDettaglio: () => void;
}) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<'tutti' | 'aperti' | 'chiusi'>('aperti');
  const [showModale, setShowModale] = useState(false);

  const carica = useCallback(async () => {
    setLoading(true);
    try {
      const param = filtro !== 'tutti' ? `?stato=${filtro}` : '';
      const res = await fetch(`${API}/tickets${param}`, { headers: authH() });
      if (res.ok) setTickets(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, [filtro]);

  useEffect(() => { if (!ticketAperto) carica(); }, [carica, ticketAperto]);

  if (ticketAperto) {
    return <TicketDettaglio ticketId={ticketAperto} onBack={onChiudiDettaglio} />;
  }

  const PRIORITA_DOT: Record<string, string> = {
    urgente: 'bg-red-500', alta: 'bg-orange-400', normale: 'bg-blue-400', bassa: 'bg-green-400',
  };

  return (
    <div className="space-y-4">
      {showModale && (
        <ModaleNuovoTicket
          impianti={impianti}
          onClose={() => setShowModale(false)}
          onCreato={(id) => { setShowModale(false); carica(); onApriDettaglio(id); }}
        />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(['aperti','tutti','chiusi'] as const).map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filtro === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}>
              {f === 'aperti' ? 'In corso' : f === 'chiusi' ? 'Chiusi' : 'Tutti'}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowModale(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" /> Nuova richiesta
        </button>
      </div>

      {loading
        ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-500" /></div>
        : tickets.length === 0
          ? (
            <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
              <Ticket className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="mb-4">Nessuna richiesta {filtro === 'aperti' ? 'in corso' : filtro === 'chiusi' ? 'chiusa' : ''}</p>
              <button onClick={() => setShowModale(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                <Plus className="w-4 h-4" /> Apri una richiesta
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {tickets.map(t => (
                <button key={t.id} onClick={() => onApriDettaglio(t.id)}
                  className="w-full bg-white rounded-xl border p-4 hover:shadow-sm hover:border-blue-200 transition-all text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-gray-400">{t.numero_ticket}</span>
                        <Badge stato={t.stato} />
                        {t.priorita && t.priorita !== 'normale' && (
                          <span className={`w-2 h-2 rounded-full ${PRIORITA_DOT[t.priorita] ?? 'bg-gray-300'}`} title={t.priorita} />
                        )}
                      </div>
                      <p className="text-sm font-medium text-gray-900 truncate">{t.titolo}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span>{fmt(t.created_at)}</span>
                        {t.impianto_codice && <span>· {t.impianto_codice}</span>}
                        {t.categoria_nome && (
                          <span className="flex items-center gap-1">
                            · <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.categoria_colore || '#6B7280' }} />
                            {t.categoria_nome}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {t.n_messaggi > 0 && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> {t.n_messaggi}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
      }
    </div>
  );
}

// ── Sezione Ordini ────────────────────────────────────────────────────────────

function OrdineDettaglio({ ordineId, onBack }: { ordineId: number; onBack: () => void }) {
  const [ordine, setOrdine] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/ordini/${ordineId}`, { headers: authH() });
        if (res.ok) setOrdine(await res.json());
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, [ordineId]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-500" /></div>;
  if (!ordine) return null;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
        <ArrowLeft className="h-4 w-4" /> Torna agli ordini
      </button>

      <div className="bg-white rounded-xl border p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{ordine.numero_ordine}</h2>
            {ordine.tipo_impianto && <p className="text-sm text-gray-500 mt-0.5">{ordine.tipo_impianto}</p>}
          </div>
          <Badge stato={ordine.stato} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm border-t pt-4">
          {ordine.numero_preventivo && (
            <div>
              <p className="text-xs text-gray-400">Preventivo</p>
              <p className="font-medium text-gray-700">{ordine.numero_preventivo}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-400">Data conferma</p>
            <p className="font-medium text-gray-700">{fmt(ordine.created_at)}</p>
          </div>
          {ordine.data_consegna_prevista && (
            <div>
              <p className="text-xs text-gray-400">Consegna prevista</p>
              <p className={`font-medium ${new Date(ordine.data_consegna_prevista) < new Date() && !['completato','spedito','fatturato'].includes(ordine.stato) ? 'text-red-600' : 'text-gray-700'}`}>
                {fmt(ordine.data_consegna_prevista)}
              </p>
            </div>
          )}
          {ordine.totale_netto > 0 && (
            <div>
              <p className="text-xs text-gray-400">Importo</p>
              <p className="font-medium text-gray-700">€ {ordine.totale_netto?.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</p>
            </div>
          )}
        </div>

        {/* Timeline */}
        {ordine.storico_stati?.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-3">Avanzamento ordine</p>
            <TimelineOrdine storico={ordine.storico_stati} />
          </div>
        )}

        {/* Impianti */}
        {ordine.impianti?.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" /> Impianti
            </p>
            <div className="space-y-1">
              {ordine.impianti.map((i: any, idx: number) => (
                <div key={idx} className="text-sm text-gray-600">
                  <span className="font-mono text-xs text-gray-400 mr-2">{i.codice_cliente}</span>
                  {i.descrizione && <span>{i.descrizione}</span>}
                  {i.indirizzo_installazione && <span className="text-gray-400"> — {i.indirizzo_installazione}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ticket collegati */}
        {ordine.tickets_collegati?.length > 0 && (
          <div className="border-t pt-4">
            <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Ticket className="w-4 h-4 text-gray-400" /> Richieste di assistenza collegate
            </p>
            <div className="space-y-1">
              {ordine.tickets_collegati.map((t: any) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-gray-400">{t.numero_ticket}</span>
                  <span className="text-gray-700 truncate">{t.titolo}</span>
                  <Badge stato={t.stato} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SezioneOrdini() {
  const [ordini, setOrdini] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ordineAperto, setOrdineAperto] = useState<number | null>(null);

  useEffect(() => {
    if (ordineAperto) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/ordini`, { headers: authH() });
        if (res.ok) setOrdini(await res.json());
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, [ordineAperto]);

  if (ordineAperto) {
    return <OrdineDettaglio ordineId={ordineAperto} onBack={() => setOrdineAperto(null)} />;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-gray-800">I tuoi ordini</h2>
      {loading
        ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-500" /></div>
        : ordini.length === 0
          ? (
            <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nessun ordine</p>
            </div>
          ) : (
            ordini.map(o => (
              <button key={o.id} onClick={() => setOrdineAperto(o.id)}
                className="w-full bg-white rounded-xl border p-4 hover:shadow-sm hover:border-blue-200 transition-all text-left">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-gray-900">{o.numero_ordine}</span>
                      <Badge stato={o.stato} />
                    </div>
                    {o.tipo_impianto && <p className="text-sm text-gray-600">{o.tipo_impianto}</p>}
                    <div className="flex gap-4 mt-1 text-xs text-gray-400">
                      <span>Confermato il {fmt(o.created_at)}</span>
                      {o.data_consegna_prevista && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Consegna: {fmt(o.data_consegna_prevista)}
                        </span>
                      )}
                      {o.numero_preventivo && <span>Prev. {o.numero_preventivo}</span>}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 mt-1" />
                </div>
              </button>
            ))
          )
      }
    </div>
  );
}

// ── Sezione Preventivi ────────────────────────────────────────────────────────

function SezionePreventivi() {
  const [preventivi, setPreventivi] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/preventivi`, { headers: authH() });
        if (res.ok) setPreventivi(await res.json());
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-gray-800">I tuoi preventivi</h2>
      {loading
        ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-500" /></div>
        : preventivi.length === 0
          ? (
            <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nessun preventivo</p>
            </div>
          ) : (
            preventivi.map(p => (
              <div key={p.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-gray-900">{p.numero_preventivo}</span>
                      {p.categoria && <span className="text-xs text-gray-400">{p.categoria}</span>}
                    </div>
                    {p.numero_ordine
                      ? (
                        <div className="flex items-center gap-2 text-xs mt-1">
                          <span className="text-gray-400">Ordine:</span>
                          <span className="font-medium text-gray-700">{p.numero_ordine}</span>
                          {p.stato_ordine && <Badge stato={p.stato_ordine} />}
                          {p.data_consegna_prevista && (
                            <span className="text-gray-400 flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {fmt(p.data_consegna_prevista)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 mt-1">Non ancora convertito in ordine</p>
                      )
                    }
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{fmt(p.created_at)}</span>
                </div>
              </div>
            ))
          )
      }
    </div>
  );
}

// ── Portale principale ────────────────────────────────────────────────────────

type SezionePortale = 'home' | 'tickets' | 'ordini' | 'preventivi';

export default function PortaleClientePage() {
  const navigate = useNavigate();
  const [sezione, setSezione]   = useState<SezionePortale>('home');
  const [cliente, setCliente]   = useState<any>(null);
  const [dashboard, setDash]    = useState<any>(null);
  const [impianti, setImpianti] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [ticketAperto, setTicketAperto] = useState<number | null>(null);

  useEffect(() => {
    if (!getToken()) { navigate('/login'); return; }
    caricaDati();
  }, []);

  const caricaDati = async () => {
    setLoading(true);
    try {
      const [rMe, rDash, rImp] = await Promise.all([
        fetch(`${API}/me`,        { headers: authH() }),
        fetch(`${API}/dashboard`, { headers: authH() }),
        fetch(`${API}/impianti`,  { headers: authH() }),
      ]);
      if (rMe.status === 401 || rMe.status === 403) { navigate('/login'); return; }
      if (rMe.ok)   setCliente(await rMe.json());
      if (rDash.ok) setDash(await rDash.json());
      if (rImp.ok)  setImpianti(await rImp.json());
    } catch { toast.error('Errore caricamento'); }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
    </div>
  );

  const navItems: { id: SezionePortale; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'home',       label: 'Riepilogo',   icon: <Building2 className="h-4 w-4" /> },
    { id: 'tickets',    label: 'Assistenza',  icon: <Ticket    className="h-4 w-4" />, badge: dashboard?.ticket_stats?.aperti },
    { id: 'ordini',     label: 'Ordini',      icon: <Package   className="h-4 w-4" />, badge: dashboard?.ordine_stats?.in_corso },
    { id: 'preventivi', label: 'Preventivi',  icon: <FileText  className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-base font-bold text-gray-900">Area Clienti</h1>
            {cliente && <p className="text-xs text-gray-500">{cliente.ragione_sociale}</p>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={caricaDati} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
              <RefreshCw className="h-4 w-4" />
            </button>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-500 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
              <LogOut className="h-4 w-4" /> Esci
            </button>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex gap-0 border-t">
          {navItems.map(item => (
            <button key={item.id} onClick={() => { setSezione(item.id); setTicketAperto(null); }}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                sezione === item.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {item.icon}
              <span className="hidden sm:inline">{item.label}</span>
              {!!item.badge && item.badge > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  sezione === item.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}>{item.badge}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {sezione === 'home' && (
          <SezioneHome dashboard={dashboard} onNavigate={(s) => setSezione(s)} />
        )}
        {sezione === 'tickets' && (
          <SezioneTickets
            impianti={impianti}
            onApriDettaglio={setTicketAperto}
            ticketAperto={ticketAperto}
            onChiudiDettaglio={() => setTicketAperto(null)}
          />
        )}
        {sezione === 'ordini'     && <SezioneOrdini />}
        {sezione === 'preventivi' && <SezionePreventivi />}
      </main>
    </div>
  );
}
