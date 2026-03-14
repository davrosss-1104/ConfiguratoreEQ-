import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Zap, Package, Loader2, Trash2 } from 'lucide-react';

interface TabellaMaterialiAutomaticiProps {
  preventivoId: number;
}

interface Materiale {
  id: number;
  codice: string;
  descrizione: string;
  prezzo_unitario: number;
  quantita: number;
  prezzo_totale?: number;
  categoria?: string;
  aggiunto_da_regola: boolean;
  regola_id?: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function TabellaMaterialiAutomatici({ preventivoId }: TabellaMaterialiAutomaticiProps) {
  // Query per caricare materiali
  const { data: materialiData, isLoading, refetch } = useQuery({
    queryKey: ['materiali', preventivoId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/materiali`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 3000, // Aggiorna ogni 3 secondi per vedere materiali aggiunti da regole
  });

  // FILTRA SOLO MATERIALI AUTOMATICI (aggiunto_da_regola = true)
  const materialiAutomatici = (materialiData || []).filter(
    (m: Materiale) => m.aggiunto_da_regola === true
  );

  const totaleAutomatico = materialiAutomatici.reduce(
    (acc: number, m: Materiale) => acc + (m.prezzo_unitario * m.quantita),
    0
  );

  // Raggruppa per regola_id
  const materialiPerRegola = materialiAutomatici.reduce((acc: Record<string, Materiale[]>, m: Materiale) => {
    const regola = m.regola_id || 'ALTRO';
    if (!acc[regola]) acc[regola] = [];
    acc[regola].push(m);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-600">Caricamento materiali...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Materiali Automatici</h3>
              <p className="text-sm text-amber-100 mt-1">
                Aggiunti automaticamente dal Rule Engine
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{materialiAutomatici.length}</div>
            <div className="text-xs text-amber-100">materiali</div>
          </div>
        </div>
      </div>

      {/* Contenuto */}
      {materialiAutomatici.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <Package className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-600 text-lg font-medium">Nessun materiale automatico</p>
          <p className="text-gray-500 text-sm mt-2 max-w-md mx-auto">
            I materiali verranno aggiunti automaticamente quando configuri:
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">Argano (Trazione)</span>
            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">Normative</span>
          </div>
        </div>
      ) : (
        <>
          {/* Materiali raggruppati per regola */}
          {Object.entries(materialiPerRegola).map(([regolaId, materiali]) => (
            <div key={regolaId} className="border-b border-gray-200 last:border-b-0">
              {/* Header regola */}
              <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-600" />
                <span className="font-semibold text-amber-800">
                  {regolaId.replace('RULE_', '').replace(/_/g, ' ')}
                </span>
                <span className="text-sm text-amber-600">
                  ({materiali.length} {materiali.length === 1 ? 'materiale' : 'materiali'})
                </span>
              </div>
              
              {/* Tabella materiali della regola */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                        Codice
                      </th>
                      <th className="px-6 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                        Descrizione
                      </th>
                      <th className="px-6 py-2 text-left text-xs font-semibold text-gray-600 uppercase">
                        Categoria
                      </th>
                      <th className="px-6 py-2 text-center text-xs font-semibold text-gray-600 uppercase">
                        Q.tà
                      </th>
                      <th className="px-6 py-2 text-right text-xs font-semibold text-gray-600 uppercase">
                        Prezzo Unit.
                      </th>
                      <th className="px-6 py-2 text-right text-xs font-semibold text-gray-600 uppercase">
                        Totale
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {materiali.map((materiale: Materiale) => {
                      const totaleRiga = materiale.prezzo_unitario * materiale.quantita;
                      
                      return (
                        <tr 
                          key={materiale.id}
                          className="hover:bg-amber-50/50 transition-colors"
                        >
                          <td className="px-6 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Zap className="w-3 h-3 text-amber-500" />
                              <span className="font-mono text-sm font-semibold text-gray-800">
                                {materiale.codice}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <span className="text-sm text-gray-900">
                              {materiale.descrizione}
                            </span>
                          </td>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                              {materiale.categoria || '-'}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-center whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900">
                              {materiale.quantita}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right whitespace-nowrap">
                            <span className="text-sm text-gray-900">
                              €{materiale.prezzo_unitario.toFixed(2)}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right whitespace-nowrap">
                            <span className="text-sm font-bold text-gray-900">
                              €{totaleRiga.toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Totale */}
          <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-t-2 border-amber-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="font-semibold">{materialiAutomatici.length}</span> materiali automatici da {Object.keys(materialiPerRegola).length} regole
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">
                  Totale Materiali Automatici
                </div>
                <div className="text-2xl font-bold text-amber-600">
                  €{totaleAutomatico.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Info box */}
          <div className="px-6 py-4 bg-blue-50 border-t border-blue-200">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">Rule Engine Attivo</p>
                <p className="text-xs text-blue-600">
                  Questi materiali sono stati aggiunti automaticamente in base alla configurazione del preventivo.
                  Cambiando i parametri (es. tipo trazione, normative), i materiali vengono aggiornati automaticamente.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
