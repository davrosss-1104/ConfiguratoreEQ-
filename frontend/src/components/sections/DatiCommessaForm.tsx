import { useEffect, useRef, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Calendar, Loader2, Clock, CheckCircle2,
  Building2, Plus, X, Search, ChevronDown, ChevronUp,
} from "lucide-react";
import { ClienteSelector } from "../ClienteSelector";

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const datiCommessaSchema = z.object({
  numero_offerta: z.string().optional(),
  data_offerta: z.string().optional(),
  riferimento_cliente: z.string().optional(),
  quantita: z.coerce.number().int().positive().optional().nullable(),
  data_consegna_richiesta: z.string().optional(),
  imballo: z.string().optional(),
  reso_fco: z.string().optional(),
  pagamento: z.string().optional(),
  trasporto: z.string().optional(),
  destinazione: z.string().optional(),
});

type DatiCommessaFormValues = z.infer<typeof datiCommessaSchema>;

interface Impianto {
  id: number;
  numero_impianto: string;
  tipo: string;
  indirizzo?: string;
  cliente_finale?: string;
  anno_installazione?: number;
  costruttore?: string;
  modello?: string;
  note?: string;
}

const inputClass = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

function isoToIt(iso: string): string {
  if (!iso) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(iso)) {
    const [d, m, y] = iso.split('/');
    return `${y}-${m}-${d}`;
  }
  return iso;
}

function itToIso(browserVal: string): string {
  if (!browserVal) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(browserVal)) {
    const [y, m, d] = browserVal.split('-');
    return `${d}/${m}/${y}`;
  }
  return browserVal;
}

function normalize(values: any): string {
  const obj: any = {};
  for (const key of Object.keys(values).sort()) {
    const v = values[key];
    obj[key] = (v === null || v === undefined || v === '') ? '' : v;
  }
  return JSON.stringify(obj);
}

