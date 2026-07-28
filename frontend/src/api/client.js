// src/api/client.js — Axios instance with JWT interceptor
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
apiClient.interceptors.request.use((config) => {
  // Read from Zustand persisted store
  const stored = localStorage.getItem('arenablast-auth');
  if (stored) {
    try {
      const { state } = JSON.parse(stored);
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`;
      }
    } catch { /* ignore parse errors */ }
  }
  return config;
});

// Handle 401 globally — redirect to login
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('arenablast-auth');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default apiClient;
