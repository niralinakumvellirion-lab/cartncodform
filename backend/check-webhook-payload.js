require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;

  // Check the most recent AbandonedCustomer in full
  const doc = await db.collection('abandonedcustomers')
    .findOne(
      { sessionId: 'hWNGkATYWT9L7HkYbODNAdcq' }
    );

  console.log('=== FULL ABANDONED CUSTOMER DOC ===');
  console.log('sessionId:', doc?.sessionId);
  console.log('cartItems:', JSON.stringify(doc?.cartItems, null, 2));
  console.log('productId:', doc?.productId);
  console.log('productImageUrl:', doc?.productImageUrl);
  console.log('lineItems:', JSON.stringify(doc?.lineItems, null, 2));
  console.log('All keys:', doc ? Object.keys(doc) : 'NOT FOUND');

  mongoose.disconnect();
});
