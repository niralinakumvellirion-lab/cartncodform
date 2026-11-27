'use strict';

/**
 * "Money earned" for the Dashboard: orders that our messages brought back, for one calendar month (UTC).
 *
 * Source: AttributedEvent { eventType: 'purchase' } written by the orders/create webhook when the order's cart
 * carries our message id (_ccf_job) or follows a push click. Test orders are never recorded there. Each
 * purchase is joined to its ScheduledJob to know which feature sent the message. Only these tracked orders
 * count — nothing is estimated.
 */

const AttributedEvent = require('../models/AttributedEvent');
const ScheduledJob = require('../models/ScheduledJob');
const Store = require('../models/Store');
const { PLANS, tierOf } = require('../utils/plans');

const FEATURES = [
  { key: 'cart', label: 'Cart reminders', types: ['cart_abandon', 'checkout_abandon'] },
  { key: 'back_in_stock', label: 'Back in stock', types: ['back_in_stock'] },
  { key: 'price_drop', label: 'Price drop', types: ['price_drop'] },
  { key: 'browse', label: 'Browsing reminders', types: ['browse_abandon', 'high_intent', 'price_hesitation', 'page_visit'] },
  { key: 'cod_to_prepaid', label: 'COD → Prepaid', types: ['cod_to_prepaid'] },
  { key: 'winback', label: 'Win-back & follow-ups', types: ['lapsing', 'winback', 'post_purchase_d3', 'email_capture'] },
  { key: 'birthday', label: 'Birthday offers', types: ['birthday'] },
  { key: 'campaigns', label: 'Campaigns & manual sends', types: ['manual', 'email_broadcast', 'festival', 'broadcast'] },
];
const OTHER = { key: 'other', label: 'Other messages' };

function featureOf(signalType) {
  return FEATURES.find((f) => f.types.includes(signalType)) || OTHER;
}

/** 'YYYY-MM' → { start, end, prevStart, label } (UTC months). Bad/missing → the month of `now`. */
function monthRange(month, now = new Date()) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || ''));
  let y = now.getUTCFullYear();
  let mo = now.getUTCMonth();
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    y = Number(m[1]);
    mo = Number(m[2]) - 1;
  }
  return {
    key: `${y}-${String(mo + 1).padStart(2, '0')}`,
    start: new Date(Date.UTC(y, mo, 1)),
    end: new Date(Date.UTC(y, mo + 1, 1)),
    prevStart: new Date(Date.UTC(y, mo - 1, 1)),
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

async function purchasesIn(shop, start, end) {
  return AttributedEvent.find(
    { shopDomain: shop, eventType: 'purchase', ts: { $gte: start, $lt: end } },
    'jobId meta'
  ).lean();
}

async function moneySummary(shop, { month, now = new Date() } = {}) {
  const r = monthRange(month, now);
  const [purchases, prevPurchases, sent, store] = await Promise.all([
    purchasesIn(shop, r.start, r.end),
    purchasesIn(shop, r.prevStart, r.start),
    ScheduledJob.countDocuments({ shopDomain: shop, status: 'sent', sentAt: { $gte: r.start, $lt: r.end } }),
    Store.findOne({ shopDomain: shop }).select('shopDomain plan planTier isInternal').lean(),
  ]);

  const jobIds = [...new Set(purchases.map((p) => p.jobId).filter(Boolean).map(String))];
  const jobs = jobIds.length
    ? await ScheduledJob.find({ _id: { $in: jobIds } }, 'signalType').lean()
    : [];
  const typeOf = new Map(jobs.map((j) => [String(j._id), j.signalType]));

  const byKey = new Map();
  const currencies = new Map();
  let total = 0;
  for (const p of purchases) {
    const amount = Number(p.meta && p.meta.orderTotal) || 0;
    const f = featureOf(p.jobId ? typeOf.get(String(p.jobId)) : null);
    const row = byKey.get(f.key) || { key: f.key, label: f.label, revenue: 0, orders: 0 };
    row.revenue += amount;
    row.orders += 1;
    byKey.set(f.key, row);
    total += amount;
    const c = p.meta && p.meta.currency;
    if (c) currencies.set(c, (currencies.get(c) || 0) + 1);
  }
  let currency = [...currencies.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0])[0] || null;
  if (!currency) {
    // No sales this month: show the currency of the store's latest tracked order (none yet → the card's default).
    const last = await AttributedEvent.findOne(
      { shopDomain: shop, eventType: 'purchase', 'meta.currency': { $type: 'string' } }, 'meta.currency'
    ).sort({ ts: -1 }).lean();
    currency = (last && last.meta && last.meta.currency) || null;
  }
  const prevTotal = prevPurchases.reduce((s, p) => s + (Number(p.meta && p.meta.orderTotal) || 0), 0);

  const tier = tierOf(store);
  const plan = PLANS[tier] || PLANS.free;
  const planPrice = Number(plan.price) || 0;

  return {
    month: r.key,
    currency,
    total: round2(total),
    orders: purchases.length,
    sent,
    prevTotal: round2(prevTotal),
    changePct: prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null,
    byFeature: [...byKey.values()]
      .map((f) => ({ ...f, revenue: round2(f.revenue) }))
      .sort((a, b) => b.revenue - a.revenue),
    plan: { id: plan.id, name: plan.name, price: planPrice, currency: 'USD' },
    // Plans are priced in USD: a return multiple only makes sense when the store also sells in USD.
    returnMultiple: currency === 'USD' && planPrice > 0 && total > 0 ? Math.round(total / planPrice) : null,
  };
}

module.exports = { moneySummary, monthRange, featureOf, FEATURES };
