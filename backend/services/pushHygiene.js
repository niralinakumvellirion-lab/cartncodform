const CustomerPushSubscription = require('../models/CustomerPushSubscription');
const Profile = require('../models/Profile');
const Store = require('../models/Store');

/**
 * Layer 5 support — push channel hygiene (Phase F).
 *
 * Web-push audiences leak: tokens rotate, browsers clear site data, and Chrome
 * revokes permission for sites that push without engagement. These helpers keep
 * the channel healthy so the brain's fatigue logic has a live audience to work
 * with.
 *
 * No PII in logs — profileId and counts only, never a token value.
 */

// FCM error codes that mean "this token is dead — stop using it".
const STALE_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

function isStaleCode(code) {
  return STALE_CODES.has(code);
}

/**
 * A token FCM rejected as dead. Remove it from the subscription table and from
 * the owning profile; if it was the profile's last push token, flip
 * channels.push.subscribed off.
 */
async function handleStaleToken(token, shopDomain) {
  if (!token) return { removed: false };
  const shop = String(shopDomain || '').trim().toLowerCase();

  try {
    await CustomerPushSubscription.deleteMany({ token });
  } catch (err) {
    console.error('[push-hygiene] subscription delete error:', err.message);
  }

  const profile = await Profile.findOne({
    shopDomain: shop,
    'identifiers.pushTokens': token,
  });
  if (!profile) return { removed: false };

  const current = (profile.identifiers && profile.identifiers.pushTokens) || [];
  const remaining = current.filter((t) => t !== token);

  const update = {
    $pull: { 'identifiers.pushTokens': token },
    $set: { updatedAt: new Date() },
  };
  if (remaining.length === 0) {
    update.$set['channels.push.subscribed'] = false;
  }
  await Profile.updateOne({ _id: profile._id }, update);

  console.log(`[push-hygiene] stale token removed, profileId=${profile._id}`);
  return { removed: true };
}

/**
 * After a successful push send to a profile: if it has now received
 * store.caps.maxUnopenedPush pushes with zero clicks/conversions, suppress the
 * push channel until the shopper shows fresh activity (clearPushSuppression).
 */
async function checkUnopenedThreshold(profileId, shopDomain) {
  const shop = String(shopDomain || '').trim().toLowerCase();

  const profile = await Profile.findById(profileId);
  if (!profile) return { suppressed: false };
  const push = (profile.channels && profile.channels.push) || {};
  if (push.subscribed !== true) return { suppressed: false };

  const store = await Store.findOne({ shopDomain: shop }, 'caps');
  const maxUnopened =
    store && store.caps && store.caps.maxUnopenedPush != null
      ? store.caps.maxUnopenedPush
      : 5;

  let sentCount = 0;
  let clickedCount = 0;
  let oldestSentAt = null;
  for (const m of Array.isArray(profile.messages) ? profile.messages : []) {
    if (m.channel !== 'push') continue;
    if (m.outcome === 'clicked' || m.outcome === 'converted') {
      clickedCount += 1;
    } else if (m.outcome === 'sent') {
      sentCount += 1;
      if (m.sentAt) {
        const t = new Date(m.sentAt);
        if (!oldestSentAt || t < oldestSentAt) oldestSentAt = t;
      }
    }
  }

  if (sentCount >= maxUnopened && clickedCount === 0) {
    // Give the customer a full week to click before pulling the channel — if
    // every unopened push is younger than 7 days, hold off.
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    if (!oldestSentAt || Date.now() - oldestSentAt.getTime() < SEVEN_DAYS) {
      return { suppressed: false };
    }

    await Profile.updateOne(
      { _id: profile._id },
      { $set: { 'channels.push.subscribed': false, updatedAt: new Date() } }
    );
    console.log(
      `[push-hygiene] suppressed profileId=${profile._id} after ${sentCount} unopened pushes`
    );
    return { suppressed: true };
  }
  return { suppressed: false };
}

/**
 * After a push send batch: accumulate delivered / attempted onto the shop's
 * rolling counters and recompute the rate. The 7-day window is approximated by
 * accumulation + a nightly reset (server.js) once lastComputedAt ages out.
 */
async function updateDeliveredRate(shopDomain, delivered, attempted) {
  const shop = String(shopDomain || '').trim().toLowerCase();
  const store = await Store.findOne({ shopDomain: shop });
  if (!store) return;

  const ps = store.pushStats || {};
  const deliveredLast7d = (ps.deliveredLast7d || 0) + (Number(delivered) || 0);
  const attemptedLast7d = (ps.attemptedLast7d || 0) + (Number(attempted) || 0);
  const rateLast7d = attemptedLast7d > 0 ? deliveredLast7d / attemptedLast7d : 0;

  await Store.updateOne(
    { _id: store._id },
    {
      $set: {
        'pushStats.deliveredLast7d': deliveredLast7d,
        'pushStats.attemptedLast7d': attemptedLast7d,
        'pushStats.rateLast7d': rateLast7d,
        'pushStats.lastComputedAt': new Date(),
      },
    }
  );
}

/**
 * A suppressed profile showed fresh activity (a page_view). If it still has a
 * live push token, turn the channel back on.
 */
async function clearPushSuppression(profileId, shopDomain) { // eslint-disable-line no-unused-vars
  const profile = await Profile.findById(profileId);
  if (!profile) return { resubscribed: false };

  const push = (profile.channels && profile.channels.push) || {};
  if (push.subscribed === true) return { resubscribed: false };

  const tokens = (profile.identifiers && profile.identifiers.pushTokens) || [];
  if (tokens.length === 0) return { resubscribed: false };

  await Profile.updateOne(
    { _id: profile._id },
    { $set: { 'channels.push.subscribed': true, updatedAt: new Date() } }
  );
  console.log(`[push-hygiene] resubscribed profileId=${profile._id} on new activity`);
  return { resubscribed: true };
}

module.exports = {
  handleStaleToken,
  checkUnopenedThreshold,
  updateDeliveredRate,
  clearPushSuppression,
  isStaleCode,
};
