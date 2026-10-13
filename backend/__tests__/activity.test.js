/**
 * Tests for the four Activity-page fixes:
 *   Fix 1  — reached_checkout maps to checkout_start in ATTRIBUTION_TYPE_MAP
 *   Fix 2  — orders/create webhook writes an idempotent purchase AttributedEvent
 *   Fix 3  — email send paths embed ccf_src=email&ccf_job in the CTA URL
 *   Fix 4a — GET /api/activity: shop scoping, date range, summary counts, list order
 */

// ─── shared mocks ────────────────────────────────────────────────────────────

jest.mock('../middleware/requireOwner', () => ({
  requireAuth: jest.fn((req, _res, next) => next()),
  requireStoreOwner: jest.fn((_req, _res, next) => next()),
}));

// ─── Fix 4a: GET /api/activity ───────────────────────────────────────────────

describe('GET /api/activity', () => {
  let mockAggregate, mockFind, mockProfileFind;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockAggregate  = jest.fn();
    mockFind       = jest.fn();
    mockProfileFind = jest.fn();

    jest.mock('../models/AttributedEvent', () => ({
      aggregate: (...a) => mockAggregate(...a),
      find:      (...a) => mockFind(...a),
    }));
    jest.mock('../models/Profile', () => ({
      find: (...a) => mockProfileFind(...a),
    }));
  });

  function makeReq(overrides = {}) {
    return {
      shopDomain: 'demo.myshopify.com',
      query: {},
      ...overrides,
    };
  }

  function makeRes() {
    const r = { _body: null, _status: 200 };
    r.status = (c) => { r._status = c; return r; };
    r.json   = (b) => { r._body  = b; return r; };
    return r;
  }

  function getHandler() {
    const router = require('../routes/activity');
    const layer = router.stack.find(
      (l) => l.route && l.route.path === '/' && l.route.methods.get
    );
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
  }

  function setupMocks(counts = [], events = [], profiles = []) {
    mockAggregate.mockResolvedValue(counts);
    mockFind.mockReturnValue({ sort: () => ({ limit: () => ({ lean: () => Promise.resolve(events) }) }) });
    mockProfileFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve(profiles) }) });
  }

  test('scopes aggregate and find to req.shopDomain, never another shop', async () => {
    setupMocks([], [], []);
    const handler = getHandler();
    const req = makeReq({ shopDomain: 'shop-a.myshopify.com' });
    const res = makeRes();
    await handler(req, res);

    const [[matchStage]] = mockAggregate.mock.calls;
    expect(matchStage[0].$match.shopDomain).toBe('shop-a.myshopify.com');

    const [[findQuery]] = mockFind.mock.calls;
    expect(findQuery.shopDomain).toBe('shop-a.myshopify.com');
  });

  test('uses default 7-day date range when no query params', async () => {
    setupMocks([], [], []);
    const before = Date.now();
    const handler = getHandler();
    await handler(makeReq(), makeRes());
    const after = Date.now();

    const [[matchStage]] = mockAggregate.mock.calls;
    const { $gte, $lte } = matchStage[0].$match.ts;

    // $lte should be close to "now" (end of today)
    expect($lte.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect($lte.getTime()).toBeLessThanOrEqual(after + 86400000);

    // $gte should be ~7 days before $lte
    const diff = $lte.getTime() - $gte.getTime();
    expect(diff).toBeGreaterThanOrEqual(6 * 86400000);
    expect(diff).toBeLessThanOrEqual(8 * 86400000);
  });

  test('respects explicit from/to query params', async () => {
    setupMocks([], [], []);
    const handler = getHandler();
    const req = makeReq({ query: { from: '2026-01-01', to: '2026-01-07' } });
    await handler(req, makeRes());

    const [[matchStage]] = mockAggregate.mock.calls;
    const gte = matchStage[0].$match.ts.$gte;
    const lte = matchStage[0].$match.ts.$lte;
    // Route calls setHours(0,0,0,0) which is LOCAL time; allow ±24h for timezone offsets.
    expect(gte.getTime()).toBeGreaterThanOrEqual(new Date('2025-12-31').getTime());
    expect(gte.getTime()).toBeLessThanOrEqual(new Date('2026-01-02').getTime());
    expect(lte.getTime()).toBeGreaterThanOrEqual(new Date('2026-01-06').getTime());
    expect(lte.getTime()).toBeLessThanOrEqual(new Date('2026-01-08').getTime());
  });

  test('filters find by eventType when query param provided', async () => {
    setupMocks([], [], []);
    const handler = getHandler();
    await handler(makeReq({ query: { eventType: 'purchase' } }), makeRes());

    const [[findQuery]] = mockFind.mock.calls;
    expect(findQuery.eventType).toBe('purchase');
  });

  test('summary counts map aggregate results to correct keys', async () => {
    setupMocks(
      [
        { _id: 'revisit',       count: 10, profiles: [] },
        { _id: 'add_to_cart',   count: 5,  profiles: [] },
        { _id: 'checkout_start',count: 3,  profiles: [] },
        { _id: 'purchase',      count: 2,  profiles: [] },
      ],
      [],
      []
    );
    const handler = getHandler();
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res._body.summary).toEqual({
      revisit: 10,
      add_to_cart: 5,
      checkout_start: 3,
      purchase: 2,
    });
  });

  test('unknown eventType in aggregate result is ignored in summary', async () => {
    setupMocks([{ _id: 'bogus', count: 99, profiles: [] }], [], []);
    const handler = getHandler();
    const res = makeRes();
    await handler(makeReq(), res);

    const { summary } = res._body;
    expect(summary.revisit).toBe(0);
    expect(summary.add_to_cart).toBe(0);
    expect(summary.checkout_start).toBe(0);
    expect(summary.purchase).toBe(0);
  });

  test('users list is returned newest-first (sort order delegated to Mongo)', async () => {
    const now = Date.now();
    const events = [
      { eventType: 'revisit', ts: new Date(now), profileId: null, jobId: null, sessionId: 's1', email: null, meta: {} },
      { eventType: 'add_to_cart', ts: new Date(now - 60000), profileId: null, jobId: null, sessionId: 's2', email: null, meta: {} },
    ];
    setupMocks([], events, []);
    const handler = getHandler();
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res._body.users[0].eventType).toBe('revisit');
    expect(res._body.users[1].eventType).toBe('add_to_cart');
    expect(res._body.total).toBe(2);
  });

  test('enriches events with profile email when profileId present', async () => {
    const profileId = '507f1f77bcf86cd799439011';
    const events = [
      { eventType: 'purchase', ts: new Date(), profileId, jobId: null, sessionId: null, email: null, meta: {} },
    ];
    const profiles = [
      { _id: { toString: () => profileId }, channels: { email: { address: 'buyer@example.com' }, push: { subscribed: true } } },
    ];
    setupMocks([], events, profiles);
    const handler = getHandler();
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res._body.users[0].email).toBe('buyer@example.com');
  });

  test('returns 500 on unexpected error', async () => {
    mockAggregate.mockRejectedValue(new Error('DB down'));
    mockFind.mockReturnValue({ sort: () => ({ limit: () => ({ lean: () => Promise.resolve([]) }) }) });
    mockProfileFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });

    const handler = getHandler();
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res._status).toBe(500);
    expect(res._body.error).toBeDefined();
  });
});

