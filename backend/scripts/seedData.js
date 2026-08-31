/**
 * Sample data seeder.
 *
 *   npm run seed        (from backend/)
 *
 * Connects with MONGODB_URI, wipes any previous demo data for the demo shop,
 * then creates 1 Store, 3 AbandonedCustomer docs (email / phone-only / anonymous)
 * and 3 CodOrder docs (pending / confirmed / cancelled). Disconnects when done.
 */
const dns = require('dns');
const { Resolver } = require('dns').promises;

async function ensureSrvResolvable(uri) {
  if (!uri || !uri.startsWith('mongodb+srv://')) return;
  const host = uri.split('@')[1].split('/')[0];
  const srvName = `_mongodb._tcp.${host}`;
  try {
    const resolver = new Resolver();
    resolver.setServers(['127.0.0.1']);
    await resolver.resolveSrv(srvName);
  } catch {
    console.log('Seed DNS: switching to 8.8.8.8, 1.1.1.1');
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
}

require('dotenv').config();

const mongoose = require('mongoose');
const Store = require('../models/Store');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const CodOrder = require('../models/CodOrder');

const SHOP = 'cartncodform-demo.myshopify.com';

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MongoDB connection error: MONGODB_URI is not set (add it to backend/.env)');
    process.exit(1);
  }

  await ensureSrvResolvable(process.env.MONGODB_URI);

  await mongoose.connect(uri);
  console.log('MongoDB connected');

  // Make the seed repeatable — clear previous demo docs for this shop only.
  const cleared = await Promise.all([
    Store.deleteMany({ shopDomain: SHOP }),
    AbandonedCustomer.deleteMany({ shopDomain: SHOP }),
    CodOrder.deleteMany({ shopDomain: SHOP }),
  ]);
  console.log(
    `Cleared previous demo data: ${cleared[0].deletedCount} store(s), ` +
      `${cleared[1].deletedCount} abandoned customer(s), ${cleared[2].deletedCount} COD order(s)`
  );

  // --- 1 Store ---
  const store = await Store.create({
    shopDomain: SHOP,
    accessToken: 'demo-access-token-not-real',
    installedAt: new Date(),
  });
  console.log(`Created Store: ${store.shopDomain} (_id=${store._id})`);

  // --- 3 AbandonedCustomer docs ---
  const customers = await AbandonedCustomer.create([
    {
      shopDomain: SHOP,
      email: 'jordan.buyer@example.com',
      cartItems: [{ title: 'Wireless Earbuds', quantity: 1, price: 59.99 }],
      cartValue: 59.99,
      sessionId: 'seed-session-1',
      status: 'abandoned',
    },
    {
      shopDomain: SHOP,
      phone: '+91 90000 11111',
      cartItems: [
        { title: 'Yoga Mat', quantity: 2, price: 25 },
        { title: 'Steel Water Bottle', quantity: 1, price: 15 },
      ],
      cartValue: 65,
      sessionId: 'seed-session-2',
      status: 'abandoned',
    },
    {
      shopDomain: SHOP,
      cartItems: [{ title: 'Phone Case', quantity: 1, price: 12.5 }],
      cartValue: 12.5,
      sessionId: 'seed-session-3',
      status: 'abandoned',
    },
  ]);
  customers.forEach((c) => {
    const who = c.email || c.phone || 'Anonymous';
    console.log(`Created AbandonedCustomer: ${who} — value ${c.cartValue} (_id=${c._id})`);
  });

  // --- 3 CodOrder docs (one per status) ---
  const orders = await CodOrder.create([
    {
      shopDomain: SHOP,
      name: 'Aarav Sharma',
      phone: '+91 98765 43210',
      address: '12 MG Road, Flat 4B',
      city: 'Pune',
      pincode: '411001',
      productName: 'Wireless Earbuds',
      productPrice: 59.99,
      quantity: 1,
      status: 'pending',
    },
    {
      shopDomain: SHOP,
      name: 'Meera Nair',
      phone: '+91 91234 56789',
      address: '88 Residency Lane',
      city: 'Kochi',
      pincode: '682001',
      productName: 'Yoga Mat',
      productPrice: 25,
      quantity: 2,
      status: 'confirmed',
    },
    {
      shopDomain: SHOP,
      name: 'Rohan Gupta',
      phone: '+91 99887 76655',
      address: '5 Park Street',
      city: 'Kolkata',
      pincode: '700016',
      productName: 'Phone Case',
      productPrice: 12.5,
      quantity: 1,
      status: 'cancelled',
    },
  ]);
  orders.forEach((o) => {
    console.log(`Created CodOrder: ${o.name} — ${o.productName} x${o.quantity} [${o.status}] (_id=${o._id})`);
  });

  await mongoose.disconnect();
  console.log('MongoDB disconnected. Seed complete.');
}

seed().catch(async (err) => {
  console.error('Seed failed:', err.message);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
