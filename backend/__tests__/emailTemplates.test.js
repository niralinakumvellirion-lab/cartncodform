/**
 * Tests for backend/routes/emailTemplates.js
 *
 * Covers: CRUD happy paths, IDOR rejection (a shop cannot access another
 * shop's template), preview renders via buildEmailHtml, and send renders
 * via buildEmailHtml and calls Resend with the correct payload.
 */

jest.mock('../models/EmailTemplate', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn(),
  insertMany: jest.fn(),
}));

jest.mock('../models/Profile', () => ({
  findOne: jest.fn(),
  countDocuments: jest.fn(),
  find: jest.fn(),
}));

jest.mock('../models/Store', () => ({
  findOne: jest.fn(),
}));

jest.mock('../middleware/requireOwner', () => ({
  requireAuth: jest.fn(),
  requireStoreOwner: jest.fn(),
}));

jest.mock('../utils/productImage', () => ({
  normalizeImageUrl: jest.fn((url) => (typeof url === 'string' && url ? url : null)),
}));

const mockGenerateTemplateCopy = jest.fn();
jest.mock('../services/aiService', () => ({
  generateTemplateCopy: (...args) => mockGenerateTemplateCopy(...args),
}));

const mockLogBroadcastSend = jest.fn();
jest.mock('../services/sendLogService', () => ({
  logBroadcastSend: (...args) => mockLogBroadcastSend(...args),
}));

const mockBuildEmailHtml = jest.fn().mockReturnValue('<html>rendered</html>');
jest.mock('../utils/email', () => ({
  FROM: 'notifications@shopireachboost.com',
  UNSUBSCRIBE_HEADERS: {
    'List-Unsubscribe': '<mailto:unsubscribe@shopireachboost.com>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  },
  buildEmailHtml: mockBuildEmailHtml,
}));

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

const EmailTemplate = require('../models/EmailTemplate');
const Profile = require('../models/Profile');
const Store = require('../models/Store');
const emailTemplatesRouter = require('../routes/emailTemplates');

// ---- helpers ----------------------------------------------------------------

function handlerFor(router, path, method) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  const stack = layer.route.stack;
  return stack[stack.length - 1].handle;
}

function mockRes() {
  const res = { body: null, statusCode: 200 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const SHOP = 'demo.myshopify.com';
const OTHER_SHOP = 'other.myshopify.com';
const TEMPLATE_ID = 'tpl001';

function makeTemplate(overrides = {}) {
  return {
    _id: TEMPLATE_ID,
    shopDomain: SHOP,
    type: 'normal',
    name: 'Test Template',
    subject: 'Hello',
    body: 'Body text',
    imageUrl: null,
    ctaLabel: null,
    ctaUrl: null,
    save: jest.fn().mockResolvedValue(true),
    deleteOne: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeProfile(overrides = {}) {
  return {
    _id: 'profile1',
    shopDomain: SHOP,
    identifiers: { emails: ['customer@example.com'] },
    channels: {},
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  Store.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({ shopName: 'Demo Store', logoUrl: null, primaryColor: null, voice: {} }),
  });
  mockGenerateTemplateCopy.mockResolvedValue({ subject: 'AI Subject', body: 'AI body', fallback: false });
});

// ---- GET / ------------------------------------------------------------------

describe('GET / (list)', () => {
  const list = handlerFor(emailTemplatesRouter, '/', 'get');

  test('returns templates for the authenticated shop', async () => {
    const templates = [makeTemplate()];
    EmailTemplate.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(templates) });
    const res = mockRes();
    await list({ shopDomain: SHOP }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.templates).toHaveLength(1);
    expect(EmailTemplate.find).toHaveBeenCalledWith({ shopDomain: SHOP });
  });
});

// ---- GET /:id ---------------------------------------------------------------

