/**
 * Phase H — weightsService.computeWeights + one brain EV-ranking integration test.
 * ScheduledJob / ShopWeights (and, for test 8, the full brain dependency set)
 * are auto-mocked. No DB.
 */

jest.mock('../models/ScheduledJob');
jest.mock('../models/ShopWeights');
jest.mock('../models/Profile');
jest.mock('../models/Signal');
jest.mock('../models/SignalConfig');
jest.mock('../models/Store');

const ScheduledJob = require('../models/ScheduledJob');
const ShopWeights = require('../models/ShopWeights');
const Profile = require('../models/Profile');
const Signal = require('../models/Signal');
const SignalConfig = require('../models/SignalConfig');
const Store = require('../models/Store');

const { computeWeights } = require('../services/weightsService');
const { runBrainForProfile } = require('../services/brain');

const SHOP = 'demo.myshopify.com';

// helpers -------------------------------------------------------------------
function job(over = {}) {
  return {
    signalType: 'cart_abandon',
    channel: 'push',
    outcome: null,
    sentAt: new Date('2026-09-01T14:00:00Z'),
    runAt: new Date('2026-09-01T14:00:00Z'),
    ...over,
  };
}
function mockJobs(list) {
  ScheduledJob.find.mockReturnValue({ lean: () => Promise.resolve(list) });
}
function lastUpsertSet() {
  const call = ShopWeights.findOneAndUpdate.mock.calls.at(-1);
  return { filter: call[0], set: call[1].$set, opts: call[2] };
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
  jest.clearAllMocks();
  ShopWeights.findOneAndUpdate.mockImplementation((filter, update) =>
    Promise.resolve({ shopDomain: SHOP, ...update.$set })
  );
});

// -------------------------------------------------------------------------
describe('computeWeights — signalRates', () => {
  test('1. neutral rate 1.0 when a signal has fewer than 10 sends', async () => {
    mockJobs([
      ...Array.from({ length: 5 }, () => job({ signalType: 'cart_abandon', outcome: 'clicked' })),
    ]);
    await computeWeights(SHOP);
    expect(lastUpsertSet().set.signalRates.cart_abandon.rate).toBe(1.0);
    expect(lastUpsertSet().set.signalRates.cart_abandon.sends).toBe(5);
  });

  test('2. real rate once >= 10 sends exist', async () => {
    mockJobs([
      ...Array.from({ length: 3 }, () => job({ signalType: 'cart_abandon', outcome: 'clicked' })),
      ...Array.from({ length: 2 }, () => job({ signalType: 'cart_abandon', outcome: 'converted' })),
      ...Array.from({ length: 5 }, () => job({ signalType: 'cart_abandon', outcome: null })),
    ]);
    await computeWeights(SHOP);
    // (3 clicks + 2 conversions) / 10 sends
    expect(lastUpsertSet().set.signalRates.cart_abandon.rate).toBe(0.5);
  });

  test('3. clicks and conversions both count toward the rate', async () => {
    mockJobs([
      ...Array.from({ length: 4 }, () => job({ signalType: 'lapsing', outcome: 'clicked' })),
      ...Array.from({ length: 3 }, () => job({ signalType: 'lapsing', outcome: 'converted' })),
      ...Array.from({ length: 3 }, () => job({ signalType: 'lapsing', outcome: null })),
    ]);
    await computeWeights(SHOP);
    expect(lastUpsertSet().set.signalRates.lapsing.rate).toBe(0.7);
  });
});

describe('computeWeights — channelRates', () => {
  test('4. push and email rates computed independently', async () => {
    mockJobs([
      ...Array.from({ length: 6 }, () => job({ channel: 'push', outcome: 'clicked' })),
      ...Array.from({ length: 6 }, () => job({ channel: 'push', outcome: null })),
      ...Array.from({ length: 3 }, () => job({ channel: 'email', outcome: 'converted' })),
      ...Array.from({ length: 12 }, () => job({ channel: 'email', outcome: null })),
    ]);
    await computeWeights(SHOP);
    const { set } = lastUpsertSet();
    expect(set.channelRates.push.rate).toBe(0.5); // 6 / 12
    expect(set.channelRates.email.rate).toBe(0.2); // 3 / 15
  });
});

