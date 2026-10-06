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
}));

jest.mock('../models/Profile', () => ({
  findOne: jest.fn(),
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

const mockBuildEmailHtml = jest.fn().mockReturnValue('<html>rendered</html>');
jest.mock('../utils/email', () => ({
  FROM: 'notifications@shopireachboost.com',
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
    select: jest.fn().mockResolvedValue({ shopName: 'Demo Store', logoUrl: null, primaryColor: null }),
  });
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
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: 'customer@example.com' }));
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
