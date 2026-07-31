// src/app.js — Express application setup
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { CORS_ORIGIN, NODE_ENV } = require('./config/env');
const { getMetrics, requestCounter } = require('./utils/metrics');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Route imports
const authRoutes = require('./routes/auth');
const playerRoutes = require('./routes/players');
const roomRoutes = require('./routes/rooms');
const matchRoutes = require('./routes/matches');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');
const questRoutes = require('./routes/quests');

const app = express();

// ── Security middleware ──────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,   // Allow embedding for game assets
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin images for canvas
}));

app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));

// Rate limiting (100 req/minute per IP)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please slow down.' },
});
app.use('/api/', limiter);

// ── General middleware ───────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ── Static Files ─────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));
app.use(requestCounter);  // Track request count

// HTTP request logging (skip in test)
if (NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// ── Health & Metrics endpoints ───────────────────────────────────

// GET /health — Required for Azure health probes
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'arenablast-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// GET /metrics — Basic observability metrics
app.get('/metrics', (req, res) => {
  res.json(getMetrics());
});

// ── API Routes ───────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/quests', questRoutes);

// ── Error handling ───────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
