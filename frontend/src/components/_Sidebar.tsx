import { useState, useEffect, useMemo } from 'react';
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
  ClipboardList,
  GitBranch,
  Key,
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
  'GitBranch': <GitBranch className="h-5 w-5" />,
  ClipboardList: <ClipboardList className="h-5 w-5" />,
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

// Mappa admin menu item -> permesso richiesto
const ADMIN_MENU_PERMESSI: Record<string, string> = {
  'gestione-articoli': 'admin.articoli',
  'gestione_bom': 'admin.bom',
  'gestione-clienti': 'admin.clienti',
  'gestione-opzioni': 'admin.opzioni',
  'gestione-campi': 'admin.campi',
  'gestione-sezioni': 'admin.sezioni',
  'gestione-utenti': 'admin.utenti',
  'gestione-ruoli': 'admin.utenti',
  'rule-engine': 'admin.regole',
  'pipeline-builder': 'admin.regole',
  'editor-template-doc': 'admin.template_doc',
};

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
  permessi?: string[];
}

// ==========================================
// HELPER: controlla permesso
// ==========================================
function haPermesso(permessi: string[], codice: string): boolean {
  if (!permessi || permessi.length === 0) return true; // Nessun filtro → mostra tutto (retrocompatibilità)
  return permessi.includes(codice);
}

function haAlmenoUnPermessoAdmin(permessi: string[]): boolean {
  if (!permessi || permessi.length === 0) return true;
  return Object.values(ADMIN_MENU_PERMESSI).some(p => permessi.includes(p));
}

// ==========================================
// COMPONENTE
// ==========================================
export const Sidebar = ({ 
  activeSection, 
  onSectionChange, 
  progresso = 0,
  isAdmin = true,
  permessi = [],
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

  // Sezioni: da DB oppure fallback, filtrate per permessi
  const sezioniConfigurazione = useMemo(() => {
    const base = sezioniDB
      ? sezioniDB.map(s => ({ id: s.codice, label: s.etichetta, icon: ICON_MAP[s.icona] || DEFAULT_ICON }))
      : FALLBACK_SECTIONS.map(s => ({ id: s.codice, label: s.etichetta, icon: ICON_MAP[s.icona] || DEFAULT_ICON }));

    // "Materiali" sempre visibile in fondo (se non già presente)
    if (!base.find(s => s.id === 'materiali')) {
      base.push({ id: 'materiali', label: 'Materiali', icon: <Package className="h-5 w-5" /> });
    }

    // "Ordine & BOM" sempre visibile in fondo
    if (!base.find(s => s.id === 'ordine')) {
      base.push({ id: 'ordine', label: 'Ordine & BOM', icon: <ClipboardList className="h-5 w-5" /> });
    }

    // Filtra per permesso sezione.{codice}.view
    if (permessi.length > 0) {
      return base.filter(s => haPermesso(permessi, `sezione.${s.id}.view`));
    }
    return base;
  }, [sezioniDB, permessi]);

  // Admin menu (filtrato per permessi)
  const adminMenuItems = useMemo(() => {
    const allItems = [
      { id: 'gestione-articoli', label: 'Gestione Articoli', icon: <Package className="h-5 w-5" /> },
      { id: 'gestione_bom', label: 'Gestione BOM', icon: <GitBranch className="h-5 w-5" /> },
      { id: 'gestione-clienti', label: 'Gestione Clienti', icon: <Users className="h-5 w-5" /> },
      { id: 'gestione-opzioni', label: 'Gestione Opzioni', icon: <ListChecks className="h-5 w-5" /> },
      { id: 'gestione-campi', label: 'Gestione Campi', icon: <LayoutList className="h-5 w-5" /> },
      { id: 'gestione-sezioni', label: 'Gestione Sezioni', icon: <Layers className="h-5 w-5" /> },
      { id: 'gestione-utenti', label: 'Gestione Utenti', icon: <UserCog className="h-5 w-5" /> },
      { id: 'gestione-ruoli', label: 'Gestione Ruoli', icon: <Key className="h-5 w-5" /> },
      { id: 'rule-engine', label: 'Rule Engine', icon: <Settings2 className="h-5 w-5" /> },
      { id: 'import-excel', label: 'Importa da Excel', icon: <LayoutList className="h-5 w-5" /> },
      { id: 'pipeline-builder', label: 'Pipeline di Calcolo', icon: <Cpu className="h-5 w-5" /> },
      { id: 'editor-template-doc', label: 'Template Documenti', icon: <FileText className="h-5 w-5" /> },
      { id: 'info-app', label: 'Info App', icon: <Info className="h-5 w-5" /> },
  ];

    // Se abbiamo permessi, filtra
    if (permessi.length > 0) {
      return allItems.filter(item => {
        const permReq = ADMIN_MENU_PERMESSI[item.id];
        return permReq ? haPermesso(permessi, permReq) : true;
      });
    }
    return allItems;
  }, [permessi]);

  // Mostra sezione admin?
  const showAdmin = isAdmin || haAlmenoUnPermessoAdmin(permessi);

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

      {/* Menu Configurazione (DINAMICO da DB, filtrato per permessi) */}
      <div className="py-4 flex-1">
        <div className="px-6 mb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Configurazione</span>
        </div>
        {sezioniConfigurazione.map(renderMenuItem)}

        {/* Admin */}
        {showAdmin && adminMenuItems.length > 0 && (
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
          <p>Versione 3.0</p>
          <p className="mt-1">&copy; 2026 Elettroquadri</p>
        </div>
      </div>
    </nav>
  );
};
