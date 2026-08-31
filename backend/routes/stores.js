const express = require('express');
const Store = require('../models/Store');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const CodOrder = require('../models/CodOrder');
const PushSubscription = require('../models/PushSubscription');

const router = express.Router();

/**
 * If ?email= is supplied, make sure this store belongs to that owner.
 * Returns true when access is allowed. Verification is soft: a store with no
 * ownerEmail on record is allowed through (optional for now).
 */
async function ownerAllowed(shopDomain, email) {
  if (!email) return true;
  const store = await Store.findOne({ shopDomain }).select('ownerEmail').lean();
  if (!store || !store.ownerEmail) return true;
  return store.ownerEmail === String(email).trim().toLowerCase();
}

/**
 * GET /api/stores
 * List connected stores (access tokens are never returned).
 * ?email=<owner> -> only stores owned by that email. No email -> all stores.
 */
router.get('/', async (req, res) => {
  try {
    const { email } = req.query;
    const query = email
      ? { ownerEmail: String(email).trim().toLowerCase() }
      : {};

    const stores = await Store.find(query)
      .sort({ installedAt: -1 })
      .select('-accessToken -__v')
      .lean();

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
    const { status, email } = req.query;

    if (!(await ownerAllowed(shopDomain, email))) {
      return res.status(403).json({ error: 'Not authorized for this store' });
    }

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
    const { status, email } = req.query;

    if (!(await ownerAllowed(shopDomain, email))) {
      return res.status(403).json({ error: 'Not authorized for this store' });
    }

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
 * Disconnect a store: remove the Store plus every record tied to that shop
 * (abandoned customers, COD orders, push subscriptions).
 */
router.delete('/:shopDomain', async (req, res) => {
  try {
    const shopDomain = req.params.shopDomain.trim().toLowerCase();

    const store = await Store.findOneAndDelete({ shopDomain });
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

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
