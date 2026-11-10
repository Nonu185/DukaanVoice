import Sale from '../models/Sale.js';
import Product from '../models/Product.js';
import Customer from '../models/Customer.js';

/**
 * GET /api/dashboard/stats
 * Aggregates all KPI metrics, revenue charts, top products, and low stock alerts for the shop.
 */
export async function getDashboardStats(req, res, next) {
  try {
    const shopId = req.shopId;

    // Time ranges for today (local day)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // 7 days ago start
    const startOf7DaysAgo = new Date(startOfToday);
    startOf7DaysAgo.setDate(startOf7DaysAgo.getDate() - 6);

    const [
      todaySalesAgg,
      totalProductsCount,
      lowStockProducts,
      customersCreditAgg,
      recentSales,
      weeklySales,
      topProductsAgg,
    ] = await Promise.all([
      // 1. Today's Revenue and Bill count
      Sale.aggregate([
        {
          $match: {
            shop: shopId,
            createdAt: { $gte: startOfToday, $lte: endOfToday },
          },
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$total' },
            totalBills: { $sum: 1 },
            cashRevenue: {
              $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$total', 0] },
            },
            upiRevenue: {
              $sum: { $cond: [{ $eq: ['$paymentMethod', 'upi'] }, '$total', 0] },
            },
            khataRevenue: {
              $sum: { $cond: [{ $eq: ['$paymentMethod', 'khata'] }, '$total', 0] },
            },
          },
        },
      ]),

      // 2. Total active products
      Product.countDocuments({ shop: shopId, isActive: true }),

      // 3. Low stock products (quantity <= lowStockThreshold)
      Product.find({
        shop: shopId,
        isActive: true,
        $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
      })
        .sort({ quantity: 1 })
        .limit(6)
        .lean(),

      // 4. Pending customer credit (total sum of positive credits)
      Customer.aggregate([
        {
          $match: {
            shop: shopId,
            isActive: true,
            totalCredit: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            totalPendingCredit: { $sum: '$totalCredit' },
            customersWithCreditCount: { $sum: 1 },
          },
        },
      ]),

      // 5. Recent 6 sales
      Sale.find({ shop: shopId })
        .sort({ createdAt: -1 })
        .limit(6)
        .populate('customer', 'name phone')
        .lean(),

      // 6. Last 7 days daily revenue breakdown
      Sale.aggregate([
        {
          $match: {
            shop: shopId,
            createdAt: { $gte: startOf7DaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            revenue: { $sum: '$total' },
            cash: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$total', 0] } },
            upi: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'upi'] }, '$total', 0] } },
            khata: { $sum: { $cond: [{ $eq: ['$paymentMethod', 'khata'] }, '$total', 0] } },
            ordersCount: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // 7. Top 5 selling products
      Sale.aggregate([
        { $match: { shop: shopId } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            name: { $first: '$items.name' },
            totalQuantitySold: { $sum: '$items.quantity' },
            totalRevenueGenerated: { $sum: '$items.total' },
          },
        },
        { $sort: { totalQuantitySold: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const todayStats = todaySalesAgg[0] || {
      totalRevenue: 0,
      totalBills: 0,
      cashRevenue: 0,
      upiRevenue: 0,
      khataRevenue: 0,
    };

    const creditStats = customersCreditAgg[0] || {
      totalPendingCredit: 0,
      customersWithCreditCount: 0,
    };

    // Low stock count in whole catalog
    const lowStockCount = await Product.countDocuments({
      shop: shopId,
      isActive: true,
      $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
    });

    return res.json({
      success: true,
      metrics: {
        todayRevenue: todayStats.totalRevenue,
        todayBills: todayStats.totalBills,
        cashRevenue: todayStats.cashRevenue,
        upiRevenue: todayStats.upiRevenue,
        khataRevenue: todayStats.khataRevenue,
        totalProducts: totalProductsCount,
        lowStockCount,
        totalPendingCredit: creditStats.totalPendingCredit,
        customersWithCreditCount: creditStats.customersWithCreditCount,
      },
      lowStockAlerts: lowStockProducts,
      recentTransactions: recentSales,
      weeklyChart: weeklySales,
      topSellingProducts: topProductsAgg,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load dashboard stats.' });
  }
}

