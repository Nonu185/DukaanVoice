import { Router } from 'express';
import { requireAuth, requireShop } from '../middleware/authenticate.js';
import { listSales, getSale } from '../controllers/saleController.js';

const router = Router();

router.use(requireAuth, requireShop);

// GET /api/sales
router.get('/', listSales);

// GET /api/sales/:id
router.get('/:id', getSale);

export default router;
