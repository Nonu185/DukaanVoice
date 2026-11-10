import api from './api.js';

export const customerService = {
  /**
   * GET /api/customers
   */
  getCustomers: (params = {}) => api.get('/customers', { params }),

  /**
   * GET /api/customers/:id
   */
  getCustomer: (id) => api.get(`/customers/${id}`),

  /**
   * POST /api/customers
   */
  createCustomer: (data) => api.post('/customers', data),

  /**
   * PUT /api/customers/:id
   */
  updateCustomer: (id, data) => api.put(`/customers/${id}`, data),

  /**
   * DELETE /api/customers/:id
   */
  deleteCustomer: (id) => api.delete(`/customers/${id}`),
};

