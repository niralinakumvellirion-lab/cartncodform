require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Store = require('./models/Store');
  const store = await Store.findOne({
    shopDomain: 'cartncod-form.myshopify.com'
  }).lean();

  const shop = 'cartncod-form.myshopify.com';
  const API = '2025-01';

  console.log('=== TOKEN INFO ===');
  console.log('offline:', store.accessToken?.substring(0,12)+'...');
  console.log('online:', store.onlineAccessToken?.substring(0,12)+'...');
  console.log('online expires:', store.onlineTokenExpiresAt);
  console.log('online expired?', new Date() > new Date(store.onlineTokenExpiresAt));

  // Test offline token
  console.log('\n=== TESTING OFFLINE TOKEN ===');
  const r1 = await fetch(
    `https://${shop}/admin/api/${API}/shop.json`,
    { headers: { 'X-Shopify-Access-Token': store.accessToken } }
  );
  console.log('GET shop.json:', r1.status, r1.ok ? 'OK' : 'FAILED');
  if (!r1.ok) {
    const err = await r1.json();
    console.log('Error:', JSON.stringify(err));
  }

  // Test online token
  console.log('\n=== TESTING ONLINE TOKEN ===');
  const r2 = await fetch(
    `https://${shop}/admin/api/${API}/shop.json`,
    { headers: { 'X-Shopify-Access-Token': store.onlineAccessToken } }
  );
  console.log('GET shop.json:', r2.status, r2.ok ? 'OK' : 'FAILED');
  if (!r2.ok) {
    const err = await r2.json();
    console.log('Error:', JSON.stringify(err));
  }

  // Test webhook registration with offline token
  console.log('\n=== TESTING WEBHOOK LIST (offline) ===');
  const r3 = await fetch(
    `https://${shop}/admin/api/${API}/webhooks.json`,
    { headers: { 'X-Shopify-Access-Token': store.accessToken } }
  );
  console.log('GET webhooks.json:', r3.status, r3.ok ? 'OK' : 'FAILED');
  if (!r3.ok) {
    const d = await r3.json();
    console.log('Error:', JSON.stringify(d));
  } else {
    const d = await r3.json();
    console.log('Webhooks count:', d.webhooks?.length);
  }

  mongoose.disconnect();
});
