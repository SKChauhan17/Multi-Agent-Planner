import dotenv from 'dotenv';
dotenv.config();

import express, { Application, type NextFunction, type Request, type Response } from 'express';
import cors, { type CorsOptions } from 'cors';
import apiRouter from './routes';
import { initializeDatabase } from './db/index';

const app: Application = express();
const PORT = parseInt(process.env.PORT || '4000', 10);
const INTERNAL_API_TOKEN = (process.env.INTERNAL_API_TOKEN || '').trim();
const JSON_BODY_LIMIT = (process.env.JSON_BODY_LIMIT || '200kb').trim() || '200kb';

const parseInteger = (value: string | undefined, fallback: number, minimum = 1): number => {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }

  return parsed;
};

const parseAllowedOrigins = (rawOrigins: string | undefined): string[] => {
  const value = (rawOrigins || 'http://localhost:3000').trim();
  const parsed = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return parsed.length > 0 ? parsed : ['http://localhost:3000'];
};

const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);
const RATE_LIMIT_WINDOW_MS = parseInteger(process.env.RATE_LIMIT_WINDOW_MS, 60_000);
const RATE_LIMIT_MAX_REQUESTS = parseInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 120);

if (process.env.NODE_ENV === 'production' && !INTERNAL_API_TOKEN) {
  throw new Error('INTERNAL_API_TOKEN must be set in production.');
}

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-api-token'],
  optionsSuccessStatus: 204,
};

const ipRequestBuckets = new Map<string, number[]>();

// ─── Middleware ──────────────────────────────
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
});

app.use(cors(corsOptions));
app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.use((req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const existingWindow = ipRequestBuckets.get(key) ?? [];
  const filteredWindow = existingWindow.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (filteredWindow.length >= RATE_LIMIT_MAX_REQUESTS) {
    res.status(429).json({
      success: false,
      error: {
        code: 429,
        message: 'Too many requests. Please try again shortly.',
      },
    });
    return;
  }

  filteredWindow.push(now);
  ipRequestBuckets.set(key, filteredWindow);
  next();
});

// ─── Health Check ────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ──────────────────────────────
app.use('/api', (req, res, next) => {
  if (!INTERNAL_API_TOKEN) {
    next();
    return;
  }

  const token = req.header('x-internal-api-token')?.trim() || '';
  if (token !== INTERNAL_API_TOKEN) {
    res.status(401).json({
      success: false,
      error: {
        code: 401,
        message: 'Unauthorized request.',
      },
    });
    return;
  }

  next();
});

app.use('/api', apiRouter);

// ─── 404 Catch-All ───────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 404, message: 'Route not found.' },
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Error && err.message === 'Origin not allowed by CORS') {
    res.status(403).json({
      success: false,
      error: {
        code: 403,
        message: 'Origin not allowed.',
      },
    });
    return;
  }

  console.error('Unhandled server error in Task API.');
  res.status(500).json({
    success: false,
    error: {
      code: 500,
      message: 'Internal server error.',
    },
  });
});

// ─── Initialize DB & Start Server ────────────
initializeDatabase()
  .then(() => {
    console.log('Database initialized');
  })
  .catch((err) => {
    console.error('Failed to start server due to DB init error:', err);
    process.exit(1);
  });

app.listen(PORT, () => {
  console.log(`Task API running at http://localhost:${PORT}`);
});

export default app;
