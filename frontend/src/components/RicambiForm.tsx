import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Trash2, Calculator, Package, Loader2, Percent, Lock } from 'lucide-react';

const API_BASE = 'http://localhost:8000';

// ==========================================
// TYPES
// ==========================================
interface Articolo {
  id: number;
  codice: string;
  descrizione: string;
  tipo_articolo: string;
  costo_fisso: number;
  // 4 parametri variabili
  costo_variabile_1: number;
  unita_misura_var_1: string | null;
  descrizione_var_1: string | null;
  costo_variabile_2: number;
  unita_misura_var_2: string | null;
  descrizione_var_2: string | null;
  costo_variabile_3: number;
  unita_misura_var_3: string | null;
  descrizione_var_3: string | null;
  costo_variabile_4: number;
  unita_misura_var_4: string | null;
  descrizione_var_4: string | null;
  ricarico_percentuale: number | null;
  unita_misura: string;
}

interface ParametroCalcolo {
  valore: number;
  costo_variabile: number;
  unita_misura: string | null;
  descrizione: string | null;
  subtotale: number;
}

interface CalcoloPrezzoResult {
  costo_fisso: number;
  parametri: ParametroCalcolo[];
  costo_base_unitario: number;
  ricarico_percentuale: number;
  prezzo_listino_unitario: number;
  sconto_cliente_percentuale: number;
  prezzo_cliente_unitario: number;
  quantita: number;
  prezzo_totale_listino: number;
  prezzo_totale_cliente: number;
  tipo_articolo: string;
  dettaglio_calcolo: string;
}

interface RigaRicambio {
  id?: number;
  articolo_id: number | null;
  codice: string;
  descrizione: string;
  tipo_articolo: string;
  quantita: number;
  // 4 parametri
  parametro_1: number | null;
  unita_param_1: string | null;
  desc_param_1: string | null;
  costo_var_1: number;
  parametro_2: number | null;
  unita_param_2: string | null;
  desc_param_2: string | null;
  costo_var_2: number;
  parametro_3: number | null;
  unita_param_3: string | null;
  desc_param_3: string | null;
  costo_var_3: number;
  parametro_4: number | null;
  unita_param_4: string | null;
  desc_param_4: string | null;
  costo_var_4: number;
  // Costi calcolati
  costo_fisso: number;
  costo_base_unitario: number;
  ricarico_percentuale: number;
  prezzo_listino_unitario: number;
  sconto_cliente: number;
  prezzo_cliente_unitario: number;
  prezzo_totale_listino: number;
  prezzo_totale_cliente: number;
  note: string;
}

interface Preventivo {
  id: number;
  total_price: number;
  sconto_cliente: number;
  sconto_extra_admin: number;
  total_price_finale: number;
}

interface RicambiFormProps {
  preventivoId: number;
  clienteId?: number | null;
}

