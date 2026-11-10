import Product, { normalizeProductText, normalizeUnit } from '../models/Product.js';
import { recordAuditLog } from '../models/AuditLog.js';

/**
 * GET /api/products
 * List products with pagination, search, category, and stock status filters.
 */
export async function listProducts(req, res, next) {
  try {
    const { search, category, status, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const query = { shop: req.shopId, isActive: true };

    // Search filter across name, hindiName, SKU, barcode
    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: searchRegex },
        { hindiName: searchRegex },
        { SKU: searchRegex },
        { barcode: searchRegex },
      ];
    }

    // Category filter
    if (category && category !== 'all') {
      query.category = category;
    }

    // Stock status filter
    if (status === 'out_of_stock') {
      query.quantity = { $lte: 0 };
    } else if (status === 'low_stock') {
      query.$expr = {
        $and: [
          { $gt: ['$quantity', 0] },
          { $lte: ['$quantity', '$lowStockThreshold'] },
        ],
      };
    } else if (status === 'in_stock') {
      query.$expr = { $gt: ['$quantity', '$lowStockThreshold'] };
    }

    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };

    const [products, total] = await Promise.all([
      Product.find(query).sort(sort).skip(skip).limit(limit).lean(),
      Product.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    return res.json({
      success: true,
      data: products,
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
 * GET /api/products/:id
 * Retrieve a single product by ID, strictly scoped to shop.
 */
export async function getProduct(req, res, next) {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      shop: req.shopId,
      isActive: true,
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    return res.json({ success: true, product });
  } catch (err) {
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

/**
 * POST /api/products
 * Create a new product.
 */
export async function createProduct(req, res, next) {
  try {
    const {
      name,
      hindiName,
      variant,
      category,
      SKU,
      barcode,
      purchasePrice,
      sellingPrice,
      quantity,
      unit,
      lowStockThreshold,
    } = req.body;

    // Validate quantities & prices
    if (Number(quantity) < 0) {
      return res.status(400).json({ success: false, message: 'Quantity cannot be negative.' });
    }
    if (Number(purchasePrice) < 0 || Number(sellingPrice) < 0) {
      return res.status(400).json({ success: false, message: 'Prices cannot be negative.' });
    }

    const cleanUnit = unit || 'pcs';
    const normName = normalizeProductText(name);
    const normVariant = normalizeProductText(variant || '');
    const normUnit = normalizeUnit(cleanUnit);

    const existingDuplicate = await Product.findOne({
      shop: req.shopId,
      normalizedName: normName,
      normalizedVariant: normVariant,
      normalizedUnit: normUnit,
      isActive: true,
    });

    if (existingDuplicate) {
      return res.status(409).json({
        success: false,
        message: `Product "${existingDuplicate.name}" (${existingDuplicate.unit}) already exists.`,
      });
    }

    const product = await Product.create({
      shop: req.shopId,
      name,
      variant: variant || '',
      hindiName: hindiName || '',
      category: category || 'General',
      SKU: SKU || '',
      barcode: barcode || '',
      purchasePrice: Number(purchasePrice) || 0,
      sellingPrice: Number(sellingPrice) || 0,
      quantity: Number(quantity) || 0,
      unit: cleanUnit,
      lowStockThreshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : 5,
    });

    await recordAuditLog({
      shopId: req.shopId,
      userId: req.user._id,
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: product._id,
      details: { name: product.name, quantity: product.quantity, sellingPrice: product.sellingPrice },
    });

    return res.status(201).json({ success: true, product });
  } catch (err) {
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

/**
 * PUT /api/products/:id
 * Update product details.
 */
export async function updateProduct(req, res, next) {
  try {
    const {
      name,
      hindiName,
      variant,
      category,
      SKU,
      barcode,
      purchasePrice,
      sellingPrice,
      quantity,
      unit,
      lowStockThreshold,
    } = req.body;

    if (quantity !== undefined && Number(quantity) < 0) {
      return res.status(400).json({ success: false, message: 'Quantity cannot be negative.' });
    }
    if (purchasePrice !== undefined && Number(purchasePrice) < 0) {
      return res.status(400).json({ success: false, message: 'Purchase price cannot be negative.' });
    }
    if (sellingPrice !== undefined && Number(sellingPrice) < 0) {
      return res.status(400).json({ success: false, message: 'Selling price cannot be negative.' });
    }

    const updateData = {};
    if (name) {
      updateData.name = name;
      updateData.normalizedName = normalizeProductText(name);
    }
    if (variant !== undefined) {
      updateData.variant = variant;
      updateData.normalizedVariant = normalizeProductText(variant);
    }
    if (hindiName !== undefined) updateData.hindiName = hindiName;
    if (category) updateData.category = category;
    if (SKU !== undefined) updateData.SKU = SKU;
    if (barcode !== undefined) updateData.barcode = barcode;
    if (purchasePrice !== undefined) updateData.purchasePrice = Number(purchasePrice);
    if (sellingPrice !== undefined) updateData.sellingPrice = Number(sellingPrice);
    if (quantity !== undefined) updateData.quantity = Number(quantity);
    if (unit) {
      updateData.unit = unit;
      updateData.normalizedUnit = normalizeUnit(unit);
    }
    if (lowStockThreshold !== undefined) updateData.lowStockThreshold = Number(lowStockThreshold);

    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, shop: req.shopId, isActive: true },
      updateData,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    await recordAuditLog({
      shopId: req.shopId,
      userId: req.user._id,
      action: 'PRODUCT_UPDATED',
      entityType: 'Product',
      entityId: product._id,
      details: updateData,
    });

    return res.json({ success: true, product });
  } catch (err) {
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

/**
 * PATCH /api/products/:id/stock
 * Adjust product stock (increase or decrease).
 * Business rule: product quantities cannot become negative.
 */
export async function adjustStock(req, res, next) {
  try {
    const { delta, quantity } = req.body;

    const product = await Product.findOne({
      _id: req.params.id,
      shop: req.shopId,
      isActive: true,
    });

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    let newQuantity;
    if (quantity !== undefined) {
      newQuantity = Number(quantity);
    } else if (delta !== undefined) {
      newQuantity = product.quantity + Number(delta);
    } else {
      return res.status(400).json({ success: false, message: 'Provide either delta or quantity.' });
    }

    if (newQuantity < 0) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Current stock is ${product.quantity}, cannot reduce below zero.`,
      });
    }

    const previousQuantity = product.quantity;
    product.quantity = newQuantity;
    await product.save();

    await recordAuditLog({
      shopId: req.shopId,
      userId: req.user._id,
      action: 'STOCK_ADJUSTED',
      entityType: 'Product',
      entityId: product._id,
      details: {
        productName: product.name,
        previousQuantity,
        newQuantity,
        change: newQuantity - previousQuantity,
      },
    });

    return res.json({ success: true, product });
  } catch (err) {
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

/**
 * DELETE /api/products/:id
 * Soft delete product.
 */
export async function deleteProduct(req, res, next) {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, shop: req.shopId, isActive: true },
      { isActive: false },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    await recordAuditLog({
      shopId: req.shopId,
      userId: req.user._id,
      action: 'PRODUCT_DELETED',
      entityType: 'Product',
      entityId: product._id,
      details: { name: product.name },
    });

    return res.json({ success: true, message: 'Product removed successfully.' });
  } catch (err) {
    console.error(err.message);
    const status = err.name === 'ValidationError' || err.name === 'CastError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Server error.' });
  }
}

