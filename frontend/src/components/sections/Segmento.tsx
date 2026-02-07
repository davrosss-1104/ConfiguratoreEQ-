import React, { useState } from 'react';
import { PosizioneElemento, ELEMENTI_DISPONIBILI } from './PiantaInterattiva';

interface SegmentoProps {
  lato: 'A' | 'B' | 'C' | 'D';
  segmento: number;
  elementoId?: string;
  posizione?: PosizioneElemento;
  onDrop: (e: React.DragEvent, lato: 'A' | 'B' | 'C' | 'D' | 'INTERNO', segmento: number) => void;
  onRemove: (elementoId: string) => void;
  onDistanzaChange: (elementoId: string, distanza: number) => void;
  onDragOver: (e: React.DragEvent) => void;
}

export function Segmento({ 
  lato, 
  segmento, 
  elementoId, 
  posizione,
  onDrop, 
  onRemove, 
  onDistanzaChange,
  onDragOver 
}: SegmentoProps) {
  const [showDistanzaInput, setShowDistanzaInput] = useState(false);
  
  const elemento = elementoId ? ELEMENTI_DISPONIBILI.find(e => e.id === elementoId) : null;

  const handleDoubleClick = () => {
    if (elementoId) {
      onRemove(elementoId);
    }
  };

  const handleClick = () => {
    if (elementoId) {
      setShowDistanzaInput(!showDistanzaInput);
    }
  };

  return (
    <div className="relative">
      {/* Segmento principale */}
      <div
        className={`
          w-24 h-24 border-2 rounded-lg flex flex-col items-center justify-center
          transition-all cursor-pointer
          ${elementoId 
            ? `${elemento?.colore} border-opacity-100 shadow-md` 
            : 'border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50'
          }
        `}
        onDrop={(e) => onDrop(e, lato, segmento)}
        onDragOver={onDragOver}
        onDoubleClick={handleDoubleClick}
        onClick={handleClick}
        title={elementoId 
          ? `${elemento?.nome} - Click per distanza, Doppio click per rimuovere` 
          : `Posizione ${lato}${segmento} - Trascina qui un elemento`
        }
      >
        {elementoId ? (
          <div className="text-center">
            <div className="text-3xl mb-1">{elemento?.emoji}</div>
            <div className="text-xs font-bold">{elementoId}</div>
            <div className="text-xs text-gray-600">{lato}{segmento}</div>
          </div>
        ) : (
          <div className="text-center text-gray-400">
            <div className="text-sm font-semibold">{lato}{segmento}</div>
            <div className="text-xs">Vuoto</div>
          </div>
        )}
      </div>

      {/* Popup campo distanza */}
      {elementoId && showDistanzaInput && (
        <div 
          className="absolute top-full left-0 mt-2 z-10 bg-white border-2 border-blue-400 rounded-lg shadow-lg p-3 w-48"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{elemento?.emoji}</span>
            <span className="font-semibold text-sm">{elementoId}</span>
          </div>
          
          <label className="block text-xs text-gray-600 mb-1">
            📏 Distanza dal vano:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="50"
              step="0.5"
              value={posizione?.distanza_metri || 0}
              onChange={(e) => {
                const valore = parseFloat(e.target.value) || 0;
                onDistanzaChange(elementoId, valore);
              }}
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
              placeholder="0.0"
            />
            <span className="text-sm text-gray-600">m</span>
          </div>
          
          <button
            onClick={() => setShowDistanzaInput(false)}
            className="mt-2 w-full px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            Chiudi
          </button>
        </div>
      )}
    </div>
  );
}
