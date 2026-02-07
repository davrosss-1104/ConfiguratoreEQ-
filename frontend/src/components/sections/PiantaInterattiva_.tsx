import React from 'react';
import { Lato } from './Lato';

export interface PosizioneElemento {
  lato: 'A' | 'B' | 'C' | 'D';
  segmento: 1 | 2 | 3;
}

interface PiantaInterattivaProps {
  posizioni: Record<string, PosizioneElemento>;
  onPosizioniChange: (posizioni: Record<string, PosizioneElemento>) => void;
}

export function PiantaInterattiva({ posizioni, onPosizioniChange }: PiantaInterattivaProps) {
  
  const handleElementoDrop = (
    lato: 'A' | 'B' | 'C' | 'D', 
    segmento: 1 | 2 | 3, 
    elementoId: string
  ) => {
    // Rimuovi elemento se già posizionato altrove
    const nuovePosizioni = { ...posizioni };
    Object.keys(nuovePosizioni).forEach(key => {
      if (key === elementoId) {
        delete nuovePosizioni[key];
      }
    });

    // Verifica che il segmento sia libero
    const segmentoOccupato = Object.values(nuovePosizioni).some(
      pos => pos.lato === lato && pos.segmento === segmento
    );

    if (!segmentoOccupato) {
      // Aggiungi elemento nella nuova posizione
      nuovePosizioni[elementoId] = { lato, segmento };
      onPosizioniChange(nuovePosizioni);
    }
  };

  const handleElementoRemove = (lato: 'A' | 'B' | 'C' | 'D', segmento: 1 | 2 | 3) => {
    const nuovePosizioni = { ...posizioni };
    const elementoDaRimuovere = Object.entries(nuovePosizioni).find(
      ([, pos]) => pos.lato === lato && pos.segmento === segmento
    );

    if (elementoDaRimuovere) {
      delete nuovePosizioni[elementoDaRimuovere[0]];
      onPosizioniChange(nuovePosizioni);
    }
  };

  return (
    <div className="mb-8 p-6 bg-white rounded-lg border border-gray-300 shadow-sm">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">Pianta Vano Ascensore</h3>
      
      <div className="flex flex-col items-center gap-4">
        {/* Lato A (superiore) */}
        <Lato
          nome="A"
          posizione="top"
          posizioni={posizioni}
          onElementoDrop={handleElementoDrop}
          onElementoRemove={handleElementoRemove}
        />

        {/* Lati B (sinistro), centro, C (destro) */}
        <div className="flex flex-row items-center gap-4">
          {/* Lato B (sinistro) - verticale */}
          <Lato
            nome="B"
            posizione="left"
            posizioni={posizioni}
            onElementoDrop={handleElementoDrop}
            onElementoRemove={handleElementoRemove}
          />

          {/* Centro (area vano) */}
          <div className="w-64 h-64 bg-gray-100 rounded flex items-center justify-center border-2 border-dashed border-gray-300">
            <div className="text-center text-gray-400">
              <div className="text-4xl mb-2">🛗</div>
              <div className="text-sm font-medium">VANO</div>
              <div className="text-xs">ASCENSORE</div>
            </div>
          </div>

          {/* Lato C (destro) - verticale */}
          <Lato
            nome="C"
            posizione="right"
            posizioni={posizioni}
            onElementoDrop={handleElementoDrop}
            onElementoRemove={handleElementoRemove}
          />
        </div>

        {/* Lato D (inferiore) */}
        <Lato
          nome="D"
          posizione="bottom"
          posizioni={posizioni}
          onElementoDrop={handleElementoDrop}
          onElementoRemove={handleElementoRemove}
        />
      </div>

      <div className="mt-4 text-xs text-gray-500 text-center">
        💡 Vista dall'alto del vano. A, B, C, D rappresentano i 4 lati. 
        Ogni lato ha 3 posizioni disponibili.
      </div>
    </div>
  );
}
