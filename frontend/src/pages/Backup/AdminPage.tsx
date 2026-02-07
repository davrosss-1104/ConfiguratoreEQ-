import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Package, Users, Settings, Plus, Search, Edit2, Trash2, 
  Save, X, ChevronDown, ChevronRight, Loader2
} from 'lucide-react';

const API_BASE = 'http://localhost:8000/api';

// ==========================================
// TYPES
// ==========================================
interface Articolo {
  id: number;
  codice: string;
  descrizione: string;
  tipo_articolo: string;
  categoria_id: number | null;
  costo_fisso: number;
  costo_variabile: number;
  unita_misura_variabile: string | null;
  ricarico_percentuale: number | null;
  unita_misura: string;
  is_active: boolean;
}

interface Cliente {
  id: number;
  codice: string;
  ragione_sociale: string;
  partita_iva: string | null;
  citta: string | null;
  provincia: string | null;
  sconto_globale: number;
  sconto_produzione: number;
  sconto_acquisto: number;
  pagamento_default: string | null;
  is_active: boolean;
}

interface Categoria {
  id: number;
  codice: string;
  nome: string;
}

type TabType = 'articoli' | 'clienti' | 'parametri';

// ==========================================
// COMPONENTE PRINCIPALE
// ==========================================
export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>('articoli');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Amministrazione</h1>
          <p className="text-gray-600 text-sm mt-1">Gestione anagrafica articoli, clienti e parametri sistema</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-6 mt-6">
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('articoli')}
            className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'articoli'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Package className="w-5 h-5" />
            Articoli
          </button>
          <button
            onClick={() => setActiveTab('clienti')}
            className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'clienti'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Users className="w-5 h-5" />
            Clienti
          </button>
          <button
            onClick={() => setActiveTab('parametri')}
            className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'parametri'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Settings className="w-5 h-5" />
            Parametri
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'articoli' && <ArticoliTab />}
        {activeTab === 'clienti' && <ClientiTab />}
        {activeTab === 'parametri' && <ParametriTab />}
      </div>
    </div>
  );
}

