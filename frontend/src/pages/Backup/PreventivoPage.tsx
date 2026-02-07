import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { 
  FileText, 
  Settings, 
  Zap, 
  Package, 
  Shield,
  LayoutGrid,
  Wrench,
  ChevronRight
} from 'lucide-react';

import { getPreventivo } from '@/services/preventivi.service';
import { CustomerNameEditor } from '@/components/CustomerNameEditor';
import { Sidebar } from '@/components/Sidebar';
import { PDFButton } from '@/components/PDFButton';

// Import form components
import { DatiCommessaForm } from '@/components/sections/DatiCommessaForm';
import { DatiPrincipaliForm } from '@/components/sections/DatiPrincipaliForm';
import { ArganoForm } from '@/components/sections/ArganoForm';
import { NormativeForm } from '@/components/sections/NormativeForm';
import DisposizioneVanoForm from '@/components/sections/DisposizioneVanoForm';
import { MaterialiForm } from '@/components/sections/MaterialiForm';
import { TabellaMaterialiAutomatici } from '@/components/sections/TabellaMaterialiAutomatici';

// ==========================================
// TYPES
// ==========================================

type SectionId = 
  | 'dati-commessa'
  | 'dati-principali'
  | 'argano'
  | 'normative'
  | 'disposizione-vano'
  | 'materiali'
  | 'materiali-automatici'
  | 'rule-designer';

interface Section {
  id: SectionId;
  title: string;
  icon: React.ReactNode;
  component: React.ReactNode;
  adminOnly?: boolean;
}

