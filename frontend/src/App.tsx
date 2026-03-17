import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { PreventivoPage } from './pages/PreventivoPage';
import { AdminTemplatesPage } from './pages/AdminTemplatesPage';
import { Toaster } from '@/components/ui/Toaster';
import { RicambiPage } from './pages/RicambiPage';
import RicercaPreventiviPage from './pages/RicercaPreventiviPage';
import RicercaOrdiniPage from './pages/RicercaOrdiniPage';
import LoginPage from './pages/LoginPage';

import React, { Suspense } from 'react';

// ── Fatturazione ─────────────────────────────────────────────────────────────
const FatturazionePage               = React.lazy(() => import('./pages/FatturazionePage'));
const FatturaDettaglioPage           = React.lazy(() => import('./pages/FatturaDettaglioPage'));
const ConfigurazioneFatturazionePage = React.lazy(() => import('./pages/ConfigurazioneFatturazionePage'));
const HelpFatturazionePage           = React.lazy(() => import('./pages/HelpFatturazionePage'));
const FatturePassivePage             = React.lazy(() => import('./pages/FatturePassivePage'));
const FatturaPassivaDettaglioPage    = React.lazy(() => import('./pages/FatturaPassivaDettaglioPage'));

// ── Assistenza ───────────────────────────────────────────────────────────────
const TicketsPage         = React.lazy(() => import('./pages/TicketsPage'));
const TicketDettaglioPage = React.lazy(() => import('./pages/TicketDettaglioPage'));
const ImpiantiPage        = React.lazy(() => import('./pages/ImpiantiPage'));
const TicketKanbanPage    = React.lazy(() => import('./pages/TicketKanbanPage'));
const TicketDashboardPage = React.lazy(() => import('./pages/TicketDashboardPage'));
const ReportTempiPage     = React.lazy(() => import('./pages/ReportTempiPage'));

// ── Acquisti ─────────────────────────────────────────────────────────────────
const OrdiniAcquistoPage          = React.lazy(() => import('./pages/OrdiniAcquistoPage'));
const OrdineAcquistoDettaglioPage = React.lazy(() => import('./pages/OrdineAcquistoDettaglioPage'));
const MrpPage                     = React.lazy(() => import('./pages/MrpPage'));
const MagazzinoPage               = React.lazy(() => import('./pages/MagazzinoPage'));
const AnalyticsPage = React.lazy(() => import('./pages/AnalyticsPage'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));

// ── Produzione ────────────────────────────────────────────────────────────────
const ProduzionePages = React.lazy(() => import('./pages/ProduzionePages'));


// ── Portale cliente ──────────────────────────────────────────────────────────
const PortaleClientePage = React.lazy(() => import('./pages/PortaleClientePage'));

// ── Admin — in pages/ ────────────────────────────────────────────────────────
const GestioneForniPage          = React.lazy(() => import('./pages/GestioneForniPage'));
const ConfigEmailPage            = React.lazy(() => import('./pages/ConfigEmailPage'));
const ConfigSupportoPage         = React.lazy(() => import('./pages/ConfigSupportoPage'));
const ConfigNexumPage            = React.lazy(() => import('./pages/ConfigNexumPage'));
const DocumentTemplateEditorPage = React.lazy(() => import('./pages/DocumentTemplateEditorPage'));

// ── Admin — in @/components/sections/ ────────────────────────────────────────
const GestioneArticoliPage          = React.lazy(() => import('@/components/sections/GestioneArticoliPage'));
const GestioneClientiPage           = React.lazy(() => import('@/components/sections/GestioneClientiPage'));
const GestioneBomPage               = React.lazy(() => import('@/components/sections/GestioneBomPage'));
const GestioneCampiPage             = React.lazy(() => import('@/components/sections/GestioneCampiPage'));
const GestioneSezioniPage           = React.lazy(() => import('@/components/sections/GestioneSezioniPage'));
const GestioneOpzioniPage           = React.lazy(() => import('@/components/sections/GestioneOpzioniPage'));
const GestioneVariabiliDerivatePage = React.lazy(() => import('@/components/sections/GestioneVariabiliDerivatePage'));
const GestioneElementiVanoPage      = React.lazy(() => import('@/components/sections/GestioneElementiVanoPage'));
const GestioneModuliPage            = React.lazy(() => import('@/components/sections/GestioneModuliPage'));
const GestioneUtentiPage            = React.lazy(() => import('@/components/sections/GestioneUtentiPage'));
const GestioneRuoliPage             = React.lazy(() => import('@/components/sections/GestioneRuoliPage'));
const RuleEnginePage                = React.lazy(() => import('@/components/sections/RuleEnginePage'));
const RuleBuilderPage               = React.lazy(() => import('@/components/sections/RuleBuilderPage'));
const PipelineBuilderPage           = React.lazy(() => import('@/components/sections/PipelineBuilderPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
});

