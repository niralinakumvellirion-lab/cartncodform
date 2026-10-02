/**
 * server.js poller — payload copy persistence
 *
 * Verifies that processScheduledJobs() persists the AI-resolved
 * payload.title/body back to the ScheduledJob via $set BEFORE calling
 * sendPushToCustomers, so the Messages screen can display the actual
 * notification copy (audits/message-content-audit.txt).
 *
 * Imports server.js via its exported _processScheduledJobs. The
 * require.main === module guard in server.js prevents start() /
 * connectDB() / app.listen() from running in the test environment.
 */

jest.useFakeTimers();

// ---- dependency mocks (must come before require('../server')) ----

jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('../config/db', () => jest.fn().mockResolvedValue(undefined));

// Routes — mocked to plain jest functions (Express app.use() requires a
// callable; jest.fn() satisfies that without loading the real routes).
jest.mock('../routes/auth',        () => jest.fn());
jest.mock('../routes/webhooks',    () => jest.fn());
jest.mock('../routes/stores',      () => jest.fn());
jest.mock('../routes/cod',         () => jest.fn());
jest.mock('../routes/push',        () => jest.fn());
jest.mock('../routes/proxy',       () => jest.fn());
jest.mock('../routes/discounts',   () => jest.fn());
jest.mock('../routes/events',      () => jest.fn());
jest.mock('../routes/attribution', () => jest.fn());
jest.mock('../routes/profiles',    () => jest.fn());
jest.mock('../routes/activity',    () => jest.fn());
jest.mock('../routes/queue',       () => jest.fn());
jest.mock('../routes/automation',  () => jest.fn());

jest.mock('../models/ScheduledJob');
jest.mock('../models/FestivalQueue');
jest.mock('../models/Store');
jest.mock('../models/Profile');
jest.mock('../models/AbandonedCustomer');
jest.mock('../models/CustomerPushSubscription');
jest.mock('../models/AutomationConfig');

jest.mock('../utils/pushNotification', () => ({
  sendPushToCustomers: jest.fn(),
  buildClickUrl:       jest.fn(),
}));
jest.mock('../utils/email', () => ({
  sendAbandonedCartEmail: jest.fn(),
  sendMarketingEmail:     jest.fn(),
}));
jest.mock('../services/aiService', () => ({
  generateCopy:      jest.fn(),
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
  isQuietNow:      jest.fn().mockReturnValue(false),
  zonedTimeToUtc:  jest.fn(),
  resolveTz:       jest.fn(),
}));

// ---- import after mocks ----
const ScheduledJob = require('../models/ScheduledJob');
const Store        = require('../models/Store');
const Profile      = require('../models/Profile');
const { sendPushToCustomers }    = require('../utils/pushNotification');
const { sendAbandonedCartEmail } = require('../utils/email');
const { generateCopy }           = require('../services/aiService');
const { _processScheduledJobs }  = require('../server');

const SHOP  = 'demo.myshopify.com';
const JOB_ID = '507f1f77bcf86cd799439011';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  // Nightly gate: no shops to process
  Store.find.mockReturnValue({ lean: () => Promise.resolve([]) });
  // Quiet hours check + jobStore load — both use Store.findOne
  Store.findOne.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve({ timezone: 'Asia/Kolkata', quietHours: { enabled: false } }) }),
    // non-lean (jobStore) path
    voice: {},
    toObject: () => ({}),
  });
  // Frequency cap check
  ScheduledJob.countDocuments.mockResolvedValue(0);
  // Claim
  ScheduledJob.findOneAndUpdate.mockResolvedValue({ _id: JOB_ID, status: 'sent' });
  // Generic payload persist + failure updates
  ScheduledJob.findByIdAndUpdate.mockResolvedValue({});
  // Profile message log
  Profile.findByIdAndUpdate.mockResolvedValue({});
});

afterEach(() => jest.restoreAllMocks());

// ── helper: build a minimal brain push job ──────────────────────────────────
function brainPushJob(over = {}) {
  return {
    _id: JOB_ID,
    shopDomain: SHOP,
    profileId: 'profile001',
    signalType: 'cart_abandon',
    channel: 'push',
    cartToken: null,
    customerId: null,
    status: 'pending',
    runAt: new Date(Date.now() - 60_000), // 1 min ago
    payload: { title: '', body: '', url: `https://${SHOP}`, imageUrl: '' },
    ...over,
  };
}

