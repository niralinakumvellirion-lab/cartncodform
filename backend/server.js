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
const ScheduledJob = require('./models/ScheduledJob');
const AutomationRule = require('./models/AutomationRule');
const { sendPushToCustomers } = require('./utils/pushNotification');
const CustomerPushSubscription = require('./models/CustomerPushSubscription');

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

// --- Automation: scheduled job sender -----------------------------------
/**
 * Polls for due ScheduledJob rows and sends them. Runs every 30s.
 * Uses a claim-update (findOneAndUpdate with status:'pending' filter)
 * so this is safe even if multiple instances ever run.
 */
async function processScheduledJobs() {
  try {
    const now = new Date();
    const dueJobs = await ScheduledJob.find({
      status: 'pending',
      runAt: { $lte: now },
    }).limit(20);

    for (const job of dueJobs) {
      // Claim the job — only proceed if we successfully flip it from pending.
      const claimed = await ScheduledJob.findOneAndUpdate(
        { _id: job._id, status: 'pending' },
        { status: 'sent', sentAt: new Date() },
        { new: true }
      );
      if (!claimed) continue; // another process already claimed it

      try {
        const payload = job.payload || {};
        const result = await sendPushToCustomers(
          job.shopDomain,
          payload.title || 'You left something behind!',
          payload.body || 'Come back and check it out.',
          payload.url || `https://${job.shopDomain}`,
          payload.imageUrl || null,
          true,
          job.cartToken || null,
          false,
          job.customerId || null
        );

        if (!result.success || result.sent === 0) {
          await ScheduledJob.findByIdAndUpdate(job._id, {
            status: 'failed',
            error: result.error || 'No active subscriber found',
          });
          console.log(`[automation] Job ${job._id} failed: no subscriber reached`);
        } else {
          console.log(`[automation] Job ${job._id} sent successfully`);
        }
      } catch (err) {
        await ScheduledJob.findByIdAndUpdate(job._id, {
          status: 'failed',
          error: err.message,
        });
        console.error(`[automation] Job ${job._id} error:`, err.message);
      }
    }
  } catch (err) {
    console.error('[automation] processScheduledJobs error:', err.message);
  }
}

// Poll every 30 seconds.
setInterval(processScheduledJobs, 30 * 1000);
console.log('[automation] Scheduled job poller started (30s interval)');

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
