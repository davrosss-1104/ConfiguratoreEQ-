import { useQuery } from "@tanstack/react-query";
import { getMateriali } from '@/services/preventivi.service';
import { Loader2, Package, Zap, Trash2 } from "lucide-react";

interface MaterialiFormProps {
  preventivoId: number;
}

export function MaterialiForm({ preventivoId }: MaterialiFormProps) {
  const { data: materiali, isLoading } = useQuery({
    queryKey: ["materiali", preventivoId],
    queryFn: () => getMateriali(preventivoId),  // ✅
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const materialiArray = materiali || [];
  const prezzoTotale = materialiArray.reduce(
    (sum, mat) => sum + (mat.prezzo_totale || 0),
    0
  );

  const materialiAutomatici = materialiArray.filter((m) => m.aggiunto_da_regola);
  const materialiManuali = materialiArray.filter((m) => !m.aggiunto_da_regola);

  return (
    <div className="space-y-6">
      {/* Header con statistiche */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-blue-600" />
            <div>
              <div className="text-sm text-blue-600 font-medium">Totale Materiali</div>
              <div className="text-2xl font-bold text-blue-900">
                {materialiArray.length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Zap className="w-8 h-8 text-purple-600" />
            <div>
              <div className="text-sm text-purple-600 font-medium">Automatici</div>
              <div className="text-2xl font-bold text-purple-900">
                {materialiAutomatici.length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl">€</div>
            <div>
              <div className="text-sm text-green-600 font-medium">Prezzo Totale</div>
              <div className="text-2xl font-bold text-green-900">
                €{prezzoTotale.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Materiali Automatici */}
      {materialiAutomatici.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Materiali Aggiunti Automaticamente
            </h3>
            <span className="text-sm text-gray-500">
              (dalle regole attive)
            </span>
          </div>

          <div className="bg-purple-50 border-2 border-purple-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-purple-100">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-purple-900">
                    Codice
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-purple-900">
                    Descrizione
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-purple-900">
                    Quantità
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-purple-900">
                    Prezzo Unit.
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-purple-900">
                    Totale
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-purple-900">
                    Regola
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-200 bg-white">
                {materialiAutomatici.map((mat) => (
                  <tr key={mat.id} className="hover:bg-purple-50 transition-colors">
                    <td className="px-4 py-3">
                      <code className="text-sm font-mono bg-purple-100 px-2 py-1 rounded text-purple-900">
                        {mat.codice}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {mat.descrizione}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-900 font-semibold">
                        {mat.quantita}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">
                      €{mat.prezzo_unitario.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-purple-900">
                      €{mat.prezzo_totale.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-purple-100 text-xs font-medium text-purple-900">
                        <Zap className="w-3 h-3" />
                        {mat.regola_id}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Materiali Manuali */}
      {materialiManuali.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-gray-900">
            Materiali Aggiunti Manualmente
          </h3>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Codice
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">
                    Descrizione
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                    Quantità
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                    Prezzo Unit.
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                    Totale
                  </th>
                  <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {materialiManuali.map((mat) => (
                  <tr key={mat.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                        {mat.codice}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {mat.descrizione}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-900 font-semibold">
                        {mat.quantita}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900">
                      €{mat.prezzo_unitario.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      €{mat.prezzo_totale.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        className="p-2 rounded hover:bg-red-50 text-red-600 transition-colors"
                        title="Elimina materiale"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Nessun materiale */}
      {materialiArray.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nessun materiale presente
          </h3>
          <p className="text-gray-600">
            I materiali verranno aggiunti automaticamente dalle regole attive<br />
            oppure puoi aggiungerli manualmente.
          </p>
        </div>
      )}

      {/* Riepilogo Prezzi */}
      {materialiArray.length > 0 && (
        <div className="bg-gradient-to-br from-green-50 to-blue-50 border-2 border-green-200 rounded-lg p-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center text-gray-700">
              <span>Subtotale materiali:</span>
              <span className="font-medium">€{prezzoTotale.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center text-gray-700">
              <span>IVA (22%):</span>
              <span className="font-medium">€{(prezzoTotale * 0.22).toFixed(2)}</span>
            </div>
            
            <div className="border-t-2 border-green-300 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-xl font-bold text-gray-900">
                  Totale Preventivo:
                </span>
                <span className="text-3xl font-bold text-green-600">
                  €{(prezzoTotale * 1.22).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
