require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Store = require('./models/Store');

  // First test which token actually works right now
  const store = await Store.findOne({
    shopDomain: 'cartncod-form.myshopify.com'
  }).lean();

  console.log('Testing all stored tokens...');

  const tokens = {
    'accessToken': store.accessToken,
    'onlineAccessToken': store.onlineAccessToken,
  };

  for (const [name, token] of Object.entries(tokens)) {
    if (!token) { console.log(name, ': MISSING'); continue; }
    const res = await fetch(
      'https://cartncod-form.myshopify.com/admin/api/2025-01/shop.json',
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    console.log(name, ':', res.status, res.ok ? '✅ WORKS' : '❌ FAILED');
  }

  mongoose.disconnect();
});
