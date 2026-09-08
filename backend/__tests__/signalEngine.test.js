/**
 * Unit tests for backend/services/signalEngine.js.
 *
 * All four models the engine touches are auto-mocked; each test stubs only
 * the calls its code path makes. The engine queries with the
 * (filter, projection, options) form, so every DB call is a plain thenable
 * and `mockResolvedValue` / `mockImplementation` is enough — no `.sort()`
 * chain to fake.
 */

jest.mock('../models/Profile');
jest.mock('../models/Signal');
jest.mock('../models/AbandonedCustomer');
jest.mock('../models/StorefrontEvent');

const Profile = require('../models/Profile');
const Signal = require('../models/Signal');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const StorefrontEvent = require('../models/StorefrontEvent');

const {
  computeCartAbandon,
  computeCheckoutAbandon,
  computeBrowseAbandon,
  computeHighIntent,
  computeLapsing,
  computeWinback,
  computeEmailCapture,
  computeCodToPrepaid,
  computeSignalsForProfile,
} = require('../services/signalEngine');

const SHOP = 'demo.myshopify.com';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(Date.now() - ms);

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
  jest.clearAllMocks();
  // Safe defaults so unrelated compute functions in the orchestrator no-op.
  AbandonedCustomer.findOne.mockResolvedValue(null);
  StorefrontEvent.findOne.mockResolvedValue(null);
  StorefrontEvent.find.mockResolvedValue([]);
  Signal.findOneAndUpdate.mockResolvedValue({});
  Signal.deleteMany.mockResolvedValue({ deletedCount: 0 });
});

describe('computeCartAbandon', () => {
  test('1. returns null when no AbandonedCustomer exists', async () => {
    AbandonedCustomer.findOne.mockResolvedValue(null);
    const r = await computeCartAbandon({ identifiers: { cartTokens: ['c1'] } }, SHOP);
    expect(r).toBeNull();
  });

  test('2. strength 1.0 for a cart < 2h old', async () => {
    AbandonedCustomer.findOne.mockResolvedValue({
      createdAt: ago(90 * MIN),
      cartValue: 500,
      cartItems: [{ productId: 42, title: 'Silk Saree' }],
      status: 'abandoned',
    });
    const r = await computeCartAbandon({ identifiers: { cartTokens: ['c1'] } }, SHOP);
    expect(r.type).toBe('cart_abandon');
    expect(r.strength).toBe(1.0);
    expect(r.productId).toBe('42');
    expect(r.evidence.some((e) => e.includes('Cart value'))).toBe(true);
  });

  test('3. strength 0.6 for a cart 7h old', async () => {
    AbandonedCustomer.findOne.mockResolvedValue({
      createdAt: ago(7 * HOUR),
      cartValue: 999,
      cartItems: [{ productId: 7 }],
      status: 'abandoned',
    });
    const r = await computeCartAbandon({ identifiers: { cartTokens: ['c1'] } }, SHOP);
    expect(r.strength).toBe(0.6);
  });

  test('4. queries only status:"abandoned" (recovered carts never match)', async () => {
    AbandonedCustomer.findOne.mockResolvedValue(null);
    const r = await computeCartAbandon({ identifiers: { cartTokens: ['c1'] } }, SHOP);
    expect(r).toBeNull();
    expect(AbandonedCustomer.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'abandoned' }),
      null,
      expect.any(Object)
    );
  });

  test('returns null when cart is younger than 60 min', async () => {
    AbandonedCustomer.findOne.mockResolvedValue({
      createdAt: ago(20 * MIN),
      cartValue: 100,
      cartItems: [],
      status: 'abandoned',
    });
    const r = await computeCartAbandon({ identifiers: { cartTokens: ['c1'] } }, SHOP);
    expect(r).toBeNull();
  });
});

describe('computeBrowseAbandon', () => {
  test('5. returns null when a product_view AND an add_to_cart exist in the window', async () => {
    StorefrontEvent.findOne.mockImplementation((f) =>
      Promise.resolve(
        f.type === 'product_view'
          ? { sessionId: 's1', ts: ago(10 * MIN), meta: { productId: 7 } }
          : { sessionId: 's1' } // add_to_cart present
      )
    );
    const r = await computeBrowseAbandon({ identifiers: { sessionIds: ['s1'] } }, SHOP);
    expect(r).toBeNull();
  });

  test('6. returns a signal when only a product_view exists', async () => {
    StorefrontEvent.findOne.mockImplementation((f) =>
      Promise.resolve(
        f.type === 'product_view'
          ? { sessionId: 's1', ts: ago(12 * MIN), meta: { productId: 7 } }
          : null
      )
    );
    const r = await computeBrowseAbandon({ identifiers: { sessionIds: ['s1'] } }, SHOP);
    expect(r.type).toBe('browse_abandon');
    expect(r.strength).toBe(0.5);
    expect(r.productId).toBe('7');
  });
});

