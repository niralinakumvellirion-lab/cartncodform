const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const CodOrder = require('../models/CodOrder');
const Store = require('../models/Store');
const { sendNewCodOrderEmail } = require('../utils/email');
const { sendPushToStore } = require('../utils/pushNotification');

/**
 * Escape a string for safe interpolation into HTML text / attribute context.
 */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Verify Shopify's App Proxy request signature.
 * Shopify appends ?signature=<hmac>&<other signed params> to every
 * App Proxy request; the HMAC is SHA256 of the remaining params
 * sorted by key and concatenated as key=value (no separator),
 * keyed with the app's shared secret (SHOPIFY_API_SECRET).
 */
function verifyProxySignature(query) {
  try {
    const { signature, ...rest } = query;
    if (!signature) return false;
    if (!process.env.SHOPIFY_API_SECRET) {
      console.error('[proxy] SHOPIFY_API_SECRET not configured — cannot verify signature');
      return false;
    }

    const sorted = Object.keys(rest)
      .sort()
      .map(key => {
        const val = Array.isArray(rest[key]) ? rest[key].join(',') : rest[key];
        return `${key}=${val}`;
      })
      .join('');

    const hash = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
      .update(sorted)
      .digest('hex');

    return hash === signature;
  } catch (err) {
    console.error('[proxy] Signature verification error:', err.message);
    return false;
  }
}

// Serve Firebase SW via App Proxy
// URL: https://cartncod-form.myshopify.com/apps/cartncodform/sw.js
router.get('/sw.js', (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[proxy] Invalid or missing App Proxy signature on /sw.js — allowing for now (soft enforcement)');
    // return res.status(403).send('Invalid signature'); // uncomment once confirmed safe
  }

  const swPath = path.join(__dirname, '../public/cartncodform-sw.js');

  if (!fs.existsSync(swPath)) {
    return res.status(404).send('Service worker not found');
  }

  const swContent = fs.readFileSync(swPath, 'utf8');

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/apps/cartncodform/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  console.log('[proxy] Served SW, headers set for root scope');
  res.send(swContent);
});

// Health check
router.get('/health', (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[proxy] Invalid or missing App Proxy signature on /health — rejecting');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  res.json({ success: true, service: 'CartnCodForm Proxy' });
});

// ---------------------------------------------------------------------------
// popup-customizer: the storefront push prompt fetches its appearance config
// from here (same origin as the store, via the App Proxy).
//   https://{shop}/apps/cartncodform/popup-config?shop={shop}
// Signature is HARD-enforced, same as /cod-form.
// ---------------------------------------------------------------------------
router.get('/popup-config', async (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[proxy] Invalid or missing App Proxy signature on /popup-config — rejecting');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  try {
    const shop = String(req.query.shop || '').trim().toLowerCase();
    const store = await Store.findOne({ shopDomain: shop }).select('popup mobilePopup');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      popup: (store && store.popup) || {},
      mobilePopup: (store && store.mobilePopup) || {},
    });
  } catch (err) {
    console.error('[proxy] GET /popup-config error:', err.message);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).json({ popup: {} });
  }
});

