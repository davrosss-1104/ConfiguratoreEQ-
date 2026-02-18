import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { PreventivoPage } from './pages/PreventivoPage';
import { AdminTemplatesPage } from './pages/AdminTemplatesPage';
import { Toaster } from '@/components/ui/Toaster';
import { RicambiPage } from './pages/RicambiPage';
import RicercaPreventiviPage from './pages/RicercaPreventiviPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/preventivo/:id" element={<PreventivoPage />} />
          <Route path="/ricerca" element={<RicercaPreventiviPage />} />
          <Route path="/ricambi" element={<RicambiPage />} />
          <Route path="/admin/templates" element={<AdminTemplatesPage />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
