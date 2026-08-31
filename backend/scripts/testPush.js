require('dotenv').config();

async function main() {
  // Step 1: DNS fix
  const dns = require('dns');
  const { Resolver } = require('dns').promises;
  const uri = process.env.MONGODB_URI || '';
  if (uri.startsWith('mongodb+srv://')) {
    const host = uri.split('@')[1].split('/')[0];
    try {
      const r = new Resolver();
      r.setServers(['127.0.0.1']);
      await r.resolveSrv(`_mongodb._tcp.${host}`);
    } catch {
      console.log('DNS: switching to 8.8.8.8');
      dns.setServers(['8.8.8.8', '1.1.1.1']);
    }
  }

  // Step 2: Connect MongoDB
  const mongoose = require('mongoose');
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    family: 4,
  });
  console.log('MongoDB connected ✅');

  // Step 3: Send push
  const { sendPushToStore } = require('../utils/pushNotification');
  console.log('Sending test push...');
  const result = await sendPushToStore(
    'cartncodform-demo.myshopify.com',
    'Test Push 🔔',
    'CartnCodForm push notification working!'
  );
  console.log('Result:', JSON.stringify(result, null, 2));

  await mongoose.disconnect();
  console.log('Done.');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