// ==========================================
// COMPONENTE PRINCIPALE
// ==========================================
export function RicambiForm({ preventivoId, clienteId }: RicambiFormProps) {
  const [righe, setRighe] = useState<RigaRicambio[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Articolo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [scontoAdmin, setScontoAdmin] = useState(0);
  const searchRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Check if user is admin
  const isAdmin = (() => {
    try {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user).is_admin : false;
    } catch {
      return false;
    }
  })();

  // Carica preventivo per totali
  const { data: preventivo, refetch: refetchPreventivo } = useQuery({
    queryKey: ['preventivo', preventivoId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}`);
      if (!res.ok) throw new Error('Errore caricamento');
      return res.json() as Promise<Preventivo>;
    }
  });

  useEffect(() => {
    if (preventivo) {
      setScontoAdmin(preventivo.sconto_extra_admin || 0);
    }
  }, [preventivo]);

  // Carica righe esistenti
  const { data: righeData, isLoading } = useQuery({
    queryKey: ['righe-ricambio', preventivoId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/righe-ricambio`);
      if (!res.ok) throw new Error('Errore caricamento righe');
      return res.json();
    }
  });

  useEffect(() => {
    if (righeData) {
      setRighe(righeData);
    }
  }, [righeData]);

  // Cerca articoli
  useEffect(() => {
    const searchArticoli = async () => {
      if (searchQuery.length < 2) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const res = await fetch(`${API_BASE}/articoli/search?q=${encodeURIComponent(searchQuery)}&limit=10`);
        if (res.ok) {
          setSearchResults(await res.json());
        }
      } catch (error) {
        console.error('Errore ricerca:', error);
      } finally {
        setIsSearching(false);
      }
    };
    const timer = setTimeout(searchArticoli, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mutation salva riga
  const saveRigaMutation = useMutation({
    mutationFn: async (riga: RigaRicambio) => {
      const method = riga.id ? 'PUT' : 'POST';
      const url = riga.id 
        ? `${API_BASE}/preventivi/${preventivoId}/righe-ricambio/${riga.id}`
        : `${API_BASE}/preventivi/${preventivoId}/righe-ricambio`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(riga)
      });
      if (!res.ok) throw new Error('Errore salvataggio');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['righe-ricambio', preventivoId] });
      refetchPreventivo();
    }
  });

  // Mutation elimina riga
  const deleteRigaMutation = useMutation({
    mutationFn: async (rigaId: number) => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/righe-ricambio/${rigaId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Errore eliminazione');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['righe-ricambio', preventivoId] });
      refetchPreventivo();
    }
  });

  // Mutation sconto admin
  const updateScontoAdminMutation = useMutation({
    mutationFn: async (sconto: number) => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/sconto-admin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sconto_extra_admin: sconto })
      });
      if (!res.ok) throw new Error('Errore aggiornamento sconto');
      return res.json();
    },
    onSuccess: () => {
      refetchPreventivo();
    }
  });

  // Calcola prezzo per articolo (con 4 parametri)
  const calcolaPrezzo = async (
    articoloId: number, 
    quantita: number, 
    params: { p1?: number | null; p2?: number | null; p3?: number | null; p4?: number | null }
  ): Promise<CalcoloPrezzoResult | null> => {
    try {
      const res = await fetch(`${API_BASE}/articoli/calcola-prezzo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articolo_id: articoloId,
          quantita,
          param_1: params.p1,
          param_2: params.p2,
          param_3: params.p3,
          param_4: params.p4,
          cliente_id: clienteId
        })
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  };

  // Aggiungi articolo da ricerca
  const handleSelectArticolo = async (articolo: Articolo) => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);

    // Prepara parametri iniziali (default 1 se costo variabile > 0)
    const p1 = articolo.costo_variabile_1 > 0 ? 1 : null;
    const p2 = articolo.costo_variabile_2 > 0 ? 1 : null;
    const p3 = articolo.costo_variabile_3 > 0 ? 1 : null;
    const p4 = articolo.costo_variabile_4 > 0 ? 1 : null;

    // Calcola prezzo
    const prezzi = await calcolaPrezzo(articolo.id, 1, { p1, p2, p3, p4 });
    
    const nuovaRiga: RigaRicambio = {
      articolo_id: articolo.id,
      codice: articolo.codice,
      descrizione: articolo.descrizione,
      tipo_articolo: articolo.tipo_articolo,
      quantita: 1,
      // Parametri da articolo
      parametro_1: p1,
      unita_param_1: articolo.unita_misura_var_1,
      desc_param_1: articolo.descrizione_var_1,
      costo_var_1: articolo.costo_variabile_1 || 0,
      parametro_2: p2,
      unita_param_2: articolo.unita_misura_var_2,
      desc_param_2: articolo.descrizione_var_2,
      costo_var_2: articolo.costo_variabile_2 || 0,
      parametro_3: p3,
      unita_param_3: articolo.unita_misura_var_3,
      desc_param_3: articolo.descrizione_var_3,
      costo_var_3: articolo.costo_variabile_3 || 0,
      parametro_4: p4,
      unita_param_4: articolo.unita_misura_var_4,
      desc_param_4: articolo.descrizione_var_4,
      costo_var_4: articolo.costo_variabile_4 || 0,
      // Costi calcolati
      costo_fisso: prezzi?.costo_fisso || 0,
      costo_base_unitario: prezzi?.costo_base_unitario || 0,
      ricarico_percentuale: prezzi?.ricarico_percentuale || 0,
      prezzo_listino_unitario: prezzi?.prezzo_listino_unitario || 0,
      sconto_cliente: prezzi?.sconto_cliente_percentuale || 0,
      prezzo_cliente_unitario: prezzi?.prezzo_cliente_unitario || 0,
      prezzo_totale_listino: prezzi?.prezzo_totale_listino || 0,
      prezzo_totale_cliente: prezzi?.prezzo_totale_cliente || 0,
      note: ''
    };

    saveRigaMutation.mutate(nuovaRiga);
  };

  // Aggiorna quantità o parametro e ricalcola
  const handleUpdateRiga = async (
    index: number, 
    field: 'quantita' | 'parametro_1' | 'parametro_2' | 'parametro_3' | 'parametro_4', 
    value: number
  ) => {
    const riga = righe[index];
    if (!riga || !riga.articolo_id) return;

    const newQuantita = field === 'quantita' ? value : riga.quantita;
    const newParams = {
      p1: field === 'parametro_1' ? value : riga.parametro_1,
      p2: field === 'parametro_2' ? value : riga.parametro_2,
      p3: field === 'parametro_3' ? value : riga.parametro_3,
      p4: field === 'parametro_4' ? value : riga.parametro_4,
    };

    const prezzi = await calcolaPrezzo(riga.articolo_id, newQuantita, newParams);
    if (prezzi) {
      const updatedRiga: RigaRicambio = {
        ...riga,
        quantita: newQuantita,
        parametro_1: newParams.p1,
        parametro_2: newParams.p2,
        parametro_3: newParams.p3,
        parametro_4: newParams.p4,
        costo_base_unitario: prezzi.costo_base_unitario,
        prezzo_listino_unitario: prezzi.prezzo_listino_unitario,
        sconto_cliente: prezzi.sconto_cliente_percentuale,
        prezzo_cliente_unitario: prezzi.prezzo_cliente_unitario,
        prezzo_totale_listino: prezzi.prezzo_totale_listino,
        prezzo_totale_cliente: prezzi.prezzo_totale_cliente
      };
      saveRigaMutation.mutate(updatedRiga);
    }
  };

  // Elimina riga
  const handleDeleteRiga = (riga: RigaRicambio) => {
    if (riga.id) {
      deleteRigaMutation.mutate(riga.id);
    }
  };

  // Applica sconto admin
  const handleApplyScontoAdmin = () => {
    updateScontoAdminMutation.mutate(scontoAdmin);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con totali */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Preventivo Ricambi</h2>
            <p className="text-gray-600 text-sm mt-1">
              Cerca e aggiungi articoli. I prezzi vengono calcolati automaticamente.
            </p>
          </div>
          
          <div className="text-right space-y-1">
            <div className="text-sm text-gray-500">Totale Listino</div>
            <div className="text-xl font-semibold text-gray-700">
              €{(preventivo?.total_price || 0).toFixed(2)}
            </div>
            
            {(preventivo?.sconto_cliente || 0) > 0 && (
              <div className="text-sm text-green-600">
                Sconto cliente: -{preventivo?.sconto_cliente}%
              </div>
            )}
            
            {isAdmin && (preventivo?.sconto_extra_admin || 0) > 0 && (
              <div className="text-sm text-purple-600">
                Sconto extra: -{preventivo?.sconto_extra_admin}%
              </div>
            )}
            
            <div className="pt-2 border-t mt-2">
              <div className="text-sm text-gray-500">Totale Finale</div>
              <div className="text-3xl font-bold text-green-600">
                €{(preventivo?.total_price_finale || 0).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Sconto Admin - solo per admin */}
        {isAdmin && (
          <div className="mt-6 pt-4 border-t bg-purple-50 -mx-6 -mb-6 px-6 py-4 rounded-b-lg">
            <div className="flex items-center gap-4">
              <Lock className="w-5 h-5 text-purple-600" />
              <span className="text-sm font-medium text-purple-800">Sconto Extra Admin:</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={scontoAdmin}
                  onChange={(e) => setScontoAdmin(parseFloat(e.target.value) || 0)}
                  className="w-20 px-3 py-1 border border-purple-300 rounded focus:ring-2 focus:ring-purple-500 text-center"
                />
                <Percent className="w-4 h-4 text-purple-600" />
                <button
                  onClick={handleApplyScontoAdmin}
                  disabled={updateScontoAdminMutation.isPending}
                  className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 text-sm"
                >
                  {updateScontoAdminMutation.isPending ? 'Salvo...' : 'Applica'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Barra ricerca articoli */}
      <div ref={searchRef} className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearch(true);
            }}
            onFocus={() => setShowSearch(true)}
            placeholder="Cerca articolo per codice o descrizione..."
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-gray-400" />
          )}
        </div>

        {/* Risultati ricerca */}
        {showSearch && searchResults.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-80 overflow-y-auto">
            {searchResults.map((art) => (
              <button
                key={art.id}
                onClick={() => handleSelectArticolo(art)}
                className="w-full px-4 py-3 text-left hover:bg-green-50 border-b border-gray-100 last:border-b-0 flex items-center gap-3"
              >
                <Package className="w-5 h-5 text-gray-400" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-green-700">{art.codice}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      art.tipo_articolo === 'PRODUZIONE' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {art.tipo_articolo}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">{art.descrizione}</div>
                </div>
                <div className="text-right text-sm">
                  {art.costo_variabile > 0 
                    ? <span>€{art.costo_variabile.toFixed(2)}/{art.unita_misura_variabile}</span>
                    : <span>€{art.costo_fisso.toFixed(2)}</span>
                  }
                </div>
                <Plus className="w-5 h-5 text-green-600" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabella righe */}
      {righe.length > 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Codice</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Descrizione</th>
                <th className="px-3 py-3 text-center font-semibold text-gray-700 w-16">Q.tà</th>
                <th className="px-3 py-3 text-left font-semibold text-gray-700">Parametri</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-700">Costo</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-700">Listino</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-700">Finale</th>
                <th className="px-3 py-3 text-right font-semibold text-gray-700">Totale</th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {righe.map((riga, index) => (
                <tr key={riga.id || index} className="hover:bg-gray-50">
                  <td className="px-3 py-3">
                    <code className="font-mono text-sm font-semibold text-green-700">
                      {riga.codice}
                    </code>
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                      riga.tipo_articolo === 'PRODUZIONE' 
                        ? 'bg-blue-100 text-blue-600' 
                        : 'bg-orange-100 text-orange-600'
                    }`}>
                      {riga.tipo_articolo === 'PRODUZIONE' ? 'P' : 'A'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-gray-900">{riga.descrizione}</td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="1"
                      value={riga.quantita}
                      onChange={(e) => handleUpdateRiga(index, 'quantita', parseFloat(e.target.value) || 1)}
                      className="w-14 px-2 py-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {/* Parametro 1 */}
                      {riga.costo_var_1 > 0 && (
                        <div className="flex items-center gap-1 bg-gray-100 rounded px-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={riga.parametro_1 || ''}
                            onChange={(e) => handleUpdateRiga(index, 'parametro_1', parseFloat(e.target.value) || 0)}
                            className="w-12 px-1 py-0.5 text-center border border-gray-300 rounded text-xs focus:ring-1 focus:ring-green-500"
                            title={riga.desc_param_1 || 'Param 1'}
                          />
                          <span className="text-xs text-gray-500">{riga.unita_param_1}</span>
                        </div>
                      )}
                      {/* Parametro 2 */}
                      {riga.costo_var_2 > 0 && (
                        <div className="flex items-center gap-1 bg-gray-100 rounded px-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={riga.parametro_2 || ''}
                            onChange={(e) => handleUpdateRiga(index, 'parametro_2', parseFloat(e.target.value) || 0)}
                            className="w-12 px-1 py-0.5 text-center border border-gray-300 rounded text-xs focus:ring-1 focus:ring-green-500"
                            title={riga.desc_param_2 || 'Param 2'}
                          />
                          <span className="text-xs text-gray-500">{riga.unita_param_2}</span>
                        </div>
                      )}
                      {/* Parametro 3 */}
                      {riga.costo_var_3 > 0 && (
                        <div className="flex items-center gap-1 bg-gray-100 rounded px-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={riga.parametro_3 || ''}
                            onChange={(e) => handleUpdateRiga(index, 'parametro_3', parseFloat(e.target.value) || 0)}
                            className="w-12 px-1 py-0.5 text-center border border-gray-300 rounded text-xs focus:ring-1 focus:ring-green-500"
                            title={riga.desc_param_3 || 'Param 3'}
                          />
                          <span className="text-xs text-gray-500">{riga.unita_param_3}</span>
                        </div>
                      )}
                      {/* Parametro 4 */}
                      {riga.costo_var_4 > 0 && (
                        <div className="flex items-center gap-1 bg-gray-100 rounded px-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={riga.parametro_4 || ''}
                            onChange={(e) => handleUpdateRiga(index, 'parametro_4', parseFloat(e.target.value) || 0)}
                            className="w-12 px-1 py-0.5 text-center border border-gray-300 rounded text-xs focus:ring-1 focus:ring-green-500"
                            title={riga.desc_param_4 || 'Param 4'}
                          />
                          <span className="text-xs text-gray-500">{riga.unita_param_4}</span>
                        </div>
                      )}
                      {/* Nessun parametro variabile */}
                      {!riga.costo_var_1 && !riga.costo_var_2 && !riga.costo_var_3 && !riga.costo_var_4 && (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-600 font-mono text-xs">
                    €{riga.costo_base_unitario.toFixed(2)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs">
                    €{riga.prezzo_listino_unitario.toFixed(2)}
                    <div className="text-blue-600 text-xs">+{riga.ricarico_percentuale}%</div>
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs font-medium">
                    €{riga.prezzo_cliente_unitario.toFixed(2)}
                    {riga.sconto_cliente > 0 && (
                      <div className="text-green-600 text-xs">-{riga.sconto_cliente}%</div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-bold text-green-700 font-mono">
                    €{riga.prezzo_totale_cliente.toFixed(2)}
                  </td>
                  <td className="px-3 py-3">
                    <button
                      onClick={() => handleDeleteRiga(riga)}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Nessun articolo nel preventivo
          </h3>
          <p className="text-gray-600">
            Cerca un articolo nella barra sopra per aggiungerlo
          </p>
        </div>
      )}

      {/* Legenda calcolo prezzi */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Calculator className="w-5 h-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-2">Logica calcolo prezzo:</p>
            <div className="grid grid-cols-3 gap-4 text-blue-700">
              <div>
                <span className="font-medium">1. Costo Base</span><br/>
                Fisso + Σ(Var<sub>i</sub> × Param<sub>i</sub>)
              </div>
              <div>
                <span className="font-medium">2. Listino</span><br/>
                Costo × (1 + Ricarico%)
              </div>
              <div>
                <span className="font-medium">3. Cliente</span><br/>
                Listino × (1 - Sconto%)
              </div>
            </div>
            <p className="mt-2 text-xs text-blue-600">
              Fino a 4 parametri variabili per articolo (es: fermate, metri cavo, kg, ore)
            </p>
            {isAdmin && (
              <p className="mt-1 text-purple-700">
                <Lock className="w-4 h-4 inline mr-1" />
                Lo <strong>sconto extra admin</strong> viene applicato sul totale finale del preventivo.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
