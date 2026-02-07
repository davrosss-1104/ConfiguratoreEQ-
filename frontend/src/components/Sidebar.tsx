import { useState } from 'react';
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
  Columns3,
  UserCog,
  Settings2,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

type SectionType =
  | 'dati-commessa'
  | 'dati-principali'
  | 'normative'
  | 'disposizione-vano'
  | 'argano'
  | 'info-generale'
  | 'porte'
  | 'materiali'
  // Sezioni Admin
  | 'gestione-articoli'
  | 'gestione-clienti'
  | 'gestione-opzioni'
  | 'gestione-campi'
  | 'gestione-utenti'
  | 'rule-engine';

interface SidebarProps {
  activeSection: SectionType;
  onSectionChange: (section: SectionType) => void;
  progresso?: number;
  isAdmin?: boolean;
}

interface MenuItem {
  id: SectionType;
  label: string;
  icon: React.ReactNode;
  completed?: boolean;
  adminOnly?: boolean;
}

export const Sidebar = ({ 
  activeSection, 
  onSectionChange, 
  progresso = 0,
  isAdmin = true // Default true per sviluppo
}: SidebarProps) => {
  const [adminExpanded, setAdminExpanded] = useState(false);

  // Menu principale preventivo
  const mainMenuItems: MenuItem[] = [
    {
      id: 'dati-commessa',
      label: 'Dati Commessa',
      icon: <FileText className="h-5 w-5" />,
    },
    {
      id: 'dati-principali',
      label: 'Dati Principali',
      icon: <Settings className="h-5 w-5" />,
    },
    {
      id: 'normative',
      label: 'Normative',
      icon: <ScrollText className="h-5 w-5" />,
    },
    {
      id: 'disposizione-vano',
      label: 'Disposizione Vano',
      icon: <LayoutGrid className="h-5 w-5" />,
    },
    {
      id: 'argano',
      label: 'Argano',
      icon: <Cog className="h-5 w-5" />,
    },
    {
      id: 'info-generale',
      label: 'Info Generale',
      icon: <Info className="h-5 w-5" />,
    },
    {
      id: 'porte',
      label: 'Porte',
      icon: <DoorOpen className="h-5 w-5" />,
    },
    {
      id: 'materiali',
      label: 'Materiali',
      icon: <Package className="h-5 w-5" />,
    },
  ];

  // Menu admin
  const adminMenuItems: MenuItem[] = [
    {
      id: 'gestione-articoli',
      label: 'Gestione Articoli',
      icon: <Package className="h-5 w-5" />,
      adminOnly: true,
    },
    {
      id: 'gestione-clienti',
      label: 'Gestione Clienti',
      icon: <Users className="h-5 w-5" />,
      adminOnly: true,
    },
    {
      id: 'gestione-opzioni',
      label: 'Gestione Opzioni',
      icon: <ListChecks className="h-5 w-5" />,
      adminOnly: true,
    },
    {
      id: 'gestione-campi',
      label: 'Gestione Campi',
      icon: <Columns3 className="h-5 w-5" />,
      adminOnly: true,
    },
    {
      id: 'gestione-utenti',
      label: 'Gestione Utenti',
      icon: <UserCog className="h-5 w-5" />,
      adminOnly: true,
    },
    {
      id: 'rule-engine',
      label: 'Rule Engine',
      icon: <Settings2 className="h-5 w-5" />,
      adminOnly: true,
    },
  ];

  const renderMenuItem = (item: MenuItem) => {
    const isActive = activeSection === item.id;
    
    return (
      <button
        key={item.id}
        onClick={() => onSectionChange(item.id)}
        className={`
          w-full flex items-center gap-3 px-6 py-3 text-left transition-colors
          ${
            isActive
              ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-700'
              : 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
          }
        `}
      >
        <span className={isActive ? 'text-blue-600' : 'text-gray-500'}>
          {item.icon}
        </span>
        <span className="font-medium">{item.label}</span>
        {item.completed && (
          <svg
            className="ml-auto h-5 w-5 text-green-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </button>
    );
  };

  return (
    <nav className="h-screen overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold text-gray-900">Configuratore</h1>
        <p className="text-sm text-gray-500 mt-1">Elettroquadri S.r.l.</p>
        
        {/* Mini progress bar */}
        {progresso > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-600">Completamento</span>
              <span className="text-xs font-bold text-blue-600">{progresso}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progresso}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      {/* Menu principale */}
      <div className="py-4 flex-1">
        <div className="px-6 mb-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Configurazione
          </span>
        </div>
        {mainMenuItems.map(renderMenuItem)}

        {/* Sezione Admin (solo se isAdmin) */}
        {isAdmin && (
          <>
            <div className="my-4 border-t" />
            
            {/* Header Admin collapsibile */}
            <button
              onClick={() => setAdminExpanded(!adminExpanded)}
              className="w-full px-6 py-2 flex items-center justify-between text-gray-400 hover:text-gray-600"
            >
              <span className="text-xs font-semibold uppercase tracking-wider">
                Amministrazione
              </span>
              {adminExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {/* Menu admin */}
            {adminExpanded && (
              <div className="mt-2">
                {adminMenuItems.map(renderMenuItem)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-6 border-t mt-auto">
        <div className="text-xs text-gray-500">
          <p>Versione 2.0</p>
          <p className="mt-1">© 2025 Elettroquadri</p>
        </div>
      </div>
    </nav>
  );
};
