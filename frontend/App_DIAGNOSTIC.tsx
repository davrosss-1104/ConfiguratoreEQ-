import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

// Login page super semplice
function SimpleLoginPage() {
  const handleLogin = () => {
    localStorage.setItem('token', 'test-token');
    window.location.href = '/preventivi';
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <div style={{
        background: 'white',
        padding: '3rem',
        borderRadius: '1rem',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        textAlign: 'center',
        maxWidth: '400px',
        width: '100%'
      }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#333' }}>
          🔐 Login
        </h1>
        <p style={{ color: '#666', marginBottom: '2rem' }}>
          Configuratore Elettroquadri
        </p>
        <button
          onClick={handleLogin}
          style={{
            width: '100%',
            padding: '1rem',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            marginBottom: '1rem'
          }}
        >
          Accedi (Bypass)
        </button>
        <button
          onClick={() => localStorage.clear()}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            cursor: 'pointer'
          }}
        >
          Cancella localStorage
        </button>
        <div style={{ marginTop: '2rem', padding: '1rem', background: '#f3f4f6', borderRadius: '0.5rem' }}>
          <p style={{ fontSize: '0.75rem', color: '#666', margin: 0 }}>
            <strong>Token attuale:</strong><br/>
            {localStorage.getItem('token') || 'Nessuno'}
          </p>
        </div>
      </div>
    </div>
  );
}

// Home page semplice
function SimpleHomePage() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>✅ HOME PAGE FUNZIONA!</h1>
      <p>Se vedi questa pagina, il routing funziona correttamente.</p>
      <button
        onClick={() => {
          localStorage.clear();
          window.location.href = '/';
        }}
        style={{
          padding: '1rem 2rem',
          background: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          cursor: 'pointer'
        }}
      >
        Logout
      </button>
    </div>
  );
}

// Check autenticazione
function isAuthenticated() {
  const token = localStorage.getItem('token');
  console.log('🔍 Check auth - Token:', token);
  return !!token;
}

// Private route
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const auth = isAuthenticated();
  console.log('🔒 PrivateRoute - Authenticated:', auth);
  
  if (!auth) {
    console.log('❌ Non autenticato, redirect a /login');
    window.location.href = '/login';
    return null;
  }
  
  return <>{children}</>;
}

function App() {
  console.log('🚀 App rendering');
  console.log('📍 Current path:', window.location.pathname);
  console.log('🔑 Token:', localStorage.getItem('token'));

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<SimpleLoginPage />} />
          <Route 
            path="/preventivi" 
            element={
              <PrivateRoute>
                <SimpleHomePage />
              </PrivateRoute>
            } 
          />
          <Route path="*" element={
            <div style={{ padding: '2rem' }}>
              <h1>🔄 Redirect...</h1>
              <p>Path: {window.location.pathname}</p>
              <p>Redirecting to /preventivi...</p>
              {setTimeout(() => window.location.href = '/preventivi', 100) && null}
            </div>
          } />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