// ─── Fix 1: reached_checkout → checkout_start mapping ───────────────────────

describe('ATTRIBUTION_TYPE_MAP: reached_checkout → checkout_start', () => {
  let mockAttributedEvent, mockStorefrontEvent, mockProfile;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockAttributedEvent = { insertMany: jest.fn().mockResolvedValue([]) };
    mockStorefrontEvent = { insertMany: jest.fn().mockResolvedValue([]) };
    mockProfile = {
      findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
    };

    jest.mock('../models/AttributedEvent', () => mockAttributedEvent);
    jest.mock('../models/StorefrontEvent', () => mockStorefrontEvent);
    jest.mock('../models/Profile', () => mockProfile);
    jest.mock('../models/ProductImageCache', () => ({ findOne: jest.fn(), updateOne: jest.fn() }));
    jest.mock('../utils/productImage', () => ({
      normalizeImageUrl: jest.fn((u) => u || null),
      fetchProductImageWithTimeout: jest.fn().mockResolvedValue(null),
    }));
    jest.mock('../services/profileService', () => ({
      upsertProfile: jest.fn().mockResolvedValue(null),
    }));
    jest.mock('../services/signalEngine', () => ({
      computeSignalsForProfile: jest.fn().mockResolvedValue(null),
    }));
    jest.mock('../services/realtimeTrigger', () => ({
      maybeScheduleRealtime: jest.fn().mockResolvedValue(null),
    }));
    jest.mock('../services/pushHygiene', () => ({
      clearPushSuppression: jest.fn().mockResolvedValue(null),
    }));
  });

  function getEventsHandler() {
    const router = require('../routes/events');
    const layer = router.stack.find(
      (l) => l.route && l.route.path === '/' && l.route.methods.post
    );
    return layer.route.stack[layer.route.stack.length - 1].handle;
  }

  // The events route reads shopDomain from body, not req.shopDomain.
  function makeReq(overrides = {}) {
    return {
      shopDomain: 'demo.myshopify.com',
      body: {
        shopDomain: 'demo.myshopify.com',
        events: [],
        sessionId: null,
        ...overrides,
      },
    };
  }

  function makeRes() {
    const r = { _status: 200, _body: null };
    r.status = (c) => { r._status = c; return r; };
    r.json   = (b) => { r._body  = b; return r; };
    return r;
  }

  async function flush() {
    // Flush microtasks twice so the fire-and-forget IIFE has time to complete.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  }

  test('reached_checkout event with ccf_job writes a checkout_start AttributedEvent', async () => {
    const handler = getEventsHandler();
    await handler(makeReq({
      events: [{ type: 'reached_checkout', ts: Date.now(), meta: {} }],
      ccf_job: 'job123',
    }), makeRes());
    await flush();

    expect(mockAttributedEvent.insertMany).toHaveBeenCalledTimes(1);
    const [rows] = mockAttributedEvent.insertMany.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0].eventType).toBe('checkout_start');
    expect(rows[0].jobId).toBe('job123');
  });

  test('checkout_start event (forward-compat) also maps to checkout_start', async () => {
    const handler = getEventsHandler();
    await handler(makeReq({
      events: [{ type: 'checkout_start', ts: Date.now(), meta: {} }],
      ccf_job: 'job456',
    }), makeRes());
    await flush();

    expect(mockAttributedEvent.insertMany).toHaveBeenCalledTimes(1);
    const [rows] = mockAttributedEvent.insertMany.mock.calls[0];
    expect(rows[0].eventType).toBe('checkout_start');
  });

  test('reached_checkout WITHOUT ccf_job does NOT write AttributedEvent', async () => {
    const handler = getEventsHandler();
    await handler(makeReq({
      events: [{ type: 'reached_checkout', ts: Date.now(), meta: {} }],
      // no ccf_job field
    }), makeRes());
    await flush();

    expect(mockAttributedEvent.insertMany).not.toHaveBeenCalled();
  });

  test('page_view and add_to_cart still map correctly', async () => {
    const handler = getEventsHandler();
    await handler(makeReq({
      events: [
        { type: 'page_view',   ts: Date.now(), meta: {} },
        { type: 'add_to_cart', ts: Date.now(), meta: {} },
      ],
      ccf_job: 'jobXYZ',
    }), makeRes());
    await flush();

    const [rows] = mockAttributedEvent.insertMany.mock.calls[0];
    expect(rows.map((r) => r.eventType)).toEqual(['revisit', 'add_to_cart']);
  });
});

