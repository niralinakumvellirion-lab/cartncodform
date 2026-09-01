require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function main() {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');

  const { sendPushToCustomers } = require('../utils/pushNotification');

  const result = await sendPushToCustomers(
    'cartncod-form.myshopify.com',
    '🛒 Test Notification',
    'CartnCodForm push working on real store!'
  );

  console.log('Result:', JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch(console.error);
