const Profile = require('../models/Profile');
const Signal = require('../models/Signal');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const StorefrontEvent = require('../models/StorefrontEvent');

/**
 * Layer 2 — Signals. Deterministic facts about a Profile, each with a
 * strength (0–1), an evidence list, and a TTL. Computed on ingest and nightly.
 *
 * Every compute* function takes (profile, shopDomain) and returns either
 * null (signal does not apply) or:
 *   { type, strength, productId, evidence, expiresAt }
 *
 * Queries use the (filter, projection, options) form so the option `sort` /
 * `limit` ride along the thenable — no `.sort()` chaining, so mocks stay simple.
 */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const inMs = (ms) => new Date(Date.now() + ms);

function tokensOf(profile) {
  const ids = (profile && profile.identifiers) || {};
  return [...(ids.sessionIds || []), ...(ids.cartTokens || [])].filter(Boolean);
}

function sig(type, strength, productId, evidence, expiresInMs) {
  return {
    type,
    strength,
    productId: productId != null ? String(productId) : null,
    evidence: (evidence || []).slice(0, 5),
    expiresAt: inMs(expiresInMs),
  };
}

// ---------------------------------------------------------------------------
// cart_abandon
// ---------------------------------------------------------------------------
async function computeCartAbandon(profile, shopDomain) {
  const carts = (profile.identifiers && profile.identifiers.cartTokens) || [];
  if (!carts.length) return null;

  const cart = await AbandonedCustomer.findOne(
    { shopDomain, sessionId: { $in: carts }, status: 'abandoned' },
    null,
    { sort: { createdAt: -1 } }
  );
  if (!cart) return null;

  // AbandonedCustomer has no updatedAt field — createdAt is the abandon clock.
  const ageMs = Date.now() - new Date(cart.createdAt).getTime();
  if (ageMs < 60 * MIN) return null;

  let strength;
  if (ageMs < 2 * HOUR) strength = 1.0;
  else if (ageMs < 6 * HOUR) strength = 0.8;
  else if (ageMs < 24 * HOUR) strength = 0.6;
  else strength = 0.3;

  const item = (cart.cartItems && cart.cartItems[0]) || {};
  const evidence = [
    `Cart abandoned ${Math.round(ageMs / MIN)} minutes ago`,
    `Cart value: ₹${cart.cartValue != null ? cart.cartValue : 0}`,
  ];
  if (item.title) evidence.push(`Item: ${item.title}`);

  return sig('cart_abandon', strength, item.productId != null ? item.productId : null, evidence, 48 * HOUR);
}

// ---------------------------------------------------------------------------
// checkout_abandon
// ---------------------------------------------------------------------------
async function computeCheckoutAbandon(profile, shopDomain) {
  const tokens = tokensOf(profile);
  if (!tokens.length) return null;

  const evt = await StorefrontEvent.findOne(
    {
      shopDomain,
      type: 'reached_checkout',
      sessionId: { $in: tokens },
      ts: { $gte: inMs(-24 * HOUR) },
    },
    null,
    { sort: { ts: -1 } }
  );
  if (!evt) return null;

  // Proxy for "no order since": the cart is still an abandoned AbandonedCustomer.
  const carts = (profile.identifiers && profile.identifiers.cartTokens) || [];
  const stillAbandoned = await AbandonedCustomer.findOne({
    shopDomain,
    sessionId: { $in: carts.length ? carts : tokens },
    status: 'abandoned',
  });
  if (!stillAbandoned) return null;

  const ageMin = Math.round((Date.now() - new Date(evt.ts).getTime()) / MIN);
  return sig(
    'checkout_abandon',
    0.95,
    null,
    [`Reached checkout ${ageMin} min ago, no order placed`],
    24 * HOUR
  );
}

// ---------------------------------------------------------------------------
// browse_abandon
// ---------------------------------------------------------------------------
async function computeBrowseAbandon(profile, shopDomain) {
  const tokens = tokensOf(profile);
  if (!tokens.length) return null;

  const view = await StorefrontEvent.findOne(
    {
      shopDomain,
      type: 'product_view',
      sessionId: { $in: tokens },
      ts: { $gte: inMs(-30 * MIN) },
    },
    null,
    { sort: { ts: -1 } }
  );
  if (!view) return null;

  const added = await StorefrontEvent.findOne({
    shopDomain,
    type: 'add_to_cart',
    sessionId: view.sessionId,
    ts: { $gte: inMs(-30 * MIN) },
  });
  if (added) return null;

  const ageMin = Math.round((Date.now() - new Date(view.ts).getTime()) / MIN);
  const pid = view.meta && view.meta.productId;
  return sig(
    'browse_abandon',
    0.5,
    pid,
    [`Viewed product ${ageMin} min ago, did not add to cart`],
    2 * HOUR
  );
}

