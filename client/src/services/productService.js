import api from './api.js';

export const productService = {
  /**
   * GET /api/products
   * List products with pagination, search, category, and status filters.
   */
  getProducts: (params = {}) => api.get('/products', { params }),

  /**
   * GET /api/products/:id
   */
  getProduct: (id) => api.get(`/products/${id}`),

  /**
   * POST /api/products
   */
  createProduct: (data) => api.post('/products', data),

  /**
   * PUT /api/products/:id
   */
  updateProduct: (id, data) => api.put(`/products/${id}`, data),

  /**
   * PATCH /api/products/:id/stock
   * Adjust stock via delta or absolute quantity.
   */
  adjustStock: (id, { delta, quantity }) =>
    api.patch(`/products/${id}/stock`, { delta, quantity }),

  /**
   * DELETE /api/products/:id
   */
  deleteProduct: (id) => api.delete(`/products/${id}`),
};

