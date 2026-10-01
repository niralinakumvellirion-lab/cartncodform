/**
 * routes/profiles.js — Dashboard KPI tile drill-down backend changes
 * (audits/dashboard-kpi-drilldown-audit.txt / -after.txt):
 *   - today-stats: pushSubscribers now respects the date range
 *   - /messages: channel/status/from/to query params
 *   - /profiles: email_captured/push_subscribed filters + from/to
 *   - new /popups-shown endpoint
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
jest.mock('../models/Profile');
jest.mock('../models/Signal');
jest.mock('../models/SignalConfig');
jest.mock('../models/StorefrontEvent');
jest.mock('../models/Store');
jest.mock('../models/ScheduledJob');
jest.mock('../models/ShopWeights');

const express = require('express');
const Profile = require('../models/Profile');
const StorefrontEvent = require('../models/StorefrontEvent');
const ScheduledJob = require('../models/ScheduledJob');
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
afterAll((done) => { server.close(done); });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

function get(path) {
  return fetch(`${base}/api/profiles${path}`);
}

describe('GET /:shop/today-stats — pushSubscribers respects the date range', () => {
  test('counts subscribed AND subscribedAt within from/to, not an all-time total', async () => {
    ScheduledJob.countDocuments.mockResolvedValue(0);
    Profile.aggregate.mockResolvedValue([]);
    StorefrontEvent.countDocuments.mockResolvedValue(0);
    Profile.countDocuments
      .mockResolvedValueOnce(0)  // emailsCaptured
      .mockResolvedValueOnce(7); // pushSubscribers

    const res = await get(`/${SHOP}/today-stats?from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.999Z`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.pushSubscribers).toBe(7);
    // The pushSubscribers call is the second Profile.countDocuments call
    // (after emailsCaptured) — assert it carries BOTH the subscribed
    // flag and a subscribedAt range, not just the flag.
    const [pushSubQuery] = Profile.countDocuments.mock.calls[1];
    expect(pushSubQuery).toMatchObject({
      shopDomain: SHOP,
      'channels.push.subscribed': true,
    });
    expect(pushSubQuery['channels.push.subscribedAt']).toEqual({
      $gte: new Date('2026-09-01T00:00:00.000Z'),
      $lte: new Date('2026-09-30T23:59:59.999Z'),
    });
  });
});

describe('GET /:shop/messages — channel/status/from/to', () => {
  function mockMessages(msgs, total = msgs.length) {
    ScheduledJob.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ select: () => ({ populate: () => Promise.resolve(msgs) }) }) }) }),
    });
    ScheduledJob.countDocuments.mockResolvedValue(total);
  }

  test('default (no params) keeps the existing broad status set — unchanged', async () => {
    mockMessages([]);
    await get(`/${SHOP}/messages`);
    const [filterArg] = ScheduledJob.find.mock.calls[0];
    expect(filterArg).toEqual({
      shopDomain: SHOP,
      status: { $in: ['sent', 'skipped', 'failed', 'cancelled'] },
    });
  });

  test('?channel=push&status=sent&from=&to= narrows exactly as requested', async () => {
    mockMessages([]);
    await get(`/${SHOP}/messages?channel=push&status=sent&from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.999Z`);
    const [filterArg] = ScheduledJob.find.mock.calls[0];
    expect(filterArg).toEqual({
      shopDomain: SHOP,
      status: 'sent',
      channel: 'push',
      sentAt: { $gte: new Date('2026-09-01T00:00:00.000Z'), $lte: new Date('2026-09-30T23:59:59.999Z') },
    });
  });

  test('an invalid channel value is ignored, not blindly passed through', async () => {
    mockMessages([]);
    await get(`/${SHOP}/messages?channel=carrier-pigeon`);
    const [filterArg] = ScheduledJob.find.mock.calls[0];
    expect(filterArg.channel).toBeUndefined();
  });
});

describe('GET /:shop/profiles — email_captured / push_subscribed filters', () => {
  function mockProfiles(rows, total = rows.length) {
    Profile.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ select: () => Promise.resolve(rows) }) }) }),
    });
    Profile.countDocuments.mockResolvedValue(total);
  }

  test('filter=email_captured with no range just requires the field to exist (unchanged default)', async () => {
    mockProfiles([]);
    await get(`/${SHOP}/profiles?filter=email_captured`);
    const [queryArg] = Profile.find.mock.calls[0];
    expect(queryArg['channels.email.capturedAt']).toEqual({ $exists: true });
  });

  test('filter=email_captured&from&to narrows to the range', async () => {
    mockProfiles([]);
    await get(`/${SHOP}/profiles?filter=email_captured&from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.999Z`);
    const [queryArg] = Profile.find.mock.calls[0];
    expect(queryArg['channels.email.capturedAt']).toEqual({
      $exists: true,
      $gte: new Date('2026-09-01T00:00:00.000Z'),
      $lte: new Date('2026-09-30T23:59:59.999Z'),
    });
  });

  test('filter=push_subscribed&from&to matches subscribed:true within subscribedAt range', async () => {
    mockProfiles([]);
    await get(`/${SHOP}/profiles?filter=push_subscribed&from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.999Z`);
    const [queryArg] = Profile.find.mock.calls[0];
    expect(queryArg['channels.push.subscribed']).toBe(true);
    expect(queryArg['channels.push.subscribedAt']).toEqual({
      $gte: new Date('2026-09-01T00:00:00.000Z'),
      $lte: new Date('2026-09-30T23:59:59.999Z'),
    });
  });

  test('existing filter values are unaffected by the from/to addition', async () => {
    mockProfiles([]);
    await get(`/${SHOP}/profiles?filter=repeat_buyer&from=2026-09-01T00:00:00.000Z`);
    const [queryArg] = Profile.find.mock.calls[0];
    expect(queryArg['orders.count']).toEqual({ $gte: 2 });
    expect(queryArg['channels.email.capturedAt']).toBeUndefined();
    expect(queryArg['channels.push.subscribedAt']).toBeUndefined();
  });
});

describe('GET /:shop/popups-shown', () => {
  function mockEvents(rows, total = rows.length) {
    StorefrontEvent.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ select: () => ({ lean: () => Promise.resolve(rows) }) }) }) }),
    });
    StorefrontEvent.countDocuments.mockResolvedValue(total);
  }

  test('returns ts/path/customerId, customerId null when the event has none (no resolution step)', async () => {
    mockEvents([
      { ts: new Date('2026-09-15T10:00:00.000Z'), path: '/products/foo', customerId: null },
      { ts: new Date('2026-09-16T10:00:00.000Z'), path: '/', customerId: '999' },
    ], 2);

    const res = await get(`/${SHOP}/popups-shown?from=2026-09-01T00:00:00.000Z&to=2026-09-30T23:59:59.999Z`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.total).toBe(2);
    expect(data.events[0].customerId).toBeNull();
    expect(data.events[1].customerId).toBe('999');

    const [queryArg] = StorefrontEvent.find.mock.calls[0];
    expect(queryArg).toEqual({
      shopDomain: SHOP,
      type: 'push_prompt_shown',
      ts: { $gte: new Date('2026-09-01T00:00:00.000Z'), $lte: new Date('2026-09-30T23:59:59.999Z') },
    });
  });

  test('paginates via page/limit', async () => {
    mockEvents([], 130);
    const res = await get(`/${SHOP}/popups-shown?page=2&limit=50`);
    const data = await res.json();
    expect(data).toMatchObject({ total: 130, page: 2, limit: 50 });
  });
});
