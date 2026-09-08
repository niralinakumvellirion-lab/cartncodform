/**
 * Tests for backend/services/analyticsService.js.
 * Profile / ScheduledJob / AbandonedCustomer / Store are auto-mocked.
 */

jest.mock('../models/Profile');
jest.mock('../models/ScheduledJob');
jest.mock('../models/AbandonedCustomer');
jest.mock('../models/Store');

const Profile = require('../models/Profile');
const ScheduledJob = require('../models/ScheduledJob');
const AbandonedCustomer = require('../models/AbandonedCustomer');
const Store = require('../models/Store');
const { computeWeeklyStats, computeInsights } = require('../services/analyticsService');

const SHOP = 'demo.myshopify.com';

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
  jest.clearAllMocks();
  Profile.countDocuments.mockResolvedValue(0);
  ScheduledJob.countDocuments.mockResolvedValue(0);
  ScheduledJob.find.mockResolvedValue([]);
  AbandonedCustomer.find.mockResolvedValue([]);
  Store.findOne.mockResolvedValue({ timezone: 'Asia/Kolkata' });
});

describe('computeWeeklyStats', () => {
  test('1. returns zeros / nulls when there is no data', async () => {
    const s = await computeWeeklyStats(SHOP);
    expect(s).toEqual({
      profilesLookedAt: 0,
      messagesSent: 0,
      conversions: 0,
      revenueRecovered: 0,
      topProduct: null,
      bestChannel: null,
    });
  });

  test('2. messagesSent counts only status="sent" ScheduledJobs', async () => {
    ScheduledJob.countDocuments.mockImplementation((f) =>
      Promise.resolve(f.status === 'sent' ? 7 : 99)
    );
    const s = await computeWeeklyStats(SHOP);
    expect(s.messagesSent).toBe(7);
    expect(ScheduledJob.countDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'sent' })
    );
  });

  test('3. revenueRecovered sums recoveredRevenue across recovered carts', async () => {
    AbandonedCustomer.find.mockResolvedValue([
      { recoveredRevenue: 1500, cartItems: [{ title: 'Saree' }], sessionId: 'a' },
      { recoveredRevenue: 2500, cartItems: [{ title: 'Saree' }], sessionId: 'b' },
    ]);
    const s = await computeWeeklyStats(SHOP);
    expect(s.revenueRecovered).toBe(4000);
    expect(s.conversions).toBe(2);
    expect(s.topProduct).toBe('Saree');
  });
});

describe('computeInsights', () => {
  test('4. always returns exactly 3 insights, in order', async () => {
    const ins = await computeInsights(SHOP);
    expect(ins).toHaveLength(3);
    expect(ins.map((i) => i.type)).toEqual(['TOP_PRODUCT', 'BEST_CHANNEL', 'BEST_HOUR']);
    for (const i of ins) expect(typeof i.evidence).toBe('string');
  });

  test('5. BEST_CHANNEL is "push" when push recoveries outweigh email', async () => {
    ScheduledJob.find.mockResolvedValue([
      { channel: 'push', cartToken: 'a' },
      { channel: 'push', cartToken: 'b' },
      { channel: 'email', cartToken: 'c' },
    ]);
    AbandonedCustomer.find.mockResolvedValue([
      { sessionId: 'a', cartItems: [], recoveredAt: new Date() },
      { sessionId: 'b', cartItems: [], recoveredAt: new Date() },
    ]);
    const ins = await computeInsights(SHOP);
    const bc = ins.find((i) => i.type === 'BEST_CHANNEL');
    expect(bc.value).toBe('push');
  });
});