describe('GET /:id', () => {
  const get = handlerFor(emailTemplatesRouter, '/:id', 'get');

  test('returns the template when it belongs to this shop', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate());
    const res = mockRes();
    await get({ shopDomain: SHOP, params: { id: TEMPLATE_ID } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.template._id).toBe(TEMPLATE_ID);
  });

  test('IDOR: returns 404 when template belongs to another shop', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate({ shopDomain: OTHER_SHOP }));
    const res = mockRes();
    await get({ shopDomain: SHOP, params: { id: TEMPLATE_ID } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Template not found');
  });

  test('returns 404 when template does not exist', async () => {
    EmailTemplate.findById.mockResolvedValue(null);
    const res = mockRes();
    await get({ shopDomain: SHOP, params: { id: 'nonexistent' } }, res);
    expect(res.statusCode).toBe(404);
  });
});

// ---- POST / -----------------------------------------------------------------

describe('POST / (create)', () => {
  const create = handlerFor(emailTemplatesRouter, '/', 'post');

  test('creates a template with valid fields', async () => {
    const created = makeTemplate({ type: 'festival', name: 'Diwali', subject: 'Sub', body: 'Hi' });
    EmailTemplate.create.mockResolvedValue(created);
    const res = mockRes();
    await create({
      shopDomain: SHOP,
      body: { type: 'festival', name: 'Diwali', subject: 'Sub', body: 'Hi' },
    }, res);
    expect(res.statusCode).toBe(201);
    expect(EmailTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({ shopDomain: SHOP, type: 'festival' })
    );
  });

  test('400 when type is missing', async () => {
    const res = mockRes();
    await create({ shopDomain: SHOP, body: { name: 'X', subject: 'S', body: 'B' } }, res);
    expect(res.statusCode).toBe(400);
  });

  test('400 when type is invalid', async () => {
    const res = mockRes();
    await create({ shopDomain: SHOP, body: { type: 'campaign', name: 'X', subject: 'S', body: 'B' } }, res);
    expect(res.statusCode).toBe(400);
  });

  test('400 when name is missing', async () => {
    const res = mockRes();
    await create({ shopDomain: SHOP, body: { type: 'normal', subject: 'S', body: 'B' } }, res);
    expect(res.statusCode).toBe(400);
  });

  test('400 when body is missing', async () => {
    const res = mockRes();
    await create({ shopDomain: SHOP, body: { type: 'normal', name: 'X', subject: 'S' } }, res);
    expect(res.statusCode).toBe(400);
  });
});

// ---- PATCH /:id -------------------------------------------------------------

describe('PATCH /:id', () => {
  const patch = handlerFor(emailTemplatesRouter, '/:id', 'patch');

  test('updates allowed fields', async () => {
    const t = makeTemplate();
    EmailTemplate.findById.mockResolvedValue(t);
    const res = mockRes();
    await patch({
      shopDomain: SHOP,
      params: { id: TEMPLATE_ID },
      body: { name: 'Updated Name', subject: 'New Subject' },
    }, res);
    expect(res.statusCode).toBe(200);
    expect(t.save).toHaveBeenCalled();
  });

  test('IDOR: returns 404 when template belongs to another shop', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate({ shopDomain: OTHER_SHOP }));
    const res = mockRes();
    await patch({
      shopDomain: SHOP,
      params: { id: TEMPLATE_ID },
      body: { name: 'Steal' },
    }, res);
    expect(res.statusCode).toBe(404);
  });

  test('shopDomain field in body is ignored (not in EDITABLE_FIELDS)', async () => {
    const t = makeTemplate();
    EmailTemplate.findById.mockResolvedValue(t);
    const res = mockRes();
    await patch({
      shopDomain: SHOP,
      params: { id: TEMPLATE_ID },
      body: { shopDomain: OTHER_SHOP, name: 'X' },
    }, res);
    expect(t.shopDomain).toBe(SHOP);
  });

  test('400 when clearing a required field', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate());
    const res = mockRes();
    await patch({
      shopDomain: SHOP,
      params: { id: TEMPLATE_ID },
      body: { subject: '' },
    }, res);
    expect(res.statusCode).toBe(400);
  });
});

// ---- DELETE /:id ------------------------------------------------------------

