require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;

  // Find AbandonedCustomers with non-empty cartItems
  const withItems = await db.collection('abandonedcustomers')
    .find({ 'cartItems.0': { $exists: true } })
    .sort({ _id: -1 })
    .limit(3)
    .toArray();

  console.log('=== ABANDONED CUSTOMERS WITH CART ITEMS ===');
  console.log('Count with items:', withItems.length);
  withItems.forEach(d => {
    console.log('sessionId:', d.sessionId);
    console.log('cartItems count:', d.cartItems?.length);
    console.log('first item:', JSON.stringify(d.cartItems?.[0]));
    console.log('productImageUrl:', d.productImageUrl || 'MISSING');
    console.log('---');
  });

  // Total count
  const total = await db.collection('abandonedcustomers').countDocuments();
  const withItemsCount = await db.collection('abandonedcustomers')
    .countDocuments({ 'cartItems.0': { $exists: true } });
  console.log('\nTotal docs:', total);
  console.log('With cartItems:', withItemsCount);
  console.log('Without cartItems:', total - withItemsCount);

  mongoose.disconnect();
});
