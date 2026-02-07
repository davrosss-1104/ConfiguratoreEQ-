import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SelectConAggiungi } from './SelectConAggiungi';
import { CampiPersonalizzati } from './CampiPersonalizzati';

const API_BASE = 'http://localhost:8000/api';

interface NormativeFormProps {
  preventivoId: number;
  isAdmin?: boolean;
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

// Fallback opzioni (usate se API non disponibile)
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

// Stile comune per select (usato altrove nel form)
const selectClass = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors";

export function NormativeForm({ preventivoId, isAdmin = false }: NormativeFormProps) {
  const [formData, setFormData] = useState<NormativeData>(defaultFormData);
  const [campiPersonalizzati, setCampiPersonalizzati] = useState<Record<string, any>>({});
  const queryClient = useQueryClient();
  const isInitialized = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Query per caricare dati
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

  // Mutation per salvare
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
      
      if (data?.materials_added > 0) {
        toast.success(`✨ ${data.materials_added} materiali aggiunti automaticamente!`, {
          description: 'Il rule engine ha aggiunto i componenti necessari',
          duration: 5000,
        });
      } else {
        toast.success('Normative salvate');
      }
    },
    onError: () => {
      toast.error('Errore nel salvataggio');
    },
  });

  // Carica dati quando disponibili
  useEffect(() => {
    if (normativeData && !isInitialized.current) {
      setFormData({
        ...defaultFormData,
        ...normativeData,
      });
      isInitialized.current = true;
    }
  }, [normativeData]);

  // Auto-save con debounce
  useEffect(() => {
    if (!isInitialized.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveMutation.mutate(formData);
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [formData]);

  const handleSelectChange = (field: keyof NormativeData, value: string) => {
    const finalValue = value === '' ? null : value;
    setFormData((prev) => ({
      ...prev,
      [field]: finalValue,
    }));
  };

  const handleCheckboxChange = (field: keyof NormativeData, checked: boolean) => {
    setFormData((prev) => ({
      ...prev,
      [field]: checked,
    }));
  };

  if (isLoading) {
    return (
      <div className="p-6 bg-white rounded-lg shadow">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-600">Caricamento normative...</span>
        </div>
      </div>
    );
  }

  // Verifica se EN 81-20 ha una regola attiva
  const en8120HasRule = formData.en_81_20 === '2020';

  return (
    <div className="p-6 bg-white rounded-lg shadow space-y-6">
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
        <SelectConAggiungi
          gruppo="en_81_1_anno"
          value={formData.en_81_1 || ''}
          onChange={(value) => handleSelectChange('en_81_1', value)}
          label="EN 81-1"
          placeholder="Seleziona..."
          fallbackOptions={FALLBACK_OPTIONS.en_81_1_anno}
          isAdmin={isAdmin}
        />

        {/* EN 81-20 - CAMPO CON REGOLA */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            EN 81-20
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              <Zap className="w-3 h-3" />
              Aggiunge materiali automaticamente
            </span>
          </label>
          <SelectConAggiungi
            gruppo="en_81_20_anno"
            value={formData.en_81_20 || ''}
            onChange={(value) => handleSelectChange('en_81_20', value)}
            placeholder="Seleziona..."
            className={en8120HasRule ? 'border-amber-400 bg-amber-50' : ''}
            fallbackOptions={FALLBACK_OPTIONS.en_81_20_anno}
            isAdmin={isAdmin}
          />
        </div>

        {/* EN 81-21 */}
        <SelectConAggiungi
          gruppo="en_81_21_anno"
          value={formData.en_81_21 || ''}
          onChange={(value) => handleSelectChange('en_81_21', value)}
          label="EN 81-21"
          placeholder="Seleziona..."
          fallbackOptions={FALLBACK_OPTIONS.en_81_21_anno}
          isAdmin={isAdmin}
        />

        {/* Box regola attiva */}
        {en8120HasRule && (
          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Regola Automatica Attiva
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  La regola <strong>RULE_EN81_20_2020</strong> aggiunge automaticamente i componenti di sicurezza richiesti dalla normativa EN 81-20:2020.
                </p>
                <p className="text-xs text-amber-500 mt-2">
                  Vai alla sezione "Materiali" per vedere i componenti aggiunti.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Checkbox normative */}
        <div className="space-y-3 pt-4 border-t">
          <h3 className="text-sm font-semibold text-gray-700">Normative aggiuntive</h3>
          
          <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
            <input
              type="checkbox"
              checked={formData.en_81_28 || false}
              onChange={(e) => handleCheckboxChange('en_81_28', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">EN 81-28 (Allarme)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
            <input
              type="checkbox"
              checked={formData.en_81_70 || false}
              onChange={(e) => handleCheckboxChange('en_81_70', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">EN 81-70 (Accessibilità)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
            <input
              type="checkbox"
              checked={formData.en_81_72 || false}
              onChange={(e) => handleCheckboxChange('en_81_72', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">EN 81-72 (Pompieri)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
            <input
              type="checkbox"
              checked={formData.en_81_73 || false}
              onChange={(e) => handleCheckboxChange('en_81_73', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">EN 81-73 (Comportamento incendio)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
            <input
              type="checkbox"
              checked={formData.a3_95_16 || false}
              onChange={(e) => handleCheckboxChange('a3_95_16', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">A3 95/16</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
            <input
              type="checkbox"
              checked={formData.dm236_legge13 || false}
              onChange={(e) => handleCheckboxChange('dm236_legge13', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">DM236 (Legge 13)</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
            <input
              type="checkbox"
              checked={formData.emendamento_a3 || false}
              onChange={(e) => handleCheckboxChange('emendamento_a3', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Emendamento A3</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors">
            <input
              type="checkbox"
              checked={formData.uni_10411_1 || false}
              onChange={(e) => handleCheckboxChange('uni_10411_1', e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">UNI 10411-1</span>
          </label>
        </div>
      </div>

      {/* Campi Personalizzati - caricati dinamicamente dal database */}
      <CampiPersonalizzati
        sezione="normative"
        preventivoId={preventivoId}
        valori={campiPersonalizzati}
        onChange={(codice, valore) => {
          setCampiPersonalizzati(prev => ({ ...prev, [codice]: valore }));
          // TODO: salvare i campi personalizzati
        }}
        isAdmin={isAdmin}
        titolo="Normative aggiuntive"
      />

      {/* Info box */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-700">
          💡 <strong>Tip:</strong> Selezionando "EN 81-20:2020", il sistema aggiungerà automaticamente
          i componenti di sicurezza richiesti dalla normativa.
        </p>
      </div>
    </div>
  );
}

// Export anche come default per compatibilità
export default NormativeForm;
