import React from 'react';
import { Segmento } from './Segmento';
import { PosizioneElemento, ElementoConfig } from './PiantaInterattiva';

interface LatoProps {
  lato: 'A' | 'B' | 'C' | 'D';
  posizioni: Record<string, PosizioneElemento>;
  onDrop: (e: React.DragEvent, lato: 'A' | 'B' | 'C' | 'D' | 'INTERNO', segmento: number) => void;
  onRemove: (elementoId: string) => void;
  onDistanzaChange: (elementoId: string, distanza: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  isVertical: boolean;
  elementi: ElementoConfig[];
}

export function Lato({
  lato,
  posizioni,
  onDrop,
  onRemove,
  onDistanzaChange,
  onDragOver,
  isVertical,
  elementi,
}: LatoProps) {
  const segmenti = [1, 2, 3];

  return (
    <div className={`flex ${isVertical ? 'flex-col' : 'flex-row'} gap-3 items-center`}>
      <div className={`flex items-center justify-center w-12 h-12 bg-gray-700 text-white font-bold text-lg rounded-lg ${isVertical ? '' : 'order-first'}`}>
        {lato}
      </div>
      <div className={`flex ${isVertical ? 'flex-col' : 'flex-row'} gap-2`}>
        {segmenti.map((seg) => {
          const elementoKey = Object.keys(posizioni).find(
            key => posizioni[key].lato === lato && posizioni[key].segmento === seg
          );
          return (
            <Segmento
              key={`${lato}${seg}`}
              lato={lato}
              segmento={seg}
              elementoId={elementoKey}
              posizione={elementoKey ? posizioni[elementoKey] : undefined}
              onDrop={onDrop}
              onRemove={onRemove}
              onDistanzaChange={onDistanzaChange}
              onDragOver={onDragOver}
              elementi={elementi}
            />
          );
        })}
      </div>
    </div>
  );
}
