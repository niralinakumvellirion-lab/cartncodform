'use strict';

jest.mock('../models/Store');
jest.mock('../utils/billing', () => ({ getActiveSubscription: jest.fn() }));
jest.mock('../utils/subscriptionEvents', () => ({ recordSubscriptionEvent: jest.fn() }));

const Store = require('../models/Store');
const { getActiveSubscription } = require('../utils/billing');
const { recordSubscriptionEvent } = require('../utils/subscriptionEvents');
const { syncActiveSubscription } = require('../utils/subscriptionSync');

const store = { shopDomain: 'sync-shop.myshopify.com', plan: 'free' };

beforeEach(() => {
  jest.clearAllMocks();
  Store.findOneAndUpdate.mockResolvedValue({});
});

describe('syncActiveSubscription', () => {
  test('active subscription (a free trial counts) → store becomes pro, event recorded, returns true', async () => {
    getActiveSubscription.mockResolvedValue({ id: 'gid://sub/1', status: 'ACTIVE', test: true });
    expect(await syncActiveSubscription(store, 'tok', 'managed_pricing')).toBe(true);
    expect(getActiveSubscription).toHaveBeenCalledWith('sync-shop.myshopify.com', 'tok');
    expect(Store.findOneAndUpdate).toHaveBeenCalledWith(
      { shopDomain: 'sync-shop.myshopify.com' },
      expect.objectContaining({ plan: 'pro', subscriptionId: 'gid://sub/1', subscriptionStatus: 'ACTIVE', isTest: true })
    );
    expect(recordSubscriptionEvent).toHaveBeenCalledWith(expect.objectContaining({
      shopDomain: 'sync-shop.myshopify.com', eventType: 'activated', fromPlan: 'free', toPlan: 'pro', source: 'managed_pricing', isTest: true,
    }));
  });

  test('no active subscription → nothing is changed, returns false', async () => {
    getActiveSubscription.mockResolvedValue(null);
    expect(await syncActiveSubscription(store, 'tok', 'managed_pricing')).toBe(false);
    expect(Store.findOneAndUpdate).not.toHaveBeenCalled();
    expect(recordSubscriptionEvent).not.toHaveBeenCalled();
  });

  test('a Shopify error is passed up so the caller can decide', async () => {
    getActiveSubscription.mockRejectedValue(new Error('shopify down'));
    await expect(syncActiveSubscription(store, 'tok', 'x')).rejects.toThrow('shopify down');
    expect(Store.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('subscription event source', () => {
  test('managed_pricing is an accepted source', () => {
    jest.unmock('../models/Store');
    const SubscriptionEvent = jest.requireActual('../models/SubscriptionEvent');
    const doc = new SubscriptionEvent({ shopDomain: 'a.myshopify.com', eventType: 'activated', toPlan: 'pro', source: 'managed_pricing' });
    expect(doc.validateSync()).toBeUndefined();
  });
});
