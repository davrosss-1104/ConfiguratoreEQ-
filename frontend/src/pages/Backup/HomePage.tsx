import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Calendar, User } from 'lucide-react';

interface Preventivo {
  id: number;
  numero_preventivo: string;
  customer_name: string;
  created_at: string;
  status: string;
}

export default function HomePage() {
  const navigate = useNavigate();

  // Query per caricare lista preventivi
  const { data: preventivi, isLoading } = useQuery({
    queryKey: ['preventivi'],
    queryFn: async () => {
      const response = await fetch('/api/preventivi');
      if (!response.ok) throw new Error('Errore caricamento preventivi');
      return response.json();
    },
  });

  const handleNuovoPreventivo = async () => {
    try {
      const response = await fetch('/api/preventivi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome_cliente: 'Nuovo Cliente',
          stato: 'draft'  // ✅ Usa "draft" non "bozza"
        }),
      });
      
      if (!response.ok) throw new Error('Errore creazione preventivo');
      
      const nuovoPreventivo = await response.json();
      navigate(`/preventivi/${nuovoPreventivo.id}`);
    } catch (error) {
      console.error('Errore:', error);
      alert('Errore durante la creazione del preventivo');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Caricamento preventivi...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Configuratore Elettroquadri
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Gestione preventivi - Elettroquadri S.r.l.
              </p>
            </div>
            
            <button
              onClick={handleNuovoPreventivo}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
            >
              <Plus className="w-5 h-5" />
              Nuovo Preventivo
            </button>
          </div>
        </div>
      </header>

      {/* Contenuto */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            I tuoi preventivi
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {preventivi?.length || 0} preventivi totali
          </p>
        </div>

        {/* Lista preventivi */}
        {!preventivi || preventivi.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border-2 border-dashed border-gray-300">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Nessun preventivo
            </h3>
            <p className="text-gray-600 mb-6">
              Inizia creando il tuo primo preventivo
            </p>
            <button
              onClick={handleNuovoPreventivo}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Plus className="w-5 h-5" />
              Crea Preventivo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {preventivi.map((preventivo: Preventivo) => (
              <div
                key={preventivo.id}
                onClick={() => navigate(`/preventivi/${preventivo.id}`)}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-all cursor-pointer group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-blue-50 rounded-lg group-hover:bg-blue-100 transition-colors">
                    <FileText className="w-6 h-6 text-blue-600" />
                  </div>
                  
                  <span className={`
                    px-2 py-1 rounded-full text-xs font-semibold
                    ${preventivo.status === 'draft' ? 'bg-yellow-100 text-yellow-800' : ''}
                    ${preventivo.status === 'sent' ? 'bg-blue-100 text-blue-800' : ''}
                    ${preventivo.status === 'approved' ? 'bg-green-100 text-green-800' : ''}
                  `}>
                    {preventivo.status?.toUpperCase() || 'DRAFT'}
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {preventivo.numero_preventivo}
                </h3>

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span>{preventivo.customer_name || 'Cliente non specificato'}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {preventivo.created_at 
                        ? new Date(preventivo.created_at).toLocaleDateString('it-IT')
                        : 'Data non disponibile'
                      }
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/preventivi/${preventivo.id}`);
                    }}
                    className="text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors"
                  >
                    Apri preventivo →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
