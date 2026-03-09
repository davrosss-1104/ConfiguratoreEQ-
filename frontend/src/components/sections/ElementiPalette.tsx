import React from 'react';
import { ElementoConfig } from './PiantaInterattiva';

interface ElementiPaletteProps {
  elementiPosizionati: Set<string>;
  elementi: ElementoConfig[];
}

export function ElementiPalette({ elementiPosizionati, elementi }: ElementiPaletteProps) {

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, elementoId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', elementoId);
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '1';
  };

  // Costruisci note sui vincoli per le istruzioni
  const soloEsterni = elementi.filter(e => e.solo_esterno).map(e => e.id);
  const soloInterni = elementi.filter(e => e.solo_interno).map(e => e.id);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700">Elementi Disponibili</h3>
        <span className="text-xs text-gray-500">
          {elementiPosizionati.size}/{elementi.length} posizionati
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {elementi.map((elemento) => {
          const isGiaPosizionato = elementiPosizionati.has(elemento.id);
          return (
            <div
              key={elemento.id}
              draggable={!isGiaPosizionato}
              onDragStart={(e) => handleDragStart(e, elemento.id)}
              onDragEnd={handleDragEnd}
              className={`
                relative flex flex-col items-center justify-center
                w-20 h-20 rounded-lg border-2 transition-all
                ${isGiaPosizionato
                  ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed'
                  : `${elemento.colore} cursor-grab active:cursor-grabbing hover:shadow-md hover:scale-105`
                }
              `}
              title={
                isGiaPosizionato
                  ? `${elemento.nome} - Già posizionato`
                  : `${elemento.nome} - Trascina sulla pianta`
              }
            >
              <div className="text-3xl mb-1">{elemento.emoji}</div>
              <div className="text-xs font-bold text-gray-700">{elemento.id}</div>
              {isGiaPosizionato && (
                <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                  ✓
                </div>
              )}
              {elemento.solo_esterno && !isGiaPosizionato && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-orange-400 text-white text-[9px] px-1 rounded-full whitespace-nowrap">
                  esterno
                </div>
              )}
              {elemento.solo_interno && !isGiaPosizionato && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-blue-400 text-white text-[9px] px-1 rounded-full whitespace-nowrap">
                  interno
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-700">
        <div className="flex items-start gap-2">
          <span className="text-lg">💡</span>
          <div>
            <p className="font-semibold mb-1">Come usare:</p>
            <ul className="ml-4 space-y-1 text-xs">
              <li>• Trascina gli elementi sulla pianta del vano</li>
              {soloEsterni.length > 0 && (
                <li>• <strong>{soloEsterni.join(', ')}</strong>: solo all'esterno (lati A-D)</li>
              )}
              {soloInterni.length > 0 && (
                <li>• <strong>{soloInterni.join(', ')}</strong>: solo all'interno del vano</li>
              )}
              <li>• Doppio click su un elemento posizionato per rimuoverlo</li>
              <li>• Click su elemento esterno per impostare la distanza</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
