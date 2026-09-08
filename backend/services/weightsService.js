const ScheduledJob = require('../models/ScheduledJob');
const ShopWeights = require('../models/ShopWeights');

/**
 * Phase H — recompute a shop's learned weights from the last 90 days of
 * ScheduledJob outcomes. Runs once per day per shop (nightly gate in
 * server.js), after signals + brain, so the NEXT day's brain run uses fresh
 * numbers.
 *
 * Rates are (clicks + conversions) / sends. Below the minimum sample size a
 * bucket keeps the neutral rate 1.0, so a shop with no engagement history
 * ranks exactly as it did pre-Phase-H. No PII is read or logged.
 */

const DAY = 24 * 60 * 60 * 1000;
const MIN_SIGNAL_SENDS = 10;
const MIN_CHANNEL_SENDS = 10;
const MIN_HOUR_SENDS = 5;

async function computeWeights(shopDomain) {
  const shop = String(shopDomain || '').trim().toLowerCase();
  const since = new Date(Date.now() - 90 * DAY);

  const jobs = await ScheduledJob.find(
    {
      shopDomain: shop,
      status: { $in: ['sent', 'failed', 'skipped'] },
      createdAt: { $gte: since },
    },
    'signalType channel outcome sentAt runAt'
  ).lean();

  // --- signalRates: per signal type ---
  const bySignal = {};
  for (const j of jobs) {
    const t = j.signalType || 'unknown';
    const b = (bySignal[t] = bySignal[t] || { sends: 0, clicks: 0, conversions: 0 });
    b.sends += 1;
    if (j.outcome === 'clicked') b.clicks += 1;
    else if (j.outcome === 'converted') b.conversions += 1;
  }
  const signalRates = {};
  for (const [t, b] of Object.entries(bySignal)) {
    const rate =
      b.sends >= MIN_SIGNAL_SENDS ? (b.clicks + b.conversions) / b.sends : 1.0;
    signalRates[t] = { ...b, rate };
  }

  // --- channelRates: push / email, independently ---
  const chanAgg = {
    push: { sends: 0, clicks: 0, conversions: 0 },
    email: { sends: 0, clicks: 0, conversions: 0 },
  };
  for (const j of jobs) {
    const c = j.channel === 'email' ? 'email' : 'push';
    chanAgg[c].sends += 1;
    if (j.outcome === 'clicked') chanAgg[c].clicks += 1;
    else if (j.outcome === 'converted') chanAgg[c].conversions += 1;
  }
  const channelRates = {};
  for (const c of ['push', 'email']) {
    const b = chanAgg[c];
    const rate =
      b.sends >= MIN_CHANNEL_SENDS ? (b.clicks + b.conversions) / b.sends : 1.0;
    channelRates[c] = { ...b, rate };
  }

  // --- hourRates: by UTC hour of send (falls back to runAt when unsent) ---
  const byHour = {};
  for (const j of jobs) {
    const when = j.sentAt || j.runAt;
    if (!when) continue;
    const h = new Date(when).getUTCHours();
    const b = (byHour[h] = byHour[h] || { sends: 0, conversions: 0 });
    b.sends += 1;
    if (j.outcome === 'clicked' || j.outcome === 'converted') b.conversions += 1;
  }
  const hourRates = {};
  for (const [h, b] of Object.entries(byHour)) {
    const rate = b.sends >= MIN_HOUR_SENDS ? b.conversions / b.sends : 1.0;
    hourRates[h] = { ...b, rate };
  }

  const doc = await ShopWeights.findOneAndUpdate(
    { shopDomain: shop },
    {
      $set: {
        signalRates,
        channelRates,
        hourRates,
        lastComputedAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true, new: true }
  );

  console.log(
    `[weights] computed for ${shop}: ${Object.keys(signalRates).length} signal types, ` +
      `push rate=${channelRates.push.rate.toFixed(2)}, email rate=${channelRates.email.rate.toFixed(2)}`
  );

  return doc;
}

module.exports = { computeWeights };
