/**
 * Poller skips stores without an active plan (same treatment as suspended stores).
 */

jest.useFakeTimers();

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../config/db', () => jest.fn().mockResolvedValue(undefined));

jest.mock('../routes/auth',        () => jest.fn());
jest.mock('../routes/webhooks',    () => jest.fn());
jest.mock('../routes/stores',      () => jest.fn());
jest.mock('../routes/billing',     () => jest.fn());
jest.mock('../routes/cod',         () => jest.fn());
jest.mock('../routes/push',        () => jest.fn());
jest.mock('../routes/proxy',       () => jest.fn());
jest.mock('../routes/events',      () => jest.fn());
jest.mock('../routes/attribution', () => jest.fn());
jest.mock('../routes/profiles',    () => jest.fn());
jest.mock('../routes/activity',    () => jest.fn());
jest.mock('../routes/queue',       () => jest.fn());
jest.mock('../routes/automation',  () => jest.fn());
jest.mock('../routes/discounts', () => {
  const fn = jest.fn();
  fn.generateDiscount = jest.fn();
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
jest.mock('../services/aiService', () => ({ generateCopy: jest.fn(), generateEmailCopy: jest.fn() }));
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
const FestivalQueue = require('../models/FestivalQueue');
const Store = require('../models/Store');
const { sendPushToCustomers } = require('../utils/pushNotification');
const { _processScheduledJobs, _processFestivalQueue } = require('../server');

const SHOP = 'plan-poller.myshopify.com';
const JOB_ID = '507f1f77bcf86cd799439055';

function storeWith(extra) {
  return {
    select: () => ({
      lean: () => Promise.resolve({
        timezone: 'Asia/Kolkata', quietHours: { enabled: false }, suspended: false, ...extra,
      }),
    }),
  };
}

function pendingJob() {
  return {
    _id: JOB_ID, shopDomain: SHOP, signalType: 'cart_reminder', channel: 'push',
    status: 'pending', runAt: new Date(Date.now() - 60_000), payload: {},
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  Store.find.mockReturnValue({ lean: () => Promise.resolve([]) });
  ScheduledJob.countDocuments.mockResolvedValue(0);
  ScheduledJob.findOneAndUpdate.mockResolvedValue({ _id: JOB_ID });
  ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([pendingJob()]) });
});

afterEach(() => jest.restoreAllMocks());

describe('processScheduledJobs — plan gate', () => {
  test('free store → job marked skipped no_active_plan, nothing sent', async () => {
    Store.findOne.mockReturnValue(storeWith({ plan: 'free' }));
    await _processScheduledJobs();
    expect(ScheduledJob.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: JOB_ID, status: 'pending' },
      { status: 'skipped', error: 'no_active_plan' }
    );
    expect(sendPushToCustomers).not.toHaveBeenCalled();
  });

  test('pro store → job is NOT skipped for plan reasons', async () => {
    Store.findOne.mockReturnValue(storeWith({ plan: 'pro' }));
    await _processScheduledJobs();
    const planSkips = ScheduledJob.findOneAndUpdate.mock.calls.filter(
      ([, upd]) => upd && upd.error === 'no_active_plan'
    );
    expect(planSkips).toHaveLength(0);
  });

  test('internal free store → NOT skipped for plan reasons', async () => {
    Store.findOne.mockReturnValue(storeWith({ plan: 'free', isInternal: true }));
    await _processScheduledJobs();
    const planSkips = ScheduledJob.findOneAndUpdate.mock.calls.filter(
      ([, upd]) => upd && upd.error === 'no_active_plan'
    );
    expect(planSkips).toHaveLength(0);
  });
});

describe('processFestivalQueue — plan gate', () => {
  const item = { _id: 'fq-plan', shopDomain: SHOP, channel: 'push', title: 'T', body: 'B', failedAttempts: 0 };

  test('store reported as blocked → item not claimed, nothing sent', async () => {
    FestivalQueue.find.mockReturnValue({ limit: () => Promise.resolve([item]) });
    Store.find.mockReturnValue({ lean: () => Promise.resolve([{ shopDomain: SHOP }]) });
    await _processFestivalQueue();
    expect(FestivalQueue.findOneAndUpdate).not.toHaveBeenCalled();
    expect(sendPushToCustomers).not.toHaveBeenCalled();
  });

  test('the blocked-store query covers suspended OR (not pro AND not internal)', async () => {
    FestivalQueue.find.mockReturnValue({ limit: () => Promise.resolve([item]) });
    Store.find.mockReturnValue({ lean: () => Promise.resolve([]) });
    FestivalQueue.findOneAndUpdate.mockResolvedValue(null);
    await _processFestivalQueue();
    const [filter] = Store.find.mock.calls[0];
    expect(filter.shopDomain).toEqual({ $in: [SHOP] });
    expect(filter.$or).toEqual([
      { suspended: true },
      { plan: { $ne: 'pro' }, isInternal: { $ne: true } },
    ]);
  });
});