describe('DELETE /:id', () => {
  const del = handlerFor(emailTemplatesRouter, '/:id', 'delete');

  test('deletes the template', async () => {
    const t = makeTemplate();
    EmailTemplate.findById.mockResolvedValue(t);
    const res = mockRes();
    await del({ shopDomain: SHOP, params: { id: TEMPLATE_ID } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(t.deleteOne).toHaveBeenCalled();
  });

  test('IDOR: returns 404 when template belongs to another shop', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate({ shopDomain: OTHER_SHOP }));
    const res = mockRes();
    await del({ shopDomain: SHOP, params: { id: TEMPLATE_ID } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Template not found');
  });
});

// ---- GET /:id/preview -------------------------------------------------------

describe('GET /:id/preview', () => {
  const preview = handlerFor(emailTemplatesRouter, '/:id/preview', 'get');

  test('renders HTML via buildEmailHtml', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate({ subject: 'Sub', body: 'Line 1\nLine 2' }));
    const res = mockRes();
    await preview({ shopDomain: SHOP, params: { id: TEMPLATE_ID } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.html).toBe('<html>rendered</html>');
    expect(mockBuildEmailHtml).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Sub', bodyHtml: 'Line 1<br>Line 2' })
    );
  });

  test('IDOR: returns 404 when template belongs to another shop', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate({ shopDomain: OTHER_SHOP }));
    const res = mockRes();
    await preview({ shopDomain: SHOP, params: { id: TEMPLATE_ID } }, res);
    expect(res.statusCode).toBe(404);
  });
});

// ---- POST /:id/send ---------------------------------------------------------

describe('POST /:id/send', () => {
  const send = handlerFor(emailTemplatesRouter, '/:id/send', 'post');

  test('sends email: calls buildEmailHtml + Resend with correct args', async () => {
    EmailTemplate.findById.mockResolvedValue(
      makeTemplate({ subject: 'Offer', body: 'Big sale', ctaUrl: 'https://shop.com', ctaLabel: 'Buy' })
    );
    Profile.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(makeProfile()),
    });
    mockSend.mockResolvedValue({ data: { id: 'email_abc' }, error: null });

    const res = mockRes();
    await send({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { profileId: 'p1' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 'email_abc' });
    expect(mockBuildEmailHtml).toHaveBeenCalledWith(
      expect.objectContaining({ subject: 'Offer', ctaUrl: 'https://shop.com' })
    );
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@example.com',
        subject: 'Offer',
        from: 'notifications@shopireachboost.com',
        html: '<html>rendered</html>',
        headers: expect.objectContaining({ 'List-Unsubscribe': expect.any(String) }),
      })
    );
  });

  test('400 when neither email nor profileId is present', async () => {
    const res = mockRes();
    await send({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('email or profileId is required');
  });

  test('email path: happy path — looks up profile by email, sends', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate({ subject: 'Sale' }));
    Profile.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(makeProfile()),
    });
    mockSend.mockResolvedValue({ data: { id: 'email_xyz' }, error: null });

    const res = mockRes();
    await send({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { email: 'Customer@Example.com' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 'email_xyz' });
    // Profile lookup uses $or with case-insensitive regex + lowercase match
    const callArg = Profile.findOne.mock.calls[0][0];
    expect(callArg.shopDomain).toBe(SHOP);
    expect(callArg.$or).toBeDefined();
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
      to: 'customer@example.com',
      headers: expect.objectContaining({ 'List-Unsubscribe': expect.any(String) }),
    }));
  });

  test('email path: 404 when no profile matches email', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate());
    Profile.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const res = mockRes();
    await send({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { email: 'nobody@example.com' } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('No customer found with that email');
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('IDOR: 404 when template belongs to another shop', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate({ shopDomain: OTHER_SHOP }));
    const res = mockRes();
    await send({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { profileId: 'p1' } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Template not found');
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('IDOR: 404 when profile belongs to another shop', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate());
    Profile.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    const res = mockRes();
    await send({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { profileId: 'p_other' } }, res);
    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Profile not found');
    expect(Profile.findOne).toHaveBeenCalledWith({ _id: 'p_other', shopDomain: SHOP });
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('400 when profile has no email', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate());
    Profile.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(makeProfile({ identifiers: { emails: [] }, channels: {} })),
    });
    const res = mockRes();
    await send({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { profileId: 'p1' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('No email address for this profile');
  });

  test('channels.email.address takes priority over identifiers.emails', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate());
    Profile.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(
        makeProfile({
          identifiers: { emails: ['old@example.com'] },
          channels: { email: { address: 'preferred@example.com' } },
        })
      ),
    });
    mockSend.mockResolvedValue({ data: { id: 'e1' }, error: null });
    const res = mockRes();
    await send({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { profileId: 'p1' } }, res);
    expect(mockSend.mock.calls[0][0].to).toBe('preferred@example.com');
  });

  test('500 when Resend returns an error', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate());
    Profile.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue(makeProfile()),
    });
    mockSend.mockResolvedValue({ data: null, error: { message: 'Rate limited' } });
    const res = mockRes();
    await send({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { profileId: 'p1' } }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Rate limited');
  });
});

