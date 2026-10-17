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
const FestivalQueue = require('./models/FestivalQueue');
const Store = require('./models/Store');
const { sendPushToCustomers, buildClickUrl } = require('./utils/pushNotification');
const { sendAbandonedCartEmail, sendMarketingEmail } = require('./utils/email');
const AbandonedCustomer = require('./models/AbandonedCustomer');
const CustomerPushSubscription = require('./models/CustomerPushSubscription');
const Profile = require('./models/Profile');
const AutomationConfig = require('./models/AutomationConfig');
const { runNightlySignals } = require('./services/signalEngine');
const { runBrainForShop } = require('./services/brain');
const { generateCopy, generateEmailCopy } = require('./services/aiService');
const { checkUnopenedThreshold, updateDeliveredRate } = require('./services/pushHygiene');
const { computeWeights } = require('./services/weightsService');
const { isQuietNow } = require('./utils/timezone');
const { logBroadcastSend } = require('./services/sendLogService');

const app = express();
// Render sits behind a reverse proxy — trust the X-Forwarded-For
// header so rate limiting and req.ip key on the real client IP.
app.set('trust proxy', 1);
const PORT = process.env.PORT || 4000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.STOREFRONT_URL,   // custom storefront domain, e.g. https://www.example.com
  'https://app.shopireachboost.com',
  'https://admin.shopireachboost.com', // platform admin panel
  'https://admin.shopify.com',
  'https://cartncod-form.myshopify.com',
  'http://localhost:3000',
  'http://localhost:3030',
].filter(Boolean);

