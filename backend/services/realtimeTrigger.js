const AutomationConfig = require('../models/AutomationConfig');
const ScheduledJob = require('../models/ScheduledJob');
const Profile = require('../models/Profile');
const { generateCopy } = require('./aiService');

const SIGNAL_DELAY_FIELD = {
  cart_abandon: 'cartAbandonDelay',
  checkout_abandon: 'checkoutAbandonDelay',
  browse_abandon: 'browseAbandonDelay',
};

/**
 * Called after a signal is computed for a profile.
 * If AutomationConfig has realtimeTriggers enabled for this signal,
 * immediately schedules a job with the configured delay.
 * Otherwise does nothing (nightly brain handles it).
 *
 * NOTE: this does not itself re-verify the named signal against the
 * Signal collection — the caller (events.js) decides when to call this,
 * gated on the raw storefront event type that just came in (e.g.
 * add_to_cart -> cart_abandon). A job created here still goes through
 * the SAME order-completion cancellation every other ScheduledJob does
 * (backend/routes/webhooks.js's order webhook cancels any pending job
 * matching this shop's cartToken/customerId), so a customer who
 * converts before `runAt` still has this job cancelled like any other —
 * see audits/phase4-realtime-trigger-audit.txt for the full reasoning.
 */
async function maybeScheduleRealtime(shopDomain, profileId, signalType) {
  try {
    const [config, profile] = await Promise.all([
      AutomationConfig.findOne({ shopDomain }).lean(),
      Profile.findById(profileId)
        .select('channels identifiers')
        .lean(),
    ]);

    // Default config if none exists
    const cfg = config || {
      enabled: true,
      realtimeTriggers: { cart_abandon: false, checkout_abandon: false },
      cartAbandonDelay: 60,
      checkoutAbandonDelay: 60,
      browseAbandonDelay: 30,
      enabledSignals: {},
    };

    // Check master switch
    if (!cfg.enabled) return;

    // Check if this signal has realtime trigger enabled
    const isRealtime = cfg.realtimeTriggers?.[signalType] === true;
    if (!isRealtime) return;

    // Check if signal is enabled
    const signalEnabled = cfg.enabledSignals?.[signalType] !== false;
    if (!signalEnabled) return;

    // Check if profile has push or email
    const hasPush = profile?.channels?.push?.subscribed === true;
    const hasEmail = !!profile?.channels?.email?.address;
    if (!hasPush && !hasEmail) return;

    // Get delay for this signal
    const delayField = SIGNAL_DELAY_FIELD[signalType];
    const delayMinutes = delayField ? (cfg[delayField] ?? 60) : 60;
    const runAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    // Check if a pending job already exists for this profile+signal
    const existing = await ScheduledJob.findOne({
      shopDomain,
      profileId,
      signalType,
      status: 'pending',
    });
    if (existing) return; // already scheduled

    // Generate copy
    const store = { shopDomain, voice: {} };
    const channel = hasPush ? 'push' : 'email';
    const { title, body } = await generateCopy(
      store, signalType, '', channel
    );

    const cartToken = profile?.identifiers?.cartTokens?.slice(-1)[0]
      || null;

    await ScheduledJob.create({
      shopDomain,
      profileId,
      signalType,
      channel,
      cartToken,
      runAt,
      payload: { title, body, imageUrl: '' },
      reason: `Realtime trigger: ${signalType} (delay: ${delayMinutes}m)`,
    });

    console.log(
      `[realtime] scheduled ${signalType} for profile ${profileId}`,
      `runAt: ${runAt.toISOString()}`
    );
  } catch (err) {
    console.error('[realtime] maybeScheduleRealtime error:', err.message);
  }
}

module.exports = { maybeScheduleRealtime };
