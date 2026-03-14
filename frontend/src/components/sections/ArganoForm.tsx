import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { Zap, Loader2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const arganoSchema = z.object({
  trazione: z.string().optional(),
  potenza_motore_kw: z.number().optional().nullable(),
  corrente_nom_motore_amp: z.number().optional().nullable(),
  tipo_vvvf: z.string().optional(),
  vvvf_nel_vano: z.boolean().optional(),
  freno_tensione: z.string().optional(),
  ventilazione_forzata: z.string().optional(),
  tipo_teleruttore: z.string().optional(),
});

type ArganoFormData = z.infer<typeof arganoSchema>;

interface ArganoFormProps {
  preventivoId: number;
}

// Stile comune per select e input
const inputClass = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors";
const selectClass = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors appearance-none cursor-pointer";

export function ArganoForm({ preventivoId }: ArganoFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  const isInitialized = useRef(false);

  const {
    register,
    watch,
    formState: { errors },
    setValue,
    reset,
  } = useForm<ArganoFormData>({
    resolver: zodResolver(arganoSchema),
    defaultValues: {
      trazione: '',
      potenza_motore_kw: 4.0,
      corrente_nom_motore_amp: 15.0,
      vvvf_nel_vano: false,
      freno_tensione: '48 Vcc',
      ventilazione_forzata: '24 Vcc',
      tipo_teleruttore: 'Schneider',
    },
  });

  // Carica dati esistenti
  const { data: arganoData } = useQuery({
    queryKey: ['argano', preventivoId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/argano`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: preventivoId > 0,
  });

  // Popola form con dati esistenti
  useEffect(() => {
    if (arganoData && !isInitialized.current) {
      reset({
        trazione: arganoData.trazione || '',
        potenza_motore_kw: arganoData.potenza_motore_kw || 4.0,
        corrente_nom_motore_amp: arganoData.corrente_nom_motore_amp || 15.0,
        tipo_vvvf: arganoData.tipo_vvvf || '',
        vvvf_nel_vano: arganoData.vvvf_nel_vano || false,
        freno_tensione: arganoData.freno_tensione || '48 Vcc',
        ventilazione_forzata: arganoData.ventilazione_forzata || '24 Vcc',
        tipo_teleruttore: arganoData.tipo_teleruttore || 'Schneider',
      });
      isInitialized.current = true;
    }
  }, [arganoData, reset]);

  const saveMutation = useMutation({
    mutationFn: async (data: ArganoFormData) => {
      const response = await fetch(
        `${API_BASE}/preventivi/${preventivoId}/argano`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );
      if (!response.ok) throw new Error('Errore salvataggio');
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['materiali', preventivoId] });
      queryClient.invalidateQueries({ queryKey: ['argano', preventivoId] });
      
      if (data.materials_added > 0) {
        toast.success(`✨ ${data.materials_added} materiali aggiunti automaticamente!`, {
          description: 'Il rule engine ha aggiunto i componenti necessari',
          duration: 5000,
        });
      } else {
        toast.success('Argano salvato');
      }
      setIsSaving(false);
    },
    onError: (error) => {
      console.error('Errore:', error);
      toast.error('Errore nel salvataggio');
      setIsSaving(false);
    },
  });

  // Auto-save con debounce
  useEffect(() => {
    if (!isInitialized.current) return;
    
    const subscription = watch((formData) => {
      const timeout = setTimeout(() => {
        if (formData.trazione) {
          setIsSaving(true);
          saveMutation.mutate(formData as ArganoFormData);
        }
      }, 1500);

      return () => clearTimeout(timeout);
    });

    return () => subscription.unsubscribe();
  }, [watch, isInitialized.current]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Argano</h2>
        {isSaving && (
          <span className="text-sm text-blue-600 animate-pulse">Salvataggio automatico...</span>
        )}
      </div>

      <div className="space-y-6">
        {/* Trazione - CAMPO CON REGOLA */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            Trazione *
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              <Zap className="w-3 h-3" />
              Aggiunge materiali automaticamente
            </span>
          </label>
          <div className="relative">
            <select {...register('trazione')} className={`${selectClass} ${watch('trazione') && ['Gearless MRL', 'Geared'].includes(watch('trazione') || '') ? 'border-amber-400 bg-amber-50' : ''}`}>
              <option value="">Seleziona...</option>
              <option value="Gearless MRL">⚡ Gearless MRL (con regola)</option>
              <option value="Geared">⚡ Geared (con regola)</option>
              <option value="Gearless">Gearless</option>
            </select>
            {watch('trazione') && ['Gearless MRL', 'Geared'].includes(watch('trazione') || '') && (
              <Zap className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
            )}
          </div>
          {errors.trazione && (
            <p className="mt-1 text-sm text-red-600">{errors.trazione.message}</p>
          )}
        </div>

        {/* Potenza e Corrente */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Potenza motore (KW)
            </label>
            <input
              type="number"
              step="0.1"
              {...register('potenza_motore_kw', { valueAsNumber: true })}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Corrente nom. motore (Amp)
            </label>
            <input
              type="number"
              step="0.1"
              {...register('corrente_nom_motore_amp', { valueAsNumber: true })}
              className={inputClass}
            />
          </div>
        </div>

        {/* Tipo VVVF */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipo VVVF
          </label>
          <select {...register('tipo_vvvf')} className={selectClass}>
            <option value="">Non fornire</option>
            <option value="Fuji Frenic-Lift LM1S">Fuji Frenic-Lift LM1S</option>
            <option value="Schneider">Schneider</option>
            <option value="ABB">ABB</option>
          </select>
        </div>

        {/* VVVF nel vano */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
          <input
            type="checkbox"
            id="vvvf_nel_vano"
            {...register('vvvf_nel_vano')}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="vvvf_nel_vano" className="text-sm text-gray-700">
            VVVF nel vano
          </label>
        </div>

        {/* Freno e Ventilazione */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Freno tensione
            </label>
            <select {...register('freno_tensione')} className={selectClass}>
              <option value="48 Vcc">48 Vcc</option>
              <option value="60 Vcc">60 Vcc</option>
              <option value="80 Vcc">80 Vcc</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ventilazione forzata
            </label>
            <select {...register('ventilazione_forzata')} className={selectClass}>
              <option value="24 Vcc">24 Vcc</option>
              <option value="48 Vcc">48 Vcc</option>
              <option value="Non fornire">Non fornire</option>
            </select>
          </div>
        </div>

        {/* Tipo Teleruttore */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tipo Teleruttore
          </label>
          <select {...register('tipo_teleruttore')} className={selectClass}>
            <option value="Schneider">Schneider</option>
            <option value="ABB">ABB</option>
            <option value="Siemens">Siemens</option>
          </select>
        </div>
      </div>

      {/* Info box */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-700">
          💡 <strong>Tip:</strong> Selezionando "Gearless MRL" o "Geared", il sistema aggiungerà automaticamente
          i materiali necessari alla distinta (Inverter, Encoder, Freno, ecc.).
        </p>
      </div>

      {/* Box regola attiva */}
      {watch('trazione') && ['Gearless MRL', 'Geared'].includes(watch('trazione') || '') && (
        <div className="mt-4 p-4 bg-amber-50 rounded-lg border border-amber-200">
          <div className="flex items-start gap-3">
            <Zap className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Regola Automatica Attiva
              </p>
              <p className="text-xs text-amber-600 mt-1">
                {watch('trazione') === 'Gearless MRL' && (
                  <>La regola <strong>RULE_GEARLESS_MRL</strong> aggiunge automaticamente: Quadro elettrico, Inverter, Encoder assoluto, Scheda controllo</>
                )}
                {watch('trazione') === 'Geared' && (
                  <>La regola <strong>RULE_GEARED</strong> aggiunge automaticamente: Quadro elettrico, Inverter, Encoder incrementale, Riduttore</>
                )}
              </p>
              <p className="text-xs text-amber-500 mt-2">
                Vai alla sezione "Materiali Automatici" per vedere i componenti aggiunti.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
