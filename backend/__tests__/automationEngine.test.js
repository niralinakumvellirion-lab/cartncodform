jest.mock('../models/AutomationRule');
jest.mock('../models/ScheduledJob');
jest.mock('../models/CustomerPushSubscription');

const AutomationRule = require('../models/AutomationRule');
const ScheduledJob = require('../models/ScheduledJob');
const CustomerPushSubscription = require('../models/CustomerPushSubscription');
const { scheduleCartAbandonJobs, cancelJobsForOrder } = require('../utils/automationEngine');

describe('scheduleCartAbandonJobs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does nothing when cartToken is missing', async () => {
    await scheduleCartAbandonJobs('shop.myshopify.com', null, null, {});
    expect(AutomationRule.find).not.toHaveBeenCalled();
  });

  test('does nothing when there are no active cart_abandon rules', async () => {
    AutomationRule.find.mockResolvedValue([]);

    await scheduleCartAbandonJobs('shop.myshopify.com', 'cart123', null, {});

    expect(AutomationRule.find).toHaveBeenCalledWith({
      shopDomain: 'shop.myshopify.com',
      trigger: 'cart_abandon',
      active: true,
    });
    expect(CustomerPushSubscription.findOne).not.toHaveBeenCalled();
  });

  test('does nothing when no subscriber is linked to the cart', async () => {
    AutomationRule.find.mockResolvedValue([{ _id: 'rule1', steps: [] }]);
    CustomerPushSubscription.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });

    await scheduleCartAbandonJobs('shop.myshopify.com', 'cart123', null, {});

    expect(ScheduledJob.create).not.toHaveBeenCalled();
  });

  test('skips scheduling when a pending/sent job already exists for this rule+cart', async () => {
    AutomationRule.find.mockResolvedValue([
      { _id: 'rule1', name: 'Test Rule', steps: [{ delayMinutes: 30, title: 'Hi', body: 'Body', imageSource: 'product' }] },
    ]);
    CustomerPushSubscription.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ customerId: null }),
    });
    ScheduledJob.findOne.mockResolvedValue({ _id: 'existingJob' });

    await scheduleCartAbandonJobs('shop.myshopify.com', 'cart123', null, {});

    expect(ScheduledJob.create).not.toHaveBeenCalled();
  });

  test('schedules one job per step with cumulative delay minutes', async () => {
    AutomationRule.find.mockResolvedValue([
      {
        _id: 'rule1',
        name: 'Two Step Rule',
        steps: [
          { delayMinutes: 30, title: 'Step 1', body: 'Body 1', imageSource: 'product' },
          { delayMinutes: 60, title: 'Step 2', body: 'Body 2', imageSource: 'none' },
        ],
      },
    ]);
    CustomerPushSubscription.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ customerId: 'cust1' }),
    });
    ScheduledJob.findOne.mockResolvedValue(null);
    ScheduledJob.create.mockResolvedValue({});

    const before = Date.now();
    await scheduleCartAbandonJobs('shop.myshopify.com', 'cart123', null, {
      cartValue: 500,
      firstItemTitle: 'Blue Shirt',
      productImageUrl: 'https://example.com/img.jpg',
    });

    expect(ScheduledJob.create).toHaveBeenCalledTimes(2);

    const firstCallArgs = ScheduledJob.create.mock.calls[0][0];
    const secondCallArgs = ScheduledJob.create.mock.calls[1][0];

    // Step 0: runAt should be ~30 min from now
    const step0DelayMs = firstCallArgs.runAt.getTime() - before;
    expect(step0DelayMs).toBeGreaterThanOrEqual(30 * 60 * 1000 - 1000);
    expect(step0DelayMs).toBeLessThanOrEqual(30 * 60 * 1000 + 5000);

    // Step 1: runAt should be ~90 min from now (30 + 60 cumulative)
    const step1DelayMs = secondCallArgs.runAt.getTime() - before;
    expect(step1DelayMs).toBeGreaterThanOrEqual(90 * 60 * 1000 - 1000);
    expect(step1DelayMs).toBeLessThanOrEqual(90 * 60 * 1000 + 5000);

    // imageSource: 'product' includes the image, 'none' does not
    expect(firstCallArgs.payload.imageUrl).toBe('https://example.com/img.jpg');
    expect(secondCallArgs.payload.imageUrl).toBeNull();
  });

  test('template placeholders are substituted into title/body', async () => {
    AutomationRule.find.mockResolvedValue([
      {
        _id: 'rule1',
        name: 'Template Rule',
        steps: [{ delayMinutes: 15, title: 'Hey!', body: 'Your {productTitle} is waiting (₹{cartValue})', imageSource: 'none' }],
      },
    ]);
    CustomerPushSubscription.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ customerId: null }),
    });
    ScheduledJob.findOne.mockResolvedValue(null);
    ScheduledJob.create.mockResolvedValue({});

    await scheduleCartAbandonJobs('shop.myshopify.com', 'cart123', null, {
      cartValue: 999,
      firstItemTitle: 'Red Shoes',
    });

    const callArgs = ScheduledJob.create.mock.calls[0][0];
    expect(callArgs.payload.body).toBe('Your Red Shoes is waiting (₹999)');
  });

  test('BUG DOCUMENTATION: only the FIRST occurrence of a placeholder is replaced', async () => {
    AutomationRule.find.mockResolvedValue([
      {
        _id: 'rule1',
        name: 'Double Placeholder Rule',
        steps: [{
          delayMinutes: 15,
          title: 'Hi',
          body: '{productTitle} - buy {productTitle} now!',
          imageSource: 'none'
        }],
      },
    ]);
    CustomerPushSubscription.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ customerId: null }),
    });
    ScheduledJob.findOne.mockResolvedValue(null);
    ScheduledJob.create.mockResolvedValue({});

    await scheduleCartAbandonJobs('shop.myshopify.com', 'cart123', null, {
      firstItemTitle: 'Blue Shirt',
    });

    const callArgs = ScheduledJob.create.mock.calls[0][0];
    // Only the FIRST {productTitle} gets replaced — this documents
    // existing behavior (String.replace without /g flag), not
    // necessarily desired behavior. If this test ever needs to
    // change to "both replaced", that's a deliberate fix, not a
    // silent regression.
    expect(callArgs.payload.body).toBe('Blue Shirt - buy {productTitle} now!');
  });

  test('E11000 duplicate key error is swallowed, loop continues to next step', async () => {
    AutomationRule.find.mockResolvedValue([
      {
        _id: 'rule1',
        name: 'Dup Test Rule',
        steps: [
          { delayMinutes: 10, title: 'A', body: 'A', imageSource: 'none' },
          { delayMinutes: 20, title: 'B', body: 'B', imageSource: 'none' },
        ],
      },
    ]);
    CustomerPushSubscription.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ customerId: null }),
    });
    ScheduledJob.findOne.mockResolvedValue(null);

    const dupError = new Error('duplicate key');
    dupError.code = 11000;
    ScheduledJob.create
      .mockRejectedValueOnce(dupError)
      .mockResolvedValueOnce({});

    await expect(
      scheduleCartAbandonJobs('shop.myshopify.com', 'cart123', null, {})
    ).resolves.not.toThrow();

    expect(ScheduledJob.create).toHaveBeenCalledTimes(2);
  });

  test('a non-E11000 error during create() does not crash the outer function', async () => {
    AutomationRule.find.mockResolvedValue([
      { _id: 'rule1', name: 'Error Rule', steps: [{ delayMinutes: 10, title: 'A', body: 'A', imageSource: 'none' }] },
    ]);
    CustomerPushSubscription.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ customerId: null }),
    });
    ScheduledJob.findOne.mockResolvedValue(null);
    ScheduledJob.create.mockRejectedValue(new Error('some other db error'));

    await expect(
      scheduleCartAbandonJobs('shop.myshopify.com', 'cart123', null, {})
    ).resolves.not.toThrow();
  });

  test('multiple rules: one with an existing job, one without — both are evaluated independently', async () => {
    AutomationRule.find.mockResolvedValue([
      { _id: 'ruleA', name: 'Rule A', steps: [{ delayMinutes: 10, title: 'A', body: 'A', imageSource: 'none' }] },
      { _id: 'ruleB', name: 'Rule B', steps: [{ delayMinutes: 10, title: 'B', body: 'B', imageSource: 'none' }] },
    ]);
    CustomerPushSubscription.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ customerId: null }),
    });
    // Rule A already has a job; Rule B does not.
    ScheduledJob.findOne
      .mockResolvedValueOnce({ _id: 'existingForA' })
      .mockResolvedValueOnce(null);
    ScheduledJob.create.mockResolvedValue({});

    await scheduleCartAbandonJobs('shop.myshopify.com', 'cart123', null, {});

    // Only Rule B's step should have been created.
    expect(ScheduledJob.create).toHaveBeenCalledTimes(1);
    expect(ScheduledJob.create.mock.calls[0][0].ruleId).toBe('ruleB');
  });
});

