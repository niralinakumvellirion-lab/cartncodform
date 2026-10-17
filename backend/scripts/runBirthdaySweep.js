/**
 * runBirthdaySweep.js — dry-run the birthday sweep for one shop.
 *
 * Usage:
 *   node backend/scripts/runBirthdaySweep.js <shopDomain>
 *   node backend/scripts/runBirthdaySweep.js <shopDomain> --apply
 *
 * Dry run (default): prints profile IDs and counts, never writes.
 * --apply: schedules the birthday ScheduledJobs for real.
 *
 * Privacy: never prints birthday month/day, emails, or phones.
 */
require('dotenv').config();
const connectDB = require('../config/db');
const DiscountConfig = require('../models/DiscountConfig');
const Profile = require('../models/Profile');
const ScheduledJob = require('../models/ScheduledJob');
const Store = require('../models/Store');
const {
  resolveTz, zonedParts, zonedTimeToUtc, resolveQuietWindow, isQuietHour,
} = require('../utils/timezone');

function bdayRunAt(tz, quietStart, quietEnd) {
  const resolved = resolveTz(tz);
  const now = new Date();
  const cur = zonedParts(now, resolved);
  const TARGET = 9;
  let h = TARGET;
  if (isQuietHour(h, quietStart, quietEnd)) {
    for (let i = 1; i <= 24; i++) {
      const next = (TARGET + i) % 24;
      if (!isQuietHour(next, quietStart, quietEnd)) { h = next; break; }
    }
  }
  let runAt = zonedTimeToUtc(cur.y, cur.mo, cur.d, h, 0, resolved);
  if (runAt.getTime() <= now.getTime()) {
    const tomorrow = new Date(Date.UTC(cur.y, cur.mo - 1, cur.d + 1));
    runAt = zonedTimeToUtc(
      tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), h, 0, resolved
    );
  }
  return runAt;
}

async function main() {
  const args = process.argv.slice(2);
  const shopDomain = (args[0] || '').trim().toLowerCase();
  const apply = args.includes('--apply');

  if (!shopDomain) {
    console.error('Usage: node runBirthdaySweep.js <shopDomain> [--apply]');
    process.exit(1);
  }

  await connectDB();

  const store = await Store.findOne({ shopDomain }).select('timezone quietHours suspended').lean();
  if (!store) { console.error('Shop not found:', shopDomain); process.exit(1); }
  if (store.suspended) { console.log('Shop is suspended — sweep would be skipped.'); process.exit(0); }

  const config = await DiscountConfig.findOne({ shopDomain }).lean();
  if (!config || !config.birthdayDiscount || !config.birthdayDiscount.enabled) {
    console.log('Birthday discount not enabled for this shop — nothing to sweep.');
    process.exit(0);
  }

  const leadDays = config.birthdayDiscount.leadDays != null ? config.birthdayDiscount.leadDays : 3;
  const tz = store.timezone || 'Asia/Kolkata';
  const resolved = resolveTz(tz);
  const nowD = new Date();
  const cur = zonedParts(nowD, resolved);
  const currentYear = cur.y;

  const targetDate = new Date(Date.UTC(cur.y, cur.mo - 1, cur.d + leadDays));
  const targetMonth = targetDate.getUTCMonth() + 1;
  const targetDay = targetDate.getUTCDate();
  const isLeap = (currentYear % 4 === 0 && currentYear % 100 !== 0) || (currentYear % 400 === 0);
  const monthDayFilter = [{ 'birthday.month': targetMonth, 'birthday.day': targetDay }];
  if (targetMonth === 2 && targetDay === 28 && !isLeap) {
    monthDayFilter.push({ 'birthday.month': 2, 'birthday.day': 29 });
  }

  const profiles = await Profile.find({
    shopDomain,
    suppressed: { $ne: true },
    'birthday.lastOfferYear': { $ne: currentYear },
    $and: [
      { $or: monthDayFilter },
      { $or: [
        { 'channels.push.subscribed': true },
        { 'channels.email.address': { $exists: true, $ne: '' } },
      ]},
    ],
  }).select('_id channels').lean();

  console.log(`Shop: ${shopDomain}`);
  console.log(`Timezone: ${tz}`);
  console.log(`Today (store clock): ${cur.y}-${String(cur.mo).padStart(2,'0')}-${String(cur.d).padStart(2,'0')}`);
  console.log(`Lead days: ${leadDays} → target month=${targetMonth} day=${targetDay}`);
  console.log(`Year: ${currentYear} | Leap year: ${isLeap}`);
  console.log(`Profiles matched: ${profiles.length}`);

  if (!profiles.length) {
    console.log('No profiles would be scheduled.');
    process.exit(0);
  }

  const { start: quietStart, end: quietEnd } = resolveQuietWindow(store.quietHours);
  const runAt = bdayRunAt(tz, quietStart, quietEnd);

  console.log(`Scheduled run time (if applied): ${runAt.toISOString()}`);
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  console.log('');

  let scheduled = 0;
  let skipped = 0;

  for (const p of profiles) {
    const hasEmail = !!(p.channels && p.channels.email && p.channels.email.address);
    const hasPush = !!(p.channels && p.channels.push && p.channels.push.subscribed);
    const channel = hasEmail ? 'email' : (hasPush ? 'push' : null);
    if (!channel) { skipped++; continue; }

    console.log(`  Profile ${p._id} → channel=${channel}`);

    if (apply) {
      try {
        await ScheduledJob.create({
          shopDomain,
          profileId: p._id,
          signalType: 'birthday',
          channel,
          reason: 'birthday sweep (script)',
          payload: { title: '', body: '' },
          status: 'pending',
          runAt,
          origin: 'automated',
        });
        scheduled++;
      } catch (err) {
        if (err && err.code === 11000) {
          console.log(`    (already pending — skipped)`);
          skipped++;
        } else {
          console.error(`    ERROR: ${err.message}`);
          skipped++;
        }
      }
    } else {
      scheduled++;
    }
  }

  console.log('');
  console.log(`Would schedule: ${scheduled} | Skipped: ${skipped}`);
  if (!apply) console.log('(Dry run — pass --apply to write)');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
