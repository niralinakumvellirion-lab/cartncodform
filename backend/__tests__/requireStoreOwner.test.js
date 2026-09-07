jest.mock('../models/Store');

const Store = require('../models/Store');
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
    const fakeStore = { shopDomain: 'test-shop.myshopify.com', ownerEmail: 'owner@example.com', plan: 'free' };
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
    Store.findOne.mockResolvedValue({ shopDomain: 'shop.myshopify.com', ownerEmail: null });

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
