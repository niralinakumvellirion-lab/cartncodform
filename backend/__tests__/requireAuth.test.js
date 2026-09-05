process.env.BACKEND_JWT_SECRET = 'test_backend_secret';

const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/requireOwner');

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

describe('requireAuth', () => {
  test('calls next() and sets req.userEmail for a valid token', () => {
    const token = jwt.sign({ email: 'Owner@Example.com' }, process.env.BACKEND_JWT_SECRET);
    const req = mockReq(`Bearer ${token}`);
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.userEmail).toBe('owner@example.com'); // lowercased
  });

  test('returns 401 when Authorization header is missing', () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 for a malformed/invalid token', () => {
    const req = mockReq('Bearer not-a-real-jwt');
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 401 for a token signed with the wrong secret', () => {
    const token = jwt.sign({ email: 'owner@example.com' }, 'wrong_secret');
    const req = mockReq(`Bearer ${token}`);
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 401 when token has no email claim', () => {
    const token = jwt.sign({ notEmail: 'foo' }, process.env.BACKEND_JWT_SECRET);
    const req = mockReq(`Bearer ${token}`);
    const res = mockRes();
    const next = jest.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
