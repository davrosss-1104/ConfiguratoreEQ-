import { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Pencil, Trash2, Shield, Copy, ChevronDown, ChevronRight,
  Check, X, Search, Users, Key, Save, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const API_BASE = 'http://localhost:8000';

interface Permesso {
  codice: string;
  categoria: string;
  descrizione: string;
}

interface Ruolo {
  id: number;
  codice: string;
  nome: string;
  descrizione: string | null;
  gruppo_id: number | null;
  gruppo_nome: string | null;
  is_superadmin: boolean;
  n_utenti: number;
  permessi: string[];
  created_at: string | null;
}

interface Gruppo {
  id: number;
  nome: string;
  descrizione: string | null;
  is_admin: boolean;
  n_utenti: number;
  n_ruoli: number;
}

export function GestioneRuoliPage() {
  const [ruoli, setRuoli] = useState<Ruolo[]>([]);
  const [gruppi, setGruppi] = useState<Gruppo[]>([]);
  const [catalogo, setCatalogo] = useState<Permesso[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRuolo, setEditingRuolo] = useState<Ruolo | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showGruppiForm, setShowGruppiForm] = useState(false);
  const [searchPermessi, setSearchPermessi] = useState('');
  const [expandedCategorie, setExpandedCategorie] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    codice: '',
    nome: '',
    descrizione: '',
    gruppo_id: null as number | null,
    is_superadmin: false,
    permessi: [] as string[],
  });

  // Gruppo form state
  const [gruppoForm, setGruppoForm] = useState({
    nome: '',
    descrizione: '',
    editingId: null as number | null,
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [ruoliRes, gruppiRes, catalogoRes] = await Promise.all([
        fetch(`${API_BASE}/ruoli`),
        fetch(`${API_BASE}/gruppi-utenti`),
        fetch(`${API_BASE}/permessi/catalogo`),
      ]);
      if (ruoliRes.ok) setRuoli(await ruoliRes.json());
      if (gruppiRes.ok) setGruppi(await gruppiRes.json());
      if (catalogoRes.ok) setCatalogo(await catalogoRes.json());
    } catch (error) {
      console.error('Errore caricamento:', error);
    } finally {
      setLoading(false);
    }
  };

  // Raggruppa permessi per categoria
  const permessiPerCategoria = useMemo(() => {
    const map = new Map<string, Permesso[]>();
    const filteredCatalogo = catalogo.filter(p => {
      if (!searchPermessi) return true;
      const s = searchPermessi.toLowerCase();
      return p.codice.toLowerCase().includes(s) || 
             p.descrizione.toLowerCase().includes(s) ||
             p.categoria.toLowerCase().includes(s);
    });
    for (const p of filteredCatalogo) {
      if (!map.has(p.categoria)) map.set(p.categoria, []);
      map.get(p.categoria)!.push(p);
    }
    return map;
  }, [catalogo, searchPermessi]);

  const resetForm = () => {
    setFormData({
      codice: '',
      nome: '',
      descrizione: '',
      gruppo_id: null,
      is_superadmin: false,
      permessi: [],
    });
    setEditingRuolo(null);
    setShowForm(false);
  };

  const handleEdit = (ruolo: Ruolo) => {
    setFormData({
      codice: ruolo.codice,
      nome: ruolo.nome,
      descrizione: ruolo.descrizione || '',
      gruppo_id: ruolo.gruppo_id,
      is_superadmin: ruolo.is_superadmin,
      permessi: [...ruolo.permessi],
    });
    setEditingRuolo(ruolo);
    setShowForm(true);
    // Espandi tutte le categorie per vedere i permessi selezionati
    setExpandedCategorie(new Set(catalogo.map(p => p.categoria)));
  };

  const handleSave = async () => {
    if (!formData.codice || !formData.nome) {
      toast({ title: 'Codice e nome obbligatori', variant: 'destructive' });
      return;
    }

    try {
      const url = editingRuolo
        ? `${API_BASE}/ruoli/${editingRuolo.id}`
        : `${API_BASE}/ruoli`;
      
      const res = await fetch(url, {
        method: editingRuolo ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Errore');
      }

      toast({ title: editingRuolo ? '✓ Ruolo aggiornato' : '✓ Ruolo creato' });
      resetForm();
      fetchAll();
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
      fetchAll();
    }
  };

  const handleDelete = async (ruolo: Ruolo) => {
    if (ruolo.n_utenti > 0) {
      toast({ 
        title: 'Impossibile eliminare', 
        description: `${ruolo.n_utenti} utenti con questo ruolo`,
        variant: 'destructive' 
      });
      return;
    }
    if (!confirm(`Eliminare il ruolo "${ruolo.nome}"?`)) return;

    try {
      const res = await fetch(`${API_BASE}/ruoli/${ruolo.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: '✓ Ruolo eliminato' });
        fetchAll();
      }
    } catch {
      toast({ title: 'Errore eliminazione', variant: 'destructive' });
    }
  };

  const handleDuplica = async (ruolo: Ruolo) => {
    try {
      const res = await fetch(`${API_BASE}/ruoli/duplica/${ruolo.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codice: `${ruolo.codice}_copia`,
          nome: `${ruolo.nome} (Copia)`,
        }),
      });
      if (res.ok) {
        toast({ title: '✓ Ruolo duplicato' });
        fetchAll();
      }
    } catch {
      toast({ title: 'Errore duplicazione', variant: 'destructive' });
    }
  };

  const togglePermesso = (codice: string) => {
    setFormData(prev => ({
      ...prev,
      permessi: prev.permessi.includes(codice)
        ? prev.permessi.filter(p => p !== codice)
        : [...prev.permessi, codice],
    }));
  };

  const toggleCategoriaCompleta = (categoria: string) => {
    const permessiCat = catalogo.filter(p => p.categoria === categoria).map(p => p.codice);
    const tuttiSelezionati = permessiCat.every(p => formData.permessi.includes(p));
    
    setFormData(prev => ({
      ...prev,
      permessi: tuttiSelezionati
        ? prev.permessi.filter(p => !permessiCat.includes(p))
        : [...new Set([...prev.permessi, ...permessiCat])],
    }));
  };

  const toggleExpandCategoria = (cat: string) => {
    setExpandedCategorie(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // --- Gruppi ---
  const handleSaveGruppo = async () => {
    if (!gruppoForm.nome.trim()) {
      toast({ title: 'Nome obbligatorio', variant: 'destructive' });
      return;
    }
    try {
      const url = gruppoForm.editingId
        ? `${API_BASE}/gruppi-utenti/${gruppoForm.editingId}`
        : `${API_BASE}/gruppi-utenti`;
      
      const res = await fetch(url, {
        method: gruppoForm.editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: gruppoForm.nome, descrizione: gruppoForm.descrizione }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Errore');
      }

      toast({ title: gruppoForm.editingId ? '✓ Gruppo aggiornato' : '✓ Gruppo creato' });
      setGruppoForm({ nome: '', descrizione: '', editingId: null });
      fetchAll();
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteGruppo = async (gruppo: Gruppo) => {
    if (gruppo.n_utenti > 0) {
      toast({ title: 'Impossibile eliminare', description: `${gruppo.n_utenti} utenti associati`, variant: 'destructive' });
      return;
    }
    if (!confirm(`Eliminare il gruppo "${gruppo.nome}"?`)) return;
    try {
      const res = await fetch(`${API_BASE}/gruppi-utenti/${gruppo.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: '✓ Gruppo eliminato' });
        fetchAll();
      }
    } catch {
      toast({ title: 'Errore', variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Caricamento...</div>;
  }

  return (
    <div className="p-6 space-y-8">
      {/* ==================== GRUPPI ==================== */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              Gruppi
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Organizzazione degli utenti (es. Elettroquadri, Clienti)
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowGruppiForm(!showGruppiForm)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuovo Gruppo
          </Button>
        </div>

        {showGruppiForm && (
          <div className="bg-white border rounded-lg p-4 mb-4">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700">Nome</label>
                <Input
                  value={gruppoForm.nome}
                  onChange={e => setGruppoForm({ ...gruppoForm, nome: e.target.value })}
                  placeholder="Nome gruppo"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium text-gray-700">Descrizione</label>
                <Input
                  value={gruppoForm.descrizione}
                  onChange={e => setGruppoForm({ ...gruppoForm, descrizione: e.target.value })}
                  placeholder="Descrizione"
                />
              </div>
              <Button onClick={handleSaveGruppo}>
                <Save className="h-4 w-4 mr-1" />
                {gruppoForm.editingId ? 'Aggiorna' : 'Crea'}
              </Button>
              <Button variant="outline" onClick={() => {
                setGruppoForm({ nome: '', descrizione: '', editingId: null });
                setShowGruppiForm(false);
              }}>
                Annulla
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {gruppi.map(g => (
            <div key={g.id} className="bg-white border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-900">{g.nome}</h3>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setGruppoForm({ nome: g.nome, descrizione: g.descrizione || '', editingId: g.id });
                      setShowGruppiForm(true);
                    }}
                    className="p-1 text-gray-400 hover:text-blue-600"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteGruppo(g)}
                    className="p-1 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-500 mb-3">{g.descrizione || '—'}</p>
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> {g.n_utenti} utenti
                </span>
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" /> {g.n_ruoli} ruoli
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ==================== RUOLI ==================== */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Shield className="h-5 w-5 text-purple-600" />
              Ruoli
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Ogni ruolo definisce un set di permessi per visibilità e azioni
            </p>
          </div>
          <Button onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Ruolo
          </Button>
        </div>

        {/* Form Ruolo */}
        {showForm && (
          <div className="bg-white border rounded-lg p-5 mb-6">
            <h3 className="font-semibold text-lg mb-4">
              {editingRuolo ? `Modifica: ${editingRuolo.nome}` : 'Nuovo Ruolo'}
            </h3>

            {/* Dati base */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div>
                <label className="text-sm font-medium text-gray-700">Codice *</label>
                <Input
                  value={formData.codice}
                  onChange={e => setFormData({ ...formData, codice: e.target.value.toLowerCase().replace(/\s/g, '_') })}
                  placeholder="commerciale_eq"
                  disabled={!!editingRuolo}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Nome *</label>
                <Input
                  value={formData.nome}
                  onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Commerciale"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Gruppo</label>
                <select
                  value={formData.gruppo_id || ''}
                  onChange={e => setFormData({ ...formData, gruppo_id: e.target.value ? Number(e.target.value) : null })}
                  className="w-full h-10 px-3 border rounded-md text-sm"
                >
                  <option value="">— Nessun gruppo —</option>
                  {gruppi.map(g => (
                    <option key={g.id} value={g.id}>{g.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Descrizione</label>
                <Input
                  value={formData.descrizione}
                  onChange={e => setFormData({ ...formData, descrizione: e.target.value })}
                  placeholder="Descrizione ruolo"
                />
              </div>
            </div>

            {/* Super Admin toggle */}
            <div className="mb-4 flex items-center gap-3">
              <input
                type="checkbox"
                id="is_superadmin"
                checked={formData.is_superadmin}
                onChange={e => setFormData({ ...formData, is_superadmin: e.target.checked })}
                className="h-4 w-4"
              />
              <label htmlFor="is_superadmin" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <Shield className="h-4 w-4 text-red-500" />
                Super Amministratore (tutti i permessi automaticamente)
              </label>
            </div>

            {/* Permessi */}
            {!formData.is_superadmin && (
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-800 flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Permessi ({formData.permessi.length} selezionati)
                  </h4>
                  <div className="relative w-64">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      value={searchPermessi}
                      onChange={e => setSearchPermessi(e.target.value)}
                      placeholder="Cerca permessi..."
                      className="pl-9 h-8 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1 max-h-[450px] overflow-y-auto">
                  {Array.from(permessiPerCategoria.entries()).map(([categoria, permessi]) => {
                    const expanded = expandedCategorie.has(categoria);
                    const selezionati = permessi.filter(p => formData.permessi.includes(p.codice)).length;
                    const tutti = selezionati === permessi.length;
                    
                    return (
                      <div key={categoria} className="border rounded">
                        <button
                          onClick={() => toggleExpandCategoria(categoria)}
                          className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 text-left"
                        >
                          <div className="flex items-center gap-2">
                            {expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                            <span className="font-medium text-sm text-gray-700">{categoria}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${tutti ? 'bg-green-100 text-green-700' : selezionati > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                              {selezionati}/{permessi.length}
                            </span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleCategoriaCompleta(categoria); }}
                            className={`text-xs px-2 py-0.5 rounded ${tutti ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                          >
                            {tutti ? 'Deseleziona tutti' : 'Seleziona tutti'}
                          </button>
                        </button>
                        
                        {expanded && (
                          <div className="px-3 pb-2 space-y-1">
                            {permessi.map(p => {
                              const checked = formData.permessi.includes(p.codice);
                              return (
                                <label
                                  key={p.codice}
                                  className={`flex items-center gap-3 px-2 py-1.5 rounded cursor-pointer text-sm ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => togglePermesso(p.codice)}
                                    className="h-3.5 w-3.5"
                                  />
                                  <span className="font-mono text-xs text-gray-500 min-w-[200px]">{p.codice}</span>
                                  <span className="text-gray-700">{p.descrizione}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Azioni form */}
            <div className="flex gap-2 mt-4">
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-2" />
                {editingRuolo ? 'Salva Modifiche' : 'Crea Ruolo'}
              </Button>
              <Button variant="outline" onClick={resetForm}>Annulla</Button>
            </div>
          </div>
        )}

        {/* Tabella ruoli */}
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ruolo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gruppo</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Permessi</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Utenti</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ruoli.map(ruolo => (
                <tr key={ruolo.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium text-gray-900">{ruolo.nome}</span>
                      <span className="text-xs text-gray-400 ml-2 font-mono">{ruolo.codice}</span>
                    </div>
                    {ruolo.descrizione && (
                      <p className="text-xs text-gray-500 mt-0.5">{ruolo.descrizione}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{ruolo.gruppo_nome || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {ruolo.is_superadmin ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                        <Shield className="h-3 w-3" /> Super Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        Standard
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-medium text-blue-600">
                      {ruolo.is_superadmin ? 'Tutti' : ruolo.permessi.length}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-sm font-medium ${ruolo.n_utenti > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                      {ruolo.n_utenti}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => handleEdit(ruolo)} className="p-1.5 text-gray-400 hover:text-blue-600" title="Modifica">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDuplica(ruolo)} className="p-1.5 text-gray-400 hover:text-purple-600" title="Duplica">
                        <Copy className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(ruolo)} className="p-1.5 text-gray-400 hover:text-red-600" title="Elimina">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {ruoli.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Nessun ruolo definito. Crea il primo ruolo o esegui il seed dei dati iniziali.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info box */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-700">
          <strong>Come funziona:</strong> Ogni utente appartiene a un <strong>Gruppo</strong> (es. Elettroquadri, Clienti) 
          e ha un <strong>Ruolo</strong> che definisce cosa può vedere e fare. I permessi seguono il formato{' '}
          <code className="bg-blue-100 px-1 rounded">risorsa.azione</code> (es. <code className="bg-blue-100 px-1 rounded">sezione.dati_principali.edit</code>).
        </p>
      </div>
    </div>
  );
}

export default GestioneRuoliPage;
