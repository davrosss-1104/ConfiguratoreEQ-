// useAuth.ts - Hook per gestione autenticazione

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface User {
  id: number;
  username: string;
  nome?: string;
  cognome?: string;
  email?: string;
  gruppo_id?: number;
  gruppo_nome?: string;
  is_active: boolean;
  is_admin: boolean;
  permessi: string[];
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isAdmin: false,
    isLoading: true,
  });
  
  const navigate = useNavigate();

  // Carica stato iniziale da localStorage
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        setState({
          user,
          token,
          isAuthenticated: true,
          isAdmin: user.is_admin,
          isLoading: false,
        });
      } catch {
        // Token/user corrotti, pulisci
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  // Login
  const login = useCallback(async (username: string, password: string) => {
    try {
      // 1. Ottieni token
      const loginResponse = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!loginResponse.ok) {
        const errorData = await loginResponse.json();
        throw new Error(errorData.detail || 'Credenziali non valide');
      }

      const tokenData = await loginResponse.json();
      const token = tokenData.access_token;
      
      // 2. Carica info utente
      const userResponse = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!userResponse.ok) {
        throw new Error('Errore caricamento dati utente');
      }

      const user: User = await userResponse.json();
      
      // 3. Salva in localStorage
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      
      // 4. Aggiorna stato
      setState({
        user,
        token,
        isAuthenticated: true,
        isAdmin: user.is_admin,
        isLoading: false,
      });

      return { success: true, user };
      
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }, []);

  // Logout
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isAdmin: false,
      isLoading: false,
    });
    navigate('/login');
  }, [navigate]);

  // Verifica se utente ha un permesso specifico
  const hasPermission = useCallback((codice: string): boolean => {
    if (!state.user) return false;
    if (state.user.is_admin) return true; // Admin ha tutti i permessi
    return state.user.permessi.includes(codice);
  }, [state.user]);

  // Refresh user info dal server
  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        const user: User = await response.json();
        localStorage.setItem('user', JSON.stringify(user));
        setState(prev => ({
          ...prev,
          user,
          isAdmin: user.is_admin,
        }));
      } else if (response.status === 401) {
        // Token scaduto, logout
        logout();
      }
    } catch (error) {
      console.error('Errore refresh user:', error);
    }
  }, [logout]);

  return {
    ...state,
    login,
    logout,
    hasPermission,
    refreshUser,
  };
}

// Hook per ottenere il token per le chiamate API
export function useAuthToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  
  useEffect(() => {
    setToken(localStorage.getItem('token'));
  }, []);
  
  return token;
}

// Helper per ottenere headers autorizzati
export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('token');
  return token 
    ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

// Helper per verificare se utente è loggato (sincrono)
export function isLoggedIn(): boolean {
  return !!localStorage.getItem('token');
}

// Helper per ottenere user corrente (sincrono)
export function getCurrentUser(): User | null {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr) as User;
  } catch {
    return null;
  }
}

// Helper per verificare se utente è admin (sincrono)
export function isCurrentUserAdmin(): boolean {
  const user = getCurrentUser();
  return user?.is_admin ?? false;
}
