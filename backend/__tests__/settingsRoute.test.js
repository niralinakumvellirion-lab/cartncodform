/**
 * PATCH /api/profiles/:shop/settings — quietHours range validation.
 * Same direct-handler pattern as popupConfigRoute.test.js.
 */

jest.mock('../models/Profile', () => ({}));
jest.mock('../models/Signal', () => ({}));
jest.mock('../models/SignalConfig', () => ({}));
jest.mock('../models/StorefrontEvent', () => ({}));
jest.mock('../models/ScheduledJob', () => ({}));
jest.mock('../models/ShopWeights', () => ({}));
jest.mock('../models/Store', () => ({ updateOne: jest.fn(), findOne: jest.fn() }));
jest.mock('../middleware/requireOwner', () => ({
  requireAuth: jest.fn(),
  requireStoreOwner: jest.fn(),
}));
jest.mock('../services/analyticsService', () => ({}));
jest.mock('../services/aiService', () => ({}));

const Store = require('../models/Store');
const profilesRouter = require('../routes/profiles');

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
const patch = handlerFor(profilesRouter, '/:shopDomain/settings', 'patch');

async function run(body) {
  const res = mockRes();
  await patch({ params: { shopDomain: SHOP }, body }, res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  Store.updateOne.mockResolvedValue({});
});

test('an out-of-range quietHours.start is rejected with 400, naming the field and range', async () => {
  const res = await run({ quietHours: { start: 99, end: 8 } });
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/quietHours\.start/);
  expect(res.body.error).toMatch(/0 and 23/);
  expect(Store.updateOne).not.toHaveBeenCalled();
});

test('a negative quietHours.end is rejected with 400', async () => {
  const res = await run({ quietHours: { start: 22, end: -1 } });
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/quietHours\.end/);
  expect(Store.updateOne).not.toHaveBeenCalled();
});

test('a non-integer quietHours value is rejected with 400', async () => {
  const res = await run({ quietHours: { start: 'late', end: 8 } });
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/quietHours\.start/);
});

test('a valid quietHours object (including the boundary values 0 and 23) is saved', async () => {
  const res = await run({ quietHours: { start: 0, end: 23 } });
  expect(res.statusCode).toBe(200);
  expect(Store.updateOne).toHaveBeenCalledWith(
    { shopDomain: SHOP },
    { $set: { 'quietHours.start': 0, 'quietHours.end': 23 } }
  );
});

test('a missing quietHours object is valid (existing default applies)', async () => {
  const res = await run({ voice: { tone: 'warm' } });
  expect(res.statusCode).toBe(200);
  expect(Store.updateOne).toHaveBeenCalled();
});

test('a quietHours object with only one side set is valid', async () => {
  const res = await run({ quietHours: { start: 21 } });
  expect(res.statusCode).toBe(200);
  expect(Store.updateOne).toHaveBeenCalledWith(
    { shopDomain: SHOP },
    { $set: { 'quietHours.start': 21 } }
  );
});

test('an unrecognised timezone string is rejected with 400', async () => {
  const res = await run({ timezone: 'Not/A_Zone' });
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/timezone/);
  expect(res.body.error).toMatch(/Not\/A_Zone/);
  expect(Store.updateOne).not.toHaveBeenCalled();
});

test('a valid IANA timezone is saved', async () => {
  const res = await run({ timezone: 'America/New_York' });
  expect(res.statusCode).toBe(200);
  expect(Store.updateOne).toHaveBeenCalledWith(
    { shopDomain: SHOP },
    { $set: { timezone: 'America/New_York' } }
  );
});

test('a half-hour-offset timezone (Asia/Kolkata) is accepted', async () => {
  const res = await run({ timezone: 'Asia/Kolkata' });
  expect(res.statusCode).toBe(200);
});

test('an empty timezone string is a no-op, not an error (existing behaviour)', async () => {
  const res = await run({ timezone: '', voice: { tone: 'warm' } });
  expect(res.statusCode).toBe(200);
  expect(Store.updateOne).toHaveBeenCalledWith(
    { shopDomain: SHOP },
    { $set: { 'voice.tone': 'warm' } }
  );
});
