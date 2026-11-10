import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'Shop association is required'],
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User association is required'],
      index: true,
    },
    action: {
      type: String,
      required: [true, 'Action is required'],
      trim: true,
      index: true,
    },
    entityType: {
      type: String,
      required: [true, 'Entity type is required'],
      enum: ['Shop', 'Product', 'Sale', 'Customer', 'KhataTransaction', 'User'],
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Compound indexes
auditLogSchema.index({ shop: 1, createdAt: -1 });
auditLogSchema.index({ shop: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ shop: 1, entityType: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

/**
 * Records a shop-scoped audit log entry.
 * Kept directly on the AuditLog model for clean encapsulation without extra utility layers.
 */
export async function recordAuditLog(
  { shopId, userId, action, entityType, entityId = null, details = {} },
  session = null
) {
  try {
    const logData = {
      shop: shopId,
      user: userId,
      action,
      entityType,
      entityId,
      details,
    };

    if (session) {
      await AuditLog.create([logData], { session });
    } else {
      await AuditLog.create(logData);
    }
  } catch (err) {
    console.error('Failed to write audit log entry:', err.message);
  }
}

export default AuditLog;