const LazyFallback = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full" />
  </div>
);

function ProtectedLayout() {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function L({ page: Page }: { page: React.ComponentType }) {
  return <Suspense fallback={<LazyFallback />}><Page /></Suspense>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Route pubblica */}
          <Route path="/login" element={<LoginPage />} />

          {/* Tutte le altre route sono protette */}
          <Route element={<ProtectedLayout />}>
            {/* Home e preventivi */}
            <Route path="/" element={<HomePage />} />
            <Route path="/preventivo/:id" element={<PreventivoPage />} />
            <Route path="/ricerca" element={<RicercaPreventiviPage />} />
            <Route path="/ricambi" element={<RicambiPage />} />
            <Route path="/admin/templates" element={<AdminTemplatesPage />} />
            <Route path="/ordini" element={<RicercaOrdiniPage />} />

            {/* Fatturazione — /passive/* PRIMA di /:id */}
            <Route path="/fatturazione" element={<L page={FatturazionePage} />} />
            <Route path="/fatturazione/configurazione" element={<L page={ConfigurazioneFatturazionePage} />} />
            <Route path="/fatturazione/guida" element={<L page={HelpFatturazionePage} />} />
            <Route path="/fatturazione/passive" element={<L page={FatturePassivePage} />} />
            <Route path="/fatturazione/passive/:id" element={<L page={FatturaPassivaDettaglioPage} />} />
            <Route path="/fatturazione/:id" element={<L page={FatturaDettaglioPage} />} />

            {/* Assistenza — /kanban /dashboard /report-tempi PRIMA di /:id */}
            <Route path="/tickets" element={<L page={TicketsPage} />} />
            <Route path="/tickets/kanban" element={<L page={TicketKanbanPage} />} />
            <Route path="/tickets/dashboard" element={<L page={TicketDashboardPage} />} />
            <Route path="/tickets/report-tempi" element={<L page={ReportTempiPage} />} />
            <Route path="/tickets/:id" element={<L page={TicketDettaglioPage} />} />
            <Route path="/impianti" element={<L page={ImpiantiPage} />} />

            {/* Acquisti */}
            <Route path="/acquisti/oda" element={<L page={OrdiniAcquistoPage} />} />
            <Route path="/acquisti/oda/:id" element={<L page={OrdineAcquistoDettaglioPage} />} />
            <Route path="/acquisti/mrp" element={<L page={MrpPage} />} />
            <Route path="/magazzino" element={<L page={MagazzinoPage} />} />

            {/* Analisi */}
            <Route path="/analytics"  element={<L page={AnalyticsPage} />} />
            <Route path="/dashboard"  element={<L page={DashboardPage} />} />

            {/* Produzione */}
            <Route path="/produzione" element={<L page={ProduzionePages} />} />

            {/* Portale cliente */}
            <Route path="/portale" element={<L page={PortaleClientePage} />} />

            {/* Admin — Anagrafica */}
            <Route path="/admin/articoli" element={<L page={GestioneArticoliPage} />} />
            <Route path="/admin/clienti" element={<L page={GestioneClientiPage} />} />
            <Route path="/admin/bom" element={<L page={GestioneBomPage} />} />
            <Route path="/admin/fornitori" element={<L page={GestioneForniPage} />} />

            {/* Admin — Configuratore */}
            <Route path="/admin/campi" element={<L page={GestioneCampiPage} />} />
            <Route path="/admin/sezioni" element={<L page={GestioneSezioniPage} />} />
            <Route path="/admin/opzioni" element={<L page={GestioneOpzioniPage} />} />
            <Route path="/admin/variabili-derivate" element={<L page={GestioneVariabiliDerivatePage} />} />
            <Route path="/admin/elementi-vano" element={<L page={GestioneElementiVanoPage} />} />
            <Route path="/admin/rule-engine" element={<L page={RuleBuilderPage} />} />
            <Route path="/admin/rule-builder" element={<L page={RuleBuilderPage} />} />
            <Route path="/admin/pipeline" element={<L page={PipelineBuilderPage} />} />
            <Route path="/admin/template-doc" element={<L page={DocumentTemplateEditorPage} />} />

            {/* Admin — Utenti & Sistema */}
            <Route path="/admin/utenti" element={<L page={GestioneUtentiPage} />} />
            <Route path="/admin/ruoli" element={<L page={GestioneRuoliPage} />} />
            <Route path="/admin/moduli" element={<L page={GestioneModuliPage} />} />
            <Route path="/admin/config-email" element={<L page={ConfigEmailPage} />} />
            <Route path="/admin/config-supporto" element={<L page={ConfigSupportoPage} />} />
            <Route path="/admin/nexum" element={<L page={ConfigNexumPage} />} />
          </Route>
        </Routes>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
