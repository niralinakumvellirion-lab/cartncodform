const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
    console.warn('[proxy] Invalid or missing App Proxy signature on /health — allowing for now (soft enforcement)');
    // return res.status(403).json({ error: 'Invalid signature' }); // uncomment once confirmed safe
  }

  res.json({ success: true, service: 'CartnCodForm Proxy' });
});

module.exports = router;