// ---------------------------------------------------------------------------
// COD order form — served from the merchant's own storefront domain via the
// App Proxy:  https://{shop}/apps/cartncodform/cod-form?productName=..&price=..
// Customer-facing HTML, so the App Proxy signature is HARD-enforced here.
// ---------------------------------------------------------------------------
router.get('/cod-form', (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[proxy] Invalid or missing App Proxy signature on /cod-form — rejecting');
    return res.status(403).send('Invalid signature');
  }

  const shop = String(req.query.shop || '').trim().toLowerCase();
  const productName = String(req.query.productName || '');
  const price = String(req.query.price || '');
  const productId = String(req.query.productId || '');

  const priceNum = Number(price);
  const priceLabel = price && !Number.isNaN(priceNum) ? priceNum.toFixed(2) : '—';

  // Values handed to the inline script — JSON-encoded, with "<" neutralised so
  // the payload can never break out of the <script> element.
  const bootJson = JSON.stringify({ shop, productName, price, productId })
    .replace(/</g, '\\u003c');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Cash on Delivery Order</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f4f4f5;
    color: #18181b;
    padding: 24px 16px;
  }
  .wrap { max-width: 480px; margin: 0 auto; }
  .card {
    background: #fff;
    border: 1px solid #e4e4e7;
    border-radius: 14px;
    padding: 22px;
  }
  h1 { font-size: 19px; margin: 0 0 4px; }
  .shop { font-size: 12px; color: #a1a1aa; margin: 0 0 16px; }
  .summary {
    background: #f4f4f5;
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 18px;
  }
  .summary .p-name { font-weight: 600; font-size: 14px; }
  .summary .p-price { font-size: 14px; color: #52525b; margin-top: 3px; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 12px 0 4px; }
  label .req { color: #dc2626; }
  input, textarea {
    width: 100%;
    border: 1px solid #d4d4d8;
    border-radius: 8px;
    padding: 9px 11px;
    font-size: 14px;
    font-family: inherit;
  }
  input:focus, textarea:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 1px #4f46e5; }
  .row { display: flex; gap: 12px; }
  .row > div { flex: 1; }
  button {
    width: 100%;
    margin-top: 18px;
    border: 0;
    border-radius: 9px;
    background: #4f46e5;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    padding: 11px 16px;
  }
  button:disabled { opacity: .6; }
  .msg { margin-top: 14px; font-size: 13px; }
  .msg.err { color: #dc2626; }
  .ok {
    text-align: center;
    padding: 12px 0;
  }
  .ok .tick { font-size: 40px; }
  .ok h2 { font-size: 17px; margin: 10px 0 6px; }
  .ok p { font-size: 13px; color: #52525b; margin: 0; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card" id="card">
    <h1>Cash on Delivery Order</h1>
    <p class="shop">${escapeHtml(shop)}</p>

    <div class="summary">
      <div class="p-name">${escapeHtml(productName || 'Product')}</div>
      <div class="p-price">Price: <strong>${escapeHtml(priceLabel)}</strong></div>
    </div>

    <form id="cod-form" novalidate>
      <label>Full Name <span class="req">*</span></label>
      <input type="text" name="name" autocomplete="name" />

      <label>Phone Number <span class="req">*</span></label>
      <input type="tel" name="phone" autocomplete="tel" />

      <label for="ccf-email">Email (optional — for order updates)</label>
      <input type="email" id="ccf-email" name="email" placeholder="you@example.com" autocomplete="email" />

      <label>Full Address <span class="req">*</span></label>
      <textarea name="address" rows="3" autocomplete="street-address"></textarea>

      <div class="row">
        <div>
          <label>City</label>
          <input type="text" name="city" autocomplete="address-level2" />
        </div>
        <div>
          <label>Pincode</label>
          <input type="text" name="pincode" autocomplete="postal-code" inputmode="numeric" />
        </div>
      </div>

      <label>Quantity</label>
      <input type="number" name="quantity" min="1" value="1" inputmode="numeric" />

      <div class="msg err" id="err" style="display:none"></div>

      <button type="submit" id="submit-btn">Place COD Order</button>
    </form>
  </div>
</div>

<script>
(function () {
  var BOOT = ${bootJson};
  var form = document.getElementById('cod-form');
  var btn = document.getElementById('submit-btn');
  var errBox = document.getElementById('err');
  var card = document.getElementById('card');

  function showError(text) {
    errBox.textContent = text;
    errBox.style.display = 'block';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errBox.style.display = 'none';

    var data = new FormData(form);
    var name = (data.get('name') || '').trim();
    var phone = (data.get('phone') || '').trim();
    var address = (data.get('address') || '').trim();

    if (!name || !phone || !address) {
      showError('Name, phone and address are required.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Submitting…';

    fetch('/apps/cartncodform/cod-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shopDomain: BOOT.shop,
        name: name,
        phone: phone,
        address: address,
        email: (data.get('email') || '').trim(),
        city: (data.get('city') || '').trim(),
        pincode: (data.get('pincode') || '').trim(),
        quantity: Number(data.get('quantity')) || 1,
        productName: BOOT.productName,
        productPrice: Number(BOOT.price) || 0,
        productId: BOOT.productId
      })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (body) {
          return { ok: r.ok, body: body };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.body.success) {
          throw new Error((result.body && result.body.error) || 'Order failed. Please try again.');
        }
        card.innerHTML =
          '<div class="ok">' +
          '<div class="tick">✅</div>' +
          '<h2>Order placed!</h2>' +
          '<p>We&rsquo;ll confirm via WhatsApp/call soon.</p>' +
          '</div>';
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = 'Place COD Order';
        showError(err.message || 'Something went wrong. Please try again.');
      });
  });
})();
</script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(html);
});

// ---------------------------------------------------------------------------
// COD order submission — the /cod-form page POSTs here through the App Proxy.
// Public storefront route: no requireAuth, protected only by the App Proxy
// signature (hard-enforced).
// ---------------------------------------------------------------------------
router.post('/cod-order', async (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[proxy] Invalid or missing App Proxy signature on /cod-order — rejecting');
    return res.status(403).json({ success: false, error: 'Invalid signature' });
  }

  try {
    const shop = String(req.query.shop || req.body.shopDomain || '').trim().toLowerCase();
    const {
      name,
      phone,
      email,
      address,
      city,
      pincode,
      quantity,
      productName,
      productPrice,
    } = req.body;

    if (!shop || !name || !phone || !address) {
      return res
        .status(400)
        .json({ success: false, error: 'shop, name, phone and address are required' });
    }

    const cleanEmail = String(email || '').trim();

    const order = await CodOrder.create({
      shopDomain: shop,
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: cleanEmail,
      address: String(address).trim(),
      city: String(city || '').trim(),
      pincode: String(pincode || '').trim(),
      productName: String(productName || '').trim(),
      productPrice: Number(productPrice) || 0,
      quantity: Number(quantity) || 1,
      status: 'pending',
    });

    console.log(`[proxy] New COD order for ${order.shopDomain} — orderId: ${order._id}`);

    // Phase D: link the captured email to the phone-anchored profile.
    const { upsertProfile } = require('../services/profileService');
    upsertProfile(shop, { phone: String(phone).trim(), email: cleanEmail || null }, {
      ...(cleanEmail
        ? { 'channels.email.address': cleanEmail, 'channels.email.source': 'cod' }
        : {}),
      lastSeenAt: new Date(),
    }).catch((err) => console.error('[profile] cod-proxy upsert error:', err.message));

    // Notify the store owner — same fire-and-forget notifications as
    // routes/cod.js POST /order.
    const store = await Store.findOne({ shopDomain: order.shopDomain });
    const ownerEmail = (store && store.ownerEmail) || process.env.TEST_OWNER_EMAIL;
    if (ownerEmail) {
      sendNewCodOrderEmail(order, ownerEmail);
      console.log(`[proxy] New COD order email triggered for owner`);
    } else {
      console.log('[proxy] No owner email available — skipping notification');
    }

    sendPushToStore(
      order.shopDomain,
      '📦 New COD Order',
      `${order.name} placed a COD order for ${order.productName}`
    );

    return res.status(201).json({ success: true, orderId: order._id });
  } catch (err) {
    console.error('[proxy] POST /cod-order error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to save COD order' });
  }
});

module.exports = router;
