import Sale from '../models/Sale.js';

/**
 * GET /api/sales
 * List sales with pagination, date range, payment method, and customer filters.
 */
export async function listSales(req, res, next) {
  try {
    const { startDate, endDate, paymentMethod, customerId } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { shop: req.shopId };

    if (paymentMethod && paymentMethod !== 'all') {
      query.paymentMethod = paymentMethod;
    }

    if (customerId) {
      query.customer = customerId;
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    const [sales, total] = await Promise.all([
      Sale.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customer', 'name phone')
        .lean(),
      Sale.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    return res.json({
      success: true,
      data: sales,
      pagination: {
        totalDocs: total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    console.error('List sales error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load sales history.' });
  }
}

/**
 * GET /api/sales/:id
 * Retrieve a single sale invoice with populated customer and product details.
 */
export async function getSale(req, res) {
  try {
    const sale = await Sale.findOne({
      _id: req.params.id,
      shop: req.shopId,
    })
      .populate('customer', 'name phone address')
      .populate('items.product', 'name category SKU unit');

    if (!sale) {
      return res.status(404).json({ success: false, message: 'Sale invoice not found.' });
    }

    return res.json({ success: true, sale });
  } catch (err) {
    console.error('Get sale error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch sale invoice.' });
  }
}
