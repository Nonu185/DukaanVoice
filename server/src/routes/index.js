import { Router } from 'express';
import shopRouter from './shop.js';
import productRouter from './products.js';
import saleRouter from './sales.js';
import customerRouter from './customers.js';
import khataRouter from './khata.js';
import dashboardRouter from './dashboard.js';
import voiceRouter from './voice.js';
import insightsRouter from './insights.js';

const router = Router();

// DukaanVoice AI Business API Modules
router.use('/shop', shopRouter);
router.use('/products', productRouter);
router.use('/sales', saleRouter);
router.use('/customers', customerRouter);
router.use('/khata', khataRouter);
router.use('/dashboard', dashboardRouter);
router.use('/voice', voiceRouter);
router.use('/insights', insightsRouter);

export default router;
