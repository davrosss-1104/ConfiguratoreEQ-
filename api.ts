import axios from 'axios';

// URL base del backend - SENZA /api
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Istanza axios configurata
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor per gestire errori globali
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);
