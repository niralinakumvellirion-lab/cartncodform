/**
 * Unit tests for backend/services/brain.js -> runBrainForProfile.
 *
 * All five models are auto-mocked. A beforeEach sets up a "happy path"
 * (one cart_abandon signal, push+email both available, no fatigue, no
 * existing job) and each test perturbs one input.
 */

jest.mock('../models/Profile');
jest.mock('../models/Signal');
jest.mock('../models/SignalConfig');
jest.mock('../models/ScheduledJob');
jest.mock('../models/Store');
jest.mock('../models/ShopWeights');
jest.mock('../models/AbandonedCustomer');

const Profile = require('../models/Profile');
const Signal = require('../models/Signal');
const SignalConfig = require('../models/SignalConfig');
const ScheduledJob = require('../models/ScheduledJob');
const Store = require('../models/Store');
const ShopWeights = require('../models/ShopWeights');
const AbandonedCustomer = require('../models/AbandonedCustomer');

const { runBrainForProfile, computeRunAt } = require('../services/brain');

const SHOP = 'demo.myshopify.com';
const HOUR = 60 * 60 * 1000;
const ago = (ms) => new Date(Date.now() - ms);

function baseProfile(over = {}) {
  return {
    _id: 'p1',
    shopDomain: SHOP,
    suppressed: false,
    identifiers: { cartTokens: ['c1'] },
    channels: {
      push: { subscribed: true },
      email: { address: 'buyer@example.com' },
    },
    activeHours: [],
    messages: [],
    ...over,
  };
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
  jest.clearAllMocks();
  Profile.findById.mockResolvedValue(baseProfile());
  Store.findOne.mockResolvedValue({
    caps: { perDay: 2, perWeek: 5 },
    quietHours: { start: 22, end: 8 },
    timezone: 'Asia/Kolkata',
  });
  Signal.find.mockResolvedValue([{ type: 'cart_abandon', strength: 0.9, productId: '42' }]);
  SignalConfig.findOne.mockResolvedValue(null);
  ScheduledJob.findOne.mockResolvedValue(null);
  ScheduledJob.create.mockResolvedValue({ _id: 'job1' });
  ShopWeights.findOne.mockResolvedValue(null); // Phase H — no learned weights -> neutral
  // Default: no abandoned-cart row on file -> imageUrl stays ''.
  AbandonedCustomer.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
  });
});

