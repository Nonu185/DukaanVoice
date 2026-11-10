import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Shop from '../models/Shop.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production-12345';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
export const TOKEN_COOKIE_NAME = 'dvai.token';

export const tokenCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * POST /api/auth/register
 * Creates a new user account with email + password and issues an HTTP-only JWT cookie.
 */
export async function register(req, res, next) {
  try {
    const { name, email, password, primaryLanguage, preferredLanguage } = req.body;
    const validLanguages = ['hi', 'hinglish', 'kn', 'en'];
    const chosenLanguage = primaryLanguage || preferredLanguage;
    const finalPrimaryLanguage = validLanguages.includes(chosenLanguage) ? chosenLanguage : 'hi';

    const normalisedEmail = email.toLowerCase().trim();

    // Check for duplicate account
    const existing = await User.findOne({ email: normalisedEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      });
    }

    // Hash password with bcryptjs (salt rounds = 12)
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user in MongoDB
    const user = await User.create({
      name,
      email: normalisedEmail,
      passwordHash,
      primaryLanguage: finalPrimaryLanguage,
    });

    // Generate JWT token (7-day expiry)
    const token = signToken({ userId: user._id.toString() });

    // Store JWT in secure, HTTP-only cookie
    res.cookie(TOKEN_COOKIE_NAME, token, tokenCookieOptions);

    return res.status(201).json({
      success: true,
      user: user.toSafeObject(),
      token,
    });
  } catch (err) {
    console.error('Register error:', err.message);
    const status = err.name === 'ValidationError' ? 400 : err.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: err.message || 'Registration failed.' });
  }
}

/**
 * POST /api/auth/login
 * Authenticates user via email + password and issues an HTTP-only JWT cookie.
 */
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const normalisedEmail = email.toLowerCase().trim();

    // Always fetch passwordHash explicitly (select: false in schema)
    const user = await User.findOne({ email: normalisedEmail }).select('+passwordHash');

    const GENERIC_ERROR = 'Invalid email or password.';

    if (!user) {
      return res.status(401).json({ success: false, message: GENERIC_ERROR });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: GENERIC_ERROR });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    }

    // Generate JWT token (7-day expiry)
    const token = signToken({ userId: user._id.toString() });

    // Store JWT in secure, HTTP-only cookie
    res.cookie(TOKEN_COOKIE_NAME, token, tokenCookieOptions);

    return res.json({
      success: true,
      user: user.toSafeObject(),
      token,
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ success: false, message: 'Login failed.' });
  }
}

/**
 * POST /api/auth/logout
 * Clears the JWT HTTP-only cookie.
 */
export async function logout(req, res) {
  try {
    res.clearCookie(TOKEN_COOKIE_NAME, tokenCookieOptions);
    res.clearCookie('dvai.sid');
    return res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    console.error('Logout error:', err.message);
    return res.status(500).json({ success: false, message: 'Logout failed.' });
  }
}

/**
 * GET /api/auth/me
 * Returns the currently authenticated user.
 */
export async function me(req, res) {
  return res.json({ success: true, user: req.user.toSafeObject() });
}

/**
 * PATCH /api/auth/language
 * Updates the authenticated user's primaryLanguage (and syncs Shop.preferredLanguage).
 */
export async function updateLanguagePreference(req, res) {
  try {
    const { primaryLanguage } = req.body;
    if (!['hi', 'hinglish', 'kn', 'en'].includes(primaryLanguage)) {
      return res.status(400).json({
        success: false,
        message: 'primaryLanguage must be one of: hi, hinglish, kn, en.',
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { primaryLanguage },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    await Shop.findOneAndUpdate(
      { owner: req.user._id },
      { preferredLanguage: primaryLanguage }
    );

    return res.json({
      success: true,
      user: updatedUser.toSafeObject(),
    });
  } catch (err) {
    console.error('Update language error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update primary language.' });
  }
}
