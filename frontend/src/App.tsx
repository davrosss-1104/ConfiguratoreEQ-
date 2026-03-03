import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { PreventivoPage } from './pages/PreventivoPage';
import { AdminTemplatesPage } from './pages/AdminTemplatesPage';
import { Toaster } from '@/components/ui/Toaster';
import { RicambiPage } from './pages/RicambiPage';
import RicercaPreventiviPage from './pages/RicercaPreventiviPage';
import RicercaOrdiniPage from './pages/RicercaOrdiniPage';
import LoginPage from './pages/LoginPage';

// Fatturazione (lazy-loaded, attivo solo se modulo abilitato)
import React, { Suspense } from 'react';
const FatturazionePage = React.lazy(() => import('./pages/FatturazionePage'));
const FatturaDettaglioPage = React.lazy(() => import('./pages/FatturaDettaglioPage'));
const ConfigurazioneFatturazionePage = React.lazy(() => import('./pages/ConfigurazioneFatturazionePage'));
const HelpFatturazionePage = React.lazy(() => import('./pages/HelpFatturazionePage'));

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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/preventivo/:id" element={<PreventivoPage />} />
          <Route path="/ricerca" element={<RicercaPreventiviPage />} />
          <Route path="/ricambi" element={<RicambiPage />} />
          <Route path="/admin/templates" element={<AdminTemplatesPage />} />
          <Route path="/ordini" element={<RicercaOrdiniPage />} />

          {/* Fatturazione Elettronica */}
          <Route path="/fatturazione" element={
            <Suspense fallback={<LazyFallback />}><FatturazionePage /></Suspense>
          } />
          <Route path="/fatturazione/configurazione" element={
            <Suspense fallback={<LazyFallback />}><ConfigurazioneFatturazionePage /></Suspense>
          } />
          <Route path="/fatturazione/guida" element={
            <Suspense fallback={<LazyFallback />}><HelpFatturazionePage /></Suspense>
          } />
          <Route path="/fatturazione/:id" element={
            <Suspense fallback={<LazyFallback />}><FatturaDettaglioPage /></Suspense>
          } />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
