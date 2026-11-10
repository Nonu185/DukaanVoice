import api from './api.js';

export const saleService = {
  /**
   * GET /api/sales
   * List sales with pagination, date range, paymentMethod, and customerId filters.
   */
  getSales: (params = {}) => api.get('/sales', { params }),

  /**
   * GET /api/sales/:id
   */
  getSale: (id) => api.get(`/sales/${id}`),
};

