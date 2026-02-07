import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Package, Wrench, Loader2, Trash2, LogOut, User, Copy, Globe, Lock } from 'lucide-react';
import { TipoPreventivoSelector } from '../components/TipoPreventivoSelector';
import { ClienteSelector } from '../components/ClienteSelector';
import { toast } from 'sonner';

const API_BASE = 'http://localhost:8000/api';

// Get current user from localStorage
function getCurrentUser() {
  try {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

interface Preventivo {
  id: number;
  numero_preventivo: string;
  tipo_preventivo: string;
  customer_name: string | null;
  cliente_id: number | null;
  status: string;
  total_price: number;
  created_at: string;
}

interface Cliente {
  id: number;
  codice: string;
  ragione_sociale: string;
  sconto_produzione: number;
  sconto_acquisto: number;
}

interface Template {
  id: number;
  nome: string;
  descrizione: string | null;
  is_public: boolean;
  created_by: number | null;
  created_at: string;
}

export default function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showNewForm, setShowNewForm] = useState(false);
  const [modalitaCreazione, setModalitaCreazione] = useState<'COMPLETO' | 'RICAMBIO' | 'TEMPLATE'>('COMPLETO');
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  
  const currentUser = getCurrentUser();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // Carica lista preventivi (filtrati per utente se non admin)
  const { data: preventivi, isLoading, refetch } = useQuery({
    queryKey: ['preventivi', currentUser?.id, currentUser?.role],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (currentUser?.id) params.append('user_id', currentUser.id.toString());
      params.append('is_admin', currentUser?.role === 'admin' ? 'true' : 'false');
      
      const res = await fetch(`${API_BASE}/preventivi?${params.toString()}`);
      if (!res.ok) throw new Error('Errore caricamento');
      return res.json();
    }
  });

  // Carica lista template
  const { data: templates } = useQuery({
    queryKey: ['templates', currentUser?.id],
    queryFn: async () => {
      const url = currentUser?.id 
        ? `${API_BASE}/templates?user_id=${currentUser.id}`
        : `${API_BASE}/templates`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Errore caricamento template');
      return res.json() as Promise<Template[]>;
    }
  });

  // Crea nuovo preventivo
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API_BASE}/preventivi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tipo_preventivo: modalitaCreazione === 'TEMPLATE' ? 'COMPLETO' : modalitaCreazione,
          cliente_id: clienteId,
          user_id: currentUser?.id  // Chi crea il preventivo
        })
      });
      if (!res.ok) throw new Error('Errore creazione');
      return res.json();
    },
    onSuccess: (data) => {
      navigate(`/preventivi/${data.id}`);
    }
  });

  // Crea preventivo da template
  const createFromTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const params = new URLSearchParams();
      if (clienteId) params.append('cliente_id', clienteId.toString());
      if (currentUser?.id) params.append('user_id', currentUser.id.toString());
      
      const res = await fetch(`${API_BASE}/templates/${templateId}/create-preventivo?${params.toString()}`, { method: 'POST' });
      if (!res.ok) throw new Error('Errore creazione da template');
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Preventivo ${data.numero_preventivo} creato da template "${data.template_usato}"`);
      navigate(`/preventivi/${data.preventivo_id}`);
    },
    onError: () => {
      toast.error('Errore nella creazione del preventivo');
    }
  });

  // Cancella template
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const res = await fetch(
        `${API_BASE}/templates/${templateId}?user_id=${currentUser?.id}&is_admin=${currentUser?.is_admin}`,
        { method: 'DELETE' }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Errore cancellazione');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Template cancellato');
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Cancella preventivo
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/preventivi/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Errore cancellazione');
    },
    onSuccess: () => {
      refetch();
    }
  });

  const handleClienteChange = (cliente: Cliente | null) => {
    setSelectedCliente(cliente);
    setClienteId(cliente?.id || null);
  };

  const handleCreate = () => {
    if (modalitaCreazione === 'TEMPLATE') {
      if (!selectedTemplateId) {
        toast.error('Seleziona un template');
        return;
      }
      createFromTemplateMutation.mutate(selectedTemplateId);
    } else {
      createMutation.mutate();
    }
  };

  const canDeleteTemplate = (template: Template) => {
    // Admin può cancellare tutto
    if (currentUser?.is_admin) return true;
    // Utente può cancellare solo i propri template
    return template.created_by === currentUser?.id;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Configuratore Preventivi
              </h1>
              <p className="text-gray-600 mt-1">
                Elettroquadri S.r.l.
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Info utente */}
              {currentUser && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="w-4 h-4" />
                  <span>{currentUser.username}</span>
                  {currentUser.is_admin && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">Admin</span>
                  )}
                </div>
              )}
              
              {/* Pulsante Nuovo Preventivo */}
              <button
                onClick={() => setShowNewForm(true)}
                className="flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <Plus className="w-5 h-5" />
                Nuovo Preventivo
              </button>
              
              {/* Pulsante Logout */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-3 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Esci"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Form nuovo preventivo */}
        {showNewForm && (
          <div className="mb-8 bg-white rounded-xl shadow-lg border p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Nuovo Preventivo</h2>
            
            {/* Step 1: Modalità creazione */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                1. Modalità di creazione
              </label>
              <div className="grid grid-cols-3 gap-4">
                {/* Prodotto Completo */}
                <button
                  type="button"
                  onClick={() => {
                    setModalitaCreazione('COMPLETO');
                    setSelectedTemplateId(null);
                  }}
                  className={`
                    p-6 rounded-xl border-2 transition-all text-left
                    ${modalitaCreazione === 'COMPLETO'
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }
                  `}
                >
                  <Package className={`w-10 h-10 mb-3 ${modalitaCreazione === 'COMPLETO' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div className={`font-semibold text-lg ${modalitaCreazione === 'COMPLETO' ? 'text-blue-900' : 'text-gray-900'}`}>
                    Prodotto Completo
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Nuovo impianto da configurare
                  </div>
                </button>
                
                {/* Ricambio */}
                <button
                  type="button"
                  onClick={() => {
                    setModalitaCreazione('RICAMBIO');
                    setSelectedTemplateId(null);
                  }}
                  className={`
                    p-6 rounded-xl border-2 transition-all text-left
                    ${modalitaCreazione === 'RICAMBIO'
                      ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }
                  `}
                >
                  <Wrench className={`w-10 h-10 mb-3 ${modalitaCreazione === 'RICAMBIO' ? 'text-green-600' : 'text-gray-400'}`} />
                  <div className={`font-semibold text-lg ${modalitaCreazione === 'RICAMBIO' ? 'text-green-900' : 'text-gray-900'}`}>
                    Ricambio
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Parti di ricambio da listino
                  </div>
                </button>
                
                {/* Da Template */}
                <button
                  type="button"
                  onClick={() => setModalitaCreazione('TEMPLATE')}
                  className={`
                    p-6 rounded-xl border-2 transition-all text-left
                    ${modalitaCreazione === 'TEMPLATE'
                      ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }
                  `}
                >
                  <Copy className={`w-10 h-10 mb-3 ${modalitaCreazione === 'TEMPLATE' ? 'text-purple-600' : 'text-gray-400'}`} />
                  <div className={`font-semibold text-lg ${modalitaCreazione === 'TEMPLATE' ? 'text-purple-900' : 'text-gray-900'}`}>
                    Da Template
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Usa configurazione esistente
                  </div>
                </button>
              </div>
            </div>

            {/* Step 2: Selezione Template (solo se TEMPLATE) */}
            {modalitaCreazione === 'TEMPLATE' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  2. Seleziona Template
                </label>
                
                {templates && templates.length > 0 ? (
                  <div className="grid gap-3 max-h-64 overflow-y-auto pr-2">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className={`
                          p-4 rounded-lg border-2 cursor-pointer transition-all
                          ${selectedTemplateId === template.id
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                          }
                        `}
                        onClick={() => setSelectedTemplateId(template.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {template.is_public ? (
                              <Globe className="w-5 h-5 text-blue-500" title="Template pubblico" />
                            ) : (
                              <Lock className="w-5 h-5 text-gray-400" title="Template personale" />
                            )}
                            <div>
                              <div className="font-medium text-gray-900">{template.nome}</div>
                              {template.descrizione && (
                                <div className="text-sm text-gray-500">{template.descrizione}</div>
                              )}
                            </div>
                          </div>
                          
                          {canDeleteTemplate(template) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Eliminare questo template?')) {
                                  deleteTemplateMutation.mutate(template.id);
                                }
                              }}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Elimina template"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                    <Copy className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>Nessun template disponibile</p>
                    <p className="text-sm mt-1">I template verranno creati salvando preventivi esistenti</p>
                  </div>
                )}
              </div>
            )}
            
            {/* Step 2/3: Cliente */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                {modalitaCreazione === 'TEMPLATE' ? '3' : '2'}. Cliente (opzionale)
              </label>
              <ClienteSelector
                value={clienteId}
                onChange={handleClienteChange}
              />
              {selectedCliente && (
                <div className="mt-2 text-sm text-gray-600">
                  Sconto produzione: {selectedCliente.sconto_produzione}% | 
                  Sconto acquisto: {selectedCliente.sconto_acquisto}%
                </div>
              )}
            </div>

            {/* Pulsanti */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewForm(false);
                  setModalitaCreazione('COMPLETO');
                  setSelectedTemplateId(null);
                  setClienteId(null);
                  setSelectedCliente(null);
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending || createFromTemplateMutation.isPending || (modalitaCreazione === 'TEMPLATE' && !selectedTemplateId)}
                className={`
                  px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2
                  ${modalitaCreazione === 'COMPLETO' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                  ${modalitaCreazione === 'RICAMBIO' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
                  ${modalitaCreazione === 'TEMPLATE' ? 'bg-purple-600 hover:bg-purple-700 text-white' : ''}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {(createMutation.isPending || createFromTemplateMutation.isPending) && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                {modalitaCreazione === 'TEMPLATE' ? 'Crea da Template' : 'Crea Preventivo'}
              </button>
            </div>
          </div>
        )}

        {/* Lista preventivi */}
        <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">Preventivi Recenti</h2>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : preventivi?.length > 0 ? (
            <div className="divide-y">
              {preventivi.map((prev: Preventivo) => (
                <div
                  key={prev.id}
                  className="px-6 py-4 hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between"
                  onClick={() => navigate(`/preventivi/${prev.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`
                      w-10 h-10 rounded-lg flex items-center justify-center
                      ${prev.tipo_preventivo === 'RICAMBIO' ? 'bg-green-100' : 'bg-blue-100'}
                    `}>
                      {prev.tipo_preventivo === 'RICAMBIO' 
                        ? <Wrench className="w-5 h-5 text-green-600" />
                        : <Package className="w-5 h-5 text-blue-600" />
                      }
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{prev.numero_preventivo}</span>
                        <span className={`
                          px-2 py-0.5 rounded text-xs font-medium
                          ${prev.tipo_preventivo === 'RICAMBIO' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}
                        `}>
                          {prev.tipo_preventivo}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {prev.customer_name || 'Cliente non specificato'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className={`font-semibold ${prev.tipo_preventivo === 'RICAMBIO' ? 'text-green-600' : 'text-blue-600'}`}>
                        €{Number(prev.total_price || 0).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(prev.created_at).toLocaleDateString('it-IT')}
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Eliminare questo preventivo?')) {
                          deleteMutation.mutate(prev.id);
                        }
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>Nessun preventivo trovato</p>
              <p className="text-sm mt-1">Clicca su "Nuovo Preventivo" per iniziare</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
