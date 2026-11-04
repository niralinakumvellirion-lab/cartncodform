jest.mock('../models/Store');
jest.mock('../utils/bootstrapStore');

const Store = require('../models/Store');
const { bootstrapStore } = require('../utils/bootstrapStore');
const { requireStoreOwner } = require('../middleware/requireOwner');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockReq(shopDomain, userEmail) {
  return {
    params: { shopDomain },
    userEmail,
  };
}

describe('requireStoreOwner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calls next() and sets req.store when the token shop matches the path shop', async () => {
    const fakeStore = { shopDomain: 'test-shop.myshopify.com', ownerEmail: 'owner@example.com', plan: 'pro' };
    Store.findOne.mockResolvedValue(fakeStore);

    const req = { shopDomain: 'test-shop.myshopify.com', params: { shopDomain: 'test-shop.myshopify.com' } };
    const res = mockRes();
    const next = jest.fn();

    await requireStoreOwner(req, res, next);

    expect(Store.findOne).toHaveBeenCalledWith({ shopDomain: 'test-shop.myshopify.com' });
    expect(req.store).toBe(fakeStore);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 404 when the shop is not found in the DB', async () => {
    Store.findOne.mockResolvedValue(null);

    const req = { shopDomain: 'test-shop.myshopify.com', params: { shopDomain: 'test-shop.myshopify.com' } };
    const res = mockRes();
    const next = jest.fn();

    await requireStoreOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 404 when no store exists for that shopDomain', async () => {
    Store.findOne.mockResolvedValue(null);

    const req = mockReq('unknown-shop.myshopify.com', 'owner@example.com');
    const res = mockRes();
    const next = jest.fn();

    await requireStoreOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when the store has no ownerEmail on record', async () => {
    Store.findOne.mockResolvedValue({ shopDomain: 'shop.myshopify.com', ownerEmail: null, plan: 'pro' });

    const req = mockReq('shop.myshopify.com', 'someone@example.com');
    const res = mockRes();
    const next = jest.fn();

    await requireStoreOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when the authenticated email does not match the store owner', async () => {
    Store.findOne.mockResolvedValue({ shopDomain: 'shop.myshopify.com', ownerEmail: 'real-owner@example.com' });

    const req = mockReq('shop.myshopify.com', 'attacker@example.com');
    const res = mockRes();
    const next = jest.fn();

    await requireStoreOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when the token shop does not match the path shop (IDOR protection)', async () => {
    Store.findOne.mockResolvedValue({ shopDomain: 'shop-a.myshopify.com', ownerEmail: 'owner@example.com' });

    const req = { shopDomain: 'shop-a.myshopify.com', params: { shopDomain: 'shop-b.myshopify.com' } };
    const res = mockRes();
    const next = jest.fn();

    await requireStoreOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 500 when the database query throws', async () => {
    Store.findOne.mockRejectedValue(new Error('connection lost'));

    const req = mockReq('shop.myshopify.com', 'owner@example.com');
    const res = mockRes();
    const next = jest.fn();

    await requireStoreOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  test('IDOR check: cannot access a different shop by matching only the email, not shop ownership', async () => {
    // Simulates: attacker knows their own email is a valid owner email
    // for SOME shop, but tries a different shop's domain in the URL.
    Store.findOne.mockResolvedValue({ shopDomain: 'victim-shop.myshopify.com', ownerEmail: 'victim@example.com' });

    const req = mockReq('victim-shop.myshopify.com', 'attacker@example.com');
    const res = mockRes();
    const next = jest.fn();

    await requireStoreOwner(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(req.store).toBeUndefined();
  });
});

describe('requireStoreOwner - shop Shopify installed by itself', () => {
  const SHOP = 'review-shop.myshopify.com';
  const req = (header = 'Bearer session-jwt', over = {}) => ({
    shopDomain: SHOP,
    params: { shopDomain: SHOP },
    get: (h) => (h.toLowerCase() === 'authorization' ? header : undefined),
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  test('sets the Store up from the request own session token, then carries on', async () => {
    Store.findOne.mockResolvedValue(null);
    const fresh = { shopDomain: SHOP, plan: 'pro' };
    bootstrapStore.mockResolvedValue(fresh);
    const r = req();
    const res = mockRes();
    const next = jest.fn();
    await requireStoreOwner(r, res, next);
    expect(bootstrapStore).toHaveBeenCalledWith(SHOP, 'session-jwt');
    expect(r.store).toBe(fresh);
    expect(next).toHaveBeenCalledWith();
  });

  test('a new store without a subscription carries on as the Free plan', async () => {
    Store.findOne.mockResolvedValue(null);
    const fresh = { shopDomain: SHOP, plan: 'free' };
    bootstrapStore.mockResolvedValue(fresh);
    const r = req();
    const res = mockRes();
    const next = jest.fn();
    await requireStoreOwner(r, res, next);
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
    expect(r.store).toBe(fresh);
  });

  test('says so (503) when the set-up fails, instead of "Store not found"', async () => {
    Store.findOne.mockResolvedValue(null);
    bootstrapStore.mockResolvedValue(null);
    const res = mockRes();
    const next = jest.fn();
    await requireStoreOwner(req(), res, next);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'STORE_SETUP_FAILED' }));
    expect(next).not.toHaveBeenCalled();
  });

  test('without a bearer token it stays a plain 404 and never calls Shopify', async () => {
    Store.findOne.mockResolvedValue(null);
    const res = mockRes();
    await requireStoreOwner(req(''), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(bootstrapStore).not.toHaveBeenCalled();
  });

  test('a header that is not a Bearer token is treated as no token', async () => {
    Store.findOne.mockResolvedValue(null);
    const res = mockRes();
    await requireStoreOwner(req('Basic abc123'), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(bootstrapStore).not.toHaveBeenCalled();
  });

  test('a known, installed Store never triggers a set-up', async () => {
    Store.findOne.mockResolvedValue({ shopDomain: SHOP, plan: 'pro', subscriptionStatus: 'ACTIVE' });
    const next = jest.fn();
    await requireStoreOwner(req(), mockRes(), next);
    expect(bootstrapStore).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith();
  });

  test('a Store marked uninstalled is refreshed; the old one is used if that fails', async () => {
    const old = { shopDomain: SHOP, plan: 'pro', subscriptionStatus: 'uninstalled' };
    Store.findOne.mockResolvedValue(old);
    bootstrapStore.mockResolvedValue({ shopDomain: SHOP, plan: 'pro', subscriptionStatus: null });
    const r1 = req();
    await requireStoreOwner(r1, mockRes(), jest.fn());
    expect(r1.store.subscriptionStatus).toBeNull();

    bootstrapStore.mockResolvedValue(null);
    const r2 = req();
    const next = jest.fn();
    await requireStoreOwner(r2, mockRes(), next);
    expect(r2.store).toBe(old);
    expect(next).toHaveBeenCalledWith();
  });

  test('another shop URL is still refused (403) after the token own shop is set up', async () => {
    Store.findOne.mockResolvedValue(null);
    bootstrapStore.mockResolvedValue({ shopDomain: SHOP, plan: 'pro' });
    const res = mockRes();
    const next = jest.fn();
    await requireStoreOwner(req('Bearer x', { params: { shopDomain: 'victim.myshopify.com' } }), res, next);
    expect(bootstrapStore).toHaveBeenCalledWith(SHOP, 'x');
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
