import React, { useState, useEffect, useCallback } from 'react';
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
  ChevronUp,
  Settings,
  Edit2,
  Check,
  AlertCircle,
  Layers,
  Package,
  Link2,
  Unlink,
  Import,
  GripVertical,
  Eye,
  EyeOff,
  ArrowRight,
  LayoutList,
  RefreshCw,
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const API_BASE = 'http://localhost:8000';

// ==========================================
// INTERFACES
// ==========================================

interface Sezione {
  id: number;
  codice: string;
  etichetta: string;
  descrizione?: string;
  icona: string;
  ordine: number;
  attivo: boolean;
  product_template_ids?: number[];
  prodotti?: {
    categoria: string;
    sottocategoria: string;
    nome_display: string;
  }[];
  // Backward compat
  product_template_id?: number | null;
  prodotto?: {
    categoria: string;
    sottocategoria: string;
    nome_display: string;
  } | null;
  num_campi: number;
  num_campi_attivi: number;
}

interface CampoAssociato {
  id: number;
  codice: string;
  etichetta: string;
  tipo: string;
  sezione: string;
  gruppo_dropdown?: string;
  ordine: number;
  attivo: boolean;
  obbligatorio: boolean;
  visibile_form: boolean;
  usabile_regole: boolean;
}

interface ProductTemplate {
  id: number;
  categoria: string;
  sottocategoria: string;
  nome_display: string;
  descrizione?: string;
  attivo: boolean;
}

interface CampoNonAssegnato {
  id: number;
  codice: string;
  etichetta: string;
  tipo: string;
  sezione: string;
  attivo: boolean;
}

// ==========================================
// ICONE DISPONIBILI
// ==========================================
const ICONE_DISPONIBILI = [
  'Settings', 'FileText', 'ScrollText', 'LayoutGrid', 'Cog',
  'Info', 'DoorOpen', 'Package', 'Zap', 'Shield',
  'Gauge', 'Cable', 'CircuitBoard', 'Wrench', 'Layers',
  'Box', 'Monitor', 'Cpu', 'Power', 'Lock',
];