describe('cancelJobsForOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns {cancelled: 0} and does not query when neither cartToken nor customerId is given', async () => {
    const result = await cancelJobsForOrder('shop.myshopify.com', null, null);

    expect(result).toEqual({ cancelled: 0 });
    expect(ScheduledJob.updateMany).not.toHaveBeenCalled();
  });

  test('queries by cartToken only when customerId is absent', async () => {
    ScheduledJob.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const result = await cancelJobsForOrder('shop.myshopify.com', 'cart123', null);

    expect(ScheduledJob.updateMany).toHaveBeenCalledWith(
      { shopDomain: 'shop.myshopify.com', status: 'pending', $or: [{ cartToken: 'cart123' }] },
      { status: 'cancelled' }
    );
    expect(result).toEqual({ cancelled: 2 });
  });

  test('queries by customerId only when cartToken is absent', async () => {
    ScheduledJob.updateMany.mockResolvedValue({ modifiedCount: 1 });

    const result = await cancelJobsForOrder('shop.myshopify.com', null, 'cust1');

    expect(ScheduledJob.updateMany).toHaveBeenCalledWith(
      { shopDomain: 'shop.myshopify.com', status: 'pending', $or: [{ customerId: 'cust1' }] },
      { status: 'cancelled' }
    );
    expect(result).toEqual({ cancelled: 1 });
  });

  test('queries by both cartToken and customerId when both are given', async () => {
    ScheduledJob.updateMany.mockResolvedValue({ modifiedCount: 3 });

    const result = await cancelJobsForOrder('shop.myshopify.com', 'cart123', 'cust1');

    expect(ScheduledJob.updateMany).toHaveBeenCalledWith(
      {
        shopDomain: 'shop.myshopify.com',
        status: 'pending',
        $or: [{ cartToken: 'cart123' }, { customerId: 'cust1' }],
      },
      { status: 'cancelled' }
    );
    expect(result).toEqual({ cancelled: 3 });
  });

  test('returns {cancelled: 0, error} when updateMany throws, does not crash', async () => {
    ScheduledJob.updateMany.mockRejectedValue(new Error('db down'));

    const result = await cancelJobsForOrder('shop.myshopify.com', 'cart123', null);

    expect(result.cancelled).toBe(0);
    expect(result.error).toBe('db down');
  });
});
