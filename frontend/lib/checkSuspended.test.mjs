/**
 * Plain-node ESM test for frontend/lib/checkSuspended.js.
 * No framework — uses node:assert/strict and EventTarget (Node 18+).
 *
 * Run: node frontend/lib/checkSuspended.test.mjs
 */

import assert from 'node:assert/strict';
import { checkSuspended, _resetForTest } from './checkSuspended.js';

// Stub window with a real EventTarget so dispatchEvent works.
function setup() {
  _resetForTest();
  const win = new EventTarget();
  globalThis.window = win;
  const dispatched = [];
  win.addEventListener('ccf:store-suspended', () => dispatched.push('ccf:store-suspended'));
  return dispatched;
}

let passed = 0;
function ok(label) { console.log(`  ✓ ${label}`); passed++; }

console.log('checkSuspended');

// 1. 403 + STORE_SUSPENDED → dispatches once
{
  const d = setup();
  checkSuspended(403, { code: 'STORE_SUSPENDED', error: 'Your account is paused.' });
  assert.equal(d.length, 1);
  assert.equal(d[0], 'ccf:store-suspended');
  ok('403 + STORE_SUSPENDED → dispatches once');
}

// 2. Idempotent: calling twice dispatches only once
{
  const d = setup();
  checkSuspended(403, { code: 'STORE_SUSPENDED' });
  checkSuspended(403, { code: 'STORE_SUSPENDED' });
  assert.equal(d.length, 1);
  ok('idempotent: calling twice dispatches only once');
}

// 3. After _resetForTest(), fires again (simulates new page load)
{
  const d = setup();
  checkSuspended(403, { code: 'STORE_SUSPENDED' });
  assert.equal(d.length, 1);
  _resetForTest();
  d.length = 0;
  checkSuspended(403, { code: 'STORE_SUSPENDED' });
  assert.equal(d.length, 1);
  ok('after reset, fires again');
}

// 4. 403 without STORE_SUSPENDED code → no event
{
  const d = setup();
  checkSuspended(403, { error: 'Forbidden', code: 'SOME_OTHER_CODE' });
  assert.equal(d.length, 0);
  ok('403 + different code → no event');
}

// 5. 403 with no code field → no event
{
  const d = setup();
  checkSuspended(403, { error: 'Forbidden' });
  assert.equal(d.length, 0);
  ok('403 with no code field → no event');
}

// 6. 402 + STORE_SUSPENDED → no event
{
  const d = setup();
  checkSuspended(402, { code: 'STORE_SUSPENDED' });
  assert.equal(d.length, 0);
  ok('402 + STORE_SUSPENDED → no event');
}

// 7. 401 + STORE_SUSPENDED → no event
{
  const d = setup();
  checkSuspended(401, { code: 'STORE_SUSPENDED' });
  assert.equal(d.length, 0);
  ok('401 + STORE_SUSPENDED → no event');
}

// 8. 200 + STORE_SUSPENDED → no event
{
  const d = setup();
  checkSuspended(200, { code: 'STORE_SUSPENDED' });
  assert.equal(d.length, 0);
  ok('200 + STORE_SUSPENDED → no event');
}

// 9. String body → no event
{
  const d = setup();
  checkSuspended(403, 'STORE_SUSPENDED');
  assert.equal(d.length, 0);
  ok('string body → no event');
}

// 10. null body → no event
{
  const d = setup();
  checkSuspended(403, null);
  assert.equal(d.length, 0);
  ok('null body → no event');
}

// 11. undefined body → no event
{
  const d = setup();
  checkSuspended(403, undefined);
  assert.equal(d.length, 0);
  ok('undefined body → no event');
}

// 12. Array body → no event (arrays are typeof 'object' but excluded)
{
  const d = setup();
  checkSuspended(403, [{ code: 'STORE_SUSPENDED' }]);
  assert.equal(d.length, 0);
  ok('array body → no event');
}

// 13. Numeric body → no event
{
  const d = setup();
  checkSuspended(403, 403);
  assert.equal(d.length, 0);
  ok('numeric body → no event');
}

// SSR guard: window undefined → no event
{
  _resetForTest();
  delete globalThis.window;
  const events = [];
  // No window to listen on, but we verify the function doesn't throw
  checkSuspended(403, { code: 'STORE_SUSPENDED' });
  ok('window undefined (SSR) → no throw, no event');
  // Restore for any subsequent code
  globalThis.window = new EventTarget();
}

console.log(`\n  ${passed} tests passed`);
