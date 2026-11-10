import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'Shop association is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      maxlength: [100, 'Customer name cannot exceed 100 characters'],
    },
    phone: {
      type: String,
      default: '',
      trim: true,
      validate: {
        validator: (v) => !v || /^[6-9]\d{9}$/.test(v),
        message: 'Please enter a valid 10-digit Indian phone number',
      },
    },
    totalCredit: {
      type: Number,
      default: 0,
    },
    creditLimit: {
      type: Number,
      default: 5000,
      min: [0, 'Credit limit cannot be negative'],
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Compound indexes
customerSchema.index({ shop: 1, phone: 1 });
customerSchema.index({ shop: 1, totalCredit: 1 });
customerSchema.index({ shop: 1, name: 1 });

export default mongoose.model('Customer', customerSchema);

