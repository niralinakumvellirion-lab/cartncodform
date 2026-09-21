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
jest.mock('../models/ProductImageCache', () => ({
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
}));
jest.mock('../utils/productImage', () => ({
  normalizeImageUrl: jest.requireActual('../utils/productImage').normalizeImageUrl,
  fetchProductImageWithTimeout: jest.fn(),
}));

const Signal = require('../models/Signal');
const StorefrontEvent = require('../models/StorefrontEvent');
const ProductImageCache = require('../models/ProductImageCache');
const { fetchProductImageWithTimeout } = require('../utils/productImage');
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

function imageCacheChain(rows) {
  return {
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
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
  // Default: no cached images, so tests that don't care about imageUrl
  // don't need to stub this themselves.
  ProductImageCache.find.mockReturnValue(imageCacheChain([]));
  ProductImageCache.findOneAndUpdate.mockResolvedValue({});
  fetchProductImageWithTimeout.mockResolvedValue(null);
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
  ProductImageCache.find.mockReturnValue(imageCacheChain([
    { productId: 'A', imageUrl: 'https://cdn.example.com/a.jpg' },
  ]));

  const data = await getJourneyData(SHOP, { limit: 50, page: 0 });

  expect(data.total).toBe(1);
  expect(data.customers).toHaveLength(1);
  const c = data.customers[0];
  expect(c.topSignal.type).toBe('cart_abandon');
  expect(c.topProducts[0]).toMatchObject({ productId: 'A', title: 'Shirt', count: 2, imageUrl: 'https://cdn.example.com/a.jpg' });
  expect(c.topProducts[1]).toMatchObject({ productId: 'B', title: 'Cap', count: 1, imageUrl: null });
  expect(ProductImageCache.find).toHaveBeenCalledWith({
    shopDomain: SHOP,
    productId: { $in: ['A', 'B'] },
  });

  // Queried by this profile's sessionIds + cartTokens combined, filtered to
  // the 4 event types the Journey timeline displays (journey-filter task).
  expect(StorefrontEvent.find).toHaveBeenCalledWith({
    shopDomain: SHOP,
    sessionId: { $in: ['sess-p1'] },
    type: { $in: ['page_view', 'push_prompt_shown', 'push_prompt_accepted', 'product_view'] },
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

describe('topProducts imageUrl resolution', () => {
  function setup(events) {
    const p1 = profile('p1');
    Signal.find.mockReturnValue(signalChain([
      { profileId: p1, strength: 0.8, type: 'cart_abandon' },
    ]));
    StorefrontEvent.find.mockReturnValue(eventChain(events));
  }
  const view = (productId, imageUrl, ts) => ({
    type: 'product_view',
    meta: { productId, productTitle: `T${productId}`, imageUrl },
    ts: new Date(ts),
  });
  const flush = () => new Promise((r) => setImmediate(r));

  test('cache hit wins over the event image and the API; nothing is written', async () => {
    setup([view('A', 'https://cdn.example.com/event.jpg', 1)]);
    ProductImageCache.find.mockReturnValue(imageCacheChain([
      { productId: 'A', imageUrl: 'https://cdn.example.com/cached.jpg' },
    ]));

    const data = await getJourneyData(SHOP, {});

    expect(data.customers[0].topProducts[0].imageUrl).toBe('https://cdn.example.com/cached.jpg');
    expect(fetchProductImageWithTimeout).not.toHaveBeenCalled();
    expect(ProductImageCache.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('cache miss -> latest non-empty event og:image, normalised, and cached', async () => {
    // events arrive newest-first from Mongo and are reversed by the code
    setup([
      view('A', '', 3),
      view('A', '//cdn.shopify.com/newest.jpg', 2),
      view('A', 'https://cdn.shopify.com/older.jpg', 1),
    ]);

    const data = await getJourneyData(SHOP, {});

    // after reverse: older(1), newest(2), empty(3) -> last non-empty = newest
    expect(data.customers[0].topProducts[0].imageUrl).toBe('https://cdn.shopify.com/newest.jpg');
    expect(fetchProductImageWithTimeout).not.toHaveBeenCalled();
    expect(ProductImageCache.findOneAndUpdate).toHaveBeenCalledWith(
      { shopDomain: SHOP, productId: 'A' },
      expect.objectContaining({ imageUrl: 'https://cdn.shopify.com/newest.jpg' }),
      { upsert: true }
    );
  });

  test('non-http event image is treated as missing -> Admin API fallback', async () => {
    setup([view('A', 'javascript:alert(1)', 1)]);
    fetchProductImageWithTimeout.mockResolvedValue('https://cdn.shopify.com/api.jpg');

    const data = await getJourneyData(SHOP, {});

    expect(fetchProductImageWithTimeout).toHaveBeenCalledWith(SHOP, 'A', 3000);
    expect(data.customers[0].topProducts[0].imageUrl).toBe('https://cdn.shopify.com/api.jpg');
    // the API helper caches its own result; the route must not double-write
    expect(ProductImageCache.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('all three sources fail -> imageUrl null, response shape unchanged', async () => {
    setup([view('A', undefined, 1)]);

    const data = await getJourneyData(SHOP, {});

    expect(data.customers[0].topProducts[0]).toEqual({
      productId: 'A', title: 'TA', count: 1, lastSeen: expect.any(Date), imageUrl: null,
    });
  });

  test('a failing cache write never fails the request', async () => {
    setup([view('A', 'https://cdn.shopify.com/x.jpg', 1)]);
    ProductImageCache.findOneAndUpdate.mockRejectedValue(new Error('db down'));

    const data = await getJourneyData(SHOP, {});
    await flush();

    expect(data.customers[0].topProducts[0].imageUrl).toBe('https://cdn.shopify.com/x.jpg');
  });

  test('at most 3 products are resolved via the Admin API', async () => {
    setup([view('A', '', 1), view('B', '', 1), view('C', '', 1), view('D', '', 1)]);

    await getJourneyData(SHOP, {});

    expect(fetchProductImageWithTimeout).toHaveBeenCalledTimes(3);
  });
});
