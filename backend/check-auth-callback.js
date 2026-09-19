require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Store = require('./models/Store');

  // Show ALL stores and their install times
  const stores = await Store.find()
    .select('shopDomain installedAt updatedAt accessToken')
    .sort({ installedAt: -1 })
    .lean();

  console.log('=== ALL STORES ===');
  stores.forEach(s => {
    console.log('shop:', s.shopDomain);
    console.log('installedAt:', s.installedAt);
    console.log('token prefix:', s.accessToken?.substring(0,10)+'...');
    console.log('---');
  });

  // Check if there's a newer store doc
  const recent = await Store.findOne({
    shopDomain: 'cartncod-form.myshopify.com'
  }).lean();
  console.log('\n=== FULL STORE DOC KEYS ===');
  console.log(Object.keys(recent));

  mongoose.disconnect();
});
