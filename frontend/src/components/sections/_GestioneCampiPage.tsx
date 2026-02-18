import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Plus, 
  Trash2, 
  Save, 
  X, 
  ChevronDown, 
  ChevronRight,
  Settings,
  Edit2,
  Check,
  AlertCircle,
  Database,
  FileJson,
  Download,
  Copy
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const API_BASE = 'http://localhost:8000';

interface Campo {
  id: number;
  codice: string;
  etichetta: string;
  tipo: string;
  sezione: string;
  gruppo_dropdown?: string;
  unita_misura?: string;
  valore_min?: number;
  valore_max?: number;
  valore_default?: string;
  descrizione?: string;
  obbligatorio: boolean;
  ordine: number;
  attivo: boolean;
  visibile_form: boolean;
  usabile_regole: boolean;
  opzioni?: { value: string; label: string }[];
}

interface SezioneInfo {
  codice: string;
  etichetta: string;
  totale: number;
  attivi: number;
}

const TIPI_CAMPO = [
  { value: 'testo', label: 'Testo' },
  { value: 'numero', label: 'Numero' },
  { value: 'booleano', label: 'Booleano (Sì/No)' },
  { value: 'dropdown', label: 'Dropdown (scelta)' },
  { value: 'data', label: 'Data' },
];

const SEZIONI_DISPONIBILI = [
  { value: 'dati_commessa', label: 'Dati Commessa' },
  { value: 'dati_principali', label: 'Dati Principali' },
  { value: 'tensioni', label: 'Tensioni' },
  { value: 'normative', label: 'Normative' },
  { value: 'argano', label: 'Argano / Trazione' },
  { value: 'porte_lato_a', label: 'Porte Lato A' },
  { value: 'operatore_a', label: 'Operatore Porte A' },
  { value: 'porte_lato_b', label: 'Porte Lato B' },
  { value: 'cabina', label: 'Cabina' },
  { value: 'vano', label: 'Vano' },
  { value: 'quadro', label: 'Quadro Elettrico' },
];

