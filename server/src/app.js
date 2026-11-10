import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import apiRouter from './routes/index.js';

const app = express();

const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === clientOrigin) {
        callback(null, true);
      } else {
        callback(new Error(`CORS policy does not allow access from origin: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ── Routes ─────────────────────────────────────────────────────────────────
app.use('/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

export default app;
