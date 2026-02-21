import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Shield, User, Check, X, Eye, EyeOff, Users, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

const API_BASE = 'http://localhost:8000';

interface Utente {
  id: number;
  username: string;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  gruppo_id: number | null;
  gruppo_nome: string | null;
  ruolo_id: number | null;
  ruolo_nome: string | null;
  ruolo_codice: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string | null;
  last_login: string | null;
}

interface Gruppo {
  id: number;
  nome: string;
}

interface Ruolo {
  id: number;
  codice: string;
  nome: string;
  gruppo_id: number | null;
  is_superadmin: boolean;
}

export function GestioneUtentiPage() {
  const [utenti, setUtenti] = useState<Utente[]>([]);
  const [gruppi, setGruppi] = useState<Gruppo[]>([]);
  const [ruoli, setRuoli] = useState<Ruolo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    nome: '',
    cognome: '',
    email: '',
    gruppo_id: null as number | null,
    ruolo_id: null as number | null,
    is_admin: false,
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [utentiRes, gruppiRes, ruoliRes] = await Promise.all([
        fetch(`${API_BASE}/utenti`),
        fetch(`${API_BASE}/gruppi-utenti`),
        fetch(`${API_BASE}/ruoli`),
      ]);
      if (utentiRes.ok) setUtenti(await utentiRes.json());
      if (gruppiRes.ok) setGruppi(await gruppiRes.json());
      if (ruoliRes.ok) setRuoli(await ruoliRes.json());
    } catch (error) {
      console.error('Errore caricamento:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtra ruoli in base al gruppo selezionato
  const ruoliFiltrati = formData.gruppo_id
    ? ruoli.filter(r => r.gruppo_id === formData.gruppo_id || !r.gruppo_id)
    : ruoli;

  const resetForm = () => {
    setFormData({
      username: '',
      password: '',
      nome: '',
      cognome: '',
      email: '',
      gruppo_id: null,
      ruolo_id: null,
      is_admin: false,
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username) {
      toast({ title: 'Username obbligatorio', variant: 'destructive' });
      return;
    }
    
    if (!editingId && !formData.password) {
      toast({ title: 'Password obbligatoria per nuovi utenti', variant: 'destructive' });
      return;
    }

    try {
      const params = new URLSearchParams();
      params.append('username', formData.username);
      if (formData.password) params.append('password', formData.password);
      if (formData.nome) params.append('nome', formData.nome);
      if (formData.cognome) params.append('cognome', formData.cognome);
      if (formData.email) params.append('email', formData.email);
      if (formData.gruppo_id !== null) params.append('gruppo_id', String(formData.gruppo_id));
      if (formData.ruolo_id !== null) params.append('ruolo_id', String(formData.ruolo_id));
      params.append('is_admin', formData.is_admin ? 'true' : 'false');

      const url = editingId 
        ? `${API_BASE}/utenti/${editingId}?${params.toString()}`
        : `${API_BASE}/utenti?${params.toString()}`;
      
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST'
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Errore');
      }

      toast({ title: editingId ? '✓ Utente aggiornato' : '✓ Utente creato' });
      resetForm();
      fetchAll();
    } catch (error: any) {
      toast({ title: 'Errore', description: error.message, variant: 'destructive' });
    }
  };

  const handleEdit = (utente: Utente) => {
    setFormData({
      username: utente.username,
      password: '',
      nome: utente.nome || '',
      cognome: utente.cognome || '',
      email: utente.email || '',
      gruppo_id: utente.gruppo_id,
      ruolo_id: utente.ruolo_id,
      is_admin: utente.is_admin,
    });
    setEditingId(utente.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questo utente?')) return;
    
    try {
      const res = await fetch(`${API_BASE}/utenti/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: '✓ Utente eliminato' });
        fetchAll();
      }
    } catch (error) {
      toast({ title: 'Errore eliminazione', variant: 'destructive' });
    }
  };

  const handleToggleActive = async (utente: Utente) => {
    try {
      const res = await fetch(
        `${API_BASE}/utenti/${utente.id}?is_active=${!utente.is_active}`,
        { method: 'PUT' }
      );
      if (res.ok) {
        toast({ title: utente.is_active ? '⏸ Utente disabilitato' : '▶ Utente abilitato' });
        fetchAll();
      }
    } catch (error) {
      toast({ title: 'Errore', variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Caricamento...</div>;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestione Utenti</h1>
          <p className="text-sm text-gray-500 mt-1">
            {utenti.length} utenti registrati
          </p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Utente
        </Button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border rounded-lg p-4 mb-6">
          <h3 className="font-semibold mb-4">
            {editingId ? 'Modifica Utente' : 'Nuovo Utente'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Username *</label>
                <Input
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  placeholder="mario.rossi"
                  disabled={!!editingId}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Password {editingId ? '(lascia vuoto per non cambiare)' : '*'}
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Nome</label>
                <Input
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Mario"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Cognome</label>
                <Input
                  value={formData.cognome}
                  onChange={(e) => setFormData({ ...formData, cognome: e.target.value })}
                  placeholder="Rossi"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Email</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="mario.rossi@azienda.it"
                />
              </div>

              {/* Gruppo */}
              <div>
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-blue-500" />
                  Gruppo
                </label>
                <select
                  value={formData.gruppo_id || ''}
                  onChange={(e) => {
                    const gid = e.target.value ? Number(e.target.value) : null;
                    setFormData({ ...formData, gruppo_id: gid, ruolo_id: null }); // Reset ruolo quando cambia gruppo
                  }}
                  className="w-full h-10 px-3 border rounded-md text-sm"
                >
                  <option value="">— Seleziona gruppo —</option>
                  {gruppi.map(g => (
                    <option key={g.id} value={g.id}>{g.nome}</option>
                  ))}
                </select>
              </div>

              {/* Ruolo */}
              <div>
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <Shield className="h-3.5 w-3.5 text-purple-500" />
                  Ruolo
                </label>
                <select
                  value={formData.ruolo_id || ''}
                  onChange={(e) => {
                    const rid = e.target.value ? Number(e.target.value) : null;
                    // Se il ruolo è superadmin, imposta anche is_admin
                    const ruoloSel = ruoli.find(r => r.id === rid);
                    setFormData({ 
                      ...formData, 
                      ruolo_id: rid,
                      is_admin: ruoloSel?.is_superadmin || false,
                    });
                  }}
                  className="w-full h-10 px-3 border rounded-md text-sm"
                >
                  <option value="">— Seleziona ruolo —</option>
                  {ruoliFiltrati.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.nome}{r.is_superadmin ? ' ⭐' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Admin flag (legacy, nascosto se ruolo è superadmin) */}
              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  id="is_admin"
                  checked={formData.is_admin}
                  onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })}
                  className="h-4 w-4"
                />
                <label htmlFor="is_admin" className="text-sm font-medium text-gray-700 flex items-center gap-1">
                  <Shield className="h-4 w-4 text-purple-500" />
                  Admin (flag legacy)
                </label>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="submit">
                {editingId ? 'Salva Modifiche' : 'Crea Utente'}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                Annulla
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Tabella */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nome</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Gruppo</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ruolo</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stato</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {utenti.map((utente) => (
              <tr key={utente.id} className={!utente.is_active ? 'bg-gray-50 opacity-60' : ''}>
                <td className="px-4 py-3">
                  <span className="font-medium text-gray-900">{utente.username}</span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {utente.nome} {utente.cognome}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{utente.email || '—'}</td>
                <td className="px-4 py-3 text-center">
                  {utente.gruppo_nome ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                      <Users className="h-3 w-3" />
                      {utente.gruppo_nome}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {utente.ruolo_nome ? (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      utente.is_admin
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      <Shield className="h-3 w-3" />
                      {utente.ruolo_nome}
                    </span>
                  ) : utente.is_admin ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-700">
                      <Shield className="h-3 w-3" /> Admin
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">Nessun ruolo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => handleToggleActive(utente)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                      utente.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                    title={utente.is_active ? 'Click per disabilitare' : 'Click per abilitare'}
                  >
                    {utente.is_active ? (
                      <><Check className="h-3 w-3" /> Attivo</>
                    ) : (
                      <><X className="h-3 w-3" /> Disabilitato</>
                    )}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => handleEdit(utente)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="Modifica">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(utente.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded" title="Elimina">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {utenti.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Nessun utente nel database.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Info box */}
      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-700">
          Assegna un <strong>Gruppo</strong> per l'organizzazione e un <strong>Ruolo</strong> per definire i permessi.
          I ruoli si gestiscono dalla pagina <strong>Gestione Ruoli</strong>.
        </p>
      </div>
    </div>
  );
}

export default GestioneUtentiPage;
