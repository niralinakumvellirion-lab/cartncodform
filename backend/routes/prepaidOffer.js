const express = require('express');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const { PLANS, tierOf } = require('../utils/plans');
const { managedPricingUrl } = require('../utils/billing');
const { getSettings, saveSettings, sanitizeSettings, offerAllowed, prepaidStats } = require('../utils/prepaidOffer');

const router = express.Router();

async function payload(store) {
  const [settings, stats] = await Promise.all([getSettings(store.shopDomain), prepaidStats(store.shopDomain)]);
  return {
    settings,
    stats,
    allowed: offerAllowed(store),
    planName: PLANS[tierOf(store)].name,
    upgradeUrl: managedPricingUrl(store.shopDomain),
  };
}

/**
 * GET /api/prepaid-offer/:shopDomain
 * -> { settings, stats, allowed, planName, upgradeUrl }
 */
router.get('/:shopDomain', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    return res.json(await payload(req.store));
  } catch (err) {
    console.error('[prepaid] settings load error:', err.message);
    return res.status(500).json({ error: 'Could not load the prepaid offer' });
  }
});

/**
 * PUT /api/prepaid-offer/:shopDomain  body: the full settings form
 * Turning the offer on needs a plan that includes it (Starter and above).
 */
router.put('/:shopDomain', requireAuth, requireStoreOwner, async (req, res) => {
  const checked = sanitizeSettings(req.body);
  if (!checked.ok) return res.status(400).json({ error: checked.error });
  if (checked.settings.enabled && !offerAllowed(req.store)) {
    return res.status(402).json({
      error: 'The prepaid offer is included in the Starter plan and above.',
      code: 'PLAN_FEATURE',
    });
  }
  try {
    await saveSettings(req.store.shopDomain, checked.settings);
    return res.json(await payload(req.store));
  } catch (err) {
    console.error('[prepaid] settings save error:', err.message);
    return res.status(500).json({ error: 'Could not save the prepaid offer' });
  }
});

module.exports = router;
