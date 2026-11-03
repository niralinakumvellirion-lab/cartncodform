/**
 * Automated push: when a job was scheduled without an image, the poller looks the
 * product image up at send time (price hesitation, browse, high intent ... have none).
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
jest.mock('../models/ProductImageCache', () => ({ findOne: jest.fn(), deleteOne: jest.fn(), findOneAndUpdate: jest.fn() }));

const mockFetchImage = jest.fn();
jest.mock('../utils/productImage', () => ({
  ...jest.requireActual('../utils/productImage'),
  fetchProductImage: (...args) => mockFetchImage(...args),
}));

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
const Store = require('../models/Store');
const { sendPushToCustomers } = require('../utils/pushNotification');
const { _processScheduledJobs } = require('../server');

const SHOP = 'push-image.myshopify.com';
const JOB_ID = '507f1f77bcf86cd799439066';

function storeDoc() {
  return {
    accessToken: 'stored-token',
    voice: {},
    select: () => ({
      lean: () => Promise.resolve({
        timezone: 'Asia/Kolkata', quietHours: { enabled: false }, suspended: false, plan: 'pro',
      }),
    }),
  };
}

function pushJob(payload) {
  return {
    _id: JOB_ID, shopDomain: SHOP, signalType: 'price_hesitation', channel: 'push',
    status: 'pending', runAt: new Date(Date.now() - 60_000), cartToken: 'cart1',
    payload: { title: 'T', body: 'B', ...payload },
  };
}

function sentImage() {
  return sendPushToCustomers.mock.calls[0][4];
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  Store.find.mockReturnValue({ lean: () => Promise.resolve([]) });
  Store.findOne.mockReturnValue(storeDoc());
  ScheduledJob.countDocuments.mockResolvedValue(0);
  ScheduledJob.findOneAndUpdate.mockResolvedValue({ _id: JOB_ID, status: 'sent' });
  ScheduledJob.findByIdAndUpdate.mockResolvedValue({});
  mockFetchImage.mockResolvedValue(null);
});

afterEach(() => jest.restoreAllMocks());

function run(payload) {
  ScheduledJob.find.mockReturnValue({ limit: () => Promise.resolve([pushJob(payload)]) });
  return _processScheduledJobs();
}

describe('automated push product image', () => {
  test('no stored image: looked up from the numeric product id in the link and sent', async () => {
    mockFetchImage.mockResolvedValue('https://cdn.example/p.jpg');
    await run({ url: `https://${SHOP}/products/987654`, imageUrl: '' });
    expect(mockFetchImage).toHaveBeenCalledWith(SHOP, 'stored-token', '987654');
    expect(sentImage()).toBe('https://cdn.example/p.jpg');
  });

  test('the found image is saved on the job payload', async () => {
    mockFetchImage.mockResolvedValue('https://cdn.example/p.jpg');
    await run({ url: `https://${SHOP}/products/987654`, imageUrl: '' });
    expect(ScheduledJob.findByIdAndUpdate).toHaveBeenCalledWith(
      JOB_ID,
      { $set: { 'payload.imageUrl': 'https://cdn.example/p.jpg' } }
    );
  });

  test('a handle link (with a query string) is looked up by its handle', async () => {
    mockFetchImage.mockResolvedValue('https://cdn.example/h.jpg');
    await run({ url: `https://${SHOP}/products/silk-saree?utm=x`, imageUrl: '' });
    expect(mockFetchImage).toHaveBeenCalledWith(SHOP, 'stored-token', 'silk-saree');
    expect(sentImage()).toBe('https://cdn.example/h.jpg');
  });

  test('a stored image is used as is, no lookup', async () => {
    await run({ url: `https://${SHOP}/products/987654`, imageUrl: 'https://cdn.example/stored.jpg' });
    expect(mockFetchImage).not.toHaveBeenCalled();
    expect(sentImage()).toBe('https://cdn.example/stored.jpg');
  });

  test('a link with no product (store home) is sent without an image and without a lookup', async () => {
    await run({ url: `https://${SHOP}`, imageUrl: '' });
    expect(mockFetchImage).not.toHaveBeenCalled();
    expect(sentImage()).toBeNull();
  });

  test('lookup finds nothing: push still goes out without an image, nothing saved', async () => {
    mockFetchImage.mockResolvedValue(null);
    await run({ url: `https://${SHOP}/products/987654`, imageUrl: '' });
    expect(sendPushToCustomers).toHaveBeenCalledTimes(1);
    expect(sentImage()).toBeNull();
    const imageSaves = ScheduledJob.findByIdAndUpdate.mock.calls.filter(([, u]) => u.$set && u.$set['payload.imageUrl']);
    expect(imageSaves).toHaveLength(0);
  });

  test('lookup throws: push still goes out without an image', async () => {
    mockFetchImage.mockRejectedValue(new Error('shopify down'));
    await run({ url: `https://${SHOP}/products/987654`, imageUrl: '' });
    expect(sendPushToCustomers).toHaveBeenCalledTimes(1);
    expect(sentImage()).toBeNull();
  });
});
