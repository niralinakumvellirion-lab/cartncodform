require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Store = require('./models/Store');
  const store = await Store.findOne({
    shopDomain: 'cartncod-form.myshopify.com'
  }).select('accessToken onlineAccessToken onlineTokenExpiresAt').lean();

  const apiToken = store.onlineAccessToken || store.accessToken;
  const productId = '9561899499757';
  const shop = 'cartncod-form.myshopify.com';
  const API_VERSION = '2025-01';

  console.log('Using token:', apiToken.substring(0,10)+'...');
  console.log('Fetching product:', productId);

  const url = `https://${shop}/admin/api/${API_VERSION}/products/${productId}.json?fields=id,images`;
  console.log('URL:', url);

  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': apiToken,
      'Content-Type': 'application/json'
    }
  });

  console.log('HTTP status:', res.status);
  const data = await res.json();

  if (data.errors) {
    console.log('ERROR:', JSON.stringify(data.errors));
  } else {
    console.log('Product found:', !!data.product);
    console.log('Images count:', data.product?.images?.length);
    console.log('First image src:', data.product?.images?.[0]?.src || 'NONE');
  }

  mongoose.disconnect();
});
