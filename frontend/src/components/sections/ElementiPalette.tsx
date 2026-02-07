import React from 'react';
import { ELEMENTI_DISPONIBILI } from './PiantaInterattiva';

interface ElementiPaletteProps {
  elementiPosizionati: Set<string>;
}

export function ElementiPalette({ elementiPosizionati }: ElementiPaletteProps) {
  
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, elementoId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', elementoId);
    
    // Aggiungi uno stile visivo durante il drag
    const target = e.currentTarget;
    target.style.opacity = '0.5';
    
    console.log('🎯 Drag start:', elementoId);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    // Ripristina lo stile
    const target = e.currentTarget;
    target.style.opacity = '1';
    
    console.log('🔚 Drag end');
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-700">Elementi Disponibili</h3>
        <span className="text-xs text-gray-500">
          {elementiPosizionati.size}/{ELEMENTI_DISPONIBILI.length} posizionati
        </span>
      </div>
      
      <div className="flex flex-wrap gap-3">
        {ELEMENTI_DISPONIBILI.map((elemento) => {
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
              {/* Emoji icona */}
              <div className="text-3xl mb-1">{elemento.emoji}</div>
              
              {/* ID elemento */}
              <div className="text-xs font-bold text-gray-700">{elemento.id}</div>
              
              {/* Badge "Posizionato" */}
              {isGiaPosizionato && (
                <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                  ✓
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Istruzioni */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-700">
        <div className="flex items-start gap-2">
          <span className="text-lg">💡</span>
          <div>
            <p className="font-semibold mb-1">Come usare:</p>
            <ul className="ml-4 space-y-1 text-xs">
              <li>• Trascina gli elementi sulla pianta del vano</li>
              <li>• <strong>QM e Sirena</strong>: solo all'esterno (A1-D3)</li>
              <li>• <strong>SD e UPS</strong>: solo all'interno del vano</li>
              <li>• Doppio click su un elemento posizionato per rimuoverlo</li>
              <li>• Per posizioni esterne: specifica distanza in metri</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
