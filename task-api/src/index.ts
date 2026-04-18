import dotenv from 'dotenv';
dotenv.config();

import express, { Application } from 'express';
import cors from 'cors';
import apiRouter from './routes';
import { initializeDatabase } from './db/index';

const app: Application = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// ─── Middleware ──────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Health Check ────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ──────────────────────────────
app.use('/api', apiRouter);

// ─── 404 Catch-All ───────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 404, message: 'Route not found.' },
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
  console.log(`🚀 Task API running at http://localhost:${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`   POST   /api/plans`);
  console.log(`   GET    /api/plans/:id`);
  console.log(`   DELETE /api/plans/:id`);
  console.log(`   PATCH  /api/tasks/:id`);
  setInterval(() => {}, 1000 * 60 * 60); // Keep alive
});

export default app;
