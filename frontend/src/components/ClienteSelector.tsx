import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, User, Building, X, Loader2 } from 'lucide-react';

const API_BASE = 'http://localhost:8000/api';

interface Cliente {
  id: number;
  codice: string;
  ragione_sociale: string;
  citta: string | null;
  provincia: string | null;
  sconto_produzione: number;
  sconto_acquisto: number;
}

interface ClienteSelectorProps {
  value: number | null;
  onChange: (clienteId: number | null, cliente?: Cliente) => void;
  placeholder?: string;
}

export function ClienteSelector({ value, onChange, placeholder = "Seleziona cliente..." }: ClienteSelectorProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Carica cliente selezionato
  const { data: clienteData } = useQuery({
    queryKey: ['cliente', value],
    queryFn: async () => {
      if (!value) return null;
      const res = await fetch(`${API_BASE}/clienti/${value}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!value && !selectedCliente
  });

  useEffect(() => {
    if (clienteData) {
      setSelectedCliente(clienteData);
    }
  }, [clienteData]);

  // Cerca clienti
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ['clienti-search', search],
    queryFn: async () => {
      if (search.length < 2) return [];
      const res = await fetch(`${API_BASE}/clienti/search?q=${encodeURIComponent(search)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: search.length >= 2
  });

  // Click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    onChange(cliente.id, cliente);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = () => {
    setSelectedCliente(null);
    onChange(null);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Input / Display */}
      {selectedCliente ? (
        <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
          <Building className="w-5 h-5 text-green-600" />
          <div className="flex-1">
            <div className="font-medium text-green-900">{selectedCliente.ragione_sociale}</div>
            <div className="text-sm text-green-700">
              {selectedCliente.codice}
              {selectedCliente.citta && ` • ${selectedCliente.citta}`}
              {(selectedCliente.sconto_produzione > 0 || selectedCliente.sconto_acquisto > 0) && (
                <span className="ml-2">
                  (Sconti: Prod. {selectedCliente.sconto_produzione}%, Acq. {selectedCliente.sconto_acquisto}%)
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleClear}
            className="p-1 text-green-600 hover:bg-green-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            placeholder={placeholder}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
          {isLoading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-gray-400" />
          )}
        </div>
      )}

      {/* Dropdown risultati */}
      {isOpen && !selectedCliente && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {search.length < 2 ? (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">
              Digita almeno 2 caratteri per cercare...
            </div>
          ) : searchResults && searchResults.length > 0 ? (
            searchResults.map((cliente: Cliente) => (
              <button
                key={cliente.id}
                onClick={() => handleSelect(cliente)}
                className="w-full px-4 py-3 text-left hover:bg-green-50 border-b border-gray-100 last:border-b-0 flex items-center gap-3"
              >
                <User className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{cliente.ragione_sociale}</div>
                  <div className="text-sm text-gray-500">
                    {cliente.codice}
                    {cliente.citta && ` • ${cliente.citta} (${cliente.provincia})`}
                  </div>
                </div>
                {(cliente.sconto_produzione > 0 || cliente.sconto_acquisto > 0) && (
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Sconti</div>
                    <div className="text-sm font-medium text-green-600">
                      {cliente.sconto_produzione}% / {cliente.sconto_acquisto}%
                    </div>
                  </div>
                )}
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-gray-500 text-center">
              Nessun cliente trovato
            </div>
          )}
        </div>
      )}
    </div>
  );
}
