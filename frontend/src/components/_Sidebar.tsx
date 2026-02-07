import { useNavigate } from 'react-router-dom';
import { LogOut, User, Shield, Home } from 'lucide-react';
import React from 'react';

// ==========================================
// TYPES
// ==========================================

interface SectionItem<T extends string = string> {
  id: T;
  title: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

interface SidebarProps<T extends string = string> {
  sections: SectionItem<T>[];
  activeSection: T;
  onSectionChange: (sectionId: T) => void;
  progresso?: number;
}

// Helper per ottenere utente corrente
function getCurrentUser() {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

// ==========================================
// COMPONENTE SIDEBAR
// ==========================================

export function Sidebar<T extends string = string>({ 
  sections, 
  activeSection, 
  onSectionChange, 
  progresso = 0 
}: SidebarProps<T>) {
  const navigate = useNavigate();
  const user = getCurrentUser();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    console.log('👋 Logout effettuato');
    navigate('/login');
  };

  const handleGoHome = () => {
    navigate('/preventivi');
  };

  return (
    <nav className="h-full flex flex-col bg-white">
      {/* Header con logo */}
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

      {/* Pulsante Torna alla Lista */}
      <div className="px-4 py-3 border-b">
        <button
          onClick={handleGoHome}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Home className="w-4 h-4" />
          Torna alla Lista
        </button>
      </div>

      {/* Menu items dinamici */}
      <div className="py-4 flex-1 overflow-y-auto">
        {sections.map((item) => {
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
              <span className="flex-shrink-0">{item.icon}</span>
              <span className="font-medium text-sm">{item.title}</span>
              {item.adminOnly && (
                <Shield className="w-3 h-3 ml-auto text-purple-500" />
              )}
            </button>
          );
        })}
      </div>

      {/* Footer con utente e logout */}
      <div className="border-t mt-auto">
        {/* Info utente */}
        {user && (
          <div className="px-6 py-4 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                {user.is_admin ? (
                  <Shield className="w-5 h-5 text-indigo-600" />
                ) : (
                  <User className="w-5 h-5 text-indigo-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {user.nome && user.cognome 
                    ? `${user.nome} ${user.cognome}`
                    : user.username
                  }
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user.gruppo_nome || (user.is_admin ? 'Amministratore' : 'Utente')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Pulsante Logout */}
        <div className="px-6 py-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Esci
          </button>
        </div>

        {/* Versione */}
        <div className="px-6 pb-4">
          <div className="text-xs text-gray-500">
            <p>Versione 2.0</p>
            <p className="mt-1">© 2025 Elettroquadri</p>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Sidebar;
