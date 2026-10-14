'use strict';

const VALID_SEGMENTS = [
  'everyone', 'has_cart', 'bought_once', 'repeat_buyer', 'going_quiet',
  'email_captured', 'push_subscribed', 'whatsapp_captured',
];

/**
 * Build a MongoDB Profile query for a named segment.
 *
 * @param {string} shopDomain
 * @param {string} segment  - one of VALID_SEGMENTS; unknown values treated as 'everyone'
 * @param {object} [opts]
 * @param {boolean} [opts.requireEmail=false]
 *   Add email-presence guard ($or: email address OR emails[0] exists)
 *   AND suppress the suppressed guard (suppressed: {$ne: true}).
 *   Matches the broadcast/count copy behaviour.
 * @param {boolean} [opts.requireNotSuppressed=false]
 *   Add only the suppressed guard without the email-presence guard.
 * @param {Date|null} [opts.from]
 *   Range start for email_captured (capturedAt) and push_subscribed (subscribedAt).
 *   Silently ignored for every other segment — mirrors how profiles.js applies from/to.
 * @param {Date|null} [opts.to]
 *   Range end for the same fields.
 * @returns {object} MongoDB query object
 */
function buildSegmentQuery(shopDomain, segment, opts = {}) {
  const { requireEmail = false, requireNotSuppressed = false, from = null, to = null } = opts;

  const query = { shopDomain };

  if (requireNotSuppressed || requireEmail) {
    query.suppressed = { $ne: true };
  }
  if (requireEmail) {
    query.$or = [
      { 'channels.email.address': { $exists: true, $ne: null } },
      { 'identifiers.emails.0': { $exists: true } },
    ];
  }

  if (segment === 'has_cart') {
    query['identifiers.cartTokens.0'] = { $exists: true };
    query['orders.count'] = 0;
  } else if (segment === 'bought_once') {
    query['orders.count'] = 1;
  } else if (segment === 'repeat_buyer') {
    query['orders.count'] = { $gte: 2 };
  } else if (segment === 'going_quiet') {
    query.lastSeenAt = { $lt: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000) };
  } else if (segment === 'email_captured') {
    const rangeClause = {};
    if (from) rangeClause.$gte = from;
    if (to) rangeClause.$lte = to;
    query['channels.email.capturedAt'] = Object.keys(rangeClause).length
      ? { $exists: true, ...rangeClause }
      : { $exists: true };
  } else if (segment === 'push_subscribed') {
    query['channels.push.subscribed'] = true;
    if (from || to) {
      const sub = {};
      if (from) sub.$gte = from;
      if (to) sub.$lte = to;
      query['channels.push.subscribedAt'] = sub;
    }
  } else if (segment === 'whatsapp_captured') {
    query['channels.whatsapp.consentedAt'] = { $exists: true, $ne: null };
    query['channels.whatsapp.optedOutAt'] = null;
  }
  // 'everyone' (and any unknown value) — no extra clauses

  return query;
}

module.exports = { buildSegmentQuery, VALID_SEGMENTS };
