import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { Calendar, Loader2, Clock } from "lucide-react";

const API_BASE = 'http://localhost:8000/api';

// Schema validazione
const datiCommessaSchema = z.object({
  numero_offerta: z.string().optional(),
  data_offerta: z.string().optional(),
  riferimento_cliente: z.string().optional(),
  quantita: z.coerce.number().int().positive().optional().nullable(),
  data_consegna_richiesta: z.string().optional(), // Data per calcolo lead time
  imballo: z.string().optional(),
  reso_fco: z.string().optional(),
  pagamento: z.string().optional(),
  trasporto: z.string().optional(),
  destinazione: z.string().optional(),
});

type DatiCommessaFormValues = z.infer<typeof datiCommessaSchema>;

const inputClass = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

export function DatiCommessaForm() {
  const { id } = useParams<{ id: string }>();
  const preventivoId = parseInt(id || "0", 10);
  const queryClient = useQueryClient();
  const isInitialized = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Carica preventivo
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

  // Carica dati commessa esistenti
  const { data: datiCommessa, isLoading } = useQuery({
    queryKey: ["dati-commessa", preventivoId],
    queryFn: async () => {
      if (!preventivoId || preventivoId === 0) return null;
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/dati-commessa`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: preventivoId > 0,
  });

  // Form setup
  const form = useForm<DatiCommessaFormValues>({
    resolver: zodResolver(datiCommessaSchema),
    defaultValues: {
      numero_offerta: "",
      data_offerta: "",
      riferimento_cliente: "",
      quantita: null,
      data_consegna_richiesta: "",
      imballo: "",
      reso_fco: "",
      pagamento: "",
      trasporto: "",
      destinazione: "",
    },
  });

  // Mutation per salvare
  const updateMutation = useMutation({
    mutationFn: async (data: DatiCommessaFormValues) => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/dati-commessa`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Errore salvataggio');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dati-commessa", preventivoId] });
      toast.success("Dati commessa salvati");
    },
    onError: () => {
      toast.error("Errore nel salvataggio dei dati");
    },
  });

  // Pre-popola il form quando i dati sono caricati
  useEffect(() => {
    if (datiCommessa && !isInitialized.current) {
      form.reset({
        numero_offerta: datiCommessa.numero_offerta || preventivo?.numero_preventivo || "",
        data_offerta: datiCommessa.data_offerta || "",
        riferimento_cliente: datiCommessa.riferimento_cliente || "",
        quantita: datiCommessa.quantita,
        data_consegna_richiesta: datiCommessa.data_consegna_richiesta || "",
        imballo: datiCommessa.imballo || "",
        reso_fco: datiCommessa.reso_fco || "",
        pagamento: datiCommessa.pagamento || "",
        trasporto: datiCommessa.trasporto || "",
        destinazione: datiCommessa.destinazione || "",
      });
      isInitialized.current = true;
    }
  }, [datiCommessa, preventivo, form]);

  // Auto-save con debounce
  useEffect(() => {
    if (!isInitialized.current) return;

    const subscription = form.watch((values) => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        updateMutation.mutate(values as DatiCommessaFormValues);
      }, 2000);
    });

    return () => {
      subscription.unsubscribe();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [form.watch]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-600">Caricamento dati commessa...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Dati Commessa</h2>
            <p className="text-sm text-gray-600">Informazioni sull'ordine e condizioni commerciali</p>
          </div>
          {updateMutation.isPending && (
            <span className="text-sm text-blue-600 animate-pulse flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Salvataggio...
            </span>
          )}
        </div>
      </div>

      <form className="p-6 space-y-6">
        {/* Informazioni Ordine */}
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-500" />
            Informazioni Ordine
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Numero Offerta</label>
              <input
                {...form.register("numero_offerta")}
                placeholder="Es: 2025/0001"
                className={`${inputClass} bg-gray-50`}
                readOnly
              />
            </div>

            <div>
              <label className={labelClass}>Data Offerta</label>
              <input
                {...form.register("data_offerta")}
                type="date"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Riferimento Cliente</label>
              <input
                {...form.register("riferimento_cliente")}
                placeholder="Riferimento interno cliente"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Quantità</label>
              <input
                {...form.register("quantita")}
                type="number"
                min="1"
                placeholder="Es: 1"
                className={inputClass}
              />
            </div>

            {/* Data Consegna Richiesta - Campo integrato con icona */}
            <div>
              <label className={`${labelClass} flex items-center gap-2`}>
                <Clock className="w-4 h-4 text-amber-500" />
                Data Consegna Richiesta
              </label>
              <input
                {...form.register("data_consegna_richiesta")}
                type="date"
                className={`${inputClass} border-amber-300 focus:ring-amber-500 focus:border-amber-500`}
              />
              <p className="text-xs text-amber-600 mt-1">
                Usata per verifica Lead Time nella sezione Materiali
              </p>
            </div>
          </div>
        </div>

        {/* Condizioni Commerciali */}
        <div>
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Condizioni Commerciali</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Imballo</label>
              <input
                {...form.register("imballo")}
                placeholder="Es: Cartone"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Reso F.co</label>
              <input
                {...form.register("reso_fco")}
                placeholder="Es: Stabilimento"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Pagamento</label>
              <input
                {...form.register("pagamento")}
                placeholder="Es: 30 gg d.f."
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Trasporto</label>
              <input
                {...form.register("trasporto")}
                placeholder="Es: Corriere"
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Destinazione</label>
              <input
                {...form.register("destinazione")}
                placeholder="Indirizzo di destinazione"
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default DatiCommessaForm;
