require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function main() {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');

  const { sendPushToCustomers } = require('../utils/pushNotification');

  const testImageUrl = 'https://cdn.shopify.com/s/files/1/0831/4824/3181/files/WhatsApp-Image-2024-09-03-at-6.27.44-PM.jpg?v=1788175662';

  const result = await sendPushToCustomers(
    'cartncod-form.myshopify.com',
    '🛒 Test Notification',
    'CartnCodForm push working on real store!',
    'https://cartncod-form.myshopify.com',
    testImageUrl
  );

  console.log('Result:', JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch(console.error);
