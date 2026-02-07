import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useToast } from '@/components/ui/use-toast';
import { PiantaInterattiva, PosizioneElemento } from './PiantaInterattiva';
import { TabellaSbarchi, Sbarco } from './TabellaSbarchi';
import { ElementiPalette } from './ElementiPalette';
import { 
  getDisposizioneVano, 
  updateDisposizioneVano,
  getDatiPrincipali,
} from '@/services/preventivi.service';

interface DisposizioneVanoFormProps {
  preventivoId: number;
}

// Tipo per i dati da salvare
interface DisposizioneVanoData {
  preventivo_id?: number;
  posizioni_elementi?: string | null;
  sbarchi?: string | null;
  note?: string | null;
}

// Helper per parsing sicuro di JSON
const safeJsonParse = <T,>(jsonString: string | null | undefined, defaultValue: T): T => {
  if (!jsonString || jsonString.trim() === '' || jsonString === 'null') {
    return defaultValue;
  }
  try {
    const parsed = JSON.parse(jsonString);
    return parsed || defaultValue;
  } catch (e) {
    console.error('❌ Errore parsing JSON:', jsonString, e);
    return defaultValue;
  }
};

export default function DisposizioneVanoForm({ preventivoId }: DisposizioneVanoFormProps) {
  const [posizioni, setPosizioni] = useState<Record<string, PosizioneElemento>>({});
  const [sbarchi, setSbarchi] = useState<Sbarco[]>([]);
  const [note, setNote] = useState<string>('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const form = useForm();

  console.log('🔍 DisposizioneVanoForm - preventivoId:', preventivoId);

  // Query per caricare dati esistenti
  const { data: disposizioneData, isLoading: isLoadingDisposizione } = useQuery({
    queryKey: ['disposizioneVano', preventivoId],
    queryFn: () => getDisposizioneVano(preventivoId),
    retry: 1,
  });

  // Query per ottenere numero fermate
  const { data: datiPrincipali } = useQuery({
    queryKey: ['datiPrincipali', preventivoId],
    queryFn: () => getDatiPrincipali(preventivoId),
    retry: 1,
  });

  const numeroFermate = datiPrincipali?.numero_fermate || 0;
  const numeroServizi = datiPrincipali?.numero_servizi || 0;

  // Mutation per salvare
  const mutation = useMutation({
    mutationFn: (data: DisposizioneVanoData) => updateDisposizioneVano(preventivoId, data),
    onSuccess: () => {
      setLastSaved(new Date());
      console.log('✅ Disposizione vano salvata con successo');
      queryClient.invalidateQueries({ queryKey: ['disposizioneVano', preventivoId] });
    },
    onError: (error: any) => {
      console.error('❌ Errore salvataggio disposizione vano:', error);
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Impossibile salvare i dati",
      });
    },
  });

  // Carica dati esistenti quando disponibili
  useEffect(() => {
    if (disposizioneData && !hasLoadedInitialData) {
      console.log('📥 Caricamento dati disposizione vano:', disposizioneData);

      // Parse posizioni elementi
      if (disposizioneData.posizioni_elementi) {
        const parsed = safeJsonParse<Record<string, PosizioneElemento>>(
          disposizioneData.posizioni_elementi,
          {}
        );
        console.log('📍 Posizioni caricate:', Object.keys(parsed).length, 'elementi');
        setPosizioni(parsed);
      }

      // Parse sbarchi
      if (disposizioneData.sbarchi) {
        const parsed = safeJsonParse<Sbarco[]>(
          disposizioneData.sbarchi,
          []
        );
        console.log('🚪 Sbarchi caricati:', parsed.length, 'sbarchi');
        setSbarchi(parsed);
      }

      // Note
      if (disposizioneData.note) {
        setNote(disposizioneData.note);
      }

      // Marca come caricato per evitare loop
      setHasLoadedInitialData(true);
    }
  }, [disposizioneData, hasLoadedInitialData]);

  // Funzione di salvataggio - ✅ SENZA mutation nelle dependencies
  const saveData = useCallback(() => {
    const payload: DisposizioneVanoData = {
      preventivo_id: preventivoId,
      posizioni_elementi: Object.keys(posizioni).length > 0 ? JSON.stringify(posizioni) : null,
      sbarchi: sbarchi.length > 0 ? JSON.stringify(sbarchi) : null,
      note: note || null,
    };

    console.log('💾 Salvataggio disposizione vano:');
    console.log('   - Posizioni:', Object.keys(posizioni).length);
    console.log('   - Sbarchi:', sbarchi.length);
    console.log('   - Payload:', payload);

    // ✅ Usa mutation direttamente qui, NON in dependencies
    mutation.mutate(payload);
  }, [preventivoId, posizioni, sbarchi, note]); // ✅ SENZA mutation

  // Auto-save per posizioni e sbarchi
  useEffect(() => {
    // Non salvare se stiamo ancora caricando i dati iniziali
    if (isLoadingDisposizione || !hasLoadedInitialData) {
      return;
    }

    // ✅ Non salvare se non ci sono dati modificati
    if (Object.keys(posizioni).length === 0 && sbarchi.length === 0 && !note) {
      return;
    }

    console.log('⏰ Auto-save schedulato (3 secondi)...');
    const timeout = window.setTimeout(() => {
      console.log('🚀 Esecuzione auto-save!');
      saveData();
    }, 3000);

    return () => {
      console.log('🔄 Auto-save timer cancellato');
      clearTimeout(timeout);
    };
  }, [posizioni, sbarchi, note, isLoadingDisposizione, hasLoadedInitialData, saveData]);

  // Handler per cambio posizioni
  const handlePosizioniChange = (newPosizioni: Record<string, PosizioneElemento>) => {
    console.log('📍 Posizioni aggiornate:', Object.keys(newPosizioni).length, 'elementi');
    setPosizioni(newPosizioni);
  };

  // Handler per cambio sbarchi
  const handleSbarchiChange = (newSbarchi: Sbarco[]) => {
    console.log('🚪 Sbarchi aggiornati:', newSbarchi.length, 'sbarchi');
    setSbarchi(newSbarchi);
  };

  // Handler per cambio note
  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNote(e.target.value);
  };

  // Calcola elementi già posizionati
  const elementiPosizionati = new Set(Object.keys(posizioni));

  if (isLoadingDisposizione) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-2 text-gray-600">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Disposizione Vano</h2>
            <p className="text-gray-600">
              Configura la posizione degli elementi nel vano e gli sbarchi per ogni piano
            </p>
          </div>
          
          {/* Status auto-save */}
          <div className="text-right">
            {mutation.isPending && (
              <div className="flex items-center gap-2 text-blue-600">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                <span className="text-sm">Salvataggio...</span>
              </div>
            )}
            {lastSaved && !mutation.isPending && (
              <div className="flex items-center gap-2 text-green-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm">
                  Salvato alle {lastSaved.toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Palette elementi */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Elementi Disponibili</h3>
        <ElementiPalette 
          elementiPosizionati={elementiPosizionati}
        />
        
        <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800">
            💡 <strong>Come usare:</strong>
          </p>
          <ul className="text-sm text-blue-700 mt-2 space-y-1 ml-4">
            <li>• Trascina gli elementi sulla pianta del vano</li>
            <li>• <strong>QM</strong> e <strong>Sirena</strong>: solo all'esterno (A1-D3)</li>
            <li>• <strong>SD</strong> e <strong>UPS</strong>: solo all'interno del vano</li>
            <li>• Doppio click su un elemento posizionato per rimuoverlo</li>
            <li>• Per posizioni esterne: specifica distanza in metri</li>
          </ul>
        </div>
      </div>

      {/* Pianta Interattiva */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Pianta Vano Ascensore</h3>
        <PiantaInterattiva 
          posizioni={posizioni}
          onPosizioniChange={handlePosizioniChange}
        />
      </div>

      {/* Tabella Sbarchi */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Sbarchi per Piano</h3>
        <TabellaSbarchi 
          sbarchi={sbarchi}
          onSbarchiChange={handleSbarchiChange}
          numeroFermate={numeroFermate}
          numeroServizi={numeroServizi}
        />
      </div>

      {/* Note */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Note Aggiuntive</h3>
        <textarea
          value={note}
          onChange={handleNoteChange}
          placeholder="Inserisci eventuali note o osservazioni sulla disposizione del vano..."
          className="w-full h-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}
