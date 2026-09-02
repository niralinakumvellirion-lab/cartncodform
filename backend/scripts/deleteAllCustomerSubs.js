require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function main() {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');

  const CustomerPushSubscription = require('../models/CustomerPushSubscription');
  const result = await CustomerPushSubscription.deleteMany({});
  console.log('Deleted all subscriptions:', result.deletedCount);

  await mongoose.disconnect();
  console.log('Done');
}

main().catch(console.error);
