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
const discountRouter = require('./routes/discounts');
const ScheduledJob = require('./models/ScheduledJob');
const Store = require('./models/Store');
const { sendPushToCustomers } = require('./utils/pushNotification');
const { sendAbandonedCartEmail } = require('./utils/email');
const AbandonedCustomer = require('./models/AbandonedCustomer');
const CustomerPushSubscription = require('./models/CustomerPushSubscription');
const Profile = require('./models/Profile');
const { runNightlySignals } = require('./services/signalEngine');
const { runBrainForShop } = require('./services/brain');
const { generateCopy } = require('./services/aiService');
const { checkUnopenedThreshold, updateDeliveredRate } = require('./services/pushHygiene');
const { computeWeights } = require('./services/weightsService');

const app = express();
// Render sits behind a reverse proxy — trust the X-Forwarded-For
// header so rate limiting and req.ip key on the real client IP.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://cartncodform-beryl.vercel.app',
  'https://admin.shopify.com',
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
    limit: '5mb',
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

// Allow the app to be embedded as an iframe inside Shopify Admin.
app.use((_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors https://admin.shopify.com https://*.myshopify.com"
  );
  next();
});

// --- Static (customer service worker) -----------------------------------
// Wide-open CORS on the service worker so any storefront can load it, and
// the Service-Worker-Allowed header so the SW may claim the root scope.
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

const attributionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
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
const attributionRouter = require('./routes/attribution');
app.use('/api/attribution', attributionLimiter, attributionRouter);
const profilesRouter = require('./routes/profiles');
app.use('/api/profiles', profilesRouter);
app.use('/api/discounts', discountRouter);
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
 * Returns true if sending a push right now would violate quiet
 * hours (10pm-8am) in the given IANA timezone.
 */
function isQuietHours(timezone) {
  try {
    const now = new Date();
    const hour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: timezone || 'Asia/Kolkata',
      }).format(now),
      10
    );
    return hour >= 22 || hour < 8;
  } catch (err) {
    console.error('[automation] isQuietHours error:', err.message);
    return false; // fail open — don't block sends on a bad timezone
  }
}

/**
 * Returns true if this cartToken/customerId has already received
 * 3+ automation pushes in the last 24 hours.
 */
async function isOverFrequencyCap(shopDomain, cartToken, customerId) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const orClauses = [];
  if (cartToken) orClauses.push({ cartToken });
  if (customerId) orClauses.push({ customerId });
  if (!orClauses.length) return false;

  const count = await ScheduledJob.countDocuments({
    shopDomain,
    status: 'sent',
    sentAt: { $gte: since },
    $or: orClauses,
  });
  return count >= 3;
}

/**
 * Phase C: append a "sent" entry to the profile's message log (kept to the
 * last 20). Best-effort — a logging failure must not fail the send.
 */
async function recordProfileMessage(job) {
  if (!job.profileId) return;
  await Profile.findByIdAndUpdate(job.profileId, {
    $push: {
      messages: {
        $each: [{
          channel: job.channel,
          type: job.signalType || 'manual',
          sentAt: new Date(),
          outcome: 'sent',
          jobId: job._id,
        }],
        $slice: -20, // keep last 20 only
      },
    },
  });
}

/**
 * Polls for due ScheduledJob rows and sends them. Runs every 30s.
 * Uses a claim-update (findOneAndUpdate with status:'pending' filter)
 * so this is safe even if multiple instances ever run.
 */
