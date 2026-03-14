import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SelectConAggiungi } from './SelectConAggiungi';
import { CampiPersonalizzati } from './CampiPersonalizzati';
import { useFieldsWithRules } from '@/hooks/useFieldsWithRules';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface NormativeFormProps {
  preventivoId: number;
  isAdmin?: boolean;
  onDataChange?: () => void;
}

interface NormativeData {
  en_81_1?: string | null;
  en_81_20?: string | null;
  en_81_21?: string | null;
  en_81_28?: boolean;
  en_81_70?: boolean;
  en_81_72?: boolean;
  en_81_73?: boolean;
  a3_95_16?: boolean;
  dm236_legge13?: boolean;
  emendamento_a3?: boolean;
  uni_10411_1?: boolean;
}

const defaultFormData: NormativeData = {
  en_81_1: null,
  en_81_20: null,
  en_81_21: null,
  en_81_28: false,
  en_81_70: false,
  en_81_72: false,
  en_81_73: false,
  a3_95_16: false,
  dm236_legge13: false,
  emendamento_a3: false,
  uni_10411_1: false,
};

const FALLBACK_OPTIONS = {
  en_81_1_anno: [
    { value: '1998', label: '1998' },
    { value: '2010', label: '2010' },
  ],
  en_81_20_anno: [
    { value: '2014', label: '2014' },
    { value: '2020', label: '2020' },
  ],
  en_81_21_anno: [
    { value: '2009', label: '2009' },
    { value: '2018', label: '2018' },
  ],
};

const selectClass = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors";

export function NormativeForm({ preventivoId, isAdmin = false, onDataChange }: NormativeFormProps) {
  const [formData, setFormData] = useState<NormativeData>(defaultFormData);
  const [campiPersonalizzati, setCampiPersonalizzati] = useState<Record<string, any>>({});
  const fieldsWithRules = useFieldsWithRules();
  const queryClient = useQueryClient();
  const isInitialized = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: normativeData, isLoading } = useQuery({
    queryKey: ['normative', preventivoId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/normative`);
      if (!res.ok) return defaultFormData;
      const data = await res.json();
      return data || defaultFormData;
    },
    enabled: preventivoId > 0,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: NormativeData) => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/normative`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Errore salvataggio');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['normative', preventivoId] });
      queryClient.invalidateQueries({ queryKey: ['materiali', preventivoId] });
      onDataChange?.();
      if (data?.materials_added > 0) {
        toast.success(`✨ ${data.materials_added} materiali aggiunti automaticamente!`, {
          description: 'Il rule engine ha aggiunto i componenti necessari',
          duration: 5000,
        });
      } else {
        toast.success('Normative salvate');
      }
    },
    onError: () => { toast.error('Errore nel salvataggio'); },
  });

  useEffect(() => {
    if (normativeData && !isInitialized.current) {
      setFormData({ ...defaultFormData, ...normativeData });
      isInitialized.current = true;
    }
  }, [normativeData]);

  useEffect(() => {
    if (!isInitialized.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => { saveMutation.mutate(formData); }, 2000);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [formData]);

  const handleSelectChange = (field: keyof NormativeData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value === '' ? null : value }));
  };

  const handleCheckboxChange = (field: keyof NormativeData, checked: boolean) => {
    setFormData((prev) => ({ ...prev, [field]: checked }));
  };

  // Icona fulmine per campi con regola
  const RuleIcon = ({ field }: { field: string }) => {
    if (!fieldsWithRules.has(field)) return null;
    return (
      <Zap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" title="Collegato a una regola automatica" />
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-white/70 rounded-lg shadow">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-600">Caricamento normative...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white/70 rounded-lg shadow space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Normative</h2>
          <p className="text-gray-600 text-sm">
            Configura le normative applicabili all'impianto
          </p>
        </div>
        {saveMutation.isPending && (
          <span className="text-sm text-blue-600 animate-pulse flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Salvataggio...
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* EN 81-1 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            EN 81-1 <RuleIcon field="en_81_1" />
          </label>
          <SelectConAggiungi
            gruppo="en_81_1_anno"
            value={formData.en_81_1 || ''}
            onChange={(value) => handleSelectChange('en_81_1', value)}
            placeholder="Seleziona..."
            fallbackOptions={FALLBACK_OPTIONS.en_81_1_anno}
            isAdmin={isAdmin}
          />
        </div>

        {/* EN 81-20 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            EN 81-20 <RuleIcon field="en_81_20" />
          </label>
          <SelectConAggiungi
            gruppo="en_81_20_anno"
            value={formData.en_81_20 || ''}
            onChange={(value) => handleSelectChange('en_81_20', value)}
            placeholder="Seleziona..."
            fallbackOptions={FALLBACK_OPTIONS.en_81_20_anno}
            isAdmin={isAdmin}
          />
        </div>

        {/* EN 81-21 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            EN 81-21 <RuleIcon field="en_81_21" />
          </label>
          <SelectConAggiungi
            gruppo="en_81_21_anno"
            value={formData.en_81_21 || ''}
            onChange={(value) => handleSelectChange('en_81_21', value)}
            placeholder="Seleziona..."
            fallbackOptions={FALLBACK_OPTIONS.en_81_21_anno}
            isAdmin={isAdmin}
          />
        </div>

        {/* Checkbox normative */}
        <div className="space-y-3 pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-700">Normative aggiuntive</h3>

          {([
            { field: 'en_81_28', label: 'EN 81-28 (Allarme)' },
            { field: 'en_81_70', label: 'EN 81-70 (Accessibilità)' },
            { field: 'en_81_72', label: 'EN 81-72 (Pompieri)' },
            { field: 'en_81_73', label: 'EN 81-73 (Comportamento incendio)' },
            { field: 'a3_95_16', label: 'A3 95/16' },
            { field: 'dm236_legge13', label: 'DM236 (Legge 13)' },
            { field: 'emendamento_a3', label: 'Emendamento A3' },
            { field: 'uni_10411_1', label: 'UNI 10411-1' },
          ] as const).map(({ field, label }) => (
            <label key={field} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
              <input
                type="checkbox"
                checked={formData[field] as boolean || false}
                onChange={(e) => handleCheckboxChange(field, e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{label}</span>
              <RuleIcon field={field} />
            </label>
          ))}
        </div>
      </div>

      {/* Campi Personalizzati */}
      <CampiPersonalizzati
        sezione="normative"
        preventivoId={preventivoId}
        valori={campiPersonalizzati}
        onChange={(codice, valore) => {
          setCampiPersonalizzati(prev => ({ ...prev, [codice]: valore }));
        }}
        isAdmin={isAdmin}
        titolo="Normative aggiuntive"
      />
    </div>
  );
}

export default NormativeForm;
