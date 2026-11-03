'use strict';

/**
 * orders/create webhook records which products a customer bought (PurchaseRecord) so that
 * product reviews can be marked "verified". Same mocking style as activity.test.js.
 */

describe('orders/create webhook: purchase record for verified reviews', () => {
  let mockPurchaseRecord;
  const SHOP = 'demo.myshopify.com';

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    mockPurchaseRecord = { updateOne: jest.fn().mockResolvedValue({}) };
    jest.doMock('../models/PurchaseRecord', () => mockPurchaseRecord);
    jest.doMock('../models/AttributedEvent', () => ({ updateOne: jest.fn().mockResolvedValue({}) }));
    jest.doMock('../models/ScheduledJob', () => ({
      findById: jest.fn(), findByIdAndUpdate: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}),
    }));
    jest.doMock('../models/Profile', () => ({
      findOne: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) }), updateOne: jest.fn().mockResolvedValue({}),
    }));
    jest.doMock('../models/AbandonedCustomer', () => ({
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ matchedCount: 0 }),
    }));
    jest.doMock('../models/Store', () => ({ findOne: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) }) }));
    jest.doMock('../models/PushClick', () => ({
      findOne: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) }),
    }));
    jest.doMock('../models/StorefrontEvent', () => ({ findOne: jest.fn() }));
    jest.doMock('../models/CustomerPushSubscription', () => ({ findOne: jest.fn(), find: jest.fn() }));
    jest.doMock('../utils/shopify', () => ({ verifyWebhookHmac: jest.fn().mockReturnValue(true) }));
    jest.doMock('../utils/email', () => ({ sendAbandonedCartEmail: jest.fn().mockResolvedValue({}) }));
    jest.doMock('../utils/pushNotification', () => ({ sendPushToStore: jest.fn(), sendPushToCustomers: jest.fn() }));
    jest.doMock('../utils/productImage', () => ({ fetchProductImage: jest.fn() }));
    jest.doMock('../services/profileService', () => ({ upsertProfile: jest.fn().mockResolvedValue({ _id: 'p1' }) }));
    jest.doMock('../services/signalEngine', () => ({ computeSignalsForProfile: jest.fn() }));
  });

  afterEach(() => jest.restoreAllMocks());

  function handler() {
    const router = require('../routes/webhooks');
    const layer = router.stack.find((l) => l.route && l.route.path === '/order' && l.route.methods.post);
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }

  function req(body) {
    return {
      rawBody: '',
      body: { test: false, cart_token: 'cart-abc', ...body },
      get: (h) => ({ 'x-shopify-shop-domain': SHOP, 'x-shopify-hmac-sha256': 'valid' })[h.toLowerCase()],
    };
  }

  const res = () => { const r = { _status: 200 }; r.status = (c) => { r._status = c; return r; }; r.json = () => r; r.send = () => r; return r; };

  const order = (over = {}) => ({
    id: 5001,
    email: 'Buyer@Example.com',
    customer: { id: 111, email: 'buyer@example.com' },
    line_items: [{ product_id: 11, title: 'Kurta' }, { product_id: 22, title: 'Scarf' }, { product_id: 11, title: 'Kurta again' }],
    ...over,
  });

  test('stores the order\'s product ids, customer id and a hashed email', async () => {
    await handler()(req(order()), res());
    expect(mockPurchaseRecord.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update, opts] = mockPurchaseRecord.updateOne.mock.calls[0];
    expect(filter).toEqual({ shopDomain: SHOP, orderId: '5001' });
    expect(update.$set).toMatchObject({ customerId: '111', productIds: ['11', '22'] });
    expect(update.$set.emailHash).toMatch(/^[0-9a-f]{64}$/);
    expect(opts).toEqual({ upsert: true });
    expect(JSON.stringify(update)).not.toMatch(/buyer@/i);
  });

  test('the same order delivered twice is one record (upsert on shop + order id)', async () => {
    await handler()(req(order()), res());
    await handler()(req(order()), res());
    const filters = mockPurchaseRecord.updateOne.mock.calls.map((c) => c[0]);
    expect(filters[0]).toEqual(filters[1]);
  });

  test('stores nothing for an order without product ids or without a buyer identity', async () => {
    await handler()(req(order({ line_items: [{ title: 'Custom item' }] })), res());
    await handler()(req(order({ id: 5002, email: null, customer: null })), res());
    expect(mockPurchaseRecord.updateOne).not.toHaveBeenCalled();
  });

  test('a failing write never fails the webhook', async () => {
    mockPurchaseRecord.updateOne.mockRejectedValue(new Error('db down'));
    const r = res();
    await handler()(req(order()), r);
    expect(r._status).toBe(200);
  });
});
