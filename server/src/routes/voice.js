import { Router } from 'express';
import { requireAuth, requireShop } from '../middleware/authenticate.js';
import {
  handleProcessVoice,
  handleExecuteVoice,
  handleGetDiagnostics,
} from '../controllers/voiceController.js';

const router = Router();

router.use(requireAuth, requireShop);

// POST /api/voice/process
router.post('/process', handleProcessVoice);

// POST /api/voice/execute
router.post('/execute', handleExecuteVoice);

// GET /api/voice/diagnostics
router.get('/diagnostics', handleGetDiagnostics);

export default router;

