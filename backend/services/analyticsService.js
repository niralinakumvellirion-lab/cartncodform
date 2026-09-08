const Profile = require('../models/Profile');
const ScheduledJob = require('../models/ScheduledJob');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const Store = require('../models/Store');

/**
 * Phase E — deterministic weekly stats + insights. The numbers here are the
 * INPUT to aiService.generateWeeklyNarrative / generateInsights; the AI only
 * narrates, it never computes.
 */

const DAY = 24 * 60 * 60 * 1000;

function hourInTz(date, tz) {
  try {
    const h = parseInt(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hour12: false,
        timeZone: tz || 'Asia/Kolkata',
      }).format(date),
      10
    );
    return h % 24;
  } catch {
    return new Date(date).getHours();
  }
}

function fmtHour(h) {
  const n = Number(h);
  if (n === 0) return '12am';
  if (n === 12) return '12pm';
  return n < 12 ? `${n}am` : `${n - 12}pm`;
}

// ---------------------------------------------------------------------------
// computeWeeklyStats
// ---------------------------------------------------------------------------
async function computeWeeklyStats(shopDomain) {
  const shop = String(shopDomain || '').trim().toLowerCase();
  const since = new Date(Date.now() - 7 * DAY);

  const [profilesLookedAt, messagesSent, recoveredCarts, sentJobs] = await Promise.all([
    Profile.countDocuments({ shopDomain: shop, updatedAt: { $gte: since } }),
    ScheduledJob.countDocuments({ shopDomain: shop, status: 'sent', sentAt: { $gte: since } }),
    AbandonedCustomer.find(
      { shopDomain: shop, status: 'recovered', recoveredAt: { $gte: since } },
      'cartItems recoveredRevenue sessionId'
    ),
    ScheduledJob.find(
      { shopDomain: shop, status: 'sent', sentAt: { $gte: since } },
      'channel cartToken'
    ),
  ]);

  const carts = recoveredCarts || [];
  const conversions = carts.length;
  const revenueRecovered = carts.reduce(
    (sum, c) => sum + (Number(c.recoveredRevenue) || 0),
    0
  );

  // topProduct — the most-recovered cart's first item title
  const titleCount = {};
  for (const c of carts) {
    const t = c.cartItems && c.cartItems[0] && c.cartItems[0].title;
    if (t) titleCount[t] = (titleCount[t] || 0) + 1;
  }
  const topProduct =
    Object.keys(titleCount).sort((a, b) => titleCount[b] - titleCount[a])[0] || null;

  // bestChannel — which channel's sent jobs map to a recovered cart more often
  const recoveredTokens = new Set(carts.map((c) => c.sessionId).filter(Boolean));
  let pushConv = 0;
  let emailConv = 0;
  for (const j of sentJobs || []) {
    if (!j.cartToken || !recoveredTokens.has(j.cartToken)) continue;
    if (j.channel === 'email') emailConv += 1;
    else pushConv += 1;
  }
  let bestChannel = null;
  if (pushConv > 0 || emailConv > 0) bestChannel = emailConv > pushConv ? 'email' : 'push';

  return {
    profilesLookedAt,
    messagesSent,
    conversions,
    revenueRecovered,
    topProduct,
    bestChannel,
  };
}

// ---------------------------------------------------------------------------
// computeInsights
// ---------------------------------------------------------------------------
async function computeInsights(shopDomain) {
  const shop = String(shopDomain || '').trim().toLowerCase();
  const since = new Date(Date.now() - 30 * DAY);

  const [recovered, sentJobs, store] = await Promise.all([
    AbandonedCustomer.find(
      { shopDomain: shop, status: 'recovered', recoveredAt: { $gte: since } },
      'cartItems recoveredAt sessionId'
    ),
    ScheduledJob.find(
      { shopDomain: shop, status: 'sent', sentAt: { $gte: since } },
      'channel cartToken'
    ),
    Store.findOne({ shopDomain: shop }, 'timezone'),
  ]);

  const recs = recovered || [];
  const tz = (store && store.timezone) || 'Asia/Kolkata';

  // 1. TOP_PRODUCT
  const titleCount = {};
  for (const c of recs) {
    const t = c.cartItems && c.cartItems[0] && c.cartItems[0].title;
    if (t) titleCount[t] = (titleCount[t] || 0) + 1;
  }
  const topTitle = Object.keys(titleCount).sort((a, b) => titleCount[b] - titleCount[a])[0] || null;
  const topN = topTitle ? titleCount[topTitle] : 0;

  // 2. BEST_CHANNEL — recovery rate by channel
  const recTokens = new Set(recs.map((c) => c.sessionId).filter(Boolean));
  const tally = { push: { sent: 0, rec: 0 }, email: { sent: 0, rec: 0 } };
  for (const j of sentJobs || []) {
    const ch = j.channel === 'email' ? 'email' : 'push';
    tally[ch].sent += 1;
    if (j.cartToken && recTokens.has(j.cartToken)) tally[ch].rec += 1;
  }
  const pushRate = tally.push.sent ? tally.push.rec / tally.push.sent : 0;
  const emailRate = tally.email.sent ? tally.email.rec / tally.email.sent : 0;
  const bestChannel = emailRate > pushRate ? 'email' : 'push';

  // 3. BEST_HOUR — hour of day (store tz) with the most recoveries
  const hourCount = {};
  for (const c of recs) {
    if (!c.recoveredAt) continue;
    const h = hourInTz(c.recoveredAt, tz);
    hourCount[h] = (hourCount[h] || 0) + 1;
  }
  const bestHourKey = Object.keys(hourCount).sort((a, b) => hourCount[b] - hourCount[a])[0];
  const bestHour = bestHourKey != null ? Number(bestHourKey) : null;

  return [
    {
      type: 'TOP_PRODUCT',
      value: topTitle,
      evidence: topTitle
        ? `${topN} recoveries in last 30 days`
        : 'No recoveries in the last 30 days yet',
    },
    {
      type: 'BEST_CHANNEL',
      value: bestChannel,
      evidence: `Push: ${Math.round(pushRate * 100)}% recovery, Email: ${Math.round(
        emailRate * 100
      )}%`,
    },
    {
      type: 'BEST_HOUR',
      value: bestHour,
      evidence:
        bestHour != null
          ? `Most recoveries happen at ${fmtHour(bestHour)} store time`
          : 'Not enough recovery data to spot a best hour',
    },
  ];
}

module.exports = { computeWeeklyStats, computeInsights };
