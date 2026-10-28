'use strict';
/**
 * Tests for Task A: API version constant, REST→GraphQL migrations,
 * scope consistency guard, and hardcoded-version guard.
 */

const fs   = require('fs');
const path = require('path');

// ── Model mocks (prevent mongoose connection) ─────────────────────────────────
jest.mock('../models/Store', () => ({
  findOne: jest.fn(),
  updateOne: jest.fn().mockResolvedValue({}),
}));
jest.mock('../models/ProductImageCache', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn().mockResolvedValue({}),
  deleteOne: jest.fn().mockResolvedValue({}),
}));

// ── axios mock (for fetchShopInfo in shopify.js) ──────────────────────────────
const axios = require('axios');
jest.mock('axios');

// ── Partial mock of shopify.js for productImage.js dependency ─────────────────
jest.mock('../utils/shopify', () => {
  const actual = jest.requireActual('../utils/shopify');
  return {
    ...actual,
    refreshAccessTokenIfNeeded: jest.fn().mockResolvedValue('tok_test'),
  };
});

// ── global fetch mock ─────────────────────────────────────────────────────────
global.fetch = jest.fn();

const { fetchShopInfo, API_VERSION } = require('../utils/shopify');
const { fetchProductImage }          = require('../utils/productImage');
const storesRouter                   = require('../routes/stores');
const { mapProductNodes }            = storesRouter;
const Store                          = require('../models/Store');
const ProductImageCache              = require('../models/ProductImageCache');