// Helper per ottenere utente corrente
function getCurrentUser() {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

// ==========================================
// COMPONENTE PRINCIPALE
// ==========================================

export default function PreventivoPage() {
  const { id } = useParams<{ id: string }>();
  const preventivoId = parseInt(id || '1', 10);
  const [activeSection, setActiveSection] = useState<SectionId>('dati-commessa');

  // Query preventivo
  const { data: preventivo, isLoading } = useQuery({
    queryKey: ['preventivo', preventivoId],
    queryFn: () => getPreventivo(preventivoId),
  });

  // Ottieni utente corrente da localStorage
  const user = getCurrentUser();
  const isAdmin = user?.is_admin || false;

  // ==========================================
  // CONFIGURAZIONE SEZIONI
  // ==========================================

  const sections: Section[] = [
    {
      id: 'dati-commessa',
      title: 'Dati Commessa',
      icon: <FileText className="w-5 h-5" />,
      component: <DatiCommessaForm />
    },
    {
      id: 'dati-principali',
      title: 'Dati Principali',
      icon: <Settings className="w-5 h-5" />,
      component: <DatiPrincipaliForm preventivoId={preventivoId} />
    },
    {
      id: 'argano',
      title: 'Argano',
      icon: <Zap className="w-5 h-5" />,
      component: <ArganoForm preventivoId={preventivoId} />
    },
    {
      id: 'normative',
      title: 'Normative',
      icon: <Shield className="w-5 h-5" />,
      component: <NormativeForm preventivoId={preventivoId} />
    },
    {
      id: 'disposizione-vano',
      title: 'Disposizione Vano',
      icon: <LayoutGrid className="w-5 h-5" />,
      component: <DisposizioneVanoForm preventivoId={preventivoId} />
    },
    {
      id: 'materiali',
      title: 'Materiali',
      icon: <Package className="w-5 h-5" />,
      component: <MaterialiForm preventivoId={preventivoId} />
    },
    {
      id: 'materiali-automatici',
      title: 'Materiali Automatici',
      icon: <Zap className="w-5 h-5" />,
      component: <TabellaMaterialiAutomatici preventivoId={preventivoId} />
    },
    {
      id: 'rule-designer',
      title: 'Rule Designer',
      icon: <Wrench className="w-5 h-5" />,
      component: <RuleDesignerPlaceholder />,
      adminOnly: true
    }
  ];

  const visibleSections = sections.filter(
    section => !section.adminOnly || isAdmin
  );

  const currentSection = sections.find(s => s.id === activeSection);

  // Handler per cambio sezione
  const handleSectionChange = (sectionId: SectionId) => {
    setActiveSection(sectionId);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeSection]);

  // ==========================================
  // LOADING STATE
  // ==========================================

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Caricamento preventivo...</p>
        </div>
      </div>
    );
  }

  if (!preventivo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            Preventivo non trovato
          </h2>
          <p className="text-gray-600">
            Il preventivo richiesto non esiste o non è accessibile
          </p>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar FIXED a sinistra */}
      <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 overflow-y-auto z-40">
        <Sidebar<SectionId>
          sections={visibleSections.map(s => ({
            id: s.id,
            title: s.title,
            icon: s.icon,
            adminOnly: s.adminOnly
          }))}
          activeSection={activeSection}
          onSectionChange={handleSectionChange}
        />
      </aside>

      {/* Container principale - inizia dopo la sidebar (ml-64) */}
      <div className="ml-64">
        {/* Header STICKY - rimane visibile quando scrolli */}
        <header className="sticky top-0 bg-white border-b border-gray-200 shadow-sm z-30">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Info preventivo */}
              <div className="flex items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-2xl font-bold text-gray-900">
                      {preventivo.numero_preventivo}
                    </h1>
                    {preventivo.status && (
                      <span className={`
                        px-2 py-1 rounded-full text-xs font-semibold
                        ${preventivo.status === 'draft' ? 'bg-yellow-100 text-yellow-800' : ''}
                        ${preventivo.status === 'sent' ? 'bg-blue-100 text-blue-800' : ''}
                        ${preventivo.status === 'approved' ? 'bg-green-100 text-green-800' : ''}
                      `}>
                        {preventivo.status.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <CustomerNameEditor
                    preventivoId={preventivoId}
                    currentName={preventivo.customer_name || 'Cliente'}
                  />
                </div>
              </div>

              {/* Azioni header */}
              <div className="flex items-center gap-3">
                <PDFButton preventivoId={preventivoId} />
                
                {/* Badge sezione attiva */}
                <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg">
                  {currentSection?.icon}
                  <span className="text-sm font-medium text-blue-900">
                    {currentSection?.title}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Contenuto principale */}
        <main className="p-6">
          <div className="max-w-6xl mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-6">
              <span>Preventivi</span>
              <ChevronRight className="w-4 h-4" />
              <span>{preventivo.numero_preventivo}</span>
              <ChevronRight className="w-4 h-4" />
              <span className="text-gray-900 font-medium">
                {currentSection?.title}
              </span>
            </div>

            {/* Contenuto sezione */}
            <div className="animate-fade-in">
              {currentSection?.component}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ==========================================
// PLACEHOLDER COMPONENTE RULE DESIGNER
// ==========================================

function RuleDesignerPlaceholder() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Rule Designer</h1>
        <p className="text-sm text-slate-600 mt-1">
          Gestione regole automatiche per calcolo materiali
        </p>
      </div>

      <div className="bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg p-8">
        <div className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-4 bg-purple-100 rounded-full">
              <Wrench className="w-12 h-12 text-purple-600" />
            </div>
          </div>
          
          <h3 className="text-xl font-bold text-gray-900">
            Rule Designer
          </h3>
          
          <p className="text-gray-600 max-w-md mx-auto">
            Questa sezione permette agli amministratori di gestire le regole automatiche
            che determinano quali materiali vengono aggiunti in base alla configurazione.
          </p>

          <div className="pt-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-800 rounded-lg text-sm font-medium">
              <Zap className="w-4 h-4" />
              Accessibile solo agli amministratori
            </div>
          </div>

          {/* Info regole attive */}
          <div className="mt-6 pt-6 border-t border-purple-200">
            <p className="text-sm text-gray-600 mb-3">Regole attualmente attive:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="p-3 bg-white rounded-lg border border-purple-200">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-purple-600" />
                  <span className="font-mono text-sm font-semibold">RULE_GEARLESS_MRL_001</span>
                </div>
                <p className="text-xs text-gray-600">
                  Trigger: Trazione = "Gearless MRL"
                </p>
              </div>

              <div className="p-3 bg-white rounded-lg border border-purple-200">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="w-4 h-4 text-blue-600" />
                  <span className="font-mono text-sm font-semibold">RULE_EN81_20_2020</span>
                </div>
                <p className="text-xs text-gray-600">
                  Trigger: EN 81-20 = "2020"
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