// ─── Fix 2: purchase AttributedEvent idempotency ────────────────────────────

describe('orders/create webhook: purchase AttributedEvent', () => {
  let mockAttributedEvent, mockScheduledJob, mockProfile, mockAbandonedCustomer;
  let mockPushClick;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockAttributedEvent = { updateOne: jest.fn().mockResolvedValue({ upsertedId: 'ae1' }) };
    mockScheduledJob = {
      findById:        jest.fn(),
      findByIdAndUpdate: jest.fn().mockResolvedValue({}),
      updateMany:      jest.fn().mockResolvedValue({}),
    };
    mockProfile = {
      findOne:  jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) }),
      updateOne: jest.fn().mockResolvedValue({}),
    };
    mockAbandonedCustomer = {
      findOne:        jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
      updateMany:     jest.fn().mockResolvedValue({ matchedCount: 0 }),
    };
    mockPushClick = { findOne: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) }) };

    jest.mock('../models/AttributedEvent', () => mockAttributedEvent);
    jest.mock('../models/ScheduledJob', () => mockScheduledJob);
    jest.mock('../models/Profile', () => mockProfile);
    jest.mock('../models/AbandonedCustomer', () => mockAbandonedCustomer);
    jest.mock('../models/Store', () => ({ findOne: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(null) }) }));
    jest.mock('../models/PushClick', () => mockPushClick);
    jest.mock('../models/StorefrontEvent', () => ({ findOne: jest.fn() }));
    jest.mock('../models/CustomerPushSubscription', () => ({ findOne: jest.fn(), find: jest.fn() }));
    jest.mock('../utils/shopify', () => ({
      verifyWebhookHmac: jest.fn().mockReturnValue(true),
    }));
    jest.mock('../utils/email', () => ({ sendAbandonedCartEmail: jest.fn().mockResolvedValue({}) }));
    jest.mock('../utils/pushNotification', () => ({
      sendPushToStore: jest.fn(),
      sendPushToCustomers: jest.fn(),
    }));
    jest.mock('../utils/productImage', () => ({ fetchProductImage: jest.fn() }));
    jest.mock('../services/profileService', () => ({
      upsertProfile: jest.fn().mockResolvedValue({ _id: 'p1' }),
    }));
    jest.mock('../services/signalEngine', () => ({ computeSignalsForProfile: jest.fn() }));
  });

  function getOrderHandler() {
    const router = require('../routes/webhooks');
    // Route is registered as POST /order (mounted at /api/webhooks/order)
    const layer = router.stack.find(
      (l) => l.route && l.route.path === '/order' && l.route.methods.post
    );
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
  }

  function makeOrderReq(orderId = '9001', noteAttributes = []) {
    const body = {
      id: orderId,
      test: false,
      shopDomain: 'demo.myshopify.com', // fallback shop extraction in handler
      email: 'buyer@example.com',
      total_price: '999.00',
      currency: 'INR',
      customer: { id: '111', email: 'buyer@example.com' },
      line_items: [{ title: 'Kurta', variant_id: 'v1', quantity: 1, price: '999.00' }],
      note_attributes: noteAttributes,
      cart_token: 'cart-abc',
    };
    return {
      shopDomain: 'demo.myshopify.com',
      rawBody: '',
      body,
      // Express req.get() looks up headers case-insensitively
      get: (h) => {
        if (h.toLowerCase() === 'x-shopify-shop-domain') return 'demo.myshopify.com';
        if (h.toLowerCase() === 'x-shopify-hmac-sha256') return 'valid';
        return undefined;
      },
    };
  }

  function makeRes() {
    const r = { _status: 200 };
    r.status = (c) => { r._status = c; return r; };
    r.json   = () => r;
    r.send   = () => r;
    return r;
  }

  test('writes purchase AttributedEvent when order is linked to a job', async () => {
    const job = { _id: 'job001', toString: () => 'job001', profileId: 'prof1' };
    mockScheduledJob.findById.mockResolvedValue(job);

    const handler = getOrderHandler();
    const req = makeOrderReq('ORD-1', [{ name: '_ccf_job', value: 'job001' }]);
    await handler(req, makeRes());

    expect(mockAttributedEvent.updateOne).toHaveBeenCalledWith(
      { shopDomain: 'demo.myshopify.com', eventType: 'purchase', 'meta.orderId': 'ORD-1' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({ eventType: 'purchase' }),
      }),
      { upsert: true }
    );
  });

  test('upsert filter uses orderId deduplication — same orderId twice uses same filter', async () => {
    const job = { _id: 'job002', toString: () => 'job002', profileId: 'prof2' };
    mockScheduledJob.findById.mockResolvedValue(job);
    mockAttributedEvent.updateOne
      .mockResolvedValueOnce({ upsertedId: 'ae-new' })   // first call: inserted
      .mockResolvedValueOnce({ upsertedId: null, matchedCount: 1 }); // second: found

    const handler = getOrderHandler();
    await handler(makeOrderReq('ORD-2', [{ name: '_ccf_job', value: 'job002' }]), makeRes());
    await handler(makeOrderReq('ORD-2', [{ name: '_ccf_job', value: 'job002' }]), makeRes());

    expect(mockAttributedEvent.updateOne).toHaveBeenCalledTimes(2);
    const calls = mockAttributedEvent.updateOne.mock.calls;
    expect(calls[0][0]['meta.orderId']).toBe('ORD-2');
    expect(calls[1][0]['meta.orderId']).toBe('ORD-2');
  });

  test('does NOT write purchase AttributedEvent when no ccf_job (no attribution)', async () => {
    const handler = getOrderHandler();
    await handler(makeOrderReq('ORD-3', []), makeRes()); // no _ccf_job note attribute
    expect(mockAttributedEvent.updateOne).not.toHaveBeenCalled();
  });

  test('does NOT write purchase AttributedEvent for test orders', async () => {
    const job = { _id: 'job003', profileId: 'prof3' };
    mockScheduledJob.findById.mockResolvedValue(job);

    const req = makeOrderReq('ORD-4', [{ name: '_ccf_job', value: 'job003' }]);
    req.body.test = true;
    await getOrderHandler()(req, makeRes());

    expect(mockAttributedEvent.updateOne).not.toHaveBeenCalled();
  });

  test('outcome=converted and purchase AttributedEvent both fire for an attributed order', async () => {
    const job = { _id: 'job004', toString: () => 'job004', profileId: 'prof4' };
    mockScheduledJob.findById.mockResolvedValue(job);

    const handler = getOrderHandler();
    await handler(makeOrderReq('ORD-5', [{ name: '_ccf_job', value: 'job004' }]), makeRes());

    expect(mockScheduledJob.findByIdAndUpdate).toHaveBeenCalledWith('job004', { outcome: 'converted' });
    expect(mockAttributedEvent.updateOne).toHaveBeenCalledTimes(1);
  });
});

