require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Store = require('./models/Store');
  const store = await Store.findOne({
    shopDomain: 'cartncod-form.myshopify.com'
  }).select('accessToken onlineAccessToken onlineTokenExpiresAt').lean();

  console.log('=== TOKEN STATUS ===');
  console.log('offline token:', store.accessToken ? store.accessToken.substring(0,10)+'...' : 'MISSING');
  console.log('online token:', store.onlineAccessToken ? store.onlineAccessToken.substring(0,10)+'...' : 'MISSING');
  console.log('online expires:', store.onlineTokenExpiresAt);
  console.log('online expired?', store.onlineTokenExpiresAt ? new Date() > store.onlineTokenExpiresAt : 'no expiry set');

  // Test online token live against Shopify
  const token = store.onlineAccessToken || store.accessToken;
  console.log('\n=== LIVE TOKEN TEST ===');
  console.log('using token type:', token?.startsWith('shpua_') ? 'online' : 'offline');

  const res = await fetch(
    'https://cartncod-form.myshopify.com/admin/api/2025-01/shop.json',
    {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    }
  );
  console.log('HTTP status:', res.status);
  const data = await res.json();
  if (data.errors) {
    console.log('ERROR:', data.errors);
  } else {
    console.log('Shop name:', data.shop?.name);
    console.log('Token works: YES');
  }

  mongoose.disconnect();
});
