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

const Profile = require('../models/Profile');
const Signal = require('../models/Signal');
const SignalConfig = require('../models/SignalConfig');
const ScheduledJob = require('../models/ScheduledJob');
const Store = require('../models/Store');

const { runBrainForProfile } = require('../services/brain');

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

test('11. runAt lands outside quiet hours', async () => {
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
