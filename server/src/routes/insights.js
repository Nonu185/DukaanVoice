import { Router } from 'express';
import { requireAuth, requireShop } from '../middleware/authenticate.js';
import { getBusinessInsights } from '../controllers/insightsController.js';

const router = Router();

router.use(requireAuth, requireShop);

// GET /api/insights
router.get('/', getBusinessInsights);

export default router;

