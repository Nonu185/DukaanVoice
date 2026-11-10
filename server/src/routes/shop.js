import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/authenticate.js';
import { onboardShop, getMyShop, updateMyShop } from '../controllers/shopController.js';

const router = Router();

router.use(requireAuth);

const shopOnboardValidation = [
  body('shopName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Shop name is required.')
    .isLength({ max: 120 }),
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Shop name is required.')
    .isLength({ max: 120 }),
  body('ownerName')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Owner name is required.')
    .isLength({ max: 100 }),
  body('phone')
    .optional({ values: 'falsy' })
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Enter a valid 10-digit Indian mobile number.'),
  body('address')
    .optional()
    .isLength({ max: 300 })
    .withMessage('Address cannot exceed 300 characters.'),
  body('preferredLanguage')
    .optional()
    .isIn(['hi', 'hinglish', 'kn', 'en'])
    .withMessage('Language must be hi, hinglish, kn, or en.'),
  body('currency')
    .optional()
    .isLength({ max: 10 }),
];

// POST /api/shop/onboard
router.post('/onboard', shopOnboardValidation, validate, onboardShop);

// GET /api/shop
router.get('/', getMyShop);

// PATCH /api/shop
router.patch('/', shopOnboardValidation, validate, updateMyShop);

export default router;
