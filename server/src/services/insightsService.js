import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';
import AuditLog from '../models/AuditLog.js';
import { generateGeminiInsights } from './geminiService.js';
import { synthesizeSpeech } from './timbreService.js';

/**
 * 1. Calculate Verified Business Metrics strictly from MongoDB.
 * The model NEVER computes or invents financial metrics.
 *
 * @param {ObjectId} shopId
 * @returns {Promise<Object>} Verified figures
 */
export async function calculateVerifiedBusinessMetrics(shopId) {
  const now = new Date();

  // Boundaries
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const startOf7Days = new Date(startOfToday);
  startOf7Days.setDate(startOf7Days.getDate() - 6);

  const startOf30Days = new Date(startOfToday);
  startOf30Days.setDate(startOf30Days.getDate() - 29);

  const [
    todayAgg,
    weeklyAgg,
    monthlyAgg,
    totalAllTimeBills,
    creditAgg,
    topProductsAgg,
    allProducts,
    recentAuditLogs,
    dailyChartAgg,
    categoryChartAgg,
  ] = await Promise.all([
    // A. Today's Revenue & Bills
    Sale.aggregate([
      { $match: { shop: shopId, createdAt: { $gte: startOfToday, $lte: endOfToday } } },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$total' },
          bills: { $sum: 1 },
          cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$total', 0] } },
          upi: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'upi'] }, '$total', 0] } },
          khata: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'khata'] }, '$total', 0] } },
        },
      },
    ]),

    // B. Weekly Revenue & Bills (last 7 days)
    Sale.aggregate([
      { $match: { shop: shopId, createdAt: { $gte: startOf7Days } } },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$total' },
          bills: { $sum: 1 },
        },
      },
    ]),

    // C. Monthly Revenue & Bills (last 30 days)
    Sale.aggregate([
      { $match: { shop: shopId, createdAt: { $gte: startOf30Days } } },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$total' },
          bills: { $sum: 1 },
        },
      },
    ]),

    // D. Total All-time Transactions
    Sale.countDocuments({ shop: shopId }),

    // E. Outstanding Customer Credit
    Customer.aggregate([
      { $match: { shop: shopId, isActive: true, totalCredit: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          totalOutstandingCredit: { $sum: '$totalCredit' },
          customersWithCreditCount: { $sum: 1 },
        },
      },
    ]),

    // F. Best-selling Products (All time / last 30 days)
    Sale.aggregate([
      { $match: { shop: shopId, createdAt: { $gte: startOf30Days } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          quantitySold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.total' },
        },
      },
      { $sort: { quantitySold: -1 } },
      { $limit: 5 },
    ]),

    // G. All Active Products in catalog
    Product.find({ shop: shopId, isActive: true })
      .select('name category quantity lowStockThreshold sellingPrice')
      .lean(),

    // H. Recent Inventory Audit Logs
    AuditLog.find({ shop: shopId, entityType: 'Product' })
      .sort({ createdAt: -1 })
      .limit(6)
      .lean(),

    // I. 7-Day Revenue Trend
    Sale.aggregate([
      { $match: { shop: shopId, createdAt: { $gte: startOf7Days } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // J. Category Contribution
    Sale.aggregate([
      { $match: { shop: shopId, createdAt: { $gte: startOf30Days } } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productDoc',
        },
      },
      {
        $group: {
          _id: { $ifNull: [{ $arrayElemAt: ['$productDoc.category', 0] }, 'General'] },
          totalRevenue: { $sum: '$items.total' },
          itemsCount: { $sum: '$items.quantity' },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]),
  ]);

  const today = todayAgg[0] || { revenue: 0, bills: 0, cash: 0, upi: 0, khata: 0 };
  const weekly = weeklyAgg[0] || { revenue: 0, bills: 0 };
  const monthly = monthlyAgg[0] || { revenue: 0, bills: 0 };
  const credit = creditAgg[0] || { totalOutstandingCredit: 0, customersWithCreditCount: 0 };

  const averageSaleValue =
    today.bills > 0
      ? Math.round((today.revenue / today.bills) * 100) / 100
      : monthly.bills > 0
      ? Math.round((monthly.revenue / monthly.bills) * 100) / 100
      : 0;

  // Identify low-stock products (quantity <= threshold)
  const lowStockProducts = allProducts.filter(
    (p) => p.quantity <= (p.lowStockThreshold || 5)
  );

  // Identify slow-moving products (active items in catalog with 0 or <= 1 sales in last 30 days)
  const topProductIds = new Set(topProductsAgg.map((tp) => tp._id?.toString()));
  const slowMovingProducts = allProducts
    .filter((p) => !topProductIds.has(p._id.toString()) && p.quantity > 0)
    .slice(0, 5)
    .map((p) => ({
      _id: p._id,
      name: p.name,
      currentStock: p.quantity,
      sellingPrice: p.sellingPrice,
      category: p.category,
    }));

  return {
    totalProducts: allProducts.length,
    todayRevenue: today.revenue,
    todayBills: today.bills,
    todayPaymentBreakdown: {
      cash: today.cash,
      upi: today.upi,
      khata: today.khata,
    },
    weeklyRevenue: weekly.revenue,
    weeklyBills: weekly.bills,
    monthlyRevenue: monthly.revenue,
    monthlyBills: monthly.bills,
    totalTransactions: totalAllTimeBills,
    averageSaleValue,
    bestSellingProducts: topProductsAgg,
    slowMovingProducts,
    lowStockProducts: lowStockProducts.map((p) => ({
      _id: p._id,
      name: p.name,
      quantity: p.quantity,
      threshold: p.lowStockThreshold || 5,
      category: p.category,
    })),
    outstandingCredit: credit.totalOutstandingCredit,
    customersWithCreditCount: credit.customersWithCreditCount,
    recentInventoryChanges: recentAuditLogs.map((log) => ({
      action: log.action,
      details: log.details,
      createdAt: log.createdAt,
    })),
    dailyChart: dailyChartAgg,
    categoryChart: categoryChartAgg.map((c) => ({
      category: c._id,
      revenue: c.totalRevenue,
      itemsCount: c.itemsCount,
    })),
  };
}

/**
 * 2. Generate Actionable Business Insights Narrative
 * strictly based on verified metrics.
 *
 * @param {Object} metrics - Output of calculateVerifiedBusinessMetrics
 * @param {String} language - 'hi' | 'hinglish' | 'kn'
 * @returns {Promise<Object>} Narrative and action recommendations
 */
export async function generateBusinessInsightsNarrative(metrics, language = 'hi') {
  if (
    metrics.totalProducts === 0 &&
    metrics.totalTransactions === 0 &&
    metrics.outstandingCredit === 0
  ) {
    return {
      hasData: false,
      language,
      narrative: null,
      recommendations: [],
      audioBase64: '',
    };
  }

  const aiResult = await generateGeminiInsights({ metrics, language });
  const summaryText = aiResult.narrative || '';

  let audioBase64 = '';
  if (summaryText) {
    const tts = await synthesizeSpeech(summaryText, { language });
    audioBase64 = tts.audioBase64 || '';
  }

  return {
    hasData: true,
    language,
    narrative: summaryText,
    recommendations: aiResult.recommendations || [],
    audioBase64,
  };
}

