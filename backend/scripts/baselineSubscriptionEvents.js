'use strict';
/**
 * One-off baseline script: for every Store with plan='pro' that has NO
 * SubscriptionEvent yet, create one { eventType:'baseline', ... }.
 *
 * By default this is a DRY RUN — prints what would be created.
 * Pass --apply to write to the database.
 *
 * Usage:
 *   node scripts/baselineSubscriptionEvents.js          # dry run
 *   node scripts/baselineSubscriptionEvents.js --apply  # write
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Store = require('../models/Store');
const SubscriptionEvent = require('../models/SubscriptionEvent');

const APPLY = process.argv.includes('--apply');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const proStores = await Store.find({ plan: 'pro' }, { shopDomain: 1, planUpdatedAt: 1, isTest: 1 }).lean();

  // Find which pro stores already have at least one SubscriptionEvent.
  const domainsWithEvents = new Set(
    (
      await SubscriptionEvent.distinct('shopDomain', {
        shopDomain: { $in: proStores.map(s => s.shopDomain) },
      })
    )
  );

  const toBaseline = proStores.filter(s => !domainsWithEvents.has(s.shopDomain));

  console.log(`Pro stores total: ${proStores.length}`);
  console.log(`Already have events: ${domainsWithEvents.size}`);
  console.log(`Would baseline: ${toBaseline.length}`);
  console.log('');

  if (toBaseline.length === 0) {
    console.log('Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  if (!APPLY) {
    console.log('DRY RUN — domains that would be baselined:');
    toBaseline.forEach(s => console.log(' ', s.shopDomain));
    console.log('\nRe-run with --apply to write.');
    await mongoose.disconnect();
    return;
  }

  const now = new Date();
  const docs = toBaseline.map(s => ({
    shopDomain:  s.shopDomain,
    eventType:   'baseline',
    toPlan:      'pro',
    source:      'baseline',
    isTest:      s.isTest || false,
    approxSince: s.planUpdatedAt || null,
    occurredAt:  now,
  }));

  await SubscriptionEvent.insertMany(docs, { ordered: false });
  console.log(`Inserted ${docs.length} baseline event(s).`);
  docs.forEach(d => console.log(' ', d.shopDomain));

  await mongoose.disconnect();
}

run().catch(err => {
  // Never print secrets or env values.
  console.error('baselineSubscriptionEvents failed:', err.message);
  process.exit(1);
});
