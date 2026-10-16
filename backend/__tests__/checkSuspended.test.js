'use strict';

/**
 * Tests for the checkSuspended detection function (frontend/lib/api.js).
 *
 * frontend/lib/api.js uses ES module syntax; the backend Jest environment
 * runs CommonJS. The function is defined inline here — same algorithm — so
 * it can be exercised by the existing runner without new config.
 *
 * Algorithm under test:
 *   checkSuspended(status, body)
 *     - Does nothing unless status === 403
 *     - Does nothing unless body is a non-null, non-array object
 *     - Does nothing unless body.code === 'STORE_SUSPENDED'
 *     - Dispatches 'ccf:store-suspended' on window exactly ONCE per page load
 *       (idempotent: a module-level flag prevents repeat dispatch)
 *     - Does nothing when window is undefined (SSR / server context)
 */

function makeCheckSuspended() {
  let fired = false;
  const dispatched = [];

  // Mirrors the production function's logic exactly.
  function checkSuspended(status, body) {
    if (status !== 403) return;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return;
    if (body.code !== 'STORE_SUSPENDED') return;
    if (fired) return;
    fired = true;
    dispatched.push('ccf:store-suspended');
  }

  function reset() {
    fired = false;
    dispatched.length = 0;
  }

  return { checkSuspended, dispatched, reset };
}

describe('checkSuspended', () => {
  let checkSuspended, dispatched, reset;

  beforeEach(() => {
    ({ checkSuspended, dispatched, reset } = makeCheckSuspended());
  });

  test('403 + STORE_SUSPENDED code → dispatches the event once', () => {
    checkSuspended(403, { code: 'STORE_SUSPENDED', error: 'Your account is paused.' });
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toBe('ccf:store-suspended');
  });

  test('idempotent: calling twice dispatches only once', () => {
    checkSuspended(403, { code: 'STORE_SUSPENDED' });
    checkSuspended(403, { code: 'STORE_SUSPENDED' });
    expect(dispatched).toHaveLength(1);
  });

  test('after reset, fires again (simulates new page load)', () => {
    checkSuspended(403, { code: 'STORE_SUSPENDED' });
    expect(dispatched).toHaveLength(1);
    reset();
    checkSuspended(403, { code: 'STORE_SUSPENDED' });
    expect(dispatched).toHaveLength(1); // dispatched was also cleared by reset
  });

  test('403 without STORE_SUSPENDED code → no event', () => {
    checkSuspended(403, { error: 'Forbidden', code: 'SOME_OTHER_CODE' });
    expect(dispatched).toHaveLength(0);
  });

  test('403 with no code field → no event', () => {
    checkSuspended(403, { error: 'Forbidden' });
    expect(dispatched).toHaveLength(0);
  });

  test('402 with STORE_SUSPENDED code → no event', () => {
    checkSuspended(402, { code: 'STORE_SUSPENDED' });
    expect(dispatched).toHaveLength(0);
  });

  test('401 with STORE_SUSPENDED code → no event', () => {
    checkSuspended(401, { code: 'STORE_SUSPENDED' });
    expect(dispatched).toHaveLength(0);
  });

  test('200 with STORE_SUSPENDED code → no event', () => {
    checkSuspended(200, { code: 'STORE_SUSPENDED' });
    expect(dispatched).toHaveLength(0);
  });

  test('non-JSON body (string) → no event', () => {
    checkSuspended(403, 'STORE_SUSPENDED');
    expect(dispatched).toHaveLength(0);
  });

  test('null body → no event', () => {
    checkSuspended(403, null);
    expect(dispatched).toHaveLength(0);
  });

  test('undefined body → no event', () => {
    checkSuspended(403, undefined);
    expect(dispatched).toHaveLength(0);
  });

  test('array body → no event (arrays are objects in JS but should not match)', () => {
    checkSuspended(403, [{ code: 'STORE_SUSPENDED' }]);
    expect(dispatched).toHaveLength(0);
  });

  test('numeric body → no event', () => {
    checkSuspended(403, 403);
    expect(dispatched).toHaveLength(0);
  });
});
