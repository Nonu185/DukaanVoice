import mongoose from 'mongoose';

const shopSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    shopName: {
      type: String,
      required: [true, 'Shop name is required'],
      trim: true,
      maxlength: [120, 'Shop name cannot exceed 120 characters'],
    },
    ownerName: {
      type: String,
      required: [true, 'Owner name is required'],
      trim: true,
      maxlength: [100, 'Owner name cannot exceed 100 characters'],
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
    address: {
      type: String,
      trim: true,
      maxlength: [300, 'Address cannot exceed 300 characters'],
      default: '',
    },
    preferredLanguage: {
      type: String,
      enum: ['hi', 'hinglish', 'kn', 'en'],
      default: 'hi',
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
    },
    gstin: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual alias for backwards compatibility: 'name' -> 'shopName'
shopSchema.virtual('name').get(function () {
  return this.shopName;
});
shopSchema.virtual('name').set(function (v) {
  this.shopName = v;
});

export default mongoose.model('Shop', shopSchema);
