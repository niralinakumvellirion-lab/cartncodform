require('dotenv').config();

const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');

  const Store = require('../models/Store');
  const stores = await Store.find({});
  console.log(`Found ${stores.length} stores`);

  const BACKEND_URL = process.env.BACKEND_URL ||
    'https://cartncodform-backend.onrender.com';
  const scriptUrl = `${BACKEND_URL}/cartncodform-push.js`;

  for (const store of stores) {
    console.log(`\nProcessing: ${store.shopDomain}`);

    try {
      // Check existing script tags
      const listRes = await fetch(
        `https://${store.shopDomain}/admin/api/2025-01/script_tags.json`,
        {
          headers: {
            'X-Shopify-Access-Token': store.accessToken,
            'Content-Type': 'application/json',
          }
        }
      );
      const listData = await listRes.json();
      const existing = listData.script_tags?.find(t => t.src === scriptUrl);

      if (existing) {
        console.log(`  ✅ Script tag already exists (id: ${existing.id})`);
        continue;
      }

      // Add script tag
      const res = await fetch(
        `https://${store.shopDomain}/admin/api/2025-01/script_tags.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': store.accessToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            script_tag: {
              event: 'onload',
              src: scriptUrl,
            }
          })
        }
      );
      const data = await res.json();

      if (data.script_tag) {
        console.log(`  ✅ Script tag added (id: ${data.script_tag.id})`);
      } else {
        console.log(`  ❌ Failed:`, JSON.stringify(data));
      }
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
    }
  }

  await mongoose.disconnect();
  console.log('\nDone');
}

main().catch(console.error);
