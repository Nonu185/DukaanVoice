import KhataTransaction from '../models/KhataTransaction.js';
import Customer from '../models/Customer.js';
import { recordAuditLog } from '../models/AuditLog.js';

/**
 * GET /api/khata/summary
 * Returns overview metrics of the shop's credit ledger.
 */
export async function getKhataSummary(req, res, next) {
  try {
    const customers = await Customer.find({
      shop: req.shopId,
      isActive: true,
    }).lean();

    const totalOutstanding = customers.reduce(
      (sum, c) => sum + (c.totalCredit > 0 ? c.totalCredit : 0),
      0
    );
    const customersWithCredit = customers.filter((c) => c.totalCredit > 0).length;
    const settledCustomers = customers.filter((c) => c.totalCredit === 0).length;

    // Recent 5 Khata transactions
    const recentTransactions = await KhataTransaction.find({ shop: req.shopId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('customer', 'name phone')
      .lean();

    return res.json({
      success: true,
      summary: {
        totalOutstanding,
        customersWithCredit,
        settledCustomers,
        totalCustomers: customers.length,
      },
      recentTransactions,
    });
  } catch (err) {
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

/**
 * GET /api/khata/transactions
 * List all Khata transactions in the shop with pagination and type filtering.
 */
export async function listKhataTransactions(req, res, next) {
  try {
    const { type, customerId, startDate, endDate } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { shop: req.shopId };

    if (type && ['credit', 'payment'].includes(type)) {
      query.type = type;
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

    const [transactions, total] = await Promise.all([
      KhataTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customer', 'name phone')
        .populate('sale', 'invoiceNumber total')
        .lean(),
      KhataTransaction.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    return res.json({
      success: true,
      data: transactions,
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
 * GET /api/khata/customer/:customerId
 * Customer ledger statement with pagination.
 */
export async function getCustomerLedger(req, res, next) {
  try {
    const { customerId } = req.params;
    const { page, limit, skip } = getPaginationParams(req.query);

    const customer = await Customer.findOne({
      _id: customerId,
      shop: req.shopId,
      isActive: true,
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    }

    const query = { shop: req.shopId, customer: customer._id };

    const [transactions, total] = await Promise.all([
      KhataTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sale', 'invoiceNumber')
        .lean(),
      KhataTransaction.countDocuments(query),
    ]);

    return res.json({
      success: true,
      customer,
      ...buildPaginatedResponse(transactions, total, page, limit),
    });
  } catch (err) {
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

/**
 * POST /api/khata/credit
 * Record credit given to a customer (Udhaar).
 * Business rule: increases customer's totalCredit balance.
 */
export async function recordCredit(req, res, next) {
  try {
    const { customer: customerId, amount, description, idempotencyKey } = req.body;
    const finalIdempotencyKey =
      idempotencyKey || req.headers['x-idempotency-key'] || null;

    // Idempotency guard
    if (finalIdempotencyKey) {
      const existingTxn = await KhataTransaction.findOne({
        shop: req.shopId,
        idempotencyKey: finalIdempotencyKey,
      }).populate('customer', 'name phone');

      if (existingTxn) {
        return res.status(200).json({
          success: true,
          transaction: existingTxn,
          isIdempotentReplay: true,
          message: 'Credit transaction already processed for this idempotency key.',
        });
      }
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than zero.' });
    }

    const customer = await Customer.findOne({
      _id: customerId,
      shop: req.shopId,
      isActive: true,
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found in your shop.' });
    }

    const updatedCustomer = await Customer.findOneAndUpdate(
      { _id: customer._id, shop: req.shopId },
      { $inc: { totalCredit: numAmount } },
      { new: true }
    );

    const transaction = await KhataTransaction.create({
      shop: req.shopId,
      customer: customer._id,
      type: 'credit',
      amount: numAmount,
      description: description || 'Udhaar given',
      balanceAfter: updatedCustomer.totalCredit,
      idempotencyKey: finalIdempotencyKey || undefined,
    });

    await recordAuditLog({
      shopId: req.shopId,
      userId: req.user._id,
      action: 'KHATA_CREDIT_RECORDED',
      entityType: 'KhataTransaction',
      entityId: transaction._id,
      details: {
        customerName: customer.name,
        amount: numAmount,
        newBalance: updatedCustomer.totalCredit,
        description,
      },
    });

    return res.status(201).json({
      success: true,
      transaction,
      customer: updatedCustomer,
      message: `₹${numAmount} credit recorded for ${customer.name}.`,
    });
  } catch (err) {
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

/**
 * POST /api/khata/payment
 * Record customer payment (Jama).
 * Business rule: reduces customer's outstanding credit.
 */
export async function recordPayment(req, res, next) {
  try {
    const { customer: customerId, amount, description, idempotencyKey } = req.body;
    const finalIdempotencyKey =
      idempotencyKey || req.headers['x-idempotency-key'] || null;

    // Idempotency guard
    if (finalIdempotencyKey) {
      const existingTxn = await KhataTransaction.findOne({
        shop: req.shopId,
        idempotencyKey: finalIdempotencyKey,
      }).populate('customer', 'name phone');

      if (existingTxn) {
        return res.status(200).json({
          success: true,
          transaction: existingTxn,
          isIdempotentReplay: true,
          message: 'Payment already processed for this idempotency key.',
        });
      }
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be greater than zero.' });
    }

    const customer = await Customer.findOne({
      _id: customerId,
      shop: req.shopId,
      isActive: true,
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found in your shop.' });
    }

    // Reduce total credit
    const updatedCustomer = await Customer.findOneAndUpdate(
      { _id: customer._id, shop: req.shopId },
      { $inc: { totalCredit: -numAmount } },
      { new: true }
    );

    const transaction = await KhataTransaction.create({
      shop: req.shopId,
      customer: customer._id,
      type: 'payment',
      amount: numAmount,
      description: description || 'Payment received (Jama)',
      balanceAfter: updatedCustomer.totalCredit,
      idempotencyKey: finalIdempotencyKey || undefined,
    });

    await recordAuditLog({
      shopId: req.shopId,
      userId: req.user._id,
      action: 'KHATA_PAYMENT_RECORDED',
      entityType: 'KhataTransaction',
      entityId: transaction._id,
      details: {
        customerName: customer.name,
        amount: numAmount,
        newBalance: updatedCustomer.totalCredit,
        description,
      },
    });

    return res.status(201).json({
      success: true,
      transaction,
      customer: updatedCustomer,
      message: `₹${numAmount} payment recorded for ${customer.name}. Remaining balance: ₹${updatedCustomer.totalCredit}`,
    });
  } catch (err) {
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

