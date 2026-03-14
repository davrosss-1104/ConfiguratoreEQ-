import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ShoppingCart, Building2, Package, Plus, Trash2,
  CheckCircle2, Clock, AlertTriangle, XCircle, FileText,
  Save, X, Edit2, Loader2, RefreshCw, History,
  ChevronRight, Link2, Euro,
} from 'lucide-react';
import { toast } from 'sonner';

const API = '/api/oda';
const fmt  = (n: number) => (n ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const fmtD = (s?: string) => s ? new Date(s).toLocaleDateString('it-IT') : '—';

// ==========================================
// STATI
// ==========================================
const STATI_CFG: Record<string, { label: string; bg: string; text: string }> = {
  bozza:                  { label: 'Bozza',            bg: 'bg-gray-100',    text: 'text-gray-600'    },
  inviato:                { label: 'Inviato',           bg: 'bg-blue-100',    text: 'text-blue-700'    },
  parzialmente_ricevuto:  { label: 'Parz. ricevuto',    bg: 'bg-amber-100',   text: 'text-amber-700'   },
  ricevuto:               { label: 'Ricevuto',          bg: 'bg-emerald-100', text: 'text-emerald-700' },
  chiuso:                 { label: 'Chiuso',            bg: 'bg-violet-100',  text: 'text-violet-700'  },
  annullato:              { label: 'Annullato',         bg: 'bg-red-100',     text: 'text-red-600'     },
};

const TRANSIZIONI: Record<string, { stato: string; label: string; colore: string }[]> = {
  bozza:                  [{ stato: 'inviato',   label: 'Segna come inviato al fornitore', colore: 'bg-blue-600 hover:bg-blue-700 text-white' },
                           { stato: 'annullato', label: 'Annulla ODA',                    colore: 'border border-red-300 text-red-600 hover:bg-red-50' }],
  inviato:                [{ stato: 'ricevuto',  label: 'Segna tutto ricevuto',            colore: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
                           { stato: 'annullato', label: 'Annulla ODA',                    colore: 'border border-red-300 text-red-600 hover:bg-red-50' }],
  parzialmente_ricevuto:  [{ stato: 'ricevuto',  label: 'Segna tutto ricevuto',            colore: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
                           { stato: 'annullato', label: 'Annulla ODA',                    colore: 'border border-red-300 text-red-600 hover:bg-red-50' }],
  ricevuto:               [{ stato: 'chiuso',    label: 'Chiudi ODA',                     colore: 'bg-violet-600 hover:bg-violet-700 text-white' }],
  chiuso:                 [],
  annullato:              [],
};

function StatoBadge({ stato }: { stato: string }) {
  const cfg = STATI_CFG[stato] ?? { label: stato, bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

// ==========================================
// DIALOG TRANSIZIONE
// ==========================================
function TransizioneDialog({ tr, onConferma, onAnnulla }: {
  tr: { stato: string; label: string };
  onConferma: (nota: string) => void;
  onAnnulla: () => void;
}) {
  const [nota, setNota] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="p-5 border-b">
          <h3 className="font-semibold text-gray-900">{tr.label}</h3>
        </div>
        <div className="p-5">
          <input
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="Nota (opzionale)..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && onConferma(nota)}
          />
        </div>
        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onAnnulla} className="px-4 py-2 text-sm text-gray-600">Annulla</button>
          <button
            onClick={() => onConferma(nota)}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Conferma
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// DIALOG RICEVIMENTO
// ==========================================
function RicevimentoDialog({ riga, odaId, onSuccess, onClose }: {
  riga: any;
  odaId: number;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const residua = riga.quantita_ordinata - riga.quantita_ricevuta;
  const [quantita, setQuantita] = useState(String(residua));
  const [ddt,      setDdt]      = useState('');
  const [note,     setNote]     = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSalva = async () => {
    const qt = parseFloat(quantita);
    if (!qt || qt <= 0) { toast.error('Quantità non valida'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/${odaId}/ricevimenti`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riga_id: riga.id, quantita: qt, numero_ddt: ddt, note }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      toast.success('Ricezione registrata');
      onSuccess();
    } catch (e: any) {
      toast.error(e.message || 'Errore');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b">
          <h3 className="font-semibold text-gray-900">Registra ricezione</h3>
          <p className="text-sm text-gray-500 mt-0.5">{riga.descrizione}</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm bg-gray-50 rounded-lg p-3">
            <div><p className="text-xs text-gray-400">Ordinata</p><p className="font-semibold">{riga.quantita_ordinata} {riga.unita_misura}</p></div>
            <div><p className="text-xs text-gray-400">Già ricevuta</p><p className="font-semibold">{riga.quantita_ricevuta} {riga.unita_misura}</p></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantità da ricevere ora <span className="text-gray-400">(max {residua})</span>
            </label>
            <input
              type="number"
              value={quantita}
              onChange={e => setQuantita(e.target.value)}
              min="0.01"
              max={residua}
              step="0.01"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">N. DDT (opzionale)</label>
            <input
              value={ddt}
              onChange={e => setDdt(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Annulla</button>
          <button
            onClick={handleSalva}
            disabled={loading}
            className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Registra ricezione
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// FORM AGGIUNGI RIGA
// ==========================================
function AggiungiRigaForm({ odaId, onSuccess }: { odaId: number; onSuccess: () => void }) {
  const [aperto,  setAperto]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [riga,    setRiga]    = useState({
    descrizione: '', codice_articolo: '', unita_misura: 'pz',
    quantita_ordinata: '1', prezzo_unitario: '0',
    sconto_percentuale: '0', aliquota_iva: '22',
  });

  const totaleRiga = () => {
    const qt = parseFloat(riga.quantita_ordinata) || 0;
    const pu = parseFloat(riga.prezzo_unitario)   || 0;
    const sc = parseFloat(riga.sconto_percentuale)|| 0;
    return qt * pu * (1 - sc / 100);
  };

  const handleSalva = async () => {
    if (!riga.descrizione) { toast.error('Descrizione obbligatoria'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/${odaId}/righe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...riga,
          quantita_ordinata:  parseFloat(riga.quantita_ordinata),
          prezzo_unitario:    parseFloat(riga.prezzo_unitario),
          sconto_percentuale: parseFloat(riga.sconto_percentuale),
          aliquota_iva:       parseFloat(riga.aliquota_iva),
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('Riga aggiunta');
      setRiga({ descrizione: '', codice_articolo: '', unita_misura: 'pz', quantita_ordinata: '1', prezzo_unitario: '0', sconto_percentuale: '0', aliquota_iva: '22' });
      setAperto(false);
      onSuccess();
    } catch {
      toast.error('Errore aggiunta riga');
    } finally {
      setLoading(false);
    }
  };

  if (!aperto) {
    return (
      <button
        onClick={() => setAperto(true)}
        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 px-4 py-3"
      >
        <Plus className="h-4 w-4" /> Aggiungi riga
      </button>
    );
  }

  return (
    <tr className="bg-blue-50">
      <td className="px-3 py-2 text-xs text-gray-400">—</td>
      <td className="px-3 py-2">
        <input
          value={riga.codice_articolo}
          onChange={e => setRiga(p => ({ ...p, codice_articolo: e.target.value }))}
          placeholder="Codice"
          className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 mb-1"
        />
        <input
          value={riga.descrizione}
          onChange={e => setRiga(p => ({ ...p, descrizione: e.target.value }))}
          placeholder="Descrizione *"
          className="w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
        />
      </td>
      <td className="px-3 py-2">
        <input
          value={riga.unita_misura}
          onChange={e => setRiga(p => ({ ...p, unita_misura: e.target.value }))}
          className="w-14 border rounded px-2 py-1 text-xs text-center focus:outline-none"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={riga.quantita_ordinata}
          onChange={e => setRiga(p => ({ ...p, quantita_ordinata: e.target.value }))}
          className="w-16 border rounded px-2 py-1 text-xs text-right focus:outline-none"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={riga.prezzo_unitario}
          onChange={e => setRiga(p => ({ ...p, prezzo_unitario: e.target.value }))}
          className="w-24 border rounded px-2 py-1 text-xs text-right focus:outline-none"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="number"
          value={riga.sconto_percentuale}
          onChange={e => setRiga(p => ({ ...p, sconto_percentuale: e.target.value }))}
          className="w-16 border rounded px-2 py-1 text-xs text-right focus:outline-none"
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={riga.aliquota_iva}
          onChange={e => setRiga(p => ({ ...p, aliquota_iva: e.target.value }))}
          className="w-16 border rounded px-1 py-1 text-xs focus:outline-none"
        >
          {['0','4','5','10','22'].map(a => <option key={a} value={a}>{a}%</option>)}
        </select>
      </td>
      <td className="px-3 py-2 text-right text-xs font-medium">{fmt(totaleRiga())}</td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <button onClick={handleSalva} disabled={loading} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </button>
          <button onClick={() => setAperto(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
            <X className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ==========================================
// PAGINA DETTAGLIO
// ==========================================
export default function OrdineAcquistoDettaglioPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [transInProgress, setTransInProgress] = useState<{ stato: string; label: string } | null>(null);
  const [ricevimentoRiga, setRicevimentoRiga]  = useState<any | null>(null);
  const [editTestata,     setEditTestata]       = useState(false);
  const [formTestata,     setFormTestata]       = useState<any>({});

  const { data: oda, isLoading, refetch } = useQuery({
    queryKey: ['oda-dettaglio', id],
    queryFn: async () => {
      const res = await fetch(`${API}/${id}`);
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const mutTransizione = useMutation({
    mutationFn: async ({ stato, nota }: { stato: string; nota: string }) => {
      const res = await fetch(`${API}/${id}/transizione`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stato, nota }),
      });
      if (!res.ok) throw new Error((await res.json()).detail);
      return res.json();
    },
    onSuccess: () => { toast.success('Stato aggiornato'); setTransInProgress(null); refetch(); },
    onError:   (e: any) => toast.error(e.message),
  });

  const mutElimRiga = useMutation({
    mutationFn: async (rigaId: number) => {
      await fetch(`${API}/${id}/righe/${rigaId}`, { method: 'DELETE' });
    },
    onSuccess: () => { toast.success('Riga eliminata'); refetch(); },
  });

  const mutSalvaTestata = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formTestata),
      });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => { toast.success('Dati salvati'); setEditTestata(false); refetch(); },
    onError:   () => toast.error('Errore salvataggio'),
  });

  const avviaEditTestata = () => {
    setFormTestata({
      fornitore_denominazione:  oda.fornitore_denominazione,
      fornitore_partita_iva:    oda.fornitore_partita_iva,
      codice_commessa:          oda.codice_commessa,
      data_consegna_richiesta:  oda.data_consegna_richiesta?.slice(0, 10),
      condizioni_pagamento:     oda.condizioni_pagamento,
      luogo_consegna:           oda.luogo_consegna,
      note:                     oda.note,
      note_interne:             oda.note_interne,
    });
    setEditTestata(true);
  };

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
    </div>
  );
  if (!oda) return <div className="p-8 text-gray-400">ODA non trovato</div>;

  const transizioniDisp = TRANSIZIONI[oda.stato] ?? [];
  const inRitardo = oda.data_consegna_richiesta
    && new Date(oda.data_consegna_richiesta) < new Date()
    && !['ricevuto', 'chiuso', 'annullato'].includes(oda.stato);

  const puoModificare = ['bozza', 'inviato'].includes(oda.stato);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/acquisti/oda')} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <ShoppingCart className="h-5 w-5 text-blue-600" />
            <span className="font-mono font-bold text-blue-700 text-lg">{oda.numero_oda}</span>
            <StatoBadge stato={oda.stato} />
            {inRitardo && (
              <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> In ritardo
              </span>
            )}
          </div>
          <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 grid grid-cols-3 gap-6">
        {/* COLONNA PRINCIPALE */}
        <div className="col-span-2 space-y-5">

          {/* Testata */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-400" /> Fornitore e dati ordine
              </h2>
              {!editTestata ? (
                <button onClick={avviaEditTestata} className="text-gray-400 hover:text-blue-600 p-1">
                  <Edit2 className="h-4 w-4" />
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => mutSalvaTestata.mutate()}
                    disabled={mutSalvaTestata.isPending}
                    className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-xs rounded-lg"
                  >
                    <Save className="h-3.5 w-3.5" /> Salva
                  </button>
                  <button onClick={() => setEditTestata(false)} className="text-gray-400 hover:text-gray-600 p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {!editTestata ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-xs text-gray-400 mb-0.5">Fornitore</p><p className="font-semibold text-gray-800">{oda.fornitore_denominazione || '—'}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">P.IVA</p><p className="text-gray-700">{oda.fornitore_partita_iva || '—'}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Codice commessa</p><p className="font-mono text-gray-700">{oda.codice_commessa || '—'}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Consegna richiesta</p><p className={inRitardo ? 'text-red-600 font-semibold' : 'text-gray-700'}>{fmtD(oda.data_consegna_richiesta)}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Condizioni pagamento</p><p className="text-gray-700">{oda.condizioni_pagamento || '—'}</p></div>
                <div><p className="text-xs text-gray-400 mb-0.5">Luogo consegna</p><p className="text-gray-700">{oda.luogo_consegna || '—'}</p></div>
                {oda.note && (
                  <div className="col-span-2"><p className="text-xs text-gray-400 mb-0.5">Note</p><p className="text-gray-600">{oda.note}</p></div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['fornitore_denominazione', 'Fornitore'],
                  ['fornitore_partita_iva', 'P.IVA fornitore'],
                  ['codice_commessa', 'Codice commessa'],
                  ['condizioni_pagamento', 'Condizioni pagamento'],
                  ['luogo_consegna', 'Luogo consegna'],
                ].map(([k, label]) => (
                  <div key={k}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                    <input
                      value={formTestata[k] || ''}
                      onChange={e => setFormTestata((p: any) => ({ ...p, [k]: e.target.value }))}
                      className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Consegna richiesta</label>
                  <input
                    type="date"
                    value={formTestata.data_consegna_richiesta || ''}
                    onChange={e => setFormTestata((p: any) => ({ ...p, data_consegna_richiesta: e.target.value }))}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
                  <textarea
                    value={formTestata.note || ''}
                    onChange={e => setFormTestata((p: any) => ({ ...p, note: e.target.value }))}
                    rows={2}
                    className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Righe */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-400" />
                Righe ordine ({oda.righe?.length ?? 0})
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    <th className="px-3 py-2 text-xs text-gray-500 w-8">#</th>
                    <th className="px-3 py-2 text-xs text-gray-500">Descrizione / Codice</th>
                    <th className="px-3 py-2 text-xs text-gray-500">U.M.</th>
                    <th className="px-3 py-2 text-xs text-gray-500 text-right">Ord.</th>
                    <th className="px-3 py-2 text-xs text-gray-500 text-right">P. Unit.</th>
                    <th className="px-3 py-2 text-xs text-gray-500 text-right">Sc.%</th>
                    <th className="px-3 py-2 text-xs text-gray-500 text-right">IVA</th>
                    <th className="px-3 py-2 text-xs text-gray-500 text-right">Totale</th>
                    <th className="px-3 py-2 text-xs text-gray-500">Ricezione</th>
                    <th className="px-3 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {oda.righe?.map((r: any) => {
                    const percRic = r.quantita_ordinata > 0
                      ? Math.round((r.quantita_ricevuta / r.quantita_ordinata) * 100)
                      : 0;
                    const coloreBar = percRic >= 100 ? 'bg-emerald-500' : percRic > 0 ? 'bg-amber-400' : 'bg-gray-200';

                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 text-xs text-gray-400">{r.numero_riga}</td>
                        <td className="px-3 py-2.5 max-w-xs">
                          <p className="text-gray-800 font-medium truncate">{r.descrizione}</p>
                          {r.codice_articolo && <p className="text-xs text-gray-400 font-mono">{r.codice_articolo}</p>}
                        </td>
                        <td className="px-3 py-2.5 text-gray-500 text-xs">{r.unita_misura}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{r.quantita_ordinata}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">{fmt(r.prezzo_unitario)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{r.sconto_percentuale > 0 ? `${r.sconto_percentuale}%` : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{r.aliquota_iva}%</td>
                        <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{fmt(r.prezzo_totale)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div className={`h-full rounded-full ${coloreBar} transition-all`} style={{ width: `${percRic}%` }} />
                            </div>
                            <span className="text-xs text-gray-500">{r.quantita_ricevuta}/{r.quantita_ordinata}</span>
                            {oda.stato !== 'chiuso' && oda.stato !== 'annullato' && r.quantita_residua > 0 && (
                              <button
                                onClick={() => setRicevimentoRiga(r)}
                                className="text-xs text-blue-600 hover:underline shrink-0"
                              >
                                Ricevi
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {puoModificare && (
                            <button
                              onClick={() => { if (confirm('Eliminare questa riga?')) mutElimRiga.mutate(r.id); }}
                              className="text-gray-300 hover:text-red-500 p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {puoModificare && (
                    <AggiungiRigaForm odaId={Number(id)} onSuccess={refetch} />
                  )}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={7} className="px-3 py-2.5 text-right text-sm font-medium text-gray-600">Imponibile</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-gray-800">{fmt(oda.imponibile_totale)}</td>
                    <td colSpan={2} />
                  </tr>
                  <tr>
                    <td colSpan={7} className="px-3 py-2 text-right text-sm text-gray-500">IVA</td>
                    <td className="px-3 py-2 text-right text-gray-700">{fmt(oda.iva_totale)}</td>
                    <td colSpan={2} />
                  </tr>
                  <tr className="border-t">
                    <td colSpan={7} className="px-3 py-3 text-right text-sm font-bold text-gray-700">TOTALE ODA</td>
                    <td className="px-3 py-3 text-right text-lg font-bold text-gray-900">{fmt(oda.totale_oda)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Ricevimenti */}
          {oda.ricevimenti?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-gray-400" /> Ricezioni registrate
              </h3>
              <div className="space-y-2">
                {oda.ricevimenti.map((rc: any) => (
                  <div key={rc.id} className="flex items-start gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <Package className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <span className="font-medium text-gray-700">{rc.descrizione_riga}</span>
                      <span className="text-gray-500 ml-2">{rc.quantita} {rc.unita_misura}</span>
                    </div>
                    <div className="text-right text-xs text-gray-400 shrink-0">
                      <p>{fmtD(rc.data_ricezione)}</p>
                      {rc.numero_ddt && <p>DDT: {rc.numero_ddt}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fatture passive collegate */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              Fatture passive collegate ({oda.fatture_passive?.length ?? 0})
            </h3>
            {!oda.fatture_passive?.length ? (
              <p className="text-sm text-gray-400 italic">Nessuna fattura collegata</p>
            ) : (
              <div className="space-y-2">
                {oda.fatture_passive.map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-mono text-xs font-semibold text-gray-600">{f.numero_fattura_fornitore || `#${f.id}`}</span>
                      <span className="text-gray-500 ml-2">{f.fornitore_denominazione}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-gray-800">{fmt(f.totale_fattura)}</span>
                      <Link to={`/fatturazione/passive/${f.id}`} className="text-blue-600 hover:text-blue-700">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Storico */}
          {oda.storico?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <History className="h-4 w-4 text-gray-400" /> Storico stato
              </h3>
              <div className="space-y-2">
                {oda.storico.map((s: any) => (
                  <div key={s.id} className="flex items-start gap-3 text-sm">
                    <ChevronRight className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />
                    <div>
                      <span className="text-gray-400 text-xs">{fmtD(s.created_at)}</span>
                      {' — '}
                      {s.stato_da && <span className="text-gray-400">{s.stato_da} → </span>}
                      <span className="font-medium text-gray-700">{s.stato_a}</span>
                      {s.nota && <span className="text-gray-400 text-xs ml-1">({s.nota})</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* COLONNA DESTRA */}
        <div className="space-y-4">
          {/* Riepilogo importi */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Riepilogo</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Imponibile</span>
                <span className="text-gray-800">{fmt(oda.imponibile_totale)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">IVA</span>
                <span className="text-gray-800">{fmt(oda.iva_totale)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 mt-1">
                <span className="font-bold text-gray-700">Totale ODA</span>
                <span className="font-bold text-gray-900 text-base">{fmt(oda.totale_oda)}</span>
              </div>
            </div>
          </div>

          {/* Date */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Date</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Emissione</span><span className="text-gray-700">{fmtD(oda.data_emissione)}</span></div>
              <div className={`flex justify-between ${inRitardo ? 'text-red-600' : ''}`}>
                <span className={inRitardo ? 'font-medium' : 'text-gray-500'}>Consegna richiesta</span>
                <span className={inRitardo ? 'font-semibold' : 'text-gray-700'}>{fmtD(oda.data_consegna_richiesta)}</span>
              </div>
              {oda.data_consegna_effettiva && (
                <div className="flex justify-between"><span className="text-gray-500">Consegna effettiva</span><span className="text-gray-700">{fmtD(oda.data_consegna_effettiva)}</span></div>
              )}
            </div>
          </div>

          {/* Azioni stato */}
          {transizioniDisp.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Avanza stato</p>
              <div className="space-y-2">
                {transizioniDisp.map(t => (
                  <button
                    key={t.stato}
                    onClick={() => setTransInProgress(t)}
                    disabled={mutTransizione.isPending}
                    className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${t.colore}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Riferimento commessa/preventivo */}
          {(oda.preventivo_id || oda.ordine_id) && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Collegato a</p>
              <div className="space-y-2 text-sm">
                {oda.preventivo_id && (
                  <Link to={`/preventivo/${oda.preventivo_id}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                    <FileText className="h-4 w-4" /> Preventivo #{oda.preventivo_id}
                  </Link>
                )}
                {oda.ordine_id && (
                  <button
                    onClick={() => { if (oda.preventivo_id) window.open(`/preventivo/${oda.preventivo_id}`, '_blank'); }}
                    className="flex items-center gap-2 text-blue-600 hover:underline"
                  >
                    <Link2 className="h-4 w-4" /> Ordine #{oda.ordine_id}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {transInProgress && (
        <TransizioneDialog
          tr={transInProgress}
          onConferma={nota => mutTransizione.mutate({ stato: transInProgress.stato, nota })}
          onAnnulla={() => setTransInProgress(null)}
        />
      )}
      {ricevimentoRiga && (
        <RicevimentoDialog
          riga={ricevimentoRiga}
          odaId={Number(id)}
          onSuccess={() => { setRicevimentoRiga(null); refetch(); }}
          onClose={() => setRicevimentoRiga(null)}
        />
      )}
    </div>
  );
}
