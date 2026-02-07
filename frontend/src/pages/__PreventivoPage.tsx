import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Wrench, Loader2, ArrowLeft, FileText, Settings, ScrollText, LayoutGrid, Cog, Info, DoorOpen, Shield, LogOut, User, Save, X, Download, Users, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

// Components
import { ClienteSelector } from '../components/ClienteSelector';
import { ExportButtons } from '../components/ExportButtons';

// Forms per COMPLETO (named exports)
import { DatiCommessaForm } from '../components/sections/DatiCommessaForm';
import { DatiPrincipaliForm } from '../components/sections/DatiPrincipaliForm';
import { NormativeForm } from '../components/sections/NormativeForm';
import DisposizioneVanoForm from '../components/sections/DisposizioneVanoForm';
import { MaterialiPage } from '../components/sections/MaterialiPage';
import { ArganoForm } from '../components/sections/ArganoForm';
import { GestioneArticoliPage } from '../components/sections/GestioneArticoliPage';
import GestioneOpzioniPage from '../components/sections/GestioneOpzioniPage';
import GestioneCampiPage from '../components/sections/GestioneCampiPage';
import GestioneUtentiPage from '../components/sections/GestioneUtentiPage';
import RuleEnginePage from '../components/sections/RuleEnginePage';

// Form per RICAMBIO
import { RicambiForm } from '../components/RicambiForm';

const API_BASE = 'http://localhost:8000/api';

// Sezioni per preventivo COMPLETO
type SezioneCompleto = 'dati-commessa' | 'dati-principali' | 'normative' | 'disposizione-vano' | 'argano' | 'info-generale' | 'porte' | 'materiali' | 'rule-designer' | 'admin' | 'gestione-opzioni' | 'gestione-campi' | 'gestione-utenti';

interface MenuItemType {
  id: SezioneCompleto;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const menuItems: MenuItemType[] = [
  { id: 'dati-commessa', label: 'Dati Commessa', icon: <FileText className="w-5 h-5" /> },
  { id: 'dati-principali', label: 'Dati Principali', icon: <Settings className="w-5 h-5" /> },
  { id: 'normative', label: 'Normative', icon: <ScrollText className="w-5 h-5" /> },
  { id: 'disposizione-vano', label: 'Disposizione Vano', icon: <LayoutGrid className="w-5 h-5" /> },
  { id: 'argano', label: 'Argano', icon: <Cog className="w-5 h-5" /> },
  { id: 'info-generale', label: 'Info Generale', icon: <Info className="w-5 h-5" /> },
  { id: 'porte', label: 'Porte', icon: <DoorOpen className="w-5 h-5" /> },
  { id: 'materiali', label: 'Materiali', icon: <Package className="w-5 h-5" /> },
  { id: 'rule-designer', label: 'Rule Engine', icon: <Settings2 className="w-5 h-5" />, adminOnly: true },
  { id: 'admin', label: 'Gestione Articoli', icon: <Package className="w-5 h-5" />, adminOnly: true },
  { id: 'gestione-opzioni', label: 'Gestione Opzioni', icon: <Settings className="w-5 h-5" />, adminOnly: true },
  { id: 'gestione-campi', label: 'Gestione Campi', icon: <Settings className="w-5 h-5" />, adminOnly: true },
  { id: 'gestione-utenti', label: 'Gestione Utenti', icon: <Users className="w-5 h-5" />, adminOnly: true },
];

interface Preventivo {
  id: number;
  numero_preventivo: string;
  tipo_preventivo: string;
  cliente_id: number | null;
  customer_name: string | null;
  status: string;
  total_price: number;
  total_price_finale?: number;
  sconto_cliente?: number;
  sconto_extra_admin?: number;
}

interface Cliente {
  id: number;
  codice: string;
  ragione_sociale: string;
  sconto_produzione: number;
  sconto_acquisto: number;
}

export default function PreventivoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const preventivoId = parseInt(id || '0');
  
