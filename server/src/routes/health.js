import { Router } from 'express';
import mongoose from 'mongoose';

const router = Router();

router.get('/', (_req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] ?? 'unknown';

  res.json({
    success: true,
    service: 'DukaanVoice API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    uptime: process.uptime(),
  });
});

export default router;
