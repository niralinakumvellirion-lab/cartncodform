/* eslint-env node */
/**
 * Tests for api.js: verifies checkSuspended is in scope (no ReferenceError)
 * and the 403 suspended case dispatches ccf:store-suspended.
 * Run: node frontend/lib/api.test.mjs
 *
 * api.js uses extensionless imports (fine in Next.js/webpack). For plain Node
 * ESM we read the source, patch the import path to absolute, and load via
 * data URL so no repo files need changing.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Minimal browser globals ─────────────────────────────────────────────────
const events = [];
const mockWindow = {
  shopify: { idToken: async () => 'test-token' },
  dispatchEvent(e) { events.push(e.type); },
};
global.window = mockWindow;
process.env.NEXT_PUBLIC_BACKEND_URL = 'http://localhost:4000';

// ── Load api.js with patched extensionless import ───────────────────────────
// Replaces './checkSuspended' with absolute file URL so Node ESM can resolve it.
const csUrl = new URL('./checkSuspended.js', import.meta.url).href;
let apiSrc = readFileSync(path.join(__dirname, 'api.js'), 'utf8');
apiSrc = apiSrc
  .replace(/from ['"]\.\/checkSuspended['"]/g, `from '${csUrl}'`);

const apiMod = await import(`data:text/javascript,${encodeURIComponent(apiSrc)}`);
const { apiGet, apiSend } = apiMod;
const { _resetForTest } = await import('./checkSuspended.js');

// ── Helpers ──────────────────────────────────────────────────────────────────
function mockFetch(status, body) {
  const bodyText = JSON.stringify(body);
  return async () => ({
    ok:   status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => bodyText,
  });
}

let passed = 0; let failed = 0;
async function test(label, fn) {
  try   { await fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.error(`  ✗ ${label}\n    ${e.message}`); failed++; }
}

// ── apiGet ───────────────────────────────────────────────────────────────────
console.log('\napiGet');

await test('200: returns data, no ReferenceError', async () => {
  global.fetch = mockFetch(200, { items: [1, 2, 3] });
  const data = await apiGet('/test');
  assert.deepEqual(data, { items: [1, 2, 3] });
});

await test('403 STORE_SUSPENDED: dispatches ccf:store-suspended, no ReferenceError', async () => {
  events.length = 0;
  _resetForTest();
  global.fetch = mockFetch(403, { code: 'STORE_SUSPENDED', error: 'paused' });
  let threw = null;
  try { await apiGet('/test'); } catch (e) { threw = e; }
  assert.ok(threw !== null, 'Expected an error to be thrown');
  assert.ok(
    !(threw instanceof ReferenceError),
    `Should NOT be ReferenceError; got: ${threw.constructor.name}: ${threw.message}`
  );
  assert.ok(
    events.includes('ccf:store-suspended'),
    `Expected ccf:store-suspended event; fired: [${events.join(', ')}]`
  );
});

await test('403 non-suspended body: throws error, no ccf:store-suspended', async () => {
  events.length = 0;
  global.fetch = mockFetch(403, { error: 'forbidden' });
  let threw = null;
  try { await apiGet('/test'); } catch (e) { threw = e; }
  assert.ok(threw !== null, 'Expected error');
  assert.ok(!events.includes('ccf:store-suspended'));
});

await test('500: throws error, no ReferenceError', async () => {
  global.fetch = mockFetch(500, { error: 'internal' });
  let threw = null;
  try { await apiGet('/test'); } catch (e) { threw = e; }
  assert.ok(threw !== null, 'Expected error');
  assert.ok(!(threw instanceof ReferenceError),
    `Should NOT be ReferenceError; got: ${threw?.constructor?.name}`);
});

// ── apiSend ──────────────────────────────────────────────────────────────────
console.log('\napiSend');

await test('200: returns data, no ReferenceError', async () => {
  global.fetch = mockFetch(200, { ok: true });
  const data = await apiSend('/test', 'POST', { x: 1 });
  assert.deepEqual(data, { ok: true });
});

await test('403 STORE_SUSPENDED: dispatches ccf:store-suspended, no ReferenceError', async () => {
  events.length = 0;
  _resetForTest();
  global.fetch = mockFetch(403, { code: 'STORE_SUSPENDED', error: 'paused' });
  let threw = null;
  try { await apiSend('/test', 'POST', {}); } catch (e) { threw = e; }
  assert.ok(
    threw !== null && !(threw instanceof ReferenceError),
    `Should throw normal error; got: ${threw?.constructor?.name}: ${threw?.message}`
  );
  assert.ok(events.includes('ccf:store-suspended'), 'Expected suspend event');
});

await test('403 non-suspended: throws error, no event', async () => {
  events.length = 0;
  global.fetch = mockFetch(403, { error: 'forbidden' });
  let threw = null;
  try { await apiSend('/test', 'PUT', {}); } catch (e) { threw = e; }
  assert.ok(threw !== null, 'Expected error');
  assert.ok(!events.includes('ccf:store-suspended'));
});

// ── Results ──────────────────────────────────────────────────────────────────
console.log(`\n  ${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
