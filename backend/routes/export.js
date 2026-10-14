'use strict';

const express = require('express');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const Profile = require('../models/Profile');
const StorefrontEvent = require('../models/StorefrontEvent');

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

module.exports = router;