// ---------------------------------------------------------------------------
// high_intent — same product 2+ times in ONE session, last 2h
// ---------------------------------------------------------------------------
async function computeHighIntent(profile, shopDomain) {
  const tokens = tokensOf(profile);
  if (!tokens.length) return null;

  const views = await StorefrontEvent.find(
    {
      shopDomain,
      type: 'product_view',
      sessionId: { $in: tokens },
      ts: { $gte: inMs(-2 * HOUR) },
    },
    null,
    { sort: { ts: -1 }, limit: 500 }
  );
  if (!views || !views.length) return null;

  const groups = {};
  for (const v of views) {
    const pid = v.meta && v.meta.productId;
    if (pid == null) continue;
    const key = `${v.sessionId}::${pid}`;
    groups[key] = groups[key] || { productId: pid, count: 0, lastTs: 0 };
    groups[key].count += 1;
    const t = new Date(v.ts).getTime();
    if (t > groups[key].lastTs) groups[key].lastTs = t;
  }

  const best = Object.values(groups)
    .filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count || b.lastTs - a.lastTs)[0];
  if (!best) return null;

  return sig(
    'high_intent',
    0.75,
    best.productId,
    [`Viewed same product ${best.count} times in one session`],
    4 * HOUR
  );
}

// ---------------------------------------------------------------------------
// price_hesitation — same product across 3+ DIFFERENT sessions, never carted
// ---------------------------------------------------------------------------
async function computePriceHesitation(profile, shopDomain) {
  const tokens = tokensOf(profile);
  if (!tokens.length) return null;

  const views = await StorefrontEvent.find(
    {
      shopDomain,
      type: 'product_view',
      sessionId: { $in: tokens },
      ts: { $gte: inMs(-30 * DAY) },
    },
    null,
    { limit: 1000 }
  );
  if (!views || !views.length) return null;

  const byProduct = {};
  for (const v of views) {
    const pid = v.meta && v.meta.productId;
    if (pid == null) continue;
    const key = String(pid);
    byProduct[key] = byProduct[key] || { productId: pid, sessions: new Set(), variantIds: new Set() };
    byProduct[key].sessions.add(v.sessionId);
    const vid = v.meta && v.meta.variantId;
    if (vid != null) byProduct[key].variantIds.add(String(vid));
  }

  const candidates = Object.values(byProduct)
    .filter((p) => p.sessions.size >= 3)
    .sort((a, b) => b.sessions.size - a.sessions.size);
  if (!candidates.length) return null;

  // add_to_cart events store the added VARIANT id under meta.productId, so
  // match a candidate against both its productId and any known variantId.
  const adds = await StorefrontEvent.find(
    { shopDomain, type: 'add_to_cart', sessionId: { $in: tokens } },
    null,
    { limit: 1000 }
  );
  const addedIds = new Set(
    (adds || [])
      .map((a) => a.meta && a.meta.productId)
      .filter((x) => x != null)
      .map(String)
  );

  for (const c of candidates) {
    const idsForThis = new Set([String(c.productId), ...c.variantIds]);
    const wasAdded = [...idsForThis].some((id) => addedIds.has(id));
    if (wasAdded) continue;
    return sig(
      'price_hesitation',
      0.7,
      c.productId,
      [`Viewed same product across ${c.sessions.size} sessions, never added to cart`],
      72 * HOUR
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// post_purchase_d3 — ordered 2.5–4 days ago
// ---------------------------------------------------------------------------
async function computePostPurchaseD3(profile, shopDomain) { // eslint-disable-line no-unused-vars
  const o = profile.orders || {};
  if (!(o.count >= 1) || !o.lastOrderAt) return null;
  const ageMs = Date.now() - new Date(o.lastOrderAt).getTime();
  if (ageMs < 2.5 * DAY || ageMs > 4 * DAY) return null;
  return sig('post_purchase_d3', 0.6, null, ['Ordered 3 days ago — upsell window open'], 36 * HOUR);
}

// ---------------------------------------------------------------------------
// lapsing — last seen 21–44 days ago
// ---------------------------------------------------------------------------
async function computeLapsing(profile, shopDomain) { // eslint-disable-line no-unused-vars
  if (!profile.lastSeenAt) return null;
  const ageDays = (Date.now() - new Date(profile.lastSeenAt).getTime()) / DAY;
  if (ageDays < 21 || ageDays > 44) return null;
  return sig('lapsing', 0.5, null, ['Last seen 21–44 days ago'], 7 * DAY);
}

// ---------------------------------------------------------------------------
// winback — silent 45+ days, was a customer
// ---------------------------------------------------------------------------
async function computeWinback(profile, shopDomain) { // eslint-disable-line no-unused-vars
  const o = profile.orders || {};
  if (!profile.lastSeenAt || !(o.count >= 1)) return null;
  const ageDays = (Date.now() - new Date(profile.lastSeenAt).getTime()) / DAY;
  if (ageDays <= 45) return null;
  return sig('winback', 0.4, null, ['Silent 45+ days, previous customer'], 14 * DAY);
}

// ---------------------------------------------------------------------------
// email_capture — push subscriber with no email
// ---------------------------------------------------------------------------
async function computeEmailCapture(profile, shopDomain) { // eslint-disable-line no-unused-vars
  const push = (profile.channels && profile.channels.push) || {};
  const email = (profile.channels && profile.channels.email) || {};
  if (push.subscribed === true && !email.address) {
    return sig('email_capture', 0.65, null, ['Push subscriber with no email on file'], 7 * DAY);
  }
  return null;
}

// ---------------------------------------------------------------------------
// cod_to_prepaid — has COD orders, never prepaid
// ---------------------------------------------------------------------------
async function computeCodToPrepaid(profile, shopDomain) { // eslint-disable-line no-unused-vars
  const o = profile.orders || {};
  if ((o.codCount || 0) >= 1 && (o.prepaidCount || 0) === 0) {
    return sig('cod_to_prepaid', 0.55, null, ['COD customer, never paid prepaid'], 7 * DAY);
  }
  return null;
}

// ---------------------------------------------------------------------------
// price_drop / back_in_stock — STUBS
// Requires products/update webhook + read_inventory scope
// Full implementation deferred to Phase F scope change.
// ---------------------------------------------------------------------------
async function computePriceDrop(profile, shopDomain) { return null; } // eslint-disable-line no-unused-vars
async function computeBackInStock(profile, shopDomain) { return null; } // eslint-disable-line no-unused-vars

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
const COMPUTE_FNS = [
  computeCartAbandon,
  computeCheckoutAbandon,
  computeBrowseAbandon,
  computeHighIntent,
  computePriceHesitation,
  computePostPurchaseD3,
  computeLapsing,
  computeWinback,
  computeEmailCapture,
  computeCodToPrepaid,
];

async function computeSignalsForProfile(profileId, shopDomain) {
  const profile = await Profile.findById(profileId);
  if (!profile || profile.suppressed) return [];

  const shop = shopDomain || profile.shopDomain;

  const results = (
    await Promise.all(
      COMPUTE_FNS.map((fn) =>
        Promise.resolve()
          .then(() => fn(profile, shop))
          .catch((err) => {
            console.error('[signals] compute error:', err.message);
            return null;
          })
      )
    )
  ).filter(Boolean);

  const activeTypes = results.map((r) => r.type);

  await Promise.all(
    results.map((r) =>
      Signal.findOneAndUpdate(
        { shopDomain: shop, profileId, type: r.type },
        {
          $set: {
            strength: r.strength,
            productId: r.productId,
            evidence: r.evidence,
            expiresAt: r.expiresAt,
            updatedAt: new Date(),
          },
        },
        { upsert: true, new: true }
      )
    )
  );

  // Drop signals that no longer apply.
  await Signal.deleteMany({ shopDomain: shop, profileId, type: { $nin: activeTypes } });

  console.log(`[signals] profile ${profileId}: ${results.length} active`);
  return results;
}

async function runNightlySignals(shopDomain) {
  const shop = String(shopDomain || '').trim().toLowerCase();
  const profiles = await Profile.find(
    { shopDomain: shop, suppressed: { $ne: true } },
    '_id',
    { lean: true }
  );
  const ids = (profiles || []).map((p) => p._id);

  let processed = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    await Promise.all(
      batch.map((id) =>
        computeSignalsForProfile(id, shop).catch((err) =>
          console.error('[signals] nightly compute error:', err.message)
        )
      )
    );
    processed += batch.length;
  }

  console.log(`[signals] nightly run complete: ${processed} profiles processed`);
  return processed;
}

module.exports = {
  computeCartAbandon,
  computeCheckoutAbandon,
  computeBrowseAbandon,
  computeHighIntent,
  computePriceHesitation,
  computePriceDrop,
  computeBackInStock,
  computePostPurchaseD3,
  computeLapsing,
  computeWinback,
  computeEmailCapture,
  computeCodToPrepaid,
  computeSignalsForProfile,
  runNightlySignals,
};
