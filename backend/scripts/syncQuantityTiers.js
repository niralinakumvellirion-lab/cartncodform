#!/usr/bin/env node
'use strict';
/**
 * syncQuantityTiers.js — dry-run by default; pass --apply to execute.
 *
 * Usage:
 *   node backend/scripts/syncQuantityTiers.js                    # dry run
 *   node backend/scripts/syncQuantityTiers.js --apply            # live sync all shops
 *   node backend/scripts/syncQuantityTiers.js --apply --shop=x   # single shop
 *
 * Dry run: prints what would be synced without touching Shopify.
 * Apply:   calls syncTiers() for every shop that has quantityTiers.enabled=true.
 *
 * Requires MONGODB_URI env var.
 */

const apply = process.argv.includes('--apply');
const shopArg = (process.argv.find((a) => a.startsWith('--shop=')) || '').slice(7);

if (!process.env.MONGODB_URI) {
  console.error('[syncQuantityTiers] MONGODB_URI is required');
  process.exit(1);
}

const mongoose = require('mongoose');
const DiscountConfig = require('../models/DiscountConfig');
const { syncTiers } = require('../services/tierSync');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const query = shopArg
    ? { shopDomain: shopArg }
    : {};

  const configs = await DiscountConfig.find(query).lean();

  const relevant = configs.filter((c) => c.quantityTiers && (c.quantityTiers.enabled || c.quantityTiers.discountId));

  console.log(`[syncQuantityTiers] Found ${relevant.length} shop(s) with quantity-tier config.`);
  if (!apply) {
    console.log('[syncQuantityTiers] DRY RUN — pass --apply to execute.\n');
  }

  for (const cfg of relevant) {
    const shop = cfg.shopDomain;
    const qt = cfg.quantityTiers;
    console.log(`[${shop}] enabled=${qt.enabled} tiers=${(qt.tiers || []).length} discountId=${qt.discountId || '(none)'}`);

    if (!apply) continue;

    try {
      const result = await syncTiers(shop);
      if (result.synced) {
        console.log(`  ✓ synced — discountId: ${result.discountId || '(deactivated)'}`);
      } else {
        console.error(`  ✗ sync failed: ${result.error}`);
      }
    } catch (err) {
      console.error(`  ✗ exception: ${err.message}`);
    }
  }

  await mongoose.disconnect();
  console.log('\n[syncQuantityTiers] Done.');
})().catch((err) => {
  console.error('[syncQuantityTiers] Fatal:', err.message);
  process.exit(1);
});
