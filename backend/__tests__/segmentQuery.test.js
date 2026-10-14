/**
 * Parity tests for buildSegmentQuery.
 *
 * For each segment and option combination, the builder output must
 * deep-equal what each old copy produced.  The old logic is pasted
 * verbatim as the expected value so there is no chance of a silent
 * translation error.
 *
 * going_quiet generates `new Date(Date.now() - 21d)` at call time, so
 * Date.now() is pinned to a fixed value for the duration of these tests.
 */

const FIXED_NOW = new Date('2026-10-14T10:00:00.000Z').getTime();
const TWENTY_ONE_DAYS_MS = 21 * 24 * 60 * 60 * 1000;

beforeAll(() => jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW));
afterAll(() => jest.restoreAllMocks());

const { buildSegmentQuery, VALID_SEGMENTS } = require('../utils/segmentQuery');

const SHOP = 'demo.myshopify.com';
const FROM = new Date('2026-09-01T00:00:00.000Z');
const TO   = new Date('2026-09-30T23:59:59.999Z');

// ── VALID_SEGMENTS export ────────────────────────────────────────────────────

test('VALID_SEGMENTS contains all 8 segment keys', () => {
  expect(VALID_SEGMENTS).toEqual(expect.arrayContaining([
    'everyone', 'has_cart', 'bought_once', 'repeat_buyer', 'going_quiet',
    'email_captured', 'push_subscribed', 'whatsapp_captured',
  ]));
  expect(VALID_SEGMENTS).toHaveLength(8);
});

// ── LIST PAGE PARITY (no requireEmail / requireNotSuppressed) ────────────────
// Expected values copied verbatim from routes/profiles.js lines 151-175
// (prior to this refactor).

describe('list-page parity (no guards)', () => {
  test('everyone', () => {
    expect(buildSegmentQuery(SHOP, 'everyone')).toEqual({ shopDomain: SHOP });
  });

  test('unknown segment treated as everyone', () => {
    expect(buildSegmentQuery(SHOP, 'bad_segment')).toEqual({ shopDomain: SHOP });
  });

  test('has_cart', () => {
    expect(buildSegmentQuery(SHOP, 'has_cart')).toEqual({
      shopDomain: SHOP,
      'identifiers.cartTokens.0': { $exists: true },
      'orders.count': 0,
    });
  });

  test('bought_once', () => {
    expect(buildSegmentQuery(SHOP, 'bought_once')).toEqual({
      shopDomain: SHOP,
      'orders.count': 1,
    });
  });

  test('repeat_buyer', () => {
    expect(buildSegmentQuery(SHOP, 'repeat_buyer')).toEqual({
      shopDomain: SHOP,
      'orders.count': { $gte: 2 },
    });
  });

  test('going_quiet', () => {
    const expected = new Date(FIXED_NOW - TWENTY_ONE_DAYS_MS);
    const q = buildSegmentQuery(SHOP, 'going_quiet');
    expect(q.shopDomain).toBe(SHOP);
    expect(q.lastSeenAt.$lt).toEqual(expected);
  });

  test('email_captured — no from/to', () => {
    expect(buildSegmentQuery(SHOP, 'email_captured')).toEqual({
      shopDomain: SHOP,
      'channels.email.capturedAt': { $exists: true },
    });
  });

  test('email_captured — from only', () => {
    expect(buildSegmentQuery(SHOP, 'email_captured', { from: FROM })).toEqual({
      shopDomain: SHOP,
      'channels.email.capturedAt': { $exists: true, $gte: FROM },
    });
  });

  test('email_captured — to only', () => {
    expect(buildSegmentQuery(SHOP, 'email_captured', { to: TO })).toEqual({
      shopDomain: SHOP,
      'channels.email.capturedAt': { $exists: true, $lte: TO },
    });
  });

  test('email_captured — from + to', () => {
    expect(buildSegmentQuery(SHOP, 'email_captured', { from: FROM, to: TO })).toEqual({
      shopDomain: SHOP,
      'channels.email.capturedAt': { $exists: true, $gte: FROM, $lte: TO },
    });
  });

  test('push_subscribed — no range', () => {
    expect(buildSegmentQuery(SHOP, 'push_subscribed')).toEqual({
      shopDomain: SHOP,
      'channels.push.subscribed': true,
    });
  });

  test('push_subscribed — from only', () => {
    expect(buildSegmentQuery(SHOP, 'push_subscribed', { from: FROM })).toEqual({
      shopDomain: SHOP,
      'channels.push.subscribed': true,
      'channels.push.subscribedAt': { $gte: FROM },
    });
  });

  test('push_subscribed — to only', () => {
    expect(buildSegmentQuery(SHOP, 'push_subscribed', { to: TO })).toEqual({
      shopDomain: SHOP,
      'channels.push.subscribed': true,
      'channels.push.subscribedAt': { $lte: TO },
    });
  });

  test('push_subscribed — from + to', () => {
    expect(buildSegmentQuery(SHOP, 'push_subscribed', { from: FROM, to: TO })).toEqual({
      shopDomain: SHOP,
      'channels.push.subscribed': true,
      'channels.push.subscribedAt': { $gte: FROM, $lte: TO },
    });
  });

  test('whatsapp_captured', () => {
    expect(buildSegmentQuery(SHOP, 'whatsapp_captured')).toEqual({
      shopDomain: SHOP,
      'channels.whatsapp.consentedAt': { $exists: true, $ne: null },
      'channels.whatsapp.optedOutAt': null,
    });
  });

  test('from/to are silently ignored for segments that do not use them', () => {
    // has_cart + from/to → same as has_cart without from/to
    expect(buildSegmentQuery(SHOP, 'has_cart', { from: FROM, to: TO })).toEqual({
      shopDomain: SHOP,
      'identifiers.cartTokens.0': { $exists: true },
      'orders.count': 0,
    });
  });
});

