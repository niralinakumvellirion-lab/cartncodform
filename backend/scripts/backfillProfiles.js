/**
 * One-off backfill: build Profile records from the pre-Phase-A tables.
 *
 *   node backend/scripts/backfillProfiles.js      (from repo root)
 *   node scripts/backfillProfiles.js              (from backend/)
 *
 * Idempotent — re-running merges into the same profiles rather than
 * duplicating (upsertProfile resolves on identifiers every call).
 *
 * Order matters (weakest identity first, so later, stronger identifiers
 * merge the anonymous shells into real people):
 *   1. CustomerPushSubscription  -> sessionId (ccfSessionId) / cartToken / pushToken
 *   2. AbandonedCustomer         -> customerId / email / phone / cartToken (= sessionId field)
 *   3. CodOrder                  -> phone
 *   4. StorefrontEvent           -> grouped by sessionId, one call per unique value
 *
 * No PII in logs — counts only.
 */

require('dotenv').config();

const dns = require('dns');

// Atlas SRV lookups fail on some local networks — fall back to public resolvers.
async function ensureDns(uri) {
  if (!uri || !uri.startsWith('mongodb+srv://')) return;
  const host = uri.split('@')[1] ? uri.split('@')[1].split(/[/?]/)[0] : null;
  if (!host) return;
  try {
    await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch {
    console.log('[backfill] SRV lookup failed on system DNS — switching to 8.8.8.8, 1.1.1.1');
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('[backfill] MONGODB_URI not set');
    process.exit(1);
  }

  await ensureDns(uri);

  const mongoose = require('mongoose');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, family: 4 });
  console.log('[backfill] connected');

  const CustomerPushSubscription = require('../models/CustomerPushSubscription');
  const AbandonedCustomer = require('../models/AbandonedCustomer');
  const CodOrder = require('../models/CodOrder');
  const StorefrontEvent = require('../models/StorefrontEvent');
  const { upsertProfile } = require('../services/profileService');

  let upserts = 0;

  // ---- 1/4 — CustomerPushSubscription ----
  {
    const rows = await CustomerPushSubscription.find({}).lean();
    for (const r of rows) {
      const res = await upsertProfile(r.shopDomain, {
        sessionId: r.ccfSessionId || null,
        cartToken: r.cartToken || null,
        pushToken: r.token || null,
        customerId: r.customerId || null,
      }, {
        'channels.push.subscribed': true,
        'channels.push.lastToken': r.token || undefined,
        'channels.push.subscribedAt': r.createdAt || undefined,
        lastSeenAt: r.lastActivityAt || r.createdAt || undefined,
      });
      if (res) upserts++;
    }
    console.log(`[backfill] step 1/4 done, ${upserts} profiles upserted (subscriptions: ${rows.length})`);
  }

  // ---- 2/4 — AbandonedCustomer ----
  {
    const rows = await AbandonedCustomer.find({}).lean();
    for (const r of rows) {
      const res = await upsertProfile(r.shopDomain, {
        customerId: r.customerId || null,
        email: r.email || null,
        phone: r.phone || null,
        cartToken: r.sessionId || null,
      }, {
        lastSeenAt: r.createdAt || undefined,
      });
      if (res) upserts++;
    }
    console.log(`[backfill] step 2/4 done, ${upserts} profiles upserted (carts: ${rows.length})`);
  }

  // ---- 3/4 — CodOrder ----
  {
    const rows = await CodOrder.find({}).lean();
    for (const r of rows) {
      const res = await upsertProfile(r.shopDomain, {
        phone: r.phone || null,
      }, {
        lastSeenAt: r.createdAt || undefined,
      });
      if (res) upserts++;
    }
    console.log(`[backfill] step 3/4 done, ${upserts} profiles upserted (COD orders: ${rows.length})`);
  }

  // ---- 4/4 — StorefrontEvent, grouped by sessionId (a Shopify cart token) ----
  {
    const groups = await StorefrontEvent.aggregate([
      { $match: { sessionId: { $ne: null } } },
      {
        $group: {
          _id: { shopDomain: '$shopDomain', sessionId: '$sessionId' },
          customerId: { $first: '$customerId' },
          token: { $first: '$token' },
          lastTs: { $max: '$ts' },
        },
      },
    ]);
    for (const g of groups) {
      if (!g._id.sessionId) continue;
      const res = await upsertProfile(g._id.shopDomain, {
        // StorefrontEvent.sessionId holds a Shopify cart token, so it maps to
        // the cartToken identifier (see PHASE_A_AUDIT open questions).
        cartToken: g._id.sessionId,
        customerId: g.customerId || null,
        pushToken: g.token || null,
      }, {
        lastSeenAt: g.lastTs || undefined,
      });
      if (res) upserts++;
    }
    console.log(`[backfill] step 4/4 done, ${upserts} profiles upserted (event sessions: ${groups.length})`);
  }

  const Profile = require('../models/Profile');
  const total = await Profile.countDocuments({});
  console.log(`[backfill] complete — ${total} profiles now in the collection`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill] fatal:', err.message);
  process.exit(1);
});
