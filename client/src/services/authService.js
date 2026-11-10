import api from './api.js';

// ── Auth API ───────────────────────────────────────────────────────────────

export const authService = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  updatePrimaryLanguage: (primaryLanguage) =>
    api.patch('/auth/language', { primaryLanguage }),
};

// ── Shop API ───────────────────────────────────────────────────────────────

export const shopService = {
  onboard: (data) => api.post('/shop/onboard', data),
  getMyShop: () => api.get('/shop'),
  updateMyShop: (data) => api.patch('/shop', data),
};
