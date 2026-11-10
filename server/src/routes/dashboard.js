import { Router } from 'express';
import { requireAuth, requireShop } from '../middleware/authenticate.js';
import { getDashboardStats } from '../controllers/dashboardController.js';

const router = Router();

router.use(requireAuth, requireShop);

// GET /api/dashboard/stats
router.get('/stats', getDashboardStats);

export default router;