// ─── Dialog Nuovo/Cerca Impianto ─────────────────────────────────────────────
function ImpiantoDialog({
  preventivoId,
  onClose,
  onLinked,
}: {
  preventivoId: number;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [tab, setTab] = useState<'cerca' | 'nuovo'>('cerca');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Impianto[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tipo, setTipo] = useState<'nuovo' | 'ristrutturazione'>('nuovo');
  const [form, setForm] = useState({
    numero_impianto: '', indirizzo: '', cliente_finale: '',
    anno_installazione: '', costruttore: '', modello: '', note: '',
  });

  const cerca = useCallback(async (q: string) => {
    setSearching(true);
    try {
      const res = await fetch(`${API_BASE}/anagrafica-impianti/cerca?q=${encodeURIComponent(q)}&limit=15`);
      if (res.ok) setResults(await res.json());
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => { cerca(''); }, []);
  useEffect(() => {
    const t = setTimeout(() => cerca(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  async function collegaEsistente(imp: Impianto) {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/preventivi/${preventivoId}/impianti/${imp.id}`, { method: 'POST' });
      toast.success(`Impianto ${imp.numero_impianto} collegato`);
      onLinked();
      onClose();
    } catch {
      toast.error('Errore collegamento impianto');
    } finally {
      setSaving(false);
    }
  }

  async function creaNuovo() {
    if (!form.numero_impianto.trim()) { toast.error('Il numero impianto è obbligatorio'); return; }
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        tipo,
        anno_installazione: form.anno_installazione ? parseInt(form.anno_installazione) : null,
      };
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/impianti`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const imp = await res.json();
      toast.success(`Impianto ${imp.numero_impianto} creato e collegato`);
      onLinked();
      onClose();
    } catch {
      toast.error('Errore creazione impianto');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-500" /> Gestione Impianto
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b">
          {(['cerca', 'nuovo'] as const).map(t => (
            <button type="button" key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                tab === t ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {t === 'cerca' ? '🔍 Cerca esistente' : '+ Nuovo impianto'}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          {tab === 'cerca' ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Cerca per numero, indirizzo o cliente finale..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus />
              </div>
              {searching && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-blue-400" /></div>}
              {!searching && results.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Nessun impianto trovato</p>
              )}
              {results.map(imp => (
                <div key={imp.id} className="flex items-start justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">{imp.numero_impianto}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${imp.tipo === 'ristrutturazione' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                        {imp.tipo === 'ristrutturazione' ? 'Ristrutturazione' : 'Nuovo'}
                      </span>
                    </div>
                    {imp.cliente_finale && <p className="text-xs text-gray-500 mt-0.5">{imp.cliente_finale}</p>}
                    {imp.indirizzo && <p className="text-xs text-gray-400 truncate">{imp.indirizzo}</p>}
                  </div>
                  <button type="button" onClick={() => collegaEsistente(imp)} disabled={saving}
                    className="ml-3 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0">
                    Collega
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Tipo impianto *</label>
                <div className="flex gap-3">
                  {(['nuovo', 'ristrutturazione'] as const).map(t => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={tipo === t} onChange={() => setTipo(t)} className="text-blue-600" />
                      <span className="text-sm text-gray-700">{t === 'nuovo' ? 'Nuovo impianto' : 'Ristrutturazione'}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Numero impianto *</label>
                <input value={form.numero_impianto} onChange={e => setForm(f => ({ ...f, numero_impianto: e.target.value }))}
                  placeholder="Es: ASC-042" className={inputClass} autoFocus />
              </div>
              <div>
                <label className={labelClass}>Indirizzo</label>
                <input value={form.indirizzo} onChange={e => setForm(f => ({ ...f, indirizzo: e.target.value }))}
                  placeholder="Via Roma 1, Milano" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Cliente finale</label>
                <input value={form.cliente_finale} onChange={e => setForm(f => ({ ...f, cliente_finale: e.target.value }))}
                  placeholder="Condominio / committente finale" className={inputClass} />
              </div>
              {tipo === 'ristrutturazione' && (
                <div className="space-y-4 border-t border-amber-200 pt-4">
                  <p className="text-xs text-amber-600 font-medium uppercase tracking-wide">Dati impianto esistente</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Anno installazione</label>
                      <input type="number" value={form.anno_installazione}
                        onChange={e => setForm(f => ({ ...f, anno_installazione: e.target.value }))}
                        placeholder="Es: 1998" min={1950} max={new Date().getFullYear()} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Costruttore</label>
                      <input value={form.costruttore} onChange={e => setForm(f => ({ ...f, costruttore: e.target.value }))}
                        placeholder="Es: Kone" className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Modello</label>
                    <input value={form.modello} onChange={e => setForm(f => ({ ...f, modello: e.target.value }))}
                      placeholder="Es: MonoSpace 500" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Note</label>
                    <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                      placeholder="Note aggiuntive sull'impianto..." rows={2} className={`${inputClass} resize-none`} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annulla</button>
          {tab === 'nuovo' && (
            <button type="button" onClick={creaNuovo} disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Crea e collega
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sezione Impianti ────────────────────────────────────────────────────────
function SezioneImpianti({ preventivoId }: { preventivoId: number }) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: impianti = [], isLoading } = useQuery<Impianto[]>({
    queryKey: ['impianti', preventivoId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/impianti`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: preventivoId > 0,
  });

  async function scollega(imp: Impianto) {
    await fetch(`${API_BASE}/preventivi/${preventivoId}/impianti/${imp.id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['impianti', preventivoId] });
    toast.success(`Impianto ${imp.numero_impianto} scollegato`);
  }

  const refresh = () => qc.invalidateQueries({ queryKey: ['impianti', preventivoId] });

  return (
    <>
      {dialogOpen && (
        <ImpiantoDialog preventivoId={preventivoId} onClose={() => setDialogOpen(false)} onLinked={refresh} />
      )}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-500" /> Impianti collegati
          </h3>
          <button type="button" onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> Aggiungi
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Caricamento...
          </div>
        ) : impianti.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
            <Building2 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Nessun impianto collegato</p>
            <button type="button" onClick={() => setDialogOpen(true)} className="mt-2 text-sm text-blue-500 hover:underline">
              Collega o crea un impianto
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {impianti.map(imp => (
              <div key={imp.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="font-semibold text-gray-900 text-sm">{imp.numero_impianto}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
                      imp.tipo === 'ristrutturazione' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {imp.tipo === 'ristrutturazione' ? 'Ristrutturazione' : 'Nuovo'}
                    </span>
                    {imp.cliente_finale && <span className="text-xs text-gray-500 truncate">{imp.cliente_finale}</span>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button type="button" onClick={() => setExpandedId(expandedId === imp.id ? null : imp.id)}
                      className="p-1 text-gray-400 hover:text-gray-600" title="Dettagli">
                      {expandedId === imp.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button type="button" onClick={() => scollega(imp)} className="p-1 text-red-300 hover:text-red-500" title="Scollega">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {expandedId === imp.id && (
                  <div className="px-3 py-2 border-t border-gray-100 bg-white text-xs text-gray-600 grid grid-cols-2 gap-1">
                    {imp.indirizzo && <span><strong>Indirizzo:</strong> {imp.indirizzo}</span>}
                    {imp.anno_installazione && <span><strong>Anno:</strong> {imp.anno_installazione}</span>}
                    {imp.costruttore && <span><strong>Costruttore:</strong> {imp.costruttore}</span>}
                    {imp.modello && <span><strong>Modello:</strong> {imp.modello}</span>}
                    {imp.note && <span className="col-span-2"><strong>Note:</strong> {imp.note}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── DatiCommessaForm ────────────────────────────────────────────────────────
export function DatiCommessaForm() {
  const { id } = useParams<{ id: string }>();
  const preventivoId = parseInt(id || "0", 10);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverSnapshotRef = useRef<string>('');
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const { data: preventivo } = useQuery({
    queryKey: ["preventivo", preventivoId],
    queryFn: async () => {
      if (!preventivoId || preventivoId === 0) return null;
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: preventivoId > 0,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const { data: datiCommessa, isLoading } = useQuery({
    queryKey: ["dati-commessa", preventivoId],
    queryFn: async () => {
      if (!preventivoId || preventivoId === 0) return null;
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/dati-commessa`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: preventivoId > 0,
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const form = useForm<DatiCommessaFormValues>({
    resolver: zodResolver(datiCommessaSchema),
    defaultValues: {
      numero_offerta: "", data_offerta: "", riferimento_cliente: "",
      quantita: null, data_consegna_richiesta: "",
      imballo: "", reso_fco: "", pagamento: "", trasporto: "", destinazione: "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: DatiCommessaFormValues) => {
      console.log("[DatiCommessa] Salvataggio...", Object.keys(data).filter(k => (data as any)[k]));
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/dati-commessa`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          data_offerta: itToIso(data.data_offerta || ""),
        }),
      });
      if (!res.ok) throw new Error(`Errore salvataggio: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      serverSnapshotRef.current = normalize(form.getValues());
      setLastSaved(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
      toast.success("Dati commessa salvati");
    },
    onError: (error) => {
      console.error("[DatiCommessa] Errore:", error);
      toast.error("Errore nel salvataggio dei dati");
    },
  });

  useEffect(() => {
    if (!datiCommessa) return;
    const formData: DatiCommessaFormValues = {
      numero_offerta: datiCommessa.numero_offerta || preventivo?.numero_preventivo || "",
      data_offerta: isoToIt(datiCommessa.data_offerta || ""),
      riferimento_cliente: datiCommessa.riferimento_cliente || "",
      quantita: datiCommessa.quantita || null,
      data_consegna_richiesta: datiCommessa.data_consegna_richiesta || datiCommessa.consegna_richiesta || "",
      imballo: datiCommessa.imballo || "",
      reso_fco: datiCommessa.reso_fco || "",
      pagamento: datiCommessa.pagamento || "",
      trasporto: datiCommessa.trasporto || "",
      destinazione: datiCommessa.destinazione || "",
    };
    serverSnapshotRef.current = normalize(formData);
    console.log("[DatiCommessa] Reset form con dati server:",
      Object.entries(formData).filter(([,v]) => v).map(([k]) => k));
    form.reset(formData);
  }, [datiCommessa]);

  useEffect(() => {
    if (preventivo?.cliente_id) setClienteId(preventivo.cliente_id);
  }, [preventivo]);

  useEffect(() => {
    const subscription = form.watch(() => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        const currentValues = form.getValues();
        const currentJson = normalize(currentValues);
        if (currentJson === serverSnapshotRef.current) return;
        console.log("[DatiCommessa] Auto-save (valori cambiati):",
          Object.entries(currentValues).filter(([,v]) => v).map(([k]) => k));
        updateMutation.mutate(currentValues);
      }, 1500);
    });
    return () => {
      subscription.unsubscribe();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        const currentValues = form.getValues();
        const currentJson = normalize(currentValues);
        if (currentJson !== serverSnapshotRef.current) {
          try {
            fetch(`${API_BASE}/preventivi/${preventivoId}/dati-commessa`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(currentValues),
              keepalive: true,
            });
          } catch {}
        }
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="bg-white/70 rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-600">Caricamento dati commessa...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/70 rounded-lg shadow">
      <div className="px-6 py-4 border-b bg-gray-50/70">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Dati Commessa</h2>
            <p className="text-sm text-gray-600">Informazioni sull'ordine e condizioni commerciali</p>
          </div>
          <div className="flex items-center gap-3">
            {updateMutation.isPending && (
              <span className="text-sm text-blue-600 animate-pulse flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Salvataggio...
              </span>
            )}
            {lastSaved && !updateMutation.isPending && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Salvato alle {lastSaved}
              </span>
            )}
          </div>
        </div>
      </div>

      <form className="p-6 space-y-6">
        {/* Informazioni Ordine */}
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" /> Informazioni Ordine
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Numero Offerta</label>
              <input {...form.register("numero_offerta")} placeholder="Es: 2025/0001" className={`${inputClass} bg-gray-50`} readOnly />
            </div>
            <div>
              <label className={labelClass}>Data Offerta</label>
              <input {...form.register("data_offerta")} type="date" className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Cliente</label>
              <ClienteSelector
                value={clienteId}
                onChange={(id: number | null, cliente?: any) => {
                  setClienteId(id);
                  if (cliente) {
                    form.setValue("riferimento_cliente", cliente.ragione_sociale, { shouldDirty: true });
                    if (cliente.pagamento_default) form.setValue("pagamento", cliente.pagamento_default, { shouldDirty: true });
                    if (cliente.imballo_default) form.setValue("imballo", cliente.imballo_default, { shouldDirty: true });
                    if (cliente.reso_fco_default) form.setValue("reso_fco", cliente.reso_fco_default, { shouldDirty: true });
                    if (cliente.trasporto_default) form.setValue("trasporto", cliente.trasporto_default, { shouldDirty: true });
                    if (cliente.destinazione_default) form.setValue("destinazione", cliente.destinazione_default, { shouldDirty: true });
                  }
                  if (id) {
                    fetch(`${API_BASE}/preventivi/${preventivoId}`, {
                      method: 'PUT', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ cliente_id: id }),
                    }).catch(console.error);
                  }
                }}
                placeholder="Cerca cliente per nome, codice o P.IVA..."
              />
            </div>
            <div>
              <label className={labelClass}>Quantità </label>
              <input {...form.register("quantita")} type="number" min="1" placeholder="Es: 1" className={inputClass} />
            </div>
            <div>
              <label className={`${labelClass} flex items-center gap-2`}>
                <Clock className="w-4 h-4 text-amber-500" /> Data Consegna Richiesta
              </label>
              <input {...form.register("data_consegna_richiesta")} type="date"
                className={`${inputClass} border-amber-300 focus:ring-amber-500 focus:border-amber-500`} />
              <p className="text-xs text-amber-600 mt-1">Usata per verifica Lead Time nella sezione Materiali</p>
            </div>
          </div>
        </div>

        {/* Impianti */}
        <div className="border-t pt-6">
          <SezioneImpianti preventivoId={preventivoId} />
        </div>

        {/* Condizioni Commerciali */}
        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Condizioni Commerciali</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Imballo</label>
              <input {...form.register("imballo")} placeholder="Es: Cartone" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Reso F.co</label>
              <input {...form.register("reso_fco")} placeholder="Es: Stabilimento" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Pagamento</label>
              <input {...form.register("pagamento")} placeholder="Es: 30 gg d.f." className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Trasporto</label>
              <input {...form.register("trasporto")} placeholder="Es: Corriere" className={inputClass} />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Destinazione</label>
              <input {...form.register("destinazione")} placeholder="Indirizzo di destinazione" className={inputClass} />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default DatiCommessaForm;
