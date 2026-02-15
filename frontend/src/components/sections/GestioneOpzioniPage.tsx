import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Trash2, 
  X, 
  GripVertical,
  Settings,
  Edit2,
  Check,
  AlertCircle,
  Search,
  LayoutGrid,
  List
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const API_BASE = 'http://localhost:8000';

interface Opzione {
  id: number;
  gruppo: string;
  valore: string;
  etichetta: string;
  ordine: number;
  attivo: boolean;
  descrizione?: string;
}

interface GruppoInfo {
  gruppo: string;
  totale: number;
  attive: number;
}

// Mapping gruppi → sezione/pagina (default)
const DEFAULT_GRUPPI_SEZIONE: Record<string, string> = {
  tipo_impianto: 'Dati Principali',
  forza_motrice: 'Dati Principali',
  tensione_luce: 'Dati Principali',
  tensione_manovra: 'Dati Principali',
  tensione_freno: 'Dati Principali',
  trazione: 'Argano',
  tipo_quadro_manovra: 'Dati Principali',
  tipo_ordine: 'Dati Commessa',
  stato_preventivo: 'Dati Commessa',
  pagamento: 'Dati Commessa',
  imballo: 'Dati Commessa',
  trasporto: 'Dati Commessa',
  direttiva: 'Normative',
  tipo_manovra: 'Dati Principali',
  logica_processore: 'Dati Principali',
  porte_cabina: 'Porte',
  porte_piano: 'Porte',
  fornitore_operatore: 'Porte',
  en_81_1_anno: 'Normative',
  en_81_20_anno: 'Normative',
  en_81_21_anno: 'Normative',
};

// Carica mappatura personalizzata da localStorage
const loadGruppiSezione = (): Record<string, string> => {
  try {
    const saved = localStorage.getItem('gruppi_sezione_custom');
    if (saved) {
      return { ...DEFAULT_GRUPPI_SEZIONE, ...JSON.parse(saved) };
    }
  } catch (e) {}
  return { ...DEFAULT_GRUPPI_SEZIONE };
};

// Traduzione nomi gruppi
const GRUPPI_LABELS: Record<string, string> = {
  tipo_impianto: 'Tipo Impianto',
  forza_motrice: 'Forza Motrice',
  tensione_luce: 'Tensione Luce',
  tensione_manovra: 'Tensione Manovra',
  tensione_freno: 'Tensione Freno',
  trazione: 'Tipo Trazione',
  tipo_quadro_manovra: 'Tipo Quadro Manovra',
  tipo_ordine: 'Tipo Ordine',
  stato_preventivo: 'Stato Preventivo',
  pagamento: 'Modalità Pagamento',
  imballo: 'Tipo Imballo',
  trasporto: 'Tipo Trasporto',
  direttiva: 'Direttiva',
  tipo_manovra: 'Tipo Manovra',
  logica_processore: 'Logica Processore',
  porte_cabina: 'Porte Cabina',
  porte_piano: 'Porte Piano',
  fornitore_operatore: 'Fornitore Operatore',
  en_81_1_anno: 'Anno EN 81-1',
  en_81_20_anno: 'Anno EN 81-20',
  en_81_21_anno: 'Anno EN 81-21',
};

const SEZIONI_DISPONIBILI = [
  'Dati Commessa',
  'Dati Principali', 
  'Normative',
  'Argano',
  'Porte',
  'Altro',
];

type SortMode = 'default' | 'alpha' | 'count';
type ViewMode = 'list' | 'grouped';

