import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Package, Plus, Pencil, Trash2, Loader2, Search, X, Save,
  Calculator, Clock, DollarSign, Tag, Layers
} from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = 'http://localhost:8000/api';

interface Articolo {
  id: number;
  codice: string;
  descrizione: string;
  descrizione_estesa?: string;
  tipo_articolo: string;
  categoria_id?: number;
  costo_fisso: number;
  costo_variabile_1: number;
  unita_misura_var_1?: string;
  descrizione_var_1?: string;
  costo_variabile_2: number;
  unita_misura_var_2?: string;
  descrizione_var_2?: string;
  costo_variabile_3: number;
  unita_misura_var_3?: string;
  descrizione_var_3?: string;
  costo_variabile_4: number;
  unita_misura_var_4?: string;
  descrizione_var_4?: string;
  ricarico_percentuale?: number;
  unita_misura: string;
  lead_time_giorni: number;
  manodopera_giorni: number;
  fornitore?: string;
  codice_fornitore?: string;
  is_active: boolean;
}

interface Categoria {
  id: number;
  codice: string;
  nome: string;
}

const inputClass = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";

const emptyArticolo: Partial<Articolo> = {
  codice: '',
  descrizione: '',
  descrizione_estesa: '',
  tipo_articolo: 'PRODUZIONE',
  costo_fisso: 0,
  costo_variabile_1: 0,
  unita_misura_var_1: '',
  descrizione_var_1: '',
  costo_variabile_2: 0,
  unita_misura_var_2: '',
  descrizione_var_2: '',
  costo_variabile_3: 0,
  unita_misura_var_3: '',
  descrizione_var_3: '',
  costo_variabile_4: 0,
  unita_misura_var_4: '',
  descrizione_var_4: '',
  ricarico_percentuale: 0,
  unita_misura: 'PZ',
  lead_time_giorni: 0,
  manodopera_giorni: 0,
  fornitore: '',
  codice_fornitore: '',
  is_active: true,
};

