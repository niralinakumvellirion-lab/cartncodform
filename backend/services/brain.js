const Profile = require('../models/Profile');
const Signal = require('../models/Signal');
const SignalConfig = require('../models/SignalConfig');
const ScheduledJob = require('../models/ScheduledJob');
const Store = require('../models/Store');

/**
 * Layer 3 — Brain. For one profile per day: rank its active signals, apply
 * fatigue caps, pick ONE signal, pick ONE channel, pick a send time, and
 * schedule a single ScheduledJob carrying (profileId, signalType, reason) —
 * NOT resolved copy. Copy is resolved in the poller at send time (Phase E).
 *
 * Everything here is deterministic and inspectable.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Signal-type channel defaults (SignalConfig.channelOverride wins over these).
const EMAIL_FIRST = new Set([
  'lapsing', 'winback', 'post_purchase_d3', 'email_capture', 'cod_to_prepaid',
]);
// Everything else (cart_abandon, checkout_abandon, browse_abandon, high_intent,
// price_hesitation, price_drop, back_in_stock) prefers push — time-sensitive.

// --- quiet hours -----------------------------------------------------------

function isQuietHour(hour, start, end) {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end; // same-day window
  return hour >= start || hour < end;                  // wraps midnight (e.g. 22->8)
}

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
    return h % 24; // some ICU builds emit "24" at midnight
  } catch {
    return date.getHours();
  }
}

// --- channel selection ---------------------------------------------------

function selectChannel(signalType, config, profile) {
  const ch = profile.channels || {};
  const avail = {
    push: !!(ch.push && ch.push.subscribed === true),
    email: !!(ch.email && ch.email.address),
  };

  let preferred;
  if (config && (config.channelOverride === 'push' || config.channelOverride === 'email')) {
    preferred = config.channelOverride;
  } else {
    preferred = EMAIL_FIRST.has(signalType) ? 'email' : 'push';
  }
  const other = preferred === 'push' ? 'email' : 'push';

  if (avail[preferred]) return preferred;
  if (avail[other]) return other;
  return null;
}

// --- send time ---------------------------------------------------------

function computeRunAt(profile, quietStart, quietEnd, timezone) {
  const now = new Date();
  const curHour = hourInTz(now, timezone);

  let targetHour = null;

  const ah = Array.isArray(profile.activeHours)
    ? profile.activeHours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
    : [];

  if (ah.length >= 3) {
    const counts = {};
    for (const h of ah) counts[h] = (counts[h] || 0) + 1;
    const ranked = Object.keys(counts)
      .map(Number)
      .filter((h) => !isQuietHour(h, quietStart, quietEnd))
      .sort((a, b) => counts[b] - counts[a] || a - b);
    if (ranked.length) targetHour = ranked[0];
  }

  if (targetHour == null) {
    for (let i = 0; i < 24; i++) {
      const h = (curHour + 1 + i) % 24;
      if (!isQuietHour(h, quietStart, quietEnd)) {
        targetHour = h;
        break;
      }
    }
    if (targetHour == null) targetHour = (curHour + 1) % 24; // all-quiet fallback
  }

  // Next occurrence of targetHour (store-local), aligned to the top of the hour.
  let deltaHours = targetHour - curHour;
  if (deltaHours <= 0) deltaHours += 24;
  const runAt = new Date(now.getTime() + deltaHours * HOUR);
  runAt.setMinutes(0, 0, 0);
  return runAt;
}

// --- per-profile -----------------------------------------------------------

async function runBrainForProfile(profileId, shopDomain) {
  const profile = await Profile.findById(profileId);
  if (!profile || profile.suppressed) return null;

  const shop = shopDomain || profile.shopDomain;

  const store = await Store.findOne({ shopDomain: shop });
  const caps = (store && store.caps) || {};
  const perDay = caps.perDay != null ? caps.perDay : 2;
  const perWeek = caps.perWeek != null ? caps.perWeek : 5;
  const qh = (store && store.quietHours) || {};
  const quietStart = qh.start != null ? qh.start : 22;
  const quietEnd = qh.end != null ? qh.end : 8;
  const timezone = (store && store.timezone) || 'Asia/Kolkata';

  const signals = await Signal.find(
    { shopDomain: shop, profileId },
    null,
    { sort: { strength: -1 } }
  );
  if (!signals || !signals.length) return null;

  // --- fatigue: daily + weekly caps from the profile's message log ---
  const now = Date.now();
  const msgs = Array.isArray(profile.messages) ? profile.messages : [];
  const sentSince = (ms) =>
    msgs.filter((m) => m.sentAt && now - new Date(m.sentAt).getTime() < ms);

  if (sentSince(24 * HOUR).length >= perDay) return null;
  if (sentSince(7 * DAY).length >= perWeek) return null;

  // --- rank: strongest first, honouring config + per-signal 6h cooldown ---
  let winner = null;
  let winnerConfig = null;
  for (const s of signals) {
    const config = await SignalConfig.findOne({ shopDomain: shop, signalType: s.type });
    if (config && config.enabled === false) continue;

    const tooSoon = msgs.some(
      (m) => m.type === s.type && m.sentAt && now - new Date(m.sentAt).getTime() < 6 * HOUR
    );
    if (tooSoon) continue;

    winner = s;
    winnerConfig = config;
    break;
  }
  if (!winner) return null;

  // --- channel ---
  const channel = selectChannel(winner.type, winnerConfig, profile);
  if (!channel) return null;

  // --- send time ---
  const runAt = computeRunAt(profile, quietStart, quietEnd, timezone);

  // --- schedule (dedup: one pending job per profile+signal) ---
  const existing = await ScheduledJob.findOne({
    profileId,
    signalType: winner.type,
    status: 'pending',
  });
  if (existing) return null;

  const carts = (profile.identifiers && profile.identifiers.cartTokens) || [];
  const strengthStr = Number(winner.strength).toFixed(2);
  const reason = `${winner.type} strength=${strengthStr}`;

  try {
    await ScheduledJob.create({
      shopDomain: shop,
      profileId,
      signalType: winner.type,
      channel,
      reason,
      payload: {
        title: '', // resolved at send time by AI (Phase E)
        body: '',  // resolved at send time by AI (Phase E)
        url: winner.productId
          ? `https://${shop}/products/${winner.productId}`
          : `https://${shop}`,
        imageUrl: '', // resolved at send time
      },
      cartToken: carts[0] || null,
      ruleId: null,
      stepIndex: 0,
      status: 'pending',
      runAt,
    });
  } catch (err) {
    // 11000 = the unique brain-job index caught a race — treat as already scheduled.
    if (err && err.code === 11000) return null;
    throw err;
  }

  console.log(`[brain] profile ${profileId}: scheduled ${winner.type} on ${channel}`);
  return { profileId, signalType: winner.type, channel, runAt, reason };
}

// --- per-shop ------------------------------------------------------------

async function runBrainForShop(shopDomain) {
  const shop = String(shopDomain || '').trim().toLowerCase();
  const profiles = await Profile.find(
    { shopDomain: shop, suppressed: { $ne: true } },
    '_id',
    { lean: true }
  );
  const ids = (profiles || []).map((p) => p._id);

  let scheduled = 0;
  let skipped = 0;

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const results = await Promise.all(
      batch.map((id) =>
        runBrainForProfile(id, shop).catch((err) => {
          console.error('[brain] profile error:', err.message);
          return null;
        })
      )
    );
    for (const r of results) {
      if (r) scheduled += 1;
      else skipped += 1;
    }
  }

  console.log(`[brain] shop done: ${scheduled} scheduled, ${skipped} skipped`);
  return { scheduled, skipped };
}

module.exports = { runBrainForProfile, runBrainForShop };
