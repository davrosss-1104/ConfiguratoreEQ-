import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Calendar, Loader2, Clock, CheckCircle2 } from "lucide-react";
import { ClienteSelector } from "../ClienteSelector";
const API_BASE = 'http://localhost:8000';

// Campo DB = consegna_richiesta (NON data_consegna_richiesta)
const datiCommessaSchema = z.object({
  numero_offerta: z.string().optional().default(""),
  data_offerta: z.string().optional().default(""),
  riferimento_cliente: z.string().optional().default(""),
  quantita: z.coerce.number().optional().nullable().default(null),
  consegna_richiesta: z.string().optional().default(""),
  imballo: z.string().optional().default(""),
  reso_fco: z.string().optional().default(""),
  pagamento: z.string().optional().default(""),
  trasporto: z.string().optional().default(""),
  destinazione: z.string().optional().default(""),
});

type DatiCommessaFormValues = z.infer<typeof datiCommessaSchema>;

const inputClass = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

// Normalizza per confronto: null/undefined/"" → ""
function normalize(values: Record<string, any>): string {
  const obj: Record<string, any> = {};
  for (const key of Object.keys(values).sort()) {
    const v = values[key];
    obj[key] = (v === null || v === undefined || v === '') ? '' : String(v);
  }
  return JSON.stringify(obj);
}

export function DatiCommessaForm() {
  const { id } = useParams<{ id: string }>();
  const preventivoId = parseInt(id || "0", 10);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverSnapshotRef = useRef<string>('{}');
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
      quantita: null, consegna_richiesta: "",
      imballo: "", reso_fco: "", pagamento: "", trasporto: "", destinazione: "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: DatiCommessaFormValues) => {
      console.log("[DatiCommessa] Salvataggio...", Object.keys(data).filter(k => (data as any)[k]));
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/dati-commessa`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`Errore salvataggio: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      // Aggiorna snapshot con valori appena salvati
      serverSnapshotRef.current = normalize(form.getValues());
      setLastSaved(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
      toast.success("Dati commessa salvati");
    },
    onError: (error) => {
      console.error("[DatiCommessa] Errore:", error);
      toast.error("Errore nel salvataggio dei dati");
    },
  });

  // Popola il form quando arrivano i dati dal server
  useEffect(() => {
    if (!datiCommessa) return;

    const formData: DatiCommessaFormValues = {
      numero_offerta: datiCommessa.numero_offerta || preventivo?.numero_preventivo || "",
      data_offerta: datiCommessa.data_offerta || "",
      riferimento_cliente: datiCommessa.riferimento_cliente || "",
      quantita: datiCommessa.quantita || null,
      consegna_richiesta: datiCommessa.consegna_richiesta || "",
      imballo: datiCommessa.imballo || "",
      reso_fco: datiCommessa.reso_fco || "",
      pagamento: datiCommessa.pagamento || "",
      trasporto: datiCommessa.trasporto || "",
      destinazione: datiCommessa.destinazione || "",
    };

    console.log("[DatiCommessa] Reset form con dati server:",
      Object.entries(formData).filter(([,v]) => v).map(([k]) => k));

    form.reset(formData);

    // Snapshot DOPO il reset, leggendo i valori come li vede RHF/Zod
    // requestAnimationFrame assicura che form.getValues() rifletta il reset
    requestAnimationFrame(() => {
      serverSnapshotRef.current = normalize(form.getValues());
      console.log("[DatiCommessa] Snapshot salvato");
    });

    }, [datiCommessa]);

    // Ripristina cliente dal preventivo (effect separato)
    useEffect(() => {
    }, [preventivo]);

  // Auto-save: confronta valori attuali con snapshot server
  useEffect(() => {
    const subscription = form.watch(() => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(() => {
        const currentValues = form.getValues();
        const currentJson = normalize(currentValues);

        if (currentJson === serverSnapshotRef.current) {
          return; // Nessuna modifica reale
        }

        console.log("[DatiCommessa] Auto-save (valori cambiati):",
          Object.entries(currentValues).filter(([,v]) => v).map(([k]) => k));
        updateMutation.mutate(currentValues);
      }, 1500);
    });

    return () => {
      subscription.unsubscribe();
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
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
                  // Salva cliente_id tramite auto-save dati-commessa
                  if (id) {
                    fetch(`${API_BASE}/preventivi/${preventivoId}/dati-commessa`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ cliente_id: id }),
                    }).then(res => {
                      if (res.ok) console.log('[DatiCommessa] cliente_id salvato:', id);
                      else res.text().then(t => console.error('[DatiCommessa] cliente_id ERRORE:', t));
                    }).catch(console.error);
                  }
                }}
                placeholder="Cerca cliente per nome, codice o P.IVA..."
              />
            </div>
            <div>
              <label className={labelClass}>Quantità</label>
              <input {...form.register("quantita")} type="number" min="1" placeholder="Es: 1" className={inputClass} />
            </div>
            <div>
              <label className={`${labelClass} flex items-center gap-2`}>
                <Clock className="w-4 h-4 text-amber-500" /> Data Consegna Richiesta
              </label>
              <input {...form.register("consegna_richiesta")} type="date"
                className={`${inputClass} border-amber-300 focus:ring-amber-500 focus:border-amber-500`} />
              <p className="text-xs text-amber-600 mt-1">Usata per verifica Lead Time nella sezione Materiali</p>
            </div>
          </div>
        </div>

        <div>
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
