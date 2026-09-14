const express = require('express');
const router = express.Router();
const { requireAuth, requireStoreOwner } =
  require('../middleware/requireOwner');
const AutomationConfig = require('../models/AutomationConfig');

// GET /api/automation/:shopDomain
router.get('/:shopDomain', requireAuth, requireStoreOwner,
  async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    let config = await AutomationConfig.findOne({ shopDomain: shop });
    if (!config) {
      // Return defaults without saving
      config = new AutomationConfig({ shopDomain: shop });
    }
    return res.json(config);
  } catch (err) {
    console.error('[automation] GET error:', err.message);
    return res.status(500).json({ error: 'Failed to load config' });
  }
});

// PATCH /api/automation/:shopDomain
router.patch('/:shopDomain', requireAuth, requireStoreOwner,
  async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const config = await AutomationConfig.findOneAndUpdate(
      { shopDomain: shop },
      { $set: req.body },
      { new: true, upsert: true, runValidators: true }
    );
    return res.json(config);
  } catch (err) {
    console.error('[automation] PATCH error:', err.message);
    return res.status(500).json({ error: 'Failed to save config' });
  }
});

module.exports = router;
