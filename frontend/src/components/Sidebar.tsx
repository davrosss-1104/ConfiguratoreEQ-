import { useState, useEffect } from 'react';
import { 
  FileText, 
  Settings, 
  ScrollText, 
  LayoutGrid, 
  Cog, 
  Info, 
  DoorOpen,
  Package,
  Users,
  ListChecks,
  LayoutList,
  UserCog,
  Settings2,
  ChevronDown,
  ChevronRight,
  Layers,
  Zap,
  Shield,
  Cable,
  Wrench,
  Box,
  Monitor,
  Cpu,
  Power,
  Lock,
  CircleDot,
} from 'lucide-react';

const API_BASE = 'http://localhost:8000';

// ==========================================
// MAPPA ICONE: nome stringa -> componente
// ==========================================
const ICON_MAP: Record<string, React.ReactNode> = {
  FileText: <FileText className="h-5 w-5" />,
  Settings: <Settings className="h-5 w-5" />,
  ScrollText: <ScrollText className="h-5 w-5" />,
  LayoutGrid: <LayoutGrid className="h-5 w-5" />,
  Cog: <Cog className="h-5 w-5" />,
  Info: <Info className="h-5 w-5" />,
  DoorOpen: <DoorOpen className="h-5 w-5" />,
  Package: <Package className="h-5 w-5" />,
  Zap: <Zap className="h-5 w-5" />,
  Shield: <Shield className="h-5 w-5" />,
  Cable: <Cable className="h-5 w-5" />,
  Wrench: <Wrench className="h-5 w-5" />,
  Layers: <Layers className="h-5 w-5" />,
  Box: <Box className="h-5 w-5" />,
  Monitor: <Monitor className="h-5 w-5" />,
  Cpu: <Cpu className="h-5 w-5" />,
  Power: <Power className="h-5 w-5" />,
  Lock: <Lock className="h-5 w-5" />,
};

const DEFAULT_ICON = <CircleDot className="h-5 w-5" />;

// Fallback se API non risponde
const FALLBACK_SECTIONS = [
  { codice: 'dati_commessa', etichetta: 'Dati Commessa', icona: 'FileText' },
  { codice: 'dati_principali', etichetta: 'Dati Principali', icona: 'Settings' },
  { codice: 'normative', etichetta: 'Normative', icona: 'ScrollText' },
  { codice: 'disposizione_vano', etichetta: 'Disposizione Vano', icona: 'LayoutGrid' },
  { codice: 'argano', etichetta: 'Argano', icona: 'Cog' },
  { codice: 'info_generale', etichetta: 'Info Generale', icona: 'Info' },
  { codice: 'porte', etichetta: 'Porte', icona: 'DoorOpen' },
  { codice: 'materiali', etichetta: 'Materiali', icona: 'Package' },
];

// ==========================================
// INTERFACES
// ==========================================
interface SezioneAPI {
  id: number;
  codice: string;
  etichetta: string;
  icona: string;
  ordine: number;
  attivo: boolean;
}

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  progresso?: number;
  isAdmin?: boolean;
}

// ==========================================
// COMPONENTE
// ==========================================
export const Sidebar = ({ 
  activeSection, 
  onSectionChange, 
  progresso = 0,
  isAdmin = true
}: SidebarProps) => {
  const [adminExpanded, setAdminExpanded] = useState(false);
  const [sezioniDB, setSezioniDB] = useState<SezioneAPI[] | null>(null);

  useEffect(() => {
    const loadSezioni = () => {
      fetch(`${API_BASE}/sezioni-configuratore`)
        .then(res => res.ok ? res.json() : [])
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            setSezioniDB(data.filter((s: SezioneAPI) => s.attivo));
          }
        })
        .catch(() => { /* fallback silenzioso */ });
    };

    loadSezioni();

    // Ricarica quando GestioneSezioniPage emette l'evento
    window.addEventListener('sezioni-updated', loadSezioni);
    return () => window.removeEventListener('sezioni-updated', loadSezioni);
  }, []);

  // Sezioni: da DB oppure fallback
  const sezioniConfigurazione = (sezioniDB
    ? sezioniDB.map(s => ({ id: s.codice, label: s.etichetta, icon: ICON_MAP[s.icona] || DEFAULT_ICON }))
    : FALLBACK_SECTIONS.map(s => ({ id: s.codice, label: s.etichetta, icon: ICON_MAP[s.icona] || DEFAULT_ICON }))
  );

  // "Materiali" sempre visibile in fondo
  if (!sezioniConfigurazione.find(s => s.id === 'materiali')) {
    sezioniConfigurazione.push({ id: 'materiali', label: 'Materiali', icon: <Package className="h-5 w-5" /> });
  }

  // Admin menu (hardcoded)
  const adminMenuItems = [
    { id: 'gestione-articoli', label: 'Gestione Articoli', icon: <Package className="h-5 w-5" /> },
    { id: 'gestione-clienti', label: 'Gestione Clienti', icon: <Users className="h-5 w-5" /> },
    { id: 'gestione-opzioni', label: 'Gestione Opzioni', icon: <ListChecks className="h-5 w-5" /> },
    { id: 'gestione-campi', label: 'Gestione Campi', icon: <LayoutList className="h-5 w-5" /> },
    { id: 'gestione-sezioni', label: 'Gestione Sezioni', icon: <Layers className="h-5 w-5" /> },
    { id: 'gestione-utenti', label: 'Gestione Utenti', icon: <UserCog className="h-5 w-5" /> },
    { id: 'rule-engine', label: 'Rule Engine', icon: <Settings2 className="h-5 w-5" /> },
  ];

  const renderMenuItem = (item: { id: string; label: string; icon: React.ReactNode }) => {
    const isActive = activeSection === item.id;
    return (
      <button
        key={item.id}
        onClick={() => onSectionChange(item.id)}
        className={`
          w-full flex items-center gap-3 px-6 py-3 text-left transition-colors
          ${isActive
            ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-700'
            : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
          }
        `}
      >
        <span className={isActive ? 'text-blue-600' : 'text-gray-500'}>{item.icon}</span>
        <span className="font-medium">{item.label}</span>
      </button>
    );
  };

  return (
    <nav className="h-screen overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold text-gray-900">Configuratore</h1>
        <p className="text-sm text-gray-500 mt-1">Elettroquadri S.r.l.</p>
        {progresso > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600">Completamento</span>
              <span className="text-xs font-bold text-blue-600">{progresso}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progresso}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Menu Configurazione (DINAMICO da DB) */}
      <div className="py-4 flex-1">
        <div className="px-6 mb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Configurazione</span>
        </div>
        {sezioniConfigurazione.map(renderMenuItem)}

        {/* Admin */}
        {isAdmin && (
          <>
            <div className="my-4 border-t" />
            <button
              onClick={() => setAdminExpanded(!adminExpanded)}
              className="w-full px-6 py-2 flex items-center justify-between text-gray-400 hover:text-gray-600"
            >
              <span className="text-xs font-semibold uppercase tracking-wider">Amministrazione</span>
              {adminExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {adminExpanded && <div className="mt-2">{adminMenuItems.map(renderMenuItem)}</div>}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-6 border-t mt-auto">
        <div className="text-xs text-gray-500">
          <p>Versione 2.1</p>
          <p className="mt-1">&copy; 2025 Elettroquadri</p>
        </div>
      </div>
    </nav>
  );
};
