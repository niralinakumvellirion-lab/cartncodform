'use strict';

/**
 * utils/productImage.js — fetchProductImage token loading, id/handle lookups, and productRefFromUrl.
 */

const mockSelect = jest.fn();
jest.mock('../models/Store', () => ({
  findOne: jest.fn(() => ({ select: (...args) => mockSelect(...args) })),
}));
jest.mock('../models/ProductImageCache', () => ({
  findOne: jest.fn(),
  deleteOne: jest.fn(() => Promise.resolve()),
  findOneAndUpdate: jest.fn(() => Promise.resolve()),
}));
jest.mock('../utils/shopify', () => ({
  API_VERSION: '2026-10',
  refreshAccessTokenIfNeeded: jest.fn(async (store) => store.accessToken),
}));

const ProductImageCache = require('../models/ProductImageCache');
const { refreshAccessTokenIfNeeded } = require('../utils/shopify');
const { fetchProductImage, productRefFromUrl } = require('../utils/productImage');

const SHOP = 'demo.myshopify.com';

function okResponse(data) {
  return { ok: true, json: async () => ({ data }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  ProductImageCache.findOne.mockResolvedValue(null);
  mockSelect.mockResolvedValue({ shopDomain: SHOP, accessToken: 'tok' });
  global.fetch = jest.fn();
});
afterEach(() => jest.restoreAllMocks());

describe('token loading', () => {
  test('selects the refresh token fields, so an expired expiring token can be renewed', async () => {
    global.fetch.mockResolvedValue(okResponse({ product: { featuredImage: { url: 'https://cdn/x.jpg' } } }));
    await fetchProductImage(SHOP, 'stale', '123');
    const fields = mockSelect.mock.calls[0][0].split(' ');
    for (const f of ['accessToken', 'accessTokenExpiresAt', 'refreshToken', 'refreshTokenExpiresAt', 'onlineAccessToken', 'onlineTokenExpiresAt']) {
      expect(fields).toContain(f);
    }
  });

  test('uses the token the shared policy returns, not the stale one passed in', async () => {
    refreshAccessTokenIfNeeded.mockResolvedValue('renewed');
    global.fetch.mockResolvedValue(okResponse({ product: { featuredImage: { url: 'https://cdn/x.jpg' } } }));
    await fetchProductImage(SHOP, 'stale', '123');
    expect(global.fetch.mock.calls[0][1].headers['X-Shopify-Access-Token']).toBe('renewed');
  });
});

describe('lookup by numeric id or handle', () => {
  test('numeric id uses product(id:)', async () => {
    global.fetch.mockResolvedValue(okResponse({ product: { featuredImage: { url: 'https://cdn/a.jpg' } } }));
    expect(await fetchProductImage(SHOP, 't', '987654')).toBe('https://cdn/a.jpg');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.query).toMatch(/product\(id: \$id\)/);
    expect(body.variables).toEqual({ id: 'gid://shopify/Product/987654' });
  });

  test('a handle uses a products search and reads the first node', async () => {
    global.fetch.mockResolvedValue(okResponse({ products: { nodes: [{ featuredImage: null, images: { nodes: [{ url: 'https://cdn/b.jpg' }] } }] } }));
    expect(await fetchProductImage(SHOP, 't', 'banarasi-silk-saree')).toBe('https://cdn/b.jpg');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.query).toMatch(/products\(first: 1, query: \$q\)/);
    expect(body.variables).toEqual({ q: 'handle:banarasi-silk-saree' });
  });

  test('a handle with unsafe characters is rejected without calling Shopify', async () => {
    expect(await fetchProductImage(SHOP, 't', 'x OR vendor:evil')).toBeNull();
    expect(await fetchProductImage(SHOP, 't', 'a"b')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('no match -> null, nothing cached', async () => {
    global.fetch.mockResolvedValue(okResponse({ products: { nodes: [] } }));
    expect(await fetchProductImage(SHOP, 't', 'missing-handle')).toBeNull();
    expect(ProductImageCache.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('a found image is cached under the reference used', async () => {
    global.fetch.mockResolvedValue(okResponse({ products: { nodes: [{ featuredImage: { url: 'https://cdn/c.jpg' } }] } }));
    await fetchProductImage(SHOP, 't', 'some-handle');
    expect(ProductImageCache.findOneAndUpdate.mock.calls[0][0]).toEqual({ shopDomain: SHOP, productId: 'some-handle' });
  });

  test('cache hit skips Shopify entirely', async () => {
    ProductImageCache.findOne.mockResolvedValue({ imageUrl: 'https://cdn/cached.jpg' });
    expect(await fetchProductImage(SHOP, 't', '123')).toBe('https://cdn/cached.jpg');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('HTTP error and network error return null instead of throwing', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403 });
    expect(await fetchProductImage(SHOP, 't', '123')).toBeNull();
    global.fetch.mockRejectedValueOnce(new Error('network'));
    expect(await fetchProductImage(SHOP, 't', '123')).toBeNull();
  });
});

describe('productRefFromUrl', () => {
  test.each([
    ['https://shop.com/products/12345', '12345'],
    ['https://shop.com/products/my-handle?ccf=1', 'my-handle'],
    ['https://shop.com/products/my-handle#top', 'my-handle'],
    ['https://shop.com/products/my-handle/', 'my-handle'],
    ['https://shop.com', null],
    ['https://shop.com/collections/all', null],
    ['', null],
    [undefined, null],
  ])('%s -> %s', (url, expected) => {
    expect(productRefFromUrl(url)).toBe(expected);
  });
});
