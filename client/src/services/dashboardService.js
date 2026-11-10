import api from './api.js';

export const dashboardService = {
  /**
   * GET /api/dashboard/stats
   * Retrieves today's revenue, sales count, low-stock alerts, weekly trends, etc.
   */
  getStats: () => api.get('/dashboard/stats'),
};

