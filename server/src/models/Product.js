import mongoose from 'mongoose';

const SPELLING_ALIASES = {
  aata: 'atta',
  ata: 'atta',
  maggie: 'maggi',
  magie: 'maggi',
  biscut: 'biscuit',
  biscuits: 'biscuit',
  biskut: 'biscuit',
  marrie: 'marie',
  marriage: 'marie',
  chocolates: 'chocolate',
  soaps: 'soap',
  bottles: 'bottle',
  chawal: 'rice',
  chaval: 'rice',
  doodh: 'milk',
  dudh: 'milk',
  cheeni: 'sugar',
  chini: 'sugar',
  namak: 'salt',
  tel: 'oil',
};

export function normalizeUnit(unit = '') {
  const u = String(unit || '').trim().toLowerCase();
  if (!u || ['pc', 'pcs', 'piece', 'pieces', 'पीस', 'नग'].includes(u)) return 'pcs';
  if (['pack', 'packs', 'packet', 'packets', 'pkt', 'pkts', 'पैकेट', 'ಪ್ಯಾಕೆಟ್'].includes(u)) return 'packet';
  if (['kg', 'kgs', 'kilogram', 'kilograms', 'kilo', 'किलो', 'ಕೆಜಿ'].includes(u)) return 'kg';
  if (['g', 'gm', 'gms', 'gram', 'grams', 'ग्राम', 'ಗ್ರಾಂ'].includes(u)) return 'g';
  if (['l', 'ltr', 'litre', 'litres', 'liter', 'liters', 'लीटर', 'ಲೀಟರ್'].includes(u)) return 'litre';
  if (['ml', 'millilitre', 'milliliter'].includes(u)) return 'ml';
  if (['box', 'boxes', 'carton', 'cartons', 'पेटी', 'बॉक्स'].includes(u)) return 'box';
  if (['bottle', 'bottles', 'बोतल'].includes(u)) return 'bottle';
  return u;
}

export function normalizeProductText(text = '') {
  const cleaned = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  return cleaned
    .split(' ')
    .map((word) => SPELLING_ALIASES[word] || word)
    .join(' ');
}

const productSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'Shop association is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [150, 'Product name cannot exceed 150 characters'],
    },
    normalizedName: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    variant: {
      type: String,
      trim: true,
      default: '',
    },
    normalizedVariant: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    hindiName: {
      type: String,
      trim: true,
      default: '',
    },
    category: {
      type: String,
      trim: true,
      default: 'General',
      index: true,
    },
    SKU: {
      type: String,
      trim: true,
      default: '',
    },
    barcode: {
      type: String,
      trim: true,
      default: '',
    },
    purchasePrice: {
      type: Number,
      default: 0,
      min: [0, 'Purchase price cannot be negative'],
    },
    sellingPrice: {
      type: Number,
      default: 0,
      min: [0, 'Selling price cannot be negative'],
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [0, 'Quantity cannot become negative'],
      default: 0,
    },
    unit: {
      type: String,
      required: [true, 'Unit is required'],
      trim: true,
      default: 'pcs',
    },
    normalizedUnit: {
      type: String,
      trim: true,
      lowercase: true,
      default: 'pcs',
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: [0, 'Threshold cannot be negative'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

productSchema.pre('validate', function (next) {
  if (this.name) {
    this.normalizedName = normalizeProductText(this.name);
  }
  this.normalizedVariant = normalizeProductText(this.variant || '');
  this.normalizedUnit = normalizeUnit(this.unit || 'pcs');
  next();
});

// Compound indexes
productSchema.index({ shop: 1, name: 1 });
productSchema.index(
  { shop: 1, normalizedName: 1, normalizedVariant: 1, normalizedUnit: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isActive: true,
      normalizedName: { $type: 'string' },
    },
  }
);
productSchema.index({ shop: 1, category: 1 });
productSchema.index({ shop: 1, SKU: 1 });
productSchema.index({ shop: 1, quantity: 1 });

// Helper to check low stock status
productSchema.virtual('isLowStock').get(function () {
  return this.quantity <= this.lowStockThreshold;
});

export default mongoose.model('Product', productSchema);
