import { api } from '@/lib/api';

// ==========================================
// TYPES
// ==========================================

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  full_name?: string;
  is_active: boolean;
  is_superuser: boolean;
  is_admin?: boolean;  // Alias per compatibilità
}

// ==========================================
// AUTH FUNCTIONS
// ==========================================

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  // FastAPI OAuth2PasswordRequestForm richiede form-data, non JSON
  const formData = new FormData();
  formData.append('username', username);
  formData.append('password', password);

  const response = await api.post('/auth/login', formData, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const data = response.data;
  
  // Aggiungi is_admin come alias di is_superuser per compatibilità
  if (data.user && !data.user.is_admin) {
    data.user.is_admin = data.user.is_superuser;
  }

  // Salva token in localStorage
  localStorage.setItem('token', data.access_token);
  localStorage.setItem('user', JSON.stringify(data.user));

  return data;
};

export const logout = async (): Promise<void> => {
  try {
    await api.post('/auth/logout');
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Rimuovi token anche se la chiamata fallisce
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
};

export const getCurrentUser = async (): Promise<User> => {
  const response = await api.get('/auth/me');
  return response.data;
};

export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('token');
};

export const getStoredUser = (): User | null => {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
};

// Export service object
export const authService = {
  login,
  logout,
  getCurrentUser,
  isAuthenticated,
  getStoredUser,
};

export default authService;
