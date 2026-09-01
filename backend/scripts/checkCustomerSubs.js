require('dotenv').config();

const dns = require('dns');
const { Resolver } = require('dns').promises;

async function ensureDns(uri) {
  if (!uri || !uri.startsWith('mongodb+srv://')) return;
  const host = uri.split('@')[1].split('/')[0];
  try {
    const r = new Resolver();
    r.setServers(['127.0.0.1']);
    await r.resolveSrv(`_mongodb._tcp.${host}`);
  } catch {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
}

async function main() {
  await ensureDns(process.env.MONGODB_URI);
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');

  const CustomerPushSubscription = require('../models/CustomerPushSubscription');

  const all = await CustomerPushSubscription.find({});
  console.log('Total customer subscriptions:', all.length);
  console.log('All records:');
  all.forEach((s, i) => {
    console.log(`${i+1}. shopDomain: ${s.shopDomain}, token: ${s.token.substring(0,20)}..., page: ${s.page}`);
  });

  await mongoose.disconnect();
}

main().catch(console.error);
