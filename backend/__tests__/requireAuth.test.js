process.env.SHOPIFY_API_SECRET = 'test-secret';
process.env.SHOPIFY_API_KEY = 'test-api-key';

const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/requireOwner');

const SECRET = 'test-secret';
const API_KEY = 'test-api-key';

// A payload shaped like a real Shopify App Bridge session token.
function validPayload(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://test-shop.myshopify.com/admin',
    dest: 'https://test-shop.myshopify.com',
    aud: API_KEY,
    exp: now + 300,
    nbf: now - 10,
    ...overrides,
  };
}

function signToken(payload, secret = SECRET) {
  return jwt.sign(payload, secret, { algorithm: 'HS256' });
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockReq(authHeader) {
  return {
    get: (name) => (name === 'Authorization' ? authHeader : undefined),
  };
}

describe('requireAuth (Shopify session token)', () => {
  beforeEach(() => {
    process.env.SHOPIFY_API_SECRET = 'test-secret';
    process.env.SHOPIFY_API_KEY = 'test-api-key';
  });

  test('returns 401 when the Authorization header is missing', () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Missing Authorization header' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 for a token signed with the wrong secret', () => {
    const token = signToken(validPayload(), 'wrong-secret');
    const req = mockReq(`Bearer ${token}`);
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid session token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() and sets req.shopDomain (not req.userEmail) for a valid token', () => {
    const token = signToken(validPayload());
    const req = mockReq(`Bearer ${token}`);
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.shopDomain).toBe('test-shop.myshopify.com');
    expect(req.userEmail).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 401 for an expired token', () => {
    const now = Math.floor(Date.now() / 1000);
    const token = signToken(validPayload({ exp: now - 60 }));
    const req = mockReq(`Bearer ${token}`);
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session token expired' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 for a token with the wrong aud claim', () => {
    const token = signToken(validPayload({ aud: 'some-other-app' }));
    const req = mockReq(`Bearer ${token}`);
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Session token: aud does not match this app' });
    expect(next).not.toHaveBeenCalled();
  });
});