test('1. returns null when the profile is not found', async () => {
  Profile.findById.mockResolvedValue(null);
  expect(await runBrainForProfile('p1', SHOP)).toBeNull();
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('2. returns null when the profile is suppressed', async () => {
  Profile.findById.mockResolvedValue(baseProfile({ suppressed: true }));
  expect(await runBrainForProfile('p1', SHOP)).toBeNull();
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('3. returns null when there are no active signals', async () => {
  Signal.find.mockResolvedValue([]);
  expect(await runBrainForProfile('p1', SHOP)).toBeNull();
});

test('4. returns null when the daily cap is reached', async () => {
  Profile.findById.mockResolvedValue(
    baseProfile({ messages: [{ sentAt: ago(1 * HOUR) }, { sentAt: ago(2 * HOUR) }] })
  );
  expect(await runBrainForProfile('p1', SHOP)).toBeNull();
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('4b. returns null when the weekly cap is reached', async () => {
  Store.findOne.mockResolvedValue({
    caps: { perDay: 10, perWeek: 3 },
    quietHours: { start: 22, end: 8 },
    timezone: 'Asia/Kolkata',
  });
  Profile.findById.mockResolvedValue(
    baseProfile({
      messages: [
        { sentAt: ago(2 * 24 * HOUR) },
        { sentAt: ago(3 * 24 * HOUR) },
        { sentAt: ago(4 * 24 * HOUR) },
      ],
    })
  );
  expect(await runBrainForProfile('p1', SHOP)).toBeNull();
});

test('5. skips a disabled signal and picks the next strongest', async () => {
  Signal.find.mockResolvedValue([
    { type: 'cart_abandon', strength: 0.9, productId: '42' },
    { type: 'browse_abandon', strength: 0.5, productId: '7' },
  ]);
  SignalConfig.findOne.mockImplementation(({ signalType }) =>
    Promise.resolve(signalType === 'cart_abandon' ? { enabled: false } : null)
  );

  const r = await runBrainForProfile('p1', SHOP);
  expect(r.signalType).toBe('browse_abandon');
  expect(ScheduledJob.create).toHaveBeenCalledWith(
    expect.objectContaining({ signalType: 'browse_abandon' })
  );
});

test('6. skips a signal messaged < 6h ago and picks the next', async () => {
  Signal.find.mockResolvedValue([
    { type: 'cart_abandon', strength: 0.9, productId: '42' },
    { type: 'browse_abandon', strength: 0.5, productId: '7' },
  ]);
  Profile.findById.mockResolvedValue(
    baseProfile({ messages: [{ type: 'cart_abandon', sentAt: ago(2 * HOUR) }] })
  );

  const r = await runBrainForProfile('p1', SHOP);
  expect(r.signalType).toBe('browse_abandon');
});

test('7. selects push when the profile has push and the signal prefers push', async () => {
  const r = await runBrainForProfile('p1', SHOP);
  expect(r.channel).toBe('push');
  expect(ScheduledJob.create).toHaveBeenCalledWith(
    expect.objectContaining({ channel: 'push' })
  );
});

test('8. falls back to email when push is unavailable but email exists', async () => {
  Profile.findById.mockResolvedValue(
    baseProfile({
      channels: { push: { subscribed: false }, email: { address: 'x@y.com' } },
    })
  );
  const r = await runBrainForProfile('p1', SHOP);
  expect(r.channel).toBe('email');
});

test('9. returns null when neither channel is available', async () => {
  Profile.findById.mockResolvedValue(
    baseProfile({ channels: { push: { subscribed: false }, email: {} } })
  );
  expect(await runBrainForProfile('p1', SHOP)).toBeNull();
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

test('10. does not create a duplicate pending job for the same profile+signal', async () => {
  ScheduledJob.findOne.mockResolvedValue({ _id: 'already-pending' });
  expect(await runBrainForProfile('p1', SHOP)).toBeNull();
  expect(ScheduledJob.create).not.toHaveBeenCalled();
});

// Clock pinned (only Date is faked; promises/timers stay real). Both pinned
// instants sit at UTC minute :30 on purpose, and one is INSIDE the 0..5 quiet
// window while the other is just before it (so the next slot wraps past
// midnight) — each forces the "skip quiet hours" branch instead of the
// trivial "next hour is fine" one. :30 also keeps the assertion independent of
// the machine's timezone: brain.js zeroes minutes with the LOCAL setMinutes(),
// and at :00/:15/:45 UTC a half-hour-offset machine (e.g. IST) would round the
// result back into the previous UTC hour (05:30) — the old flake.
describe('11. runAt lands outside quiet hours', () => {
  const ALL_REAL_BUT_DATE = [
    'nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
    'setTimeout', 'clearTimeout', 'queueMicrotask', 'performance', 'hrtime',
    'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  ];
  afterEach(() => jest.useRealTimers());

  test.each([
    ['inside the quiet window (02:30 UTC)', '2026-03-10T02:30:00.000Z'],
    ['just before it, wrapping midnight (23:30 UTC)', '2026-03-10T23:30:00.000Z'],
  ])('%s', async (_label, iso) => {
    jest.useFakeTimers({ now: new Date(iso), doNotFake: ALL_REAL_BUT_DATE });
    Store.findOne.mockResolvedValue({
      caps: { perDay: 2, perWeek: 5 },
      quietHours: { start: 0, end: 6 },
      timezone: 'UTC',
    });
    const r = await runBrainForProfile('p1', SHOP);
    const h = r.runAt.getUTCHours();
    expect(h).toBeGreaterThanOrEqual(6); // 0..5 is quiet
    expect(r.runAt.getTime()).toBeGreaterThan(Date.now());
  });
});

test('12. stores a human-readable reason on the ScheduledJob', async () => {
  const r = await runBrainForProfile('p1', SHOP);
  expect(r.reason).toMatch(/^cart_abandon strength=0\.90$/);
  expect(ScheduledJob.create).toHaveBeenCalledWith(
    expect.objectContaining({ reason: expect.stringMatching(/strength=/) })
  );
});

test('13. SignalConfig.channelOverride wins over the signal-type default', async () => {
  SignalConfig.findOne.mockResolvedValue({ enabled: true, channelOverride: 'email' });
  const r = await runBrainForProfile('p1', SHOP);
  expect(r.channel).toBe('email');
});

test('14. cart_abandon fetches the abandoned cart\'s product image onto the job payload', async () => {
  AbandonedCustomer.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({ productImageUrl: 'https://cdn.example/shirt.jpg' }),
    }),
  });
  await runBrainForProfile('p1', SHOP);
  expect(AbandonedCustomer.findOne).toHaveBeenCalledWith({ sessionId: 'c1' });
  expect(ScheduledJob.create).toHaveBeenCalledWith(
    expect.objectContaining({
      cartToken: 'c1',
      payload: expect.objectContaining({ imageUrl: 'https://cdn.example/shirt.jpg' }),
    })
  );
});

test('15. imageUrl stays blank when the abandoned cart has no productImageUrl', async () => {
  await runBrainForProfile('p1', SHOP);
  expect(ScheduledJob.create).toHaveBeenCalledWith(
    expect.objectContaining({ payload: expect.objectContaining({ imageUrl: '' }) })
  );
});

test('16. imageUrl stays blank (and does not throw) when the image lookup errors', async () => {
  AbandonedCustomer.findOne.mockImplementation(() => {
    throw new Error('db unavailable');
  });
  const r = await runBrainForProfile('p1', SHOP);
  expect(r).not.toBeNull();
  expect(ScheduledJob.create).toHaveBeenCalledWith(
    expect.objectContaining({ payload: expect.objectContaining({ imageUrl: '' }) })
  );
});

test('17. non-cart/checkout-abandon signals never query AbandonedCustomer for an image', async () => {
  Signal.find.mockResolvedValue([{ type: 'browse_abandon', strength: 0.9, productId: '42' }]);
  await runBrainForProfile('p1', SHOP);
  expect(AbandonedCustomer.findOne).not.toHaveBeenCalled();
  expect(ScheduledJob.create).toHaveBeenCalledWith(
    expect.objectContaining({ payload: expect.objectContaining({ imageUrl: '' }) })
  );
});


// --- computeRunAt: zone-aware send time ------------------------------------
// A send scheduled for H:00 must fire at H:00 ON THE STORE'S WALL CLOCK,
// including half-hour offsets and across DST, whatever the server's own zone.
describe('computeRunAt is store-timezone aware', () => {
  const DATE_ONLY = [
    'nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
    'setTimeout', 'clearTimeout', 'queueMicrotask', 'performance', 'hrtime',
    'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  ];
  const pin = (iso) => jest.useFakeTimers({ now: new Date(iso), doNotFake: DATE_ONLY });
  afterEach(() => jest.useRealTimers());
  // A profile whose own history says "best hour = h" (needs >= 3 samples).
  const prefers = (h) => ({ activeHours: [h, h, h] });
  const run = (h, tz) => computeRunAt(prefers(h), 22, 8, tz, null).toISOString();

  test('UTC', () => {
    pin('2026-03-10T06:10:00.000Z');
    expect(run(11, 'UTC')).toBe('2026-03-10T11:00:00.000Z');
  });

  test('Asia/Kolkata (+05:30): 13:00 IST is 07:30 UTC, not 07:00 or 08:00', () => {
    pin('2026-03-10T06:10:00.000Z'); // 11:40 IST
    expect(run(13, 'Asia/Kolkata')).toBe('2026-03-10T07:30:00.000Z');
  });

  test('Asia/Kolkata: an hour already passed today rolls to tomorrow, still on the hour', () => {
    pin('2026-03-10T06:10:00.000Z'); // 11:40 IST, so 11:00 has passed
    expect(run(11, 'Asia/Kolkata')).toBe('2026-03-11T05:30:00.000Z');
  });

  test('Asia/Kathmandu (+05:45): 13:00 NPT is 07:15 UTC', () => {
    pin('2026-03-10T06:10:00.000Z'); // 11:55 NPT
    expect(run(13, 'Asia/Kathmandu')).toBe('2026-03-10T07:15:00.000Z');
  });

  test('America/New_York, no DST change: 15:00 EDT is 19:00 UTC', () => {
    pin('2026-06-10T14:20:00.000Z'); // 10:20 EDT
    expect(run(15, 'America/New_York')).toBe('2026-06-10T19:00:00.000Z');
  });

  test('America/New_York, spring-forward day: 09:00 is EDT (13:00 UTC), not now+9h', () => {
    pin('2026-03-08T05:30:00.000Z'); // 00:30 EST; clocks jump at 07:00 UTC
    expect(run(9, 'America/New_York')).toBe('2026-03-08T13:00:00.000Z');
  });

  test('America/New_York, fall-back day: 09:00 is EST (14:00 UTC), not now+9h', () => {
    pin('2026-11-01T04:30:00.000Z'); // 00:30 EDT; clocks fall back at 06:00 UTC
    expect(run(9, 'America/New_York')).toBe('2026-11-01T14:00:00.000Z');
  });

  test('an unknown timezone string falls back to the Kolkata default, not the server zone', () => {
    pin('2026-03-10T06:10:00.000Z');
    expect(run(13, 'Not/A_Zone')).toBe('2026-03-10T07:30:00.000Z');
  });

  test('a store with no timezone set is scheduled on the default (Kolkata) wall clock', async () => {
    pin('2026-03-10T02:30:00.000Z'); // 08:00 IST: not quiet, so the next slot is 09:00 IST
    Store.findOne.mockResolvedValue({ caps: { perDay: 2, perWeek: 5 } }); // no timezone, no quietHours
    const r = await runBrainForProfile('p1', SHOP);
    expect(r.runAt.toISOString()).toBe('2026-03-10T03:30:00.000Z');
  });
});
