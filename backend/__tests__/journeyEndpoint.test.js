/**
 * Tests for getJourneyData() in backend/routes/events.js.
 *
 * Signal + Profile (via populate) + StorefrontEvent are mocked. These cover
 * the Journey screen's data shape: strongest-signal-per-profile grouping,
 * pagination, and per-profile product-interest extraction.
 */

jest.mock('../models/Signal', () => ({
  find: jest.fn(),
}));
jest.mock('../models/Profile', () => ({}));
jest.mock('../models/StorefrontEvent', () => ({
  find: jest.fn(),
}));

const Signal = require('../models/Signal');
const StorefrontEvent = require('../models/StorefrontEvent');
const { getJourneyData } = require('../routes/events');

const SHOP = 'demo.myshopify.com';

function signalChain(rows) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    populate: jest.fn().mockResolvedValue(rows),
  };
}

function eventChain(rows) {
  return {
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue(rows),
  };
}

function profile(id, overrides = {}) {
  return {
    _id: id,
    identifiers: { sessionIds: [`sess-${id}`], cartTokens: [] },
    channels: { push: { subscribed: true } },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('a. no signals -> empty customers, total 0, no event lookups', async () => {
  Signal.find.mockReturnValue(signalChain([]));

  const data = await getJourneyData(SHOP, { limit: 50, page: 0 });

  expect(data).toEqual({ customers: [], total: 0 });
  expect(StorefrontEvent.find).not.toHaveBeenCalled();
});

test('b. single profile, single signal -> product interests extracted + sorted', async () => {
  const p1 = profile('p1');
  Signal.find.mockReturnValue(signalChain([
    { profileId: p1, strength: 0.8, type: 'cart_abandon' },
  ]));
  StorefrontEvent.find.mockReturnValue(eventChain([
    { type: 'product_view', meta: { productId: 'A', productTitle: 'Shirt' }, ts: new Date() },
    { type: 'product_view', meta: { productId: 'A', productTitle: 'Shirt' }, ts: new Date() },
    { type: 'product_view', meta: { productId: 'B', productTitle: 'Cap' }, ts: new Date() },
    { type: 'add_to_cart', meta: {}, ts: new Date() },
  ]));

  const data = await getJourneyData(SHOP, { limit: 50, page: 0 });

  expect(data.total).toBe(1);
  expect(data.customers).toHaveLength(1);
  const c = data.customers[0];
  expect(c.topSignal.type).toBe('cart_abandon');
  expect(c.topProducts[0]).toMatchObject({ productId: 'A', title: 'Shirt', count: 2 });
  expect(c.topProducts[1]).toMatchObject({ productId: 'B', title: 'Cap', count: 1 });

  // Queried by this profile's sessionIds + cartTokens combined.
  expect(StorefrontEvent.find).toHaveBeenCalledWith({
    shopDomain: SHOP,
    sessionId: { $in: ['sess-p1'] },
  });
});

test('c. two signals, same profile, sorted desc -> strongest kept as topSignal, both kept in signals[]', async () => {
  const p1 = profile('p1');
  Signal.find.mockReturnValue(signalChain([
    { profileId: p1, strength: 0.9, type: 'high_intent' },
    { profileId: p1, strength: 0.3, type: 'lapsing' },
  ]));
  StorefrontEvent.find.mockReturnValue(eventChain([]));

  const data = await getJourneyData(SHOP, { limit: 50, page: 0 });

  expect(data.customers).toHaveLength(1);
  expect(data.customers[0].topSignal.type).toBe('high_intent');
  expect(data.customers[0].signals.map((s) => s.type)).toEqual(['high_intent', 'lapsing']);
});

test('d. pagination -> only the requested page is resolved against StorefrontEvent', async () => {
  const p1 = profile('p1');
  const p2 = profile('p2');
  const p3 = profile('p3');
  Signal.find.mockReturnValue(signalChain([
    { profileId: p1, strength: 0.9, type: 'high_intent' },
    { profileId: p2, strength: 0.7, type: 'cart_abandon' },
    { profileId: p3, strength: 0.5, type: 'lapsing' },
  ]));
  StorefrontEvent.find.mockReturnValue(eventChain([]));

  const data = await getJourneyData(SHOP, { limit: 2, page: 1 });

  // total reflects all profiles with signals, not just this page
  expect(data.total).toBe(3);
  // page 1 (0-indexed) of size 2 -> only the 3rd profile (p3)
  expect(data.customers).toHaveLength(1);
  expect(StorefrontEvent.find).toHaveBeenCalledTimes(1);
});
