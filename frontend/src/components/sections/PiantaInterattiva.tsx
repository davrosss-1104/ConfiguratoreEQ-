import React, { useState } from 'react';
import { Lato } from './Lato';

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface PosizioneElemento {
  lato: 'A' | 'B' | 'C' | 'D' | 'INTERNO';
  segmento: number;
  distanza_metri?: number; // Per posizioni esterne
  elemento_id: string;
}

export interface ElementoConfig {
  id: string;
  nome: string;
  colore: string;
  emoji: string;
  solo_esterno?: boolean;  // QM, Sirena
  solo_interno?: boolean;  // IN, UPS
}

// ==========================================
// CONFIGURAZIONE ELEMENTI
// ==========================================

export const ELEMENTI_DISPONIBILI: ElementoConfig[] = [
  { 
    id: 'QM', 
    nome: 'Quadro Manovra', 
    colore: 'bg-purple-200 border-purple-400',
    emoji: '🔲',
    solo_esterno: true  // ← SOLO FUORI DAL VANO
  },
  { 
    id: 'IN', 
    nome: 'Inverter', 
    colore: 'bg-yellow-200 border-yellow-400',
    emoji: '📊',
    solo_interno: true  // ← SOLO DENTRO AL VANO
  },
  { 
    id: 'UPS', 
    nome: 'Gruppo Continuità', 
    colore: 'bg-green-200 border-green-400',
    emoji: '🔋',
    solo_interno: true  // ← SOLO DENTRO AL VANO
  },
  { 
    id: 'BotI', 
    nome: 'Bottoniera Ispezione', 
    colore: 'bg-blue-200 border-blue-400',
    emoji: '⭕'
  },
  { 
    id: 'Sirena', 
    nome: 'Sirena Allarme', 
    colore: 'bg-red-200 border-red-400',
    emoji: '🔔',
    solo_esterno: true  // ← SOLO FUORI DAL VANO
  },
  { 
    id: 'Altro', 
    nome: 'Altro Elemento', 
    colore: 'bg-gray-200 border-gray-400',
    emoji: '❓'
  },
];

// ==========================================
// HELPER: Validazione Posizionamento
// ==========================================

function validaPosizionamento(elementoId: string, lato: string, segmento: number): { valido: boolean; errore?: string } {
  const elemento = ELEMENTI_DISPONIBILI.find(e => e.id === elementoId);
  if (!elemento) return { valido: true };

  // Elementi solo esterni (QM, Sirena)
  if (elemento.solo_esterno && lato === 'INTERNO') {
    return { 
      valido: false, 
      errore: `${elemento.nome} può essere posizionato solo all'esterno del vano` 
    };
  }

  // Elementi solo interni (IN, UPS)
  if (elemento.solo_interno && lato !== 'INTERNO') {
    return { 
      valido: false, 
      errore: `${elemento.nome} può essere posizionato solo all'interno del vano` 
    };
  }

  return { valido: true };
}

// ==========================================
// COMPONENTE PRINCIPALE
// ==========================================

interface PiantaInterattivaProps {
  posizioni: Record<string, PosizioneElemento>;
  onPosizioniChange: (posizioni: Record<string, PosizioneElemento>) => void;
}

