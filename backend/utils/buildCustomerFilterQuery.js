'use strict';

const { buildSegmentQuery, VALID_SEGMENTS } = require('./segmentQuery');

// Mirror exactly how the Customers list's ReachIcons component decides reach:
//   push  → channels.push.subscribed (truthy)
//   email → channels.email.address (truthy)
//   phone → identifiers.phones.length > 0
// (from frontend/app/admin/screens/customerShared.jsx ReachIcons)

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Parse YYYY-MM-DD as the start or end of that calendar day in the given timezone.
// Returns a UTC Date object, or null if the string is invalid.
function parseDateInTz(ymd, tz, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, mo, d] = ymd.split('-').map(Number);
  if (!y || !mo || !d) return null;

  // Reference: noon UTC on the requested date. At this time we ask what hour
  // it is in the store timezone, then compute back to midnight UTC.
  const ref = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit',
    });
    const str = fmt.format(ref); // e.g. "17:30" for IST, "07:00" for UTC-5
    const [hh, mm] = str.split(':').map(Number);
    const safeHh = hh === 24 ? 0 : hh;
    // offset = (local time at noon UTC) - 12:00
    const offsetMs = (safeHh - 12) * 3600000 + mm * 60000;
    const midnight = new Date(ref.getTime() - 12 * 3600000 - offsetMs);
    return endOfDay ? new Date(midnight.getTime() + 86400000 - 1) : midnight;
  } catch {
    // Unknown timezone: fall back to treating the date as UTC
    const midnight = new Date(Date.UTC(y, mo - 1, d));
    return endOfDay ? new Date(midnight.getTime() + 86400000 - 1) : midnight;
  }
}

// Compute start of today in the store timezone.
function todayStartInTz(tz) {
  const now = new Date();
  try {
    const ymd = new Intl.DateTimeFormat('sv-SE', { timeZone: tz }).format(now);
    return parseDateInTz(ymd, tz, false) || new Date(now.setUTCHours(0, 0, 0, 0));
  } catch {
    const d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d;
  }
}

const ONE_YEAR_MS = 366 * 24 * 3600000;

/**
 * Build a MongoDB query for the all-customers export.
 *
 * @param {string} shopDomain
 * @param {object} params - raw query string params (all strings)
 * @param {string} tz     - IANA timezone (from Store.timezone)
 * @returns {{ query: object }|{ error: string }}
 */
