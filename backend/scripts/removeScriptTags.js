require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function main() {
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');

  const Store = require('../models/Store');
  const stores = await Store.find({});

  const BACKEND_URL = 'https://cartncodform-backend.onrender.com';
  const scriptUrl = `${BACKEND_URL}/cartncodform-push.js`;

  for (const store of stores) {
    console.log(`\nProcessing: ${store.shopDomain}`);
    try {
      const listRes = await fetch(
        `https://${store.shopDomain}/admin/api/2025-01/script_tags.json`,
        { headers: { 'X-Shopify-Access-Token': store.accessToken } }
      );
      const listData = await listRes.json();
      const tags = listData.script_tags || [];

      for (const tag of tags) {
        if (tag.src === scriptUrl) {
          const delRes = await fetch(
            `https://${store.shopDomain}/admin/api/2025-01/script_tags/${tag.id}.json`,
            {
              method: 'DELETE',
              headers: { 'X-Shopify-Access-Token': store.accessToken }
            }
          );
          if (delRes.status === 200 || delRes.status === 204) {
            console.log(`  ✅ Script tag removed (id: ${tag.id})`);
          } else {
            console.log(`  ❌ Failed to remove (status: ${delRes.status})`);
          }
        }
      }

      if (!tags.find(t => t.src === scriptUrl)) {
        console.log('  No matching script tag found');
      }
    } catch(err) {
      console.log(`  ❌ Error: ${err.message}`);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone');
}

main().catch(console.error);
