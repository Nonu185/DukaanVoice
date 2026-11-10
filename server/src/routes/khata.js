import { Router } from 'express';
import { body, param } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireShop } from '../middleware/authenticate.js';
import {
  getKhataSummary,
  listKhataTransactions,
  getCustomerLedger,
  recordCredit,
  recordPayment,
} from '../controllers/khataController.js';

const router = Router();

router.use(requireAuth, requireShop);

const khataTxnValidation = [
  body('customer').notEmpty().isMongoId().withMessage('Valid customer ID is required.'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than zero.'),
  body('description').optional().trim(),
  body('idempotencyKey').optional().trim(),
];

// GET /api/khata/summary
router.get('/summary', getKhataSummary);

// GET /api/khata/transactions
router.get('/transactions', listKhataTransactions);

// GET /api/khata/customer/:customerId
router.get('/customer/:customerId', getCustomerLedger);

// POST /api/khata/credit
router.post('/credit', khataTxnValidation, validate, recordCredit);

// POST /api/khata/payment
router.post('/payment', khataTxnValidation, validate, recordPayment);

export default router;

