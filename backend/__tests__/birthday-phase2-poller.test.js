/**
 * 3b verification — birthday poller re-checks suppression and consent at send time.
 *
 * Push path: without a cartToken, sendPushToCustomers would blast all subscribers.
 * The fix loads the profile, verifies !suppressed + push.subscribed, resolves a
 * cartToken from identifiers.cartTokens, and skips if any check fails.
 *
 * Email path: the birthday email branch now checks profile.suppressed before sending.
 */

jest.useFakeTimers();

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../config/db', () => jest.fn().mockResolvedValue(undefined));

jest.mock('../routes/auth',        () => jest.fn());
jest.mock('../routes/webhooks',    () => jest.fn());
jest.mock('../routes/stores',      () => jest.fn());
jest.mock('../routes/cod',         () => jest.fn());
jest.mock('../routes/push',        () => jest.fn());
jest.mock('../routes/proxy',       () => jest.fn());
jest.mock('../routes/events',      () => jest.fn());
jest.mock('../routes/attribution', () => jest.fn());
jest.mock('../routes/profiles',    () => jest.fn());
jest.mock('../routes/activity',    () => jest.fn());
jest.mock('../routes/queue',       () => jest.fn());
jest.mock('../routes/automation',  () => jest.fn());
// discounts: express router (callable) + named export generateDiscount
jest.mock('../routes/discounts', () => {
  const fn = jest.fn();
  fn.generateDiscount = jest.fn().mockResolvedValue({ code: 'BDAY_TEST', percentage: 15, expiryDays: 7 });
  fn.defaultConfig = jest.fn().mockReturnValue({});
  return fn;
});

jest.mock('../models/ScheduledJob');
jest.mock('../models/FestivalQueue');
jest.mock('../models/Store');
jest.mock('../models/Profile');
jest.mock('../models/AbandonedCustomer');
jest.mock('../models/CustomerPushSubscription');
jest.mock('../models/AutomationConfig');
jest.mock('../models/DiscountConfig');

