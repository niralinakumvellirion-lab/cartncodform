const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// Serve Firebase SW via App Proxy
// URL: https://cartncod-form.myshopify.com/apps/cartncodform/sw.js
router.get('/sw.js', (req, res) => {
  const swPath = path.join(__dirname, '../public/cartncodform-sw.js');

  if (!fs.existsSync(swPath)) {
    return res.status(404).send('Service worker not found');
  }

  const swContent = fs.readFileSync(swPath, 'utf8');

  // CRITICAL: Must return JS with these headers
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(swContent);

  console.log('[proxy] Served SW to:', req.headers['x-shopify-shop-domain'] || 'unknown');
});

// Health check
router.get('/health', (req, res) => {
  res.json({ success: true, service: 'CartnCodForm Proxy' });
});

module.exports = router;
