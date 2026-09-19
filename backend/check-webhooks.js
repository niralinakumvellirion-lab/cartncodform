require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Store = require('./models/Store');
  const store = await Store.findOne({
    shopDomain: 'cartncod-form.myshopify.com'
  }).select('accessToken onlineAccessToken').lean();

  const API_VERSION = '2025-01';
  const shop = 'cartncod-form.myshopify.com';
  const token = store.accessToken;

  console.log('Using token:', token ? token.substring(0,10)+'...' : 'MISSING');

  const res = await fetch(
    `https://${shop}/admin/api/${API_VERSION}/webhooks.json`,
    {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    }
  );

  const data = await res.json();
  console.log('\n=== REGISTERED WEBHOOKS ===');
  if (data.webhooks && data.webhooks.length) {
    data.webhooks.forEach(w => {
      console.log(w.topic, '->', w.address);
    });
  } else {
    console.log('NO WEBHOOKS REGISTERED');
    console.log('Raw response:', JSON.stringify(data));
  }

  mongoose.disconnect();
});
