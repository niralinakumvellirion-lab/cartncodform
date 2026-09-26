/**
 * One-off, re-runnable: recompute ShopWeights for every shop right now, so
 * hourRates written before the store-timezone fix (bucketed by UTC hour) are
 * replaced with store-local buckets instead of waiting for each shop's nightly
 * run. computeWeights rebuilds the whole document from the last 90 days of
 * ScheduledJob rows and overwrites hourRates wholesale, so this is safe to run
 * any number of times.
 *
 * Usage (from backend/):
 *   node scripts/recomputeWeights.js --dry-run     # list shops only
 *   node scripts/recomputeWeights.js
 */
require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const ShopWeights = require('../models/ShopWeights');
  const { computeWeights } = require('../services/weightsService');

  const shops = await ShopWeights.find({}, 'shopDomain').lean();
  console.log(`[recomputeWeights] ${shops.length} shop(s) with stored weights, dryRun=${DRY_RUN}`);
  let ok = 0;
  for (const s of shops) {
    if (DRY_RUN) { console.log(`[recomputeWeights] would recompute ${s.shopDomain}`); continue; }
    try {
      await computeWeights(s.shopDomain);
      ok += 1;
    } catch (err) {
      console.error(`[recomputeWeights] ${s.shopDomain} failed:`, err.message);
    }
  }
  console.log(DRY_RUN ? '[recomputeWeights] dry run finished' : `[recomputeWeights] recomputed ${ok}/${shops.length}`);
  await mongoose.disconnect();
}

run().then(() => process.exit(0)).catch((e) => { console.error('[recomputeWeights] Error:', e.message); process.exit(1); });
