/**
 * One-off repair: set channels.email.address on a profile whose email was lost
 * during a merge (confirmed via audits/customer-email-repeat-audit.txt).
 *
 * Usage (from repo root):
 *   node backend/scripts/repair-profile-email.js <profileId> <email>          (dry-run)
 *   node backend/scripts/repair-profile-email.js <profileId> <email> --apply  (write)
 *
 * --apply is required to make any change. Default is dry-run (prints before/after, writes nothing).
 *
 * Refuses if <email> is not already in identifiers.emails for that profile.
 * Never prints MONGODB_URI or any PII beyond what the caller supplies.
 *
 * Run from backend/ or repo root — dotenv is loaded from backend/.env via path.
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../config/db');
const Profile = require('../models/Profile');

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const positional = args.filter((a) => !a.startsWith('--'));

  if (positional.length !== 2) {
    console.error('Usage: repair-profile-email.js <profileId> <email> [--apply]');
    process.exit(1);
  }

  const [profileId, rawEmail] = positional;
  const email = rawEmail.toLowerCase().trim();

  if (!email.includes('@')) {
    console.error('Error: <email> does not look like an email address.');
    process.exit(1);
  }

  await connectDB();

  const profile = await Profile.findById(profileId).lean();
  if (!profile) {
    console.error('Error: profile not found:', profileId);
    process.exit(1);
  }

  const knownEmails = (profile.identifiers && profile.identifiers.emails) || [];
  if (!knownEmails.includes(email)) {
    console.error(
      'Refused: <email> is not in identifiers.emails for this profile.',
      'Known emails:', knownEmails.length, '(masked for safety).'
    );
    process.exit(1);
  }

  const before = {
    'channels.email.address': profile.channels && profile.channels.email && profile.channels.email.address,
    'channels.email.source': profile.channels && profile.channels.email && profile.channels.email.source,
    'channels.email.capturedAt': profile.channels && profile.channels.email && profile.channels.email.capturedAt,
  };
  const after = {
    'channels.email.address': email,
    'channels.email.source': 'manual-repair',
    'channels.email.capturedAt': new Date(),
  };

  console.log('Profile:', profileId, '| shop:', profile.shopDomain);
  console.log('BEFORE:', JSON.stringify(before, null, 2));
  console.log('AFTER: ', JSON.stringify(after, null, 2));

  if (!apply) {
    console.log('\nDRY-RUN — no changes written. Re-run with --apply to apply.');
    process.exit(0);
  }

  await Profile.updateOne(
    { _id: profileId },
    { $set: { ...after, updatedAt: new Date() } }
  );
  console.log('\nApplied successfully.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
