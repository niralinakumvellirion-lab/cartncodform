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

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Service-Worker-Allowed', '/');
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
  res.json({ success: true, service: 'CartnCodForm Proxy' });
});

module.exports = router;