jest.mock('../utils/pushNotification', () => ({
  sendPushToCustomers: jest.fn().mockResolvedValue({ success: true, sent: 1, tokensFound: 1, recipients: [] }),
  buildClickUrl: jest.fn(),
}));
jest.mock('../utils/email', () => ({
  sendAbandonedCartEmail: jest.fn(),
  sendMarketingEmail: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('../services/aiService', () => ({
  generateCopy: jest.fn().mockResolvedValue({ title: 'Happy Birthday!', body: 'A gift for you.' }),
  generateEmailCopy: jest.fn(),
}));
jest.mock('../services/pushHygiene', () => ({
  checkUnopenedThreshold: jest.fn().mockResolvedValue(undefined),
  updateDeliveredRate:    jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../services/signalEngine',   () => ({ runNightlySignals: jest.fn() }));
jest.mock('../services/brain',          () => ({ runBrainForShop: jest.fn() }));
jest.mock('../services/weightsService', () => ({ computeWeights: jest.fn() }));
jest.mock('../services/sendLogService', () => ({ logBroadcastSend: jest.fn() }));
jest.mock('../utils/timezone', () => ({
  isQuietNow:           jest.fn().mockReturnValue(false),
  zonedTimeToUtc:       jest.fn().mockReturnValue(new Date()),
  resolveTz:            jest.fn().mockReturnValue('Asia/Kolkata'),
  zonedParts:           jest.fn().mockReturnValue({ y: 2026, mo: 6, d: 15 }),
  resolveQuietWindow:   jest.fn().mockReturnValue({ start: 22, end: 8 }),
  isQuietHour:          jest.fn().mockReturnValue(false),
}));

const ScheduledJob = require('../models/ScheduledJob');
const Store        = require('../models/Store');
const Profile      = require('../models/Profile');
const { sendPushToCustomers } = require('../utils/pushNotification');
const { sendMarketingEmail }  = require('../utils/email');
const { _processScheduledJobs } = require('../server');

const SHOP    = 'bday-poller-test.myshopify.com';
const JOB_ID  = '507f1f77bcf86cd799439099';
const PROF_ID = '507f1f77bcf86cd799439088';

function makeStore(extra = {}) {
  return {
    select: () => ({ lean: () => Promise.resolve({ timezone: 'Asia/Kolkata', quietHours: { enabled: false }, suspended: false, ...extra }) }),
    voice: {},
    toObject: () => ({}),
  };
}

function birthdayPushJob(over = {}) {
  return {
    _id: JOB_ID,
    shopDomain: SHOP,
    profileId: PROF_ID,
    signalType: 'birthday',
    channel: 'push',
    cartToken: null,
    customerId: null,
    status: 'pending',
    runAt: new Date(Date.now() - 60_000),
    payload: { title: '', body: '', birthdayCode: 'BDAY_TEST' },
    ...over,
  };
}

function birthdayEmailJob(over = {}) {
  return {
    _id: JOB_ID,
    shopDomain: SHOP,
    profileId: PROF_ID,
    signalType: 'birthday',
    channel: 'email',
    cartToken: null,
    customerId: null,
    status: 'pending',
    runAt: new Date(Date.now() - 60_000),
    payload: { title: '', body: '', birthdayCode: 'BDAY_TEST', birthdayPercentage: 15 },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  Store.find.mockReturnValue({ lean: () => Promise.resolve([]) });
  Store.findOne.mockReturnValue(makeStore());
  ScheduledJob.countDocuments.mockResolvedValue(0);
  ScheduledJob.findOneAndUpdate.mockResolvedValue({ _id: JOB_ID, status: 'sent' });
  ScheduledJob.findByIdAndUpdate.mockResolvedValue({});
  Profile.findByIdAndUpdate.mockResolvedValue({});
});

afterEach(() => jest.restoreAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// Birthday push — suppression and consent re-checks
// ─────────────────────────────────────────────────────────────────────────────

describe('3b — birthday push: suppression/consent re-check at send time', () => {
  test('suppressed profile → job skipped, sendPushToCustomers NOT called', async () => {
    ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([birthdayPushJob()]) });
    Profile.findById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({
        _id: PROF_ID, suppressed: true,
        channels: { push: { subscribed: true } },
        identifiers: { cartTokens: ['tok-abc'] },
      }) }),
    });

    await _processScheduledJobs();

    expect(sendPushToCustomers).not.toHaveBeenCalled();
    const skipCall = ScheduledJob.findByIdAndUpdate.mock.calls.find(
      ([, upd]) => upd && upd.status === 'skipped'
    );
    expect(skipCall).toBeDefined();
    expect(skipCall[1].error).toBe('profile_suppressed');
  });

  test('push consent withdrawn → job skipped, sendPushToCustomers NOT called', async () => {
    ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([birthdayPushJob()]) });
    Profile.findById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({
        _id: PROF_ID, suppressed: false,
        channels: { push: { subscribed: false } },
        identifiers: { cartTokens: ['tok-abc'] },
      }) }),
    });

    await _processScheduledJobs();

    expect(sendPushToCustomers).not.toHaveBeenCalled();
    const skipCall = ScheduledJob.findByIdAndUpdate.mock.calls.find(
      ([, upd]) => upd && upd.status === 'skipped'
    );
    expect(skipCall).toBeDefined();
    expect(skipCall[1].error).toBe('push_consent_withdrawn');
  });

  test('no cartToken in profile → job skipped', async () => {
    ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([birthdayPushJob()]) });
    Profile.findById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({
        _id: PROF_ID, suppressed: false,
        channels: { push: { subscribed: true } },
        identifiers: { cartTokens: [] },
      }) }),
    });

    await _processScheduledJobs();

    expect(sendPushToCustomers).not.toHaveBeenCalled();
    const skipCall = ScheduledJob.findByIdAndUpdate.mock.calls.find(
      ([, upd]) => upd && upd.status === 'skipped'
    );
    expect(skipCall).toBeDefined();
    expect(skipCall[1].error).toBe('no_push_token');
  });

  test('valid profile → sendPushToCustomers called with profile cartToken (not null)', async () => {
    ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([birthdayPushJob()]) });
    Profile.findById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({
        _id: PROF_ID, suppressed: false,
        channels: { push: { subscribed: true } },
        identifiers: { cartTokens: ['cart-tok-xyz'] },
      }) }),
    });

    await _processScheduledJobs();

    expect(sendPushToCustomers).toHaveBeenCalled();
    const callArgs = sendPushToCustomers.mock.calls[0];
    // 7th arg (index 6) is cartToken — must be the profile's token, not null
    expect(callArgs[6]).toBe('cart-tok-xyz');
  });

  test('birthday push retry with valid profile — fires with job existing cartToken', async () => {
    // Step 0a: suppression check now runs on retries too (cartToken already set).
    // Profile must be unsuppressed and subscribed; cartToken stays the job's value.
    ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([
      birthdayPushJob({ cartToken: 'existing-cart-tok' }),
    ]) });
    Profile.findById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({
        _id: PROF_ID, suppressed: false,
        channels: { push: { subscribed: true } },
        identifiers: { cartTokens: ['other-tok'] }, // profile token is ignored on retry
      }) }),
    });

    await _processScheduledJobs();

    expect(sendPushToCustomers).toHaveBeenCalled();
    const callArgs = sendPushToCustomers.mock.calls[0];
    // Must use the job's pre-set cartToken, not the profile's
    expect(callArgs[6]).toBe('existing-cart-tok');
  });

  test('birthday push retry with suppressed profile — skipped even with pre-set cartToken', async () => {
    ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([
      birthdayPushJob({ cartToken: 'existing-cart-tok' }),
    ]) });
    Profile.findById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({
        _id: PROF_ID, suppressed: true,
        channels: { push: { subscribed: true } },
        identifiers: { cartTokens: ['existing-cart-tok'] },
      }) }),
    });

    await _processScheduledJobs();

    expect(sendPushToCustomers).not.toHaveBeenCalled();
    const skipCall = ScheduledJob.findByIdAndUpdate.mock.calls.find(
      ([, upd]) => upd && upd.status === 'skipped'
    );
    expect(skipCall).toBeDefined();
    expect(skipCall[1].error).toBe('profile_suppressed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Birthday email — suppression re-check
// ─────────────────────────────────────────────────────────────────────────────

describe('3b — birthday email: suppression re-check at send time', () => {
  test('suppressed profile → job skipped, sendMarketingEmail NOT called', async () => {
    ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([birthdayEmailJob()]) });
    Profile.findById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({
        _id: PROF_ID, suppressed: true,
        channels: { email: { address: 'test@example.com' } },
      }) }),
    });

    await _processScheduledJobs();

    expect(sendMarketingEmail).not.toHaveBeenCalled();
    const skipCall = ScheduledJob.findByIdAndUpdate.mock.calls.find(
      ([, upd]) => upd && upd.status === 'skipped'
    );
    expect(skipCall).toBeDefined();
    expect(skipCall[1].error).toBe('profile_suppressed');
  });

  test('unsuppressed profile with email → sendMarketingEmail called', async () => {
    ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([birthdayEmailJob()]) });
    Profile.findById.mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({
        _id: PROF_ID, suppressed: false,
        channels: { email: { address: 'test@example.com' } },
      }) }),
    });

    await _processScheduledJobs();

    expect(sendMarketingEmail).toHaveBeenCalledWith(
      'test@example.com',
      expect.any(String),
      expect.any(String),
      SHOP,
      PROF_ID
    );
  });
});
