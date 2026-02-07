// ProtectedRoute.tsx - Componente per proteggere le route

import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { getCurrentUser, isLoggedIn, isCurrentUserAdmin } from './useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requirePermission?: string;
  fallback?: ReactNode;
}

export function ProtectedRoute({ 
  children, 
  requireAdmin = false,
  requirePermission,
  fallback 
}: ProtectedRouteProps) {
  const location = useLocation();
  const [isChecking, setIsChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    // Verifica accesso
    if (!isLoggedIn()) {
      setHasAccess(false);
      setIsChecking(false);
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      setHasAccess(false);
      setIsChecking(false);
      return;
    }

    // Verifica admin
    if (requireAdmin && !user.is_admin) {
      setHasAccess(false);
      setIsChecking(false);
      return;
    }

    // Verifica permesso specifico
    if (requirePermission) {
      const hasPermission = user.is_admin || user.permessi.includes(requirePermission);
      if (!hasPermission) {
        setHasAccess(false);
        setIsChecking(false);
        return;
      }
    }

    // Tutto ok
    setHasAccess(true);
    setIsChecking(false);
  }, [requireAdmin, requirePermission]);

  // Loading
  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Non loggato -> redirect a login
  if (!isLoggedIn()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Non ha accesso
  if (!hasAccess) {
    if (fallback) return <>{fallback}</>;
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Accesso Negato</h2>
          <p className="text-gray-600 mb-4">
            {requireAdmin 
              ? "Questa sezione richiede privilegi di amministratore."
              : `Non hai il permesso "${requirePermission}" per accedere a questa sezione.`
            }
          </p>
          <a 
            href="/preventivi" 
            className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Torna ai Preventivi
          </a>
        </div>
      </div>
    );
  }

  // Ha accesso
  return <>{children}</>;
}

// Componente per nascondere/mostrare elementi in base ai permessi
interface RequirePermissionProps {
  children: ReactNode;
  permission?: string;
  requireAdmin?: boolean;
  fallback?: ReactNode;
}

export function RequirePermission({ 
  children, 
  permission, 
  requireAdmin = false,
  fallback = null 
}: RequirePermissionProps) {
  const user = getCurrentUser();
  
  if (!user) return <>{fallback}</>;
  
  // Admin ha sempre accesso
  if (user.is_admin) return <>{children}</>;
  
  // Richiede admin ma non è admin
  if (requireAdmin) return <>{fallback}</>;
  
  // Verifica permesso specifico
  if (permission && !user.permessi.includes(permission)) {
    return <>{fallback}</>;
  }
  
  return <>{children}</>;
}

// Hook per verificare permessi (per logica condizionale)
export function usePermission(permission?: string, requireAdmin = false): boolean {
  const user = getCurrentUser();
  
  if (!user) return false;
  if (user.is_admin) return true;
  if (requireAdmin) return false;
  if (permission && !user.permessi.includes(permission)) return false;
  
  return true;
}

// Componente per mostrare contenuto solo agli admin
export function AdminOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <RequirePermission requireAdmin fallback={fallback}>
      {children}
    </RequirePermission>
  );
}
