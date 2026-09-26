/**
 * One-off, re-runnable migration: clear popup colours that are still the OLD
 * schema defaults so those shops fall through to each style's own palette.
 *
 * Clears (sets to '') on BOTH `popup` and `mobilePopup`, only where the value
 * EXACTLY equals the old default:
 *   bgColor   === '#ffffff'
 *   textColor === '#111827'
 * Any other value (including other whites, other darks, any custom colour) is
 * left untouched.
 *
 * Optional (off by default): --include-accent also clears
 *   popup.accentColor / mobilePopup.accentColor === '#4f46e5'
 *   mobilePopup.ctaStyle === 'pill'   (the old mobile default)
 * so the new styles' own accents can apply for shops that never picked one.
 *
 * Idempotent: after one run nothing matches, so a second run changes 0
 * documents. Use --dry-run to only count matches.
 *
 * Usage (from backend/):
 *   node scripts/clearDefaultPopupColors.js --dry-run
 *   node scripts/clearDefaultPopupColors.js
 *   node scripts/clearDefaultPopupColors.js --include-accent
 */
require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');
const INCLUDE_ACCENT = process.argv.includes('--include-accent');

const TARGETS = [
  { path: 'popup.bgColor', old: '#ffffff' },
  { path: 'mobilePopup.bgColor', old: '#ffffff' },
  { path: 'popup.textColor', old: '#111827' },
  { path: 'mobilePopup.textColor', old: '#111827' },
];
if (INCLUDE_ACCENT) {
  TARGETS.push(
    { path: 'popup.accentColor', old: '#4f46e5' },
    { path: 'mobilePopup.accentColor', old: '#4f46e5' },
    { path: 'mobilePopup.ctaStyle', old: 'pill' },
  );
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Store = require('../models/Store');
  console.log(`[clearDefaultPopupColors] start dryRun=${DRY_RUN} includeAccent=${INCLUDE_ACCENT}`);

  let totalChanged = 0;
  for (const { path, old } of TARGETS) {
    const filter = { [path]: old };
    if (DRY_RUN) {
      const n = await Store.countDocuments(filter);
      console.log(`[clearDefaultPopupColors] ${path} === '${old}': ${n} shop(s) would change`);
      continue;
    }
    // Raw collection update: no schema validation or defaults are involved.
    const res = await Store.collection.updateMany(filter, { $set: { [path]: '' } });
    totalChanged += res.modifiedCount;
    console.log(`[clearDefaultPopupColors] ${path} === '${old}': matched ${res.matchedCount}, changed ${res.modifiedCount}`);
  }

  console.log(DRY_RUN
    ? '[clearDefaultPopupColors] dry run finished, nothing written'
    : `[clearDefaultPopupColors] done, ${totalChanged} field(s) cleared in total`);
  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[clearDefaultPopupColors] Error:', err.message);
    process.exit(1);
  });
