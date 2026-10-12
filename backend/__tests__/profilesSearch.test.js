/**
 * Focused test: profiles route search includes channels.email.address in the $or
 * (FIX 3 from audits/customer-email-permanent-fix-after.txt).
 *
 * Uses the handlerFor pattern from popupConfigRoute.test.js: extract the route
 * handler, call it directly with a mock req/res, and inspect what Profile.find
 * was called with.
 */

jest.mock('../models/Profile', () => ({
  find: jest.fn(),
}));
jest.mock('../models/Signal', () => ({
  find: jest.fn(),
}));
jest.mock('../models/Store', () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock('../models/SignalConfig', () => ({}));
jest.mock('../models/StorefrontEvent', () => ({}));
jest.mock('../models/ScheduledJob', () => ({}));
jest.mock('../models/ShopWeights', () => ({}));
jest.mock('../services/analyticsService', () => ({}));
jest.mock('../services/aiService', () => ({}));
jest.mock('../middleware/requireOwner', () => ({
  requireAuth: jest.fn(),
  requireStoreOwner: jest.fn(),
}));

const Profile = require('../models/Profile');
const profilesRouter = require('../routes/profiles');

const SHOP = 'demo.myshopify.com';

function handlerFor(router, path, method) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function mockRes() {
  const res = { body: null, statusCode: 200 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

const listHandler = handlerFor(profilesRouter, '/:shopDomain/profiles', 'get');

beforeEach(() => {
  jest.clearAllMocks();
  Profile.find.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
    countDocuments: jest.fn().mockResolvedValue(0),
  });
  // countDocuments on the model itself (called separately for total)
  Profile.find.mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue([]),
  });
  Profile.countDocuments = jest.fn().mockResolvedValue(0);
});

test('s1. search includes channels.email.address in the $or query', async () => {
  const req = {
    params: { shopDomain: SHOP },
    query: { search: 'test@example.com' },
  };
  const res = mockRes();

  await listHandler(req, res);

  expect(Profile.find).toHaveBeenCalled();
  const query = Profile.find.mock.calls[0][0];
  expect(query.$or).toBeDefined();

  const fields = query.$or.map((c) => Object.keys(c)[0]);
  expect(fields).toContain('channels.email.address');
  expect(fields).toContain('identifiers.emails');
  expect(fields).toContain('identifiers.phones');
});

test('s2. search without term does not include $or', async () => {
  const req = {
    params: { shopDomain: SHOP },
    query: {},
  };
  const res = mockRes();

  await listHandler(req, res);

  const query = Profile.find.mock.calls[0][0];
  expect(query.$or).toBeUndefined();
});