// ── POST /generate ────────────────────────────────────────────────────────────

describe('POST /generate', () => {
  const generate = handlerFor(emailTemplatesRouter, '/generate', 'post');

  test('route ordering: /generate is registered before /:id', () => {
    const stack = emailTemplatesRouter.stack.filter(l => l.route);
    const generateIdx = stack.findIndex(l => l.route.path === '/generate');
    const idIdx = stack.findIndex(l => l.route.path === '/:id');
    expect(generateIdx).toBeGreaterThanOrEqual(0);
    expect(idIdx).toBeGreaterThanOrEqual(0);
    expect(generateIdx).toBeLessThan(idIdx);
  });

  test('happy path: returns subject+body+fallback from generateTemplateCopy', async () => {
    const res = mockRes();
    await generate({ shopDomain: SHOP, body: { type: 'festival', productTitle: 'Silk Saree' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ subject: 'AI Subject', body: 'AI body', fallback: false });
    expect(mockGenerateTemplateCopy).toHaveBeenCalledWith(
      SHOP, 'Demo Store', 'festival', 'Silk Saree', expect.anything()
    );
  });

  test('fallback:true from service is passed through unchanged', async () => {
    mockGenerateTemplateCopy.mockResolvedValue({
      subject: 'Starter sub', body: 'Starter body', fallback: true,
    });
    const res = mockRes();
    await generate({ shopDomain: SHOP, body: { type: 'normal' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.fallback).toBe(true);
  });

  test('400 when type is missing', async () => {
    const res = mockRes();
    await generate({ shopDomain: SHOP, body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/type must be one of/);
  });

  test('400 when type is invalid', async () => {
    const res = mockRes();
    await generate({ shopDomain: SHOP, body: { type: 'campaign' } }, res);
    expect(res.statusCode).toBe(400);
  });

  test('productTitle is optional — omitting it calls service with null', async () => {
    const res = mockRes();
    await generate({ shopDomain: SHOP, body: { type: 'normal' } }, res);
    expect(res.statusCode).toBe(200);
    expect(mockGenerateTemplateCopy).toHaveBeenCalledWith(
      SHOP, 'Demo Store', 'normal', null, expect.anything()
    );
  });
});

// ── GET /count ────────────────────────────────────────────────────────────────

describe('GET /count', () => {
  const Profile = require('../models/Profile');
  const count = handlerFor(emailTemplatesRouter, '/count', 'get');

  test('route ordering: /count is registered before /:id', () => {
    const stack = emailTemplatesRouter.stack.filter(l => l.route);
    const countIdx = stack.findIndex(l => l.route.path === '/count');
    const idIdx = stack.findIndex(l => l.route.path === '/:id');
    expect(countIdx).toBeGreaterThanOrEqual(0);
    expect(idIdx).toBeGreaterThanOrEqual(0);
    expect(countIdx).toBeLessThan(idIdx);
  });

  test('happy path: returns count for the authenticated shop', async () => {
    Profile.countDocuments.mockResolvedValue(12);
    const res = mockRes();
    await count({ shopDomain: SHOP, query: { segment: 'email_captured' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ count: 12 });
    expect(Profile.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ shopDomain: SHOP })
    );
  });

  test('defaults segment to "everyone" when not provided', async () => {
    Profile.countDocuments.mockResolvedValue(5);
    const res = mockRes();
    await count({ shopDomain: SHOP, query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.count).toBe(5);
  });

  test('400 for invalid segment', async () => {
    const res = mockRes();
    await count({ shopDomain: SHOP, query: { segment: 'push_subscribed' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/segment must be one of/);
    expect(Profile.countDocuments).not.toHaveBeenCalled();
  });
});

// ── POST /:id/broadcast ───────────────────────────────────────────────────────

describe('POST /:id/broadcast', () => {
  const Profile = require('../models/Profile');
  const broadcast = handlerFor(emailTemplatesRouter, '/:id/broadcast', 'post');

  function makeProfileLean(email = 'customer@example.com') {
    return {
      _id: 'prof1',
      identifiers: { emails: [email], customerId: null },
      channels: {},
    };
  }

  beforeEach(() => {
    mockLogBroadcastSend.mockResolvedValue(undefined);
    mockSend.mockResolvedValue({ data: { id: 'em1' }, error: null });
  });

  test('happy path: sends to all recipients, returns sent/failed/total', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate({ subject: 'Sale', body: 'Buy now' }));
    Profile.countDocuments.mockResolvedValue(2);
    Profile.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          makeProfileLean('a@ex.com'),
          makeProfileLean('b@ex.com'),
        ]),
      }),
    });

    const res = mockRes();
    await broadcast({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { segment: 'everyone' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ sent: 2, failed: 0, total: 2 });
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'notifications@shopireachboost.com',
        subject: 'Sale',
        headers: expect.objectContaining({ 'List-Unsubscribe': expect.any(String) }),
      })
    );
  });

  test('400 when segment has 0 matches', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate());
    Profile.countDocuments.mockResolvedValue(0);

    const res = mockRes();
    await broadcast({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { segment: 'has_cart' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/No customers match/);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('400 when segment exceeds BROADCAST_CAP (> 90)', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate());
    Profile.countDocuments.mockResolvedValue(150);

    const res = mockRes();
    await broadcast({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { segment: 'everyone' } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/150 recipients/);
    expect(res.body.recipientCount).toBe(150);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('one send failure does not abort — tallied in failed count', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate());
    Profile.countDocuments.mockResolvedValue(2);
    Profile.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          makeProfileLean('ok@ex.com'),
          makeProfileLean('fail@ex.com'),
        ]),
      }),
    });
    // First send succeeds, second fails
    mockSend
      .mockResolvedValueOnce({ data: { id: 'em1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Rate limited' } });

    const res = mockRes();
    await broadcast({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { segment: 'everyone' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.sent).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test('per-recipient logging: logBroadcastSend called with channel=email and signalType=email_broadcast', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate({ subject: 'Hi', body: 'Body' }));
    Profile.countDocuments.mockResolvedValue(1);
    Profile.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([makeProfileLean('log@ex.com')]),
      }),
    });

    const res = mockRes();
    await broadcast({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { segment: 'everyone' } }, res);

    expect(mockLogBroadcastSend).toHaveBeenCalledTimes(1);
    expect(mockLogBroadcastSend).toHaveBeenCalledWith(
      expect.objectContaining({
        shopDomain: SHOP,
        channel: 'email',
        signalType: 'email_broadcast',
        title: 'Hi',
        recipients: expect.arrayContaining([
          expect.objectContaining({ token: 'log@ex.com', success: true }),
        ]),
      })
    );
  });

  test('IDOR: 404 when template belongs to another shop', async () => {
    EmailTemplate.findById.mockResolvedValue(makeTemplate({ shopDomain: OTHER_SHOP }));

    const res = mockRes();
    await broadcast({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { segment: 'everyone' } }, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('Template not found');
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('400 for invalid segment', async () => {
    const res = mockRes();
    await broadcast({ shopDomain: SHOP, params: { id: TEMPLATE_ID }, body: { segment: 'bad_segment' } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/segment must be one of/);
  });
});

// ── POST /seed ────────────────────────────────────────────────────────────────

describe('POST /seed', () => {
  const EmailTemplate = require('../models/EmailTemplate');
  const seed = handlerFor(emailTemplatesRouter, '/seed', 'post');

  function seedDoc(type, name) {
    return { _id: `s_${type}`, shopDomain: SHOP, type, name, subject: `Sub ${type}`, body: `Body ${type}`, imageUrl: null, ctaLabel: null, ctaUrl: null };
  }

  beforeEach(() => {
    EmailTemplate.insertMany.mockResolvedValue([
      seedDoc('special_offer', 'Starter: Special offer'),
      seedDoc('festival', 'Starter: Navratri'),
      seedDoc('normal', 'Starter: Welcome message'),
    ]);
  });

  test('route ordering: /seed is registered before /:id', () => {
    const stack = emailTemplatesRouter.stack.filter(l => l.route);
    const seedIdx = stack.findIndex(l => l.route.path === '/seed');
    const idIdx = stack.findIndex(l => l.route.path === '/:id');
    expect(seedIdx).toBeGreaterThanOrEqual(0);
    expect(idIdx).toBeGreaterThanOrEqual(0);
    expect(seedIdx).toBeLessThan(idIdx);
  });

  test('happy path: creates 3 templates (one per type) and returns seeded:true', async () => {
    EmailTemplate.countDocuments.mockResolvedValue(0);
    const res = mockRes();
    await seed({ shopDomain: SHOP }, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.seeded).toBe(true);
    expect(res.body.templates).toHaveLength(3);
    expect(EmailTemplate.insertMany).toHaveBeenCalledTimes(1);
    const docs = EmailTemplate.insertMany.mock.calls[0][0];
    expect(docs).toHaveLength(3);
    expect(docs.find(d => d.type === 'special_offer')).toBeDefined();
    expect(docs.find(d => d.type === 'festival')).toBeDefined();
    expect(docs.find(d => d.type === 'normal')).toBeDefined();
    expect(docs.every(d => d.shopDomain === SHOP)).toBe(true);
  });

  test('idempotent: count > 0 returns existing templates, seeded:false, no LLM calls', async () => {
    EmailTemplate.countDocuments.mockResolvedValue(2);
    const existing = [makeTemplate({ name: 'Old A' }), makeTemplate({ name: 'Old B' })];
    EmailTemplate.find.mockReturnValue({ sort: jest.fn().mockResolvedValue(existing) });

    const res = mockRes();
    await seed({ shopDomain: SHOP }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.seeded).toBe(false);
    expect(res.body.templates).toHaveLength(2);
    expect(mockGenerateTemplateCopy).not.toHaveBeenCalled();
    expect(EmailTemplate.insertMany).not.toHaveBeenCalled();
  });

  test('festival type passes nextFestivalName (non-null string) as productTitle; others pass null', async () => {
    EmailTemplate.countDocuments.mockResolvedValue(0);
    const res = mockRes();
    await seed({ shopDomain: SHOP }, res);

    const calls = mockGenerateTemplateCopy.mock.calls;
    // Promise.all order: special_offer, festival, normal
    const specialCall = calls.find(c => c[2] === 'special_offer');
    const festivalCall = calls.find(c => c[2] === 'festival');
    const normalCall  = calls.find(c => c[2] === 'normal');

    expect(specialCall[3]).toBeNull();
    expect(typeof festivalCall[3]).toBe('string');
    expect(festivalCall[3].length).toBeGreaterThan(0);
    expect(normalCall[3]).toBeNull();
  });

  test('fallback copy (fallback:true) still creates all 3 templates', async () => {
    EmailTemplate.countDocuments.mockResolvedValue(0);
    mockGenerateTemplateCopy.mockResolvedValue({ subject: 'A note from our store', body: 'Starter body.', fallback: true });

    const res = mockRes();
    await seed({ shopDomain: SHOP }, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.seeded).toBe(true);
    expect(EmailTemplate.insertMany).toHaveBeenCalledTimes(1);
    const docs = EmailTemplate.insertMany.mock.calls[0][0];
    expect(docs[0].subject).toBe('A note from our store');
    expect(docs[0].body).toBe('Starter body.');
  });
});
