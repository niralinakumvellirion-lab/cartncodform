require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const webhookRoutes = require('./routes/webhooks');
const storeRoutes = require('./routes/stores');
const codRoutes = require('./routes/cod');
const pushRouter = require('./routes/push');
const proxyRouter = require('./routes/proxy');

const app = express();
// Render sits behind a reverse proxy — trust the X-Forwarded-For
// header so rate limiting and req.ip key on the real client IP.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://cartncodform-beryl.vercel.app',
  'http://localhost:3000',
].filter(Boolean);

// --- Middleware ------------------------------------------------------------
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// Capture the raw body so Shopify webhook HMAC can be verified if needed.
app.use(
  express.json({
    limit: '2mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  })
);
// Parse text/plain bodies (sent by navigator.sendBeacon).
app.use(express.text({ type: 'text/plain' }));
app.use(express.urlencoded({ extended: true }));

// Simple request logger.
app.use((req, _res, next) => {
  console.log(`[http] ${req.method} ${req.originalUrl}`);
  next();
});

// --- Static (Shopify theme script + its service worker) ------------------
// Wide-open CORS on the theme script so any storefront can load it, and the
// Service-Worker-Allowed header so the SW may claim the root scope.
app.use('/cartncodform-push.js', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});
app.use('/cartncodform-sw.js', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Service-Worker-Allowed', '/');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes --------------------------------------------------------------
app.get('/', (_req, res) => {
  res.json({ service: 'CartnCodForm API', status: 'ok' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Rate limiters for the high-volume / abusable public endpoints.
const eventsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const pushLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/cod', codRoutes);
app.use('/api/push', pushLimiter, pushRouter);
const eventsRouter = require('./routes/events');
app.use('/api/events', eventsLimiter, eventsRouter);
app.use('/apps/cartncodform', proxyRouter);

// --- 404 + error handlers ---------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  console.error('[error]', err.stack || err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Boot ---------------------------------------------------------------
async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[server] CartnCodForm API listening on port ${PORT}`);
    console.log(`[server] CORS allowed origins: ${allowedOrigins.join(', ')}`);
  });
}

start();

module.exports = app;
