require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function main() {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');

  const CustomerPushSubscription = require('../models/CustomerPushSubscription');

  const all = await CustomerPushSubscription.find({});
  console.log('Total tokens:', all.length);

  // Keep only latest token per shop
  // Delete all except the most recent one
  const shops = [...new Set(all.map(s => s.shopDomain))];

  for (const shop of shops) {
    const subs = await CustomerPushSubscription.find({ shopDomain: shop })
      .sort({ createdAt: -1 });

    if (subs.length > 1) {
      // Keep first (latest), delete rest
      const toDelete = subs.slice(1).map(s => s._id);
      await CustomerPushSubscription.deleteMany({ _id: { $in: toDelete } });
      console.log(`${shop}: kept 1, removed ${toDelete.length} duplicates`);
    } else {
      console.log(`${shop}: only 1 token, ok`);
    }
  }

  const remaining = await CustomerPushSubscription.find({});
  console.log('Remaining tokens:', remaining.length);

  await mongoose.disconnect();
  console.log('Done');
}

main().catch(console.error);
