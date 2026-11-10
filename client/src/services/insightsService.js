import api from './api.js';

export const insightsService = {
  /**
   * GET /api/insights
   * Fetches verified business statistics and Gemini narrative + Timbre TTS audio.
   *
   * @param {Object} [params]
   * @param {String} [params.language='hi'] - 'hi' | 'hinglish' | 'kn' | 'en'
   */
  getInsights: (params = {}) => api.get('/insights', { params }),
};

