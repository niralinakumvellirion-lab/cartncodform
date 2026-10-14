'use strict';

const express = require('express');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const Profile = require('../models/Profile');
const StorefrontEvent = require('../models/StorefrontEvent');
const { buildCustomerFilterQuery } = require('../utils/buildCustomerFilterQuery');

const router = express.Router();

const EVENT_LABELS = {
  page_view:            'Viewed page',
  product_view:         'Viewed product',
  collection_view:      'Viewed collection',
  search:               'Searched',
  cart_view:            'Viewed cart',
  reached_checkout:     'Went to checkout',
  add_to_cart:          'Added to cart',
  remove_from_cart:     'Removed from cart',
  cart_update:          'Updated cart',
  page_exit:            'Left page',
  push_prompt_shown:    'Saw push prompt',
  push_prompt_accepted: 'Responded to push prompt',
};

const XLSX_LIMIT = 50000;

// Protect string cells from spreadsheet formula injection (=, +, -, @).
function safeStr(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.length === 0) return '';
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

// Format a Date (or ISO string) in a given IANA timezone for display.
function formatInTz(date, tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).format(date instanceof Date ? date : new Date(date));
  } catch (_) {
    return date ? new Date(date).toISOString() : '';
  }
}

// Slugify for Content-Disposition filename (ASCII-safe, ≤40 chars).
function slugify(str) {
  return (str || 'customer')
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'customer';
}

/**
 * GET /api/export/:shopDomain/customer/:profileId
 *
 * Streams a two-sheet .xlsx:
 *   Sheet 1 "Customer" — profile metadata (Field | Value)
 *   Sheet 2 "Activity" — one row per StorefrontEvent, last 90 days, ≤50 000
 *
 * Auth: requireAuth + requireStoreOwner (shopDomain-scoped, IDOR-protected).
 * NEVER includes full session ids or push tokens in the output.
 */
