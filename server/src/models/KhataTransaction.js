import mongoose from 'mongoose';

const khataTransactionSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'Shop association is required'],
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer association is required'],
      index: true,
    },
    type: {
      type: String,
      enum: ['credit', 'payment'],
      required: [true, 'Transaction type must be either credit or payment'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      default: null,
    },
    balanceAfter: {
      type: Number,
      default: 0,
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
khataTransactionSchema.index({ shop: 1, customer: 1, createdAt: -1 });
khataTransactionSchema.index({ shop: 1, createdAt: -1 });
khataTransactionSchema.index({ shop: 1, idempotencyKey: 1 }, { unique: true, sparse: true });

export default mongoose.model('KhataTransaction', khataTransactionSchema);

