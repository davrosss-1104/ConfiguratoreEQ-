import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Building2, FileText, Download, CheckCircle2,
  Clock, AlertTriangle, Euro, Calendar, RefreshCw, Loader2,
  Edit2, Save, X, ChevronRight, History, Link2,
} from 'lucide-react';
import { toast } from 'sonner';

const API = '/api/fatturazione/passive';
const fmt = (n: number) => (n ?? 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const fmtData = (s?: string) => s ? new Date(s).toLocaleDateString('it-IT') : '—';

// ==========================================
// STATI
// ==========================================
const STATI_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  da_verificare: { label: 'Da verificare', bg: 'bg-gray-100',    text: 'text-gray-700'    },
  verificata:    { label: 'Verificata',    bg: 'bg-blue-100',    text: 'text-blue-700'    },
  approvata:     { label: 'Approvata',     bg: 'bg-amber-100',   text: 'text-amber-700'   },
  registrata:    { label: 'Registrata',    bg: 'bg-emerald-100', text: 'text-emerald-700' },
  pagata:        { label: 'Pagata',        bg: 'bg-violet-100',  text: 'text-violet-700'  },
};

// Transizioni ammesse
const TRANSIZIONI: Record<string, { stato: string; label: string; colore: string }[]> = {
  da_verificare: [
    { stato: 'verificata', label: 'Segna verificata', colore: 'bg-blue-600 hover:bg-blue-700 text-white' },
  ],
  verificata: [
    { stato: 'approvata',    label: 'Approva per registrazione', colore: 'bg-amber-600 hover:bg-amber-700 text-white' },
    { stato: 'da_verificare',label: 'Riporta a da verificare',   colore: 'border border-gray-300 text-gray-700 hover:bg-gray-50' },
  ],
  approvata: [
    { stato: 'registrata',   label: 'Segna registrata', colore: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    { stato: 'verificata',   label: 'Torna a verificata', colore: 'border border-gray-300 text-gray-700 hover:bg-gray-50' },
  ],
  registrata: [
    { stato: 'pagata',       label: 'Segna pagata', colore: 'bg-violet-600 hover:bg-violet-700 text-white' },
  ],
  pagata: [],
};

function StatoBadge({ stato }: { stato: string }) {
  const cfg = STATI_CONFIG[stato] ?? { label: stato, bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

// ==========================================
// DIALOG TRANSIZIONE
// ==========================================
function TransizioneDialog({
  transizione,
  onConferma,
  onAnnulla,
}: {
  transizione: { stato: string; label: string };
  onConferma: (nota: string) => void;
  onAnnulla: () => void;
}) {
  const [nota, setNota] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b">
          <h3 className="font-semibold text-gray-900">{transizione.label}</h3>
        </div>
        <div className="p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Note (opzionale)</label>
          <input
            value={nota}
            onChange={e => setNota(e.target.value)}
            placeholder="Motivazione o riferimento..."
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && onConferma(nota)}
          />
        </div>
        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onAnnulla} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annulla</button>
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
// PAGINA DETTAGLIO
// ==========================================
export default function FatturaPassivaDettaglioPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [transizioneIn, setTransizioneIn] = useState<{ stato: string; label: string } | null>(null);
  const [editNote,      setEditNote]      = useState(false);
  const [notaEdit,      setNotaEdit]      = useState('');

  const { data: fattura, isLoading, refetch } = useQuery({
    queryKey: ['fattura-passiva', id],
    queryFn: async () => {
      const res = await fetch(`${API}/${id}`);
      if (!res.ok) throw new Error('Fattura non trovata');
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
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail);
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Stato aggiornato');
      setTransizioneIn(null);
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const mutSalvaNota = useMutation({
    mutationFn: async (nota: string) => {
      const res = await fetch(`${API}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note_lavorazione: nota }),
      });
      if (!res.ok) throw new Error();
      return res.json();
    },
    onSuccess: () => {
      toast.success('Note salvate');
      setEditNote(false);
      refetch();
    },
    onError: () => toast.error('Errore salvataggio note'),
  });

  const downloadXml = () => {
    window.open(`${API}/${id}/xml`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!fattura) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Fattura non trovata
      </div>
    );
  }

  const transizioniDisp = TRANSIZIONI[fattura.stato_lavorazione] ?? [];
  const scaduta = fattura.scadenza_pagamento
    && new Date(fattura.scadenza_pagamento) < new Date()
    && fattura.stato_lavorazione !== 'pagata';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/fatturazione/passive')}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="text-sm text-gray-400">Fattura passiva</span>
            <span className="text-gray-300">/</span>
            <span className="font-mono text-sm text-gray-600">
              {fattura.numero_fattura_fornitore || fattura.numero_fattura || `#${fattura.id}`}
            </span>
            <StatoBadge stato={fattura.stato_lavorazione} />
            {scaduta && (
              <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> Scaduta
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {fattura.xml_ricevuto && (
              <button
                onClick={downloadXml}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-sm text-gray-700 rounded-lg hover:bg-gray-50"
              >
                <Download className="h-4 w-4" /> XML
              </button>
            )}
            <button onClick={() => refetch()} className="p-2 text-gray-400 hover:text-gray-600">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6 grid grid-cols-3 gap-6">
        {/* COLONNA PRINCIPALE */}
        <div className="col-span-2 space-y-5">

          {/* Dati documento */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" /> Documento ricevuto
            </h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">N. Fattura fornitore</p>
                <p className="font-mono font-medium text-gray-800">
                  {fattura.numero_fattura_fornitore || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Tipo documento</p>
                <p className="text-gray-700">{fattura.tipo_documento || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Data fattura</p>
                <p className="text-gray-700">{fmtData(fattura.data_fattura_fornitore)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Data ricezione</p>
                <p className="text-gray-700">{fmtData(fattura.data_ricezione)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">N. Protocollo interno</p>
                <p className="font-mono text-gray-700">{fattura.numero_fattura || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">File SDI</p>
                <p className="text-xs text-gray-500 truncate">{fattura.xml_ricevuto_filename || '—'}</p>
              </div>
            </div>
          </div>

          {/* Righe fattura */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-gray-800">Righe ({fattura.righe?.length ?? 0})</h3>
            </div>
            {!fattura.righe?.length ? (
              <p className="text-sm text-gray-400 text-center py-6">Nessuna riga disponibile</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left">
                      <th className="px-4 py-2 text-xs text-gray-500">#</th>
                      <th className="px-4 py-2 text-xs text-gray-500">Descrizione</th>
                      <th className="px-4 py-2 text-xs text-gray-500 text-right">Qtà</th>
                      <th className="px-4 py-2 text-xs text-gray-500 text-right">P. Unit.</th>
                      <th className="px-4 py-2 text-xs text-gray-500 text-right">IVA%</th>
                      <th className="px-4 py-2 text-xs text-gray-500 text-right">Totale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {fattura.righe.map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{r.numero_riga}</td>
                        <td className="px-4 py-2.5 text-gray-700 max-w-xs">
                          <p className="truncate">{r.descrizione}</p>
                          {r.codice_valore && (
                            <p className="text-xs text-gray-400 font-mono">{r.codice_tipo}: {r.codice_valore}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">
                          {r.quantita}{r.unita_misura ? ` ${r.unita_misura}` : ''}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{fmt(r.prezzo_unitario)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">
                          {r.natura ? r.natura : `${r.aliquota_iva}%`}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-800">{fmt(r.prezzo_totale)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t bg-gray-50">
                    <tr>
                      <td colSpan={5} className="px-4 py-3 text-right text-sm font-medium text-gray-600">
                        Imponibile
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-800">
                        {fmt(fattura.imponibile_totale)}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-right text-sm text-gray-500">IVA</td>
                      <td className="px-4 py-2 text-right text-gray-700">{fmt(fattura.iva_totale)}</td>
                    </tr>
                    <tr className="border-t">
                      <td colSpan={5} className="px-4 py-3 text-right text-sm font-bold text-gray-700">TOTALE</td>
                      <td className="px-4 py-3 text-right text-lg font-bold text-gray-900">
                        {fmt(fattura.totale_fattura)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Note lavorazione */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Note di lavorazione</h3>
              {!editNote ? (
                <button
                  onClick={() => { setNotaEdit(fattura.note_lavorazione ?? ''); setEditNote(true); }}
                  className="text-gray-400 hover:text-blue-600 p-1"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => mutSalvaNota.mutate(notaEdit)}
                    disabled={mutSalvaNota.isPending}
                    className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
                  >
                    <Save className="h-3.5 w-3.5" /> Salva
                  </button>
                  <button onClick={() => setEditNote(false)} className="text-gray-400 hover:text-gray-600 p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            {editNote ? (
              <textarea
                value={notaEdit}
                onChange={e => setNotaEdit(e.target.value)}
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Annotazioni, riferimenti, ecc..."
                autoFocus
              />
            ) : (
              fattura.note_lavorazione
                ? <p className="text-sm text-gray-600 whitespace-pre-wrap">{fattura.note_lavorazione}</p>
                : <p className="text-sm text-gray-400 italic">Nessuna nota</p>
            )}
          </div>

          {/* Storico */}
          {fattura.storico?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <History className="h-4 w-4 text-gray-400" /> Storico lavorazione
              </h3>
              <div className="space-y-2">
                {fattura.storico.map((s: any) => (
                  <div key={s.id} className="flex items-start gap-3 text-sm">
                    <div className="h-5 w-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                      <ChevronRight className="h-3 w-3 text-gray-400" />
                    </div>
                    <div>
                      <span className="text-gray-500">{fmtData(s.created_at)}</span>
                      {' — '}
                      {s.stato_da && <span className="text-gray-400">{s.stato_da} → </span>}
                      <span className="font-medium text-gray-700">{s.stato_a}</span>
                      {s.nota && <span className="text-gray-400"> ({s.nota})</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* COLONNA DESTRA */}
        <div className="space-y-4">

          {/* Fornitore */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Fornitore</p>
            <div className="flex items-start gap-2">
              <Building2 className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-gray-800">{fattura.fornitore_denominazione || '—'}</p>
                {fattura.fornitore_partita_iva && (
                  <p className="text-xs text-gray-400 mt-0.5">P.IVA: {fattura.fornitore_partita_iva}</p>
                )}
                {fattura.fornitore_pec && (
                  <p className="text-xs text-gray-400">PEC: {fattura.fornitore_pec}</p>
                )}
                {(fattura.fornitore_comune || fattura.fornitore_indirizzo) && (
                  <p className="text-xs text-gray-400 mt-1">
                    {[fattura.fornitore_indirizzo, fattura.fornitore_comune, fattura.fornitore_provincia]
                      .filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Pagamento */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Pagamento</p>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Totale</span>
                <span className="font-bold text-gray-900">{fmt(fattura.totale_fattura)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Scadenza</span>
                <span className={`font-medium ${scaduta ? 'text-red-600' : 'text-gray-700'}`}>
                  {fmtData(fattura.scadenza_pagamento)}
                </span>
              </div>
              {fattura.condizioni_pagamento && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Condizioni</span>
                  <span className="text-gray-700">{fattura.condizioni_pagamento}</span>
                </div>
              )}
              {fattura.modalita_pagamento && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Modalità</span>
                  <span className="text-gray-700">{fattura.modalita_pagamento}</span>
                </div>
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
                    onClick={() => setTransizioneIn(t)}
                    disabled={mutTransizione.isPending}
                    className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors ${t.colore}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialog transizione */}
      {transizioneIn && (
        <TransizioneDialog
          transizione={transizioneIn}
          onConferma={nota => mutTransizione.mutate({ stato: transizioneIn.stato, nota })}
          onAnnulla={() => setTransizioneIn(null)}
        />
      )}
    </div>
  );
}
