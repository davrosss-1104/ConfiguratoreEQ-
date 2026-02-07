import React, { useState } from 'react';
import { ElementoCard, Elemento } from './ElementoCard';
import { ELEMENTI } from './ElementiPalette';

interface SegmentoProps {
  lato: 'A' | 'B' | 'C' | 'D';
  segmento: 1 | 2 | 3;
  elementoId?: string;
  onDrop: (elementoId: string) => void;
  onRemove: () => void;
}

export function Segmento({ lato, segmento, elementoId, onDrop, onRemove }: SegmentoProps) {
  const [isOver, setIsOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsOver(true);
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    const elemId = e.dataTransfer.getData('elemento');
    if (elemId) {
      onDrop(elemId);
    }
  };

  const handleDoubleClick = () => {
    if (elementoId) {
      onRemove();
    }
  };

  const elemento = elementoId ? ELEMENTI.find(e => e.id === elementoId) : null;

  return (
    <div
      className={`
        w-20 h-20 border-2 rounded flex items-center justify-center
        transition-all duration-200
        ${isOver ? 'bg-blue-100 border-blue-500 scale-105' : 'border-gray-300'}
        ${elemento ? 'bg-opacity-90' : 'bg-white hover:bg-gray-50'}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onDoubleClick={handleDoubleClick}
      title={elemento ? `${elemento.nome} - Doppio click per rimuovere` : `Posizione ${lato}${segmento}`}
    >
      {elemento ? (
        <ElementoCard elemento={elemento} draggable={false} />
      ) : (
        <span className="text-gray-400 text-xs font-medium select-none">
          {lato}{segmento}
        </span>
      )}
    </div>
  );
}
