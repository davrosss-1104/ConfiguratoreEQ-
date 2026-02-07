/**
 * ConfiguratorPage.tsx - Pagina configuratore preventivo
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { preventiviApi, materialiApi, type Preventivo, type Materiale } from '../lib/api';

export default function ConfiguratorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [preventivo, setPreventivo] = useState<Preventivo | null>(null);
  const [materiali, setMateriali] = useState<Materiale[]>([]);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    trazione: '',
    normativa: '',
    numero_fermate: '',
    tipo_porte: '',
    ups_backup: '',
    telecontrollo: '',
  });

  useEffect(() => {
    if (id) {
      loadPreventivo(parseInt(id));
    }
  }, [id]);

  const loadPreventivo = async (preventivoId: number) => {
    try {
      const data = await preventiviApi.get(preventivoId);
      setPreventivo(data);
      setMateriali(data.materiali);

      // Popola form da configurazione
      if (data.configurazione) {
        setFormData((prev) => ({ ...prev, ...data.configurazione }));
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Errore caricamento preventivo:', error);
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleEvaluateRules = async () => {
    if (!preventivo) return;

    setEvaluating(true);
    try {
      // Aggiorna configurazione
      await preventiviApi.update(preventivo.id, {
        configurazione: formData,
      });

      // Valuta regole
      const result = await preventiviApi.evaluateRules(preventivo.id, true);
      console.log('Regole valutate:', result);

      // Ricarica materiali
      const updatedPreventivo = await preventiviApi.get(preventivo.id);
      setMateriali(updatedPreventivo.materiali);

      // Show toast
      alert(`${result.materiali_aggiunti} materiali aggiunti automaticamente!`);
    } catch (error) {
      console.error('Errore valutazione regole:', error);
      alert('Errore valutazione regole');
    } finally {
      setEvaluating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-2 text-gray-600">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!preventivo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Preventivo non trovato</p>
          <button
            onClick={() => navigate('/preventivi')}
            className="mt-4 text-indigo-600 hover:underline"
          >
            Torna ai preventivi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{preventivo.numero}</h1>
              <p className="text-gray-600 mt-1">{preventivo.cliente.ragione_sociale}</p>
            </div>
            <button
              onClick={() => navigate('/preventivi')}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Indietro
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form Configurazione */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Configurazione</h2>

            <div className="space-y-4">
              {/* Trazione */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Trazione
                </label>
                <select
                  value={formData.trazione}
                  onChange={(e) => handleInputChange('trazione', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Seleziona...</option>
                  <option value="Gearless MRL">Gearless MRL</option>
                  <option value="Geared">Geared</option>
                  <option value="Oleo">Oleo</option>
                </select>
              </div>

              {/* Normativa */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Normativa
                </label>
                <select
                  value={formData.normativa}
                  onChange={(e) => handleInputChange('normativa', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Seleziona...</option>
                  <option value="EN81-20:2020">EN81-20:2020</option>
                  <option value="EN81-21:2018">EN81-21:2018</option>
                  <option value="EN81-3:2000">EN81-3:2000</option>
                </select>
              </div>

              {/* Numero Fermate */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Numero Fermate
                </label>
                <input
                  type="number"
                  value={formData.numero_fermate}
                  onChange={(e) => handleInputChange('numero_fermate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Es: 6"
                />
              </div>

              {/* Tipo Porte */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo Porte
                </label>
                <select
                  value={formData.tipo_porte}
                  onChange={(e) => handleInputChange('tipo_porte', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Seleziona...</option>
                  <option value="Automatiche">Automatiche</option>
                  <option value="Semiautomatiche">Semiautomatiche</option>
                  <option value="Manuali">Manuali</option>
                </select>
              </div>

              {/* UPS Backup */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  UPS Backup
                </label>
                <select
                  value={formData.ups_backup}
                  onChange={(e) => handleInputChange('ups_backup', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Seleziona...</option>
                  <option value="Sì">Sì</option>
                  <option value="No">No</option>
                </select>
              </div>

              {/* Telecontrollo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telecontrollo
                </label>
                <select
                  value={formData.telecontrollo}
                  onChange={(e) => handleInputChange('telecontrollo', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Seleziona...</option>
                  <option value="Sì">Sì</option>
                  <option value="No">No</option>
                </select>
              </div>

              {/* Button Valuta Regole */}
              <button
                onClick={handleEvaluateRules}
                disabled={evaluating}
                className="w-full bg-indigo-600 text-white py-3 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {evaluating ? 'Calcolo in corso...' : '⚡ Calcola Materiali Automaticamente'}
              </button>
            </div>
          </div>

          {/* Materiali BOM */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">
              Materiali Automatici ({materiali.length})
            </h2>

            {materiali.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-gray-600">Nessun materiale ancora</p>
                <p className="text-sm text-gray-500 mt-2">
                  Compila il form e clicca "Calcola Materiali"
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {materiali.map((materiale) => (
                  <div
                    key={materiale.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-gray-900">
                            {materiale.codice}
                          </span>
                          {materiale.aggiunto_da_regola && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              ⚡ Auto
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{materiale.descrizione}</p>
                        {materiale.parametro1_nome && (
                          <p className="text-xs text-gray-500 mt-1">
                            {materiale.parametro1_nome}: {materiale.parametro1_valore}
                          </p>
                        )}
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-sm font-medium text-gray-900">
                          {materiale.quantita} {materiale.unita_misura}
                        </div>
                        <div className="text-sm text-gray-600">
                          €{materiale.prezzo_unitario.toFixed(2)}
                        </div>
                        <div className="text-sm font-semibold text-indigo-600 mt-1">
                          €{materiale.prezzo_totale.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Totale */}
                <div className="border-t-2 border-gray-300 pt-4 mt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-semibold text-gray-900">Totale Materiali:</span>
                    <span className="text-xl font-bold text-indigo-600">
                      €{materiali.reduce((sum, m) => sum + m.prezzo_totale, 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
