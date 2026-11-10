import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api',
  withCredentials: true, // Send HTTP-only JWT cookie automatically
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// ── Response Interceptor ───────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isAuthCheck = error.config?.url?.includes('/auth/me');
      if (
        !isAuthCheck &&
        window.location.pathname !== '/login' &&
        window.location.pathname !== '/register'
      ) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