describe('computeHighIntent', () => {
  test('7. returns a signal when the same product is viewed 2+ times in one session', async () => {
    StorefrontEvent.find.mockResolvedValue([
      { sessionId: 's1', meta: { productId: 9 }, ts: ago(30 * MIN) },
      { sessionId: 's1', meta: { productId: 9 }, ts: ago(50 * MIN) },
    ]);
    const r = await computeHighIntent({ identifiers: { sessionIds: ['s1'] } }, SHOP);
    expect(r.type).toBe('high_intent');
    expect(r.strength).toBe(0.75);
    expect(r.productId).toBe('9');
    expect(r.evidence[0]).toContain('2 times');
  });

  test('8. returns null when the views are for different products', async () => {
    StorefrontEvent.find.mockResolvedValue([
      { sessionId: 's1', meta: { productId: 1 }, ts: ago(30 * MIN) },
      { sessionId: 's1', meta: { productId: 2 }, ts: ago(40 * MIN) },
    ]);
    const r = await computeHighIntent({ identifiers: { sessionIds: ['s1'] } }, SHOP);
    expect(r).toBeNull();
  });
});

describe('computeLapsing', () => {
  test('9. returns a signal when lastSeenAt is 25 days ago', async () => {
    const r = await computeLapsing({ lastSeenAt: ago(25 * DAY) }, SHOP);
    expect(r.type).toBe('lapsing');
    expect(r.strength).toBe(0.5);
  });

  test('10. returns null when lastSeenAt is 10 days ago', async () => {
    const r = await computeLapsing({ lastSeenAt: ago(10 * DAY) }, SHOP);
    expect(r).toBeNull();
  });
});

describe('computeWinback', () => {
  test('11. returns null when the profile has no orders', async () => {
    const r = await computeWinback({ lastSeenAt: ago(60 * DAY), orders: { count: 0 } }, SHOP);
    expect(r).toBeNull();
  });

  test('returns a signal at 60 days silent with a prior order', async () => {
    const r = await computeWinback({ lastSeenAt: ago(60 * DAY), orders: { count: 1 } }, SHOP);
    expect(r.type).toBe('winback');
    expect(r.strength).toBe(0.4);
  });
});

describe('computeEmailCapture', () => {
  test('12. returns a signal when push-subscribed with no email on file', async () => {
    const r = await computeEmailCapture(
      { channels: { push: { subscribed: true }, email: {} } },
      SHOP
    );
    expect(r.type).toBe('email_capture');
    expect(r.strength).toBe(0.65);
  });

  test('returns null when an email address is on file', async () => {
    const r = await computeEmailCapture(
      { channels: { push: { subscribed: true }, email: { address: 'x@y.com' } } },
      SHOP
    );
    expect(r).toBeNull();
  });
});

describe('computeCodToPrepaid', () => {
  test('13. returns a signal when codCount>=1 and prepaidCount===0', async () => {
    const r = await computeCodToPrepaid({ orders: { codCount: 2, prepaidCount: 0 } }, SHOP);
    expect(r.type).toBe('cod_to_prepaid');
    expect(r.strength).toBe(0.55);
  });

  test('returns null once a prepaid order exists', async () => {
    const r = await computeCodToPrepaid({ orders: { codCount: 2, prepaidCount: 1 } }, SHOP);
    expect(r).toBeNull();
  });
});

describe('computeSignalsForProfile', () => {
  test('14. deletes stale signals whose type is not in the current results', async () => {
    // Only email_capture will fire (push subscribed, no email); every other
    // compute fn no-ops (empty identifier arrays / empty order stats).
    Profile.findById.mockResolvedValue({
      _id: 'p1',
      shopDomain: SHOP,
      suppressed: false,
      identifiers: { cartTokens: [], sessionIds: [] },
      channels: { push: { subscribed: true }, email: {} },
      orders: {},
    });

    const results = await computeSignalsForProfile('p1', SHOP);

    expect(results.map((r) => r.type)).toEqual(['email_capture']);
    expect(Signal.findOneAndUpdate).toHaveBeenCalledWith(
      { shopDomain: SHOP, profileId: 'p1', type: 'email_capture' },
      expect.objectContaining({ $set: expect.objectContaining({ strength: 0.65 }) }),
      expect.objectContaining({ upsert: true })
    );
    expect(Signal.deleteMany).toHaveBeenCalledWith({
      shopDomain: SHOP,
      profileId: 'p1',
      type: { $nin: ['email_capture'] },
    });
  });

  test('returns [] and writes nothing when the profile is suppressed', async () => {
    Profile.findById.mockResolvedValue({ _id: 'p2', shopDomain: SHOP, suppressed: true });
    const results = await computeSignalsForProfile('p2', SHOP);
    expect(results).toEqual([]);
    expect(Signal.findOneAndUpdate).not.toHaveBeenCalled();
    expect(Signal.deleteMany).not.toHaveBeenCalled();
  });

  test('checkout_abandon: fires only while the cart is still abandoned', async () => {
    StorefrontEvent.findOne.mockImplementation((f) =>
      Promise.resolve(
        f.type === 'reached_checkout' ? { sessionId: 'c1', ts: ago(15 * MIN) } : null
      )
    );
    AbandonedCustomer.findOne.mockResolvedValue({ status: 'abandoned' });
    const r = await computeCheckoutAbandon(
      { identifiers: { cartTokens: ['c1'], sessionIds: [] } },
      SHOP
    );
    expect(r.type).toBe('checkout_abandon');
    expect(r.strength).toBe(0.95);

    AbandonedCustomer.findOne.mockResolvedValue(null); // order placed since
    const r2 = await computeCheckoutAbandon(
      { identifiers: { cartTokens: ['c1'], sessionIds: [] } },
      SHOP
    );
    expect(r2).toBeNull();
  });
});
