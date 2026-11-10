import Shop from '../models/Shop.js';
import User from '../models/User.js';
import { recordAuditLog } from '../models/AuditLog.js';

/**
 * POST /api/shop/onboard
 * Creates or updates the shop associated with the authenticated user.
 */
export async function onboardShop(req, res, next) {
  try {
    const {
      shopName,
      name,
      ownerName,
      phone,
      address,
      preferredLanguage,
      currency,
      gstin,
    } = req.body;

    const ownerId = req.user._id;
    const finalShopName = shopName || name;
    const finalOwnerName = ownerName || req.user.name;
    const finalPhone = phone || req.user.phone || '';

    const finalPreferredLanguage = preferredLanguage || req.user.primaryLanguage || 'hi';

    const shop = await Shop.findOneAndUpdate(
      { owner: ownerId },
      {
        shopName: finalShopName,
        ownerName: finalOwnerName,
        phone: finalPhone,
        address: address || '',
        preferredLanguage: finalPreferredLanguage,
        currency: currency || 'INR',
        gstin: gstin || '',
        isActive: true,
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    // Mark user onboarding complete and sync primaryLanguage
    await User.findByIdAndUpdate(ownerId, {
      hasCompletedOnboarding: true,
      primaryLanguage: finalPreferredLanguage,
    });

    await recordAuditLog({
      shopId: shop._id,
      userId: ownerId,
      action: 'SHOP_ONBOARDED',
      entityType: 'Shop',
      entityId: shop._id,
      details: { shopName: shop.shopName, ownerName: shop.ownerName },
    });

    return res.status(200).json({ success: true, shop });
  } catch (err) {
    console.error('Onboard shop error:', err.message);
    const status = err.name === 'ValidationError' ? 400 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Failed to create shop.' });
  }
}

/**
 * GET /api/shop
 * Returns the authenticated user's shop.
 */
export async function getMyShop(req, res) {
  try {
    const shop = await Shop.findOne({ owner: req.user._id, isActive: true });
    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }
    return res.json({ success: true, shop });
  } catch (err) {
    console.error('Get shop error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load shop profile.' });
  }
}

/**
 * PATCH /api/shop
 * Updates the authenticated user's shop.
 */
export async function updateMyShop(req, res) {
  try {
    const {
      shopName,
      name,
      ownerName,
      phone,
      address,
      preferredLanguage,
      currency,
      gstin,
    } = req.body;

    const updateFields = {};
    if (shopName || name) updateFields.shopName = shopName || name;
    if (ownerName) updateFields.ownerName = ownerName;
    if (phone !== undefined) updateFields.phone = phone;
    if (address !== undefined) updateFields.address = address;
    if (preferredLanguage) updateFields.preferredLanguage = preferredLanguage;
    if (currency) updateFields.currency = currency;
    if (gstin !== undefined) updateFields.gstin = gstin;

    const shop = await Shop.findOneAndUpdate(
      { owner: req.user._id },
      updateFields,
      { new: true, runValidators: true }
    );

    if (!shop) {
      return res.status(404).json({ success: false, message: 'Shop not found.' });
    }

    if (preferredLanguage) {
      await User.findByIdAndUpdate(req.user._id, { primaryLanguage: preferredLanguage });
    }

    await recordAuditLog({
      shopId: shop._id,
      userId: req.user._id,
      action: 'SHOP_UPDATED',
      entityType: 'Shop',
      entityId: shop._id,
      details: updateFields,
    });

    return res.json({ success: true, shop });
  } catch (err) {
    console.error('Update shop error:', err.message);
    const status = err.name === 'ValidationError' ? 400 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Failed to update shop.' });
  }
}
