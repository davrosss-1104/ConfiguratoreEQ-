import React, { useEffect, useState } from 'react';

// ==========================================
// TYPES
// ==========================================

export interface Sbarco {
  piano: number;
  lati: ('A' | 'B' | 'C')[];  // Array di lati (può avere A, B, C contemporaneamente)
  denominazione: string;
  interpiano?: number;  // Distanza dal piano precedente in metri
}

interface TabellaSbarchiProps {
  numeroFermate: number;
  numeroServizi: number;  // Numero servizi da dati_principali
  sbarchi: Sbarco[];
  onSbarchiChange: (sbarchi: Sbarco[]) => void;
}

// ==========================================
// COMPONENTE
// ==========================================

export function TabellaSbarchi({ 
  numeroFermate, 
  numeroServizi,
  sbarchi, 
  onSbarchiChange 
}: TabellaSbarchiProps) {
  
  const [initialized, setInitialized] = useState(false);
  
  // ==========================================
  // DEFAULT: 2 FERMATE SE NON SPECIFICATO
  // ==========================================
  
  const fermateEffettive = numeroFermate > 0 ? numeroFermate : 2;
  
  // ==========================================
  // INIZIALIZZAZIONE AUTOMATICA
  // ==========================================
  
  useEffect(() => {
    if (!initialized && fermateEffettive > 0) {
      console.log('🏢 Inizializzazione TabellaSbarchi:', fermateEffettive, 'fermate');
      
      const sbarchiIniziali: Sbarco[] = [];
      for (let i = 0; i < fermateEffettive; i++) {
        sbarchiIniziali.push({
          piano: i,
          lati: i === 0 ? ['A'] : [],  // Solo Piano 1 (piano 0) ha lato A di default
          denominazione: `Piano ${i + 1}`,
          interpiano: 0,
        });
      }
      
      onSbarchiChange(sbarchiIniziali);
      setInitialized(true);
      console.log('✅ Sbarchi inizializzati:', sbarchiIniziali);
    }
  }, [fermateEffettive, initialized, onSbarchiChange]);

  // ==========================================
  // HANDLERS
  // ==========================================

  const toggleLato = (piano: number, lato: 'A' | 'B' | 'C') => {
    console.log(`🔘 Toggle lato ${lato} per piano ${piano}`);
    
    const nuoviSbarchi = sbarchi.map(sbarco => {
      if (sbarco.piano === piano) {
        const latiAttuali = sbarco.lati || [];
        const hasLato = latiAttuali.includes(lato);
        
        const nuoviLati = hasLato
          ? latiAttuali.filter(l => l !== lato)  // Rimuovi
          : [...latiAttuali, lato];              // Aggiungi
        
        return { ...sbarco, lati: nuoviLati };
      }
      return sbarco;
    });
    
    onSbarchiChange(nuoviSbarchi);
  };

  const handleDenominazioneChange = (piano: number, denominazione: string) => {
    const nuoviSbarchi = sbarchi.map(sbarco =>
      sbarco.piano === piano ? { ...sbarco, denominazione } : sbarco
    );
    onSbarchiChange(nuoviSbarchi);
  };

  const handleInterpianoChange = (piano: number, interpiano: number) => {
    const nuoviSbarchi = sbarchi.map(sbarco =>
      sbarco.piano === piano ? { ...sbarco, interpiano } : sbarco
    );
    onSbarchiChange(nuoviSbarchi);
  };

  // ==========================================
  // CALCOLI
  // ==========================================

  // Conta quanti sbarchi sono stati selezionati in totale
  const sbarchiConfigurati = sbarchi.reduce((acc, s) => acc + (s.lati?.length || 0), 0);
  
  // Conta quanti piani hanno almeno uno sbarco
  const pianiConSbarchi = sbarchi.filter(s => s.lati && s.lati.length > 0).length;
  
  // Calcola percentuale completamento
  const completamento = numeroServizi > 0 
    ? Math.round((sbarchiConfigurati / numeroServizi) * 100)
    : 0;
  
  // Ordina piani: Piano 1 in BASSO (piano 0), poi Piano 2 (piano 1), etc.
  // Quindi ordine INVERSO per il display
  const pianiOrdinati = [...sbarchi].sort((a, b) => b.piano - a.piano);

  // ==========================================
  // RENDERING
  // ==========================================

  if (fermateEffettive === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">🚪 Configurazione Sbarchi</h3>
        <div className="text-center text-gray-500 py-8">
          <p>⚠️ Imposta il numero di fermate in "Dati Principali" per configurare gli sbarchi.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white">
        <h3 className="text-xl font-bold">🚪 Configurazione Sbarchi</h3>
        <p className="text-sm text-orange-100 mt-1">
          Configura gli sbarchi per ogni piano ({fermateEffettive} fermate)
        </p>
      </div>

      {/* Tabella */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 border-b-2 border-gray-300">
                Piano
              </th>
              <th className="px-6 py-4 text-center text-sm font-bold text-gray-700 border-b-2 border-gray-300">
                Lati Sbarco
                <div className="flex items-center justify-center gap-3 mt-2">
                  <span className="text-xs font-medium">A</span>
                  <span className="text-xs font-medium">B</span>
                  <span className="text-xs font-medium">C</span>
                </div>
              </th>
              <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 border-b-2 border-gray-300">
                Denominazione
              </th>
              <th className="px-6 py-4 text-left text-sm font-bold text-gray-700 border-b-2 border-gray-300">
                Interpiano (m)
              </th>
            </tr>
          </thead>
          <tbody>
            {pianiOrdinati.map((sbarco) => {
              const hasA = sbarco.lati?.includes('A') || false;
              const hasB = sbarco.lati?.includes('B') || false;
              const hasC = sbarco.lati?.includes('C') || false;
              
              return (
                <tr 
                  key={sbarco.piano}
                  className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  {/* Piano */}
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">
                      Piano {sbarco.piano + 1}
                    </div>
                  </td>

                  {/* Lati Sbarco - Pulsanti A, B, C */}
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-3">
                      {/* Pulsante A */}
                      <button
                        type="button"
                        onClick={() => toggleLato(sbarco.piano, 'A')}
                        className={`
                          w-12 h-12 rounded-lg font-bold text-lg
                          transition-all duration-200 transform hover:scale-105
                          ${hasA 
                            ? 'bg-green-500 text-white shadow-md' 
                            : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                          }
                        `}
                      >
                        A
                      </button>

                      {/* Pulsante B */}
                      <button
                        type="button"
                        onClick={() => toggleLato(sbarco.piano, 'B')}
                        className={`
                          w-12 h-12 rounded-lg font-bold text-lg
                          transition-all duration-200 transform hover:scale-105
                          ${hasB 
                            ? 'bg-green-500 text-white shadow-md' 
                            : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                          }
                        `}
                      >
                        B
                      </button>

                      {/* Pulsante C */}
                      <button
                        type="button"
                        onClick={() => toggleLato(sbarco.piano, 'C')}
                        className={`
                          w-12 h-12 rounded-lg font-bold text-lg
                          transition-all duration-200 transform hover:scale-105
                          ${hasC 
                            ? 'bg-green-500 text-white shadow-md' 
                            : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                          }
                        `}
                      >
                        C
                      </button>
                    </div>
                  </td>

                  {/* Denominazione */}
                  <td className="px-6 py-4">
                    <input
                      type="text"
                      value={sbarco.denominazione}
                      onChange={(e) => handleDenominazioneChange(sbarco.piano, e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md 
                                 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder={`Piano ${sbarco.piano + 1}`}
                    />
                  </td>

                  {/* Interpiano */}
                  <td className="px-6 py-4">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={sbarco.interpiano || 0}
                      onChange={(e) => handleInterpianoChange(sbarco.piano, parseFloat(e.target.value) || 0)}
                      className="w-24 px-3 py-2 border border-gray-300 rounded-md 
                                 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Riepilogo */}
      <div className="px-6 py-4 bg-gray-50 border-t-2 border-gray-300">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">📊</span>
          <span className="font-bold text-gray-700">Riepilogo:</span>
        </div>
        
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-gray-600">Sbarchi configurati:</span>
            <span className={`ml-2 font-bold ${
              sbarchiConfigurati === numeroServizi ? 'text-green-600' : 'text-orange-600'
            }`}>
              {sbarchiConfigurati}
            </span>
          </div>
          
          <div>
            <span className="text-gray-600">Fermate totali:</span>
            <span className="ml-2 font-bold text-gray-900">{fermateEffettive}</span>
          </div>
          
          <div>
            <span className="text-gray-600">Completamento:</span>
            <span className={`ml-2 font-bold ${
              completamento === 100 ? 'text-green-600' : 'text-orange-600'
            }`}>
              {completamento}%
            </span>
          </div>
          
          <div>
            <span className="text-gray-600">Piani con sbarchi:</span>
            <span className="ml-2 font-bold text-gray-900">{pianiConSbarchi}</span>
          </div>
        </div>

        {/* Alert se sbarchi ≠ servizi */}
        {sbarchiConfigurati !== numeroServizi && numeroServizi > 0 && (
          <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <div className="flex items-center gap-2 text-orange-800">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-medium">
                ⚠️ Attenzione: configurati {sbarchiConfigurati} sbarchi ma sono richiesti {numeroServizi} servizi
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="px-6 py-4 bg-blue-50 border-t border-blue-200">
        <div className="flex items-start gap-3">
          <div className="text-2xl">💡</div>
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-2">Istruzioni:</p>
            <ul className="space-y-1 text-xs">
              <li>• <strong>Piano 1</strong> = Piano più basso (in fondo alla tabella)</li>
              <li>• <strong>Lati Sbarco</strong>: clicca i pulsanti A, B, C per selezionare i lati di accesso</li>
              <li>• <strong>Servizi richiesti</strong>: {numeroServizi} (dal campo "N° servizi" in Dati Principali)</li>
              <li>• Un piano può avere più sbarchi (es. Piano 1 con lato A + B = 2 sbarchi)</li>
              <li>• Gli sbarchi vengono salvati automaticamente dopo 3 secondi</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
