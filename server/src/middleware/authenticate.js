import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Shop from '../models/Shop.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production-12345';
const TOKEN_COOKIE_NAME = 'dvai.token';

/**
 * Middleware: authenticates requests using JWT stored in an HTTP-only cookie.
 * (Falls back to Authorization: Bearer header if provided).
 *
 * Attaches req.user or responds with 401 Unauthorized.
 */
export async function requireAuth(req, res, next) {
  try {
    // 1. Retrieve token from HTTP-only cookie or Bearer header
    let token = req.cookies?.[TOKEN_COOKIE_NAME];
    if (!token && req.headers?.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No token provided.',
      });
    }

    // 2. Verify JWT token & check expiration
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Session token has expired. Please log in again.',
        });
      }
      return res.status(401).json({
        success: false,
        code: 'TOKEN_INVALID',
        message: 'Invalid authentication token.',
      });
    }

    // 3. Fetch active user from database
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists or account is deactivated.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(500).json({ success: false, message: 'Authentication check failed.' });
  }
}

/**
 * Middleware: checks if user has completed initial shop onboarding.
 * Always use AFTER requireAuth.
 */
export function requireOnboarding(req, res, next) {
  if (!req.user?.hasCompletedOnboarding) {
    return res.status(403).json({
      success: false,
      code: 'ONBOARDING_REQUIRED',
      message: 'Please complete shop onboarding first.',
    });
  }
  next();
}

/**
 * Middleware: derive the authenticated user's shop and attach it to req.
 * Ensures strict shop-scoped isolation for all business endpoints.
 *
 * Attaches:
 *   req.shop   -> Shop document
 *   req.shopId -> Mongoose ObjectId
 */
export async function requireShop(req, res, next) {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const shop = await Shop.findOne({ owner: req.user._id, isActive: true });
    if (!shop) {
      return res.status(403).json({
        success: false,
        code: 'ONBOARDING_REQUIRED',
        message: 'No active shop found. Please complete shop onboarding first.',
      });
    }

    req.shop = shop;
    req.shopId = shop._id;
    next();
  } catch (err) {
    console.error('Shop middleware error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to verify shop access.' });
  }
}
