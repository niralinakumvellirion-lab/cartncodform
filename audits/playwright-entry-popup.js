/**
 * Playwright screenshots for entry popup wording + colour fixes.
 * Saves to D:\cartncodform\audits\entry-popup-*.png
 *
 * Usage: node audits/playwright-entry-popup.js
 */
'use strict';
const { chromium } = require('C:/Users/Intel/AppData/Local/npm-cache/_npx/13ab0715f9f30c2e/node_modules/playwright');
const fs   = require('fs');
const path = require('path');

const SCRIPT_SRC = fs.readFileSync(
  path.resolve(__dirname, '../extensions/cartncodform-embed/assets/ccf-push.js'), 'utf8'
);
const OUT = __dirname;

const WIDTHS = [1100, 390];

const COMBOS = [
  ['#4F46E5', '#ffffff', 'indigo-light'],
  ['#4F46E5', '#111827', 'indigo-dark'],
  ['#F5C542', '#ffffff', 'gold-light'],
  ['#F5C542', '#1a1a1a', 'gold-dark'],
  ['#E8E8FF', '#ffffff', 'pale-light'],
];

const WORDING = [
  ['default', {}],
  ['custom', {
    emailPlaceholder: 'Your email here',
    captureButton: 'Snag my deal',
    subscribedTitle: 'You did it!',
    subscribedSub: 'Code on its way\u2026',
    unlockedTitle: '{pct}% OFF \u2014 go shop!',
    unlockedSub: 'Hurry! Expires in {days} days',
    bdSub: 'Share your birthday for a gift {days} days early!',
    bdButton: 'Yes, gift me!',
    bdSkip: 'No gift please',
    bdOkTitle: 'Birthday saved!',
    bdOkSub: 'Your gift arrives {days} days before your big day.',
  }],
];

function buildPage(accentColor, bgColor, discountConfig) {
  // Escape the script src for embedding — it's already a JS file so just inline it
  const cfgJson = JSON.stringify(discountConfig).replace(/</g, '\\u003c');
  return `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { background: #f3f4f6; font-family: system-ui, sans-serif; padding: 40px 20px; }
  #ccf-embed-root { display: none; }
</style>
</head>
<body>
<div id="ccf-embed-root"
  data-shop="preview.myshopify.com"
  data-push-public-key="FAKE_KEY"
></div>
<script>
window.__ccf_test = {};
window.Shopify = { shop: 'preview.myshopify.com' };
window.fetch = () => new Promise(() => {});
window.Notification = { permission: 'denied', requestPermission: () => Promise.resolve('denied') };
</script>
<script>${SCRIPT_SRC}</script>
<script>
(function() {
  const cfg = ${cfgJson};
  if (window.__ccf_test.setDiscountConfig) window.__ccf_test.setDiscountConfig(cfg);
  if (window.__ccf_test.setPopupConfig) window.__ccf_test.setPopupConfig({
    accentColor: '${accentColor}',
    bgColor: '${bgColor}',
    headline: 'Get a special offer today!',
    subtext: 'Join thousands of happy customers.',
    allowText: 'Allow',
    denyText: 'No thanks',
  });
})();
</script>
</body></html>`;
}

async function shot(page, name) {
  await page.waitForTimeout(500);
  const p = path.join(OUT, `entry-popup-${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log('  saved:', `entry-popup-${name}.png`);
  return p;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const taken = [];

  // === Colour combos: Classic card at 1100px + 390px ===
  for (const [accent, bgColor, label] of COMBOS) {
    for (const w of WIDTHS) {
      const dc = {
        emailDiscount: { enabled: true, percentage: 15, expiryDays: 7 },
        pushDiscount:  { enabled: false, percentage: 0 },
        offerHeadline: 'Get a discount on your first order!',
        birthdayCapture: { popup: { enabled: false }, banner: { enabled: false }, postOrder: { enabled: false } },
        birthdayDiscount: { enabled: false, percentage: 15, expiryDays: 7, leadDays: 3, offerText: '' },
        popupCopy: {},
      };
      const ctx  = await browser.newContext({ viewport: { width: w, height: 700 } });
      const page = await ctx.newPage();
      const html = buildPage(accent, bgColor, dc);
      await page.goto(`data:text/html,${encodeURIComponent(html)}`);
      await page.waitForTimeout(400);
      await page.evaluate(() => { try { window.__ccf_test.showSoftPrompt('dwell'); } catch(e) {} });
      taken.push(await shot(page, `classic-${label}-${w}`));
      await ctx.close();
    }
  }

  // === 4-step wording: discount-box + birthday, default + custom, Indigo, 1100+390 ===
  for (const [wl, pc] of WORDING) {
    const dc = {
      emailDiscount: { enabled: true, percentage: 15, expiryDays: 7 },
      pushDiscount:  { enabled: false, percentage: 0 },
      offerHeadline: 'Get a discount on your first order!',
      birthdayCapture: { popup: { enabled: true }, banner: { enabled: false }, postOrder: { enabled: false } },
      birthdayDiscount: { enabled: true, percentage: 15, expiryDays: 7, leadDays: 3,
        offerText: 'Get a birthday gift', consentText: "We'll use your birthday only to send you a gift." },
      popupCopy: pc,
    };

    for (const w of WIDTHS) {
      // Step 1: discount box
      {
        const ctx  = await browser.newContext({ viewport: { width: w, height: 700 } });
        const page = await ctx.newPage();
        await page.goto(`data:text/html,${encodeURIComponent(buildPage('#4F46E5', '#ffffff', dc))}`);
        await page.waitForTimeout(400);
        await page.evaluate(() => { try { window.__ccf_test.showSoftPrompt('dwell'); } catch(e) {} });
        taken.push(await shot(page, `step1-discountbox-${wl}-${w}`));
        await ctx.close();
      }
      // Step 4: birthday step
      {
        const ctx  = await browser.newContext({ viewport: { width: w, height: 700 } });
        const page = await ctx.newPage();
        await page.goto(`data:text/html,${encodeURIComponent(buildPage('#4F46E5', '#ffffff', dc))}`);
        await page.waitForTimeout(400);
        await page.evaluate(() => {
          try { window.__ccf_test.showBirthdayStep(document.body, '#4F46E5', () => {}); } catch(e) { console.error('bd', e.message); }
        });
        taken.push(await shot(page, `step4-birthday-${wl}-${w}`));
        await ctx.close();
      }
    }
  }

  await browser.close();
  console.log(`\nDone. ${taken.length} screenshots saved.`);
  console.log('\nNOTE: Admin wording card screenshot skipped — requires running Next.js dev server.');
})().catch((e) => { console.error('Playwright error:', e.message); process.exit(1); });