router.get('/:shopDomain/customer/:profileId', requireAuth, requireStoreOwner, async (req, res) => {
  const shop = req.params.shopDomain.trim().toLowerCase();
  const rawId = req.params.profileId;

  if (!/^[0-9a-f]{24}$/i.test(rawId)) {
    return res.status(400).json({ error: 'Invalid profile id' });
  }

  let ExcelJS;
  try {
    ExcelJS = require('exceljs');
  } catch (_) {
    return res.status(500).json({ error: 'Export library not available' });
  }

  try {
    // 1. Load profile
    const profile = await Profile.findOne({ _id: rawId, shopDomain: shop }).lean();
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // 2. Store timezone comes from req.store (set by requireStoreOwner).
    const tz = (req.store && req.store.timezone) || 'Asia/Kolkata';

    // 3. Build session identity set for StorefrontEvent query.
    const ids = profile.identifiers || {};
    const customerId = ids.customerId || null;
    const allSessions = [...new Set([
      ...(ids.sessionIds || []),
      ...(ids.cartTokens || []),
    ])];

    const seOrClauses = [];
    if (customerId) seOrClauses.push({ customerId });
    if (allSessions.length) seOrClauses.push({ sessionId: { $in: allSessions } });

    // 4. Fetch events: last 90 days, oldest-first, cap at XLSX_LIMIT+1 to detect overflow.
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const rawEvents = seOrClauses.length
      ? await StorefrontEvent
          .find({ shopDomain: shop, $or: seOrClauses, ts: { $gte: ninetyDaysAgo } })
          .sort({ ts: 1 })
          .limit(XLSX_LIMIT + 1)
          .lean()
      : [];

    const capped = rawEvents.length > XLSX_LIMIT;
    const events = capped ? rawEvents.slice(-XLSX_LIMIT) : rawEvents;

    // 5. Derive summary statistics for the Customer sheet.
    const pageViews  = events.filter(e => e.type === 'page_view').length;
    const prodViews  = events.filter(e => e.type === 'product_view').length;
    const atcCount   = events.filter(e => e.type === 'add_to_cart').length;
    const checkouts  = events.filter(e => e.type === 'reached_checkout').length;
    const searches   = events.filter(e => e.type === 'search').length;

    const dwellEvents = events.filter(e => e.type === 'page_exit' && e.meta && e.meta.dwellSeconds != null);
    const avgDwell = dwellEvents.length
      ? Math.round(dwellEvents.reduce((s, e) => s + e.meta.dwellSeconds, 0) / dwellEvents.length)
      : null;

    const productCount = {};
    for (const e of events) {
      if (e.type === 'product_view' && e.meta && e.meta.productTitle) {
        productCount[e.meta.productTitle] = (productCount[e.meta.productTitle] || 0) + 1;
      }
    }
    const top5 = Object.entries(productCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t, c]) => `${t} (×${c})`)
      .join(', ');

    // 6. Profile field values for the Customer sheet.
    const emails = (ids.emails || []).filter(Boolean).join(', ');
    const phones = (ids.phones || []).filter(Boolean).join(', ');
    const stage  = profile.stage || '';
    const orders = profile.orders?.count ?? '';
    const ltv    = profile.orders?.ltv != null ? Number(profile.orders.ltv).toFixed(2) : '';
    const pushOk = profile.channels?.push?.subscribed ? 'Yes' : 'No';
    const emailStatus = profile.suppressed
      ? 'Unsubscribed'
      : (profile.channels?.email?.address ? 'Subscribed' : '');
    const firstSeen = profile.createdAt  ? formatInTz(profile.createdAt, tz)  : '';
    const lastSeen  = profile.lastSeenAt ? formatInTz(profile.lastSeenAt, tz) : '';
    const reportAt  = formatInTz(new Date(), tz);

    const displayName = emails || phones || (customerId ? `Customer #${customerId}` : 'Anonymous');
    const slug = slugify(
      (emails.split(',')[0] || '').trim() ||
      (phones.split(',')[0] || '').trim() ||
      customerId || 'customer'
    );
    const today = new Date().toISOString().slice(0, 10);

    // 7. Build workbook in memory then send as a single buffer.
    //    writeBuffer() is reliable across all Node.js HTTP environments;
    //    streaming WorkbookWriter can leave the response stream open in
    //    test environments and with some proxy configurations.
    const workbook = new ExcelJS.Workbook();

    // ── Sheet 1: Customer ─────────────────────────────────────────────────
    const custSheet = workbook.addWorksheet('Customer');
    custSheet.columns = [
      { header: 'Field', key: 'f', width: 32 },
      { header: 'Value', key: 'v', width: 52 },
    ];
    custSheet.getRow(1).font = { bold: true };

    const customerRows = [
      ['Name',                          safeStr(displayName)],
      ['Email(s)',                       safeStr(emails)],
      ['Phone / WhatsApp number(s)',     safeStr(phones)],
      ['Shopify customer ID',            safeStr(customerId || '')],
      ['Customer stage',                 safeStr(stage)],
      ['Total orders',                   orders !== '' ? orders : ''],
      ['Lifetime value',                 ltv !== '' ? ltv : ''],
      ['Push subscribed',                safeStr(pushOk)],
      ['Email status',                   safeStr(emailStatus)],
      ['First seen',                     safeStr(firstSeen)],
      ['Last seen',                      safeStr(lastSeen)],
      ['Report generated',               safeStr(reportAt)],
      ['Data range',                     'Last 90 days — older activity is not stored'],
      ['Total events',                   events.length],
      ['Pages viewed',                   pageViews],
      ['Products viewed',                prodViews],
      ['Added to cart',                  atcCount],
      ['Reached checkout',               checkouts],
      ['Searches',                       searches],
      ['Average time on page (seconds)', avgDwell !== null ? avgDwell : ''],
      ['Top 5 viewed products',          safeStr(top5)],
    ];
    if (capped) {
      customerRows.push(['Note', `Showing the most recent ${XLSX_LIMIT.toLocaleString()} events`]);
    }
    for (const [f, v] of customerRows) {
      custSheet.addRow({
        f: safeStr(String(f)),
        v: typeof v === 'number' ? v : safeStr(String(v)),
      });
    }

    // ── Sheet 2: Activity ─────────────────────────────────────────────────
    const actSheet = workbook.addWorksheet('Activity');
    actSheet.columns = [
      { header: 'Date & time',         key: 'dt',        width: 22 },
      { header: 'Event',               key: 'event',     width: 26 },
      { header: 'Page type',           key: 'pageType',  width: 16 },
      { header: 'Page path',           key: 'path',      width: 32 },
      { header: 'Page title',          key: 'title',     width: 30 },
      { header: 'Product',             key: 'product',   width: 28 },
      { header: 'Price',               key: 'price',     width: 12 },
      { header: 'Collection',          key: 'coll',      width: 20 },
      { header: 'Search query',        key: 'query',     width: 20 },
      { header: 'Cart value',          key: 'cartVal',   width: 12 },
      { header: 'Items in cart',       key: 'cartItems', width: 14 },
      { header: 'Time on page (sec)',  key: 'dwell',     width: 18 },
      { header: 'Scroll depth (%)',    key: 'scroll',    width: 16 },
      { header: 'Referrer',            key: 'referrer',  width: 32 },
      { header: 'Session',             key: 'session',   width: 12 },
    ];
    actSheet.getRow(1).font = { bold: true };
    actSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    actSheet.autoFilter = { from: 'A1', to: 'O1' };

    for (const e of events) {
      const m = e.meta || {};
      const collLabel = m.handle || (m.collectionId ? String(m.collectionId) : '');

      actSheet.addRow({
        dt:        safeStr(formatInTz(e.ts, tz)),
        event:     safeStr(EVENT_LABELS[e.type] || e.type),
        pageType:  safeStr(e.pageType || m.pageType || ''),
        path:      safeStr(e.path || ''),
        title:     safeStr(m.title || ''),
        product:   safeStr(m.productTitle || ''),
        price:     m.productPrice != null ? m.productPrice : (m.price != null ? m.price : ''),
        coll:      safeStr(collLabel),
        query:     safeStr(m.query || ''),
        cartVal:   m.cartValue  != null ? m.cartValue  : '',
        cartItems: m.itemCount  != null ? m.itemCount  : '',
        dwell:     m.dwellSeconds != null ? m.dwellSeconds : '',
        scroll:    m.scrollDepth  != null ? m.scrollDepth  : '',
        referrer:  safeStr(m.referrer || ''),
        // Only first 8 chars of sessionId — enough to group rows without
        // exposing the full stable UUID that ccf-push.js persists client-side.
        session:   safeStr((e.sessionId || '').slice(0, 8)),
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();

    // 8. Send response.
    const filename = `customer-activity-${slug}-${today}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(buffer);
  } catch (err) {
    console.error('[export] customer export error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Export failed' });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ALL-CUSTOMERS EXPORT
// ─────────────────────────────────────────────────────────────────────────────

const CUSTOMER_EXPORT_LIMIT = 10000;
const ACTIVITY_ROW_CAP      = 200000;
const ACTIVITY_TIMEOUT_MS   = 15000;

// Columns for the Customers sheet.  One per exported profile row.
const CUST_COLS = [
  { header: 'Customer',               key: 'customer',     width: 32 },
  { header: 'Email(s)',               key: 'emails',        width: 30 },
  { header: 'Phone(s)',               key: 'phones',        width: 20 },
  { header: 'WhatsApp number',        key: 'waPhone',       width: 20 },
  { header: 'Shopify customer ID',    key: 'customerId',    width: 22 },
  { header: 'Stage',                  key: 'stage',         width: 14 },
  { header: 'Push subscribed',        key: 'push',          width: 16 },
  { header: 'Email address',          key: 'emailAddr',     width: 28 },
  { header: 'Email source',           key: 'emailSrc',      width: 16 },
  { header: 'Email captured at',      key: 'emailCapAt',    width: 22 },
  { header: 'WhatsApp consent',       key: 'waConsent',     width: 18 },
  { header: 'WhatsApp opted out',     key: 'waOptOut',      width: 18 },
  { header: 'Unsubscribed',           key: 'suppressed',    width: 14 },
  { header: 'Orders',                 key: 'orders',        width: 10 },
  { header: 'Total spent',            key: 'ltv',           width: 14 },
  { header: 'Last order',             key: 'lastOrder',     width: 22 },
  { header: 'COD orders',             key: 'codOrders',     width: 12 },
  { header: 'Prepaid orders',         key: 'prepaidOrders', width: 14 },
  { header: 'First seen',             key: 'firstSeen',     width: 22 },
  { header: 'Last seen',              key: 'lastSeen',      width: 22 },
  { header: 'Days since last seen',   key: 'daysSince',     width: 20 },
  { header: 'Messages sent (last 20 recorded)', key: 'msgCount', width: 28 },
  { header: 'Last message channel',   key: 'lastMsgCh',     width: 22 },
  { header: 'Last message date',      key: 'lastMsgDate',   width: 22 },
  { header: 'Last message outcome',   key: 'lastMsgOut',    width: 22 },
  { header: 'Top interests',          key: 'interests',     width: 36 },
  { header: 'Pages viewed (30d)',     key: 'pages30',       width: 18 },
  { header: 'Products viewed (30d)',  key: 'prods30',       width: 20 },
  { header: 'Added to cart (30d)',    key: 'atc30',         width: 18 },
  { header: 'Reached checkout (30d)', key: 'chk30',         width: 22 },
  { header: 'Searches (30d)',         key: 'srch30',        width: 16 },
  { header: 'Last visit',            key: 'lastVisit',     width: 22 },
];

const ACTIVITY_COLS = [
  { header: 'Customer',              key: 'customer',   width: 32 },
  { header: 'Date & time',          key: 'dt',         width: 22 },
  { header: 'Event',                key: 'event',      width: 26 },
  { header: 'Page type',            key: 'pageType',   width: 16 },
  { header: 'Page path',            key: 'path',       width: 32 },
  { header: 'Page title',           key: 'title',      width: 30 },
  { header: 'Product',              key: 'product',    width: 28 },
  { header: 'Price',                key: 'price',      width: 12 },
  { header: 'Collection',           key: 'coll',       width: 20 },
  { header: 'Search query',         key: 'query',      width: 20 },
  { header: 'Cart value',           key: 'cartVal',    width: 12 },
  { header: 'Items in cart',        key: 'cartItems',  width: 14 },
  { header: 'Time on page (sec)',   key: 'dwell',      width: 18 },
  { header: 'Scroll depth (%)',     key: 'scroll',     width: 16 },
  { header: 'Referrer',             key: 'referrer',   width: 32 },
  { header: 'Session',              key: 'session',    width: 12 },
];

// Human-readable description of active filters (for the Filters sheet).
function describeFilters(params) {
  const lines = [];
  if (params.segment && params.segment !== 'everyone') lines.push(`Segment: ${params.segment}`);
  if (params.type && params.type !== 'all') lines.push(`Customer type: ${params.type}`);
  if (params.reachPush === 'true') lines.push('Must have push subscription');
  if (params.reachEmail === 'true') lines.push('Must have email address');
  if (params.reachPhone === 'true') lines.push('Must have phone number');
  if (params.search) lines.push(`Search: "${params.search}"`);
  if (params.lastSeen && params.lastSeen !== 'any') {
    if (params.lastSeen === 'custom') {
      lines.push(`Last seen: ${params.lastSeenFrom || '…'} to ${params.lastSeenTo || '…'}`);
    } else {
      lines.push(`Last seen: ${params.lastSeen}`);
    }
  }
  if (params.firstSeen && params.firstSeen !== 'any') lines.push(`First seen: ${params.firstSeen}`);
  if (params.ordersMin || params.ordersMax) {
    lines.push(`Orders: ${params.ordersMin || '0'} – ${params.ordersMax || '∞'}`);
  }
  if (params.spentMin || params.spentMax) {
    lines.push(`Spent (₹): ${params.spentMin || '0'} – ${params.spentMax || '∞'}`);
  }
  if (params.payment && params.payment !== 'any') lines.push(`Payment type: ${params.payment}`);
  if (params.lastOrder && params.lastOrder !== 'any') lines.push(`Last order: within ${params.lastOrder}`);
  if (params.messaged && params.messaged !== 'any') lines.push(`Messages: ${params.messaged}`);
  if (params.emailStatus && params.emailStatus !== 'any') lines.push(`Email status: ${params.emailStatus}`);
  return lines.length ? lines.join('\n') : 'None (all customers)';
}

/**
 * GET /api/export/:shopDomain/customers/count
 * Returns { count, limit, overLimit } for the current filter params.
 * Never returns PII.
 */
router.get('/:shopDomain/customers/count', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const tz = (req.store && req.store.timezone) || 'Asia/Kolkata';

    const result = buildCustomerFilterQuery(shop, req.query, tz);
    if (result.error) return res.status(400).json({ error: result.error });

    const count = await Profile.countDocuments(result.query);
    return res.json({ count, limit: CUSTOMER_EXPORT_LIMIT, overLimit: count > CUSTOMER_EXPORT_LIMIT });
  } catch (err) {
    console.error('[export] customers/count error:', err.message);
    return res.status(500).json({ error: 'Count failed' });
  }
});

/**
 * GET /api/export/:shopDomain/customers
 * Returns a two- or three-sheet .xlsx:
 *   "Customers" — one row per profile, all available fields + 30-day event counts
 *   "Activity"  — (optional, ?includeActivity=true) all events for matched profiles
 *   "Filters"   — the filters applied and data-range notes
 */
router.get('/:shopDomain/customers', requireAuth, requireStoreOwner, async (req, res) => {
  const shop = req.params.shopDomain.trim().toLowerCase();
  const tz   = (req.store && req.store.timezone) || 'Asia/Kolkata';

  const result = buildCustomerFilterQuery(shop, req.query, tz);
  if (result.error) return res.status(400).json({ error: result.error });
  const query = result.query;

  const includeActivity = req.query.includeActivity === 'true';
  let activityDays = parseInt(req.query.activityDays, 10);
  if (![7, 30, 90].includes(activityDays)) activityDays = 30;

  let ExcelJS;
  try { ExcelJS = require('exceljs'); }
  catch (_) { return res.status(500).json({ error: 'Export library not available' }); }

  try {
    // 1. Count — enforce caps before fetching
    const count = await Profile.countDocuments(query);
    if (count === 0) {
      return res.status(422).json({ error: 'No customers match. Loosen a filter to include more.' });
    }
    if (count > CUSTOMER_EXPORT_LIMIT) {
      return res.status(422).json({
        error: `Export is limited to ${CUSTOMER_EXPORT_LIMIT.toLocaleString()} customers. Narrow your filters first.`,
      });
    }

    // 2. Fetch profiles (lean, no push tokens / session ids / cart tokens in projection)
    const profiles = await Profile.find(query)
      .sort({ lastSeenAt: -1 })
      .select([
        'identifiers.customerId', 'identifiers.emails', 'identifiers.phones',
        'channels', 'stage', 'orders', 'messages', 'interests',
        'suppressed', 'lastSeenAt', 'createdAt',
      ].join(' '))
      .lean();

    // 3. 30-day event counts via ONE aggregation — no per-profile queries
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const orClauses = [];
    const cidSet = new Set(profiles.map(p => p.identifiers?.customerId).filter(Boolean));
    const sidSet = new Set(profiles.flatMap(p => [
      ...(p.identifiers?.sessionIds || []),
      ...(p.identifiers?.cartTokens || []),
    ]));
    if (cidSet.size) orClauses.push({ customerId: { $in: [...cidSet] } });
    if (sidSet.size) orClauses.push({ sessionId: { $in: [...sidSet] } });

    // Map: customerId → counts, and sessionId → customerId for fallback attribution
    const cidCounts = {};    // customerId → { pages, prods, atc, chk, srch, lastVisit }
    const sidCounts = {};    // sessionId → same structure (for profiles without customerId)
    const sidToCid  = {};    // sessionId → customerId (from events)

    if (orClauses.length) {
      const aggResult = await StorefrontEvent.aggregate([
        { $match: { shopDomain: shop, $or: orClauses, ts: { $gte: thirtyDaysAgo } } },
        { $group: {
            _id: { cid: '$customerId', sid: '$sessionId' },
            pages: { $sum: { $cond: [{ $eq: ['$type', 'page_view'] }, 1, 0] } },
            prods: { $sum: { $cond: [{ $eq: ['$type', 'product_view'] }, 1, 0] } },
            atc:   { $sum: { $cond: [{ $eq: ['$type', 'add_to_cart'] }, 1, 0] } },
            chk:   { $sum: { $cond: [{ $eq: ['$type', 'reached_checkout'] }, 1, 0] } },
            srch:  { $sum: { $cond: [{ $eq: ['$type', 'search'] }, 1, 0] } },
            lastVisit: { $max: '$ts' },
        }},
      ]);

      for (const row of aggResult) {
        const { cid, sid } = row._id;
        const bucket = {
          pages: row.pages, prods: row.prods, atc: row.atc,
          chk: row.chk, srch: row.srch, lastVisit: row.lastVisit,
        };
        if (cid) {
          if (!cidCounts[cid]) {
            cidCounts[cid] = { pages: 0, prods: 0, atc: 0, chk: 0, srch: 0, lastVisit: null };
          }
          cidCounts[cid].pages += bucket.pages;
          cidCounts[cid].prods += bucket.prods;
          cidCounts[cid].atc   += bucket.atc;
          cidCounts[cid].chk   += bucket.chk;
          cidCounts[cid].srch  += bucket.srch;
          if (!cidCounts[cid].lastVisit || (bucket.lastVisit && bucket.lastVisit > cidCounts[cid].lastVisit)) {
            cidCounts[cid].lastVisit = bucket.lastVisit;
          }
          if (sid) sidToCid[sid] = cid;
        } else if (sid) {
          if (!sidCounts[sid]) {
            sidCounts[sid] = { pages: 0, prods: 0, atc: 0, chk: 0, srch: 0, lastVisit: null };
          }
          sidCounts[sid].pages += bucket.pages;
          sidCounts[sid].prods += bucket.prods;
          sidCounts[sid].atc   += bucket.atc;
          sidCounts[sid].chk   += bucket.chk;
          sidCounts[sid].srch  += bucket.srch;
          if (!sidCounts[sid].lastVisit || (bucket.lastVisit && bucket.lastVisit > sidCounts[sid].lastVisit)) {
            sidCounts[sid].lastVisit = bucket.lastVisit;
          }
        }
      }
    }

    // Look up event counts for a profile
    function getEventCounts(p) {
      const cid = p.identifiers?.customerId;
      if (cid && cidCounts[cid]) return cidCounts[cid];
      // Fallback: merge session-level counts for this profile's sessions
      const sids = [
        ...(p.identifiers?.sessionIds || []),
        ...(p.identifiers?.cartTokens || []),
      ];
      let merged = null;
      for (const sid of sids) {
        const s = sidCounts[sid];
        if (!s) continue;
        if (!merged) merged = { pages: 0, prods: 0, atc: 0, chk: 0, srch: 0, lastVisit: null };
        merged.pages += s.pages; merged.prods += s.prods;
        merged.atc   += s.atc;   merged.chk   += s.chk;
        merged.srch  += s.srch;
        if (!merged.lastVisit || (s.lastVisit && s.lastVisit > merged.lastVisit)) {
          merged.lastVisit = s.lastVisit;
        }
      }
      return merged || { pages: 0, prods: 0, atc: 0, chk: 0, srch: 0, lastVisit: null };
    }

    // Build display name for a profile (reused across sheets)
    function displayName(p) {
      const email = p.identifiers?.emails?.[0] || p.channels?.email?.address;
      const phone = p.identifiers?.phones?.[0];
      if (email) return email;
      if (phone) return phone;
      return `Anonymous · #${String(p._id).slice(-6)}`;
    }

    const now = new Date();

    // 4. Build workbook
    const workbook = new ExcelJS.Workbook();

    // ── Sheet: Customers ──────────────────────────────────────────────────────
    const custSheet = workbook.addWorksheet('Customers');
    custSheet.columns = CUST_COLS;
    custSheet.getRow(1).font = { bold: true };
    custSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    const lastColLetter = String.fromCharCode(64 + CUST_COLS.length);
    custSheet.autoFilter = { from: 'A1', to: `${lastColLetter}1` };

    for (const p of profiles) {
      const ids   = p.identifiers || {};
      const ch    = p.channels || {};
      const wa    = ch.whatsapp || {};
      const orders = p.orders || {};
      const msgs  = Array.isArray(p.messages) ? p.messages : [];
      const lastMsg = msgs.length ? msgs[msgs.length - 1] : null;
      const evts  = getEventCounts(p);
      const daysSince = p.lastSeenAt
        ? Math.floor((now - new Date(p.lastSeenAt)) / 86400000)
        : '';

      // Top 3 interests: entries of interests Map sorted by score desc, top 3 product IDs
      let topInterests = '';
      if (p.interests && typeof p.interests === 'object') {
        topInterests = Object.entries(p.interests)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([pid]) => pid)
          .join(', ');
      }

      custSheet.addRow({
        customer:     safeStr(displayName(p)),
        emails:       safeStr((ids.emails || []).join(', ')),
        phones:       safeStr((ids.phones || []).join(', ')),
        waPhone:      safeStr(wa.phone || ''),
        customerId:   safeStr(ids.customerId || ''),
        stage:        safeStr(p.stage || ''),
        push:         ch.push?.subscribed ? 'Yes' : 'No',
        emailAddr:    safeStr(ch.email?.address || ''),
        emailSrc:     safeStr(ch.email?.source || ''),
        emailCapAt:   ch.email?.capturedAt ? safeStr(formatInTz(ch.email.capturedAt, tz)) : '',
        waConsent:    wa.consentedAt ? safeStr(formatInTz(wa.consentedAt, tz)) : '',
        waOptOut:     wa.optedOutAt  ? safeStr(formatInTz(wa.optedOutAt,  tz)) : '',
        suppressed:   p.suppressed ? 'Yes' : 'No',
        orders:       typeof orders.count === 'number' ? orders.count : '',
        ltv:          typeof orders.ltv   === 'number' ? orders.ltv   : '',
        lastOrder:    orders.lastOrderAt  ? safeStr(formatInTz(orders.lastOrderAt, tz)) : '',
        codOrders:    typeof orders.codCount     === 'number' ? orders.codCount     : '',
        prepaidOrders:typeof orders.prepaidCount === 'number' ? orders.prepaidCount : '',
        firstSeen:    p.createdAt  ? safeStr(formatInTz(p.createdAt,  tz)) : '',
        lastSeen:     p.lastSeenAt ? safeStr(formatInTz(p.lastSeenAt, tz)) : '',
        daysSince:    daysSince !== '' ? daysSince : '',
        msgCount:     msgs.length,
        lastMsgCh:    safeStr(lastMsg?.channel || ''),
        lastMsgDate:  lastMsg?.sentAt ? safeStr(formatInTz(lastMsg.sentAt, tz)) : '',
        lastMsgOut:   safeStr(lastMsg?.outcome || ''),
        interests:    safeStr(topInterests),
        pages30:      evts.pages,
        prods30:      evts.prods,
        atc30:        evts.atc,
        chk30:        evts.chk,
        srch30:       evts.srch,
        lastVisit:    evts.lastVisit ? safeStr(formatInTz(evts.lastVisit, tz)) : '',
      });
    }

    // ── Sheet: Activity (optional) ────────────────────────────────────────────
    let activityRows = 0;
    let activityCapped = false;

    if (includeActivity) {
      const actAgo = new Date(Date.now() - activityDays * 86400000);

      // Build $or for activity query using same identity set
      const actOrClauses = [];
      if (cidSet.size) actOrClauses.push({ customerId: { $in: [...cidSet] } });
      if (sidSet.size) actOrClauses.push({ sessionId: { $in: [...sidSet] } });

      // 15-second time guard
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), ACTIVITY_TIMEOUT_MS)
      );

      let rawEvents;
      try {
        rawEvents = await Promise.race([
          actOrClauses.length
            ? StorefrontEvent.find({
                shopDomain: shop,
                $or: actOrClauses,
                ts: { $gte: actAgo },
              })
              .sort({ ts: 1 })
              .limit(ACTIVITY_ROW_CAP + 1)
              .lean()
            : Promise.resolve([]),
          timeout,
        ]);
      } catch (err) {
        if (err.message === 'TIMEOUT') {
          return res.status(422).json({
            error: 'Too many events. Choose a shorter activity period or narrow the filters.',
          });
        }
        throw err;
      }

      activityCapped = rawEvents.length > ACTIVITY_ROW_CAP;
      const events = activityCapped ? rawEvents.slice(-ACTIVITY_ROW_CAP) : rawEvents;
      activityRows = events.length;

      // Build profile lookup for display names in the Activity sheet
      const pidToName = {};
      for (const p of profiles) {
        pidToName[String(p._id)] = displayName(p);
        const cid = p.identifiers?.customerId;
        if (cid) pidToName[`cid:${cid}`] = displayName(p);
        for (const sid of [...(p.identifiers?.sessionIds || []), ...(p.identifiers?.cartTokens || [])]) {
          pidToName[`sid:${sid}`] = displayName(p);
        }
      }
      function eventCustomerName(e) {
        if (e.customerId && pidToName[`cid:${e.customerId}`]) return pidToName[`cid:${e.customerId}`];
        if (e.sessionId  && pidToName[`sid:${e.sessionId}`])  return pidToName[`sid:${e.sessionId}`];
        return '';
      }

      const actSheet = workbook.addWorksheet('Activity');
      actSheet.columns = ACTIVITY_COLS;
      actSheet.getRow(1).font = { bold: true };
      actSheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
      const actLastCol = String.fromCharCode(64 + ACTIVITY_COLS.length);
      actSheet.autoFilter = { from: 'A1', to: `${actLastCol}1` };

      for (const e of events) {
        const m = e.meta || {};
        actSheet.addRow({
          customer: safeStr(eventCustomerName(e)),
          dt:       safeStr(formatInTz(e.ts, tz)),
          event:    safeStr(EVENT_LABELS[e.type] || e.type),
          pageType: safeStr(e.pageType || m.pageType || ''),
          path:     safeStr(e.path || ''),
          title:    safeStr(m.title || ''),
          product:  safeStr(m.productTitle || ''),
          price:    m.productPrice != null ? m.productPrice : (m.price != null ? m.price : ''),
          coll:     safeStr(m.handle || (m.collectionId ? String(m.collectionId) : '')),
          query:    safeStr(m.query || ''),
          cartVal:  m.cartValue  != null ? m.cartValue  : '',
          cartItems:m.itemCount  != null ? m.itemCount  : '',
          dwell:    m.dwellSeconds != null ? m.dwellSeconds : '',
          scroll:   m.scrollDepth  != null ? m.scrollDepth  : '',
          referrer: safeStr(m.referrer || ''),
          session:  safeStr((e.sessionId || '').slice(0, 8)),
        });
      }
    }

    // ── Sheet: Filters ────────────────────────────────────────────────────────
    const filterSheet = workbook.addWorksheet('Filters');
    filterSheet.columns = [
      { header: 'Item',  key: 'item',  width: 32 },
      { header: 'Value', key: 'value', width: 60 },
    ];
    filterSheet.getRow(1).font = { bold: true };

    const filterRows = [
      ['Report generated',   safeStr(formatInTz(now, tz))],
      ['Customers exported', profiles.length],
      ['Filters applied',    safeStr(describeFilters(req.query))],
      ['Activity rows',      includeActivity ? activityRows : 'Not included'],
      ['Data notes',         [
        'Browsing activity is kept for 90 days.',
        'Messages sent shows the last 20 recorded.',
        'Event counts (pages, products, etc.) cover the last 30 days.',
        activityCapped
          ? `Activity sheet capped at ${ACTIVITY_ROW_CAP.toLocaleString()} rows (most recent kept).`
          : null,
      ].filter(Boolean).join(' ')],
    ];
    for (const [item, value] of filterRows) {
      filterSheet.addRow({
        item:  safeStr(String(item)),
        value: typeof value === 'number' ? value : safeStr(String(value ?? '')),
      });
    }

    // 5. Send buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const today  = now.toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="customers-${today}.xlsx"`);
    res.setHeader('Cache-Control', 'no-store');
    console.log(`[export] all-customers shop=${shop} rows=${profiles.length} activity=${activityRows}`);
    res.end(buffer);
  } catch (err) {
    console.error('[export] all-customers error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
  }
});

module.exports = router;
