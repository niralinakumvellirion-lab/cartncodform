/**
 * GDPR compliance webhooks (routes/webhooks.js POST /compliance) —
 * customers/redact extended to sweep Profile + ScheduledJob
 * (audits/queue-notification-detail-audit.txt finding #2), and
 * customers/data_request extended to report on the same two models.
 *
 * verifyWebhookHmac is mocked to always pass — HMAC verification itself is
 * covered elsewhere; these tests are about what each handler does with an
 * already-authenticated payload. Models are auto-mocked.
 */

jest.mock('../utils/shopify', () => ({
  ...jest.requireActual('../utils/shopify'),
  verifyWebhookHmac: jest.fn(() => true),
}));
jest.mock('../models/AbandonedCustomer');
jest.mock('../models/StorefrontEvent');
jest.mock('../models/CustomerPushSubscription');
jest.mock('../models/Profile');
jest.mock('../models/ScheduledJob');

const express = require('express');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const StorefrontEvent = require('../models/StorefrontEvent');
const CustomerPushSubscription = require('../models/CustomerPushSubscription');
const Profile = require('../models/Profile');
const ScheduledJob = require('../models/ScheduledJob');
const webhooksRouter = require('../routes/webhooks');

const SHOP = 'demo.myshopify.com';
let server;
let base;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/webhooks', webhooksRouter);
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
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  AbandonedCustomer.deleteMany.mockResolvedValue({ deletedCount: 0 });
  StorefrontEvent.deleteMany.mockResolvedValue({ deletedCount: 0 });
  StorefrontEvent.find.mockReturnValue({ limit: () => ({ lean: () => Promise.resolve([]) }) });
  CustomerPushSubscription.deleteMany.mockResolvedValue({ deletedCount: 0 });
  Profile.find.mockReturnValue({ lean: () => Promise.resolve([]) });
  Profile.deleteMany.mockResolvedValue({ deletedCount: 0 });
  ScheduledJob.updateMany.mockResolvedValue({ modifiedCount: 0 });
  ScheduledJob.find.mockReturnValue({ limit: () => ({ lean: () => Promise.resolve([]) }) });
  AbandonedCustomer.find.mockReturnValue({ lean: () => Promise.resolve([]) });
});
afterEach(() => jest.restoreAllMocks());

function postCompliance(topic, body) {
  return fetch(`${base}/api/webhooks/compliance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Topic': topic,
      'X-Shopify-Shop-Domain': SHOP,
      'X-Shopify-Hmac-Sha256': 'test',
    },
    body: JSON.stringify(body),
  });
}

describe('customers/redact', () => {
  test('deletes AbandonedCustomer/StorefrontEvent/CustomerPushSubscription/Profile and anonymises matching ScheduledJob rows', async () => {
    AbandonedCustomer.deleteMany.mockResolvedValue({ deletedCount: 2 });
    StorefrontEvent.deleteMany.mockResolvedValue({ deletedCount: 5 });
    CustomerPushSubscription.deleteMany.mockResolvedValue({ deletedCount: 1 });
    Profile.find.mockReturnValue({
      lean: () => Promise.resolve([
        { _id: 'p1', identifiers: { cartTokens: ['cart-abc', 'cart-def'] } },
      ]),
    });
    Profile.deleteMany.mockResolvedValue({ deletedCount: 1 });
    ScheduledJob.updateMany.mockResolvedValue({ modifiedCount: 3 });

    const res = await postCompliance('customers/redact', {
      customer: { id: 555, email: 'shopper@example.com', phone: '+911234567890' },
    });

    expect(res.status).toBe(200);

    expect(Profile.find).toHaveBeenCalledWith(
      { shopDomain: SHOP, $or: [
        { 'identifiers.customerId': '555' },
        { 'identifiers.emails': 'shopper@example.com' },
        { 'identifiers.phones': '+911234567890' },
      ] }
    );

    expect(AbandonedCustomer.deleteMany).toHaveBeenCalledWith({
      shopDomain: SHOP,
      $or: [{ customerId: '555' }, { email: 'shopper@example.com' }],
    });
    expect(StorefrontEvent.deleteMany).toHaveBeenCalledWith({ shopDomain: SHOP, customerId: '555' });
    expect(CustomerPushSubscription.deleteMany).toHaveBeenCalledWith({ shopDomain: SHOP, customerId: '555' });

    // ScheduledJob: matched by customerId, the profile's own cartTokens, and its _id — never deleted.
    expect(ScheduledJob.updateMany).toHaveBeenCalledWith(
      {
        shopDomain: SHOP,
        $or: [
          { customerId: '555' },
          { cartToken: { $in: ['cart-abc', 'cart-def'] } },
          { profileId: { $in: ['p1'] } },
        ],
      },
      {
        $set: {
          customerId: null,
          cartToken: null,
          sessionId: null,
          subscriptionToken: null,
          profileId: null,
          payload: null,
        },
      }
    );
    expect(ScheduledJob.deleteMany).not.toHaveBeenCalled();

    expect(Profile.deleteMany).toHaveBeenCalledWith({
      shopDomain: SHOP,
      $or: [
        { 'identifiers.customerId': '555' },
        { 'identifiers.emails': 'shopper@example.com' },
        { 'identifiers.phones': '+911234567890' },
      ],
    });
  });

  test('matches ScheduledJob rows that only ever had a cartToken (never got a customerId) via the profile lookup', async () => {
    Profile.find.mockReturnValue({
      lean: () => Promise.resolve([
        { _id: 'p2', identifiers: { cartTokens: ['orphan-cart'] } },
      ]),
    });

    await postCompliance('customers/redact', {
      customer: { id: 999, email: 'a@b.com' },
    });

    const [matchArg] = ScheduledJob.updateMany.mock.calls[0];
    expect(matchArg.$or).toContainEqual({ cartToken: { $in: ['orphan-cart'] } });
  });

  test('no customer identifier in payload — nothing is touched', async () => {
    const res = await postCompliance('customers/redact', { customer: {} });

    expect(res.status).toBe(200);
    expect(AbandonedCustomer.deleteMany).not.toHaveBeenCalled();
    expect(Profile.deleteMany).not.toHaveBeenCalled();
    expect(ScheduledJob.updateMany).not.toHaveBeenCalled();
  });
});

describe('customers/data_request', () => {
  test('reports on Profile and ScheduledJob rows, not just AbandonedCustomer/StorefrontEvent', async () => {
    AbandonedCustomer.find.mockReturnValue({ lean: () => Promise.resolve([{ _id: 'c1' }]) });
    StorefrontEvent.find.mockReturnValue({ limit: () => ({ lean: () => Promise.resolve([{ _id: 'e1' }]) }) });
    Profile.find.mockReturnValue({ lean: () => Promise.resolve([{ _id: 'p1', identifiers: {} }]) });
    ScheduledJob.find.mockReturnValue({ limit: () => ({ lean: () => Promise.resolve([{ _id: 'j1' }, { _id: 'j2' }]) }) });

    const logSpy = jest.spyOn(console, 'log');

    const res = await postCompliance('customers/data_request', {
      customer: { id: 42, email: 'shopper@example.com' },
    });

    expect(res.status).toBe(200);
    expect(Profile.find).toHaveBeenCalled();
    expect(ScheduledJob.find).toHaveBeenCalled();
    expect(logSpy.mock.calls.some(([msg]) =>
      typeof msg === 'string' && msg.includes('Profile rows') && msg.includes('1') &&
      msg.includes('ScheduledJob rows') && msg.includes('2')
    )).toBe(true);
  });
});