export function PiantaInterattiva({ posizioni, onPosizioniChange }: PiantaInterattivaProps) {
  const [elementoInDrag, setElementoInDrag] = useState<string | null>(null);
  const [erroreValidazione, setErroreValidazione] = useState<string | null>(null);

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleDragStart = (e: React.DragEvent, elementoId: string) => {
    setElementoInDrag(elementoId);
    setErroreValidazione(null);
    e.dataTransfer.effectAllowed = 'move';
    console.log('🎯 Drag start:', elementoId);
  };

  const handleDragEnd = () => {
    setElementoInDrag(null);
  };

  const handleDrop = (e: React.DragEvent, lato: 'A' | 'B' | 'C' | 'D' | 'INTERNO', segmento: number) => {
    e.preventDefault();
    
    // LEGGI l'elementoId dal dataTransfer (dalla palette) O da elementoInDrag (riposizionamento)
    const droppedElementId = e.dataTransfer.getData('text/plain') || elementoInDrag;
    
    if (!droppedElementId) {
      console.log('❌ Nessun elemento da droppare');
      return;
    }

    console.log('📍 Drop:', droppedElementId, 'su', lato, segmento);

    // Valida posizionamento
    const validazione = validaPosizionamento(droppedElementId, lato, segmento);
    if (!validazione.valido) {
      setErroreValidazione(validazione.errore || 'Posizionamento non valido');
      console.log('❌ Posizionamento non valido:', validazione.errore);
      return;
    }

    // Verifica se posizione già occupata
    const posizioneOccupata = Object.entries(posizioni).find(
      ([id, pos]) => id !== droppedElementId && pos.lato === lato && pos.segmento === segmento
    );

    if (posizioneOccupata) {
      setErroreValidazione(`Posizione già occupata da ${posizioneOccupata[0]}`);
      console.log('❌ Posizione occupata');
      return;
    }

    // Aggiorna posizione
    const nuovePosizioni = { ...posizioni };
    
    // Se elemento già posizionato, mantieni distanza esistente
    const distanzaEsistente = posizioni[droppedElementId]?.distanza_metri;
    
    nuovePosizioni[droppedElementId] = {
      lato,
      segmento,
      elemento_id: droppedElementId,
      // Mantieni distanza se esterna, altrimenti undefined
      distanza_metri: lato !== 'INTERNO' ? (distanzaEsistente || 0) : undefined
    };

    onPosizioniChange(nuovePosizioni);
    setErroreValidazione(null);
    console.log('✅ Elemento posizionato:', droppedElementId, 'su', lato, segmento);
  };

  const handleRemove = (elementoId: string) => {
    const nuovePosizioni = { ...posizioni };
    delete nuovePosizioni[elementoId];
    onPosizioniChange(nuovePosizioni);
    console.log('🗑️ Elemento rimosso:', elementoId);
  };

  const handleDistanzaChange = (elementoId: string, distanza: number) => {
    const nuovePosizioni = { ...posizioni };
    if (nuovePosizioni[elementoId]) {
      nuovePosizioni[elementoId].distanza_metri = distanza;
      onPosizioniChange(nuovePosizioni);
      console.log('📏 Distanza aggiornata:', elementoId, distanza, 'm');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // ==========================================
  // RENDERING
  // ==========================================

  return (
    <div className="mt-6 p-6 bg-white rounded-lg border border-gray-300 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Pianta Vano Ascensore</h3>
      
      {/* Errore validazione */}
      {erroreValidazione && (
        <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded-lg text-red-700 text-sm">
          ⚠️ {erroreValidazione}
        </div>
      )}

 

      {/* Griglia Pianta - Layout riorganizzato */}
      <div className="flex flex-col items-center gap-4">
        
        {/* Lato A (superiore - in alto) */}
        <Lato
          lato="A"
          posizioni={posizioni}
          onDrop={handleDrop}
          onRemove={handleRemove}
          onDistanzaChange={handleDistanzaChange}
          onDragOver={handleDragOver}
          isVertical={false}
        />

        {/* Container centrale con lati B, C e vano */}
        <div className="grid grid-cols-[auto_1fr_auto] gap-4">
          
          {/* Lato B (sinistro) */}
          <Lato
            lato="B"
            posizioni={posizioni}
            onDrop={handleDrop}
            onRemove={handleRemove}
            onDistanzaChange={handleDistanzaChange}
            onDragOver={handleDragOver}
            isVertical={true}
          />

          {/* Vano centrale con zone interne */}
          <div className="relative min-w-[400px] min-h-[500px]">  {/* ← AGGIUNGI min-w e min-h */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full max-w-md aspect-[3/4] border-4 border-dashed border-blue-400 rounded-lg bg-blue-50/50 p-4">
                          
                {/* Header vano */}
                <div className="text-center mb-4">
                  <div className="inline-block p-2 bg-blue-100 rounded-lg">
                    <span className="text-2xl">🏢</span>
                  </div>
                  <p className="text-sm font-semibold text-blue-900 mt-1">VANO</p>
                  <p className="text-xs text-blue-700">ASCENSORE</p>
                </div>

                {/* Zone interne 3x3 per IN, UPS, etc. */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((seg) => {
                    const posizioneKey = Object.keys(posizioni).find(
                      key => posizioni[key].lato === 'INTERNO' && posizioni[key].segmento === seg
                    );
                    const elemento = posizioneKey ? ELEMENTI_DISPONIBILI.find(e => e.id === posizioneKey) : null;

                    return (
                      <div
                        key={`interno-${seg}`}
                        className={`
                          aspect-square border-2 rounded-lg flex items-center justify-center
                          transition-all cursor-pointer relative
                          ${posizioneKey 
                            ? `${elemento?.colore} border-opacity-100` 
                            : 'border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                          }
                        `}
                        onDrop={(e) => handleDrop(e, 'INTERNO', seg)}
                        onDragOver={handleDragOver}
                        onDoubleClick={() => posizioneKey && handleRemove(posizioneKey)}
                        title={posizioneKey ? `${elemento?.nome} - Doppio click per rimuovere` : `Zona interna ${seg}`}
                      >
                        {posizioneKey ? (
                          <div className="text-center">
                            <div className="text-2xl">{elemento?.emoji}</div>
                            <div className="text-xs font-bold mt-1">{posizioneKey}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">I{seg}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Lato C (destro) */}
          <Lato
            lato="C"
            posizioni={posizioni}
            onDrop={handleDrop}
            onRemove={handleRemove}
            onDistanzaChange={handleDistanzaChange}
            onDragOver={handleDragOver}
            isVertical={true}
          />
        </div>

        {/* Lato D (inferiore - in basso) */}
        <Lato
          lato="D"
          posizioni={posizioni}
          onDrop={handleDrop}
          onRemove={handleRemove}
          onDistanzaChange={handleDistanzaChange}
          onDragOver={handleDragOver}
          isVertical={false}
        />
      </div>

      {/* Lista elementi posizionati con distanze */}
      {Object.keys(posizioni).length > 0 && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-700 mb-3">📍 Elementi Posizionati:</h4>
          <div className="grid gap-2">
            {Object.entries(posizioni).map(([elementoId, pos]) => {
              const elemento = ELEMENTI_DISPONIBILI.find(e => e.id === elementoId);
              return (
                <div key={elementoId} className="flex items-center gap-3 p-2 bg-white rounded border">
                  <span className="text-xl">{elemento?.emoji}</span>
                  <span className="font-semibold">{elementoId}</span>
                  <span className="text-sm text-gray-600">
                    {pos.lato === 'INTERNO' ? `Interno Z${pos.segmento}` : `Lato ${pos.lato}${pos.segmento}`}
                  </span>
                  
                  {/* Campo distanza per posizioni esterne */}
                  {pos.lato !== 'INTERNO' && (
                    <div className="ml-auto flex items-center gap-2">
                      <label className="text-xs text-gray-600">Distanza (m):</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        value={pos.distanza_metri || 0}
                        onChange={(e) => handleDistanzaChange(elementoId, parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  )}
                  
                  <button
                    onClick={() => handleRemove(elementoId)}
                    className="ml-auto px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Rimuovi
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
