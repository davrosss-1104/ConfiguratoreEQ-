import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2, Plus, Search, Loader2, X, Save, Pencil,
  Trash2, Mail, Phone, MapPin, CreditCard, ChevronDown, ChevronRight,
  AlertCircle, CheckCircle2, Package,
} from 'lucide-react';
import { toast } from 'sonner';

const API = '/api/fornitori';

const EMPTY_FORM = {
  ragione_sociale: '', codice: '', partita_iva: '', codice_fiscale: '',
  pec: '', email: '', email_cc: '', telefono: '',
  indirizzo: '', comune: '', provincia: '', cap: '', paese: 'IT',
  iban: '', condizioni_pagamento: '', note: '', attivo: 1,
};

function FornitoreDialog({
  fornitore, onClose, onSaved,
}: {
  fornitore?: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(fornitore ? { ...fornitore } : { ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);
  const isNew = !fornitore?.id;

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  const handleSalva = async () => {
    if (!form.ragione_sociale.trim()) { toast.error('Ragione sociale obbligatoria'); return; }
    setLoading(true);
    try {
      const url    = isNew ? API : `${API}/${fornitore.id}`;
      const method = isNew ? 'POST' : 'PUT';
      const r = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error((await r.json()).detail);
      toast.success(isNew ? 'Fornitore creato' : 'Fornitore aggiornato');
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || 'Errore salvataggio');
    } finally { setLoading(false); }
  };

  const field = (label: string, key: string, opts?: { type?: string; placeholder?: string; half?: boolean }) => (
    <div className={opts?.half ? '' : 'col-span-2'}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={opts?.type || 'text'}
        value={form[key] || ''}
        onChange={e => set(key, e.target.value)}
        placeholder={opts?.placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">
              {isNew ? 'Nuovo Fornitore' : `Modifica — ${fornitore.ragione_sociale}`}
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Dati principali */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Dati aziendali</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Ragione sociale *</label>
                <input value={form.ragione_sociale} onChange={e => set('ragione_sociale', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-medium" />
              </div>
              {field('Codice interno', 'codice', { half: true })}
              {field('Partita IVA', 'partita_iva', { half: true, placeholder: 'IT12345678901' })}
              {field('Codice fiscale', 'codice_fiscale', { half: true })}
              {field('Telefono', 'telefono', { half: true, placeholder: '+39 0123 456789' })}
            </div>
          </div>

          {/* Contatti */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Contatti email
            </p>
            <div className="grid grid-cols-2 gap-3">
              {field('Email (per invio ODA)', 'email', { type: 'email', placeholder: 'ordini@fornitore.it' })}
              {field('Email CC (opzionale)', 'email_cc', { type: 'email', placeholder: 'copia@fornitore.it' })}
              {field('PEC', 'pec', { type: 'email', placeholder: 'fornitore@pec.it' })}
            </div>
          </div>

          {/* Indirizzo */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Indirizzo
            </p>
            <div className="grid grid-cols-2 gap-3">
              {field('Indirizzo', 'indirizzo', { placeholder: 'Via Roma 1' })}
              {field('Comune', 'comune', { half: true })}
              {field('Provincia', 'provincia', { half: true, placeholder: 'PI' })}
              {field('CAP', 'cap', { half: true })}
              {field('Paese', 'paese', { half: true })}
            </div>
          </div>

          {/* Dati bancari e pagamento */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> Pagamento
            </p>
            <div className="grid grid-cols-2 gap-3">
              {field('IBAN', 'iban', { placeholder: 'IT60 X054 2811 1010 0000 0123 456' })}
              {field('Condizioni di pagamento', 'condizioni_pagamento', { placeholder: 'es. 30gg data fattura' })}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Note interne</label>
            <textarea value={form.note || ''} onChange={e => set('note', e.target.value)}
              rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {/* Stato */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!form.attivo} onChange={e => set('attivo', e.target.checked ? 1 : 0)}
              className="rounded text-blue-600" />
            <span className="text-sm text-gray-700">Fornitore attivo</span>
          </label>
        </div>

        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annulla</button>
          <button onClick={handleSalva} disabled={loading}
            className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isNew ? 'Crea fornitore' : 'Salva modifiche'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GestioneForniPage() {
  const qc = useQueryClient();
  const [q, setQ]                 = useState('');
  const [soloAttivi, setSoloAttivi] = useState(true);
  const [editing, setEditing]     = useState<any | null>(null);
  const [showNew, setShowNew]     = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: fornitori = [], isLoading, refetch } = useQuery({
    queryKey: ['fornitori', q, soloAttivi],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (q)          p.set('q', q);
      if (soloAttivi) p.set('attivo', '1');
      const r = await fetch(`${API}?${p}`);
      return r.ok ? r.json() : [];
    },
    staleTime: 30000,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).detail);
      return r.json();
    },
    onSuccess: (data: any) => {
      toast.success(data.disattivato ? 'Fornitore disattivato (ha articoli collegati)' : 'Fornitore eliminato');
      qc.invalidateQueries({ queryKey: ['fornitori'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const onSaved = () => qc.invalidateQueries({ queryKey: ['fornitori'] });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Fornitori</h1>
              <p className="text-sm text-gray-500">{fornitori.length} fornitori</p>
            </div>
          </div>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Nuovo fornitore
          </button>
        </div>
      </div>

      {/* Filtri */}
      <div className="bg-white border-b px-6 py-3 flex gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Cerca ragione sociale, email..."
            className="pl-9 pr-3 py-1.5 border rounded-lg text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={soloAttivi} onChange={e => setSoloAttivi(e.target.checked)} className="rounded" />
          Solo attivi
        </label>
      </div>

      {/* Lista */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
        ) : fornitori.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">Nessun fornitore</p>
            <p className="text-sm mt-1">Crea il primo fornitore con il pulsante in alto a destra</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y">
            {(fornitori as any[]).map((f: any) => {
              const expanded = expandedId === f.id;
              const haEmail  = !!f.email;
              return (
                <div key={f.id}>
                  <div className="px-5 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                    {/* Toggle dettaglio */}
                    <button onClick={() => setExpandedId(expanded ? null : f.id)}
                      className="text-gray-400 hover:text-gray-600 shrink-0">
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{f.ragione_sociale}</span>
                        {f.codice && <span className="text-xs text-gray-400 font-mono">[{f.codice}]</span>}
                        {!f.attivo && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded">Disattivo</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-0.5 flex-wrap">
                        {f.partita_iva && <span className="text-xs text-gray-500">P.IVA {f.partita_iva}</span>}
                        {f.email
                          ? <span className="text-xs text-emerald-600 flex items-center gap-1"><Mail className="h-3 w-3" />{f.email}</span>
                          : <span className="text-xs text-amber-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />Nessuna email</span>
                        }
                        {f.condizioni_pagamento && <span className="text-xs text-gray-400">{f.condizioni_pagamento}</span>}
                        {(f.articoli?.length > 0 || f.num_articoli > 0) && (
                          <span className="text-xs text-blue-500 flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {f.articoli?.length || f.num_articoli} articoli
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Azioni */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditing(f)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Eliminare "${f.ragione_sociale}"?`)) deleteMut.mutate(f.id);
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Dettaglio espanso */}
                  {expanded && (
                    <div className="px-12 pb-4 bg-gray-50/50 grid grid-cols-3 gap-4 text-sm">
                      {f.telefono && (
                        <div className="flex items-start gap-2">
                          <Phone className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-xs text-gray-400">Telefono</p>
                            <p className="text-gray-700">{f.telefono}</p>
                          </div>
                        </div>
                      )}
                      {f.pec && (
                        <div className="flex items-start gap-2">
                          <Mail className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-xs text-gray-400">PEC</p>
                            <p className="text-gray-700">{f.pec}</p>
                          </div>
                        </div>
                      )}
                      {f.email_cc && (
                        <div className="flex items-start gap-2">
                          <Mail className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-xs text-gray-400">Email CC</p>
                            <p className="text-gray-700">{f.email_cc}</p>
                          </div>
                        </div>
                      )}
                      {(f.indirizzo || f.comune) && (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-xs text-gray-400">Indirizzo</p>
                            <p className="text-gray-700">{[f.indirizzo, f.comune, f.provincia].filter(Boolean).join(', ')}</p>
                          </div>
                        </div>
                      )}
                      {f.iban && (
                        <div className="flex items-start gap-2">
                          <CreditCard className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
                          <div>
                            <p className="text-xs text-gray-400">IBAN</p>
                            <p className="text-gray-700 font-mono text-xs">{f.iban}</p>
                          </div>
                        </div>
                      )}
                      {f.note && (
                        <div className="col-span-3">
                          <p className="text-xs text-gray-400">Note</p>
                          <p className="text-gray-600 text-sm">{f.note}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showNew && (
        <FornitoreDialog onClose={() => setShowNew(false)} onSaved={onSaved} />
      )}
      {editing && (
        <FornitoreDialog fornitore={editing} onClose={() => setEditing(null)} onSaved={onSaved} />
      )}
    </div>
  );
}
