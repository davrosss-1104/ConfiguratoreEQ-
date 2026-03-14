import React, { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useToast } from '@/components/ui/use-toast';
import { PiantaInterattiva, PosizioneElemento, ElementoConfig } from './PiantaInterattiva';
import { TabellaSbarchi, Sbarco } from './TabellaSbarchi';
import { ElementiPalette } from './ElementiPalette';
import {
  getDisposizioneVano,
  updateDisposizioneVano,
  getDatiPrincipali,
} from '@/services/preventivi.service';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface DisposizioneVanoFormProps {
  preventivoId: number;
}

interface DisposizioneVanoData {
  preventivo_id?: number;
  posizioni_elementi?: string | null;
  sbarchi?: string | null;
  note?: string | null;
}

const safeJsonParse = <T,>(jsonString: string | null | undefined, defaultValue: T): T => {
  if (!jsonString || jsonString.trim() === '' || jsonString === 'null') return defaultValue;
  try {
    return JSON.parse(jsonString) || defaultValue;
  } catch {
    return defaultValue;
  }
};

// ── Carica elementi vano dal DB ──────────────────────────────────────────────
async function fetchElementiVano(): Promise<ElementoConfig[]> {
  const r = await fetch(`${API_BASE}/elementi-vano?solo_attivi=true`);
  if (!r.ok) throw new Error('Errore caricamento elementi vano');
  const data = await r.json();
  // Mappa il formato DB → ElementoConfig
  return data.map((el: any) => ({
    id:           el.id_elemento,
    nome:         el.nome,
    emoji:        el.emoji,
    colore:       `${el.colore_bg} ${el.colore_border}`,
    solo_esterno: el.solo_esterno,
    solo_interno: el.solo_interno,
    ha_distanza:  el.ha_distanza,
  }));
}

export default function DisposizioneVanoForm({ preventivoId }: DisposizioneVanoFormProps) {
  const [posizioni, setPosizioni] = useState<Record<string, PosizioneElemento>>({});
  const [sbarchi, setSbarchi] = useState<Sbarco[]>([]);
  const [note, setNote] = useState<string>('');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  useForm();

  // ── Query elementi vano dal DB ─────────────────────────────────────────────
  const { data: elementi = [], isLoading: isLoadingElementi } = useQuery<ElementoConfig[]>({
    queryKey: ['elementi-vano'],
    queryFn: fetchElementiVano,
    staleTime: 5 * 60 * 1000, // 5 minuti — cambiano raramente
  });

  // ── Query dati disposizione ───────────────────────────────────────────────
  const { data: disposizioneData, isLoading: isLoadingDisposizione } = useQuery({
    queryKey: ['disposizioneVano', preventivoId],
    queryFn: () => getDisposizioneVano(preventivoId),
    retry: 1,
  });

  // ── Query numero fermate ──────────────────────────────────────────────────
  const { data: datiPrincipali } = useQuery({
    queryKey: ['datiPrincipali', preventivoId],
    queryFn: () => getDatiPrincipali(preventivoId),
    retry: 1,
  });

  const numeroFermate = datiPrincipali?.numero_fermate || 0;
  const numeroServizi = datiPrincipali?.numero_servizi || 0;

  // ── Mutation salvataggio ──────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: (data: DisposizioneVanoData) => updateDisposizioneVano(preventivoId, data),
    onSuccess: () => {
      setLastSaved(new Date());
      queryClient.invalidateQueries({ queryKey: ['disposizioneVano', preventivoId] });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Errore', description: 'Impossibile salvare i dati' });
    },
  });

  // ── Caricamento dati iniziali ─────────────────────────────────────────────
  useEffect(() => {
    if (disposizioneData && !hasLoadedInitialData) {
      if (disposizioneData.posizioni_elementi) {
        setPosizioni(safeJsonParse<Record<string, PosizioneElemento>>(disposizioneData.posizioni_elementi, {}));
      }
      if (disposizioneData.sbarchi) {
        setSbarchi(safeJsonParse<Sbarco[]>(disposizioneData.sbarchi, []));
      }
      if (disposizioneData.note) setNote(disposizioneData.note);
      setHasLoadedInitialData(true);
    }
  }, [disposizioneData, hasLoadedInitialData]);

  // ── Auto-save ─────────────────────────────────────────────────────────────
  const saveData = useCallback(() => {
    mutation.mutate({
      preventivo_id: preventivoId,
      posizioni_elementi: Object.keys(posizioni).length > 0 ? JSON.stringify(posizioni) : null,
      sbarchi: sbarchi.length > 0 ? JSON.stringify(sbarchi) : null,
      note: note || null,
    });
  }, [preventivoId, posizioni, sbarchi, note]);

  useEffect(() => {
    if (isLoadingDisposizione || !hasLoadedInitialData) return;
    if (Object.keys(posizioni).length === 0 && sbarchi.length === 0 && !note) return;

    const timeout = window.setTimeout(saveData, 3000);
    return () => clearTimeout(timeout);
  }, [posizioni, sbarchi, note, isLoadingDisposizione, hasLoadedInitialData, saveData]);

  const elementiPosizionati = new Set(Object.keys(posizioni));

  if (isLoadingDisposizione || isLoadingElementi) {
    return (
      <div className="p-8 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        <p className="mt-2 text-gray-600">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white/70 rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Disposizione Vano</h2>
            <p className="text-gray-600">
              Configura la posizione degli elementi nel vano e gli sbarchi per ogni piano
            </p>
          </div>
          <div className="text-right">
            {mutation.isPending && (
              <div className="flex items-center gap-2 text-blue-600">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                <span className="text-sm">Salvataggio...</span>
              </div>
            )}
            {lastSaved && !mutation.isPending && (
              <div className="flex items-center gap-2 text-green-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm">Salvato alle {lastSaved.toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Palette */}
      <div className="bg-white/70 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Elementi Disponibili</h3>
        <ElementiPalette
          elementiPosizionati={elementiPosizionati}
          elementi={elementi}
        />
      </div>

      {/* Pianta */}
      <div className="bg-white/70 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Pianta Vano Ascensore</h3>
        <PiantaInterattiva
          posizioni={posizioni}
          onPosizioniChange={setPosizioni}
          elementi={elementi}
        />
      </div>

      {/* Sbarchi */}
      <div className="bg-white/70 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Sbarchi per Piano</h3>
        <TabellaSbarchi
          sbarchi={sbarchi}
          onSbarchiChange={setSbarchi}
          numeroFermate={numeroFermate}
          numeroServizi={numeroServizi}
        />
      </div>

      {/* Note */}
      <div className="bg-white/70 rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Note Aggiuntive</h3>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Inserisci eventuali note o osservazioni sulla disposizione del vano..."
          className="w-full h-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  );
}