  const [sezioneAttiva, setSezioneAttiva] = useState<SezioneCompleto>('dati-commessa');
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateNome, setTemplateNome] = useState('');
  const [templateDescrizione, setTemplateDescrizione] = useState('');
  const [templatePubblico, setTemplatePubblico] = useState(false);
  
  // Check if user is admin
  const isAdmin = (() => {
    try {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user).is_admin : false;
    } catch {
      return false;
    }
  })();

  // Get current user
  const currentUser = (() => {
    try {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    } catch {
      return null;
    }
  })();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // Salva come template
  const saveTemplateMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams({
        nome: templateNome,
        user_id: String(currentUser?.id || 0),
        is_admin: String(isAdmin),
        is_public: String(templatePubblico)
      });
      if (templateDescrizione) {
        params.append('descrizione', templateDescrizione);
      }
      
      const res = await fetch(
        `${API_BASE}/preventivi/${preventivoId}/save-as-template?${params}`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || 'Errore salvataggio');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(`Template "${data.nome}" creato con successo!`);
      setShowSaveTemplateDialog(false);
      setTemplateNome('');
      setTemplateDescrizione('');
      setTemplatePubblico(false);
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Carica preventivo
  const { data: preventivo, isLoading, refetch: refetchPreventivo } = useQuery({
    queryKey: ['preventivo', preventivoId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}`);
      if (!res.ok) throw new Error('Preventivo non trovato');
      return res.json() as Promise<Preventivo>;
    },
    enabled: preventivoId > 0
  });

  // Aggiorna cliente
  const updateClienteMutation = useMutation({
    mutationFn: async (clienteId: number | null) => {
      const res = await fetch(`${API_BASE}/preventivi/${preventivoId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_id: clienteId })
      });
      if (!res.ok) throw new Error('Errore aggiornamento');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preventivo', preventivoId] });
    }
  });

  const handleClienteChange = (id: number | null) => {
    updateClienteMutation.mutate(id);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!preventivo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Preventivo non trovato</h2>
          <button
            onClick={() => navigate('/preventivi')}
            className="text-blue-600 hover:underline"
          >
            Torna alla lista
          </button>
        </div>
      </div>
    );
  }

  const isRicambio = preventivo.tipo_preventivo === 'RICAMBIO';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar integrata - solo per COMPLETO */}
      {!isRicambio && (
        <div className="w-64 bg-white border-r shadow-sm fixed h-full overflow-y-auto pb-20">
          <div className="p-6 border-b">
            <h1 className="text-xl font-bold text-gray-900">Configuratore</h1>
            <p className="text-sm text-gray-500 mt-1">Elettroquadri S.r.l.</p>
          </div>
          
          <nav className="py-4">
            {menuItems
              .filter(item => !item.adminOnly || isAdmin)
              .map((item, index, arr) => {
              const isActive = sezioneAttiva === item.id;
              const prevItem = index > 0 ? arr[index - 1] : null;
              const showDivider = item.adminOnly && (!prevItem || !prevItem.adminOnly);
              
              return (
                <div key={item.id}>
                  {showDivider && (
                    <div className="my-2 mx-4 border-t border-gray-200">
                      <p className="text-xs text-gray-400 uppercase mt-2 px-2">Admin</p>
                    </div>
                  )}
                  <button
                    onClick={() => setSezioneAttiva(item.id)}
                    className={`
                      w-full flex items-center gap-3 px-6 py-3 text-left transition-colors
                      ${isActive
                        ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-700'
                        : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
                      }
                    `}
                  >
                    {item.icon}
                    <span className="font-medium">{item.label}</span>
                  </button>
                </div>
              );
            })}
          </nav>
          
          {/* Pulsante Salva come Template */}
          <div className="px-4 py-3 border-t">
            <button
              onClick={() => setShowSaveTemplateDialog(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors font-medium text-sm"
            >
              <Save className="w-4 h-4" />
              Salva come Template
            </button>
          </div>
          
          {/* Footer sidebar con user e logout */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="w-4 h-4" />
                <span>{currentUser?.username || 'Utente'}</span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Esci"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`flex-1 ${!isRicambio ? 'ml-64' : ''}`}>
        {/* Header */}
        <header className="bg-white border-b shadow-sm sticky top-0 z-10">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => navigate('/preventivi')}
                  className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                
                <div className={`
                  w-12 h-12 rounded-lg flex items-center justify-center
                  ${isRicambio ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}
                `}>
                  {isRicambio ? <Wrench className="w-6 h-6" /> : <Package className="w-6 h-6" />}
                </div>
                
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-gray-900">
                      {preventivo.numero_preventivo}
                    </h1>
                    <span className={`
                      px-2 py-1 rounded text-xs font-medium
                      ${isRicambio ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}
                    `}>
                      {preventivo.tipo_preventivo}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {preventivo.customer_name || 'Cliente non specificato'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Pulsante Export */}
                <ExportButtons 
                  preventivoId={preventivoId} 
                  numeroPreventivo={preventivo.numero_preventivo} 
                />
                
                <div className="text-right">
                  <div className="text-sm text-gray-500">Totale</div>
                  <div className={`text-2xl font-bold ${isRicambio ? 'text-green-600' : 'text-blue-600'}`}>
                    €{Number(preventivo.total_price_finale || preventivo.total_price || 0).toFixed(2)}
                  </div>
                </div>
                
                {/* Logout per RICAMBIO (senza sidebar) */}
                {isRicambio && (
                  <button
                    onClick={handleLogout}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Esci"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* Selettore cliente se non specificato */}
            {!preventivo.cliente_id && (
              <div className="mt-4 pt-4 border-t">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Associa un cliente (opzionale)
                </label>
                <ClienteSelector
                  value={preventivo.cliente_id}
                  onChange={handleClienteChange}
                />
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main className="p-6">
          {isRicambio ? (
            // Form Ricambi
            <RicambiForm 
              preventivoId={preventivoId} 
              clienteId={preventivo.cliente_id}
            />
          ) : (
            // Forms Completo
            <div className={sezioneAttiva.startsWith('admin') || sezioneAttiva.startsWith('gestione') ? '' : 'max-w-4xl'}>
              {sezioneAttiva === 'dati-commessa' && (
                <DatiCommessaForm />
              )}
              {sezioneAttiva === 'dati-principali' && (
                <DatiPrincipaliForm preventivoId={preventivoId} isAdmin={isAdmin} />
              )}
              {sezioneAttiva === 'normative' && (
                <NormativeForm preventivoId={preventivoId} isAdmin={isAdmin} />
              )}
              {sezioneAttiva === 'disposizione-vano' && (
                <DisposizioneVanoForm preventivoId={preventivoId} />
              )}
              {sezioneAttiva === 'argano' && (
                <ArganoForm preventivoId={preventivoId} />
              )}
              {sezioneAttiva === 'info-generale' && (
                <div className="bg-white rounded-lg border p-6">
                  <h2 className="text-xl font-bold mb-4">Info Generale</h2>
                  <p className="text-gray-600">Sezione in sviluppo...</p>
                </div>
              )}
              {sezioneAttiva === 'porte' && (
                <div className="bg-white rounded-lg border p-6">
                  <h2 className="text-xl font-bold mb-4">Porte</h2>
                  <p className="text-gray-600">Sezione in sviluppo...</p>
                </div>
              )}
              {sezioneAttiva === 'materiali' && (
                <MaterialiPage preventivoId={preventivoId} clienteId={preventivo?.cliente_id} />
              )}
              {sezioneAttiva === 'rule-designer' && isAdmin && (
                <RuleEnginePage />
              )}
              {sezioneAttiva === 'admin' && isAdmin && (
                <GestioneArticoliPage />
              )}
              {sezioneAttiva === 'gestione-opzioni' && isAdmin && (
                <GestioneOpzioniPage />
              )}
              {sezioneAttiva === 'gestione-campi' && isAdmin && (
                <GestioneCampiPage />
              )}
              {sezioneAttiva === 'gestione-utenti' && isAdmin && (
                <GestioneUtentiPage />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Modal Salva come Template */}
      {showSaveTemplateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Salva come Template</h3>
              <button
                onClick={() => setShowSaveTemplateDialog(false)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome Template *
                </label>
                <input
                  type="text"
                  value={templateNome}
                  onChange={(e) => setTemplateNome(e.target.value)}
                  placeholder="Es: Ascensore Residenziale 4 Fermate"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrizione (opzionale)
                </label>
                <textarea
                  value={templateDescrizione}
                  onChange={(e) => setTemplateDescrizione(e.target.value)}
                  placeholder="Breve descrizione del template..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              
              {isAdmin && (
                <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                  <input
                    type="checkbox"
                    id="templatePubblico"
                    checked={templatePubblico}
                    onChange={(e) => setTemplatePubblico(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="templatePubblico" className="text-sm text-purple-900">
                    <span className="font-medium">Template Pubblico</span>
                    <span className="block text-purple-700">Visibile a tutti gli utenti</span>
                  </label>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3 p-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowSaveTemplateDialog(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={() => saveTemplateMutation.mutate()}
                disabled={!templateNome.trim() || saveTemplateMutation.isPending}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saveTemplateMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Salva Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