async function processScheduledJobs() {
  try {
    // Phase C2 — run signals + brain once per shop per day, driven by this 30s
    // tick instead of a one-shot setTimeout (which was lost on every Render
    // restart / dyno sleep). A restart just means the next tick catches up.
    try {
      const shopsToCheck = await Store.find(
        {},
        'shopDomain lastSignalRunAt timezone'
      ).lean();
      for (const s of shopsToCheck) {
        const tz = s.timezone || 'Asia/Kolkata';
        const nowD = new Date();
        // today's date in the store's timezone (YYYY-MM-DD)
        const todayStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(nowD);
        const target2am = new Date(`${todayStr}T02:00:00`);
        const alreadyRanToday = s.lastSignalRunAt && s.lastSignalRunAt >= target2am;

        if (nowD >= target2am && !alreadyRanToday) {
          // Claim first so overlapping ticks can't double-run.
          await Store.findOneAndUpdate(
            { shopDomain: s.shopDomain },
            { lastSignalRunAt: nowD }
          );

          runNightlySignals(s.shopDomain)
            .then(() => runBrainForShop(s.shopDomain))
            .then(() => computeWeights(s.shopDomain)) // Phase H — refresh weights for tomorrow
            .catch((err) => console.error('[signals] nightly error:', err.message));

          // Reset the rolling 7-day push stats for shops whose window expired.
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          await Store.updateMany(
            { 'pushStats.lastComputedAt': { $lt: sevenDaysAgo } },
            {
              $set: {
                'pushStats.deliveredLast7d': 0,
                'pushStats.attemptedLast7d': 0,
                'pushStats.rateLast7d': 0,
              },
            }
          ).catch((err) => console.error('[hygiene] stats reset error:', err.message));
        }
      }
    } catch (gateErr) {
      console.error('[signals] nightly gate error:', gateErr.message);
    }

    const now = new Date();
    const dueJobs = await ScheduledJob.find({
      status: 'pending',
      runAt: { $lte: now },
    }).limit(20);

    for (const job of dueJobs) {
      // Check quiet hours + frequency cap BEFORE claiming — if
      // blocked, leave the job pending and re-check next tick
      // (quiet hours) or skip it permanently (frequency cap).
      const Store = require('./models/Store');
      const store = await Store.findOne({ shopDomain: job.shopDomain }).select('timezone').lean();
      const timezone = store?.timezone || 'Asia/Kolkata';

      if (isQuietHours(timezone)) {
        console.log(`[automation] Job ${job._id} deferred — quiet hours (${timezone})`);
        continue; // leave pending, retry next tick
      }

      const overCap = await isOverFrequencyCap(job.shopDomain, job.cartToken, job.customerId);
      if (overCap) {
        await ScheduledJob.findOneAndUpdate(
          { _id: job._id, status: 'pending' },
          { status: 'skipped', error: 'Frequency cap reached (3/24h)' }
        );
        console.log(`[automation] Job ${job._id} skipped — frequency cap reached`);
        continue;
      }

      // Claim the job — only proceed if we successfully flip it from pending.
      const claimed = await ScheduledJob.findOneAndUpdate(
        { _id: job._id, status: 'pending' },
        { status: 'sent', sentAt: new Date() },
        { new: true }
      );
      if (!claimed) continue; // another process already claimed it

      // Phase C send-time re-validation — if runAt somehow sits in the
      // future (clock skew / rescheduled), release the claim and retry.
      if (job.profileId && job.runAt > new Date()) {
        await ScheduledJob.findByIdAndUpdate(job._id, { status: 'pending' });
        continue;
      }

      try {
        const channel = job.channel || 'push';
        const payload = job.payload || {};

        // Phase E — resolve copy at SEND time (cached per shop/signal/product/
        // channel/voice). Load the store once and reuse it for both branches.
        const jobStore = await Store.findOne({ shopDomain: job.shopDomain });
        const voice = (jobStore && jobStore.voice) || {};
        const product = {
          title: payload.title || '',
          price: '', // not stored on the job yet — blank for now
          productId: (payload.url && payload.url.split('/products/')[1]) || null,
        };

        if (channel === 'push') {
          // Only brain-scheduled jobs (job.profileId set) get AI copy.
          // Legacy rule-scheduled jobs (profileId unset) keep their frozen payload.
          if (job.profileId) {
            const copy = await generateCopy(
              { ...(jobStore && jobStore.toObject ? jobStore.toObject() : {}), voice },
              job.signalType || 'cart_abandon',
              product,
              'push'
            ).catch(() => ({
              title: 'You left something behind',
              body: 'Come back and complete your order.',
            }));
            payload.title = copy.title || payload.title;
            payload.body = copy.body || payload.body;
          }

          const baseUrl = payload.url || `https://${job.shopDomain}`;
          const urlWithJob = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'ccf_job=' + job._id.toString();
          const result = await sendPushToCustomers(
            job.shopDomain,
            payload.title || 'You left something behind!',
            payload.body || 'Come back and check it out.',
            urlWithJob,
            payload.imageUrl || null,
            false,
            job.cartToken || null,
            false
          );

          if (!result.success || result.sent === 0) {
            await ScheduledJob.findByIdAndUpdate(job._id, {
              status: 'failed',
              error: result.error || 'No active subscriber found',
            });
            console.log(`[automation] Job ${job._id} failed: no subscriber reached`);
          } else {
            console.log(`[automation] Job ${job._id} sent successfully`);
            await recordProfileMessage(job).catch((e) =>
              console.error('[brain] message log error:', e.message)
            );

            // Phase F — push hygiene after a successful send.
            if (job.profileId) {
              await checkUnopenedThreshold(job.profileId, job.shopDomain)
                .catch((err) => console.error('[hygiene] threshold error:', err.message));
            }
            if (result && result.tokensFound >= 0) {
              await updateDeliveredRate(
                job.shopDomain,
                result.sent || 0,
                result.tokensFound || 0
              ).catch((err) => console.error('[hygiene] rate error:', err.message));
            }
          }
        } else if (channel === 'email') {
          const customer = await AbandonedCustomer.findOne({
            shopDomain: job.shopDomain,
            sessionId: job.cartToken,
          });
          if (!customer || !customer.email) {
            await ScheduledJob.findByIdAndUpdate(job._id, {
              status: 'skipped',
              error: 'No customer email for this cart',
            });
            console.log(`[automation] Job ${job._id} skipped — no customer email`);
          } else {
            // Only brain-scheduled jobs (job.profileId set) get AI copy.
            // Legacy rule-scheduled jobs (profileId unset) keep their frozen payload.
            let copy = {};
            if (job.profileId) {
              copy = await generateCopy(
                { ...(jobStore && jobStore.toObject ? jobStore.toObject() : {}), voice },
                job.signalType || 'cart_abandon',
                product,
                'email'
              ).catch(() => ({
                subject: 'We saved your cart',
                body: 'Hi,\n\nYou left items in your cart.\n\nThanks',
              }));
            }

            const cartUrl = `https://${job.shopDomain}/cart`;
            const sendResult = await sendAbandonedCartEmail(customer, {
              subject: copy.subject || payload.subject || undefined,
              body: copy.body || payload.body || undefined,
              cartUrl,
            });
            if (!sendResult.success) {
              await ScheduledJob.findByIdAndUpdate(job._id, {
                status: 'failed',
                error: sendResult.error || 'Email send failed',
              });
              console.log(`[automation] Job ${job._id} email failed: ${sendResult.error}`);
            } else {
              console.log(`[automation] Job ${job._id} email sent successfully`);
              await recordProfileMessage(job).catch((e) =>
                console.error('[brain] message log error:', e.message)
              );
            }
          }
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

// Poll every 30 seconds. The nightly signals + brain run is gated inside this
// same tick (see processScheduledJobs), so there is no separate scheduler.
setInterval(processScheduledJobs, 30 * 1000);
console.log('[automation] Scheduled job poller started (30s interval; nightly signals gated inside)');

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
