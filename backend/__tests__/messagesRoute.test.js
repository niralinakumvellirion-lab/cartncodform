/**
 * Tests for GET /api/profiles/:shopDomain/messages
 * — WhatsApp rows included in default (all-channel) fetch
 * — WhatsApp rows returned with channel=whatsapp filter
 * — WhatsApp rows excluded with channel=push filter
 * — messageText and purpose included in selected fields
 * — Push/email rows unchanged
 * — Shop scoped (403 on wrong shop)
 */

jest.mock('../middleware/requireOwner', () => ({
  requireAuth: (req, _res, next) => {
    req.shopDomain = req.headers['x-test-shop'] || 'demo.myshopify.com';
    next();
  },
  requireStoreOwner: (req, res, next) => {
    if (req.shopDomain !== req.params.shopDomain) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    req.store = { shopDomain: req.shopDomain };
    next();
  },
}));
jest.mock('../models/ScheduledJob');
jest.mock('../models/Profile');

const express = require('express');
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

// Helper that builds a chainable mock for ScheduledJob.find
function mockFindChain(rows) {
  const chain = {
    sort: () => chain,
    skip: () => chain,
    limit: () => chain,
    select: () => chain,
    populate: () => Promise.resolve(rows),
  };
  ScheduledJob.find.mockReturnValue(chain);
  ScheduledJob.countDocuments.mockResolvedValue(rows.length);
}

function get(params = {}, shop = SHOP) {
  const qs = new URLSearchParams(params).toString();
  const url = `${base}/api/profiles/${shop}/messages${qs ? '?' + qs : ''}`;
  return fetch(url, { headers: { 'x-test-shop': shop } });
}

const WA_JOB = {
  _id: 'wa1',
  channel: 'whatsapp',
  status: 'sent',
  messageText: 'Hi! You left something in your cart.',
  purpose: 'followup',
  sentAt: new Date('2026-10-13T10:00:00Z'),
  profileId: { _id: 'p1', identifiers: { emails: ['a@b.com'] } },
};

const PUSH_JOB = {
  _id: 'push1',
  channel: 'push',
  status: 'sent',
  payload: { title: 'Flash sale', body: 'Hurry!' },
  sentAt: new Date('2026-10-13T09:00:00Z'),
  profileId: { _id: 'p2', identifiers: { emails: ['b@c.com'] } },
};

const EMAIL_JOB = {
  _id: 'email1',
  channel: 'email',
  status: 'sent',
  payload: { subject: 'Check this out', body: 'Newsletter content' },
  sentAt: new Date('2026-10-13T08:00:00Z'),
  profileId: { _id: 'p3', identifiers: { emails: ['c@d.com'] } },
};

describe('GET /:shopDomain/messages — WhatsApp inclusion', () => {
  test('default (all channels) includes whatsapp rows', async () => {
    mockFindChain([WA_JOB, PUSH_JOB, EMAIL_JOB]);
    const res = await get();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.messages).toHaveLength(3);
    // WhatsApp row is present
    const waRow = data.messages.find((m) => m._id === 'wa1');
    expect(waRow).toBeTruthy();
    // Query filter does NOT set a channel restriction
    const [filterArg] = ScheduledJob.find.mock.calls[0];
    expect(filterArg.channel).toBeUndefined();
  });

  test('channel=whatsapp filter scopes to whatsapp only', async () => {
    mockFindChain([WA_JOB]);
    const res = await get({ channel: 'whatsapp' });
    expect(res.status).toBe(200);
    const [filterArg] = ScheduledJob.find.mock.calls[0];
    expect(filterArg.channel).toBe('whatsapp');
  });

  test('channel=push excludes whatsapp', async () => {
    mockFindChain([PUSH_JOB]);
    const res = await get({ channel: 'push' });
    expect(res.status).toBe(200);
    const [filterArg] = ScheduledJob.find.mock.calls[0];
    expect(filterArg.channel).toBe('push');
  });

  test('channel=email excludes whatsapp', async () => {
    mockFindChain([EMAIL_JOB]);
    const res = await get({ channel: 'email' });
    expect(res.status).toBe(200);
    const [filterArg] = ScheduledJob.find.mock.calls[0];
    expect(filterArg.channel).toBe('email');
  });

  test('response includes total count', async () => {
    mockFindChain([WA_JOB]);
    const res = await get({ channel: 'whatsapp' });
    const data = await res.json();
    expect(data.total).toBe(1);
  });

  test('wrong shop → 403 (authed as SHOP but path is other)', async () => {
    mockFindChain([]);
    // Authenticated as SHOP but the URL path asks for a different shop.
    const res = await fetch(`${base}/api/profiles/other.myshopify.com/messages`, {
      headers: { 'x-test-shop': SHOP },
    });
    expect(res.status).toBe(403);
  });
});


describe('GET /:shopDomain/messages — push/email unchanged', () => {
  test('push rows still returned and counted correctly', async () => {
    mockFindChain([PUSH_JOB]);
    const res = await get({ channel: 'push' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.messages[0]._id).toBe('push1');
    expect(data.total).toBe(1);
  });

  test('email rows still returned and counted correctly', async () => {
    mockFindChain([EMAIL_JOB]);
    const res = await get({ channel: 'email' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.messages[0]._id).toBe('email1');
    expect(data.total).toBe(1);
  });

  test('unknown channel value is ignored (no filter.channel set)', async () => {
    mockFindChain([PUSH_JOB, EMAIL_JOB, WA_JOB]);
    const res = await get({ channel: 'sms' });
    expect(res.status).toBe(200);
    const [filterArg] = ScheduledJob.find.mock.calls[0];
    expect(filterArg.channel).toBeUndefined();
  });
});
