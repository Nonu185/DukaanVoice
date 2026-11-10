import {
  calculateVerifiedBusinessMetrics,
  generateBusinessInsightsNarrative,
} from '../services/insightsService.js';

/**
 * GET /api/insights
 * Returns verified MongoDB business metrics, sales trends, category charts,
 * inventory suggestions, and Gemini generated multilingual narrative + Timbre TTS audio.
 */
export async function getBusinessInsights(req, res) {
  try {
    const { language = 'hi' } = req.query;
    const shopId = req.shopId;

    const verifiedMetrics = await calculateVerifiedBusinessMetrics(shopId);
    const aiSummary = await generateBusinessInsightsNarrative(verifiedMetrics, language);

    return res.json({
      success: true,
      verifiedMetrics,
      aiSummary,
    });
  } catch (err) {
    console.error('Insights error:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to generate business insights.',
    });
  }
}