function buildCustomerFilterQuery(shopDomain, params, tz) {
  const safeTz = tz || 'Asia/Kolkata';

  // ── segment ─────────────────────────────────────────────────────────────────
  const segment = params.segment || 'everyone';
  if (!VALID_SEGMENTS.includes(segment)) {
    return { error: `segment must be one of: ${VALID_SEGMENTS.join(', ')}` };
  }

  // Base query from segment (no requireEmail, no suppressed guard — export all customers)
  const query = buildSegmentQuery(shopDomain, segment);

  // Conditions that need MongoDB $and (to avoid clobbering a possible top-level $or)
  const andConditions = [];

  // ── type ─────────────────────────────────────────────────────────────────────
  const type = params.type || 'all';
  if (!['all', 'identified', 'anonymous'].includes(type)) {
    return { error: "type must be 'all', 'identified', or 'anonymous'" };
  }
  const identifiedOr = [
    { 'identifiers.emails.0': { $exists: true } },
    { 'identifiers.phones.0': { $exists: true } },
    { 'channels.email.address': { $exists: true, $ne: null } },
  ];
  if (type === 'identified') {
    andConditions.push({ $or: identifiedOr });
  } else if (type === 'anonymous') {
    andConditions.push({ $nor: identifiedOr });
  }

  // ── reach filters ────────────────────────────────────────────────────────────
  for (const [key, field] of [
    ['reachPush',  'channels.push.subscribed'],
    ['reachEmail', 'channels.email.address'],
    ['reachPhone', 'identifiers.phones.0'],
  ]) {
    const val = params[key];
    if (val === undefined || val === '') continue;
    if (val !== 'true') return { error: `${key} must be 'true' or omitted` };
    if (key === 'reachPush')  query['channels.push.subscribed'] = true;
    if (key === 'reachEmail') query['channels.email.address'] = { $exists: true, $ne: null };
    if (key === 'reachPhone') query['identifiers.phones.0'] = { $exists: true };
  }

  // ── search ───────────────────────────────────────────────────────────────────
  if (params.search) {
    const raw = String(params.search);
    if (raw.length > 100) return { error: 'search must be 100 characters or fewer' };
    const rx = escapeRegex(raw.trim());
    if (rx) {
      andConditions.push({
        $or: [
          { 'identifiers.emails':        { $regex: rx, $options: 'i' } },
          { 'identifiers.phones':        { $regex: rx, $options: 'i' } },
          { 'channels.email.address':    { $regex: rx, $options: 'i' } },
        ],
      });
    }
  }

  // ── lastSeen ─────────────────────────────────────────────────────────────────
  const lastSeen = params.lastSeen || 'any';
  if (!['any', 'today', '7d', '30d', 'custom'].includes(lastSeen)) {
    return { error: "lastSeen must be 'any', 'today', '7d', '30d', or 'custom'" };
  }
  if (lastSeen === 'today') {
    query.lastSeenAt = { $gte: todayStartInTz(safeTz) };
  } else if (lastSeen === '7d') {
    query.lastSeenAt = { $gte: new Date(Date.now() - 7 * 86400000) };
  } else if (lastSeen === '30d') {
    query.lastSeenAt = { $gte: new Date(Date.now() - 30 * 86400000) };
  } else if (lastSeen === 'custom') {
    const { lastSeenFrom, lastSeenTo } = params;
    if (!lastSeenFrom && !lastSeenTo) {
      return { error: 'lastSeen=custom requires lastSeenFrom or lastSeenTo (YYYY-MM-DD)' };
    }
    let fromDate = null, toDate = null;
    if (lastSeenFrom) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(lastSeenFrom)) return { error: 'lastSeenFrom must be YYYY-MM-DD' };
      fromDate = parseDateInTz(lastSeenFrom, safeTz, false);
      if (!fromDate) return { error: 'lastSeenFrom is not a valid date' };
    }
    if (lastSeenTo) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(lastSeenTo)) return { error: 'lastSeenTo must be YYYY-MM-DD' };
      toDate = parseDateInTz(lastSeenTo, safeTz, true);
      if (!toDate) return { error: 'lastSeenTo is not a valid date' };
    }
    if (fromDate && toDate && fromDate > toDate) {
      return { error: 'lastSeenFrom must be on or before lastSeenTo' };
    }
    if (fromDate && toDate && toDate - fromDate > ONE_YEAR_MS) {
      return { error: 'lastSeen custom range cannot exceed 1 year' };
    }
    const clause = {};
    if (fromDate) clause.$gte = fromDate;
    if (toDate) clause.$lte = toDate;
    query.lastSeenAt = clause;
  }

  // ── firstSeen (createdAt) ────────────────────────────────────────────────────
  const firstSeen = params.firstSeen || 'any';
  if (!['any', '30d', '90d'].includes(firstSeen)) {
    return { error: "firstSeen must be 'any', '30d', or '90d'" };
  }
  if (firstSeen === '30d') query.createdAt = { $gte: new Date(Date.now() - 30 * 86400000) };
  if (firstSeen === '90d') query.createdAt = { $gte: new Date(Date.now() - 90 * 86400000) };

  // ── orders range ─────────────────────────────────────────────────────────────
  let ordersMin = undefined, ordersMax = undefined;
  if (params.ordersMin !== undefined && params.ordersMin !== '') {
    const v = Number(params.ordersMin);
    if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
      return { error: 'ordersMin must be a non-negative integer' };
    }
    ordersMin = v;
  }
  if (params.ordersMax !== undefined && params.ordersMax !== '') {
    const v = Number(params.ordersMax);
    if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
      return { error: 'ordersMax must be a non-negative integer' };
    }
    ordersMax = v;
  }
  if (ordersMin !== undefined && ordersMax !== undefined && ordersMax < ordersMin) {
    return { error: 'ordersMax must be >= ordersMin' };
  }
  if (ordersMin !== undefined || ordersMax !== undefined) {
    const clause = {};
    if (ordersMin !== undefined) clause.$gte = ordersMin;
    if (ordersMax !== undefined) clause.$lte = ordersMax;
    query['orders.count'] = clause;
  }

  // ── spent range ──────────────────────────────────────────────────────────────
  let spentMin = undefined, spentMax = undefined;
  if (params.spentMin !== undefined && params.spentMin !== '') {
    const v = Number(params.spentMin);
    if (!Number.isFinite(v) || v < 0) return { error: 'spentMin must be a non-negative number' };
    spentMin = v;
  }
  if (params.spentMax !== undefined && params.spentMax !== '') {
    const v = Number(params.spentMax);
    if (!Number.isFinite(v) || v < 0) return { error: 'spentMax must be a non-negative number' };
    spentMax = v;
  }
  if (spentMin !== undefined && spentMax !== undefined && spentMax < spentMin) {
    return { error: 'spentMax must be >= spentMin' };
  }
  if (spentMin !== undefined || spentMax !== undefined) {
    const clause = {};
    if (spentMin !== undefined) clause.$gte = spentMin;
    if (spentMax !== undefined) clause.$lte = spentMax;
    query['orders.ltv'] = clause;
  }

  // ── payment ──────────────────────────────────────────────────────────────────
  const payment = params.payment || 'any';
  if (!['any', 'cod', 'prepaid'].includes(payment)) {
    return { error: "payment must be 'any', 'cod', or 'prepaid'" };
  }
  if (payment === 'cod')     query['orders.codCount']     = { $gte: 1 };
  if (payment === 'prepaid') query['orders.prepaidCount'] = { $gte: 1 };

  // ── lastOrder ────────────────────────────────────────────────────────────────
  const lastOrder = params.lastOrder || 'any';
  if (!['any', '30d', '90d'].includes(lastOrder)) {
    return { error: "lastOrder must be 'any', '30d', or '90d'" };
  }
  if (lastOrder === '30d') query['orders.lastOrderAt'] = { $gte: new Date(Date.now() - 30 * 86400000) };
  if (lastOrder === '90d') query['orders.lastOrderAt'] = { $gte: new Date(Date.now() - 90 * 86400000) };

  // ── messaged ─────────────────────────────────────────────────────────────────
  const messaged = params.messaged || 'any';
  if (!['any', 'never', 'before'].includes(messaged)) {
    return { error: "messaged must be 'any', 'never', or 'before'" };
  }
  if (messaged === 'never')  query.messages            = { $size: 0 };
  if (messaged === 'before') query['messages.0']       = { $exists: true };

  // ── emailStatus ──────────────────────────────────────────────────────────────
  const emailStatus = params.emailStatus || 'any';
  if (!['any', 'subscribed', 'unsubscribed'].includes(emailStatus)) {
    return { error: "emailStatus must be 'any', 'subscribed', or 'unsubscribed'" };
  }
  if (emailStatus === 'subscribed') {
    andConditions.push({
      $or: [
        { 'channels.email.address': { $exists: true, $ne: null } },
        { 'identifiers.emails.0': { $exists: true } },
      ],
    });
    query.suppressed = { $ne: true };
  }
  if (emailStatus === 'unsubscribed') {
    query.suppressed = true;
  }

  // ── merge andConditions ──────────────────────────────────────────────────────
  if (andConditions.length > 0) {
    query.$and = andConditions;
  }

  return { query };
}

module.exports = { buildCustomerFilterQuery };
