import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Settings, ScrollText, LayoutGrid, Cog, Info, DoorOpen,
  Package, Users, ListChecks, LayoutList, UserCog, Settings2,
  ChevronDown, ChevronRight, Layers, Zap, Shield, Cable, Wrench,
  Box, Monitor, Cpu, Power, Lock, CircleDot, ClipboardList,
  GitBranch, Key, Receipt, Ticket, Building2, ShoppingCart,
  Mail, HelpCircle, Timer, BarChart2, ExternalLink,
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const ICON_MAP: Record<string, React.ReactNode> = {
  FileText:    <FileText    className="h-4 w-4" />,
  Settings:    <Settings    className="h-4 w-4" />,
  ScrollText:  <ScrollText  className="h-4 w-4" />,
  LayoutGrid:  <LayoutGrid  className="h-4 w-4" />,
  Cog:         <Cog         className="h-4 w-4" />,
  Info:        <Info        className="h-4 w-4" />,
  DoorOpen:    <DoorOpen    className="h-4 w-4" />,
  Package:     <Package     className="h-4 w-4" />,
  Zap:         <Zap         className="h-4 w-4" />,
  Shield:      <Shield      className="h-4 w-4" />,
  Cable:       <Cable       className="h-4 w-4" />,
  Wrench:      <Wrench      className="h-4 w-4" />,
  Layers:      <Layers      className="h-4 w-4" />,
  Box:         <Box         className="h-4 w-4" />,
  Monitor:     <Monitor     className="h-4 w-4" />,
  Cpu:         <Cpu         className="h-4 w-4" />,
  Power:       <Power       className="h-4 w-4" />,
  Lock:        <Lock        className="h-4 w-4" />,
  GitBranch:   <GitBranch   className="h-4 w-4" />,
  ClipboardList: <ClipboardList className="h-4 w-4" />,
};

const DEFAULT_ICON = <CircleDot className="h-4 w-4" />;

const FALLBACK_SECTIONS = [
  { codice: 'dati_commessa',      etichetta: 'Dati Commessa',      icona: 'FileText'   },
  { codice: 'dati_principali',    etichetta: 'Dati Principali',    icona: 'Settings'   },
  { codice: 'normative',          etichetta: 'Normative',          icona: 'ScrollText' },
  { codice: 'disposizione_vano',  etichetta: 'Disposizione Vano',  icona: 'LayoutGrid' },
  { codice: 'argano',             etichetta: 'Argano',             icona: 'Cog'        },
  { codice: 'info_generale',      etichetta: 'Info Generale',      icona: 'Info'       },
  { codice: 'porte',              etichetta: 'Porte',              icona: 'DoorOpen'   },
  { codice: 'materiali',          etichetta: 'Materiali',          icona: 'Package'    },
];

const ADMIN_MENU_PERMESSI: Record<string, string> = {
  'gestione-articoli':   'admin.articoli',
  'gestione_bom':        'admin.bom',
  'gestione-fornitori':  'admin.articoli',
  'gestione-clienti':    'admin.clienti',
  'gestione-opzioni':    'admin.opzioni',
  'gestione-campi':      'admin.campi',
  'gestione-sezioni':    'admin.sezioni',
  'gestione-utenti':     'admin.utenti',
  'gestione-ruoli':      'admin.utenti',
  'rule-engine':         'admin.regole',
  'pipeline-builder':    'admin.regole',
  'editor-template-doc': 'admin.template_doc',
  'gestione-moduli':     'admin.parametri',
  'fatturazione-config': 'admin.fatturazione',
  'config-email':        'admin.parametri',
  'config-supporto':     'admin.parametri',
};

const ROUTE_NAVIGATION: Record<string, string> = {
  // Sezioni principali (stessa scheda)
  'fatturazione':        '/fatturazione',
  'ordini':              '/ordini',
  'fatturazione-config': '/fatturazione/configurazione',
  'ordini-acquisto':     '/acquisti/oda',

  // Assistenza (nuova scheda)
  'tickets':             '/tickets',
  'impianti':            '/impianti',
  'report-tempi':        '/tickets/report-tempi',

  // Admin — Anagrafica (nuova scheda)
  'gestione-articoli':   '/admin/articoli',
  'gestione_bom':        '/admin/bom',
  'gestione-clienti':    '/admin/clienti',
  'gestione-fornitori':  '/admin/fornitori',

  // Admin — Configuratore (nuova scheda)
  'gestione-campi':        '/admin/campi',
  'gestione-sezioni':      '/admin/sezioni',
  'gestione-opzioni':      '/admin/opzioni',
  'gestione-variabili':    '/admin/variabili-derivate',
  'gestione-elementi-vano':'/admin/elementi-vano',
  'rule-engine':           '/admin/rule-engine',
  'pipeline-builder':      '/admin/pipeline',
  'editor-template-doc':   '/admin/template-doc',

  // Admin — Utenti & Sistema (nuova scheda)
  'gestione-utenti':   '/admin/utenti',
  'gestione-ruoli':    '/admin/ruoli',
  'gestione-moduli':   '/admin/moduli',
  'config-email':      '/admin/config-email',
  'config-supporto':   '/admin/config-supporto',
};

