import { Router } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireShop } from '../middleware/authenticate.js';
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '../controllers/customerController.js';

const router = Router();

router.use(requireAuth, requireShop);

const customerValidation = [
  body('name').trim().notEmpty().withMessage('Customer name is required.').isLength({ max: 100 }),
  body('phone')
    .trim()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Enter a valid 10-digit Indian phone number.'),
  body('creditLimit')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Credit limit must be a non-negative number.'),
  body('address').optional().trim(),
  body('notes').optional().trim(),
];

// GET /api/customers
router.get('/', listCustomers);

// GET /api/customers/:id
router.get('/:id', getCustomer);

// POST /api/customers
router.post('/', customerValidation, validate, createCustomer);

// PUT /api/customers/:id
router.put('/:id', customerValidation, validate, updateCustomer);

// DELETE /api/customers/:id
router.delete('/:id', deleteCustomer);

export default router;

