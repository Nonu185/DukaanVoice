import mongoose from 'mongoose';

const saleItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [0.001, 'Quantity must be greater than zero'],
    },
    price: {
      type: Number,
      required: true,
      min: [0, 'Item price cannot be negative'],
    },
    total: {
      type: Number,
      required: true,
      min: [0, 'Item total cannot be negative'],
    },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'Shop association is required'],
      index: true,
    },
    invoiceNumber: {
      type: String,
      required: true,
      trim: true,
    },
    items: {
      type: [saleItemSchema],
      required: true,
      validate: [(val) => val.length > 0, 'Sale must include at least one item'],
    },
    subtotal: {
      type: Number,
      required: true,
      min: [0, 'Subtotal cannot be negative'],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative'],
    },
    total: {
      type: Number,
      required: true,
      min: [0, 'Total cannot be negative'],
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'upi', 'khata'],
      required: [true, 'Payment method is required'],
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
      default: 'Walk-in Customer',
    },
    idempotencyKey: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound indexes
saleSchema.index({ shop: 1, createdAt: -1 });
saleSchema.index({ shop: 1, invoiceNumber: 1 });
saleSchema.index({ shop: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
saleSchema.index({ shop: 1, paymentMethod: 1 });

export default mongoose.model('Sale', saleSchema);

