import Customer from '../models/Customer.js';
import KhataTransaction from '../models/KhataTransaction.js';
import { recordAuditLog } from '../models/AuditLog.js';

/**
 * GET /api/customers
 * List customers with pagination, search, and credit status filters.
 */
export async function listCustomers(req, res, next) {
  try {
    const { search, status } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { shop: req.shopId, isActive: true };

    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ name: searchRegex }, { phone: searchRegex }];
    }

    if (status === 'overdue' || status === 'active') {
      query.totalCredit = { $gt: 0 };
    } else if (status === 'settled') {
      query.totalCredit = { $lte: 0 };
    }

    const [customers, total] = await Promise.all([
      Customer.find(query).sort({ totalCredit: -1, name: 1 }).skip(skip).limit(limit).lean(),
      Customer.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    return res.json({
      success: true,
      data: customers,
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
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

/**
 * GET /api/customers/:id
 * Retrieve customer details and recent Khata transactions.
 */
export async function getCustomer(req, res, next) {
  try {
    const customer = await Customer.findOne({
      _id: req.params.id,
      shop: req.shopId,
      isActive: true,
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    // Fetch recent 10 transactions
    const recentTransactions = await KhataTransaction.find({
      shop: req.shopId,
      customer: customer._id,
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    return res.json({
      success: true,
      customer,
      recentTransactions,
    });
  } catch (err) {
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

/**
 * POST /api/customers
 * Create a new customer in the shop.
 */
export async function createCustomer(req, res, next) {
  try {
    const { name, phone, creditLimit, address, notes } = req.body;

    // Check if phone already registered in this shop
    const existing = await Customer.findOne({
      shop: req.shopId,
      phone: phone.trim(),
      isActive: true,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'A customer with this phone number already exists in your shop.',
        customer: existing,
      });
    }

    const customer = await Customer.create({
      shop: req.shopId,
      name,
      phone: phone.trim(),
      creditLimit: Number(creditLimit) || 5000,
      address: address || '',
      notes: notes || '',
      totalCredit: 0,
    });

    await recordAuditLog({
      shopId: req.shopId,
      userId: req.user._id,
      action: 'CUSTOMER_CREATED',
      entityType: 'Customer',
      entityId: customer._id,
      details: { name: customer.name, phone: customer.phone },
    });

    return res.status(201).json({ success: true, customer });
  } catch (err) {
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

/**
 * PUT /api/customers/:id
 * Update customer details.
 */
export async function updateCustomer(req, res, next) {
  try {
    const { name, phone, creditLimit, address, notes } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone.trim();
    if (creditLimit !== undefined) updateData.creditLimit = Number(creditLimit);
    if (address !== undefined) updateData.address = address;
    if (notes !== undefined) updateData.notes = notes;

    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, shop: req.shopId, isActive: true },
      updateData,
      { new: true, runValidators: true }
    );

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    await recordAuditLog({
      shopId: req.shopId,
      userId: req.user._id,
      action: 'CUSTOMER_UPDATED',
      entityType: 'Customer',
      entityId: customer._id,
      details: updateData,
    });

    return res.json({ success: true, customer });
  } catch (err) {
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

/**
 * DELETE /api/customers/:id
 * Soft delete customer. Prevent deletion if customer has positive credit balance.
 */
export async function deleteCustomer(req, res, next) {
  try {
    const customer = await Customer.findOne({
      _id: req.params.id,
      shop: req.shopId,
      isActive: true,
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    if (customer.totalCredit > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete customer with active outstanding credit of ₹${customer.totalCredit}. Please settle or write off the balance first.`,
      });
    }

    customer.isActive = false;
    await customer.save();

    await recordAuditLog({
      shopId: req.shopId,
      userId: req.user._id,
      action: 'CUSTOMER_DELETED',
      entityType: 'Customer',
      entityId: customer._id,
      details: { name: customer.name, phone: customer.phone },
    });

    return res.json({ success: true, message: 'Customer deleted successfully.' });
  } catch (err) {
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

