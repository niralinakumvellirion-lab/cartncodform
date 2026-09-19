require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;

  const docs = await db.collection('abandonedcustomers')
    .find({})
    .sort({ _id: -1 })
    .limit(5)
    .toArray();

  console.log('=== RECENT ABANDONED CUSTOMERS ===');
  docs.forEach(d => {
    console.log('sessionId:', d.sessionId);
    console.log('productImageUrl:', d.productImageUrl || 'MISSING');
    console.log('productTitle:', d.productTitle || 'MISSING');
    console.log('---');
  });

  mongoose.disconnect();
});