beforeEach(() => {
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// A — fetchShopInfo (GraphQL replacement for REST shop.json)
// ═════════════════════════════════════════════════════════════════════════════

describe('fetchShopInfo — GraphQL', () => {
  const SHOP = 'demo.myshopify.com';
  const TOKEN = 'shpat_test';

  test('A1: success — returns email, ianaTimezone, shopName', async () => {
    axios.post.mockResolvedValueOnce({
      data: { data: { shop: { email: 'owner@demo.com', ianaTimezone: 'Asia/Kolkata', name: 'Demo Store' } } },
    });

    const result = await fetchShopInfo(SHOP, TOKEN);

    expect(result).toEqual({
      email: 'owner@demo.com',
      ianaTimezone: 'Asia/Kolkata',
      shopName: 'Demo Store',
    });
    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toContain(`/admin/api/${API_VERSION}/graphql.json`);
    expect(body.query).toContain('ianaTimezone');
    expect(opts.headers['X-Shopify-Access-Token']).toBe(TOKEN);
  });

  test('A2: old REST shape — ianaTimezone NOT read from iana_timezone key', async () => {
    // The OLD REST response had { shop: { iana_timezone: '...' } }
    // The new GQL response has  { data: { shop: { ianaTimezone: '...' } } }
    // This test proves the new code reads the GQL key, not the REST key.
    axios.post.mockResolvedValueOnce({
      data: { data: { shop: { email: null, ianaTimezone: 'America/New_York', name: null } } },
    });
    const result = await fetchShopInfo(SHOP, TOKEN);
    expect(result.ianaTimezone).toBe('America/New_York');
  });

  test('A3: HTTP error — returns null fields, no throw', async () => {
    axios.post.mockRejectedValueOnce(Object.assign(new Error('net'), {
      response: { data: { errors: ['Unauthorized'] } },
    }));
    const result = await fetchShopInfo(SHOP, TOKEN);
    expect(result).toEqual({ email: null, ianaTimezone: null, shopName: null });
  });

  test('A4: GraphQL errors array in response — returns null fields', async () => {
    axios.post.mockResolvedValueOnce({
      data: { errors: [{ message: 'Access denied' }], data: null },
    });
    // fetchShopInfo reads data.data.shop which is null — returns nulls
    const result = await fetchShopInfo(SHOP, TOKEN);
    expect(result).toEqual({ email: null, ianaTimezone: null, shopName: null });
  });

  test('A5: empty shop object — returns null fields', async () => {
    axios.post.mockResolvedValueOnce({ data: { data: { shop: null } } });
    const result = await fetchShopInfo(SHOP, TOKEN);
    expect(result).toEqual({ email: null, ianaTimezone: null, shopName: null });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// B — mapProductNodes (GraphQL replacement for REST products.json)
// ═════════════════════════════════════════════════════════════════════════════

describe('mapProductNodes — shape equals old REST shape', () => {
  // Fixture: what the OLD REST endpoint produced after mapping
  const OLD_REST_SHAPE = [
    { id: 8431650488501, title: 'Classic Tote', handle: 'classic-tote',
      imageUrl: 'https://cdn.shopify.com/img.jpg', status: 'active' },
    { id: 9999999999999, title: 'No Image',    handle: 'no-image',
      imageUrl: null, status: 'active' },
  ];

  // Fixture: what the NEW GraphQL endpoint returns
  const GQL_NODES = [
    { id: 'gid://shopify/Product/8431650488501', title: 'Classic Tote',
      handle: 'classic-tote', featuredImage: { url: 'https://cdn.shopify.com/img.jpg' },
      status: 'ACTIVE' },
    { id: 'gid://shopify/Product/9999999999999', title: 'No Image',
      handle: 'no-image', featuredImage: null, status: 'ACTIVE' },
  ];

  test('B1: mapped GQL nodes equal old REST shape', () => {
    expect(mapProductNodes(GQL_NODES)).toEqual(OLD_REST_SHAPE);
  });

  test('B2: numeric id extracted from GID', () => {
    const [first] = mapProductNodes(GQL_NODES);
    expect(typeof first.id).toBe('number');
    expect(first.id).toBe(8431650488501);
  });

  test('B3: status lowercased (ACTIVE → active)', () => {
    const [first] = mapProductNodes(GQL_NODES);
    expect(first.status).toBe('active');
  });

  test('B4: null featuredImage → imageUrl: null', () => {
    const [, second] = mapProductNodes(GQL_NODES);
    expect(second.imageUrl).toBeNull();
  });

  test('B5: empty nodes → empty array', () => {
    expect(mapProductNodes([])).toEqual([]);
  });

  test('B6: images.nodes fallback not in mapProductNodes (route handles gqlData.errors)', () => {
    // mapProductNodes only handles the success case (status present, id present).
    // Verify no throw on a minimal valid node.
    const minimal = [{ id: 'gid://shopify/Product/1', title: 'X', handle: 'x',
      featuredImage: null, status: 'ACTIVE' }];
    expect(() => mapProductNodes(minimal)).not.toThrow();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C — fetchProductImage (GraphQL replacement for REST products/{id}.json)
// ═════════════════════════════════════════════════════════════════════════════

describe('fetchProductImage — GraphQL', () => {
  const SHOP = 'demo.myshopify.com';
  const PRODUCT_ID = '8431650488501';
  const IMG_URL = 'https://cdn.shopify.com/s/files/1/product.jpg';

  beforeEach(() => {
    Store.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        shopDomain: SHOP,
        accessToken: 'tok_offline',
        accessTokenExpiresAt: new Date(Date.now() + 3600000),
        onlineAccessToken: null,
        onlineTokenExpiresAt: null,
      }),
    });
    ProductImageCache.findOne.mockReturnValue({
      // cache miss by default
      then: undefined,
      lean: undefined,
    });
    // Default: cache miss (no document)
    ProductImageCache.findOne.mockResolvedValue(null);
  });

  test('C1: success — featuredImage.url returned', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { product: { featuredImage: { url: IMG_URL }, images: { nodes: [] } } },
      }),
    });

    const result = await fetchProductImage(SHOP, 'tok', PRODUCT_ID);
    expect(result).toBe(IMG_URL);

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toContain(`/admin/api/${API_VERSION}/graphql.json`);
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.variables.id).toBe(`gid://shopify/Product/${PRODUCT_ID}`);
  });

  test('C2: images.nodes fallback when featuredImage is null', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { product: { featuredImage: null, images: { nodes: [{ url: IMG_URL }] } } },
      }),
    });
    const result = await fetchProductImage(SHOP, 'tok', PRODUCT_ID);
    expect(result).toBe(IMG_URL);
  });

  test('C3: product has no image → returns null', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { product: { featuredImage: null, images: { nodes: [] } } },
      }),
    });
    const result = await fetchProductImage(SHOP, 'tok', PRODUCT_ID);
    expect(result).toBeNull();
  });

  test('C4: HTTP error (non-ok) → returns null', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 401 });
    const result = await fetchProductImage(SHOP, 'tok', PRODUCT_ID);
    expect(result).toBeNull();
  });

  test('C5: GraphQL errors in response → returns null', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ errors: [{ message: 'Access denied' }], data: null }),
    });
    const result = await fetchProductImage(SHOP, 'tok', PRODUCT_ID);
    expect(result).toBeNull();
  });

  test('C6: network throw → returns null', async () => {
    global.fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await fetchProductImage(SHOP, 'tok', PRODUCT_ID);
    expect(result).toBeNull();
  });

  test('C7: no productId → returns null immediately', async () => {
    const result = await fetchProductImage(SHOP, 'tok', null);
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GUARD — no hardcoded /admin/api/<year>-<month> in production code
// ═════════════════════════════════════════════════════════════════════════════

describe('Guard: no hardcoded Admin API version strings in production code', () => {
  const PROD_DIRS = [
    path.join(__dirname, '../routes'),
    path.join(__dirname, '../utils'),
    path.join(__dirname, '../services'),
  ];
  // The constant definition line in shopify.js is allowed
  const ALLOWED_PATTERN = /const API_VERSION = '/;
  // Pattern that catches /admin/api/20XX-XX (REST or GraphQL URL)
  const HARDCODED_VER = /\/admin\/api\/20\d\d-\d\d/;

  function collectJsFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      if (e.isDirectory()) return collectJsFiles(path.join(dir, e.name));
      if (e.name.endsWith('.js')) return [path.join(dir, e.name)];
      return [];
    });
  }

  test('no production file has a hardcoded /admin/api/20XX-XX string', () => {
    const files = PROD_DIRS.flatMap(collectJsFiles);
    const violations = [];
    for (const f of files) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (HARDCODED_VER.test(line) && !ALLOWED_PATTERN.test(line)) {
          violations.push(`${f}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    if (violations.length > 0) {
      fail(
        'Hardcoded Admin API version strings found in production code:\n' +
        violations.join('\n')
      );
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GUARD — scope string in shopify.js matches shopify.app.toml
// ═════════════════════════════════════════════════════════════════════════════

describe('Guard: SCOPES in shopify.js matches shopify.app.toml', () => {
  test('both scope strings are identical', () => {
    const shopifyJsPath = path.join(__dirname, '../utils/shopify.js');
    const tomlPath      = path.join(__dirname, '../../shopify.app.toml');

    const jsText   = fs.readFileSync(shopifyJsPath, 'utf8');
    const tomlText = fs.readFileSync(tomlPath, 'utf8');

    const jsMatch   = jsText.match(/const SCOPES\s*=\s*'([^']+)'/);
    const tomlMatch = tomlText.match(/scopes\s*=\s*"([^"]+)"/);

    expect(jsMatch).not.toBeNull();
    expect(tomlMatch).not.toBeNull();

    const jsScopes   = jsMatch[1].split(',').sort().join(',');
    const tomlScopes = tomlMatch[1].split(',').sort().join(',');

    expect(jsScopes).toBe(tomlScopes);
  });
});