describe('computeWeights — hourRates', () => {
  test('5. the hour with the most conversions gets the highest rate', async () => {
    mockJobs([
      ...Array.from({ length: 5 }, () =>
        job({ sentAt: new Date('2026-09-01T14:00:00Z'), outcome: 'clicked' })
      ),
      ...Array.from({ length: 5 }, () =>
        job({ sentAt: new Date('2026-09-01T14:00:00Z'), outcome: null })
      ),
      ...Array.from({ length: 1 }, () =>
        job({ sentAt: new Date('2026-09-01T20:00:00Z'), outcome: 'clicked' })
      ),
      ...Array.from({ length: 9 }, () =>
        job({ sentAt: new Date('2026-09-01T20:00:00Z'), outcome: null })
      ),
    ]);
    await computeWeights(SHOP);
    const { set } = lastUpsertSet();
    expect(set.hourRates['14'].rate).toBe(0.5); // 5 / 10
    expect(set.hourRates['20'].rate).toBe(0.1); // 1 / 10
    expect(set.hourRates['14'].rate).toBeGreaterThan(set.hourRates['20'].rate);
  });

  test('6. an hour with fewer than 5 sends gets the neutral rate 1.0', async () => {
    mockJobs([
      ...Array.from({ length: 2 }, () =>
        job({ sentAt: new Date('2026-09-01T03:00:00Z'), outcome: 'clicked' })
      ),
      ...Array.from({ length: 1 }, () =>
        job({ sentAt: new Date('2026-09-01T03:00:00Z'), outcome: null })
      ),
    ]);
    await computeWeights(SHOP);
    expect(lastUpsertSet().set.hourRates['3'].rate).toBe(1.0); // 3 sends < 5
  });
});

describe('computeWeights — persistence', () => {
  test('7. ShopWeights is upserted with the computed shape', async () => {
    mockJobs([job({ outcome: 'clicked' })]);
    await computeWeights(SHOP);
    const { filter, set, opts } = lastUpsertSet();
    expect(filter).toEqual({ shopDomain: SHOP });
    expect(opts).toEqual(expect.objectContaining({ upsert: true, new: true }));
    expect(set).toEqual(
      expect.objectContaining({
        signalRates: expect.any(Object),
        channelRates: expect.objectContaining({
          push: expect.objectContaining({ rate: expect.any(Number) }),
          email: expect.objectContaining({ rate: expect.any(Number) }),
        }),
        hourRates: expect.any(Object),
        lastComputedAt: expect.any(Date),
      })
    );
  });
});

describe('brain EV ranking (integration)', () => {
  test('8. a weak signal with a high shop rate beats a strong signal with a low shop rate', async () => {
    Profile.findById.mockResolvedValue({
      _id: 'p1',
      shopDomain: SHOP,
      suppressed: false,
      identifiers: { cartTokens: [] },
      channels: { push: { subscribed: true }, email: {} },
      messages: [],
      activeHours: [],
    });
    Store.findOne.mockResolvedValue({
      caps: {},
      quietHours: {},
      timezone: 'Asia/Kolkata',
    });
    ShopWeights.findOne.mockResolvedValue({
      // cart_abandon converts terribly here; browse_abandon is neutral (no data)
      signalRates: new Map([
        ['cart_abandon', { rate: 0.05, sends: 40 }],
        ['browse_abandon', { rate: 1.0, sends: 0 }],
      ]),
      channelRates: { push: { rate: 1.0 }, email: { rate: 1.0 } },
      hourRates: new Map(),
    });
    Signal.find.mockResolvedValue([
      { _id: 's1', type: 'cart_abandon', strength: 0.9, productId: null },
      { _id: 's2', type: 'browse_abandon', strength: 0.4, productId: null },
    ]);
    SignalConfig.findOne.mockResolvedValue(null);
    ScheduledJob.findOne.mockResolvedValue(null); // no existing pending job
    ScheduledJob.create.mockResolvedValue({ _id: 'job1' });

    // EV(cart)  = 0.9 * 1.0(base) * 0.05(sigRate) * 1.0 = 0.045
    // EV(browse)= 0.4 * 0.4(base) * 1.0(sigRate)  * 1.0 = 0.064  -> browse wins
    const r = await runBrainForProfile('p1', SHOP);
    expect(r.signalType).toBe('browse_abandon');
    expect(ScheduledJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ signalType: 'browse_abandon' })
    );
  });
});
