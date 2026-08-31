const express = require('express');
const CodOrder = require('../models/CodOrder');
const Store = require('../models/Store');
const { sendNewCodOrderEmail } = require('../utils/email');
const { sendPushToStore } = require('../utils/pushNotification');

const router = express.Router();

/**
 * POST /api/cod/order
 * Public endpoint — the customer-facing COD form posts here.
 *
 * Body: { shopDomain, name, phone, address, city, pincode, productName, productPrice, quantity }
 */
router.post('/order', async (req, res) => {
  try {
    const {
      shopDomain,
      name,
      phone,
      address,
      city,
      pincode,
      productName,
      productPrice,
      quantity,
    } = req.body;

    if (!shopDomain || !name || !phone || !address) {
      return res
        .status(400)
        .json({ error: 'shopDomain, name, phone and address are required' });
    }

    const order = await CodOrder.create({
      shopDomain: shopDomain.trim().toLowerCase(),
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: (city || '').trim(),
      pincode: (pincode || '').trim(),
      productName: (productName || '').trim(),
      productPrice: Number(productPrice) || 0,
      quantity: Number(quantity) || 1,
      status: 'pending',
    });

    console.log(`[cod] New COD order for ${order.shopDomain} from ${order.name} (${order.phone})`);

    // Notify the store owner about the new COD order.
    const store = await Store.findOne({ shopDomain: order.shopDomain });
    const ownerEmail = (store && store.ownerEmail) || process.env.TEST_OWNER_EMAIL;
    if (ownerEmail) {
      sendNewCodOrderEmail(order, ownerEmail);
      console.log(`[cod] New COD order email triggered for owner: ${ownerEmail}`);
    } else {
      console.log('[cod] No owner email available (set TEST_OWNER_EMAIL) — skipping notification');
    }

    // Push-notify the store owner about the new COD order.
    sendPushToStore(
      order.shopDomain,
      '📦 New COD Order',
      `${order.name} placed a COD order for ${order.productName}`
    );

    return res.status(201).json({ success: true, order });
  } catch (err) {
    console.error('[cod] POST /order error:', err.message);
    return res.status(500).json({ error: 'Failed to save COD order' });
  }
});

/**
 * PATCH /api/cod/order/:id
 * Owner updates the status of a COD order (pending/confirmed/cancelled).
 */
router.patch('/order/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'confirmed', 'cancelled'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${allowed.join(', ')}` });
    }

    const order = await CodOrder.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: 'COD order not found' });
    }

    console.log(`[cod] Order ${order._id} status -> ${status}`);
    return res.json({ success: true, order });
  } catch (err) {
    console.error('[cod] PATCH /order/:id error:', err.message);
    return res.status(500).json({ error: 'Failed to update COD order' });
  }
});

module.exports = router;