// Sezioni che si aprono in una nuova scheda
const NUOVA_SCHEDA: Set<string> = new Set([
  // Assistenza
  'tickets', 'impianti', 'report-tempi',
  // Tutta l'amministrazione (tutte le voci con permesso admin)
  ...Object.keys(ADMIN_MENU_PERMESSI),
  'gestione-fornitori',
]);

// Sottogruppi admin
interface AdminGroup {
  id:    string;
  label: string;
  icon:  React.ReactNode;
  items: { id: string; label: string; icon: React.ReactNode }[];
}

interface SezioneAPI {
  id: number; codice: string; etichetta: string; icona: string; ordine: number; attivo: boolean;
}

interface SidebarProps {
  activeSection:    string;
  onSectionChange:  (section: string) => void;
  progresso?:       number;
  isAdmin?:         boolean;
  permessi?:        string[];
}

function haPermesso(permessi: string[], codice: string, isAdmin?: boolean): boolean {
  if (isAdmin) return true;
  if (!permessi || permessi.length === 0) return true;
  return permessi.includes(codice);
}

function haAlmenoUnPermessoAdmin(permessi: string[]): boolean {
  if (!permessi || permessi.length === 0) return true;
  return Object.values(ADMIN_MENU_PERMESSI).some(p => permessi.includes(p));
}

