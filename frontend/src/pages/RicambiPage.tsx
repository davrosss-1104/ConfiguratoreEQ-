import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RicambiForm } from '@/components/RicambiForm';

const API_BASE = 'http://localhost:8000';

export const RicambiPage = () => {
  const navigate = useNavigate();
  const [selectedPreventivoId, setSelectedPreventivoId] = useState<number | null>(null);

  // Carica preventivi esistenti
  const { data: preventivi = [], isLoading } = useQuery({
    queryKey: ['preventivi'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/preventivi`);
      if (!res.ok) throw new Error('Errore');
      return res.json();
    },
  });

  // Crea nuovo preventivo ricambi
  const handleCreateRicambio = async () => {
    try {
      const res = await fetch(`${API_BASE}/preventivi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      });
      if (!res.ok) throw new Error('Errore creazione');
      const newPrev = await res.json();
      setSelectedPreventivoId(newPrev.id);
    } catch (error) {
      console.error('Errore:', error);
      alert('Errore nella creazione del preventivo ricambi');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Ricambi</h1>
              <p className="text-sm text-gray-500">Ricerca articoli e gestione preventivi ricambi</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Selettore preventivo o creazione nuovo */}
        {!selectedPreventivoId ? (
          <div className="space-y-6">
            {/* Nuovo preventivo ricambi */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Nuovo Preventivo Ricambi</h2>
              <button
                onClick={handleCreateRicambio}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Crea Preventivo Ricambi
              </button>
            </div>

            {/* Oppure seleziona esistente */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Oppure seleziona un preventivo esistente</h2>
              {isLoading ? (
                <p className="text-gray-500">Caricamento...</p>
              ) : preventivi.length === 0 ? (
                <p className="text-gray-400">Nessun preventivo disponibile</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {preventivi.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPreventivoId(p.id)}
                      className="text-left p-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-all"
                    >
                      <div className="font-semibold text-gray-900">{p.numero_preventivo}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        {p.customer_name || 'Senza cliente'}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(p.created_at).toLocaleDateString('it-IT')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            {/* Pulsante per cambiare preventivo */}
            <div className="mb-4 flex items-center gap-3">
              <button
                onClick={() => setSelectedPreventivoId(null)}
                className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                Cambia preventivo
              </button>
            </div>

            {/* Form Ricambi */}
            <RicambiForm preventivoId={selectedPreventivoId} />
          </div>
        )}
      </div>
    </div>
  );
};
