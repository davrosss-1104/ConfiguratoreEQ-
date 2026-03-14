import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Lock, User, Zap } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Chiamata login
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Credenziali non valide');
      }

      const data = await response.json();
      
      // Salva token e user (ora include permessi, ruolo, gruppo)
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      const ruolo = data.user?.ruolo_codice ?? '';
      if (ruolo === 'cliente_base' || ruolo === 'cliente_avanzato') {
        navigate('/portale');
      } else {
     navigate('/');
   }
    } catch (err: any) {
      setError(err.message || 'Errore durante il login');
    } finally {
      setLoading(false);
    }
  };

  // Bypass per sviluppo (solo in dev)
  const isDev = import.meta.env.DEV;
  const handleDevBypass = () => {
    localStorage.setItem('token', 'dev-token-bypass');
    localStorage.setItem('user', JSON.stringify({
      id: 1,
      username: 'admin',
      is_admin: true,
      gruppo_nome: 'Elettroquadri',
      ruolo_nome: 'Super Amministratore',
      ruolo_codice: 'superadmin',
      permessi: [],
    }));
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo e titolo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4 shadow-lg">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Configuratore</h1>
          <p className="text-gray-600 mt-1">Elettroquadri S.r.l.</p>
        </div>

        {/* Card login */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Accedi</h2>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Inserisci username"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Inserisci password"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Accesso in corso...
                </>
              ) : (
                'Accedi'
              )}
            </button>
          </form>

          {/* Bypass e credenziali demo: solo in sviluppo */}
          {isDev && (
            <>
              <div className="mt-6 pt-6 border-t">
                <button
                  onClick={handleDevBypass}
                  className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Accesso sviluppo (bypass)
                </button>
              </div>
              <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                <p className="font-medium">Credenziali demo:</p>
                <p>Username: <code className="bg-blue-100 px-1 rounded">admin</code></p>
                <p>Password: <code className="bg-blue-100 px-1 rounded">admin</code></p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-6">
          © 2025 Elettroquadri S.r.l. - Tutti i diritti riservati
        </p>
      </div>
    </div>
  );
}
