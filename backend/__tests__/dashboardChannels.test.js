/**
 * backend/routes/dashboard.js
 * Tests for:
 *   GET /api/dashboard/:shopDomain/channels?from=&to=
 *   GET /api/dashboard/:shopDomain/channels/:channel/items?status=&type=&page=&limit=
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
jest.mock('../models/ScheduledJob');
jest.mock('../models/Profile');
jest.mock('../models/AttributedEvent');

const express = require('express');
const ScheduledJob = require('../models/ScheduledJob');
const Profile = require('../models/Profile');
const AttributedEvent = require('../models/AttributedEvent');
const dashboardRouter = require('../routes/dashboard');

const SHOP = 'demo.myshopify.com';
const FROM = '2026-09-01T00:00:00.000Z';
const TO = '2026-09-30T23:59:59.999Z';

let server;
let base;

beforeAll((done) => {
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', dashboardRouter);
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

function get(path, shop = SHOP) {
  return fetch(`${base}${path}`, { headers: { 'x-test-shop': shop } });
}

// Returns a chainable find mock: .select().lean() and .sort().lean() patterns.
function findChain(result) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result),
  };
  return chain;
}

// ====================================================================
// GET /channels — summary counts
// ====================================================================

describe('GET /:shopDomain/channels', () => {
  function setupEmpty() {
    ScheduledJob.aggregate
      .mockResolvedValueOnce([])  // push sent types
      .mockResolvedValueOnce([])  // push pending types
      .mockResolvedValueOnce([])  // email sent types (from jobs)
      .mockResolvedValueOnce([]); // email pending types
    Profile.aggregate.mockResolvedValue([]);          // email sent from messages
    ScheduledJob.find.mockReturnValue(findChain([])); // WA jobs sent
    Profile.find.mockReturnValue(findChain([]));       // WA opted-in
  }

  test('ch1. all-empty store returns zero counts for all channels', async () => {
    setupEmpty();
    const res = await get(`/api/dashboard/${SHOP}/channels?from=${FROM}&to=${TO}`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.push.sent).toBe(0);
    expect(data.push.pending).toBe(0);
    expect(data.email.sent).toBe(0);
    expect(data.email.pending).toBe(0);
    expect(data.whatsapp.sent).toBe(0);
    expect(data.whatsapp.pending).toBe(0);
    expect(data.push.types).toEqual([]);
    expect(data.email.types).toEqual([]);
  });

  test('ch2. push sent aggregation totals correctly and builds types array', async () => {
    ScheduledJob.aggregate
      .mockResolvedValueOnce([
        { _id: 'cart_abandon', sent: 5, rep: { title: 'Come back!', body: 'Left something.' } },
        { _id: 'browse_abandon', sent: 3, rep: { title: 'Hi', body: 'Saw something?' } },
      ])  // push sent
      .mockResolvedValueOnce([])   // push pending
      .mockResolvedValueOnce([])   // email sent
      .mockResolvedValueOnce([]);  // email pending
    Profile.aggregate.mockResolvedValue([]);
    ScheduledJob.find.mockReturnValue(findChain([]));
    Profile.find.mockReturnValue(findChain([]));

    const res = await get(`/api/dashboard/${SHOP}/channels?from=${FROM}&to=${TO}`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.push.sent).toBe(8);
    expect(data.push.types).toHaveLength(2);
    const cartType = data.push.types.find((t) => t.type === 'cart_abandon');
    expect(cartType).toBeDefined();
    expect(cartType.sent).toBe(5);
    expect(cartType.label).toBe('Cart reminder');
    expect(cartType.preview).toMatchObject({ title: 'Come back!' });
  });

  test('ch3. push pending merges with sent types correctly', async () => {
    ScheduledJob.aggregate
      .mockResolvedValueOnce([
        { _id: 'cart_abandon', sent: 2, rep: { title: 'Sent' } },
      ])  // push sent
      .mockResolvedValueOnce([
        { _id: 'cart_abandon', pending: 4, rep: { title: 'Pending' } },
        { _id: 'browse_abandon', pending: 1, rep: { title: 'Browse' } },
      ])  // push pending
      .mockResolvedValueOnce([])   // email sent
      .mockResolvedValueOnce([]);  // email pending
    Profile.aggregate.mockResolvedValue([]);
    ScheduledJob.find.mockReturnValue(findChain([]));
    Profile.find.mockReturnValue(findChain([]));

    const res = await get(`/api/dashboard/${SHOP}/channels?from=${FROM}&to=${TO}`);
    const data = await res.json();

    expect(data.push.pending).toBe(5);
    const cartType = data.push.types.find((t) => t.type === 'cart_abandon');
    expect(cartType.sent).toBe(2);
    expect(cartType.pending).toBe(4);
    // preview from sent row (added first) — not overwritten by pending
    expect(cartType.preview.title).toBe('Sent');
  });

  test('ch4. email sent uses Profile.messages aggregate total', async () => {
    ScheduledJob.aggregate
      .mockResolvedValueOnce([])  // push sent
      .mockResolvedValueOnce([])  // push pending
      .mockResolvedValueOnce([])  // email sent types
      .mockResolvedValueOnce([]); // email pending
    Profile.aggregate.mockResolvedValueOnce([{ total: 12 }]);  // email messages count
    ScheduledJob.find.mockReturnValue(findChain([]));
    Profile.find.mockReturnValue(findChain([]));

    const res = await get(`/api/dashboard/${SHOP}/channels?from=${FROM}&to=${TO}`);
    const data = await res.json();

    expect(data.email.sent).toBe(12);
  });

  test('ch5. WhatsApp sent counted and purpose breakdown returned', async () => {
    ScheduledJob.aggregate
      .mockResolvedValueOnce([])  // push sent
      .mockResolvedValueOnce([])  // push pending
      .mockResolvedValueOnce([])  // email sent
      .mockResolvedValueOnce([]); // email pending
    Profile.aggregate.mockResolvedValue([]);
    ScheduledJob.find.mockReturnValue(findChain([
      { purpose: 'followup' },
      { purpose: 'followup' },
      { purpose: 'order' },
    ]));
    Profile.find.mockReturnValue(findChain([]));

    const res = await get(`/api/dashboard/${SHOP}/channels?from=${FROM}&to=${TO}`);
    const data = await res.json();

    expect(data.whatsapp.sent).toBe(3);
    expect(data.whatsapp.sentFollowup).toBe(2);
    expect(data.whatsapp.sentOrder).toBe(1);
  });

  test('ch6. WhatsApp pending = opted-in minus contacted', async () => {
    ScheduledJob.aggregate
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    Profile.aggregate.mockResolvedValue([]);
    ScheduledJob.find.mockReturnValue(findChain([]));  // WA jobs sent
    // 3 opted-in profiles
    Profile.find.mockReturnValue(findChain([
      { _id: 'p1' },
      { _id: 'p2' },
      { _id: 'p3' },
    ]));
    // 1 already contacted
    ScheduledJob.distinct = jest.fn().mockResolvedValue(['p1']);

    const res = await get(`/api/dashboard/${SHOP}/channels?from=${FROM}&to=${TO}`);
    const data = await res.json();

    expect(data.whatsapp.pending).toBe(2);
  });

  test('ch7. wrong shop returns 403', async () => {
    const res = await get(`/api/dashboard/other.myshopify.com/channels`, SHOP);
    expect(res.status).toBe(403);
  });

  test('ch8. ScheduledJob.aggregate throws → 500 with generic error', async () => {
    ScheduledJob.aggregate.mockRejectedValue(new Error('DB down'));
    const res = await get(`/api/dashboard/${SHOP}/channels?from=${FROM}&to=${TO}`);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Failed to load channel stats');
  });
});

// ====================================================================
// GET /channels/:channel/items
// ====================================================================

describe('GET /:shopDomain/channels/:channel/items', () => {
  test('i1. invalid channel returns 400', async () => {
    const res = await get(`/api/dashboard/${SHOP}/channels/sms/items?status=sent`);
    expect(res.status).toBe(400);
  });

  test('i2. push sent items returns jobs with preview and customer name', async () => {
    const profileId = '507f1f77bcf86cd799439011';
    ScheduledJob.find.mockReturnValue(findChain([
      {
        _id: 'job1',
        signalType: 'cart_abandon',
        sentAt: new Date('2026-09-10T10:00:00Z'),
        profileId,
        payload: { title: 'Come back', body: 'You left something.', imageUrl: 'img.jpg' },
        outcome: 'clicked',
      },
    ]));
    ScheduledJob.countDocuments = jest.fn().mockResolvedValue(1);
    Profile.find.mockReturnValue(findChain([
      {
        _id: profileId,
        channels: { email: { address: 'user@example.com' } },
        identifiers: { emails: ['user@example.com'] },
      },
    ]));

    const res = await get(`/api/dashboard/${SHOP}/channels/push/items?status=sent&from=${FROM}&to=${TO}`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.total).toBe(1);
    expect(data.items).toHaveLength(1);
    const item = data.items[0];
    expect(item.type).toBe('cart_abandon');
    expect(item.label).toBe('Cart reminder');
    expect(item.preview.title).toBe('Come back');
    expect(item.preview.body).toBe('You left something.');
    expect(item.outcome).toBe('clicked');
    expect(item.customer.email).toBe('user@example.com');
    expect(item.customer.name).toBe('User');
  });

  test('i3. email sent items return subject/body preview', async () => {
    ScheduledJob.find.mockReturnValue(findChain([
      {
        _id: 'job2',
        signalType: 'lapsing',
        sentAt: new Date('2026-09-05T09:00:00Z'),
        profileId: null,
        payload: { subject: 'We miss you', body: 'Come back soon.' },
        outcome: 'delivered',
      },
    ]));
    ScheduledJob.countDocuments = jest.fn().mockResolvedValue(1);
    Profile.find.mockReturnValue(findChain([]));

    const res = await get(`/api/dashboard/${SHOP}/channels/email/items?status=sent&from=${FROM}&to=${TO}`);
    const data = await res.json();

    expect(res.status).toBe(200);
    const item = data.items[0];
    expect(item.preview.subject).toBe('We miss you');
    expect(item.preview.body).toBe('Come back soon.');
    expect(item.label).toBe('Going quiet');
  });

  test('i4. WhatsApp pending items come from Profile records, not ScheduledJob', async () => {
    const p1 = {
      _id: 'pA',
      channels: {
        whatsapp: { consentedAt: new Date('2026-08-01'), optedOutAt: null },
        email: { address: 'alice@example.com' },
      },
      identifiers: { emails: ['alice@example.com'], phones: ['+911234567890'] },
    };
    // Profile.find for opted-in then again for enrichment — both return the same chain.
    Profile.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([p1]),
    });
    ScheduledJob.distinct = jest.fn().mockResolvedValue([]); // never contacted

    const res = await get(`/api/dashboard/${SHOP}/channels/whatsapp/items?status=pending`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.total).toBe(1);
    const item = data.items[0];
    expect(item.id).toBe('pA');
    expect(item.purpose).toBe('followup');
    expect(item.customer.email).toBe('alice@example.com');
    expect(item.customer.name).toBe('Alice');
    expect(item.consentedAt).toBeDefined();
  });

  test('i5. WhatsApp pending excludes already-contacted profiles', async () => {
    const profiles = [
      { _id: 'pA', channels: { whatsapp: { consentedAt: new Date('2026-08-01'), optedOutAt: null }, email: { address: 'a@e.com' } }, identifiers: { emails: [] } },
      { _id: 'pB', channels: { whatsapp: { consentedAt: new Date('2026-07-01'), optedOutAt: null }, email: { address: 'b@e.com' } }, identifiers: { emails: [] } },
    ];
    Profile.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(profiles),
    });
    ScheduledJob.distinct = jest.fn().mockResolvedValue(['pA']); // pA already contacted

    const res = await get(`/api/dashboard/${SHOP}/channels/whatsapp/items?status=pending`);
    const data = await res.json();

    expect(data.total).toBe(1);
    expect(data.items[0].id).toBe('pB');
  });

  test('i6. pagination: page and limit are applied; limit capped at 50', async () => {
    const jobs = Array.from({ length: 5 }, (_, i) => ({
      _id: `j${i}`,
      signalType: 'cart_abandon',
      sentAt: new Date(),
      profileId: null,
      payload: {},
      outcome: null,
    }));
    ScheduledJob.find.mockReturnValue(findChain(jobs));
    ScheduledJob.countDocuments = jest.fn().mockResolvedValue(100);
    Profile.find.mockReturnValue(findChain([]));

    const res = await get(`/api/dashboard/${SHOP}/channels/push/items?status=sent&page=2&limit=5`);
    const data = await res.json();

    expect(data.page).toBe(2);
    expect(data.limit).toBe(5);
    expect(data.total).toBe(100);

    // Verify skip was called with page*limit = 10
    const findCall = ScheduledJob.find.mock.results[0].value;
    expect(findCall.skip).toHaveBeenCalledWith(10);
    expect(findCall.limit).toHaveBeenCalledWith(5);
  });

  test('i7. type filter is passed to the ScheduledJob query', async () => {
    ScheduledJob.find.mockReturnValue(findChain([]));
    ScheduledJob.countDocuments = jest.fn().mockResolvedValue(0);
    Profile.find.mockReturnValue(findChain([]));

    await get(`/api/dashboard/${SHOP}/channels/push/items?status=sent&type=cart_abandon&from=${FROM}&to=${TO}`);

    const [query] = ScheduledJob.find.mock.calls[0];
    expect(query.signalType).toBe('cart_abandon');
  });

  test('i8. items endpoint returns 403 for wrong shop', async () => {
    const res = await get(`/api/dashboard/other.myshopify.com/channels/push/items`, SHOP);
    expect(res.status).toBe(403);
  });

  test('i9. WA sent items return outcomeChip from AttributedEvent (furthest event wins)', async () => {
    const jobId = '507f1f77bcf86cd799439022';
    ScheduledJob.find.mockReturnValue(findChain([
      { _id: jobId, purpose: 'followup', sentAt: new Date(), profileId: null,
        messageText: 'Hi!', outcome: null },
    ]));
    ScheduledJob.countDocuments = jest.fn().mockResolvedValue(1);
    Profile.find.mockReturnValue(findChain([]));
    AttributedEvent.find.mockReturnValue(findChain([
      { jobId, eventType: 'revisit' },
      { jobId, eventType: 'add_to_cart' },
    ]));

    const res = await get(`/api/dashboard/${SHOP}/channels/whatsapp/items?status=sent&from=${FROM}&to=${TO}`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.items[0].outcomeChip).toBe('Added to cart');
  });

  test('i10. WA sent items: purchase beats add_to_cart in priority', async () => {
    const jobId = '507f1f77bcf86cd799439033';
    ScheduledJob.find.mockReturnValue(findChain([
      { _id: jobId, purpose: 'followup', sentAt: new Date(), profileId: null,
        messageText: 'Buy now!', outcome: null },
    ]));
    ScheduledJob.countDocuments = jest.fn().mockResolvedValue(1);
    Profile.find.mockReturnValue(findChain([]));
    AttributedEvent.find.mockReturnValue(findChain([
      { jobId, eventType: 'add_to_cart' },
      { jobId, eventType: 'purchase' },
    ]));

    const res = await get(`/api/dashboard/${SHOP}/channels/whatsapp/items?status=sent&from=${FROM}&to=${TO}`);
    const data = await res.json();

    expect(data.items[0].outcomeChip).toBe('Bought');
  });

  test('i11. WA sent items: no AttributedEvents returns null outcomeChip', async () => {
    const jobId = '507f1f77bcf86cd799439044';
    ScheduledJob.find.mockReturnValue(findChain([
      { _id: jobId, purpose: 'order', sentAt: new Date(), profileId: null,
        messageText: 'Order ready', outcome: null },
    ]));
    ScheduledJob.countDocuments = jest.fn().mockResolvedValue(1);
    Profile.find.mockReturnValue(findChain([]));
    AttributedEvent.find.mockReturnValue(findChain([]));

    const res = await get(`/api/dashboard/${SHOP}/channels/whatsapp/items?status=sent&from=${FROM}&to=${TO}`);
    const data = await res.json();

    expect(data.items[0].outcomeChip).toBeNull();
  });
});