// ── push branch ─────────────────────────────────────────────────────────────

describe('push branch — payload persistence', () => {
  test('persists resolved title+body via $set BEFORE sendPushToCustomers', async () => {
    ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([brainPushJob()]) });
    generateCopy.mockResolvedValue({ title: 'We saved your cart', body: 'Come back soon!' });
    sendPushToCustomers.mockResolvedValue({ success: true, sent: 1, tokensFound: 1, recipients: [] });

    const callOrder = [];
    ScheduledJob.findByIdAndUpdate.mockImplementation((id, update) => {
      if (update.$set?.['payload.title'] !== undefined) callOrder.push('persist');
      return Promise.resolve({});
    });
    sendPushToCustomers.mockImplementation(() => {
      callOrder.push('send');
      return Promise.resolve({ success: true, sent: 1, tokensFound: 1, recipients: [] });
    });

    await _processScheduledJobs();

    // $set was called with the resolved copy
    const persistCall = ScheduledJob.findByIdAndUpdate.mock.calls.find(
      ([, upd]) => upd.$set?.['payload.title'] !== undefined
    );
    expect(persistCall).toBeDefined();
    expect(persistCall[1]).toEqual({
      $set: { 'payload.title': 'We saved your cart', 'payload.body': 'Come back soon!' },
    });

    // persist fired before the FCM send
    expect(callOrder.indexOf('persist')).toBeLessThan(callOrder.indexOf('send'));
  });

  test('uses dot-notation $set — never calls job.save()', async () => {
    ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([brainPushJob()]) });
    generateCopy.mockResolvedValue({ title: 'Title', body: 'Body' });
    sendPushToCustomers.mockResolvedValue({ success: true, sent: 1, tokensFound: 1, recipients: [] });

    await _processScheduledJobs();

    const persistCall = ScheduledJob.findByIdAndUpdate.mock.calls.find(
      ([, upd]) => upd.$set?.['payload.title'] !== undefined
    );
    expect(persistCall).toBeDefined();
    // Keys must be dot-notation paths, not a nested object
    expect(Object.keys(persistCall[1].$set)).toContain('payload.title');
    expect(Object.keys(persistCall[1].$set)).toContain('payload.body');
    expect(persistCall[1].$set['payload.title']).not.toBeUndefined();
  });

  test('does NOT persist payload for a legacy (non-brain) push job', async () => {
    const legacyJob = brainPushJob({ profileId: null });
    ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([legacyJob]) });
    sendPushToCustomers.mockResolvedValue({ success: true, sent: 1, tokensFound: 1, recipients: [] });

    await _processScheduledJobs();

    const persistCall = ScheduledJob.findByIdAndUpdate.mock.calls.find(
      ([, upd]) => upd.$set?.['payload.title'] !== undefined
    );
    expect(persistCall).toBeUndefined();
    expect(generateCopy).not.toHaveBeenCalled();
  });
});

// ── email branch ─────────────────────────────────────────────────────────────

describe('email branch — payload persistence', () => {
  const AbandonedCustomer = require('../models/AbandonedCustomer');

  test('persists resolved subject+body via $set BEFORE sendAbandonedCartEmail', async () => {
    const emailJob = brainPushJob({ channel: 'email' });
    ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([emailJob]) });
    AbandonedCustomer.findOne.mockResolvedValue({ email: 'buyer@example.com', name: 'Test' });
    generateCopy.mockResolvedValue({ subject: 'Your cart is waiting', body: 'Come back!' });

    const callOrder = [];
    ScheduledJob.findByIdAndUpdate.mockImplementation((id, update) => {
      if (update.$set?.['payload.subject'] !== undefined) callOrder.push('persist');
      return Promise.resolve({});
    });
    sendAbandonedCartEmail.mockImplementation(() => {
      callOrder.push('send');
      return Promise.resolve({ success: true });
    });

    await _processScheduledJobs();

    const persistCall = ScheduledJob.findByIdAndUpdate.mock.calls.find(
      ([, upd]) => upd.$set?.['payload.subject'] !== undefined
    );
    expect(persistCall).toBeDefined();
    expect(persistCall[1]).toEqual({
      $set: {
        'payload.subject': 'Your cart is waiting',
        'payload.body':    'Come back!',
      },
    });
    expect(callOrder.indexOf('persist')).toBeLessThan(callOrder.indexOf('send'));
  });
});
