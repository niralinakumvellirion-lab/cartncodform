/**
 * Plain-node ESM tests for frontend/lib/hostRouting.js + platformPaths.js.
 * Run: node frontend/lib/hostRouting.test.mjs
 *
 * Expected results come from the documented routing RULES.
 */

import assert from 'node:assert/strict';
import { resolveHostRoute } from './hostRouting.js';
import { platformHref }    from './platformPaths.js';

const ADMIN = 'admin.shopireachboost.com';
const APP   = 'app.shopireachboost.com';

let passed = 0;
let failed = 0;
const mismatches = [];

function ok(label) { console.log(`  ✓ ${label}`); passed++; }
function fail(label, reason) {
  console.log(`  ✗ ${label}`);
  console.log(`    ${reason}`);
  failed++;
  mismatches.push({ label, reason });
}
function check(label, actual, expected) {
  try {
    assert.deepEqual(actual, expected);
    ok(label);
  } catch {
    fail(label, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── resolveHostRoute: admin host, production ──────────────────────────────────
console.log('\nresolveHostRoute — admin host, production: /platform pass-through');

check('/platform → next',
  resolveHostRoute({ host: ADMIN, pathname: '/platform' }),
  { action: 'next' });

check('/platform/ → next',
  resolveHostRoute({ host: ADMIN, pathname: '/platform/' }),
  { action: 'next' });

check('/platform/login → next',
  resolveHostRoute({ host: ADMIN, pathname: '/platform/login' }),
  { action: 'next' });

check('/platform/stores/x.myshopify.com → next',
  resolveHostRoute({ host: ADMIN, pathname: '/platform/stores/x.myshopify.com' }),
  { action: 'next' });

console.log('\nresolveHostRoute — admin host, production: blocked paths');

check('/admin → notFound',
  resolveHostRoute({ host: ADMIN, pathname: '/admin' }),
  { action: 'notFound' });

check('/admin/dashboard → notFound',
  resolveHostRoute({ host: ADMIN, pathname: '/admin/dashboard' }),
  { action: 'notFound' });

check('/admin/settings-page → notFound',
  resolveHostRoute({ host: ADMIN, pathname: '/admin/settings-page' }),
  { action: 'notFound' });

check('/cod-form → notFound',
  resolveHostRoute({ host: ADMIN, pathname: '/cod-form' }),
  { action: 'notFound' });

check('/cod-form/shop.myshopify.com → notFound',
  resolveHostRoute({ host: ADMIN, pathname: '/cod-form/shop.myshopify.com' }),
  { action: 'notFound' });

check('/api → notFound',
  resolveHostRoute({ host: ADMIN, pathname: '/api' }),
  { action: 'notFound' });

check('/api/webhooks → notFound',
  resolveHostRoute({ host: ADMIN, pathname: '/api/webhooks' }),
  { action: 'notFound' });

console.log('\nresolveHostRoute — admin host, production: rewrites');

check('/ → rewrite /platform',
  resolveHostRoute({ host: ADMIN, pathname: '/' }),
  { action: 'rewrite', to: '/platform' });

check('/login → rewrite /platform/login',
  resolveHostRoute({ host: ADMIN, pathname: '/login' }),
  { action: 'rewrite', to: '/platform/login' });

check('/staff → rewrite /platform/staff',
  resolveHostRoute({ host: ADMIN, pathname: '/staff' }),
  { action: 'rewrite', to: '/platform/staff' });

check('/audit → rewrite /platform/audit',
  resolveHostRoute({ host: ADMIN, pathname: '/audit' }),
  { action: 'rewrite', to: '/platform/audit' });

check('/stores/x.myshopify.com → rewrite /platform/stores/x.myshopify.com',
  resolveHostRoute({ host: ADMIN, pathname: '/stores/x.myshopify.com' }),
  { action: 'rewrite', to: '/platform/stores/x.myshopify.com' });

check('/unknown-path → rewrite /platform/unknown-path',
  resolveHostRoute({ host: ADMIN, pathname: '/unknown-path' }),
  { action: 'rewrite', to: '/platform/unknown-path' });

console.log('\nresolveHostRoute — admin host, production: host matching (case + port)');

check('uppercase host → admin rules apply (rewrite /)',
  resolveHostRoute({ host: 'Admin.ShopIReachBoost.com', pathname: '/' }),
  { action: 'rewrite', to: '/platform' });

check('host with :443 port → admin rules apply (rewrite /login)',
  resolveHostRoute({ host: 'admin.shopireachboost.com:443', pathname: '/login' }),
  { action: 'rewrite', to: '/platform/login' });

check('host with :8080 port, /platform path → next',
  resolveHostRoute({ host: 'admin.shopireachboost.com:8080', pathname: '/platform/audit' }),
  { action: 'next' });

check('ADMIN uppercase + port, blocked path → notFound',
  resolveHostRoute({ host: 'ADMIN.SHOPIREACHBOOST.COM:443', pathname: '/api/x' }),
  { action: 'notFound' });

// ── /platform path boundary ───────────────────────────────────────────────────
// Only /platform (exact) and /platform/* (slash-prefixed) pass through on the
// admin host. Paths that merely start with the letters "/platform" (no slash)
// are treated as "every other path" and get rewritten.
console.log('\nresolveHostRoute — admin host: /platform path boundary');

check('/platformX → rewrite /platform/platformX',
  resolveHostRoute({ host: ADMIN, pathname: '/platformX' }),
  { action: 'rewrite', to: '/platform/platformX' });

check('/platform-pricing → rewrite /platform/platform-pricing',
  resolveHostRoute({ host: ADMIN, pathname: '/platform-pricing' }),
  { action: 'rewrite', to: '/platform/platform-pricing' });

// ── resolveHostRoute: non-admin host, production ──────────────────────────────
console.log('\nresolveHostRoute — non-admin host, production: /platform blocked');

check('app.* /platform → notFound',
  resolveHostRoute({ host: APP, pathname: '/platform' }),
  { action: 'notFound' });

check('app.* /platform/ → notFound',
  resolveHostRoute({ host: APP, pathname: '/platform/' }),
  { action: 'notFound' });

check('app.* /platform/login → notFound',
  resolveHostRoute({ host: APP, pathname: '/platform/login' }),
  { action: 'notFound' });

check('app.* /platform/stores/x → notFound',
  resolveHostRoute({ host: APP, pathname: '/platform/stores/x.myshopify.com' }),
  { action: 'notFound' });

console.log('\nresolveHostRoute — non-admin host, production: other paths pass through');

check('app.* / → next',
  resolveHostRoute({ host: APP, pathname: '/' }),
  { action: 'next' });

check('app.* /admin → next',
  resolveHostRoute({ host: APP, pathname: '/admin' }),
  { action: 'next' });

check('app.* /admin/dashboard → next',
  resolveHostRoute({ host: APP, pathname: '/admin/dashboard' }),
  { action: 'next' });

check('app.* /cod-form → next',
  resolveHostRoute({ host: APP, pathname: '/cod-form' }),
  { action: 'next' });

check('app.* /api/x → next',
  resolveHostRoute({ host: APP, pathname: '/api/x' }),
  { action: 'next' });

check('www.* /admin → next',
  resolveHostRoute({ host: 'www.shopireachboost.com', pathname: '/admin' }),
  { action: 'next' });

check('vercel preview /api/x → next',
  resolveHostRoute({ host: 'cartncodform-git-main.vercel.app', pathname: '/api/x' }),
  { action: 'next' });

console.log('\nresolveHostRoute — non-admin host, production: /platform boundary (not-prefix)');

check('app.* /platformX → next (not blocked — not the /platform subtree)',
  resolveHostRoute({ host: APP, pathname: '/platformX' }),
  { action: 'next' });

check('app.* /platform-pricing → next',
  resolveHostRoute({ host: APP, pathname: '/platform-pricing' }),
  { action: 'next' });

check('app.* /platforms → next',
  resolveHostRoute({ host: APP, pathname: '/platforms' }),
  { action: 'next' });

check('app.* /platform → still notFound (exact match)',
  resolveHostRoute({ host: APP, pathname: '/platform' }),
  { action: 'notFound' });

check('app.* /platform/login → still notFound (slash sub-path)',
  resolveHostRoute({ host: APP, pathname: '/platform/login' }),
  { action: 'notFound' });

// ── resolveHostRoute: non-production ─────────────────────────────────────────
console.log('\nresolveHostRoute — non-production: /platform reachable on any host');

check('localhost, dev: /platform → next (not blocked)',
  resolveHostRoute({ host: 'localhost', pathname: '/platform', isProduction: false }),
  { action: 'next' });

check('localhost, dev: /platform/login → next',
  resolveHostRoute({ host: 'localhost', pathname: '/platform/login', isProduction: false }),
  { action: 'next' });

check('localhost, dev: /admin → next',
  resolveHostRoute({ host: 'localhost', pathname: '/admin', isProduction: false }),
  { action: 'next' });

check('app.*, dev: /platform → next (not blocked)',
  resolveHostRoute({ host: APP, pathname: '/platform', isProduction: false }),
  { action: 'next' });

check('admin host, dev: /platform → next (pass-through)',
  resolveHostRoute({ host: ADMIN, pathname: '/platform', isProduction: false }),
  { action: 'next' });

check('admin host, dev: / → rewrite (admin rules still apply regardless of isProduction)',
  resolveHostRoute({ host: ADMIN, pathname: '/', isProduction: false }),
  { action: 'rewrite', to: '/platform' });

// ── resolveHostRoute: edge cases ─────────────────────────────────────────────
console.log('\nresolveHostRoute — edge cases');

check('empty host, prod: /platform → notFound',
  resolveHostRoute({ host: '', pathname: '/platform', isProduction: true }),
  { action: 'notFound' });

check('empty host, prod: /admin → next',
  resolveHostRoute({ host: '', pathname: '/admin', isProduction: true }),
  { action: 'next' });

check('undefined host (default), prod: /platform → notFound',
  resolveHostRoute({ pathname: '/platform', isProduction: true }),
  { action: 'notFound' });

check('undefined host (default), prod: / → next',
  resolveHostRoute({ pathname: '/', isProduction: true }),
  { action: 'next' });

check('"admin.shopireachboost.com.evil.com" must NOT be admin host',
  resolveHostRoute({ host: 'admin.shopireachboost.com.evil.com', pathname: '/', isProduction: true }),
  { action: 'next' });

check('"notadmin.shopireachboost.com" must NOT be admin host',
  resolveHostRoute({ host: 'notadmin.shopireachboost.com', pathname: '/', isProduction: true }),
  { action: 'next' });

check('"ADMIN.SHOPIREACHBOOST.COM.evil.com" must NOT be admin host',
  resolveHostRoute({ host: 'ADMIN.SHOPIREACHBOOST.COM.evil.com', pathname: '/login', isProduction: true }),
  { action: 'next' });

check('"shopireachboost.com" (no admin. prefix) must NOT be admin host',
  resolveHostRoute({ host: 'shopireachboost.com', pathname: '/', isProduction: true }),
  { action: 'next' });

// ── platformHref: server-side (no window) ─────────────────────────────────────
console.log('\nplatformHref — server-side (window undefined)');

{
  const saved = globalThis.window;
  delete globalThis.window;

  check('SSR: / → /platform',           platformHref('/'),       '/platform');
  check('SSR: /login → /platform/login', platformHref('/login'), '/platform/login');
  check('SSR: /staff → /platform/staff', platformHref('/staff'), '/platform/staff');
  check('SSR: /audit → /platform/audit', platformHref('/audit'), '/platform/audit');

  globalThis.window = saved;
}

// ── platformHref: client, admin host ─────────────────────────────────────────
console.log('\nplatformHref — client, admin host (clean paths)');

{
  globalThis.window = { location: { hostname: 'admin.shopireachboost.com' } };

  check('admin host: / → /',           platformHref('/'),       '/');
  check('admin host: /login → /login', platformHref('/login'),  '/login');
  check('admin host: /staff → /staff', platformHref('/staff'),  '/staff');
  check('admin host: /audit → /audit', platformHref('/audit'),  '/audit');

  delete globalThis.window;
}

// ── platformHref: client, non-admin host ─────────────────────────────────────
console.log('\nplatformHref — client, non-admin host (prefixed paths)');

{
  globalThis.window = { location: { hostname: 'app.shopireachboost.com' } };

  check('app.* host: / → /platform',           platformHref('/'),       '/platform');
  check('app.* host: /login → /platform/login', platformHref('/login'), '/platform/login');
  check('app.* host: /staff → /platform/staff', platformHref('/staff'), '/platform/staff');

  delete globalThis.window;
}

// ── platformHref: client, localhost ──────────────────────────────────────────
// hostname === 'localhost' → the admin.* check is explicitly excluded; falls
// through to the prefixed path branch.
console.log('\nplatformHref — client, localhost (prefixed)');

{
  globalThis.window = { location: { hostname: 'localhost' } };

  check('localhost: / → /platform',           platformHref('/'),       '/platform');
  check('localhost: /login → /platform/login', platformHref('/login'), '/platform/login');

  delete globalThis.window;
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n  ${passed} tests passed, ${failed} failed`);

if (failed > 0) {
  console.log('\nFAILURES:');
  mismatches.forEach(({ label, reason }) => {
    console.log(`  ✗ ${label}`);
    console.log(`    ${reason}`);
  });
  process.exitCode = 1;
}
