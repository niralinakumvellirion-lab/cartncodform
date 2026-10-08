/**
 * sendEmailSamples.js — dev tool (not a route)
 *
 * Renders one email per layout (all 11) through the same code path as a real
 * send: designFromTemplate -> renderEmailDocument, FROM, UNSUBSCRIBE_HEADERS.
 *
 * Usage:
 *   node scripts/sendEmailSamples.js \
 *     --to you@example.com \
 *     --image https://cdn.example.com/offer.jpg \
 *     [--store "Silk House"] \
 *     [--color "#c2185b"] \
 *     [--dry-run]
 *
 *   --to         Required. Single recipient address.
 *   --image      Required (live send). https:// URL for the offer photo.
 *   --store      Optional store name (default: "Sample Store").
 *   --color      Optional brand colour hex (default: "#4f46e5").
 *   --dry-run    Write 11 HTML files to backend/tmp/email-samples/ instead of sending.
 *
 * REFUSES to run:
 *   - without --to
 *   - with more than one address
 *   - without RESEND_API_KEY (unless --dry-run)
 *
 * Sends sequentially with a 1-second gap; prints each Resend id.
 * Never reads or writes the database.
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { Resend } = require('resend');

const {
  renderEmailDocument,
  designFromTemplate,
  LAYOUT_INFO,
  PRESETS,
} = require('../utils/emailEngine');
const { FROM, UNSUBSCRIBE_HEADERS } = require('../utils/email');

// ── arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') { args.dryRun = true; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      args[key] = argv[i + 1] || '';
      i++;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

// ── validation ────────────────────────────────────────────────────────────────

if (!args.to) {
  console.error('Error: --to is required.');
  process.exit(1);
}
if (args.to.includes(',') || args.to.includes(';')) {
  console.error('Error: only one recipient address allowed.');
  process.exit(1);
}
if (!args.dryRun && !process.env.RESEND_API_KEY) {
  console.error('Error: RESEND_API_KEY is not set. Use --dry-run to write files instead.');
  process.exit(1);
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const PRESET_KEYS = Object.keys(PRESETS);          // 5 named presets
const LAYOUTS     = LAYOUT_INFO.map((l) => l.k);   // 11 layout keys

const storeName = args.store || 'Sample Store';
const color     = args.color || '#4f46e5';

const STORE = {
  shopName:     storeName,
  logoUrl:      null,
  primaryColor: color,
  shopDomain:   'sample.myshopify.com',
};

// Build one template per layout.  Copy rotates through PRESETS.
function makeTemplate(layout, index) {
  const presetKey = PRESET_KEYS[index % PRESET_KEYS.length];
  const preset    = PRESETS[presetKey];
  return {
    type:      'special_offer',
    name:      `Sample ${index + 1}/${LAYOUTS.length} — ${layout}`,
    subject:   `[Sample ${index + 1}/${LAYOUTS.length}] ${layout.charAt(0).toUpperCase() + layout.slice(1)}`,
    eyebrow:   preset.eyebrow  || '',
    headline:  preset.headline || '',
    body:      preset.body     || '',
    offerText: preset.offer    || '',
    ctaLabel:  preset.cta      || 'Shop Now',
    ctaUrl:    'https://shopireachboost.com',
    note:      preset.note     || '',
    layout,
    color,
    hFont:     preset.hFont || 'arial',
    bFont:     preset.bFont || 'arial',
    radius:    preset.radius || 'round',
    showLogo:  false,
    imageUrl:  args.image || null,
    imgW:      null,
    imgH:      null,
    pageBg:    null,
    cardBg:    null,
  };
}

// ── dry-run helpers ───────────────────────────────────────────────────────────

const TMP_DIR = path.resolve(__dirname, '../tmp/email-samples');

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

function writeSample(index, layout, html) {
  const file = path.join(TMP_DIR, `sample-${String(index + 1).padStart(2, '0')}-${layout}.html`);
  fs.writeFileSync(file, html, 'utf8');
  console.log(`  Wrote ${file}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const resend = args.dryRun ? null : new Resend(process.env.RESEND_API_KEY);

  if (args.dryRun) {
    ensureTmpDir();
    console.log(`Dry-run mode — writing ${LAYOUTS.length} HTML files to ${TMP_DIR}`);
  } else {
    console.log(`Sending ${LAYOUTS.length} sample emails to ${args.to}`);
  }

  for (let i = 0; i < LAYOUTS.length; i++) {
    const layout   = LAYOUTS[i];
    const template = makeTemplate(layout, i);
    const design   = designFromTemplate(template, STORE, { placeholder: !template.imageUrl });
    const html     = renderEmailDocument(design);
    const subject  = template.subject;

    if (args.dryRun) {
      writeSample(i, layout, html);
    } else {
      const { data, error } = await resend.emails.send({
        from:    FROM,
        to:      args.to,
        subject,
        html,
        headers: UNSUBSCRIBE_HEADERS,
      });

      if (error) {
        console.error(`  [${i + 1}/${LAYOUTS.length}] ${layout} FAILED: ${error.message}`);
      } else {
        console.log(`  [${i + 1}/${LAYOUTS.length}] ${layout} → ${data.id}`);
      }

      if (i < LAYOUTS.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
