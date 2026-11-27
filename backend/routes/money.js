'use strict';

/**
 * "Money earned" card on the Dashboard.
 *   GET /api/money/:shopDomain?month=YYYY-MM   → services/moneySummary.js (current month when omitted)
 * requireAuth + requireStoreOwner, scoped by the verified shopDomain. Totals only — no shopper data.
 */

const express = require('express');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const { moneySummary } = require('../services/moneySummary');

const router = express.Router();

router.get('/:shopDomain', requireAuth, requireStoreOwner, async (req, res) => {
  const month = req.query.month == null ? '' : String(req.query.month);
  if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return res.status(400).json({ error: 'Use a month like 2026-11' });
  }
  try {
    return res.json(await moneySummary(req.store.shopDomain, { month }));
  } catch (err) {
    console.error('[money] summary error:', err.message);
    return res.status(500).json({ error: 'Could not load the money earned' });
  }
});

module.exports = router;
