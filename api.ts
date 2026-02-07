import axios from 'axios';

// URL base del backend CON prefisso /api/
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Istanza axios configurata
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor per aggiungere token JWT (se presente)
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor per gestire errori globali
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Se 401 Unauthorized, redirect a login
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default api;