// ─── Fix 3: email CTA URL attribution ────────────────────────────────────────

describe('email CTA URL attribution', () => {
  const SHOP = 'demo.myshopify.com';
  const MONGOOSE_OID_RE = /^[0-9a-f]{24}$/;

  // Closure-captured mocks — factories reference these via closure.
  let mockSend, mockScheduledJobCreate, mockProfileFindOne;
  let mockRenderEmailDocument, mockDesignFromTemplate, mockLogBroadcastSend;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockSend              = jest.fn().mockResolvedValue({ data: { id: 'resend-id' }, error: null });
    mockScheduledJobCreate = jest.fn().mockResolvedValue({});
    mockProfileFindOne    = jest.fn();
    mockRenderEmailDocument = jest.fn().mockReturnValue('<html>email</html>');
    mockDesignFromTemplate  = jest.fn().mockReturnValue({
      ctaUrl: 'https://demo.myshopify.com/products/abc',
      subject: 'Hi',
      title: 'Sale',
    });
    mockLogBroadcastSend = jest.fn().mockResolvedValue([]);

    jest.mock('resend', () => ({
      Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
    }));
    jest.mock('../models/ScheduledJob', () => ({
      create: (...a) => mockScheduledJobCreate(...a),
    }));
    // findById returns the document directly (route does: await EmailTemplate.findById(id))
    jest.mock('../models/EmailTemplate', () => ({
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
      create: jest.fn(),
      insertMany: jest.fn(),
    }));
    // Profile.findOne is chained: .findOne({}).select('identifiers channels')
    jest.mock('../models/Profile', () => ({
      findOne:        (...a) => mockProfileFindOne(...a),
      countDocuments: jest.fn().mockResolvedValue(5),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
      }),
    }));
    jest.mock('../models/Store', () => ({
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue({
          shopName: 'Demo Store', logoUrl: null, primaryColor: null, voice: {},
        }),
      }),
    }));
    jest.mock('../utils/emailEngine', () => ({
      ...jest.requireActual('../utils/emailEngine'),
      renderEmailDocument: (...a) => mockRenderEmailDocument(...a),
    }));
    jest.mock('../utils/emailDesign', () => ({
      sanitizeDesignInput: jest.fn((d) => d),
      designFromTemplate:  (...a) => mockDesignFromTemplate(...a),
      pickStarterDesign:   jest.fn().mockReturnValue({}),
    }));
    jest.mock('../utils/email', () => ({
      FROM: 'noreply@example.com',
      UNSUBSCRIBE_HEADERS: { 'List-Unsubscribe': '<mailto:unsub@example.com>' },
      buildEmailHtml: jest.fn().mockReturnValue('<html>email</html>'),
    }));
    jest.mock('../services/aiService', () => ({ generateTemplateCopy: jest.fn() }));
    jest.mock('../services/sendLogService', () => ({
      logBroadcastSend: (...a) => mockLogBroadcastSend(...a),
    }));
    jest.mock('../utils/cloudinary', () => ({
      uploadImage: jest.fn(),
      uploadToCloudinary: jest.fn().mockResolvedValue('https://cdn.cloudinary.com/img.jpg'),
    }));
    jest.mock('../utils/festivals', () => ({
      upcomingFestival: jest.fn(),
      storeTodayYmd: jest.fn().mockReturnValue('2026-10-13'),
    }));
    jest.mock('../utils/productImage', () => ({
      normalizeImageUrl: jest.fn((u) => u || null),
    }));
    jest.mock('express-rate-limit', () => () => (_req, _res, next) => next());
  });

  function getRouter() {
    return require('../routes/emailTemplates');
  }

  function handlerFor(router, path, method) {
    const layer = router.stack.find(
      (l) => l.route && l.route.path === path && l.route.methods[method]
    );
    const stack = layer.route.stack;
    return stack[stack.length - 1].handle;
  }

  function makeRes() {
    const r = { _status: 200, _body: null };
    r.status = (c) => { r._status = c; return r; };
    r.json   = (b) => { r._body  = b; return r; };
    return r;
  }

  function makeTemplate(overrides = {}) {
    return {
      _id: 'tpl1',
      shopDomain: SHOP,
      type: 'normal',
      name: 'Test',
      subject: 'Hello',
      body: 'Body',
      imageUrl: null,
      ctaLabel: 'Shop',
      ctaUrl: 'https://demo.myshopify.com/products/abc',
      save: jest.fn().mockResolvedValue(true),
      ...overrides,
    };
  }

  function makeProfile() {
    return {
      _id: 'prof1',
      shopDomain: SHOP,
      identifiers: { emails: ['customer@example.com'] },
      channels: {},
    };
  }

  // ── /:id/send — single recipient ─────────────────────────────────────────

  describe('/:id/send (single recipient)', () => {
    test('CTA URL in rendered email contains ccf_src=email and a valid ObjectId as ccf_job', async () => {
      // Route: await EmailTemplate.findById(id) — no .lean() chain
      const EmailTemplate = require('../models/EmailTemplate');
      EmailTemplate.findById.mockResolvedValue(makeTemplate());
      // Route: await Profile.findOne({}).select('identifiers channels')
      mockProfileFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(makeProfile()) });

      const handler = handlerFor(getRouter(), '/:id/send', 'post');
      await handler(
        { shopDomain: SHOP, params: { id: 'tpl1' }, body: { email: 'customer@example.com' } },
        makeRes()
      );

      // design was mutated before being passed to renderEmailDocument
      expect(mockRenderEmailDocument).toHaveBeenCalledTimes(1);
      const [design] = mockRenderEmailDocument.mock.calls[0];
      expect(design.ctaUrl).toMatch(/ccf_src=email/);

      const ccfJobMatch = design.ctaUrl.match(/ccf_job=([0-9a-f]{24})/);
      expect(ccfJobMatch).toBeTruthy();
      const jobIdInUrl = ccfJobMatch[1];

      // ScheduledJob.create called with _id = the same pre-generated ObjectId
      expect(mockScheduledJobCreate).toHaveBeenCalledTimes(1);
      const [created] = mockScheduledJobCreate.mock.calls[0];
      expect(created._id.toString()).toBe(jobIdInUrl);
    });

    test('List-Unsubscribe header does NOT contain ccf_src or ccf_job', async () => {
      const EmailTemplate = require('../models/EmailTemplate');
      EmailTemplate.findById.mockResolvedValue(makeTemplate());
      mockProfileFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(makeProfile()) });

      const handler = handlerFor(getRouter(), '/:id/send', 'post');
      await handler(
        { shopDomain: SHOP, params: { id: 'tpl1' }, body: { email: 'customer@example.com' } },
        makeRes()
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      const [sendArgs] = mockSend.mock.calls[0];
      const unsubHeader = sendArgs.headers?.['List-Unsubscribe'] || '';
      expect(unsubHeader).not.toMatch(/ccf_src/);
      expect(unsubHeader).not.toMatch(/ccf_job/);
    });

    test('template with null ctaUrl is not modified (no ccf_job appended)', async () => {
      const EmailTemplate = require('../models/EmailTemplate');
      EmailTemplate.findById.mockResolvedValue(makeTemplate({ ctaUrl: null }));
      mockProfileFindOne.mockReturnValue({ select: jest.fn().mockResolvedValue(makeProfile()) });
      mockDesignFromTemplate.mockReturnValue({ ctaUrl: null, subject: 'Hi' });

      const handler = handlerFor(getRouter(), '/:id/send', 'post');
      await handler(
        { shopDomain: SHOP, params: { id: 'tpl1' }, body: { email: 'customer@example.com' } },
        makeRes()
      );

      expect(mockRenderEmailDocument).toHaveBeenCalledTimes(1);
      const [design] = mockRenderEmailDocument.mock.calls[0];
      expect(design.ctaUrl).toBeNull();
    });
  });

  // ── /:id/broadcast ────────────────────────────────────────────────────────

  describe('/:id/broadcast', () => {
    function setupBroadcastMocks(recipientCount = 2) {
      const EmailTemplate = require('../models/EmailTemplate');
      EmailTemplate.findById.mockResolvedValue(makeTemplate());
      const Profile = require('../models/Profile');
      Profile.countDocuments.mockResolvedValue(recipientCount);
      Profile.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(
            Array.from({ length: recipientCount }, (_, i) => ({
              identifiers: { emails: [`user${i}@example.com`] },
              channels: {},
            }))
          ),
        }),
      });
    }

    test('CTA URL in broadcast email contains ccf_src=email and a valid ObjectId', async () => {
      setupBroadcastMocks(2);

      const handler = handlerFor(getRouter(), '/:id/broadcast', 'post');
      const req = { shopDomain: SHOP, params: { id: 'tpl1' }, body: { segment: 'everyone' } };
      await handler(req, makeRes());

      expect(mockRenderEmailDocument).toHaveBeenCalledTimes(1);
      const [design] = mockRenderEmailDocument.mock.calls[0];
      expect(design.ctaUrl).toMatch(/ccf_src=email/);
      expect(design.ctaUrl).toMatch(/ccf_job=[0-9a-f]{24}/);
    });

    test('same ccf_job is used for all recipients (HTML rendered once)', async () => {
      setupBroadcastMocks(1);

      const handler = handlerFor(getRouter(), '/:id/broadcast', 'post');
      await handler(
        { shopDomain: SHOP, params: { id: 'tpl1' }, body: { segment: 'everyone' } },
        makeRes()
      );

      // HTML built once for the entire broadcast
      expect(mockRenderEmailDocument).toHaveBeenCalledTimes(1);
      const [design] = mockRenderEmailDocument.mock.calls[0];
      const match = design.ctaUrl.match(/ccf_job=([0-9a-f]{24})/);
      expect(match).toBeTruthy();
      expect(MONGOOSE_OID_RE.test(match[1])).toBe(true);
    });
  });
});