// ── BROADCAST / COUNT PARITY (requireEmail: true) ────────────────────────────
// Expected values copied verbatim from utils/emailBroadcast.js lines 37-56
// (and the identical copy in routes/emailTemplates.js lines 54-73).

const BASE_EMAIL = {
  shopDomain: SHOP,
  suppressed: { $ne: true },
  $or: [
    { 'channels.email.address': { $exists: true, $ne: null } },
    { 'identifiers.emails.0': { $exists: true } },
  ],
};

describe('broadcast/count parity (requireEmail: true)', () => {
  test('everyone', () => {
    expect(buildSegmentQuery(SHOP, 'everyone', { requireEmail: true }))
      .toEqual(BASE_EMAIL);
  });

  test('email_captured', () => {
    expect(buildSegmentQuery(SHOP, 'email_captured', { requireEmail: true }))
      .toEqual({ ...BASE_EMAIL, 'channels.email.capturedAt': { $exists: true } });
  });

  test('has_cart', () => {
    expect(buildSegmentQuery(SHOP, 'has_cart', { requireEmail: true }))
      .toEqual({
        ...BASE_EMAIL,
        'identifiers.cartTokens.0': { $exists: true },
        'orders.count': 0,
      });
  });

  test('bought_once', () => {
    expect(buildSegmentQuery(SHOP, 'bought_once', { requireEmail: true }))
      .toEqual({ ...BASE_EMAIL, 'orders.count': 1 });
  });

  test('going_quiet', () => {
    const expected = new Date(FIXED_NOW - TWENTY_ONE_DAYS_MS);
    const q = buildSegmentQuery(SHOP, 'going_quiet', { requireEmail: true });
    expect(q).toMatchObject({
      ...BASE_EMAIL,
      lastSeenAt: { $lt: expected },
    });
  });

  test('broadcast does not add email guard for push_subscribed (only list uses it)', () => {
    // push_subscribed is NOT in the broadcast's VALID_SEGMENTS; but if called
    // with requireEmail it should still work (the builder is general-purpose).
    const q = buildSegmentQuery(SHOP, 'push_subscribed', { requireEmail: true });
    expect(q['channels.push.subscribed']).toBe(true);
    expect(q.suppressed).toEqual({ $ne: true });
  });
});

// ── requireNotSuppressed only ────────────────────────────────────────────────

test('requireNotSuppressed: true adds suppressed guard but no email guard', () => {
  const q = buildSegmentQuery(SHOP, 'everyone', { requireNotSuppressed: true });
  expect(q.suppressed).toEqual({ $ne: true });
  expect(q.$or).toBeUndefined();
});
