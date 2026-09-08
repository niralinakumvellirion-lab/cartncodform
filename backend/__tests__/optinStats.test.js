/**
 * Tests for GET /api/profiles/:shopDomain/optin-stats (Phase D).
 *
 * The auth middleware is replaced with a pass-through that reads the shop from
 * an `x-test-shop` header (so the IDOR path can be exercised), and the
 * StorefrontEvent model is auto-mocked. A throwaway Express app on an ephemeral
 * port is driven with Node's global fetch — no supertest dependency.
 */

jest.mock('../middleware/requireOwner', () => ({
  requireAuth: (req, _res, next) => {
    req.shopDomain = req.headers['x-test-shop'] || 'demo.myshopify.com';
    next();
  },
  requireStoreOwner: (req, res, next) => {
    if (req.shopDomain !== req.params.shopDomain) {
      return res.status(403).json({ error: 'Not authorized for this store' });
    }
    req.store = { shopDomain: req.shopDomain };
    next();
  },
}));
jest.mock('../models/StorefrontEvent');

const express = require('express');
const StorefrontEvent = require('../models/StorefrontEvent');
const profilesRouter = require('../routes/profiles');

const SHOP = 'demo.myshopify.com';
let server;
let base;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/profiles', profilesRouter);
  server = app.listen(0, () => {
    base = `http://127.0.0.1:${server.address().port}`;
    done();
  });
});
afterAll((done) => {
  server.close(done);
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

function getStats(shopInPath = SHOP, shopHeader) {
  return fetch(`${base}/api/profiles/${shopInPath}/optin-stats`, {
    headers: shopHeader ? { 'x-test-shop': shopHeader } : {},
  });
}

test('1. returns { shown: 0, accepted: 0, rate: 0 } when there are no events', async () => {
  StorefrontEvent.countDocuments.mockResolvedValue(0);
  const res = await getStats();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ shown: 0, accepted: 0, rate: 0 });
});

test('2. returns the push_prompt_shown count', async () => {
  StorefrontEvent.countDocuments.mockImplementation((filter) =>
    Promise.resolve(filter.type === 'push_prompt_shown' ? 8 : 0)
  );
  const res = await getStats();
  const body = await res.json();
  expect(body.shown).toBe(8);
});

test('3. only counts accepted events where meta.granted === true', async () => {
  StorefrontEvent.countDocuments.mockImplementation((filter) => {
    if (filter.type === 'push_prompt_accepted') {
      expect(filter['meta.granted']).toBe(true);
      return Promise.resolve(3);
    }
    return Promise.resolve(10);
  });
  const res = await getStats();
  const body = await res.json();
  expect(body.accepted).toBe(3);
});

test('4. rate is accepted / shown rounded to 2 decimals', async () => {
  StorefrontEvent.countDocuments.mockImplementation((filter) =>
    Promise.resolve(filter.type === 'push_prompt_shown' ? 3 : 1)
  );
  const res = await getStats();
  const body = await res.json();
  expect(body.rate).toBe(0.33); // Math.round(1/3 * 100) / 100
});

test('5. IDOR — 403 when the token shop != the path shop', async () => {
  StorefrontEvent.countDocuments.mockResolvedValue(0);
  const res = await getStats(SHOP, 'evil.myshopify.com');
  expect(res.status).toBe(403);
  expect(StorefrontEvent.countDocuments).not.toHaveBeenCalled();
});

test('6. 30-day window is applied to both counts', async () => {
  StorefrontEvent.countDocuments.mockResolvedValue(0);
  await getStats();
  for (const call of StorefrontEvent.countDocuments.mock.calls) {
    expect(call[0].ts).toEqual({ $gte: expect.any(Date) });
  }
});
