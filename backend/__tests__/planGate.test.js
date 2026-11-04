jest.mock('../models/Store');

const Store = require('../models/Store');
const { hasActivePlan } = require('../utils/planAccess');
const {
  requireStoreOwner,
  requireStoreOwnerAnyPlan,
  requireNotSuspended,
} = require('../middleware/requireOwner');

const SHOP = 'gate-shop.myshopify.com';

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function ownerReq() {
  return { shopDomain: SHOP, params: { shopDomain: SHOP } };
}

beforeEach(() => jest.clearAllMocks());

// Free plan: every installed store may use the app (limits live in utils/plans.js).
describe('hasActivePlan', () => {
  test('pro plan → true', () => expect(hasActivePlan({ plan: 'pro' })).toBe(true));
  test('free plan (no subscription) → true', () => expect(hasActivePlan({ plan: 'free' })).toBe(true));
  test('no plan field → true', () => expect(hasActivePlan({})).toBe(true));
  test('cancelled subscription → true (back on Free)', () => expect(hasActivePlan({ plan: 'free', subscriptionStatus: 'CANCELLED' })).toBe(true));
  test('uninstalled → false', () => expect(hasActivePlan({ plan: 'free', subscriptionStatus: 'uninstalled' })).toBe(false));
  test('uninstalled but internal → true', () => expect(hasActivePlan({ subscriptionStatus: 'uninstalled', isInternal: true })).toBe(true));
  test('null store → false', () => expect(hasActivePlan(null)).toBe(false));
});

describe('requireStoreOwner — plan gate', () => {
  test('free store (no subscription) → next(): the Free plan is never blocked', async () => {
    const store = { shopDomain: SHOP, plan: 'free' };
    Store.findOne.mockResolvedValue(store);
    const req = ownerReq();
    const res = mockRes();
    const next = jest.fn();
    await requireStoreOwner(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(req.store).toBe(store);
  });

  test('pro store → next()', async () => {
    Store.findOne.mockResolvedValue({ shopDomain: SHOP, plan: 'pro' });
    const res = mockRes();
    const next = jest.fn();
    await requireStoreOwner(ownerReq(), res, next);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('free but internal store → next()', async () => {
    Store.findOne.mockResolvedValue({ shopDomain: SHOP, plan: 'free', isInternal: true });
    const next = jest.fn();
    await requireStoreOwner(ownerReq(), mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  test('suspended is still reported before the plan check', async () => {
    Store.findOne.mockResolvedValue({ shopDomain: SHOP, plan: 'free', suspended: true });
    const res = mockRes();
    await requireStoreOwner(ownerReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('STORE_SUSPENDED');
  });

  test('wrong shop in path is still 403 (IDOR) even for free store', async () => {
    Store.findOne.mockResolvedValue({ shopDomain: SHOP, plan: 'free' });
    const req = { shopDomain: SHOP, params: { shopDomain: 'other.myshopify.com' } };
    const res = mockRes();
    await requireStoreOwner(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('requireStoreOwnerAnyPlan', () => {
  test('free store → next() and req.store set', async () => {
    const store = { shopDomain: SHOP, plan: 'free' };
    Store.findOne.mockResolvedValue(store);
    const req = ownerReq();
    const next = jest.fn();
    await requireStoreOwnerAnyPlan(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.store).toBe(store);
  });

  test('still blocks a suspended store', async () => {
    Store.findOne.mockResolvedValue({ shopDomain: SHOP, plan: 'pro', suspended: true });
    const res = mockRes();
    await requireStoreOwnerAnyPlan(ownerReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('still blocks a different shop (IDOR)', async () => {
    Store.findOne.mockResolvedValue({ shopDomain: SHOP, plan: 'free' });
    const req = { shopDomain: SHOP, params: { shopDomain: 'other.myshopify.com' } };
    const res = mockRes();
    await requireStoreOwnerAnyPlan(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('requireNotSuspended — plan gate', () => {
  function leanOf(doc) {
    return { lean: () => Promise.resolve(doc) };
  }

  test('free store → next()', async () => {
    Store.findOne.mockReturnValue(leanOf({ shopDomain: SHOP, plan: 'free' }));
    const res = mockRes();
    const next = jest.fn();
    await requireNotSuspended({ shopDomain: SHOP }, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('suspended store → 403 STORE_SUSPENDED', async () => {
    Store.findOne.mockReturnValue(leanOf({ shopDomain: SHOP, plan: 'pro', suspended: true }));
    const res = mockRes();
    const next = jest.fn();
    await requireNotSuspended({ shopDomain: SHOP }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('pro store → next()', async () => {
    Store.findOne.mockReturnValue(leanOf({ shopDomain: SHOP, plan: 'pro' }));
    const next = jest.fn();
    await requireNotSuspended({ shopDomain: SHOP }, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  test('store not found → next() (unchanged behaviour)', async () => {
    Store.findOne.mockReturnValue(leanOf(null));
    const next = jest.fn();
    await requireNotSuspended({ shopDomain: SHOP }, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