export const Sidebar = ({
  activeSection,
  onSectionChange,
  progresso = 0,
  isAdmin = true,
  permessi = [],
}: SidebarProps) => {
  const navigate = useNavigate();

  // Stato espansione: pannello Admin principale + ogni sottogruppo
  const [adminExpanded, setAdminExpanded]     = useState(false);
  const [groupExpanded, setGroupExpanded]     = useState<Record<string, boolean>>({});
  const [sezioniDB,     setSezioniDB]         = useState<SezioneAPI[] | null>(null);
  const [moduliAttivi,  setModuliAttivi]      = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch(`${API_BASE}/moduli-attivi`)
      .then(r => r.ok ? r.json() : {})
      .then(d => setModuliAttivi(d))
      .catch(() => {});
  }, []);

  const fatturazioneAttiva = moduliAttivi['fatturazione'] === true;
  const ticketingAttivo    = moduliAttivi['ticketing']    === true;
  const tempiAttivi        = moduliAttivi['tempi']        === true;
  const odaAttivo          = moduliAttivi['oda']          === true;

  useEffect(() => {
    const load = () => {
      fetch(`${API_BASE}/sezioni-configuratore`)
        .then(r => r.ok ? r.json() : [])
        .then(d => { if (Array.isArray(d) && d.length > 0) setSezioniDB(d.filter((s: SezioneAPI) => s.attivo)); })
        .catch(() => {});
    };
    load();
    window.addEventListener('sezioni-updated', load);
    return () => window.removeEventListener('sezioni-updated', load);
  }, []);

  const sezioniConfigurazione = useMemo(() => {
    const base = sezioniDB
      ? sezioniDB.map(s => ({ id: s.codice, label: s.etichetta, icon: ICON_MAP[s.icona] || DEFAULT_ICON }))
      : FALLBACK_SECTIONS.map(s => ({ id: s.codice, label: s.etichetta, icon: ICON_MAP[s.icona] || DEFAULT_ICON }));
    if (!base.find(s => s.id === 'materiali'))
      base.push({ id: 'materiali', label: 'Materiali',  icon: <Package       className="h-4 w-4" /> });
    if (!base.find(s => s.id === 'ordine'))
      base.push({ id: 'ordine',    label: 'Ordine & BOM', icon: <ClipboardList className="h-4 w-4" /> });
    if (permessi.length > 0) return base.filter(s => haPermesso(permessi, `sezione.${s.id}.view`));
    return base;
  }, [sezioniDB, permessi]);

  // Sottogruppi admin — definiti qui per avere accesso ai flag moduli
  const adminGroups: AdminGroup[] = useMemo(() => {
    const groups: AdminGroup[] = [
      {
        id: 'catalogo', label: 'Catalogo',
        icon: <Package className="h-4 w-4" />,
        items: [
          { id: 'gestione-articoli',  label: 'Articoli',       icon: <Package   className="h-4 w-4" /> },
          { id: 'gestione_bom',       label: 'Distinte base',  icon: <GitBranch className="h-4 w-4" /> },
          { id: 'gestione-fornitori', label: 'Fornitori',      icon: <Building2 className="h-4 w-4" /> },
          { id: 'gestione-clienti',   label: 'Clienti',        icon: <Users     className="h-4 w-4" /> },
        ],
      },
      {
        id: 'configuratore', label: 'Configuratore',
        icon: <Settings2 className="h-4 w-4" />,
        items: [
          { id: 'gestione-opzioni',   label: 'Opzioni',            icon: <ListChecks className="h-4 w-4" /> },
          { id: 'gestione-campi',     label: 'Campi',              icon: <LayoutList className="h-4 w-4" /> },
          { id: 'gestione-sezioni',   label: 'Sezioni',            icon: <Layers     className="h-4 w-4" /> },
          { id: 'rule-engine',        label: 'Rule Engine',        icon: <Settings2  className="h-4 w-4" /> },
          { id: 'import-excel',       label: 'Importa Excel',      icon: <LayoutList className="h-4 w-4" /> },
          { id: 'pipeline-builder',   label: 'Pipeline di calcolo',icon: <Cpu        className="h-4 w-4" /> },
          { id: 'editor-template-doc', label: 'Template documenti', icon: <FileText   className="h-4 w-4" /> },
        ],
      },
      {
        id: 'utenti', label: 'Utenti & Accessi',
        icon: <UserCog className="h-4 w-4" />,
        items: [
          { id: 'gestione-utenti', label: 'Utenti', icon: <UserCog className="h-4 w-4" /> },
          { id: 'gestione-ruoli', label: 'Ruoli',   icon: <Key     className="h-4 w-4" /> },
        ],
      },
      {
        id: 'sistema', label: 'Sistema',
        icon: <Power className="h-4 w-4" />,
        items: [
          { id: 'gestione-moduli',     label: 'Moduli & Parametri',   icon: <Power   className="h-4 w-4" /> },
          ...(fatturazioneAttiva ? [
            { id: 'fatturazione-config', label: 'Config. Fatturazione', icon: <Receipt className="h-4 w-4" /> },
          ] : []),
          ...(ticketingAttivo ? [
            { id: 'config-email',    label: 'Config. Email',    icon: <Mail        className="h-4 w-4" /> },
            { id: 'config-supporto', label: 'Config. Supporto', icon: <HelpCircle  className="h-4 w-4" /> },
          ] : []),
          { id: 'info-app', label: 'Info App', icon: <Info className="h-4 w-4" /> },
        ],
      },
    ];

    // Filtra per permessi
    if (permessi.length === 0) return groups;
    return groups.map(g => ({
      ...g,
      items: g.items.filter(item => {
        const req = ADMIN_MENU_PERMESSI[item.id];
        return req ? haPermesso(permessi, req, isAdmin) : true;
      }),
    })).filter(g => g.items.length > 0);
  }, [permessi, isAdmin, fatturazioneAttiva, ticketingAttivo]);

  const showAdmin = isAdmin || haAlmenoUnPermessoAdmin(permessi);

  const handleItemClick = (itemId: string) => {
    const route = ROUTE_NAVIGATION[itemId];
    if (!route) { onSectionChange(itemId); return; }
    if (NUOVA_SCHEDA.has(itemId)) {
      window.open(route, '_blank');
    } else {
      navigate(route);
    }
  };

  // Voce singola con icona e label compatte
  const renderItem = (item: { id: string; label: string; icon: React.ReactNode }, indent = false) => {
    const isActive = activeSection === item.id;
    return (
      <button
        key={item.id}
        onClick={() => handleItemClick(item.id)}
        className={`
          w-full flex items-center gap-2.5 text-left transition-colors
          ${indent ? 'pl-8 pr-4 py-2' : 'px-6 py-2.5'}
          ${isActive
            ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-700'
            : 'text-gray-600 hover:bg-gray-50 border-l-4 border-transparent'
          }
        `}
      >
        <span className={`shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>{item.icon}</span>
        <span className="text-sm font-medium truncate">{item.label}</span>
      </button>
    );
  };

  const toggleGroup = (id: string) =>
    setGroupExpanded(p => ({ ...p, [id]: !p[id] }));

  return (
    <nav className="h-screen overflow-y-auto flex flex-col bg-white">
      {/* Logo */}
      <div className="p-5 border-b shrink-0">
        <h1 className="text-lg font-bold text-gray-900">Configuratore</h1>
        <p className="text-xs text-gray-500 mt-0.5">Elettroquadri S.r.l.</p>
        {progresso > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Completamento</span>
              <span className="text-xs font-bold text-blue-600">{progresso}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style={{ width: `${progresso}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 py-3 overflow-y-auto">

        {/* ── CONFIGURAZIONE ── */}
        <div className="px-5 mb-1">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Configurazione</span>
        </div>
        {sezioniConfigurazione.map(s => renderItem(s))}

        {/* ── FATTURAZIONE ── */}
        {fatturazioneAttiva && haPermesso(permessi, 'fatturazione.view') && (
          <>
            <div className="mx-5 my-3 border-t border-gray-100" />
            <div className="px-5 mb-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Fatturazione</span>
            </div>
            {renderItem({ id: 'fatturazione', label: 'Fatture', icon: <Receipt className="h-4 w-4" /> })}
            {renderItem({ id: 'ordini',       label: 'Ordini',  icon: <Package className="h-4 w-4" /> })}
          </>
        )}

        {/* ── ACQUISTI ── */}
        {odaAttivo && (
          <>
            <div className="mx-5 my-3 border-t border-gray-100" />
            <div className="px-5 mb-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Acquisti</span>
            </div>
            {renderItem({ id: 'ordini-acquisto', label: 'Ordini di Acquisto', icon: <ShoppingCart className="h-4 w-4" /> })}
          </>
        )}

        {/* ── ASSISTENZA ── */}
        {ticketingAttivo && haPermesso(permessi, 'ticketing.view') && (
          <>
            <div className="mx-5 my-3 border-t border-gray-100" />
            <div className="px-5 mb-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Assistenza</span>
            </div>
            {renderItem({ id: 'tickets',  label: 'Ticket',   icon: <Ticket    className="h-4 w-4" /> })}
            {renderItem({ id: 'impianti', label: 'Impianti', icon: <Building2 className="h-4 w-4" /> })}
            {tempiAttivi && renderItem({ id: 'report-tempi', label: 'Report tempi', icon: <Timer className="h-4 w-4" /> })}
          </>
        )}

        {/* ── AMMINISTRAZIONE ── */}
        {showAdmin && adminGroups.length > 0 && (
          <>
            <div className="mx-5 my-3 border-t border-gray-100" />

            {/* Toggle pannello admin */}
            <button
              onClick={() => setAdminExpanded(p => !p)}
              className="w-full px-5 py-2 flex items-center justify-between text-gray-400 hover:text-gray-600 group"
            >
              <span className="text-[10px] font-bold uppercase tracking-widest group-hover:text-gray-600">
                Amministrazione
              </span>
              {adminExpanded
                ? <ChevronDown  className="h-3.5 w-3.5" />
                : <ChevronRight className="h-3.5 w-3.5" />}
            </button>

            {adminExpanded && (
              <div className="mt-1">
                {adminGroups.map(group => (
                  <div key={group.id}>
                    {/* Header gruppo */}
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className="w-full flex items-center gap-2 px-6 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-gray-400">{group.icon}</span>
                      <span className="text-xs font-semibold flex-1 text-left">{group.label}</span>
                      {groupExpanded[group.id]
                        ? <ChevronDown  className="h-3 w-3 text-gray-400" />
                        : <ChevronRight className="h-3 w-3 text-gray-400" />}
                    </button>

                    {/* Voci gruppo */}
                    {groupExpanded[group.id] && (
                      <div className="bg-gray-50/50">
                        {group.items.map(item => renderItem(item, true))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t shrink-0 space-y-3">
        {/* Portale Cliente */}
        <button
          onClick={() => window.open('/portale', '_blank')}
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors group"
        >
          <ExternalLink className="h-4 w-4 shrink-0" />
          <span className="font-medium">Portale Cliente</span>
        </button>
        <p className="text-xs text-gray-400">v3.0 &middot; &copy; 2026 Elettroquadri</p>
      </div>
    </nav>
  );
};
