const express = require('express');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const Store = require('../models/Store');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const CodOrder = require('../models/CodOrder');
const PushSubscription = require('../models/PushSubscription');

const router = express.Router();

/**
 * GET /api/stores
 * List stores owned by the authenticated user (derived from the JWT,
 * not a client-supplied query param).
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const stores = await Store.find({ ownerEmail: req.userEmail })
      .sort({ installedAt: -1 })
      .select('-accessToken -__v')
      .lean();

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
 */
router.get('/:shopDomain/customers', requireAuth, requireStoreOwner, async (req, res) => {
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
 */
router.get('/:shopDomain/orders', requireAuth, requireStoreOwner, async (req, res) => {
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

/**
 * DELETE /api/stores/:shopDomain
 * Disconnect a store: remove the Store plus every record tied to that shop.
 */
router.delete('/:shopDomain', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shopDomain = req.params.shopDomain.trim().toLowerCase();

    await Store.findOneAndDelete({ shopDomain });

    const [abandoned, cod, push] = await Promise.all([
      AbandonedCustomer.deleteMany({ shopDomain }),
      CodOrder.deleteMany({ shopDomain }),
      PushSubscription.deleteMany({ shopDomain }),
    ]);

    console.log(
      `[stores] Disconnected store: ${shopDomain} ` +
        `(removed ${abandoned.deletedCount} abandoned, ${cod.deletedCount} COD, ` +
        `${push.deletedCount} push)`
    );

    return res.json({ success: true, message: 'Store disconnected' });
  } catch (err) {
    console.error('[stores] DELETE /:shopDomain error:', err.message);
    return res.status(500).json({ error: 'Failed to disconnect store' });
  }
});

module.exports = router;