// --- Middleware ------------------------------------------------------------
app.use(
  cors({
    origin: function (origin, callback) {
      // No origin = server-side request (App Proxy, curl, health checks) — always allow.
      if (!origin) { callback(null, true); return; }
      // Exact match against the explicit allow-list.
      if (allowedOrigins.includes(origin)) { callback(null, true); return; }
      // Allow any *.myshopify.com storefront so stores on the default subdomain
      // work without listing each one — ccf-push.js makes direct backend calls
      // from the storefront page (/api/events, /api/push/cart-activity, etc.).
      if (/^https:\/\/[a-z0-9-]+\.myshopify\.com$/.test(origin)) { callback(null, true); return; }
      console.warn('[cors] rejected origin:', origin);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Capture the raw body so Shopify webhook HMAC can be verified if needed.
app.use(
  express.json({
    limit: '10mb',
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
  res.json({ service: 'ShopiReachBoost AI API', status: 'ok' });
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
// requireAuth-protected admin endpoint (Phase 2 attribution activity) — no
// rate limiter, matching /api/profiles and /api/discounts above: those
// limiters are reserved for the public, unauthenticated storefront routes.
const activityRouter = require('./routes/activity');
app.use('/api/activity', activityRouter);
// requireAuth-protected admin endpoint (Phase 2 notification queue) — no
// rate limiter, same reasoning as /api/activity above.
const queueRouter = require('./routes/queue');
app.use('/api/queue', queueRouter);
// requireAuth-protected admin endpoint (Phase 3 automation settings) — no
// rate limiter, same reasoning as /api/activity/queue above.
const automationRouter = require('./routes/automation');
app.use('/api/automation', automationRouter);
const emailTemplatesRouter = require('./routes/emailTemplates');
app.use('/api/email-templates', emailTemplatesRouter);
const exportRouter = require('./routes/export');
app.use('/api/export', exportRouter);
const whatsappRouter = require('./routes/whatsapp');
app.use('/api/whatsapp', whatsappRouter);
const dashboardRouter = require('./routes/dashboard');
app.use('/api/dashboard', dashboardRouter);
app.use('/apps/cartncodform', proxyRouter);
// Public unsubscribe endpoint — no requireAuth, has its own rate limiter.
const unsubscribeRouter = require('./routes/unsubscribe');
app.use('/api/unsubscribe', unsubscribeRouter);
// Platform admin panel — uses its own JWT auth (NOT Shopify session tokens).
// Mounted last so it never intercepts merchant routes. Has its own rate
// limiters and a 503 guard when PLATFORM_JWT_SECRET is not configured.
const platformRouter = require('./routes/platform/index');
app.use('/api/platform', platformRouter);

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

// Signal types that also get a marketing email after a successful push
// (in addition to whatever single channel brain.js already picked for the
// job itself — see the email-send block inside processScheduledJobs()).
const EMAIL_SIGNAL_TYPES = [
  'cart_abandon', 'checkout_abandon', 'high_intent',
  'lapsing', 'winback', 'post_purchase_d3',
  'back_in_stock', 'price_drop', 'email_capture',
  'price_hesitation', 'browse_abandon', 'cod_to_prepaid',
];

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
        'shopDomain lastSignalRunAt timezone suspended'
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

        // Phase 3 — per-shop automation settings (brain run time + master
        // on/off switch), read before computing the gate threshold since
        // the threshold itself now depends on the configured hour/minute.
        // A shop with no AutomationConfig row yet (never visited the
        // Automation screen) falls back to the same defaults the schema
        // itself declares — hour=2, minute=0, enabled=true — so this is a
        // no-op for every shop until a merchant actually saves settings.
        const autoConfig = await AutomationConfig.findOne(
          { shopDomain: s.shopDomain },
          'brainRunHour brainRunMinute enabled'
        ).lean();
        const runHour = autoConfig?.brainRunHour ?? 2;
        const runMinute = autoConfig?.brainRunMinute ?? 0;
        const automationEnabled = autoConfig ? autoConfig.enabled !== false : true;

        const hh = String(runHour).padStart(2, '0');
        const mm = String(runMinute).padStart(2, '0');
        const targetTime = new Date(`${todayStr}T${hh}:${mm}:00`);
        const alreadyRanToday = s.lastSignalRunAt && s.lastSignalRunAt >= targetTime;

        if (nowD >= targetTime && !alreadyRanToday) {
          // Claim first so overlapping ticks can't double-run.
          await Store.findOneAndUpdate(
            { shopDomain: s.shopDomain },
            { lastSignalRunAt: nowD }
          );

          // Platform-level suspension: skip signals+brain for suspended stores.
          // lastSignalRunAt was already claimed above so a suspended shop
          // isn't re-evaluated on every tick for the rest of the day.
          if (s.suspended) {
            console.log(`[signals] store ${s.shopDomain} is suspended — skipping nightly run`);
            continue;
          }

          // Master switch — "When off, no automated notifications will be
          // sent" (Automation screen, Section 1). Still claims
          // lastSignalRunAt above so a disabled shop isn't re-evaluated on
          // every 30s tick for the rest of the day; manual sends from the
          // Journey/Today screens are untouched by this flag entirely.
          if (automationEnabled) {
            runNightlySignals(s.shopDomain)
              .then(() => runBrainForShop(s.shopDomain))
              .then(() => runBirthdaySweepForShop(s.shopDomain, s))
              .then(() => computeWeights(s.shopDomain)) // Phase H — refresh weights for tomorrow
              .catch((err) => console.error('[signals] nightly error:', err.message));
          } else {
            console.log(`[signals] automation disabled for ${s.shopDomain} — skipping nightly run`);
          }

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
      channel: { $ne: 'whatsapp' },
      runAt: { $lte: now },
    }).limit(20);

    for (const job of dueJobs) {
      // Check quiet hours + frequency cap BEFORE claiming — if
      // blocked, leave the job pending and re-check next tick
      // (quiet hours) or skip it permanently (frequency cap).
      const Store = require('./models/Store');
      const store = await Store.findOne({ shopDomain: job.shopDomain })
        .select('timezone quietHours suspended').lean();

      // Platform suspension: mark this job skipped immediately so it never
      // fires as a burst when the store is unsuspended. Unsuspend cleanup
      // (storeSuspension.unsuspendStore) handles past-due pending jobs, but
      // a job queued after suspension must also be caught here on every tick.
      if (store && store.suspended) {
        await ScheduledJob.findOneAndUpdate(
          { _id: job._id, status: 'pending' },
          { status: 'skipped', error: 'store_suspended' }
        );
        console.log(`[automation] Job ${job._id} skipped — store suspended`);
        continue;
      }

      // Same window + wrap-past-midnight logic the Brain schedules against
      // (utils/timezone.js), read from the store's saved quietHours (default
      // 22:00-08:00) on the store's own wall clock.
      if (isQuietNow(store)) {
        console.log(`[automation] Job ${job._id} deferred — quiet hours (${store?.timezone || 'default tz'})`);
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

        // Birthday jobs: generate (or reuse from a retry) the discount code
        // before channel dispatch. Never send a birthday message without a code.
        if (job.signalType === 'birthday') {
          if (!payload.birthdayCode) {
            const bdResult = await generateDiscount(job.shopDomain, { action: 'birthday' }, {});
            if (!bdResult || !bdResult.code) {
              await ScheduledJob.findByIdAndUpdate(job._id, {
                status: 'failed',
                error: (bdResult && bdResult.error) || 'Birthday code creation failed',
              });
              console.log(`[automation] Birthday job ${job._id} failed: code creation failed`);
              continue;
            }
            payload.birthdayCode = bdResult.code;
            payload.birthdayPercentage = bdResult.percentage;
            await ScheduledJob.findByIdAndUpdate(job._id, {
              $set: {
                'payload.birthdayCode': bdResult.code,
                'payload.birthdayPercentage': bdResult.percentage,
              },
            });
          }
        }

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
            // Birthday: append code to body
            if (job.signalType === 'birthday' && payload.birthdayCode) {
              const codeAppend = ' Use code: ' + payload.birthdayCode;
              payload.body = (payload.body + codeAppend).slice(0, 200);
            }
            await ScheduledJob.findByIdAndUpdate(job._id, {
              $set: { 'payload.title': payload.title, 'payload.body': payload.body },
            });
          }

          // Phase 1 attribution — tag the click URL with ccf_src/ccf_job so
          // the storefront (getAttributionJob() in push-notifications.liquid)
          // can attribute subsequent revisit/cart/checkout/purchase events
          // back to this notification. Keep the existing absolute-URL
          // fallback (job.payload.url is often unset for legacy rule-based
          // jobs) rather than a bare '/' — FCM's webpush fcm_options.link
          // needs a fully-qualified URL, and sendPushToCustomers() itself
          // already falls back to `https://${shopDomain}` for the same
          // reason (see backend/utils/pushNotification.js).
          const baseUrl = payload.url || `https://${job.shopDomain}`;
          const clickUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') +
            'ccf_src=push&ccf_job=' + job._id.toString();
          const result = await sendPushToCustomers(
            job.shopDomain,
            payload.title || 'You left something behind!',
            payload.body || 'Come back and check it out.',
            clickUrl,
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
            // Pass a plain object, not the live ScheduledJob Mongoose
            // document — recordProfileMessage() only reads these 4 fields
            // (profileId/channel/signalType/_id); reconstructing them here
            // guarantees no Mongoose document/Proxy reference reaches the
            // $push below.
            await recordProfileMessage({
              profileId: job.profileId,
              channel: job.channel,
              signalType: job.signalType,
              _id: job._id,
            }).catch((e) =>
              console.error('[brain] message log error:', e.message)
            );

            // Birthday: mark offer sent for this year so the sweep skips next time.
            if (job.signalType === 'birthday' && job.profileId) {
              Profile.findByIdAndUpdate(job.profileId, {
                'birthday.lastOfferYear': new Date().getFullYear(),
              }).catch((e) => console.error('[birthday] lastOfferYear update error:', e.message));
            }

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

          // Bonus email — runs regardless of whether the push above
          // succeeded or failed (a stale/expired FCM token should not also
          // block the email). Brain-scheduled jobs only; profileId is
          // required to look up the profile at all. Gated on the signal
          // type warranting an email and a 24h dedup guard against
          // emailing the same profile twice in one day. Reuses
          // jobStore/voice already loaded above rather than re-fetching
          // Store.
          if (job.profileId && EMAIL_SIGNAL_TYPES.includes(job.signalType)) {
            try {
              const profile = await Profile.findById(job.profileId)
                .select('identifiers channels messages');

              const emailAddr = profile?.channels?.email?.address ||
                profile?.identifiers?.emails?.[0];

              if (emailAddr) {
                const recentEmail = profile?.messages?.find((m) =>
                  m.channel === 'email' &&
                  m.sentAt && m.sentAt > new Date(Date.now() - 24 * 60 * 60 * 1000)
                );

                if (!recentEmail) {
                  const { subject, body } = await generateEmailCopy(
                    job.shopDomain,
                    { type: job.signalType, strength: job.strength || 0.5 },
                    voice,
                    {}
                  );

                  await sendMarketingEmail(
                    emailAddr,
                    subject,
                    body.replace(/\n/g, '<br>'),
                    job.shopDomain,
                    job.profileId
                  );

                  // Field names match the Profile.messages subdocument
                  // schema (`type`/`outcome`) — Mongoose strict mode
                  // silently drops any unrecognized key, so pushing
                  // signalType/status/payload here (as a naive first
                  // draft did) would erase job.signalType from this log
                  // entry and defeat brain.js's per-signal 6h cooldown
                  // check, which reads m.type. $slice caps it at 20,
                  // matching recordProfileMessage() above.
                  await Profile.updateOne(
                    { _id: job.profileId },
                    {
                      $push: {
                        messages: {
                          $each: [{
                            channel: 'email',
                            type: job.signalType,
                            sentAt: new Date(),
                            outcome: 'sent',
                            jobId: job._id,
                          }],
                          $slice: -20,
                        },
                      },
                    }
                  );

                  // Create a ScheduledJob row for this bonus email so the
                  // dashboard drawer can show it (Profile.messages alone is
                  // not queried by /channels/:channel/items).
                  await ScheduledJob.create({
                    shopDomain: job.shopDomain,
                    profileId: job.profileId,
                    signalType: job.signalType,
                    channel: 'email',
                    status: 'sent',
                    sentAt: new Date(),
                    runAt: new Date(),
                    payload: { subject, body: body.replace(/\n/g, '<br>') },
                    origin: 'automated',
                  }).catch((e) => console.error('[poller] bonus email job log error:', e.message));

                  console.log('[poller] email sent for job', job._id, 'signal:', job.signalType);
                }
              }
            } catch (emailErr) {
              // Email errors never block push delivery.
              console.error('[poller] email send error:', emailErr.message);
            }
          }
        } else if (channel === 'email' && job.signalType === 'birthday') {
          // Birthday email — profile email, not an AbandonedCustomer record.
          const bdProfile = await Profile.findById(job.profileId)
            .select('channels identifiers').lean();
          const bdEmail = bdProfile && (
            (bdProfile.channels && bdProfile.channels.email && bdProfile.channels.email.address) ||
            (bdProfile.identifiers && bdProfile.identifiers.emails && bdProfile.identifiers.emails[0])
          );
          if (!bdEmail) {
            await ScheduledJob.findByIdAndUpdate(job._id, {
              status: 'skipped',
              error: 'No email address on profile',
            });
            console.log(`[automation] Birthday job ${job._id} skipped — no email`);
          } else {
            const bdCopy = await generateCopy(
              { ...(jobStore && jobStore.toObject ? jobStore.toObject() : {}), voice },
              'birthday',
              null,
              'email'
            ).catch(() => ({
              subject: 'Happy Birthday! A gift from us 🎂',
              body: 'Wishing you a wonderful birthday! We have a personal discount code just for you.',
            }));
            let bdBody = bdCopy.body || '';
            if (payload.birthdayCode) {
              bdBody = bdBody + '\n\nYour personal birthday code: ' + payload.birthdayCode;
              if (payload.birthdayPercentage) {
                bdBody = bdBody + ' (' + payload.birthdayPercentage + '% off)';
              }
            }
            await ScheduledJob.findByIdAndUpdate(job._id, {
              $set: {
                'payload.subject': bdCopy.subject || '',
                'payload.body': bdBody,
              },
            });
            const bdSendResult = await sendMarketingEmail(
              bdEmail,
              bdCopy.subject || '',
              bdBody.replace(/\n/g, '<br>'),
              job.shopDomain,
              job.profileId
            );
            if (!bdSendResult || !bdSendResult.success) {
              await ScheduledJob.findByIdAndUpdate(job._id, {
                status: 'failed',
                error: (bdSendResult && bdSendResult.error) || 'Birthday email send failed',
              });
              console.log(`[automation] Birthday job ${job._id} email failed`);
            } else {
              console.log(`[automation] Birthday job ${job._id} email sent successfully`);
              await recordProfileMessage({
                profileId: job.profileId,
                channel: 'email',
                signalType: 'birthday',
                _id: job._id,
              }).catch((e) => console.error('[brain] message log error:', e.message));
              Profile.findByIdAndUpdate(job.profileId, {
                'birthday.lastOfferYear': new Date().getFullYear(),
              }).catch((e) => console.error('[birthday] lastOfferYear update error:', e.message));
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
              await ScheduledJob.findByIdAndUpdate(job._id, {
                $set: {
                  'payload.subject': copy.subject || payload.subject || '',
                  'payload.body':    copy.body    || payload.body    || '',
                },
              });
            }

            const cartUrl = `https://${job.shopDomain}/cart?ccf_src=email&ccf_job=${job._id}`;
            const sendResult = await sendAbandonedCartEmail(customer, {
              subject: copy.subject || payload.subject || undefined,
              body: copy.body || payload.body || undefined,
              cartUrl,
              profileId: job.profileId || null,
            });
            if (!sendResult.success) {
              await ScheduledJob.findByIdAndUpdate(job._id, {
                status: 'failed',
                error: sendResult.error || 'Email send failed',
              });
              console.log(`[automation] Job ${job._id} email failed: ${sendResult.error}`);
            } else {
              console.log(`[automation] Job ${job._id} email sent successfully`);
              // Same fix as the push-branch call site above — plain object,
              // not the live Mongoose document.
              await recordProfileMessage({
                profileId: job.profileId,
                channel: job.channel,
                signalType: job.signalType,
                _id: job._id,
              }).catch((e) =>
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

// After how many consecutive failed send attempts a FestivalQueue item
// gives up and moves to 'cancelled' instead of retrying forever (e.g. a
// shop whose Firebase config broke, or every subscriber token going
// stale at once — something that genuinely won't resolve itself on the
// next 30s tick).
const FESTIVAL_MAX_FAILED_ATTEMPTS = 5;

/**
 * Sends every FestivalQueue item whose scheduledAt has arrived. Mirrors
 * POST /api/push/send-store's own split-send logic (mobile subscribers
 * get mobileImageUrl, desktop subscribers get desktopImageUrl, via two
 * separate sendPushToCustomers calls) — including the base64 -> Cloudinary
 * upload step /send-store does first: a FestivalQueue item's image can
 * still be a raw data: URI from ImageUploadPair's FileReader-based
 * upload (the Dashboard/Queue editors never run it through Cloudinary at
 * save time, only /send-store did, for a live Send Now), and FCM rejects
 * a data: URI outright — skipping this step here would silently send
 * every queued item with no image whenever a merchant uploaded a custom
 * one instead of using the festival's own pre-filled photo.
 *
 * Deliberately does NOT require `sent > 0` to mark an item 'sent' — only
 * that at least one of the two sendPushToCustomers calls itself
 * succeeded. sendPushToCustomers returns `{ success: true, sent: 0 }`
 * for a shop with zero matching subscribers (see utils/
 * pushNotification.js — that's not an error, just nobody to notify), so
 * treating "sent > 0" as the success bar would mean any shop with few or
 * no push subscribers yet gets every approved festival item cycled
 * through as a "failure" and permanently 'cancelled' after
 * FESTIVAL_MAX_FAILED_ATTEMPTS ticks (2.5 minutes) — which is wrong: the
 * send itself didn't fail, there was simply nobody to send it to.
 */
async function processFestivalQueue() {
  try {
    const now = new Date();
    // Claim expiry: a sendClaimedAt older than 15 min is considered stale
    // (the poller that claimed it likely crashed), and may be reclaimed.
    const claimExpiry = new Date(now.getTime() - 15 * 60 * 1000);
    // Same .limit(20)-per-tick safeguard processScheduledJobs already
    // uses above, for the same reason (bound how much one tick can do).
    // WhatsApp items are never auto-sent — the seller sends manually; they
    // are excluded from this query so the poller never touches them.
    const dueItems = await FestivalQueue.find({
      status: 'approved',
      scheduledAt: { $lte: now },
      channel: { $in: ['push', 'email', null] },
      $or: [{ sendClaimedAt: null }, { sendClaimedAt: { $lt: claimExpiry } }],
    }).limit(20);

    // Build a Set of suspended shop domains once per tick — one DB query
    // for all items instead of one per item (avoids N+1 reads).
    const shopDomainsInBatch = [...new Set(dueItems.map((i) => i.shopDomain))];
    const suspendedStores = shopDomainsInBatch.length
      ? await Store.find(
          { shopDomain: { $in: shopDomainsInBatch }, suspended: true },
          'shopDomain'
        ).lean()
      : [];
    const suspendedSet = new Set(suspendedStores.map((s) => s.shopDomain));

    for (const item of dueItems) {
      // Skip items for suspended stores without claiming or modifying them.
      // Items stay 'approved' so they can be sent once the store is unsuspended
      // (or moved to 'draft' by unsuspendStore's cleanup if past-due at that time).
      if (suspendedSet.has(item.shopDomain)) {
        console.log(`[festival-queue] item ${item._id} skipped — store ${item.shopDomain} is suspended`);
        continue;
      }

      // Atomic claim: only one poller tick wins; the other silently skips.
      const claimed = await FestivalQueue.findOneAndUpdate(
        { _id: item._id, status: 'approved',
          $or: [{ sendClaimedAt: null }, { sendClaimedAt: { $lt: claimExpiry } }] },
        { $set: { sendClaimedAt: now } }
      );
      if (!claimed) continue;

      try {
        const ch = item.channel || 'push';

        // WhatsApp items are manual tasks — never auto-sent by the poller.
        // The query already excludes them, but guard here defensively.
        if (ch === 'whatsapp') continue;

        // ── EMAIL ──────────────────────────────────────────────────────────
        if (ch === 'email') {
          if (!item.templateId) {
            console.error(`[festival-queue] email item ${item._id} has no templateId — cancelling`);
            await FestivalQueue.findByIdAndUpdate(item._id, { status: 'cancelled' });
            continue;
          }
          const { sendEmailBroadcast } = require('./utils/emailBroadcast');
          const VALID_EMAIL_SEGMENTS = ['everyone', 'email_captured', 'has_cart', 'bought_once', 'going_quiet'];
          const emailSegment = item.segment || 'everyone';
          if (!VALID_EMAIL_SEGMENTS.includes(emailSegment)) {
            console.error(`[festival-queue] email item ${item._id} has invalid segment "${emailSegment}" — cancelling`);
            await FestivalQueue.findByIdAndUpdate(item._id, { status: 'cancelled', $unset: { sendClaimedAt: 1 } });
            continue;
          }
          const result = await sendEmailBroadcast({
            shopDomain: item.shopDomain,
            templateId: item.templateId,
            subject: item.subject || undefined,
            logOrigin: 'scheduled',
            festivalQueueId: item._id,
            segment: emailSegment,
          });

          console.log(
            `[festival-queue] email item ${item._id} "${item.title}" — ` +
            `sent=${result.sent} failed=${result.failed}${result.error ? ` error=${result.error}` : ''}`
          );

          if (!result.error) {
            await FestivalQueue.findByIdAndUpdate(item._id, {
              status: 'sent',
              sentAt: new Date(),
              recipientCount: result.sent,
            });
          } else {
            const failedAttempts = (item.failedAttempts || 0) + 1;
            console.error(
              `[festival-queue] email item ${item._id} FAILED (attempt ${failedAttempts}/${FESTIVAL_MAX_FAILED_ATTEMPTS}): ${result.error}`
            );
            if (failedAttempts > FESTIVAL_MAX_FAILED_ATTEMPTS) {
              await FestivalQueue.findByIdAndUpdate(item._id, { status: 'cancelled', failedAttempts });
              console.error(`[festival-queue] email item ${item._id} CANCELLED`);
            } else {
              // Clear claim so the next tick can pick it up.
              await FestivalQueue.findByIdAndUpdate(item._id,
                { $set: { failedAttempts }, $unset: { sendClaimedAt: 1 } });
            }
          }
          continue;
        }

        // ── PUSH (or missing channel) ───────────────────────────────────────
        const clickUrl = buildClickUrl(item.shopDomain, item.targetType, item.productHandle);

        const rawMobile = item.mobileImageUrl || '';
        const rawDesktop = item.desktopImageUrl || '';
        const mobileImage = rawMobile.startsWith('data:')
          ? (await pushRouter.uploadToCloudinary(rawMobile)) || ''
          : rawMobile;
        const desktopImage = rawDesktop.startsWith('data:')
          ? (await pushRouter.uploadToCloudinary(rawDesktop)) || ''
          : rawDesktop;

        const mobileResult = await sendPushToCustomers(
          item.shopDomain, item.title, item.body, clickUrl, mobileImage, true, null, false, false
        );
        const desktopResult = await sendPushToCustomers(
          item.shopDomain, item.title, item.body, clickUrl, desktopImage, false, null, false, true
        );

        // Per-recipient send log (queue-notification-detail-audit.txt
        // finding #2) — one ScheduledJob row per token, not per query
        // pass merged, and never allowed to affect the send outcome
        // above (logBroadcastSend swallows its own errors).
        await logBroadcastSend({
          shopDomain: item.shopDomain,
          festivalQueueId: item._id,
          signalType: 'festival',
          title: item.title,
          body: item.body,
          imageUrl: mobileImage,
          recipients: mobileResult.recipients,
          origin: 'scheduled',
        });
        await logBroadcastSend({
          shopDomain: item.shopDomain,
          festivalQueueId: item._id,
          signalType: 'festival',
          title: item.title,
          body: item.body,
          imageUrl: desktopImage,
          recipients: desktopResult.recipients,
          origin: 'scheduled',
        });

        const totalSent = (mobileResult.sent || 0) + (desktopResult.sent || 0);
        console.log(
          `[festival-queue] push item ${item._id} "${item.festival || item.title}" — ` +
          `clickUrl=${clickUrl} mobileSent=${mobileResult.sent || 0} desktopSent=${desktopResult.sent || 0}`
        );

        if (mobileResult.success || desktopResult.success) {
          await FestivalQueue.findByIdAndUpdate(item._id, {
            status: 'sent',
            sentAt: new Date(),
            recipientCount: totalSent,
          });
          console.log(`[festival-queue] push item ${item._id} marked sent (recipientCount=${totalSent})`);
        } else {
          // Total failure — both legs failed outright.
          const failedAttempts = (item.failedAttempts || 0) + 1;
          const errMsg = mobileResult.error || desktopResult.error || 'Unknown error';
          console.error(
            `[festival-queue] push item ${item._id} "${item.festival || item.title}" ` +
            `FAILED (attempt ${failedAttempts}/${FESTIVAL_MAX_FAILED_ATTEMPTS}): ${errMsg}`
          );
          if (failedAttempts > FESTIVAL_MAX_FAILED_ATTEMPTS) {
            await FestivalQueue.findByIdAndUpdate(item._id, {
              status: 'cancelled',
              failedAttempts,
            });
            console.error(
              `[festival-queue] push item ${item._id} CANCELLED after ${failedAttempts} ` +
              `consecutive failed attempts — last error: ${errMsg}`
            );
          } else {
            // Leave status 'approved' so it retries next tick; clear claim.
            await FestivalQueue.findByIdAndUpdate(item._id,
              { $set: { failedAttempts }, $unset: { sendClaimedAt: 1 } });
          }
        }
      } catch (itemErr) {
        console.error(`[festival-queue] item ${item._id} error:`, itemErr.message);
        // Release the claim so the next tick can retry.
        await FestivalQueue.findByIdAndUpdate(item._id, { $unset: { sendClaimedAt: 1 } })
          .catch(() => {});
      }
    }
  } catch (err) {
    console.error('[festival-queue] processFestivalQueue error:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Birthday sweep — run once per shop per nightly loop.
// Finds profiles whose (birthday.month, birthday.day) matches today + leadDays,
// skips those already sent this year, schedules one ScheduledJob(birthday) each.
// ---------------------------------------------------------------------------
const {
  resolveTz: _bday_resolveTz,
  zonedParts: _bday_zonedParts,
  zonedTimeToUtc: _bday_zonedTimeToUtc,
  resolveQuietWindow: _bday_resolveQuietWindow,
  isQuietHour: _bday_isQuietHour,
} = require('./utils/timezone');
const DiscountConfig = require('./models/DiscountConfig');
const { generateDiscount } = require('./routes/discounts');

function _bdayRunAt(tz, quietStart, quietEnd) {
  const resolved = _bday_resolveTz(tz);
  const now = new Date();
  const cur = _bday_zonedParts(now, resolved);
  const TARGET = 9; // 9 am store-local
  let h = TARGET;
  if (_bday_isQuietHour(h, quietStart, quietEnd)) {
    for (let i = 1; i <= 24; i++) {
      const next = (TARGET + i) % 24;
      if (!_bday_isQuietHour(next, quietStart, quietEnd)) { h = next; break; }
    }
  }
  let runAt = _bday_zonedTimeToUtc(cur.y, cur.mo, cur.d, h, 0, resolved);
  if (runAt.getTime() <= now.getTime()) {
    const tomorrow = new Date(Date.UTC(cur.y, cur.mo - 1, cur.d + 1));
    runAt = _bday_zonedTimeToUtc(
      tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), h, 0, resolved
    );
  }
  return runAt;
}

async function runBirthdaySweepForShop(shopDomain, storeDoc) {
  try {
    const shop = String(shopDomain || '').trim().toLowerCase();
    const config = await DiscountConfig.findOne({ shopDomain: shop }).lean();
    if (!config || !config.birthdayDiscount || !config.birthdayDiscount.enabled) return;

    const leadDays = (config.birthdayDiscount.leadDays != null) ? config.birthdayDiscount.leadDays : 3;
    const tz = (storeDoc && storeDoc.timezone) || 'Asia/Kolkata';
    const resolved = _bday_resolveTz(tz);
    const nowD = new Date();
    const cur = _bday_zonedParts(nowD, resolved);
    const currentYear = cur.y;

    // today + leadDays using UTC date arithmetic — handles month/year rollover
    const targetDate = new Date(Date.UTC(cur.y, cur.mo - 1, cur.d + leadDays));
    const targetMonth = targetDate.getUTCMonth() + 1;
    const targetDay = targetDate.getUTCDate();

    // Feb 29 in a non-leap year: profiles with birthday Feb 29 match on Feb 28
    const isLeap = (currentYear % 4 === 0 && currentYear % 100 !== 0) || (currentYear % 400 === 0);
    const monthDayFilter = [{ 'birthday.month': targetMonth, 'birthday.day': targetDay }];
    if (targetMonth === 2 && targetDay === 28 && !isLeap) {
      monthDayFilter.push({ 'birthday.month': 2, 'birthday.day': 29 });
    }

    const profiles = await Profile.find({
      shopDomain: shop,
      suppressed: { $ne: true },
      'birthday.lastOfferYear': { $ne: currentYear },
      $and: [
        { $or: monthDayFilter },
        { $or: [
          { 'channels.push.subscribed': true },
          { 'channels.email.address': { $exists: true, $ne: '' } },
        ]},
      ],
    }).select('_id channels').lean();

    if (!profiles.length) return;

    const { start: quietStart, end: quietEnd } = _bday_resolveQuietWindow(storeDoc && storeDoc.quietHours);
    const runAt = _bdayRunAt(tz, quietStart, quietEnd);

    let scheduled = 0;
    for (const p of profiles) {
      // Channel: prefer email (birthday is personal), fall back to push
      const hasEmail = !!(p.channels && p.channels.email && p.channels.email.address);
      const hasPush = !!(p.channels && p.channels.push && p.channels.push.subscribed);
      const channel = hasEmail ? 'email' : (hasPush ? 'push' : null);
      if (!channel) continue;

      try {
        await ScheduledJob.create({
          shopDomain: shop,
          profileId: p._id,
          signalType: 'birthday',
          channel,
          reason: 'birthday sweep',
          payload: { title: '', body: '' },
          status: 'pending',
          runAt,
          origin: 'automated',
        });
        scheduled += 1;
      } catch (err) {
        if (err && err.code === 11000) continue; // already pending — idempotent
        console.error('[birthday-sweep] create job error:', err.message);
      }
    }
    if (scheduled > 0) {
      console.log(`[birthday-sweep] ${shop}: scheduled ${scheduled} birthday job(s) for month=${targetMonth} day=${targetDay}`);
    }
  } catch (err) {
    console.error('[birthday-sweep] error for', shopDomain, ':', err.message);
  }
}

// Poll every 30 seconds. The nightly signals + brain run is gated inside this
// same tick (see processScheduledJobs), so there is no separate scheduler.
// processFestivalQueue() runs after processScheduledJobs() on the same
// tick, wrapped in its own try/catch here (on top of its own internal
// one) so a failure in either poller can never block or crash the other.
async function runPollerTick() {
  try {
    await processScheduledJobs();
  } catch (err) {
    console.error('[automation] processScheduledJobs error (poller tick):', err.message);
  }
  try {
    await processFestivalQueue();
  } catch (err) {
    console.error('[festival-queue] processFestivalQueue error (poller tick):', err.message);
  }
}
setInterval(runPollerTick, 30 * 1000);
console.log('[automation] Scheduled job poller started (30s interval; nightly signals gated inside; festival queue sender runs after each tick)');

// --- Boot ---------------------------------------------------------------
async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`[server] ShopiReachBoost AI API listening on port ${PORT}`);
    console.log(`[server] CORS allowed origins: ${allowedOrigins.join(', ')}`);
  });
}

if (require.main === module) { start(); }

module.exports = app;
module.exports._processScheduledJobs = processScheduledJobs;
module.exports._processFestivalQueue = processFestivalQueue;
