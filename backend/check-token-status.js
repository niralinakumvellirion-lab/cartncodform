require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Store = require('./models/Store');
  const stores = await Store.find()
    .select('shopDomain accessToken onlineAccessToken onlineTokenExpiresAt needsReauth')
    .lean();

  stores.forEach(s => {
    console.log('=== STORE:', s.shopDomain, '===');
    console.log('offline token:', s.accessToken
      ? s.accessToken.substring(0,12)+'...' : 'MISSING');
    console.log('offline token type:', s.accessToken
      ? (s.accessToken.startsWith('shpat_') ? 'shpat_ (offline)' : 'OTHER')
      : 'MISSING');
    console.log('online token:', s.onlineAccessToken
      ? s.onlineAccessToken.substring(0,12)+'...' : 'MISSING');
    console.log('online expires:', s.onlineTokenExpiresAt);
    console.log('online expired?', s.onlineTokenExpiresAt
      ? new Date() > new Date(s.onlineTokenExpiresAt) : 'N/A');
    console.log('needs reauth:', s.needsReauth);
    console.log('');
  });

  mongoose.disconnect();
});
