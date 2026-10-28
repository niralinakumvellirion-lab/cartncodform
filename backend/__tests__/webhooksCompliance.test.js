/**
 * GDPR compliance webhooks (routes/webhooks.js POST /compliance) —
 * customers/redact extended to sweep Profile + ScheduledJob
 * (audits/queue-notification-detail-audit.txt finding #2), and
 * customers/data_request extended to report on the same two models.
 *
 * verifyWebhookHmac is mocked to always pass — HMAC verification itself is
 * covered elsewhere; these tests are about what each handler does with an
 * already-authenticated payload. Models are auto-mocked.
 *
 * The handlers now use an async-ack pattern: they persist a ComplianceRequest,
 * respond 200 immediately, and run the deletion/report job in setImmediate().
 * Tests flush the setImmediate queue before checking model assertions.
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
jest.mock('../models/CodOrder');
jest.mock('../models/PushClick');
jest.mock('../models/AttributedEvent');
jest.mock('../models/ComplianceRequest');

const express = require('express');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const StorefrontEvent = require('../models/StorefrontEvent');
const CustomerPushSubscription = require('../models/CustomerPushSubscription');
const Profile = require('../models/Profile');
const ScheduledJob = require('../models/ScheduledJob');
const CodOrder = require('../models/CodOrder');
const PushClick = require('../models/PushClick');
const AttributedEvent = require('../models/AttributedEvent');
const ComplianceRequest = require('../models/ComplianceRequest');
const webhooksRouter = require('../routes/webhooks');

const SHOP = 'demo.myshopify.com';
let server;
let base;

// Flush the setImmediate queue so background jobs run before assertions.
const flushBackground = () => new Promise((r) => setImmediate(r));

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

  // ComplianceRequest.create returns a document with the passed fields so the
  // background job can read cr.identifiers and cr.shopDomain.
  ComplianceRequest.create.mockImplementation((doc) =>
    Promise.resolve({ _id: 'test-cr-id', ...doc })
  );
  ComplianceRequest.updateOne.mockResolvedValue({ acknowledged: true, modifiedCount: 1 });

  AbandonedCustomer.deleteMany.mockResolvedValue({ deletedCount: 0 });
  AbandonedCustomer.countDocuments.mockResolvedValue(0);
  StorefrontEvent.deleteMany.mockResolvedValue({ deletedCount: 0 });
  StorefrontEvent.countDocuments.mockResolvedValue(0);
  CustomerPushSubscription.deleteMany.mockResolvedValue({ deletedCount: 0 });
  Profile.find.mockReturnValue({ lean: () => Promise.resolve([]) });
  Profile.deleteMany.mockResolvedValue({ deletedCount: 0 });
  ScheduledJob.updateMany.mockResolvedValue({ modifiedCount: 0 });
  ScheduledJob.countDocuments.mockResolvedValue(0);
  CodOrder.updateMany.mockResolvedValue({ modifiedCount: 0 });
  CodOrder.countDocuments.mockResolvedValue(0);
  PushClick.deleteMany.mockResolvedValue({ deletedCount: 0 });
  AttributedEvent.deleteMany.mockResolvedValue({ deletedCount: 0 });
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

    // Wait for the background job (setImmediate) to run.
    await flushBackground();

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

    // StorefrontEvent: customerId + profile's cartTokens
    // (sessionIds and pushTokens absent from this mock profile).
    expect(StorefrontEvent.deleteMany).toHaveBeenCalledWith({
      shopDomain: SHOP,
      $or: [
        { customerId: '555' },
        { sessionId: { $in: ['cart-abc', 'cart-def'] } },
      ],
    });

    // CustomerPushSubscription: uses $or clause (customerId + cartTokens)
    expect(CustomerPushSubscription.deleteMany).toHaveBeenCalledWith({
      shopDomain: SHOP,
      $or: [
        { customerId: '555' },
        { cartToken: { $in: ['cart-abc', 'cart-def'] } },
      ],
    });

    // ScheduledJob: matched by customerId, cartTokens, and profileId — never deleted.
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
    await flushBackground();

    const [matchArg] = ScheduledJob.updateMany.mock.calls[0];
    expect(matchArg.$or).toContainEqual({ cartToken: { $in: ['orphan-cart'] } });
  });

  test('no customer identifier in payload — nothing is touched', async () => {
    const res = await postCompliance('customers/redact', { customer: {} });

    expect(res.status).toBe(200);
    await flushBackground();

    expect(AbandonedCustomer.deleteMany).not.toHaveBeenCalled();
    expect(Profile.deleteMany).not.toHaveBeenCalled();
    expect(ScheduledJob.updateMany).not.toHaveBeenCalled();
  });

  test('deletes StorefrontEvents by sessionIds from profile', async () => {
    Profile.find.mockReturnValue({
      lean: () => Promise.resolve([
        { _id: 'p3', identifiers: { sessionIds: ['uuid-aaa', 'uuid-bbb'], cartTokens: [] } },
      ]),
    });

    await postCompliance('customers/redact', { customer: { id: 789, email: 'a@b.com' } });
    await flushBackground();

    const [seArg] = StorefrontEvent.deleteMany.mock.calls[0];
    expect(seArg.$or).toContainEqual({ sessionId: { $in: ['uuid-aaa', 'uuid-bbb'] } });
  });

  test('deletes StorefrontEvents by pushTokens from profile', async () => {
    Profile.find.mockReturnValue({
      lean: () => Promise.resolve([
        { _id: 'p4', identifiers: { pushTokens: ['fcm-tok-1', 'fcm-tok-2'], cartTokens: [], sessionIds: [] } },
      ]),
    });

    await postCompliance('customers/redact', { customer: { id: 101, email: 'b@b.com' } });
    await flushBackground();

    const [seArg] = StorefrontEvent.deleteMany.mock.calls[0];
    expect(seArg.$or).toContainEqual({ token: { $in: ['fcm-tok-1', 'fcm-tok-2'] } });
  });

  test('no profile found — still deletes StorefrontEvents by payload customerId', async () => {
    // Profile.find returns empty (default mock)
    await postCompliance('customers/redact', { customer: { id: 999 } });
    await flushBackground();

    expect(StorefrontEvent.deleteMany).toHaveBeenCalledWith({
      shopDomain: SHOP,
      $or: [{ customerId: '999' }],
    });
  });
});

describe('customers/data_request', () => {
  test('reports on Profile and ScheduledJob rows, not just AbandonedCustomer/StorefrontEvent', async () => {
    AbandonedCustomer.countDocuments.mockResolvedValue(1);
    StorefrontEvent.countDocuments.mockResolvedValue(3);
    Profile.find.mockReturnValue({ lean: () => Promise.resolve([{ _id: 'p1', identifiers: {} }]) });
    ScheduledJob.countDocuments.mockResolvedValue(2);

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const res = await postCompliance('customers/data_request', {
      customer: { id: 42, email: 'shopper@example.com' },
    });
    expect(res.status).toBe(200);
    await flushBackground();

    expect(AbandonedCustomer.countDocuments).toHaveBeenCalled();
    expect(Profile.find).toHaveBeenCalled();
    expect(ScheduledJob.countDocuments).toHaveBeenCalled();
    expect(logSpy.mock.calls.some(([msg]) =>
      typeof msg === 'string' &&
      msg.includes('Profile:') && msg.includes('1') &&
      msg.includes('ScheduledJob:') && msg.includes('2')
    )).toBe(true);
  });
});