export default function GestioneOpzioniPage() {
  const { toast } = useToast();
  const [gruppi, setGruppi] = useState<GruppoInfo[]>([]);
  const [selectedGruppo, setSelectedGruppo] = useState<string | null>(null);
  const [opzioni, setOpzioni] = useState<Opzione[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Opzione>>({});
  const [newOpzione, setNewOpzione] = useState<Partial<Opzione> | null>(null);
  
  // Nuovi stati per ricerca e ordinamento
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('default');
  const [viewMode, setViewMode] = useState<ViewMode>('grouped');
  
  // Drag & drop
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  // Nuovo gruppo
  const [showNewGruppo, setShowNewGruppo] = useState(false);
  const [newGruppo, setNewGruppo] = useState({ codice: '', etichetta: '', sezione: 'Altro' });

  // Mappatura gruppi → sezioni (per organizzazione visiva)
  const [gruppiSezione, setGruppiSezione] = useState<Record<string, string>>(loadGruppiSezione);

  const saveGruppoSezione = (codice: string, sezione: string) => {
    const updated = { ...gruppiSezione, [codice]: sezione };
    setGruppiSezione(updated);
    try {
      const custom: Record<string, string> = {};
      for (const [k, v] of Object.entries(updated)) {
        if (DEFAULT_GRUPPI_SEZIONE[k] !== v) custom[k] = v;
      }
      localStorage.setItem('gruppi_sezione_custom', JSON.stringify(custom));
    } catch (e) {}
  };

  useEffect(() => {
    fetchGruppi();
  }, []);

  useEffect(() => {
    if (selectedGruppo) {
      fetchOpzioni(selectedGruppo);
    }
  }, [selectedGruppo]);

  const fetchGruppi = async () => {
    try {
      const response = await fetch(`${API_BASE}/opzioni-dropdown/gruppi`);
      const data = await response.json();
      setGruppi(data);
      setLoading(false);
    } catch (error) {
      console.error('Errore caricamento gruppi:', error);
      toast({ title: 'Errore', description: 'Impossibile caricare i gruppi', variant: 'destructive' });
    }
  };

  const fetchOpzioni = async (gruppo: string) => {
    try {
      const response = await fetch(`${API_BASE}/opzioni-dropdown/${gruppo}?solo_attive=false`);
      const data = await response.json();
      setOpzioni(data);
    } catch (error) {
      console.error('Errore caricamento opzioni:', error);
    }
  };

  const handleCreateGruppo = async () => {
    if (!newGruppo.codice.trim()) {
      toast({ title: 'Errore', description: 'Inserisci un codice per il gruppo', variant: 'destructive' });
      return;
    }

    // Formatta codice
    const codice = newGruppo.codice.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    
    // Controlla se esiste già
    if (gruppi.some(g => g.gruppo === codice)) {
      toast({ title: 'Errore', description: 'Gruppo già esistente', variant: 'destructive' });
      return;
    }

    try {
      // Crea una prima opzione placeholder per creare il gruppo
      const response = await fetch(`${API_BASE}/opzioni-dropdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gruppo: codice,
          valore: 'esempio',
          etichetta: 'Esempio (da modificare)',
          ordine: 0,
          attivo: true,
        }),
      });

      if (!response.ok) throw new Error('Errore creazione');

      // Aggiorna mapping labels e sezioni
      GRUPPI_LABELS[codice] = newGruppo.etichetta || codice;
      saveGruppoSezione(codice, newGruppo.sezione);

      toast({ title: '✅ Creato', description: `Gruppo "${newGruppo.etichetta}" creato` });
      
      setShowNewGruppo(false);
      setNewGruppo({ codice: '', etichetta: '', sezione: 'Altro' });
      fetchGruppi();
      setSelectedGruppo(codice);
    } catch (error) {
      toast({ title: 'Errore', description: 'Impossibile creare il gruppo', variant: 'destructive' });
    }
  };

  // Filtra e ordina gruppi
  const filteredGruppi = useMemo(() => {
    let result = [...gruppi];
    
    // Filtro ricerca
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(g => 
        g.gruppo.toLowerCase().includes(query) ||
        (GRUPPI_LABELS[g.gruppo] || '').toLowerCase().includes(query) ||
        (gruppiSezione[g.gruppo] || '').toLowerCase().includes(query)
      );
    }
    
    // Ordinamento
    if (sortMode === 'alpha') {
      result.sort((a, b) => (GRUPPI_LABELS[a.gruppo] || a.gruppo).localeCompare(GRUPPI_LABELS[b.gruppo] || b.gruppo));
    } else if (sortMode === 'count') {
      result.sort((a, b) => b.totale - a.totale);
    }
    
    return result;
  }, [gruppi, searchQuery, sortMode]);

  // Raggruppa per sezione
  const gruppiPerSezione = useMemo(() => {
    const sezioni: Record<string, GruppoInfo[]> = {};
    
    filteredGruppi.forEach(g => {
      const sezione = gruppiSezione[g.gruppo] || 'Altro';
      if (!sezioni[sezione]) sezioni[sezione] = [];
      sezioni[sezione].push(g);
    });
    
    // Ordina sezioni
    const ordineSezioni = ['Dati Commessa', 'Dati Principali', 'Normative', 'Argano', 'Porte', 'Altro'];
    const result: { sezione: string; gruppi: GruppoInfo[] }[] = [];
    
    ordineSezioni.forEach(s => {
      if (sezioni[s]) {
        result.push({ sezione: s, gruppi: sezioni[s] });
      }
    });
    
    // Aggiungi eventuali sezioni non nell'ordine
    Object.keys(sezioni).forEach(s => {
      if (!ordineSezioni.includes(s)) {
        result.push({ sezione: s, gruppi: sezioni[s] });
      }
    });
    
    return result;
  }, [filteredGruppi, gruppiSezione]);

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault();
    if (draggedId !== id) {
      setDragOverId(id);
    }
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    setDragOverId(null);
    
    if (!draggedId || draggedId === targetId || !selectedGruppo) return;
    
    // Trova indici
    const draggedIndex = opzioni.findIndex(o => o.id === draggedId);
    const targetIndex = opzioni.findIndex(o => o.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Riordina localmente
    const newOpzioni = [...opzioni];
    const [removed] = newOpzioni.splice(draggedIndex, 1);
    newOpzioni.splice(targetIndex, 0, removed);
    
    // Aggiorna ordini
    const ordini = newOpzioni.map((o, index) => ({ id: o.id, ordine: index }));
    
    // Aggiorna UI ottimisticamente
    setOpzioni(newOpzioni.map((o, index) => ({ ...o, ordine: index })));
    
    // Salva su backend
    try {
      await fetch(`${API_BASE}/opzioni-dropdown/${selectedGruppo}/riordina`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ordini),
      });
      toast({ title: '✅ Riordinato', description: 'Ordine salvato' });
    } catch (error) {
      toast({ title: 'Errore', description: 'Impossibile salvare ordine', variant: 'destructive' });
      fetchOpzioni(selectedGruppo); // Ripristina
    }
    
    setDraggedId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleEdit = (opzione: Opzione) => {
    setEditingId(opzione.id);
    setEditForm(opzione);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    
    try {
      const response = await fetch(`${API_BASE}/opzioni-dropdown/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      
      if (!response.ok) throw new Error('Errore salvataggio');
      
      toast({ title: '✅ Salvato', description: 'Opzione aggiornata' });
      
      setEditingId(null);
      setEditForm({});
      if (selectedGruppo) fetchOpzioni(selectedGruppo);
      fetchGruppi();
    } catch (error) {
      toast({ title: 'Errore', description: 'Impossibile salvare', variant: 'destructive' });
    }
  };

  const handleToggleAttivo = async (opzione: Opzione) => {
    try {
      await fetch(`${API_BASE}/opzioni-dropdown/${opzione.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attivo: !opzione.attivo }),
      });
      
      if (selectedGruppo) fetchOpzioni(selectedGruppo);
      fetchGruppi();
    } catch (error) {
      toast({ title: 'Errore', description: 'Impossibile aggiornare stato', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questa opzione?')) return;
    
    try {
      const response = await fetch(`${API_BASE}/opzioni-dropdown/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Errore eliminazione');
      
      toast({ title: '✅ Eliminato', description: 'Opzione rimossa' });
      if (selectedGruppo) fetchOpzioni(selectedGruppo);
      fetchGruppi();
    } catch (error) {
      toast({ title: 'Errore', description: 'Impossibile eliminare', variant: 'destructive' });
    }
  };

  const handleStartNew = (gruppo: string) => {
    setNewOpzione({
      gruppo,
      valore: '',
      etichetta: '',
      ordine: opzioni.length,
      attivo: true,
    });
  };

  const handleSaveNew = async () => {
    console.log('handleSaveNew chiamato', newOpzione);
    
    if (!newOpzione?.valore || !newOpzione?.etichetta) {
      toast({ title: 'Errore', description: 'Compila valore ed etichetta', variant: 'destructive' });
      alert('Compila valore ed etichetta');
      return;
    }
    
    try {
      console.log('Invio richiesta:', JSON.stringify(newOpzione));
      const response = await fetch(`${API_BASE}/opzioni-dropdown`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOpzione),
      });
      
      console.log('Risposta status:', response.status);
      
      if (!response.ok) {
        const err = await response.json();
        console.error('Errore risposta:', err);
        throw new Error(err.detail || 'Errore sconosciuto');
      }
      
      toast({ title: '✅ Creato', description: 'Nuova opzione aggiunta' });
      setNewOpzione(null);
      if (selectedGruppo) fetchOpzioni(selectedGruppo);
      fetchGruppi();
    } catch (error: any) {
      console.error('Errore salvataggio:', error);
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
      alert('Errore: ' + error.message);
    }
  };

  // Render gruppo item
  const renderGruppoItem = (g: GruppoInfo, index: number) => (
    <div
      key={`${g.gruppo}-${index}`}
      className={`px-4 py-3 cursor-pointer transition-colors ${
        selectedGruppo === g.gruppo 
          ? 'bg-blue-50 border-l-4 border-blue-500' 
          : 'hover:bg-gray-50'
      }`}
      onClick={() => setSelectedGruppo(g.gruppo)}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">
          {GRUPPI_LABELS[g.gruppo] || g.gruppo}
        </span>
        <Badge variant="secondary" className="text-xs">
          {g.attive}/{g.totale}
        </Badge>
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{g.gruppo}</div>
    </div>
  );

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Gestione Opzioni Dropdown
        </h1>
        <p className="text-gray-600 mt-1">
          Configura i valori dei menu a tendina utilizzati nei form
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista Gruppi */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Gruppi</CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 text-xs"
                  onClick={() => setShowNewGruppo(true)}
                  title="Crea nuovo gruppo"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Nuovo
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'grouped' ? 'secondary' : 'ghost'}
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode('grouped')}
                  title="Raggruppa per sezione"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  className="h-7 w-7 p-0"
                  onClick={() => setViewMode('list')}
                  title="Lista semplice"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Form Nuovo Gruppo */}
            {showNewGruppo && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg space-y-3">
                <div className="text-sm font-medium text-green-800">Nuovo Gruppo</div>
                <div>
                  <Label className="text-xs">Nome (etichetta)</Label>
                  <Input
                    value={newGruppo.etichetta}
                    onChange={(e) => {
                      const etichetta = e.target.value;
                      setNewGruppo({ 
                        ...newGruppo, 
                        etichetta,
                        codice: etichetta.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
                      });
                    }}
                    placeholder="Es: Tipo Cabina"
                    className="h-8 text-sm"
                    autoFocus
                  />
                </div>
                <div>
                  <Label className="text-xs">Codice (auto)</Label>
                  <Input
                    value={newGruppo.codice}
                    onChange={(e) => setNewGruppo({ ...newGruppo, codice: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    placeholder="tipo_cabina"
                    className="h-8 text-sm font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs">Sezione</Label>
                  <select
                    value={newGruppo.sezione}
                    onChange={(e) => setNewGruppo({ ...newGruppo, sezione: e.target.value })}
                    className="w-full h-8 text-sm border rounded px-2"
                  >
                    <option value="Dati Commessa">Dati Commessa</option>
                    <option value="Dati Principali">Dati Principali</option>
                    <option value="Normative">Normative</option>
                    <option value="Argano">Argano</option>
                    <option value="Porte">Porte</option>
                    <option value="Altro">Altro</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowNewGruppo(false);
                      setNewGruppo({ codice: '', etichetta: '', sezione: 'Altro' });
                    }}
                  >
                    Annulla
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleCreateGruppo}
                    disabled={!newGruppo.codice.trim()}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Crea
                  </Button>
                </div>
              </div>
            )}
            
            {/* Ricerca */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Cerca gruppo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            
            {/* Ordinamento */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-500">Ordina:</span>
              <button
                onClick={() => setSortMode('default')}
                className={`text-xs px-2 py-1 rounded ${sortMode === 'default' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Default
              </button>
              <button
                onClick={() => setSortMode('alpha')}
                className={`text-xs px-2 py-1 rounded ${sortMode === 'alpha' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                A-Z
              </button>
              <button
                onClick={() => setSortMode('count')}
                className={`text-xs px-2 py-1 rounded ${sortMode === 'count' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                # Opzioni
              </button>
            </div>
          </CardHeader>
          
          <CardContent className="p-0 max-h-[60vh] overflow-y-auto">
            {viewMode === 'grouped' ? (
              // Vista raggruppata
              <div>
                {gruppiPerSezione.map(({ sezione, gruppi: gruppiSezione }) => (
                  <div key={sezione}>
                    <div className="px-4 py-2 bg-gray-100 text-xs font-semibold text-gray-600 uppercase tracking-wide sticky top-0">
                      {sezione}
                    </div>
                    <div className="divide-y">
                      {gruppiSezione.map(renderGruppoItem)}
                    </div>
                  </div>
                ))}
                {gruppiPerSezione.length === 0 && (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    Nessun risultato per "{searchQuery}"
                  </div>
                )}
              </div>
            ) : (
              // Vista lista
              <div className="divide-y">
                {filteredGruppi.map(renderGruppoItem)}
                {filteredGruppi.length === 0 && (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    Nessun risultato per "{searchQuery}"
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dettaglio Opzioni */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                {selectedGruppo 
                  ? GRUPPI_LABELS[selectedGruppo] || selectedGruppo
                  : 'Seleziona un gruppo'
                }
              </CardTitle>
              {selectedGruppo && gruppiSezione[selectedGruppo] && (
                <p className="text-xs text-gray-500 mt-1">
                  Usato in: {gruppiSezione[selectedGruppo]}
                </p>
              )}
            </div>
            {selectedGruppo && (
              <Button
                size="sm"
                onClick={() => handleStartNew(selectedGruppo)}
                disabled={newOpzione !== null}
              >
                <Plus className="h-4 w-4 mr-1" />
                Aggiungi
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!selectedGruppo ? (
              <div className="text-center py-12 text-gray-500">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Seleziona un gruppo dalla lista per vedere le opzioni</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Form nuova opzione */}
                {newOpzione && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
                    <div className="text-sm font-medium text-green-800 mb-3">Nuova Opzione</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Valore (DB) <span className="text-red-500">*</span></Label>
                        <Input
                          value={newOpzione.valore || ''}
                          onChange={(e) => setNewOpzione({ ...newOpzione, valore: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                          placeholder="es: verniciato"
                          className={`h-8 text-sm ${!newOpzione.valore ? 'border-red-300' : ''}`}
                          autoFocus
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Etichetta (UI) <span className="text-red-500">*</span></Label>
                        <Input
                          value={newOpzione.etichetta || ''}
                          onChange={(e) => setNewOpzione({ ...newOpzione, etichetta: e.target.value })}
                          placeholder="es: Verniciato"
                          className={`h-8 text-sm ${!newOpzione.etichetta ? 'border-red-300' : ''}`}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Ordine</Label>
                        <Input
                          type="number"
                          value={newOpzione.ordine || 0}
                          onChange={(e) => setNewOpzione({ ...newOpzione, ordine: parseInt(e.target.value) })}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <Button 
                          size="sm" 
                          onClick={handleSaveNew} 
                          className="bg-green-600 hover:bg-green-700"
                          disabled={!newOpzione.valore?.trim() || !newOpzione.etichetta?.trim()}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Salva
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setNewOpzione(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {(!newOpzione.valore?.trim() || !newOpzione.etichetta?.trim()) && (
                      <p className="text-xs text-red-500 mt-2">
                        ⚠️ Compila valore ed etichetta per salvare
                      </p>
                    )}
                  </div>
                )}

                {/* Info drag & drop */}
                {opzioni.length > 1 && (
                  <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <GripVertical className="h-3 w-3" />
                    Trascina le righe per riordinare
                  </div>
                )}

                {/* Tabella opzioni */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 w-8">#</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Valore</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Etichetta</th>
                        <th className="px-3 py-2 text-center font-medium text-gray-600 w-20">Stato</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 w-24">Azioni</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {opzioni.map((opzione) => (
                        <React.Fragment key={opzione.id}>
                        <tr 
                          draggable={editingId !== opzione.id}
                          onDragStart={(e) => handleDragStart(e, opzione.id)}
                          onDragOver={(e) => handleDragOver(e, opzione.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, opzione.id)}
                          onDragEnd={handleDragEnd}
                          className={`
                            ${!opzione.attivo ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'} 
                            ${draggedId === opzione.id ? 'opacity-50 bg-blue-50' : ''}
                            ${dragOverId === opzione.id ? 'border-t-2 border-blue-500' : ''}
                            ${editingId === opzione.id ? 'bg-blue-50' : ''}
                            cursor-move transition-all
                          `}
                        >
                          <td className="px-3 py-2">
                            <GripVertical className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                          </td>
                          <td className="px-3 py-2">
                            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                              {opzione.valore}
                            </code>
                          </td>
                          <td className="px-3 py-2">
                            <span>{opzione.etichetta}</span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => handleToggleAttivo(opzione)}
                              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                opzione.attivo 
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                              }`}
                            >
                              {opzione.attivo ? 'Attivo' : 'Inattivo'}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => editingId === opzione.id ? handleCancelEdit() : handleEdit(opzione)}
                                className="h-7 w-7 p-0"
                              >
                                {editingId === opzione.id ? (
                                  <X className="h-3.5 w-3.5 text-gray-500" />
                                ) : (
                                  <Edit2 className="h-3.5 w-3.5 text-gray-500" />
                                )}
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleDelete(opzione.id)}
                                className="h-7 w-7 p-0 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        
                        {/* Form modifica espanso */}
                        {editingId === opzione.id && (
                          <tr className="bg-blue-50">
                            <td colSpan={5} className="px-3 py-3">
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <Label className="text-xs">Valore (DB)</Label>
                                  <Input
                                    value={editForm.valore || ''}
                                    onChange={(e) => setEditForm({ ...editForm, valore: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                                    className="h-8 text-sm font-mono"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Etichetta (UI)</Label>
                                  <Input
                                    value={editForm.etichetta || ''}
                                    onChange={(e) => setEditForm({ ...editForm, etichetta: e.target.value })}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="flex items-end gap-2">
                                  <Button size="sm" onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-700">
                                    <Check className="h-4 w-4 mr-1" />
                                    Salva
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                                    Annulla
                                  </Button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      ))}
                      
                      {opzioni.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                            Nessuna opzione in questo gruppo
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info box */}
      <Card className="mt-6 bg-blue-50 border-blue-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Come funziona</p>
              <ul className="list-disc ml-4 space-y-1 text-blue-700">
                <li><strong>Valore:</strong> codice salvato nel database (es: <code>gearless_mrl</code>)</li>
                <li><strong>Etichetta:</strong> testo mostrato all'utente nei menu (es: "Gearless MRL")</li>
                <li><strong>Stato:</strong> le opzioni inattive non vengono mostrate nei form</li>
                <li><strong>Riordina:</strong> trascina le righe per cambiare l'ordine di visualizzazione</li>
                <li>Le modifiche sono immediate e si riflettono su tutti i preventivi</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
