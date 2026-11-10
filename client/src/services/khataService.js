import api from './api.js';

export const khataService = {
  /**
   * GET /api/khata/summary
   */
  getSummary: () => api.get('/khata/summary'),

  /**
   * GET /api/khata/transactions
   */
  getTransactions: (params = {}) => api.get('/khata/transactions', { params }),

  /**
   * GET /api/khata/customer/:customerId
   */
  getCustomerLedger: (customerId, params = {}) =>
    api.get(`/khata/customer/${customerId}`, { params }),

  /**
   * POST /api/khata/credit
   */
  recordCredit: (data) => api.post('/khata/credit', data),

  /**
   * POST /api/khata/payment
   */
  recordPayment: (data) => api.post('/khata/payment', data),
};

