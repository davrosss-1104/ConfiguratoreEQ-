import React from 'react';

export interface Elemento {
  id: string;
  nome: string;
  icona: string;
  colore: string;
}

interface ElementoCardProps {
  elemento: Elemento;
  draggable?: boolean;
  onDoubleClick?: () => void;
}

export function ElementoCard({ elemento, draggable = false, onDoubleClick }: ElementoCardProps) {
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('elemento', elemento.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className={`
        px-3 py-2 rounded shadow-sm 
        ${draggable ? 'cursor-move hover:shadow-md' : 'cursor-default'}
        ${elemento.colore}
        transition-shadow duration-200
      `}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDoubleClick={onDoubleClick}
      title={elemento.nome}
    >
      <div className="text-center select-none">
        <div className="text-2xl mb-1">{elemento.icona}</div>
        <div className="text-xs font-medium">{elemento.id}</div>
      </div>
    </div>
  );
}
