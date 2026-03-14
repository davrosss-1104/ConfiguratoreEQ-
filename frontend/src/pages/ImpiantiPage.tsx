import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Plus, Search, RefreshCw, ChevronRight,
  User, Package, Ticket, Edit2, Trash2, Save, X,
  ArrowLeft, Loader2, MapPin,
} from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '/api';

// ==========================================
// TIPI
// ==========================================
interface Impianto {
  id: number;
  codice_cliente: string;
  cliente_id?: number;
  cliente_nome?: string;
  descrizione?: string;
  indirizzo_installazione?: string;
  note?: string;
  created_at: string;
  // idratati in dettaglio
  ordini?: { id: number; numero_ordine: string; stato: string; created_at: string }[];
  tickets?: { id: number; numero_ticket: string; titolo: string; stato: string; created_at: string }[];
}

interface Cliente {
  id: number;
  ragione_sociale: string;
}

// ==========================================
// FORM IMPIANTO
// ==========================================
function ImpiantoForm({
  impianto,
  clienti,
  onSalva,
  onAnnulla,
}: {
  impianto?: Impianto | null;
  clienti: Cliente[];
  onSalva: () => void;
  onAnnulla: () => void;
}) {
  const [form, setForm] = useState({
    codice_cliente:          impianto?.codice_cliente          ?? '',
    cliente_id:              impianto?.cliente_id              ? String(impianto.cliente_id) : '',
    descrizione:             impianto?.descrizione             ?? '',
    indirizzo_installazione: impianto?.indirizzo_installazione ?? '',
    note:                    impianto?.note                    ?? '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSalva = async () => {
    if (!form.codice_cliente.trim()) { toast.error('Codice impianto obbligatorio'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        cliente_id: form.cliente_id ? Number(form.cliente_id) : null,
      };
      const url    = impianto ? `${API_BASE}/impianti/${impianto.id}` : `${API_BASE}/impianti`;
      const method = impianto ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Errore salvataggio');
      }
      toast.success(impianto ? 'Impianto aggiornato' : 'Impianto creato');
      onSalva();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="font-semibold text-gray-900">
        {impianto ? 'Modifica impianto' : 'Nuovo impianto'}
      </h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Codice impianto *</label>
          <input
            value={form.codice_cliente}
            onChange={e => set('codice_cliente', e.target.value)}
            placeholder="Es. MAT-2024-001"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">Codice assegnato dal cliente (matricola, cantiere...)</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
          <select
            value={form.cliente_id}
            onChange={e => set('cliente_id', e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— seleziona —</option>
            {clienti.map(c => (
              <option key={c.id} value={c.id}>{c.ragione_sociale}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione</label>
        <input
          value={form.descrizione}
          onChange={e => set('descrizione', e.target.value)}
          placeholder="Es. Ascensore corpo B scala 2"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo installazione</label>
        <input
          value={form.indirizzo_installazione}
          onChange={e => set('indirizzo_installazione', e.target.value)}
          placeholder="Via Roma 1, Milano"
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
        <textarea
          value={form.note}
          onChange={e => set('note', e.target.value)}
          rows={2}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSalva}
          disabled={saving}
          className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salva
        </button>
        <button onClick={onAnnulla} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
          Annulla
        </button>
      </div>
    </div>
  );
}

// ==========================================
// DETTAGLIO IMPIANTO
// ==========================================
function ImpiantoDettaglio({
  impianto,
  onModifica,
  onElimina,
  onChiudi,
}: {
  impianto: Impianto;
  onModifica: () => void;
  onElimina: () => void;
  onChiudi: () => void;
}) {
  const STATO_TICKET_COLORE: Record<string, string> = {
    aperto: 'bg-gray-100 text-gray-700', ricevuto: 'bg-gray-100 text-gray-700',
    assegnato: 'bg-indigo-100 text-indigo-700', in_lavorazione: 'bg-amber-100 text-amber-700',
    risolto: 'bg-emerald-100 text-emerald-700', chiuso: 'bg-gray-200 text-gray-500',
    annullato: 'bg-red-100 text-red-700',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="p-5 border-b flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">{impianto.codice_cliente}</h2>
          </div>
          {impianto.descrizione && (
            <p className="text-sm text-gray-500 mt-1">{impianto.descrizione}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onModifica}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
            title="Modifica"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            onClick={onElimina}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
            title="Elimina"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={onChiudi}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Info principali */}
        <div className="grid grid-cols-2 gap-4">
          {impianto.cliente_nome && (
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400">Cliente</p>
                <p className="text-sm font-medium text-gray-700">{impianto.cliente_nome}</p>
              </div>
            </div>
          )}
          {impianto.indirizzo_installazione && (
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs text-gray-400">Indirizzo</p>
                <p className="text-sm text-gray-700">{impianto.indirizzo_installazione}</p>
              </div>
            </div>
          )}
        </div>

        {impianto.note && (
          <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600">
            {impianto.note}
          </div>
        )}

        {/* Ordini collegati */}
        {impianto.ordini && impianto.ordini.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Package className="h-3.5 w-3.5" /> Ordini ({impianto.ordini.length})
            </p>
            <div className="space-y-1">
              {impianto.ordini.map(o => (
                <div
                  key={o.id}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm hover:bg-gray-100 cursor-pointer"
                  onClick={() => window.open(`/ordini?id=${o.id}`, '_blank')}
                >
                  <span className="font-mono text-gray-700">{o.numero_ordine}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{o.stato}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ticket collegati */}
        {impianto.tickets && (
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Ticket className="h-3.5 w-3.5" /> Ticket ({impianto.tickets.length})
            </p>
            {impianto.tickets.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">Nessun ticket per questo impianto</p>
            ) : (
              <div className="space-y-1">
                {impianto.tickets.map(t => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer"
                    onClick={() => window.open(`/tickets/${t.id}`, '_blank')}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-mono text-gray-400 block">{t.numero_ticket}</span>
                      <span className="text-sm text-gray-700 truncate block">{t.titolo}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATO_TICKET_COLORE[t.stato] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t.stato}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// PAGINA IMPIANTI
// ==========================================
export default function ImpiantiPage() {
  const [impianti,  setImpianti]  = useState<Impianto[]>([]);
  const [clienti,   setClienti]   = useState<Cliente[]>([]);
  const [loading,   setLoading]   = useState(true);

  const [filtroQ,        setFiltroQ]        = useState('');
  const [filtroCliente,  setFiltroCliente]  = useState('');

  const [selezionato,    setSelezionato]    = useState<Impianto | null>(null);
  const [loadingDettaglio, setLoadingDettaglio] = useState(false);
  const [mostraForm,     setMostraForm]     = useState(false);
  const [editando,       setEditando]       = useState<Impianto | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/clienti`).then(r => r.ok ? r.json() : []).then(setClienti).catch(() => {});
  }, []);

  const caricaImpianti = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroQ)       params.set('q',         filtroQ);
      if (filtroCliente) params.set('cliente_id', filtroCliente);
      const res = await fetch(`${API_BASE}/impianti?${params}`);
      if (!res.ok) throw new Error();
      setImpianti(await res.json());
    } catch {
      toast.error('Impossibile caricare gli impianti');
    } finally {
      setLoading(false);
    }
  }, [filtroQ, filtroCliente]);

  useEffect(() => { caricaImpianti(); }, [caricaImpianti]);

  const caricaDettaglio = async (id: number) => {
    setLoadingDettaglio(true);
    try {
      const res = await fetch(`${API_BASE}/impianti/${id}`);
      if (!res.ok) throw new Error();
      setSelezionato(await res.json());
    } catch {
      toast.error('Errore caricamento dettaglio');
    } finally {
      setLoadingDettaglio(false);
    }
  };

  const handleElimina = async (id: number) => {
    if (!confirm('Eliminare questo impianto?')) return;
    try {
      const res = await fetch(`${API_BASE}/impianti/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail);
      }
      toast.success('Impianto eliminato');
      setSelezionato(null);
      caricaImpianti();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Impianti</h1>
              <p className="text-sm text-gray-500">{impianti.length} impianti registrati</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={caricaImpianti}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => { setEditando(null); setMostraForm(true); setSelezionato(null); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Nuovo Impianto
            </button>
          </div>
        </div>
      </div>

      {/* Filtri */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex gap-3 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={filtroQ}
              onChange={e => setFiltroQ(e.target.value)}
              placeholder="Cerca per codice o descrizione..."
              className="pl-9 pr-3 py-1.5 border rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filtroCliente}
            onChange={e => setFiltroCliente(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tutti i clienti</option>
            {clienti.map(c => (
              <option key={c.id} value={c.id}>{c.ragione_sociale}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Contenuto */}
      <div className="p-6 grid grid-cols-5 gap-6">
        {/* Lista impianti (3/5) */}
        <div className="col-span-3 space-y-2">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : impianti.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Nessun impianto trovato</p>
            </div>
          ) : (
            impianti.map(imp => (
              <div
                key={imp.id}
                onClick={() => caricaDettaglio(imp.id)}
                className={`bg-white rounded-xl border p-4 cursor-pointer hover:shadow-md transition-all ${
                  selezionato?.id === imp.id
                    ? 'border-blue-400 ring-1 ring-blue-300'
                    : 'border-gray-200 hover:border-blue-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="font-semibold text-gray-900">{imp.codice_cliente}</span>
                    </div>
                    {imp.descrizione && (
                      <p className="text-sm text-gray-500 mt-0.5 ml-6 truncate">{imp.descrizione}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 ml-6 text-xs text-gray-400">
                      {imp.cliente_nome && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />{imp.cliente_nome}
                        </span>
                      )}
                      {imp.indirizzo_installazione && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />{imp.indirizzo_installazione}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 mt-1" />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pannello destro (2/5) */}
        <div className="col-span-2">
          {mostraForm ? (
            <ImpiantoForm
              impianto={editando}
              clienti={clienti}
              onSalva={() => {
                setMostraForm(false);
                setEditando(null);
                caricaImpianti();
                if (editando) caricaDettaglio(editando.id);
              }}
              onAnnulla={() => { setMostraForm(false); setEditando(null); }}
            />
          ) : loadingDettaglio ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
            </div>
          ) : selezionato ? (
            <ImpiantoDettaglio
              impianto={selezionato}
              onModifica={() => { setEditando(selezionato); setMostraForm(true); }}
              onElimina={() => handleElimina(selezionato.id)}
              onChiudi={() => setSelezionato(null)}
            />
          ) : (
            <div className="text-center py-16 text-gray-300">
              <Building2 className="h-12 w-12 mx-auto mb-3" />
              <p className="text-sm">Seleziona un impianto per i dettagli</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
