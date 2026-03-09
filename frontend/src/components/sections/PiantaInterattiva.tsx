import React, { useState } from 'react';
import { Lato } from './Lato';

// ==========================================
// TYPES & INTERFACES
// ==========================================

export interface PosizioneElemento {
  lato: 'A' | 'B' | 'C' | 'D' | 'INTERNO';
  segmento: number;
  distanza_metri?: number;
  elemento_id: string;
}

export interface ElementoConfig {
  id: string;           // = id_elemento dal DB
  nome: string;
  colore: string;       // = colore_bg + ' ' + colore_border
  emoji: string;
  solo_esterno?: boolean;
  solo_interno?: boolean;
  ha_distanza?: boolean;
}

// ==========================================
// HELPER: Validazione Posizionamento
// (ora usa l'array passato come prop, non la costante hardcoded)
// ==========================================

function validaPosizionamento(
  elementoId: string,
  lato: string,
  elementi: ElementoConfig[]
): { valido: boolean; errore?: string } {
  const elemento = elementi.find(e => e.id === elementoId);
  if (!elemento) return { valido: true };

  if (elemento.solo_esterno && lato === 'INTERNO') {
    return {
      valido: false,
      errore: `${elemento.nome} può essere posizionato solo all'esterno del vano`,
    };
  }

  if (elemento.solo_interno && lato !== 'INTERNO') {
    return {
      valido: false,
      errore: `${elemento.nome} può essere posizionato solo all'interno del vano`,
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
  elementi: ElementoConfig[];   // ← ora passato come prop, non hardcoded
}

export function PiantaInterattiva({
  posizioni,
  onPosizioniChange,
  elementi,
}: PiantaInterattivaProps) {
  const [elementoInDrag, setElementoInDrag] = useState<string | null>(null);
  const [erroreValidazione, setErroreValidazione] = useState<string | null>(null);

  // ==========================================
  // HANDLERS
  // ==========================================

  const handleDragStart = (e: React.DragEvent, elementoId: string) => {
    setElementoInDrag(elementoId);
    setErroreValidazione(null);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setElementoInDrag(null);
  };

  const handleDrop = (
    e: React.DragEvent,
    lato: 'A' | 'B' | 'C' | 'D' | 'INTERNO',
    segmento: number
  ) => {
    e.preventDefault();
    const droppedElementId = e.dataTransfer.getData('text/plain') || elementoInDrag;
    if (!droppedElementId) return;

    const validazione = validaPosizionamento(droppedElementId, lato, elementi);
    if (!validazione.valido) {
      setErroreValidazione(validazione.errore || 'Posizionamento non valido');
      return;
    }

    const posizioneOccupata = Object.entries(posizioni).find(
      ([id, pos]) => id !== droppedElementId && pos.lato === lato && pos.segmento === segmento
    );
    if (posizioneOccupata) {
      setErroreValidazione(`Posizione già occupata da ${posizioneOccupata[0]}`);
      return;
    }

    const nuovePosizioni = { ...posizioni };
    const distanzaEsistente = posizioni[droppedElementId]?.distanza_metri;
    nuovePosizioni[droppedElementId] = {
      lato,
      segmento,
      elemento_id: droppedElementId,
      distanza_metri: lato !== 'INTERNO' ? (distanzaEsistente || 0) : undefined,
    };
    onPosizioniChange(nuovePosizioni);
    setErroreValidazione(null);
  };

  const handleRemove = (elementoId: string) => {
    const nuovePosizioni = { ...posizioni };
    delete nuovePosizioni[elementoId];
    onPosizioniChange(nuovePosizioni);
  };

  const handleDistanzaChange = (elementoId: string, distanza: number) => {
    const nuovePosizioni = { ...posizioni };
    if (nuovePosizioni[elementoId]) {
      nuovePosizioni[elementoId].distanza_metri = distanza;
      onPosizioniChange(nuovePosizioni);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const getElemento = (id: string) => elementi.find(e => e.id === id);

  // ==========================================
  // RENDERING
  // ==========================================

  return (
    <div className="mt-6 p-6 bg-white rounded-lg border border-gray-300 shadow-sm">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Pianta Vano Ascensore</h3>

      {erroreValidazione && (
        <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded-lg text-red-700 text-sm">
          ⚠️ {erroreValidazione}
        </div>
      )}

      <div className="flex flex-col items-center gap-4">
        {/* Lato A (superiore) */}
        <Lato
          lato="A"
          posizioni={posizioni}
          onDrop={handleDrop}
          onRemove={handleRemove}
          onDistanzaChange={handleDistanzaChange}
          onDragOver={handleDragOver}
          isVertical={false}
          elementi={elementi}
        />

        {/* Centro: B + vano + C */}
        <div className="grid grid-cols-[auto_1fr_auto] gap-4">
          <Lato
            lato="B"
            posizioni={posizioni}
            onDrop={handleDrop}
            onRemove={handleRemove}
            onDistanzaChange={handleDistanzaChange}
            onDragOver={handleDragOver}
            isVertical={true}
            elementi={elementi}
          />

          {/* Vano centrale */}
          <div className="relative min-w-[400px] min-h-[500px]">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-full max-w-md aspect-[3/4] border-4 border-dashed border-blue-400 rounded-lg bg-blue-50/50 p-4">
                <div className="text-center mb-4">
                  <div className="inline-block p-2 bg-blue-100 rounded-lg">
                    <span className="text-2xl">🏢</span>
                  </div>
                  <p className="text-sm font-semibold text-blue-900 mt-1">VANO</p>
                  <p className="text-xs text-blue-700">ASCENSORE</p>
                </div>

                {/* Zone interne 3x3 */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((seg) => {
                    const posizioneKey = Object.keys(posizioni).find(
                      key =>
                        posizioni[key].lato === 'INTERNO' &&
                        posizioni[key].segmento === seg
                    );
                    const elemento = posizioneKey ? getElemento(posizioneKey) : null;

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
                        title={
                          posizioneKey
                            ? `${elemento?.nome} - Doppio click per rimuovere`
                            : `Zona interna ${seg}`
                        }
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

          <Lato
            lato="C"
            posizioni={posizioni}
            onDrop={handleDrop}
            onRemove={handleRemove}
            onDistanzaChange={handleDistanzaChange}
            onDragOver={handleDragOver}
            isVertical={true}
            elementi={elementi}
          />
        </div>

        {/* Lato D (inferiore) */}
        <Lato
          lato="D"
          posizioni={posizioni}
          onDrop={handleDrop}
          onRemove={handleRemove}
          onDistanzaChange={handleDistanzaChange}
          onDragOver={handleDragOver}
          isVertical={false}
          elementi={elementi}
        />
      </div>

      {/* Lista elementi posizionati */}
      {Object.keys(posizioni).length > 0 && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h4 className="font-semibold text-gray-700 mb-3">📍 Elementi Posizionati:</h4>
          <div className="grid gap-2">
            {Object.entries(posizioni).map(([elementoId, pos]) => {
              const elemento = getElemento(elementoId);
              const haDistanza = elemento?.ha_distanza !== false;
              return (
                <div key={elementoId} className="flex items-center gap-3 p-2 bg-white rounded border">
                  <span className="text-xl">{elemento?.emoji ?? '📦'}</span>
                  <span className="font-semibold">{elementoId}</span>
                  <span className="text-sm text-gray-600">
                    {pos.lato === 'INTERNO'
                      ? `Interno Z${pos.segmento}`
                      : `Lato ${pos.lato}${pos.segmento}`}
                  </span>

                  {pos.lato !== 'INTERNO' && haDistanza && (
                    <div className="ml-auto flex items-center gap-2">
                      <label className="text-xs text-gray-600">Distanza (m):</label>
                      <input
                        type="number"
                        min="0"
                        max="50"
                        step="0.5"
                        value={pos.distanza_metri || 0}
                        onChange={(e) =>
                          handleDistanzaChange(elementoId, parseFloat(e.target.value) || 0)
                        }
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