export default function GestioneCampiPage() {
  const { toast } = useToast();
  const [sezioni, setSezioni] = useState<SezioneInfo[]>([]);
  const [selectedSezione, setSelectedSezione] = useState<string | null>(null);
  const [campi, setCampi] = useState<Campo[]>([]);
  const [gruppiDropdown, setGruppiDropdown] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<Campo>>({});
  const [newCampo, setNewCampo] = useState<Partial<Campo> | null>(null);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [jsonSchema, setJsonSchema] = useState<any>(null);

  useEffect(() => {
    fetchSezioni();
    fetchGruppiDropdown();
  }, []);

  useEffect(() => {
    if (selectedSezione) {
      fetchCampi(selectedSezione);
    }
  }, [selectedSezione]);

  const fetchSezioni = async () => {
    try {
      const response = await fetch(`${API_BASE}/campi-configuratore/sezioni`);
      const data = await response.json();
      setSezioni(data);
      setLoading(false);
    } catch (error) {
      console.error('Errore caricamento sezioni:', error);
      toast({ title: 'Errore', description: 'Impossibile caricare le sezioni', variant: 'destructive' });
    }
  };

  const fetchCampi = async (sezione: string) => {
    try {
      const response = await fetch(`${API_BASE}/campi-configuratore/${sezione}?solo_attivi=false`);
      const data = await response.json();
      setCampi(data);
    } catch (error) {
      console.error('Errore caricamento campi:', error);
    }
  };

  const fetchGruppiDropdown = async () => {
    try {
      const response = await fetch(`${API_BASE}/opzioni-dropdown/gruppi`);
      const data = await response.json();
      setGruppiDropdown(data.map((g: any) => g.gruppo));
    } catch (error) {
      console.error('Errore caricamento gruppi:', error);
    }
  };

  const fetchJsonSchema = async () => {
    try {
      const response = await fetch(`${API_BASE}/campi-configuratore/schema.json`);
      const data = await response.json();
      setJsonSchema(data);
      setShowJsonPreview(true);
    } catch (error) {
      toast({ title: 'Errore', description: 'Impossibile caricare schema', variant: 'destructive' });
    }
  };

  const handleEdit = (campo: Campo) => {
    setEditingId(campo.id);
    setEditForm(campo);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    
    try {
      const response = await fetch(`${API_BASE}/campi-configuratore/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      
      if (!response.ok) throw new Error('Errore salvataggio');
      
      toast({ title: '✅ Salvato', description: 'Campo aggiornato' });
      setEditingId(null);
      setEditForm({});
      if (selectedSezione) fetchCampi(selectedSezione);
      fetchSezioni();
    } catch (error) {
      toast({ title: 'Errore', description: 'Impossibile salvare', variant: 'destructive' });
    }
  };

  const handleToggleAttivo = async (campo: Campo) => {
    const newState = !campo.attivo;
    
    try {
      const response = await fetch(`${API_BASE}/campi-configuratore/${campo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attivo: newState }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || `HTTP ${response.status}`);
      }
      
      toast({ 
        title: newState ? '✅ Attivato' : '⏸️ Disattivato', 
        description: `Campo "${campo.etichetta}" ${newState ? 'attivato' : 'disattivato'}` 
      });
      
      if (selectedSezione) fetchCampi(selectedSezione);
      fetchSezioni();
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
    }
  };

  const handleToggleObbligatorio = async (campo: Campo) => {
    const newState = !campo.obbligatorio;
    
    try {
      const response = await fetch(`${API_BASE}/campi-configuratore/${campo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obbligatorio: newState }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || `HTTP ${response.status}`);
      }
      
      toast({ 
        title: newState ? '⚠️ Obbligatorio' : '○ Opzionale', 
        description: `Campo "${campo.etichetta}" ora è ${newState ? 'obbligatorio' : 'opzionale'}` 
      });
      
      if (selectedSezione) fetchCampi(selectedSezione);
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
    }
  };

  const handleToggleRegole = async (campo: Campo) => {
    const newState = !campo.usabile_regole;
    
    try {
      const response = await fetch(`${API_BASE}/campi-configuratore/${campo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usabile_regole: newState }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || `HTTP ${response.status}`);
      }
      
      toast({ 
        title: newState ? '✓ Usabile in regole' : '✗ Non usabile', 
        description: `Campo "${campo.etichetta}" ${newState ? 'ora appare' : 'non appare più'} nel Rule Designer` 
      });
      
      if (selectedSezione) fetchCampi(selectedSezione);
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo campo? Le regole che lo usano potrebbero non funzionare più.')) return;
    
    try {
      const response = await fetch(`${API_BASE}/campi-configuratore/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Errore eliminazione');
      
      toast({ title: '✅ Eliminato', description: 'Campo rimosso' });
      if (selectedSezione) fetchCampi(selectedSezione);
      fetchSezioni();
    } catch (error) {
      toast({ title: 'Errore', description: 'Impossibile eliminare', variant: 'destructive' });
    }
  };

  const handleStartNew = () => {
    if (!selectedSezione) {
      toast({ title: 'Attenzione', description: 'Seleziona prima una sezione', variant: 'destructive' });
      return;
    }
    setNewCampo({
      codice: `${selectedSezione}.custom_`,  // Prefisso custom_ per campi personalizzati
      etichetta: '',
      tipo: 'testo',
      sezione: selectedSezione,
      obbligatorio: false,
      ordine: campi.length,
      attivo: true,
      visibile_form: true,
      usabile_regole: true,
    });
  };

  const handleSaveNew = async () => {
    if (!newCampo?.codice || !newCampo?.etichetta || !newCampo?.tipo) {
      toast({ title: 'Errore', description: 'Compila codice, etichetta e tipo', variant: 'destructive' });
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE}/campi-configuratore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCampo),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Errore');
      }
      
      toast({ title: '✅ Creato', description: 'Nuovo campo aggiunto' });
      setNewCampo(null);
      if (selectedSezione) fetchCampi(selectedSezione);
      fetchSezioni();
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
    }
  };

  const copyJsonToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(jsonSchema, null, 2));
    toast({ title: '✅ Copiato', description: 'JSON copiato negli appunti' });
  };

  const downloadJson = async () => {
    try {
      const response = await fetch(`${API_BASE}/campi-configuratore/schema.json`);
      const data = await response.json();
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'schema_configuratore.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({ title: '✅ Salvato', description: 'File JSON scaricato' });
    } catch (error) {
      toast({ title: 'Errore', description: 'Impossibile scaricare schema', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Database className="h-6 w-6" />
            Gestione Campi Configuratore
          </h1>
          <p className="text-gray-600 mt-1">
            Definisci i campi del modulo d'ordine per il Rule Designer
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadJson} className="gap-2">
            <Download className="h-4 w-4" />
            Salva JSON
          </Button>
          <Button variant="outline" onClick={fetchJsonSchema} className="gap-2">
            <FileJson className="h-4 w-4" />
            Anteprima JSON
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Lista Sezioni */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Sezioni</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {sezioni.map((s) => (
                <div
                  key={s.codice}
                  className={`px-4 py-3 cursor-pointer transition-colors ${
                    selectedSezione === s.codice 
                      ? 'bg-blue-50 border-l-4 border-blue-500' 
                      : 'hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedSezione(s.codice)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{s.etichetta}</span>
                    <Badge variant="secondary" className="text-xs">
                      {s.attivi}/{s.totale}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{s.codice}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Dettaglio Campi */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-lg">
              {selectedSezione 
                ? SEZIONI_DISPONIBILI.find(s => s.value === selectedSezione)?.label || selectedSezione
                : 'Seleziona una sezione'
              }
            </CardTitle>
            {selectedSezione && (
              <div className="flex gap-2">
                {campi.some(c => !c.attivo) && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={async () => {
                      const inattivi = campi.filter(c => !c.attivo);
                      for (const campo of inattivi) {
                        await fetch(`${API_BASE}/campi-configuratore/${campo.id}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ attivo: true }),
                        });
                      }
                      toast({ title: '✅ Attivati', description: `${inattivi.length} campi attivati` });
                      fetchCampi(selectedSezione);
                      fetchSezioni();
                    }}
                  >
                    Attiva Tutti ({campi.filter(c => !c.attivo).length})
                  </Button>
                )}
                <Button size="sm" onClick={handleStartNew} disabled={newCampo !== null}>
                  <Plus className="h-4 w-4 mr-1" />
                  Nuovo Campo
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {!selectedSezione ? (
              <div className="text-center py-12 text-gray-500">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Seleziona una sezione dalla lista</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Form nuovo campo */}
                {newCampo && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-sm font-medium text-green-800 mb-3">Nuovo Campo Personalizzato</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="col-span-2">
                        <Label className="text-xs">Etichetta <span className="text-red-500">*</span></Label>
                        <Input
                          value={newCampo.etichetta || ''}
                          onChange={(e) => {
                            const etichetta = e.target.value;
                            const nomeCampo = etichetta.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                            // Auto-genera codice se ancora al prefisso base
                            const basePrefix = `${selectedSezione}.custom_`;
                            const currentCodice = newCampo.codice || '';
                            const shouldUpdateCodice = currentCodice === basePrefix || 
                              currentCodice === `${basePrefix}${newCampo.etichetta?.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || ''}`;
                            
                            setNewCampo({ 
                              ...newCampo, 
                              etichetta,
                              codice: shouldUpdateCodice ? `${basePrefix}${nomeCampo}` : currentCodice
                            });
                          }}
                          placeholder="es: Tipo Armadio"
                          className="h-8 text-sm"
                          autoFocus
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Codice (auto-generato)</Label>
                        <Input
                          value={newCampo.codice || ''}
                          onChange={(e) => setNewCampo({ ...newCampo, codice: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                          placeholder="sezione.custom_nome_campo"
                          className="h-8 text-sm font-mono bg-gray-50"
                        />
                        <p className="text-xs text-gray-500 mt-1">Il prefisso "custom_" è obbligatorio per i campi personalizzati</p>
                      </div>
                      <div>
                        <Label className="text-xs">Tipo <span className="text-red-500">*</span></Label>
                        <Select
                          value={newCampo.tipo}
                          onValueChange={(v) => setNewCampo({ ...newCampo, tipo: v })}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIPI_CAMPO.map(t => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {newCampo.tipo === 'dropdown' && (
                        <div>
                          <Label className="text-xs">Gruppo Opzioni <span className="text-red-500">*</span></Label>
                          <Select
                            value={newCampo.gruppo_dropdown || ''}
                            onValueChange={(v) => setNewCampo({ ...newCampo, gruppo_dropdown: v })}
                          >
                            <SelectTrigger className="h-8 text-sm">
                              <SelectValue placeholder="Seleziona..." />
                            </SelectTrigger>
                            <SelectContent>
                              {gruppiDropdown.map(g => (
                                <SelectItem key={g} value={g}>{g}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {newCampo.tipo === 'numero' && (
                        <>
                          <div>
                            <Label className="text-xs">Unità</Label>
                            <Input
                              value={newCampo.unita_misura || ''}
                              onChange={(e) => setNewCampo({ ...newCampo, unita_misura: e.target.value })}
                              placeholder="m, kg, kW..."
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Min</Label>
                            <Input
                              type="number"
                              value={newCampo.valore_min || ''}
                              onChange={(e) => setNewCampo({ ...newCampo, valore_min: parseFloat(e.target.value) })}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Max</Label>
                            <Input
                              type="number"
                              value={newCampo.valore_max || ''}
                              onChange={(e) => setNewCampo({ ...newCampo, valore_max: parseFloat(e.target.value) })}
                              className="h-8 text-sm"
                            />
                          </div>
                        </>
                      )}
                      <div className="col-span-2 flex items-end gap-2">
                        <Button size="sm" onClick={handleSaveNew} className="bg-green-600 hover:bg-green-700">
                          <Check className="h-4 w-4 mr-1" />
                          Salva
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setNewCampo(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tabella campi */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Codice</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600">Etichetta</th>
                        <th className="px-3 py-2 text-left font-medium text-gray-600 w-24">Tipo</th>
                        <th className="px-3 py-2 text-center font-medium text-gray-600 w-16">Obbl.</th>
                        <th className="px-3 py-2 text-center font-medium text-gray-600 w-20">Regole</th>
                        <th className="px-3 py-2 text-center font-medium text-gray-600 w-20">Stato</th>
                        <th className="px-3 py-2 text-right font-medium text-gray-600 w-24">Azioni</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {campi.map((campo) => (
                        <tr 
                          key={campo.id} 
                          className={`${!campo.attivo ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}`}
                        >
                          <td className="px-3 py-2">
                            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                              {campo.codice}
                            </code>
                          </td>
                          <td className="px-3 py-2">
                            {editingId === campo.id ? (
                              <Input
                                value={editForm.etichetta || ''}
                                onChange={(e) => setEditForm({ ...editForm, etichetta: e.target.value })}
                                className="h-7 text-sm"
                              />
                            ) : (
                              <div>
                                <span>{campo.etichetta}</span>
                                {campo.obbligatorio && (
                                  <span className="text-red-500 ml-1">*</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {editingId === campo.id ? (
                              <div className="space-y-1">
                                <Select
                                  value={editForm.tipo || campo.tipo}
                                  onValueChange={(v) => setEditForm({ ...editForm, tipo: v })}
                                >
                                  <SelectTrigger className="h-7 text-xs w-28">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {TIPI_CAMPO.map(t => (
                                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {(editForm.tipo || campo.tipo) === 'dropdown' && (
                                  <Select
                                    value={editForm.gruppo_dropdown || campo.gruppo_dropdown || ''}
                                    onValueChange={(v) => setEditForm({ ...editForm, gruppo_dropdown: v })}
                                  >
                                    <SelectTrigger className="h-7 text-xs w-28">
                                      <SelectValue placeholder="Gruppo..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {gruppiDropdown.map(g => (
                                        <SelectItem key={g} value={g}>{g}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            ) : (
                              <>
                                <Badge variant="outline" className="text-xs">
                                  {campo.tipo}
                                  {campo.tipo === 'numero' && campo.unita_misura && (
                                    <span className="text-gray-400 ml-1">({campo.unita_misura})</span>
                                  )}
                                </Badge>
                                {campo.tipo === 'dropdown' && campo.opzioni && (
                                  <span className="text-xs text-gray-400 ml-1">
                                    [{campo.opzioni.length}]
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleObbligatorio(campo)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                                campo.obbligatorio 
                                  ? 'bg-red-500 border-red-500 text-white' 
                                  : 'border-gray-300 hover:border-red-300'
                              }`}
                              title={campo.obbligatorio ? 'Obbligatorio' : 'Opzionale'}
                            >
                              {campo.obbligatorio && <Check className="h-3 w-3" />}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleRegole(campo)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                                campo.usabile_regole 
                                  ? 'bg-green-500 border-green-500 text-white' 
                                  : 'border-gray-300 hover:border-green-300'
                              }`}
                              title={campo.usabile_regole ? 'Usabile in regole' : 'Non usabile in regole'}
                            >
                              {campo.usabile_regole && <Check className="h-3 w-3" />}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleToggleAttivo(campo);
                              }}
                              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                                campo.attivo 
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                              }`}
                            >
                              {campo.attivo ? 'ON' : 'OFF'}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {editingId === campo.id ? (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={handleSaveEdit} className="h-7 w-7 p-0">
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-7 w-7 p-0">
                                  <X className="h-4 w-4 text-gray-400" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex justify-end gap-1">
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  onClick={() => handleEdit(campo)}
                                  className="h-7 w-7 p-0"
                                >
                                  <Edit2 className="h-3.5 w-3.5 text-gray-500" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  onClick={() => handleDelete(campo.id)}
                                  className="h-7 w-7 p-0 hover:text-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      
                      {campi.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                            Nessun campo in questa sezione
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
                <li><strong>Codice:</strong> path univoco del campo (es: <code>normative.en_81_72</code>)</li>
                <li><strong>Tipo dropdown:</strong> collegalo a un gruppo di Gestione Opzioni</li>
                <li><strong>Regole:</strong> se attivo, il campo è disponibile nel Rule Designer</li>
                <li><strong>Stato:</strong> i campi OFF non vengono esportati nello schema JSON</li>
                <li>Il Rule Designer importa i campi da <code>/api/campi-configuratore/schema.json</code></li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal JSON Preview */}
      {showJsonPreview && jsonSchema && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                Schema JSON per Rule Designer
              </h3>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={copyJsonToClipboard}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copia
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowJsonPreview(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-auto">
                {JSON.stringify(jsonSchema, null, 2)}
              </pre>
            </div>
            <div className="p-4 border-t bg-gray-50 text-sm text-gray-600">
              <strong>Endpoint:</strong> <code>GET /api/campi-configuratore/schema.json</code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
