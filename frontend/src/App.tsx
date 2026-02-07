import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

// Lazy load pages
const LoginPage = lazy(() => import('./pages/LoginPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const PreventivoPage = lazy(() => import('./pages/PreventivoPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

// Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minuto
      retry: 1,
    },
  },
});

// Loading component
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-gray-600">Caricamento...</p>
      </div>
    </div>
  );
}

// Verifica autenticazione
function isAuthenticated(): boolean {
  const token = localStorage.getItem('token');
  return !!token;
}

// Get current user
function getCurrentUser() {
  try {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  } catch {
    return null;
  }
}

// Protected Route
function PrivateRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

// Public Route (redirect se già autenticato)
function PublicRoute({ children }: { children: React.ReactNode }) {
  if (isAuthenticated()) {
    return <Navigate to="/preventivi" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Login - pubblica */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <LoginPage />
                </PublicRoute>
              }
            />
            
            {/* Home redirect */}
            <Route
              path="/"
              element={<Navigate to="/preventivi" replace />}
            />
            
            {/* Lista preventivi */}
            <Route
              path="/preventivi"
              element={
                <PrivateRoute>
                  <HomePage />
                </PrivateRoute>
              }
            />
            
            {/* Dettaglio preventivo */}
            <Route
              path="/preventivi/:id"
              element={
                <PrivateRoute>
                  <PreventivoPage />
                </PrivateRoute>
              }
            />
            
            {/* Admin */}
            <Route
              path="/admin"
              element={
                <PrivateRoute>
                  <AdminPage />
                </PrivateRoute>
              }
            />
            
            {/* Catch all - redirect a login */}
            <Route
              path="*"
              element={<Navigate to="/login" replace />}
            />
          </Routes>
        </Suspense>
        
        {/* Toast notifications */}
        <Toaster 
          position="top-right" 
          richColors 
          closeButton 
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
