require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Store = require('./models/Store');
  const store = await Store.findOne({
    shopDomain: 'cartncod-form.myshopify.com'
  }).select('accessToken onlineAccessToken accessTokenExpiresAt installedAt updatedAt').lean();

  console.log('installedAt:', store.installedAt);
  console.log('updatedAt:', store.updatedAt);
  console.log('accessToken prefix:', store.accessToken?.substring(0, 6));
  console.log('accessToken length:', store.accessToken?.length);
  console.log('accessTokenExpiresAt:', store.accessTokenExpiresAt);
  console.log('onlineAccessToken prefix:', store.onlineAccessToken?.substring(0, 6));

  // Test the exact token against Shopify
  const token = store.accessToken;
  const res = await fetch(
    'https://cartncod-form.myshopify.com/admin/api/2025-01/shop.json',
    { headers: { 'X-Shopify-Access-Token': token } }
  );
  console.log('\nAPI test status:', res.status);
  if (!res.ok) {
    const d = await res.json();
    console.log('Error:', d.errors);
  } else {
    const d = await res.json();
    console.log('Shop name:', d.shop?.name);
    console.log('TOKEN WORKS ✅');
  }

  mongoose.disconnect();
});
