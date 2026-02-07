import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMateriali, deleteMateriale } from '@/services/preventivi.service';
import { Materiale } from '@/services/preventivi.service';

interface MaterialsTableProps {
  preventivoId: number;
  className?: string;
}


export const MaterialsTable = ({ 
  preventivoId, 
  className = '' 
}: MaterialsTableProps) => {
  const [highlightedIds, setHighlightedIds] = useState<Set<number>>(new Set());
  const [prevMaterialsCount, setPrevMaterialsCount] = useState(0);

  // Query con polling ogni 2 secondi
  const { data: materials = [], isLoading } = useQuery<Materiale[]>({
    queryKey: ['materials', preventivoId],
    queryFn: () => getMateriali(preventivoId),
    refetchInterval: 2000, // Polling ogni 2 secondi
  });

  // Evidenzia nuovi materiali
  useEffect(() => {
    if (materials.length > prevMaterialsCount) {
      // Identifica nuovi materiali
      const newIds = materials
        .slice(prevMaterialsCount)
        .map((m) => m.id)
        .filter((id): id is number => id !== undefined);

      setHighlightedIds(new Set(newIds));

      // Rimuovi highlight dopo 3 secondi
      const timer = window.setTimeout(() => {
        setHighlightedIds(new Set());
      }, 3000);

      return () => window.clearTimeout(timer);
    }
    setPrevMaterialsCount(materials.length);
  }, [materials.length, prevMaterialsCount]);

  // Calcola totale
  const totale = materials.reduce(
    (sum, m) => sum + m.prezzo_totale,
    0
  );

  // Conta materiali da regole
  const materialiDaRegole = materials.filter((m) => m.aggiunto_da_regola).length;

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Materiali</h3>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {materials.length} totali
            </span>
            {materialiDaRegole > 0 && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                {materialiDaRegole} automatici
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Lista materiali */}
      <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
        {materials.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Nessun materiale</h3>
            <p className="mt-1 text-sm text-gray-500">
              I materiali verranno aggiunti automaticamente in base alla configurazione
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {materials.map((material) => {
              const isHighlighted = material.id ? highlightedIds.has(material.id) : false;
              const isAutomatic = material.aggiunto_da_regola;

              return (
                <div
                  key={material.id}
                  className={`px-6 py-4 transition-all duration-500 ${
                    isHighlighted ? 'bg-yellow-50 animate-pulse' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {material.descrizione}
                        </p>
                        {isAutomatic && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Auto
                          </span>
                        )}
                        {isHighlighted && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                            Nuovo!
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Codice: {material.codice}
                      </p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                        <span>Qta: {material.quantita}</span>
                        <span>€{material.prezzo_unitario.toFixed(2)}/cad</span>
                      </div>
                    </div>
                    <div className="ml-4 text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        €{material.prezzo_totale.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer con totale */}
      {materials.length > 0 && (
        <div className="border-t px-6 py-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">Totale</span>
            <span className="text-lg font-bold text-gray-900">
              €{totale.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
