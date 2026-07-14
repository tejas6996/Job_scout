import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import jobsRouter from './routes/jobs.js';
import { startBackgroundRefresh } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT) || 8787;
const ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ---- Security & performance middleware ----
app.disable('x-powered-by');
app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin(origin, cb) {
      // Allow same-origin / tools with no Origin header, plus the allow-list.
      if (!origin || ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    methods: ['GET'],
  }),
);
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    max: 60, // 60 requests / minute / IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down.' },
  }),
);

// ---- API ----
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'job-scout-api', time: new Date().toISOString() });
});
app.use('/api', jobsRouter);

// ---- Optionally serve the built front-end (single-service deploy) ----
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ---- Fallbacks ----
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err?.message === 'Not allowed by CORS' ? 403 : 500;
  res.status(status).json({ error: status === 403 ? 'Origin not allowed' : 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`JobScout API running on http://localhost:${PORT}`);
  console.log(`Allowed origins: ${ORIGINS.join(', ')}`);
});

startBackgroundRefresh();
