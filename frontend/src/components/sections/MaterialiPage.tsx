import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, Package, Loader2, Trash2, Plus, Search, PenLine, X, Check, Clock, AlertTriangle, CheckCircle, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface MaterialiPageProps {
  preventivoId: number;
  clienteId?: number | null;
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
  lead_time_giorni: number;
  manodopera_giorni: number;
}

interface Articolo {
  id: number;
  codice: string;
  descrizione: string;
  prezzo_listino: number;
  categoria?: string;
  lead_time_giorni: number;
  manodopera_giorni: number;
}

interface Cliente {
  id: number;
  ragione_sociale: string;
  aliquota_iva: number;
}

interface DatiCommessa {
  data_consegna_richiesta?: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const inputClass = "w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors text-sm";

// Funzione per aggiungere giorni lavorativi (esclude sabato e domenica)
function addWorkingDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      added++;
    }
  }
  return result;
}

// Formatta data in italiano
function formatDate(date: Date): string {
  return date.toLocaleDateString('it-IT', { 
    weekday: 'short', 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
}

export function MaterialiPage({ preventivoId, clienteId }: MaterialiPageProps) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [addMode, setAddMode] = useState<'search' | 'manual'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArticolo, setSelectedArticolo] = useState<Articolo | null>(null);
  
  const [manualForm, setManualForm] = useState({
    codice: '',
    descrizione: '',
    quantita: 1,
    prezzo_unitario: 0,
    categoria: '',
    lead_time_giorni: 0,
    manodopera_giorni: 0
  });

  // Query materiali
  const { data: materiali = [], isLoading: loadingMateriali } = useQuery({
    queryKey: ['materiali', preventivoId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/materiali`);
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 3000,
  });

  // Query dati commessa per data consegna
  const { data: datiCommessa } = useQuery({
    queryKey: ['dati-commessa', preventivoId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/dati-commessa`);
      if (!res.ok) return null;
      return res.json();
    },
  });

  // Query cliente per IVA
  const { data: cliente } = useQuery({
    queryKey: ['cliente', clienteId],
    queryFn: async () => {
      if (!clienteId) return null;
      const res = await fetch(`${API_BASE}/clienti/${clienteId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!clienteId,
  });

  // Query articoli per ricerca
  const { data: articoliSearch = [] } = useQuery({
    queryKey: ['articoli-search', searchQuery],
    queryFn: async () => {
      if (searchQuery.length < 2) return [];
      const res = await fetch(`${API_BASE}/articoli?search=${encodeURIComponent(searchQuery)}&limit=10`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: searchQuery.length >= 2,
  });

  // Calcolo Lead Time
  const leadTimeAnalysis = useMemo(() => {
    if (!materiali || materiali.length === 0) {
      return {
        maxLeadTime: 0,
        dataFornituraMinima: new Date(),
        materialiCritici: [],
        isOk: true
      };
    }

    // Calcola lead time totale per ogni materiale
    const materialiConLeadTime = materiali.map((m: Materiale) => ({
      ...m,
      leadTimeTotale: (m.lead_time_giorni || 0) + (m.manodopera_giorni || 0)
    }));

    // Trova il lead time massimo
    const maxLeadTime = Math.max(...materialiConLeadTime.map(m => m.leadTimeTotale), 0);
    
    // Calcola data fornitura minima
    const oggi = new Date();
    const dataFornituraMinima = addWorkingDays(oggi, maxLeadTime);

    // Trova materiali critici (quelli con lead time = max)
    const materialiCritici = materialiConLeadTime.filter(m => m.leadTimeTotale === maxLeadTime && maxLeadTime > 0);

    // Verifica rispetto a data richiesta
    let isOk = true;
    let dataRichiesta: Date | null = null;
    
    if (datiCommessa?.data_consegna_richiesta) {
      dataRichiesta = new Date(datiCommessa.data_consegna_richiesta);
      isOk = dataFornituraMinima <= dataRichiesta;
    }

    return {
      maxLeadTime,
      dataFornituraMinima,
      materialiCritici,
      materialiConLeadTime,
      isOk,
      dataRichiesta
    };
  }, [materiali, datiCommessa]);

  // Mutation per aggiungere materiale
  const addMutation = useMutation({
    mutationFn: async (data: Partial<Materiale>) => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/materiali`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          aggiunto_da_regola: false,
          regola_id: null
        }),
      });
      if (!res.ok) throw new Error('Errore aggiunta materiale');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materiali', preventivoId] });
      toast.success('Materiale aggiunto');
      resetForm();
    },
    onError: () => {
      toast.error('Errore nell\'aggiunta del materiale');
    }
  });

  // Mutation per eliminare
  const deleteMutation = useMutation({
    mutationFn: async (materialeId: number) => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}/materiali/${materialeId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Errore eliminazione');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materiali', preventivoId] });
      toast.success('Materiale eliminato');
    }
  });

  const resetForm = () => {
    setShowAddForm(false);
    setSearchQuery('');
    setSelectedArticolo(null);
    setManualForm({ codice: '', descrizione: '', quantita: 1, prezzo_unitario: 0, categoria: '', lead_time_giorni: 0, manodopera_giorni: 0 });
  };

  const handleAddFromArticolo = () => {
    if (!selectedArticolo) return;
    addMutation.mutate({
      codice: selectedArticolo.codice,
      descrizione: selectedArticolo.descrizione,
      quantita: 1,
      prezzo_unitario: selectedArticolo.prezzo_listino,
      categoria: selectedArticolo.categoria || 'DA CATALOGO',
      lead_time_giorni: selectedArticolo.lead_time_giorni || 0,
      manodopera_giorni: selectedArticolo.manodopera_giorni || 0,
    });
  };

  const handleAddManual = () => {
    if (!manualForm.codice || !manualForm.descrizione) {
      toast.error('Inserisci codice e descrizione');
      return;
    }
    addMutation.mutate({
      codice: manualForm.codice,
      descrizione: manualForm.descrizione,
      quantita: manualForm.quantita,
      prezzo_unitario: manualForm.prezzo_unitario,
      categoria: manualForm.categoria || 'INSERIMENTO MANUALE',
      lead_time_giorni: manualForm.lead_time_giorni,
      manodopera_giorni: manualForm.manodopera_giorni,
    });
  };

  // Separazione materiali
  const materialiAutomatici = materiali.filter((m: Materiale) => m.aggiunto_da_regola);
  const materialiManuali = materiali.filter((m: Materiale) => !m.aggiunto_da_regola);

  // Calcoli
  const aliquotaIva = cliente?.aliquota_iva || 22;
  const totaleImponibile = materiali.reduce((acc: number, m: Materiale) => acc + (m.prezzo_unitario * m.quantita), 0);
  const totaleIva = totaleImponibile * (aliquotaIva / 100);
  const totaleFinale = totaleImponibile + totaleIva;

  if (loadingMateriali) {
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
    <div className="space-y-6">
      {/* Header con totali */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Materiali</h3>
                <p className="text-sm text-blue-100">
                  {materialiAutomatici.length} automatici + {materialiManuali.length} manuali
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              Aggiungi Materiale
            </button>
          </div>
        </div>

        {/* Riepilogo */}
        <div className="px-6 py-4 bg-gray-50 border-b grid grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500 uppercase font-semibold">Imponibile</div>
            <div className="text-lg font-bold text-gray-900">€{totaleImponibile.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase font-semibold">IVA ({aliquotaIva}%)</div>
            <div className="text-lg font-bold text-gray-900">€{totaleIva.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase font-semibold">Totale</div>
            <div className="text-xl font-bold text-blue-600">€{totaleFinale.toFixed(2)}</div>
          </div>
          <div className="text-right">
            {cliente ? (
              <div className="text-xs text-gray-500">
                Cliente: <span className="font-semibold">{cliente.ragione_sociale}</span>
              </div>
            ) : (
              <div className="text-xs text-amber-600">⚠️ Nessun cliente - IVA default 22%</div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== PANNELLO LEAD TIME ==================== */}
      <div className={`rounded-lg shadow overflow-hidden ${leadTimeAnalysis.isOk ? 'bg-green-50 border-2 border-green-300' : 'bg-red-50 border-2 border-red-300'}`}>
        <div className={`px-6 py-4 flex items-center justify-between ${leadTimeAnalysis.isOk ? 'bg-green-100' : 'bg-red-100'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${leadTimeAnalysis.isOk ? 'bg-green-500' : 'bg-red-500'}`}>
              {leadTimeAnalysis.isOk ? <CheckCircle className="w-6 h-6 text-white" /> : <AlertTriangle className="w-6 h-6 text-white" />}
            </div>
            <div>
              <h4 className={`font-bold ${leadTimeAnalysis.isOk ? 'text-green-800' : 'text-red-800'}`}>
                {leadTimeAnalysis.isOk ? '✅ Lead Time OK' : '❌ Lead Time NON RISPETTATO'}
              </h4>
              <p className={`text-sm ${leadTimeAnalysis.isOk ? 'text-green-600' : 'text-red-600'}`}>
                Tempo massimo di fornitura: <strong>{leadTimeAnalysis.maxLeadTime} giorni lavorativi</strong>
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className={`text-xs uppercase font-semibold ${leadTimeAnalysis.isOk ? 'text-green-600' : 'text-red-600'}`}>
              Data fornitura minima
            </div>
            <div className={`text-lg font-bold ${leadTimeAnalysis.isOk ? 'text-green-800' : 'text-red-800'}`}>
              {formatDate(leadTimeAnalysis.dataFornituraMinima)}
            </div>
          </div>
        </div>
        
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 gap-6">
            {/* Data richiesta */}
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-gray-500" />
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Data consegna richiesta</div>
                <div className="font-semibold">
                  {leadTimeAnalysis.dataRichiesta 
                    ? formatDate(leadTimeAnalysis.dataRichiesta)
                    : <span className="text-amber-600">Non specificata (vai a Dati Commessa)</span>
                  }
                </div>
              </div>
            </div>
            
            {/* Lead time */}
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-gray-500" />
              <div>
                <div className="text-xs text-gray-500 uppercase font-semibold">Lead Time massimo BOM</div>
                <div className="font-semibold">{leadTimeAnalysis.maxLeadTime} giorni lavorativi</div>
              </div>
            </div>
          </div>
          
          {/* Materiali critici */}
          {!leadTimeAnalysis.isOk && leadTimeAnalysis.materialiCritici.length > 0 && (
            <div className="mt-4 p-4 bg-red-100 rounded-lg border border-red-300">
              <p className="text-sm font-semibold text-red-800 mb-2">
                ⚠️ Materiali che causano il ritardo:
              </p>
              <ul className="space-y-1">
                {leadTimeAnalysis.materialiCritici.map((m: any) => (
                  <li key={m.id} className="text-sm text-red-700 flex items-center gap-2">
                    <span className="font-mono font-bold">{m.codice}</span>
                    <span>-</span>
                    <span>{m.descrizione}</span>
                    <span className="ml-auto font-semibold">
                      {m.lead_time_giorni || 0} + {m.manodopera_giorni || 0} = {m.leadTimeTotale} gg
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Form aggiunta materiale */}
      {showAddForm && (
        <div className="bg-white rounded-lg shadow overflow-hidden border-2 border-blue-200">
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
            <h4 className="font-semibold text-blue-800 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Aggiungi Materiale
            </h4>
            <button onClick={resetForm} className="text-gray-500 hover:text-gray-700">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Tab modalità */}
          <div className="px-6 py-3 bg-gray-50 border-b flex gap-2">
            <button
              onClick={() => setAddMode('search')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                addMode === 'search' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Search className="w-4 h-4 inline mr-2" />
              Cerca da Articoli
            </button>
            <button
              onClick={() => setAddMode('manual')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                addMode === 'manual' ? 'bg-purple-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
              }`}
            >
              <PenLine className="w-4 h-4 inline mr-2" />
              Inserimento Manuale
            </button>
          </div>

          <div className="p-6">
            {addMode === 'search' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cerca articolo (codice o descrizione)
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Digita almeno 2 caratteri..."
                    className={inputClass}
                  />
                </div>
                
                {articoliSearch.length > 0 && (
                  <div className="border rounded-lg max-h-48 overflow-y-auto">
                    {articoliSearch.map((art: Articolo) => (
                      <div
                        key={art.id}
                        onClick={() => setSelectedArticolo(art)}
                        className={`p-3 cursor-pointer hover:bg-blue-50 border-b last:border-b-0 ${
                          selectedArticolo?.id === art.id ? 'bg-blue-100' : ''
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-mono font-semibold text-blue-600">{art.codice}</span>
                            <span className="ml-2 text-gray-700">{art.descrizione}</span>
                            {(art.lead_time_giorni > 0 || art.manodopera_giorni > 0) && (
                              <span className="ml-2 text-xs text-gray-500">
                                (LT: {art.lead_time_giorni || 0} + {art.manodopera_giorni || 0} gg)
                              </span>
                            )}
                          </div>
                          <span className="font-semibold">€{art.prezzo_listino?.toFixed(2) || '0.00'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {selectedArticolo && (
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-green-800">Selezionato:</span>
                        <span className="ml-2">{selectedArticolo.codice} - {selectedArticolo.descrizione}</span>
                      </div>
                      <button
                        onClick={handleAddFromArticolo}
                        disabled={addMutation.isPending}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                      >
                        {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Aggiungi
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Codice *</label>
                    <input
                      type="text"
                      value={manualForm.codice}
                      onChange={(e) => setManualForm({...manualForm, codice: e.target.value})}
                      placeholder="Es: MAN-001"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Categoria</label>
                    <input
                      type="text"
                      value={manualForm.categoria}
                      onChange={(e) => setManualForm({...manualForm, categoria: e.target.value})}
                      placeholder="Es: Accessori"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Descrizione *</label>
                  <input
                    type="text"
                    value={manualForm.descrizione}
                    onChange={(e) => setManualForm({...manualForm, descrizione: e.target.value})}
                    placeholder="Descrizione materiale"
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Quantità</label>
                    <input
                      type="number"
                      min="1"
                      value={manualForm.quantita}
                      onChange={(e) => setManualForm({...manualForm, quantita: parseInt(e.target.value) || 1})}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Prezzo (€)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualForm.prezzo_unitario}
                      onChange={(e) => setManualForm({...manualForm, prezzo_unitario: parseFloat(e.target.value) || 0})}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Lead Time (gg)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={manualForm.lead_time_giorni}
                      onChange={(e) => setManualForm({...manualForm, lead_time_giorni: parseInt(e.target.value) || 0})}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Manodopera (gg)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={manualForm.manodopera_giorni}
                      onChange={(e) => setManualForm({...manualForm, manodopera_giorni: parseInt(e.target.value) || 0})}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleAddManual}
                    disabled={addMutation.isPending}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2"
                  >
                    {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PenLine className="w-4 h-4" />}
                    Aggiungi Manualmente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Materiali Automatici */}
      {materialiAutomatici.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-600" />
            <span className="font-semibold text-amber-800">Materiali Automatici (Rule Engine)</span>
            <span className="text-sm text-amber-600">({materialiAutomatici.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Codice</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Descrizione</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Q.tà</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Prezzo</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Lead Time</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Regola</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materialiAutomatici.map((m: Materiale) => {
                  const lt = (m.lead_time_giorni || 0) + (m.manodopera_giorni || 0);
                  return (
                    <tr key={m.id} className="hover:bg-amber-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Zap className="w-3 h-3 text-amber-500" />
                          <span className="font-mono text-sm font-semibold text-gray-800">{m.codice}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{m.descrizione}</td>
                      <td className="px-4 py-3 text-center text-sm">{m.quantita}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold">€{(m.prezzo_unitario * m.quantita).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded ${lt > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                          {m.lead_time_giorni || 0} + {m.manodopera_giorni || 0} = {lt} gg
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                          <Zap className="w-3 h-3" />
                          {m.regola_id?.replace('RULE_', '').replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Materiali Manuali */}
      {materialiManuali.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-3 bg-purple-50 border-b border-purple-200 flex items-center gap-2">
            <PenLine className="w-5 h-5 text-purple-600" />
            <span className="font-semibold text-purple-800">Materiali Manuali</span>
            <span className="text-sm text-purple-600">({materialiManuali.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Codice</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Descrizione</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Q.tà</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600 uppercase">Prezzo</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Lead Time</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {materialiManuali.map((m: Materiale) => {
                  const lt = (m.lead_time_giorni || 0) + (m.manodopera_giorni || 0);
                  return (
                    <tr key={m.id} className="hover:bg-purple-50/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <PenLine className="w-3 h-3 text-purple-500" />
                          <span className="font-mono text-sm font-semibold text-gray-800">{m.codice}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{m.descrizione}</td>
                      <td className="px-4 py-3 text-center text-sm">{m.quantita}</td>
                      <td className="px-4 py-3 text-right text-sm font-bold">€{(m.prezzo_unitario * m.quantita).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded ${lt > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                          {m.lead_time_giorni || 0} + {m.manodopera_giorni || 0} = {lt} gg
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => deleteMutation.mutate(m.id)}
                          className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Messaggio se vuoto */}
      {materiali.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-600 text-lg font-medium">Nessun materiale</p>
          <p className="text-gray-500 text-sm mt-2">
            Configura l'argano o le normative per aggiungere materiali automaticamente,
            oppure clicca "Aggiungi Materiale" per inserirne uno manualmente.
          </p>
        </div>
      )}

      {/* Legenda */}
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <div className="flex items-start gap-3">
          <Clock className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Come funziona il Lead Time</p>
            <ul className="text-xs space-y-1 text-blue-700">
              <li>• <strong>Lead Time</strong> = giorni lavorativi per approvvigionamento del materiale</li>
              <li>• <strong>Manodopera</strong> = giorni lavorativi per lavorazione/assemblaggio</li>
              <li>• <strong>Lead Time Totale</strong> = Lead Time + Manodopera</li>
              <li>• <strong>Lead Time BOM</strong> = MAX(Lead Time Totale) di tutti i materiali</li>
              <li>• <strong>Data Fornitura Minima</strong> = Oggi + Lead Time BOM (esclusi sabato/domenica)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
