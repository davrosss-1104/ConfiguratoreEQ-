import { Package, Wrench } from 'lucide-react';

interface TipoPreventivoSelectorProps {
  value: 'COMPLETO' | 'RICAMBIO';
  onChange: (tipo: 'COMPLETO' | 'RICAMBIO') => void;
  disabled?: boolean;
}

export function TipoPreventivoSelector({ value, onChange, disabled = false }: TipoPreventivoSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* COMPLETO */}
      <button
        type="button"
        onClick={() => onChange('COMPLETO')}
        disabled={disabled}
        className={`
          relative p-6 rounded-xl border-2 transition-all duration-200
          ${value === 'COMPLETO'
            ? 'border-blue-500 bg-blue-50 shadow-lg'
            : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {/* Indicatore selezionato */}
        {value === 'COMPLETO' && (
          <div className="absolute top-3 right-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        
        <div className="flex flex-col items-center text-center">
          <div className={`
            w-16 h-16 rounded-full flex items-center justify-center mb-4
            ${value === 'COMPLETO' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}
          `}>
            <Package className="w-8 h-8" />
          </div>
          
          <h3 className={`
            text-xl font-bold mb-2
            ${value === 'COMPLETO' ? 'text-blue-900' : 'text-gray-900'}
          `}>
            Prodotto Completo
          </h3>
          
          <p className="text-sm text-gray-600">
            Configurazione completa ascensore/piattaforma con calcolo automatico materiali
          </p>
          
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
              Configurazione guidata
            </span>
            <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
              Rule engine
            </span>
          </div>
        </div>
      </button>

      {/* RICAMBIO */}
      <button
        type="button"
        onClick={() => onChange('RICAMBIO')}
        disabled={disabled}
        className={`
          relative p-6 rounded-xl border-2 transition-all duration-200
          ${value === 'RICAMBIO'
            ? 'border-green-500 bg-green-50 shadow-lg'
            : 'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/50'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        {/* Indicatore selezionato */}
        {value === 'RICAMBIO' && (
          <div className="absolute top-3 right-3 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        
        <div className="flex flex-col items-center text-center">
          <div className={`
            w-16 h-16 rounded-full flex items-center justify-center mb-4
            ${value === 'RICAMBIO' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'}
          `}>
            <Wrench className="w-8 h-8" />
          </div>
          
          <h3 className={`
            text-xl font-bold mb-2
            ${value === 'RICAMBIO' ? 'text-green-900' : 'text-gray-900'}
          `}>
            Ricambi
          </h3>
          
          <p className="text-sm text-gray-600">
            Selezione diretta articoli da anagrafica con calcolo prezzi automatico
          </p>
          
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
              Selezione articoli
            </span>
            <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
              Calcolo a 3 livelli
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}
