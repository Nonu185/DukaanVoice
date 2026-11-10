import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireShop } from '../middleware/authenticate.js';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  adjustStock,
  deleteProduct,
} from '../controllers/productController.js';

const router = Router();

router.use(requireAuth, requireShop);

const productValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required.').isLength({ max: 150 }),
  body('category').trim().notEmpty().withMessage('Category is required.'),
  body('purchasePrice')
    .isFloat({ min: 0 })
    .withMessage('Purchase price must be a non-negative number.'),
  body('sellingPrice')
    .isFloat({ min: 0 })
    .withMessage('Selling price must be a non-negative number.'),
  body('quantity')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Quantity must be a non-negative number.'),
  body('unit').optional().trim(),
  body('lowStockThreshold').optional().isInt({ min: 0 }),
];

// GET /api/products
router.get('/', listProducts);

// GET /api/products/:id
router.get('/:id', getProduct);

// POST /api/products
router.post('/', productValidation, validate, createProduct);

// PUT /api/products/:id
router.put('/:id', productValidation, validate, updateProduct);

// PATCH /api/products/:id/stock
router.patch(
  '/:id/stock',
  [
    body('delta').optional().isNumeric(),
    body('quantity').optional().isFloat({ min: 0 }),
  ],
  validate,
  adjustStock
);

// DELETE /api/products/:id
router.delete('/:id', deleteProduct);

export default router;