export function GestioneArticoliPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingArticolo, setEditingArticolo] = useState<Partial<Articolo> | null>(null);
  const [showTestCalcolo, setShowTestCalcolo] = useState(false);
  
  // Parametri per test calcolo
  const [testParams, setTestParams] = useState({
    param1: 0,
    param2: 0,
    param3: 0,
    param4: 0,
  });

  // Query articoli
  const { data: articoli = [], isLoading } = useQuery({
    queryKey: ['articoli-admin', searchQuery],
    queryFn: async () => {
      const url = searchQuery.length >= 2 
        ? `${API_BASE}/articoli?search=${encodeURIComponent(searchQuery)}&limit=100`
        : `${API_BASE}/articoli?limit=100`;
      const res = await fetch(url);
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Query categorie
  const { data: categorie = [] } = useQuery({
    queryKey: ['categorie'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/categorie-articoli`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Mutation salva articolo
  const saveMutation = useMutation({
    mutationFn: async (articolo: Partial<Articolo>) => {
      const isNew = !articolo.id;
      const url = isNew 
        ? `${API_BASE}/articoli`
        : `${API_BASE}/articoli/${articolo.id}`;
      const method = isNew ? 'POST' : 'PUT';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(articolo),
      });
      if (!res.ok) throw new Error('Errore salvataggio');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articoli-admin'] });
      toast.success('Articolo salvato');
      setShowForm(false);
      setEditingArticolo(null);
    },
    onError: () => {
      toast.error('Errore nel salvataggio');
    },
  });

  // Mutation elimina articolo
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/articoli/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Errore eliminazione');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articoli-admin'] });
      toast.success('Articolo eliminato');
    },
  });

  const handleEdit = (articolo: Articolo) => {
    setEditingArticolo(articolo);
    setShowForm(true);
    setShowTestCalcolo(false);
  };

  const handleNew = () => {
    setEditingArticolo({ ...emptyArticolo });
    setShowForm(true);
    setShowTestCalcolo(false);
  };

  const handleSave = () => {
    if (!editingArticolo) return;
    if (!editingArticolo.codice || !editingArticolo.descrizione) {
      toast.error('Codice e descrizione sono obbligatori');
      return;
    }
    saveMutation.mutate(editingArticolo);
  };

  const handleDelete = (id: number) => {
    if (confirm('Eliminare questo articolo?')) {
      deleteMutation.mutate(id);
    }
  };

  // Calcolo costo con parametri
  const calcolaCosto = () => {
    if (!editingArticolo) return 0;
    
    const costoFisso = editingArticolo.costo_fisso || 0;
    const costo1 = (editingArticolo.costo_variabile_1 || 0) * testParams.param1;
    const costo2 = (editingArticolo.costo_variabile_2 || 0) * testParams.param2;
    const costo3 = (editingArticolo.costo_variabile_3 || 0) * testParams.param3;
    const costo4 = (editingArticolo.costo_variabile_4 || 0) * testParams.param4;
    
    const costoBase = costoFisso + costo1 + costo2 + costo3 + costo4;
    const ricarico = editingArticolo.ricarico_percentuale || 0;
    const costoFinale = costoBase * (1 + ricarico / 100);
    
    return { costoBase, costoFinale, dettaglio: { costoFisso, costo1, costo2, costo3, costo4 } };
  };

  const calcoloResult = calcolaCosto();

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <span className="ml-3 text-gray-600">Caricamento articoli...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="w-6 h-6" />
              <div>
                <h2 className="text-xl font-bold">Gestione Articoli</h2>
                <p className="text-sm text-purple-100">{articoli.length} articoli</p>
              </div>
            </div>
            <button
              onClick={handleNew}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Nuovo Articolo
            </button>
          </div>
        </div>

        {/* Ricerca */}
        <div className="p-4 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca per codice o descrizione..."
              className={`${inputClass} pl-10`}
            />
          </div>
        </div>

        {/* Tabella articoli */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Codice</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Descrizione</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Tipo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Costo Fisso</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Lead Time</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {articoli.map((art: Articolo) => (
                <tr key={art.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-blue-600">{art.codice}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{art.descrizione}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      art.tipo_articolo === 'PRODUZIONE' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {art.tipo_articolo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">€{(art.costo_fisso || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-center text-sm">
                    {art.lead_time_giorni || 0} + {art.manodopera_giorni || 0} gg
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleEdit(art)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="Modifica"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(art.id)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title="Elimina"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form modifica/inserimento */}
      {showForm && editingArticolo && (
        <div className="bg-white rounded-lg shadow border-2 border-blue-200">
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
            <h3 className="font-semibold text-blue-800 flex items-center gap-2">
              {editingArticolo.id ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              {editingArticolo.id ? 'Modifica Articolo' : 'Nuovo Articolo'}
            </h3>
            <button onClick={() => { setShowForm(false); setEditingArticolo(null); }} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Dati base */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Codice *</label>
                <input
                  type="text"
                  value={editingArticolo.codice || ''}
                  onChange={(e) => setEditingArticolo({...editingArticolo, codice: e.target.value})}
                  className={inputClass}
                  placeholder="Es: QEL-001"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Descrizione *</label>
                <input
                  type="text"
                  value={editingArticolo.descrizione || ''}
                  onChange={(e) => setEditingArticolo({...editingArticolo, descrizione: e.target.value})}
                  className={inputClass}
                  placeholder="Descrizione articolo"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Tipo Articolo</label>
                <select
                  value={editingArticolo.tipo_articolo || 'PRODUZIONE'}
                  onChange={(e) => setEditingArticolo({...editingArticolo, tipo_articolo: e.target.value})}
                  className={inputClass}
                >
                  <option value="PRODUZIONE">PRODUZIONE</option>
                  <option value="ACQUISTO">ACQUISTO</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Categoria</label>
                <select
                  value={editingArticolo.categoria_id || ''}
                  onChange={(e) => setEditingArticolo({...editingArticolo, categoria_id: parseInt(e.target.value) || undefined})}
                  className={inputClass}
                >
                  <option value="">Nessuna</option>
                  {categorie.map((cat: Categoria) => (
                    <option key={cat.id} value={cat.id}>{cat.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Unità di Misura</label>
                <input
                  type="text"
                  value={editingArticolo.unita_misura || 'PZ'}
                  onChange={(e) => setEditingArticolo({...editingArticolo, unita_misura: e.target.value})}
                  className={inputClass}
                  placeholder="PZ, MT, KG..."
                />
              </div>
            </div>

            {/* Costi e Calcolo */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  Configurazione Costo
                </h4>
                <button
                  onClick={() => setShowTestCalcolo(!showTestCalcolo)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    showTestCalcolo ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Calculator className="w-4 h-4" />
                  Test Calcolo
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <label className={`${labelClass} text-green-700`}>Costo Fisso (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingArticolo.costo_fisso || 0}
                    onChange={(e) => setEditingArticolo({...editingArticolo, costo_fisso: parseFloat(e.target.value) || 0})}
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClass}>Ricarico %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editingArticolo.ricarico_percentuale || 0}
                    onChange={(e) => setEditingArticolo({...editingArticolo, ricarico_percentuale: parseFloat(e.target.value) || 0})}
                    className={inputClass}
                    placeholder="Es: 30"
                  />
                </div>
              </div>

              {/* Parametri variabili */}
              <div className="mt-4 space-y-3">
                <p className="text-sm text-gray-600 font-medium">
                  Formula: <code className="bg-gray-100 px-2 py-0.5 rounded">Costo = Fisso + Σ(Coefficiente × Parametro)</code>
                </p>
                
                {[1, 2, 3, 4].map((n) => {
                  const costoKey = `costo_variabile_${n}` as keyof Articolo;
                  const unitaKey = `unita_misura_var_${n}` as keyof Articolo;
                  const descKey = `descrizione_var_${n}` as keyof Articolo;
                  
                  return (
                    <div key={n} className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-gray-50 rounded-lg">
                      <div>
                        <label className={`${labelClass} text-xs`}>Coefficiente {n} (€)</label>
                        <input
                          type="number"
                          step="0.0001"
                          value={(editingArticolo[costoKey] as number) || 0}
                          onChange={(e) => setEditingArticolo({...editingArticolo, [costoKey]: parseFloat(e.target.value) || 0})}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={`${labelClass} text-xs`}>Unità Misura {n}</label>
                        <input
                          type="text"
                          value={(editingArticolo[unitaKey] as string) || ''}
                          onChange={(e) => setEditingArticolo({...editingArticolo, [unitaKey]: e.target.value})}
                          className={inputClass}
                          placeholder="metro, kg..."
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className={`${labelClass} text-xs`}>Descrizione Param {n}</label>
                        <input
                          type="text"
                          value={(editingArticolo[descKey] as string) || ''}
                          onChange={(e) => setEditingArticolo({...editingArticolo, [descKey]: e.target.value})}
                          className={inputClass}
                          placeholder="Es: Lunghezza cavo"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Test Calcolo Costo */}
            {showTestCalcolo && (
              <div className="border-2 border-amber-300 rounded-lg p-4 bg-amber-50">
                <h4 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
                  <Calculator className="w-5 h-5" />
                  Test Calcolo Costo
                </h4>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[1, 2, 3, 4].map((n) => {
                    const descKey = `descrizione_var_${n}` as keyof Articolo;
                    const desc = (editingArticolo[descKey] as string) || `Parametro ${n}`;
                    return (
                      <div key={n}>
                        <label className={`${labelClass} text-xs text-amber-700`}>{desc}</label>
                        <input
                          type="number"
                          value={testParams[`param${n}` as keyof typeof testParams]}
                          onChange={(e) => setTestParams({...testParams, [`param${n}`]: parseFloat(e.target.value) || 0})}
                          className={`${inputClass} border-amber-300`}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="bg-white rounded-lg p-4 border border-amber-200">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Costo Fisso:</span>
                      <span className="float-right font-mono">€{calcoloResult.dettaglio?.costoFisso.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Variabile 1:</span>
                      <span className="float-right font-mono">€{calcoloResult.dettaglio?.costo1.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Variabile 2:</span>
                      <span className="float-right font-mono">€{calcoloResult.dettaglio?.costo2.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Variabile 3:</span>
                      <span className="float-right font-mono">€{calcoloResult.dettaglio?.costo3.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Variabile 4:</span>
                      <span className="float-right font-mono">€{calcoloResult.dettaglio?.costo4.toFixed(2)}</span>
                    </div>
                    <div className="border-t pt-2">
                      <span className="font-semibold text-gray-700">Costo Base:</span>
                      <span className="float-right font-mono font-semibold">€{calcoloResult.costoBase?.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="border-t mt-3 pt-3 flex justify-between items-center">
                    <span className="font-bold text-lg text-green-700">
                      Prezzo Finale (+{editingArticolo.ricarico_percentuale || 0}%):
                    </span>
                    <span className="font-mono font-bold text-2xl text-green-600">
                      €{calcoloResult.costoFinale?.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Lead Time */}
            <div className="border-t pt-4">
              <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Lead Time
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Lead Time (giorni lavorativi)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingArticolo.lead_time_giorni || 0}
                    onChange={(e) => setEditingArticolo({...editingArticolo, lead_time_giorni: parseInt(e.target.value) || 0})}
                    className={inputClass}
                  />
                  <p className="text-xs text-gray-500 mt-1">Tempo approvvigionamento</p>
                </div>
                <div>
                  <label className={labelClass}>Manodopera (giorni lavorativi)</label>
                  <input
                    type="number"
                    min="0"
                    value={editingArticolo.manodopera_giorni || 0}
                    onChange={(e) => setEditingArticolo({...editingArticolo, manodopera_giorni: parseInt(e.target.value) || 0})}
                    className={inputClass}
                  />
                  <p className="text-xs text-gray-500 mt-1">Tempo lavorazione/assemblaggio</p>
                </div>
              </div>
            </div>

            {/* Fornitore */}
            <div className="border-t pt-4">
              <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Tag className="w-5 h-5 text-purple-600" />
                Fornitore
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Nome Fornitore</label>
                  <input
                    type="text"
                    value={editingArticolo.fornitore || ''}
                    onChange={(e) => setEditingArticolo({...editingArticolo, fornitore: e.target.value})}
                    className={inputClass}
                    placeholder="Es: Elettronica SpA"
                  />
                </div>
                <div>
                  <label className={labelClass}>Codice Fornitore</label>
                  <input
                    type="text"
                    value={editingArticolo.codice_fornitore || ''}
                    onChange={(e) => setEditingArticolo({...editingArticolo, codice_fornitore: e.target.value})}
                    className={inputClass}
                    placeholder="Codice articolo del fornitore"
                  />
                </div>
              </div>
            </div>

            {/* Pulsanti */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => { setShowForm(false); setEditingArticolo(null); }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Annulla
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salva
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GestioneArticoliPage;
