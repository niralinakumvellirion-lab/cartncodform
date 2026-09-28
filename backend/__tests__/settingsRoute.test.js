/**
 * PATCH /api/profiles/:shop/settings — quietHours/timezone range validation,
 * and the fire-and-forget weights recompute on a real timezone change.
 * Same direct-handler pattern as popupConfigRoute.test.js.
 */

jest.mock('../models/Profile', () => ({}));
jest.mock('../models/Signal', () => ({}));
jest.mock('../models/SignalConfig', () => ({}));
jest.mock('../models/StorefrontEvent', () => ({}));
jest.mock('../models/ScheduledJob', () => ({}));
jest.mock('../models/ShopWeights', () => ({}));
jest.mock('../models/Store', () => ({ findOneAndUpdate: jest.fn(), findOne: jest.fn() }));
jest.mock('../middleware/requireOwner', () => ({
  requireAuth: jest.fn(),
  requireStoreOwner: jest.fn(),
}));
jest.mock('../services/analyticsService', () => ({}));
jest.mock('../services/aiService', () => ({}));
jest.mock('../services/weightsService', () => ({ computeWeights: jest.fn() }));

const Store = require('../models/Store');
const { computeWeights } = require('../services/weightsService');
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

// `before` is the pre-update Store doc findOneAndUpdate hands back
// (default new:false) — what the shop's timezone was before this save.
async function run(body, before = { shopDomain: SHOP, timezone: 'Asia/Kolkata' }) {
  Store.findOneAndUpdate.mockResolvedValue(before);
  const res = mockRes();
  await patch({ params: { shopDomain: SHOP }, body }, res);
  // Flush the fire-and-forget .then()/.catch() microtasks queued off the
  // computeWeights() promise before the test inspects mock call state.
  await new Promise((r) => setImmediate(r));
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  computeWeights.mockResolvedValue({});
});

test('an out-of-range quietHours.start is rejected with 400, naming the field and range', async () => {
  const res = await run({ quietHours: { start: 99, end: 8 } });
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/quietHours\.start/);
  expect(res.body.error).toMatch(/0 and 23/);
  expect(Store.findOneAndUpdate).not.toHaveBeenCalled();
});

test('a negative quietHours.end is rejected with 400', async () => {
  const res = await run({ quietHours: { start: 22, end: -1 } });
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/quietHours\.end/);
  expect(Store.findOneAndUpdate).not.toHaveBeenCalled();
});

test('a non-integer quietHours value is rejected with 400', async () => {
  const res = await run({ quietHours: { start: 'late', end: 8 } });
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/quietHours\.start/);
});

test('a valid quietHours object (including the boundary values 0 and 23) is saved', async () => {
  const res = await run({ quietHours: { start: 0, end: 23 } });
  expect(res.statusCode).toBe(200);
  expect(Store.findOneAndUpdate).toHaveBeenCalledWith(
    { shopDomain: SHOP },
    { $set: { 'quietHours.start': 0, 'quietHours.end': 23 } }
  );
});

test('a missing quietHours object is valid (existing default applies)', async () => {
  const res = await run({ voice: { tone: 'warm' } });
  expect(res.statusCode).toBe(200);
  expect(Store.findOneAndUpdate).toHaveBeenCalled();
});

test('a quietHours object with only one side set is valid', async () => {
  const res = await run({ quietHours: { start: 21 } });
  expect(res.statusCode).toBe(200);
  expect(Store.findOneAndUpdate).toHaveBeenCalledWith(
    { shopDomain: SHOP },
    { $set: { 'quietHours.start': 21 } }
  );
});

test('an unrecognised timezone string is rejected with 400', async () => {
  const res = await run({ timezone: 'Not/A_Zone' });
  expect(res.statusCode).toBe(400);
  expect(res.body.error).toMatch(/timezone/);
  expect(res.body.error).toMatch(/Not\/A_Zone/);
  expect(Store.findOneAndUpdate).not.toHaveBeenCalled();
});

test('a valid IANA timezone is saved', async () => {
  const res = await run({ timezone: 'America/New_York' }, { shopDomain: SHOP, timezone: 'America/New_York' });
  expect(res.statusCode).toBe(200);
  expect(Store.findOneAndUpdate).toHaveBeenCalledWith(
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
  expect(Store.findOneAndUpdate).toHaveBeenCalledWith(
    { shopDomain: SHOP },
    { $set: { 'voice.tone': 'warm' } }
  );
});

describe('weights recompute on a real timezone change', () => {
  test('a timezone change triggers computeWeights for that shop', async () => {
    await run({ timezone: 'America/New_York' }, { shopDomain: SHOP, timezone: 'Asia/Kolkata' });
    expect(computeWeights).toHaveBeenCalledTimes(1);
    expect(computeWeights).toHaveBeenCalledWith(SHOP);
  });

  test('saving the SAME timezone does not trigger a recompute', async () => {
    await run({ timezone: 'Asia/Kolkata' }, { shopDomain: SHOP, timezone: 'Asia/Kolkata' });
    expect(computeWeights).not.toHaveBeenCalled();
  });

  test('a save with no timezone field does not trigger a recompute', async () => {
    await run({ voice: { tone: 'warm' } }, { shopDomain: SHOP, timezone: 'Asia/Kolkata' });
    expect(computeWeights).not.toHaveBeenCalled();
  });

  test('a shop with no timezone previously set still triggers on its first real value', async () => {
    await run({ timezone: 'Asia/Kolkata' }, { shopDomain: SHOP, timezone: undefined });
    expect(computeWeights).toHaveBeenCalledWith(SHOP);
  });

  test('an invalid timezone (rejected with 400) never triggers a recompute', async () => {
    await run({ timezone: 'Not/A_Zone' });
    expect(computeWeights).not.toHaveBeenCalled();
  });

  test('the save response does not wait on computeWeights and still succeeds if it rejects', async () => {
    computeWeights.mockRejectedValue(new Error('boom'));
    const res = await run({ timezone: 'America/New_York' }, { shopDomain: SHOP, timezone: 'Asia/Kolkata' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ updated: true });
  });
});