// ==========================================
// TAB ARTICOLI
// ==========================================
function ArticoliTab() {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: articoli, isLoading } = useQuery({
    queryKey: ['admin-articoli', search],
    queryFn: async () => {
      const url = search 
        ? `${API_BASE}/articoli/search?q=${encodeURIComponent(search)}&limit=100`
        : `${API_BASE}/articoli?limit=100`;
      const res = await fetch(url);
      return res.json();
    }
  });

  const { data: categorie } = useQuery({
    queryKey: ['categorie'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/categorie-articoli`);
      return res.json();
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (articolo: Partial<Articolo>) => {
      const method = articolo.id ? 'PUT' : 'POST';
      const url = articolo.id ? `${API_BASE}/articoli/${articolo.id}` : `${API_BASE}/articoli`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(articolo)
      });
      if (!res.ok) throw new Error('Errore salvataggio');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-articoli'] });
      setEditingId(null);
      setShowForm(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/articoli/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Errore eliminazione');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-articoli'] });
    }
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca articoli..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Nuovo Articolo
        </button>
      </div>

      {/* Form nuovo/modifica */}
      {showForm && (
        <ArticoloForm
          categorie={categorie || []}
          onSave={(data) => saveMutation.mutate(data)}
          onCancel={() => setShowForm(false)}
          isLoading={saveMutation.isPending}
        />
      )}

      {/* Tabella */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Codice</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Descrizione</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">Tipo</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Costo Fisso</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Costo Var.</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">Ricarico</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">UM</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(articoli || []).map((art: Articolo) => (
                <tr key={art.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <code className="font-mono font-semibold text-blue-700">{art.codice}</code>
                  </td>
                  <td className="px-4 py-3 text-sm">{art.descrizione}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      art.tipo_articolo === 'PRODUZIONE' 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {art.tipo_articolo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">€{Number(art.costo_fisso).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {Number(art.costo_variabile) > 0 
                      ? `€${Number(art.costo_variabile).toFixed(2)}/${art.unita_misura_variabile || 'u'}`
                      : '-'
                    }
                  </td>
                  <td className="px-4 py-3 text-center">
                    {art.ricarico_percentuale ? `${art.ricarico_percentuale}%` : '-'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm">{art.unita_misura}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => setEditingId(art.id)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Eliminare questo articolo?')) {
                            deleteMutation.mutate(art.id);
                          }
                        }}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
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
      )}
    </div>
  );
}

// Form Articolo
function ArticoloForm({ 
  articolo, 
  categorie, 
  onSave, 
  onCancel,
  isLoading 
}: { 
  articolo?: Articolo;
  categorie: Categoria[];
  onSave: (data: Partial<Articolo>) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    codice: articolo?.codice || '',
    descrizione: articolo?.descrizione || '',
    tipo_articolo: articolo?.tipo_articolo || 'PRODUZIONE',
    categoria_id: articolo?.categoria_id || null,
    costo_fisso: articolo?.costo_fisso || 0,
    costo_variabile: articolo?.costo_variabile || 0,
    unita_misura_variabile: articolo?.unita_misura_variabile || '',
    ricarico_percentuale: articolo?.ricarico_percentuale || null,
    unita_misura: articolo?.unita_misura || 'PZ',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ id: articolo?.id, ...formData });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Codice *</label>
          <input
            type="text"
            required
            value={formData.codice}
            onChange={(e) => setFormData({ ...formData, codice: e.target.value.toUpperCase() })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
          <select
            value={formData.tipo_articolo}
            onChange={(e) => setFormData({ ...formData, tipo_articolo: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option value="PRODUZIONE">PRODUZIONE</option>
            <option value="ACQUISTO">ACQUISTO</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descrizione *</label>
        <input
          type="text"
          required
          value={formData.descrizione}
          onChange={(e) => setFormData({ ...formData, descrizione: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Costo Fisso (€)</label>
          <input
            type="number"
            step="0.01"
            value={formData.costo_fisso}
            onChange={(e) => setFormData({ ...formData, costo_fisso: parseFloat(e.target.value) || 0 })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Costo Variabile (€)</label>
          <input
            type="number"
            step="0.01"
            value={formData.costo_variabile}
            onChange={(e) => setFormData({ ...formData, costo_variabile: parseFloat(e.target.value) || 0 })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">UM Variabile</label>
          <input
            type="text"
            placeholder="es: metro"
            value={formData.unita_misura_variabile || ''}
            onChange={(e) => setFormData({ ...formData, unita_misura_variabile: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ricarico %</label>
          <input
            type="number"
            step="0.1"
            placeholder="Default sistema"
            value={formData.ricarico_percentuale || ''}
            onChange={(e) => setFormData({ ...formData, ricarico_percentuale: parseFloat(e.target.value) || null })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 border rounded-lg hover:bg-gray-50"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salva
        </button>
      </div>
    </form>
  );
}

// ==========================================
// TAB CLIENTI
// ==========================================
function ClientiTab() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: clienti, isLoading } = useQuery({
    queryKey: ['admin-clienti', search],
    queryFn: async () => {
      const url = search 
        ? `${API_BASE}/clienti/search?q=${encodeURIComponent(search)}`
        : `${API_BASE}/clienti`;
      const res = await fetch(url);
      return res.json();
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (cliente: Partial<Cliente>) => {
      const method = cliente.id ? 'PUT' : 'POST';
      const url = cliente.id ? `${API_BASE}/clienti/${cliente.id}` : `${API_BASE}/clienti`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cliente)
      });
      if (!res.ok) throw new Error('Errore salvataggio');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clienti'] });
      setShowForm(false);
    }
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca clienti..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
          />
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Nuovo Cliente
        </button>
      </div>

      {/* Form nuovo */}
      {showForm && (
        <ClienteForm
          onSave={(data) => saveMutation.mutate(data)}
          onCancel={() => setShowForm(false)}
          isLoading={saveMutation.isPending}
        />
      )}

      {/* Tabella */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Codice</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Ragione Sociale</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">P.IVA</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Città</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">Sconto Prod.</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">Sconto Acq.</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Pagamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {(clienti || []).map((cli: Cliente) => (
                <tr key={cli.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <code className="font-mono font-semibold text-green-700">{cli.codice}</code>
                  </td>
                  <td className="px-4 py-3 font-medium">{cli.ragione_sociale}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{cli.partita_iva || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    {cli.citta ? `${cli.citta} (${cli.provincia})` : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {Number(cli.sconto_produzione) > 0 && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        {cli.sconto_produzione}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {Number(cli.sconto_acquisto) > 0 && (
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
                        {cli.sconto_acquisto}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{cli.pagamento_default || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Form Cliente
function ClienteForm({ 
  cliente, 
  onSave, 
  onCancel,
  isLoading 
}: { 
  cliente?: Cliente;
  onSave: (data: Partial<Cliente>) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    codice: cliente?.codice || '',
    ragione_sociale: cliente?.ragione_sociale || '',
    partita_iva: cliente?.partita_iva || '',
    citta: cliente?.citta || '',
    provincia: cliente?.provincia || '',
    sconto_produzione: cliente?.sconto_produzione || 0,
    sconto_acquisto: cliente?.sconto_acquisto || 0,
    pagamento_default: cliente?.pagamento_default || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ id: cliente?.id, ...formData });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Codice *</label>
          <input
            type="text"
            required
            value={formData.codice}
            onChange={(e) => setFormData({ ...formData, codice: e.target.value.toUpperCase() })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">P.IVA</label>
          <input
            type="text"
            value={formData.partita_iva}
            onChange={(e) => setFormData({ ...formData, partita_iva: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Ragione Sociale *</label>
        <input
          type="text"
          required
          value={formData.ragione_sociale}
          onChange={(e) => setFormData({ ...formData, ragione_sociale: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Città</label>
          <input
            type="text"
            value={formData.citta}
            onChange={(e) => setFormData({ ...formData, citta: e.target.value })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
          <input
            type="text"
            maxLength={2}
            value={formData.provincia}
            onChange={(e) => setFormData({ ...formData, provincia: e.target.value.toUpperCase() })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sconto Prod. %</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={formData.sconto_produzione}
            onChange={(e) => setFormData({ ...formData, sconto_produzione: parseFloat(e.target.value) || 0 })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sconto Acq. %</label>
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={formData.sconto_acquisto}
            onChange={(e) => setFormData({ ...formData, sconto_acquisto: parseFloat(e.target.value) || 0 })}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Pagamento Default</label>
        <input
          type="text"
          placeholder="es: 030 GG FM"
          value={formData.pagamento_default}
          onChange={(e) => setFormData({ ...formData, pagamento_default: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg"
        />
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 border rounded-lg hover:bg-gray-50"
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salva
        </button>
      </div>
    </form>
  );
}

// ==========================================
// TAB PARAMETRI
// ==========================================
function ParametriTab() {
  const { data: parametri, isLoading } = useQuery({
    queryKey: ['parametri-sistema'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/parametri-sistema`);
      return res.json();
    }
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // Raggruppa per gruppo
  const grouped: Record<string, any[]> = {};
  (parametri || []).forEach((p: any) => {
    const g = p.gruppo || 'altro';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(p);
  });

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([gruppo, params]) => (
        <div key={gruppo} className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h3 className="font-semibold text-gray-900 capitalize">{gruppo}</h3>
          </div>
          <div className="divide-y">
            {params.map((p: any) => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="font-mono text-sm text-gray-600">{p.chiave}</div>
                  <div className="text-sm text-gray-500">{p.descrizione}</div>
                </div>
                <div className="font-semibold text-lg">
                  {p.tipo_dato === 'number' ? `${p.valore}%` : p.valore}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
