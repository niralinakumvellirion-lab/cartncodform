const express = require('express');
const Store = require('../models/Store');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const CodOrder = require('../models/CodOrder');

const router = express.Router();

/**
 * GET /api/stores
 * List all connected stores (access tokens are never returned).
 */
router.get('/', async (req, res) => {
  try {
    const stores = await Store.find().sort({ installedAt: -1 }).select('-accessToken -__v').lean();

    // Attach lightweight counts for the dashboard overview.
    const withCounts = await Promise.all(
      stores.map(async (store) => {
        const [abandonedCount, codCount] = await Promise.all([
          AbandonedCustomer.countDocuments({ shopDomain: store.shopDomain, status: 'abandoned' }),
          CodOrder.countDocuments({ shopDomain: store.shopDomain }),
        ]);
        return { ...store, abandonedCount, codCount };
      })
    );

    return res.json(withCounts);
  } catch (err) {
    console.error('[stores] GET / error:', err.message);
    return res.status(500).json({ error: 'Failed to list stores' });
  }
});

/**
 * GET /api/stores/:shopDomain/customers
 * Abandoned customers for a store (newest first).
 */
router.get('/:shopDomain/customers', async (req, res) => {
  try {
    const shopDomain = req.params.shopDomain.trim().toLowerCase();
    const { status } = req.query;

    const filter = { shopDomain };
    if (status) filter.status = status;

    const customers = await AbandonedCustomer.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(customers);
  } catch (err) {
    console.error('[stores] GET /:shopDomain/customers error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch abandoned customers' });
  }
});

/**
 * GET /api/stores/:shopDomain/orders
 * COD orders for a store (newest first).
 */
router.get('/:shopDomain/orders', async (req, res) => {
  try {
    const shopDomain = req.params.shopDomain.trim().toLowerCase();
    const { status } = req.query;

    const filter = { shopDomain };
    if (status) filter.status = status;

    const orders = await CodOrder.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(orders);
  } catch (err) {
    console.error('[stores] GET /:shopDomain/orders error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch COD orders' });
  }
});

module.exports = router;