// ==========================================
// COMPONENTE PRINCIPALE
// ==========================================
export default function GestioneSezioniPage() {
  const { toast } = useToast();

  // State
  const [sezioni, setSezioni] = useState<Sezione[]>([]);
  const [templates, setTemplates] = useState<ProductTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSezione, setSelectedSezione] = useState<Sezione | null>(null);
  const [campiSezione, setCampiSezione] = useState<CampoAssociato[]>([]);
  const [campiNonAssegnati, setCampiNonAssegnati] = useState<CampoNonAssegnato[]>([]);
  const [showCampiNonAssegnati, setShowCampiNonAssegnati] = useState(false);

  // Editing state
  const [editingSezione, setEditingSezione] = useState<Partial<Sezione> | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // ==========================================
  // DATA LOADING
  // ==========================================
  useEffect(() => {
    fetchSezioni();
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (selectedSezione) {
      fetchCampiSezione(selectedSezione.id);
    }
  }, [selectedSezione]);

  const fetchSezioni = async () => {
    try {
      const res = await fetch(`${API_BASE}/sezioni-configuratore`);
      const data = await res.json();
      setSezioni(data);
      setLoading(false);
      // Notifica la Sidebar di aggiornarsi
      window.dispatchEvent(new Event('sezioni-updated'));
    } catch (error) {
      console.error('Errore caricamento sezioni:', error);
      toast({ title: 'Errore', description: 'Impossibile caricare le sezioni', variant: 'destructive' });
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_BASE}/templates/all`);
      const data = await res.json();
      setTemplates(data);
    } catch (error) {
      console.error('Errore caricamento templates:', error);
    }
  };

  const fetchCampiSezione = async (sezioneId: number) => {
    try {
      const res = await fetch(`${API_BASE}/sezioni-configuratore/${sezioneId}`);
      const data = await res.json();
      setCampiSezione(data.campi || []);
    } catch (error) {
      console.error('Errore caricamento campi sezione:', error);
    }
  };

  const fetchCampiNonAssegnati = async () => {
    try {
      const res = await fetch(`${API_BASE}/sezioni-configuratore/campi-non-assegnati`);
      const data = await res.json();
      setCampiNonAssegnati(data);
    } catch (error) {
      console.error('Errore caricamento campi non assegnati:', error);
    }
  };

  // ==========================================
  // CRUD OPERATIONS
  // ==========================================
  const handleCreate = () => {
    setIsCreating(true);
    setEditingSezione({
      codice: '',
      etichetta: '',
      descrizione: '',
      icona: 'Settings',
      attivo: true,
      product_template_ids: [],
    });
    setSelectedSezione(null);
  };

  const handleEdit = (sezione: Sezione) => {
    setEditingSezione({ ...sezione });
    setIsCreating(false);
  };

  const handleCancelEdit = () => {
    setEditingSezione(null);
    setIsCreating(false);
  };

  const handleSave = async () => {
    if (!editingSezione) return;
    if (!editingSezione.codice || !editingSezione.etichetta) {
      toast({ title: 'Errore', description: 'Codice e etichetta sono obbligatori', variant: 'destructive' });
      return;
    }

    try {
      const url = isCreating
        ? `${API_BASE}/sezioni-configuratore`
        : `${API_BASE}/sezioni-configuratore/${editingSezione.id}`;
      const method = isCreating ? 'POST' : 'PUT';

      const body: any = {
        codice: editingSezione.codice,
        etichetta: editingSezione.etichetta,
        descrizione: editingSezione.descrizione || null,
        icona: editingSezione.icona || 'Settings',
        attivo: editingSezione.attivo ?? true,
        product_template_ids: editingSezione.product_template_ids || [],
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      toast({
        title: isCreating ? '✅ Sezione creata' : '✅ Sezione aggiornata',
        description: `"${editingSezione.etichetta}" ${isCreating ? 'creata' : 'aggiornata'} con successo`,
      });

      setEditingSezione(null);
      setIsCreating(false);
      await fetchSezioni();

      // Se abbiamo aggiornato la sezione selezionata, ri-selezionala
      if (!isCreating && selectedSezione?.id === editingSezione.id) {
        const updated = (await (await fetch(`${API_BASE}/sezioni-configuratore`)).json())
          .find((s: Sezione) => s.id === editingSezione.id);
        if (updated) setSelectedSezione(updated);
      }
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (sezione: Sezione) => {
    if (!confirm(`Eliminare la sezione "${sezione.etichetta}"?\n\nI campi associati rimarranno con il codice sezione "${sezione.codice}" ma non saranno più collegati.`)) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/sezioni-configuratore/${sezione.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Errore eliminazione');

      toast({ title: '🗑️ Eliminata', description: `Sezione "${sezione.etichetta}" eliminata` });
      if (selectedSezione?.id === sezione.id) {
        setSelectedSezione(null);
        setCampiSezione([]);
      }
      await fetchSezioni();
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
    }
  };

  const handleToggleAttivo = async (sezione: Sezione) => {
    try {
      await fetch(`${API_BASE}/sezioni-configuratore/${sezione.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attivo: !sezione.attivo }),
      });
      toast({
        title: sezione.attivo ? '⏸️ Disattivata' : '✅ Attivata',
        description: `"${sezione.etichetta}" ${sezione.attivo ? 'disattivata' : 'attivata'}`,
      });
      await fetchSezioni();
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
    }
  };

  // ==========================================
  // ORDINE
  // ==========================================
  const handleMoveUp = async (index: number) => {
    if (index === 0) return;
    const newOrder = [...sezioni];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setSezioni(newOrder);

    try {
      await fetch(`${API_BASE}/sezioni-configuratore/riordina`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: newOrder.map(s => s.id) }),
      });
    } catch (error) {
      await fetchSezioni(); // rollback
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index === sezioni.length - 1) return;
    const newOrder = [...sezioni];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setSezioni(newOrder);

    try {
      await fetch(`${API_BASE}/sezioni-configuratore/riordina`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: newOrder.map(s => s.id) }),
      });
    } catch (error) {
      await fetchSezioni();
    }
  };

  // ==========================================
  // IMPORTA SEZIONI ESISTENTI
  // ==========================================
  const handleImportaEsistenti = async () => {
    try {
      const res = await fetch(`${API_BASE}/sezioni-configuratore/importa-esistenti`, { method: 'POST' });
      const data = await res.json();
      toast({
        title: '📥 Importazione completata',
        description: `${data.importate} sezioni importate su ${data.totale_trovate} trovate`,
      });
      await fetchSezioni();
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
    }
  };

  // ==========================================
  // ASSOCIA CAMPI
  // ==========================================
  const handleAssociaCampo = async (campoId: number) => {
    if (!selectedSezione) return;
    try {
      await fetch(`${API_BASE}/sezioni-configuratore/${selectedSezione.id}/associa-campi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campo_ids: [campoId] }),
      });
      toast({ title: '✅ Campo associato', description: 'Campo spostato nella sezione' });
      await fetchCampiSezione(selectedSezione.id);
      await fetchCampiNonAssegnati();
      await fetchSezioni();
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
    }
  };

  // ==========================================
  // HELPERS
  // ==========================================
  const getTemplateLabel = (tpl: ProductTemplate) =>
    `${tpl.categoria} › ${tpl.nome_display || tpl.sottocategoria}`;

  const templatesByCategoria = templates.reduce<Record<string, ProductTemplate[]>>((acc, t) => {
    if (!acc[t.categoria]) acc[t.categoria] = [];
    acc[t.categoria].push(t);
    return acc;
  }, {});

  // ==========================================
  // RENDER
  // ==========================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="mt-2 text-gray-600">Caricamento sezioni...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="h-6 w-6 text-blue-600" />
            Gestione Sezioni
          </h2>
          <p className="text-gray-500 mt-1">
            Configura le sezioni del preventivo, associale ai prodotti e gestisci i campi
          </p>
        </div>
        <div className="flex gap-2">
          {sezioni.length === 0 && (
            <Button variant="outline" onClick={handleImportaEsistenti} className="gap-2">
              <Import className="h-4 w-4" />
              Importa da campi esistenti
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              window.dispatchEvent(new Event('sezioni-updated'));
              toast({ title: 'Sidebar aggiornata', description: 'Le sezioni nella sidebar sono state aggiornate' });
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Aggiorna Sidebar
          </Button>
          <Button onClick={handleCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuova Sezione
          </Button>
        </div>
      </div>

      {/* Info badge */}
      <div className="flex gap-4 text-sm">
        <Badge variant="outline" className="gap-1">
          <Layers className="h-3 w-3" /> {sezioni.length} sezioni
        </Badge>
        <Badge variant="outline" className="gap-1 text-green-700 border-green-300">
          <Eye className="h-3 w-3" /> {sezioni.filter(s => s.attivo).length} attive
        </Badge>
        <Badge variant="outline" className="gap-1 text-purple-700 border-purple-300">
          <Link2 className="h-3 w-3" /> {sezioni.filter(s => s.product_template_ids && s.product_template_ids.length > 0).length} con prodotto
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ==========================================
            COLONNA SINISTRA: Lista sezioni
            ========================================== */}
        <div className="lg:col-span-1 space-y-3">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Sezioni</h3>
          
          {sezioni.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center">
                <Layers className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-2">Nessuna sezione configurata</p>
                <p className="text-sm text-gray-400 mb-4">
                  Crea una nuova sezione o importa quelle esistenti dai campi
                </p>
                <div className="flex gap-2 justify-center">
                  <Button size="sm" onClick={handleCreate}>
                    <Plus className="h-4 w-4 mr-1" /> Crea
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleImportaEsistenti}>
                    <Import className="h-4 w-4 mr-1" /> Importa
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            sezioni.map((sezione, index) => (
              <Card
                key={sezione.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedSezione?.id === sezione.id
                    ? 'ring-2 ring-blue-500 border-blue-500'
                    : sezione.attivo
                    ? 'hover:border-blue-300'
                    : 'opacity-60 border-dashed'
                }`}
                onClick={() => {
                  setSelectedSezione(sezione);
                  setEditingSezione(null);
                  setIsCreating(false);
                }}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    {/* Ordine controls */}
                    <div className="flex flex-col gap-0.5 pt-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMoveUp(index); }}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        disabled={index === 0}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMoveDown(index); }}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        disabled={index === sezioni.length - 1}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Contenuto */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">{sezione.etichetta}</span>
                        {!sezione.attivo && (
                          <Badge variant="outline" className="text-xs bg-gray-100">off</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 font-mono">{sezione.codice}</p>
                      
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {sezione.prodotti && sezione.prodotti.length > 0 ? (
                          sezione.prodotti.map((p, i) => (
                            <Badge key={i} variant="outline" className="text-xs gap-1 text-blue-700 border-blue-200 bg-blue-50">
                              <Package className="h-3 w-3" />
                              {p.categoria} &rsaquo; {p.nome_display || p.sottocategoria}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="text-xs text-gray-400 border-gray-200">
                            <Unlink className="h-3 w-3 mr-1" /> Nessun prodotto
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                        <span>{sezione.num_campi_attivi}/{sezione.num_campi} campi</span>
                      </div>
                    </div>

                    {/* Azioni */}
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(sezione); }}
                        className="p-1 text-gray-400 hover:text-blue-600 rounded"
                        title="Modifica"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleAttivo(sezione); }}
                        className="p-1 text-gray-400 hover:text-yellow-600 rounded"
                        title={sezione.attivo ? 'Disattiva' : 'Attiva'}
                      >
                        {sezione.attivo ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(sezione); }}
                        className="p-1 text-gray-400 hover:text-red-600 rounded"
                        title="Elimina"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* ==========================================
            COLONNA DESTRA: Dettaglio / Form editing
            ========================================== */}
        <div className="lg:col-span-2 space-y-4">
          {/* FORM CREAZIONE/MODIFICA */}
          {editingSezione && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  {isCreating ? (
                    <><Plus className="h-5 w-5 text-blue-600" /> Nuova Sezione</>
                  ) : (
                    <><Edit2 className="h-5 w-5 text-blue-600" /> Modifica Sezione</>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Codice */}
                  <div>
                    <Label className="text-sm font-medium">Codice (identificativo univoco)</Label>
                    <Input
                      value={editingSezione.codice || ''}
                      onChange={(e) => setEditingSezione({ ...editingSezione, codice: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                      placeholder="es: dati_principali"
                      className="mt-1 font-mono"
                    />
                    <p className="text-xs text-gray-400 mt-1">Solo lettere, numeri e underscore</p>
                  </div>

                  {/* Etichetta */}
                  <div>
                    <Label className="text-sm font-medium">Etichetta (nome visibile)</Label>
                    <Input
                      value={editingSezione.etichetta || ''}
                      onChange={(e) => setEditingSezione({ ...editingSezione, etichetta: e.target.value })}
                      placeholder="es: Dati Principali"
                      className="mt-1"
                    />
                  </div>
                </div>

                {/* Descrizione */}
                <div>
                  <Label className="text-sm font-medium">Descrizione</Label>
                  <Input
                    value={editingSezione.descrizione || ''}
                    onChange={(e) => setEditingSezione({ ...editingSezione, descrizione: e.target.value })}
                    placeholder="Descrizione opzionale della sezione"
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Icona */}
                  <div>
                    <Label className="text-sm font-medium">Icona</Label>
                    <Select
                      value={editingSezione.icona || 'Settings'}
                      onValueChange={(v) => setEditingSezione({ ...editingSezione, icona: v })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ICONE_DISPONIBILI.map(icon => (
                          <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Attivo */}
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer pb-2">
                      <Checkbox
                        checked={editingSezione.attivo ?? true}
                        onCheckedChange={(checked) => setEditingSezione({ ...editingSezione, attivo: !!checked })}
                      />
                      <span className="text-sm font-medium">Sezione attiva</span>
                    </label>
                  </div>
                </div>

                {/* Associazione Prodotti (multipla) */}
                <div>
                  <Label className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-600" />
                    Prodotti associati
                  </Label>
                  <div className="mt-2 border rounded-lg max-h-48 overflow-y-auto">
                    {Object.entries(templatesByCategoria).map(([cat, tpls]) => (
                      <div key={cat}>
                        <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase bg-gray-50 border-b sticky top-0">
                          {cat}
                        </div>
                        {tpls.map(tpl => {
                          const isChecked = (editingSezione.product_template_ids || []).includes(tpl.id);
                          return (
                            <label
                              key={tpl.id}
                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-blue-50 border-b last:border-b-0 ${isChecked ? 'bg-blue-50/50' : ''}`}
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const current = editingSezione.product_template_ids || [];
                                  const next = checked
                                    ? [...current, tpl.id]
                                    : current.filter(id => id !== tpl.id);
                                  setEditingSezione({ ...editingSezione, product_template_ids: next });
                                }}
                              />
                              <span className="text-sm">
                                {tpl.nome_display || tpl.sottocategoria}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  {(editingSezione.product_template_ids || []).length > 0 && (
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-blue-600">
                        {(editingSezione.product_template_ids || []).length} prodotti selezionati
                      </p>
                      <button
                        type="button"
                        onClick={() => setEditingSezione({ ...editingSezione, product_template_ids: [] })}
                        className="text-xs text-gray-400 hover:text-red-500"
                      >
                        Deseleziona tutti
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    Questa sezione apparira' solo per i preventivi dei prodotti selezionati. Se nessuno, apparira' per tutti.
                  </p>
                </div>

                {/* Azioni */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button onClick={handleSave} className="gap-2">
                    <Save className="h-4 w-4" />
                    {isCreating ? 'Crea Sezione' : 'Salva Modifiche'}
                  </Button>
                  <Button variant="outline" onClick={handleCancelEdit} className="gap-2">
                    <X className="h-4 w-4" />
                    Annulla
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* DETTAGLIO SEZIONE SELEZIONATA */}
          {selectedSezione && !editingSezione && (
            <>
              {/* Info sezione */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <LayoutList className="h-5 w-5 text-blue-600" />
                      Campi in "{selectedSezione.etichetta}"
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          fetchCampiNonAssegnati();
                          setShowCampiNonAssegnati(!showCampiNonAssegnati);
                        }}
                        className="gap-1 text-xs"
                      >
                        {showCampiNonAssegnati ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                        {showCampiNonAssegnati ? 'Chiudi' : 'Aggiungi campi'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fetchCampiSezione(selectedSezione.id)}
                        className="gap-1 text-xs"
                      >
                        <RefreshCw className="h-3 w-3" /> Aggiorna
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Prodotti associati */}
                  {selectedSezione.prodotti && selectedSezione.prodotti.length > 0 && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 text-sm mb-1">
                        <Package className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-blue-800">
                          Prodotti associati:
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {selectedSezione.prodotti.map((p, i) => (
                          <Badge key={i} variant="outline" className="text-xs text-blue-700 border-blue-200">
                            {p.categoria} &rsaquo; {p.nome_display || p.sottocategoria}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lista campi */}
                  {campiSezione.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <LayoutList className="h-10 w-10 mx-auto mb-2 opacity-50" />
                      <p>Nessun campo in questa sezione</p>
                      <p className="text-sm mt-1">Usa "Aggiungi campi" per spostare campi qui</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {campiSezione.map((campo) => (
                        <div
                          key={campo.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                            campo.attivo
                              ? 'bg-white border-gray-200 hover:border-gray-300'
                              : 'bg-gray-50 border-dashed border-gray-200 opacity-60'
                          }`}
                        >
                          <GripVertical className="h-4 w-4 text-gray-300" />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-gray-800">{campo.etichetta}</span>
                              <Badge variant="outline" className="text-xs">{campo.tipo}</Badge>
                              {campo.obbligatorio && (
                                <Badge className="text-xs bg-red-100 text-red-700 border-red-200">obbl.</Badge>
                              )}
                              {campo.usabile_regole && (
                                <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200">regole</Badge>
                              )}
                              {!campo.attivo && (
                                <Badge variant="outline" className="text-xs bg-gray-100">off</Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-400 font-mono">{campo.codice}</p>
                          </div>
                          
                          {campo.gruppo_dropdown && (
                            <Badge variant="outline" className="text-xs text-gray-500">
                              📋 {campo.gruppo_dropdown}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* CAMPI NON ASSEGNATI */}
              {showCampiNonAssegnati && (
                <Card className="border-amber-200 bg-amber-50/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                      <AlertCircle className="h-5 w-5" />
                      Campi non associati a sezioni registrate ({campiNonAssegnati.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {campiNonAssegnati.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-4">
                        Tutti i campi sono associati a sezioni registrate ✅
                      </p>
                    ) : (
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {campiNonAssegnati.map((campo) => (
                          <div
                            key={campo.id}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-blue-300 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{campo.etichetta}</span>
                                <Badge variant="outline" className="text-xs">{campo.tipo}</Badge>
                                {campo.sezione && (
                                  <Badge variant="outline" className="text-xs text-amber-700 bg-amber-50">
                                    da: {campo.sezione}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 font-mono">{campo.codice}</p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleAssociaCampo(campo.id)}
                              className="gap-1 text-xs shrink-0"
                            >
                              <ArrowRight className="h-3 w-3" />
                              Sposta qui
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Placeholder quando niente è selezionato */}
          {!selectedSezione && !editingSezione && (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <Layers className="h-16 w-16 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">Seleziona una sezione</p>
                <p className="text-sm text-gray-400 mt-2">
                  Scegli una sezione dalla lista a sinistra per vederne i dettagli e i campi associati
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
