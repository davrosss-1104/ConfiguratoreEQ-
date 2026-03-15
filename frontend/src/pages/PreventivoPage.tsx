/**
 * PreventivoPage.tsx
 * Posizionare in: frontend/src/pages/PreventivoPage.tsx
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Sidebar } from '@/components/Sidebar';
import { DatiCommessaForm } from "@/components/sections/DatiCommessaForm";
// DatiPrincipaliForm e NormativeForm → ora DynamicSectionForm (migrate_orm_to_dynamic.py)
import DisposizioneVanoForm from "@/components/sections/DisposizioneVanoForm";
import OrdinePanel from "@/components/sections/OrdinePanel";
import { MaterialsTable } from "@/components/MaterialsTable";
import { CustomerNameEditor } from "@/components/CustomerNameEditor";
import { ExportButtons } from '@/components/ExportButtons';
import { getDatiCommessa, getDatiPrincipali, getNormative, getDisposizioneVano, getPreventivo } from '@/services/preventivi.service';
import { GestioneArticoliPage } from '@/components/sections/GestioneArticoliPage';
import GestioneOpzioniPage from '@/components/sections/GestioneOpzioniPage';
import GestioneCampiPage from '@/components/sections/GestioneCampiPage';
import GestioneSezioniPage from '@/components/sections/GestioneSezioniPage';
import { GestioneUtentiPage } from '@/components/sections/GestioneUtentiPage';
import { GestioneRuoliPage } from '@/components/sections/GestioneRuoliPage';
import RuleBuilderPage from '@/components/sections/RuleBuilderPage';
import PipelineBuilderPage from '@/components/sections/PipelineBuilderPage';
import GestioneClientiPage from '@/components/sections/GestioneClientiPage';
import GestioneBomPage from '@/components/sections/GestioneBomPage';
import DynamicSectionForm from '@/components/sections/DynamicSectionForm';
import { Building, ArrowLeft, FileText } from 'lucide-react';
import RevisioniDrawer from '@/components/RevisioniDrawer';
import DocumentTemplateEditorPage from '@/pages/DocumentTemplateEditorPage';
import ImportExcelPage from '@/components/sections/ImportExcelPage';
import InfoAppPage from '@/components/sections/InfoAppPage';
import GestioneModuliPage from '@/components/sections/GestioneModuliPage';
import GestioneVariabiliDerivatePage from '@/components/sections/GestioneVariabiliDerivatePage';
import GestioneElementiVanoPage from '@/components/sections/GestioneElementiVanoPage';

const API = import.meta.env.VITE_API_URL ?? '';

// Colori sfondo per categoria
const CATEGORY_THEMES = {
  RISE: {
    pageBg: 'bg-green-100/60',
    progressBar: 'bg-green-600',
    progressText: 'text-green-700',
    badge: 'bg-green-100 text-green-800',
    sidebarAccent: '#41923a',
  },
  HOME: {
    pageBg: 'bg-amber-100/60',
    progressBar: 'bg-amber-500',
    progressText: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-800',
    sidebarAccent: '#e1a51b',
  },
  DEFAULT: {
    pageBg: 'bg-gray-50',
    progressBar: 'bg-blue-600',
    progressText: 'text-blue-600',
    badge: '',
    sidebarAccent: '#2563eb',
  },
} as const;

export const PreventivoPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const preventivoId = parseInt(id || '1', 10);

  if (isNaN(preventivoId)) {
    navigate('/');
    return null;
  }

  // ── Leggi user da localStorage per permessi/admin ──
  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }, []);
  const userIsAdmin = currentUser.is_admin || false;
  const userPermessi: string[] = currentUser.permessi || [];

  const [activeSection, setActiveSection] = useState('dati_commessa');

  const [showRevDialog, setShowRevDialog] = useState(false);
  const [showRevDrawer, setShowRevDrawer] = useState(false);
  const pendingNavigationRef = useRef<string | null>(null);

  const { data: preventivo, refetch: refetchPreventivo } = useQuery({
    queryKey: ['preventivo', preventivoId],
    queryFn: () => getPreventivo(preventivoId),
  });

  const { data: datiCommessa } = useQuery({
    queryKey: ['datiCommessa', preventivoId],
    queryFn: () => getDatiCommessa(preventivoId),
  });

  const { data: datiPrincipali } = useQuery({
    queryKey: ['datiPrincipali', preventivoId],
    queryFn: () => getDatiPrincipali(preventivoId),
  });

  const { data: normative } = useQuery({
    queryKey: ['normative', preventivoId],
    queryFn: () => getNormative(preventivoId),
  });

  const { data: disposizioneVano } = useQuery({
    queryKey: ['disposizioneVano', preventivoId],
    queryFn: () => getDisposizioneVano(preventivoId),
  });

  // Carica dati cliente dal cliente_id del preventivo
  const clienteId = (preventivo as any)?.cliente_id;
  const { data: cliente } = useQuery({
    queryKey: ['cliente', clienteId],
    queryFn: async () => {
      const res = await fetch(`/clienti/${clienteId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!clienteId,
  });

  // ── Dirty check ──
  const { data: dirtyData } = useQuery({
    queryKey: ['dirty', preventivoId],
    queryFn: async () => {
      const res = await fetch(`${API}/preventivi/${preventivoId}/dirty`);
      if (!res.ok) return { dirty: false };
      return res.json();
    },
    refetchInterval: 10000,
  });

  const isDirty = dirtyData?.dirty === true;

  // ── Crea snapshot ──
  const snapshotMutation = useMutation({
    mutationFn: async (motivo: string) => {
      const res = await fetch(`${API}/preventivi/${preventivoId}/revisioni`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo }),
      });
      if (!res.ok) throw new Error('Errore creazione snapshot');
      return res.json();
    },
    onSuccess: () => { refetchPreventivo(); },
  });

  // ── Prompt uscita browser ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = 'Hai modifiche non salvate come revisione. Uscire?';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Gestione "Home" con prompt revisione ──
  const handleGoHome = useCallback(() => {
    if (isDirty) {
      pendingNavigationRef.current = '/';
      setShowRevDialog(true);
    } else {
      navigate('/');
    }
  }, [isDirty, navigate]);

  const handleRevDialogSave = useCallback(async () => {
    try { await snapshotMutation.mutateAsync('Snapshot automatico alla uscita'); } catch {}
    setShowRevDialog(false);
    if (pendingNavigationRef.current) { navigate(pendingNavigationRef.current); pendingNavigationRef.current = null; }
  }, [snapshotMutation, navigate]);

  const handleRevDialogSkip = useCallback(() => {
    setShowRevDialog(false);
    if (pendingNavigationRef.current) { navigate(pendingNavigationRef.current); pendingNavigationRef.current = null; }
  }, [navigate]);

  const handleRevDialogCancel = useCallback(() => {
    setShowRevDialog(false);
    pendingNavigationRef.current = null;
  }, []);

  const rawCategoria = (preventivo as any)?.categoria as string | undefined;
  const categoria = rawCategoria && rawCategoria in CATEGORY_THEMES 
    ? rawCategoria as keyof typeof CATEGORY_THEMES 
    : undefined;
  const theme = categoria ? CATEGORY_THEMES[categoria] : CATEGORY_THEMES.DEFAULT;
  const revisioneCorrente = (preventivo as any)?.revisione_corrente ?? 0;

  const calcolaProgresso = (): number => {
    let completati = 0;
    const sezioni = 4;
    if (datiCommessa?.numero_offerta) completati++;
    if (datiPrincipali?.numero_fermate && datiPrincipali.numero_fermate > 0) completati++;
    if (normative?.en_81_20) completati++;
    if (disposizioneVano?.posizione_quadro_lato) completati++;
    return Math.round((completati / sezioni) * 100);
  };

  const progresso = calcolaProgresso();

  const renderSection = () => {
    // *** Normalizza: sia 'dati-commessa' che 'dati_commessa' → stessa chiave ***
    const section = activeSection.replace(/-/g, '_');

    switch (section) {
      case 'dati_commessa':
        return <DatiCommessaForm />;
      
      case 'disposizione_vano':
        return <DisposizioneVanoForm preventivoId={preventivoId} />;
      
      case 'dati_principali':
      case 'normative':
      case 'argano':
      case 'quadro':
      case 'tensioni':
      case 'vano':
      case 'info_generale':
      case 'porte':
      case 'cabina':
      case 'porte_lato_a':
      case 'porte_lato_b':
      case 'operatore_a':
        return (
          <DynamicSectionForm
            key={section}
            preventivoId={preventivoId}
            sezioneCode={section}
            sezioneName={section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            onDataChange={() => {}}
          />
        );

      case 'materiali':
        return (
          <div className="p-6 bg-white/70 rounded-lg shadow">
            <h2 className="text-2xl font-bold mb-4">Materiali</h2>
            <MaterialsTable preventivoId={preventivoId} />
          </div>
        );

      case 'gestione_clienti': return <GestioneClientiPage />;
      case 'gestione_bom': return <GestioneBomPage />;

      case 'ordine':
        return <OrdinePanel />;

      // --- Sezioni Admin ---
      case 'gestione_articoli':
        return <GestioneArticoliPage />;
      case 'gestione_opzioni':
        return <GestioneOpzioniPage />;
      case 'gestione_campi':
        return <GestioneCampiPage />;
      case 'gestione_sezioni':
        return <GestioneSezioniPage />;
      case 'gestione_utenti':
        return <GestioneUtentiPage />;
      case 'gestione_ruoli':
        return <GestioneRuoliPage />;
      case 'rule_engine':
        return <RuleBuilderPage />;
      case 'pipeline_builder':
        return <PipelineBuilderPage />;
      case 'editor_template_doc':
        return <DocumentTemplateEditorPage />;
      case 'import_excel':
        return <ImportExcelPage onNavigate={(section: string) => setActiveSection(section)} />;
      case 'info_app':
        return <InfoAppPage />;
      case 'gestione_moduli':
        return <GestioneModuliPage />;
      case 'variabili_derivate':
        return <GestioneVariabiliDerivatePage />;
      case 'gestione_elementi_vano':
        return <GestioneElementiVanoPage />;

      default:
        // Fallback: tutte le sezioni non gestite usano il form dinamico
        return (
          <DynamicSectionForm
            key={section}
            preventivoId={preventivoId}
            sezioneCode={section}
            sezioneName={section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            onDataChange={() => {}}
          />
        );
    }
  };

  // Nasconde colonna materiali laterale per sezioni fullwidth
  const sectionNorm = activeSection.replace(/-/g, '_');
  const hideSideMaterials = sectionNorm === 'materiali' || sectionNorm === 'ordine'
    || sectionNorm.startsWith('gestione_') || sectionNorm === 'rule_engine'
    || sectionNorm === 'pipeline_builder'
    || sectionNorm === 'editor_template_doc'
    || sectionNorm === 'import_excel' || sectionNorm === 'info_app';

  return (
    <div className={`flex min-h-screen ${theme.pageBg}`}>
      {/* Sidebar sinistra */}
      <div className="w-64 bg-white/80 shadow-lg">
        {categoria && (
          <div className="h-1" style={{ backgroundColor: theme.sidebarAccent }} />
        )}
        <Sidebar 
          activeSection={activeSection}
          onSectionChange={(section) => setActiveSection(section)}
          progresso={progresso}
          isAdmin={userIsAdmin}
          permessi={userPermessi}
        />
      </div>

      {/* Contenuto principale */}
      <div className="flex-1 p-6">
        {/* === TESTATA: N° Preventivo + Cliente + Status === */}
        <div className="mb-4">
          <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow px-5 py-3">
            <div className="flex items-center justify-between">
              {/* Sinistra: Back + N° + Categoria */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGoHome}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                  title="Torna alla Home"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="text-lg font-bold text-gray-900">
                    {(preventivo as any)?.numero_preventivo || '...'}
                  </span>
                  {categoria && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${theme.badge}`}>
                      {categoria}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    (preventivo as any)?.status === 'confermato' 
                      ? 'bg-green-100 text-green-700' 
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {(preventivo as any)?.status === 'confermato' ? 'Confermato' 
                      : (preventivo as any)?.status === 'draft' ? 'Bozza' 
                      : (preventivo as any)?.status || '...'}
                  </span>
                  {revisioneCorrente > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300">
                      REV.{revisioneCorrente}
                    </span>
                  )}
                  {isDirty && (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300"
                      title="Modifiche non salvate come revisione">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Modificato
                    </span>
                  )}
                  <button
                    onClick={() => setShowRevDrawer(true)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors"
                    title="Gestione revisioni"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3v18M6 3l6 6M6 3L0 9M18 21V3M18 21l6-6M18 21l-6-6" />
                    </svg>
                    Revisioni
                  </button>
                </div>
              </div>

              {/* Centro: Cliente */}
              <div className="flex items-center gap-2 text-sm">
                {cliente ? (
                  <>
                    <Building className="w-4 h-4 text-green-600" />
                    <span className="font-medium text-gray-800">{cliente.ragione_sociale}</span>
                    <span className="text-gray-400">({cliente.codice})</span>
                  </>
                ) : (
                  <span className="text-gray-400 italic">Nessun cliente selezionato</span>
                )}
              </div>

              {/* Destra: Utente + Export */}
              <div className="flex items-center gap-3">
                {currentUser?.nome || currentUser?.username ? (
                  <span className="text-xs text-gray-400 border-r pr-3 border-gray-200">
                    {currentUser.nome || currentUser.username}
                  </span>
                ) : null}
                <ExportButtons 
                preventivoId={preventivoId}
                numeroPreventivo={(preventivo as any)?.numero_preventivo}
              />
              </div>
            </div>

            {/* Barra progresso compatta */}
            <div className="mt-2 flex items-center gap-3">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div
                  className={`${theme.progressBar} h-1.5 rounded-full transition-all duration-500`}
                  style={{ width: `${progresso}%` }}
                />
              </div>
              <span className={`text-xs font-medium ${theme.progressText}`}>
                {progresso}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-6">
          {/* Colonna sinistra - Sezione principale */}
          <div className="flex-1">
            {renderSection()}
          </div>

          {/* Colonna destra - Materiali */}
          {!hideSideMaterials && (
            <div className="w-96">
              <MaterialsTable 
                preventivoId={preventivoId} 
                className="sticky top-6"
              />
              </div>
            )}
        </div>
      </div>

      {/* Dialog "Salvare revisione prima di uscire?" */}
      {showRevDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900">Salvare come nuova revisione?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Hai apportato modifiche dall'ultimo snapshot. Salvare come nuova revisione prima di uscire?
            </p>
            <div className="flex gap-3">
              <button onClick={handleRevDialogSave} disabled={snapshotMutation.isPending}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50">
                {snapshotMutation.isPending ? 'Salvataggio...' : 'Salva Revisione'}
              </button>
              <button onClick={handleRevDialogSkip}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium py-2.5 px-4 rounded-lg transition-colors">
                Esci senza salvare
              </button>
              <button onClick={handleRevDialogCancel}
                className="px-4 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer revisioni */}
      <RevisioniDrawer
        isOpen={showRevDrawer}
        onClose={() => setShowRevDrawer(false)}
        preventivoId={preventivoId}
        revisioneCorrente={revisioneCorrente}
        isDirty={isDirty}
      />
    </div>
  );
};
