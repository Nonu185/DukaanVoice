import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { requireAuth } from '../middleware/authenticate.js';
import {
  register,
  login,
  logout,
  me,
  updateLanguagePreference,
} from '../controllers/authController.js';

const router = Router();

// ── Validation chains ──────────────────────────────────────────────────────

const registerValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Full name is required.')
    .isLength({ max: 80 }).withMessage('Name cannot exceed 80 characters.'),
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Enter a valid email address.')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match.');
    return true;
  }),
  body('primaryLanguage')
    .optional()
    .isIn(['hi', 'hinglish', 'kn', 'en'])
    .withMessage('Primary language must be hi, hinglish, kn, or en.'),
];

const loginValidation = [
  body('email').trim().notEmpty().withMessage('Email is required.').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

// ── Routes (Manual Email + Password Only) ──────────────────────────────────

// POST /api/auth/register
router.post('/register', authLimiter, registerValidation, validate, register);

// POST /api/auth/login
router.post('/login', authLimiter, loginValidation, validate, login);

// POST /api/auth/logout
router.post('/logout', logout);

// GET /api/auth/me
router.get('/me', requireAuth, me);

// PATCH /api/auth/language
router.patch(
  '/language',
  requireAuth,
  [
    body('primaryLanguage')
      .isIn(['hi', 'hinglish', 'kn', 'en'])
      .withMessage('Primary language must be hi, hinglish, kn, or en.'),
  ],
  validate,
  updateLanguagePreference
);

export default router;
