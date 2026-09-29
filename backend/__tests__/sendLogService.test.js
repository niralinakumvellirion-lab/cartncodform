/**
 * services/sendLogService.js — per-recipient send log for broadcast pushes
 * (audits/queue-notification-detail-audit.txt finding #2). ScheduledJob is
 * auto-mocked.
 */

jest.mock('../models/ScheduledJob');

const ScheduledJob = require('../models/ScheduledJob');
const { logBroadcastSend } = require('../services/sendLogService');

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

function recipient(overrides = {}) {
  return {
    token: 't1',
    customerId: null,
    cartToken: null,
    sessionId: null,
    success: true,
    errorCode: null,
    ...overrides,
  };
}

test('a 3-token festival send writes 3 rows with the right fields', async () => {
  ScheduledJob.insertMany.mockResolvedValue([]);

  await logBroadcastSend({
    shopDomain: 'shop.myshopify.com',
    festivalQueueId: 'fq1',
    signalType: 'festival',
    title: 'Diwali Sale',
    body: '20% off everything',
    imageUrl: 'https://cdn.example/img.png',
    recipients: [
      recipient({ token: 't1', customerId: 'c1' }),
      recipient({ token: 't2', cartToken: 'cart-2' }),
      recipient({ token: 't3', sessionId: 'sess-3' }),
    ],
  });

  expect(ScheduledJob.insertMany).toHaveBeenCalledTimes(1);
  const [rows] = ScheduledJob.insertMany.mock.calls[0];
  expect(rows).toHaveLength(3);

  expect(rows[0]).toMatchObject({
    shopDomain: 'shop.myshopify.com',
    festivalQueueId: 'fq1',
    signalType: 'festival',
    channel: 'push',
    status: 'sent',
    subscriptionToken: 't1',
    customerId: 'c1',
    cartToken: null,
    sessionId: null,
    outcome: 'delivered',
    payload: { title: 'Diwali Sale', body: '20% off everything', imageUrl: 'https://cdn.example/img.png' },
  });
  expect(rows[0].runAt).toBeInstanceOf(Date);
  expect(rows[0].sentAt).toBeInstanceOf(Date);

  expect(rows[1]).toMatchObject({ subscriptionToken: 't2', cartToken: 'cart-2', outcome: 'delivered' });
  expect(rows[2]).toMatchObject({ subscriptionToken: 't3', sessionId: 'sess-3', outcome: 'delivered' });
});

test('a failed token writes outcome "failed"', async () => {
  ScheduledJob.insertMany.mockResolvedValue([]);

  await logBroadcastSend({
    shopDomain: 'shop.myshopify.com',
    festivalQueueId: null,
    signalType: 'manual',
    title: 'T',
    body: 'B',
    recipients: [
      recipient({ token: 'good' }),
      recipient({ token: 'bad', success: false, errorCode: 'messaging/registration-token-not-registered' }),
    ],
  });

  const [rows] = ScheduledJob.insertMany.mock.calls[0];
  expect(rows.find((r) => r.subscriptionToken === 'good').outcome).toBe('delivered');
  expect(rows.find((r) => r.subscriptionToken === 'bad').outcome).toBe('failed');
});

test('festivalQueueId is null for a manual send-store broadcast', async () => {
  ScheduledJob.insertMany.mockResolvedValue([]);

  await logBroadcastSend({
    shopDomain: 'shop.myshopify.com',
    signalType: 'manual',
    title: 'T',
    body: 'B',
    recipients: [recipient()],
  });

  const [rows] = ScheduledJob.insertMany.mock.calls[0];
  expect(rows[0].festivalQueueId).toBeNull();
});

test('a logging failure does not throw — the send already happened', async () => {
  ScheduledJob.insertMany.mockRejectedValue(new Error('Mongo write error'));

  await expect(logBroadcastSend({
    shopDomain: 'shop.myshopify.com',
    signalType: 'festival',
    title: 'T',
    body: 'B',
    recipients: [recipient()],
  })).resolves.toBeUndefined();

  expect(console.error).toHaveBeenCalled();
});

test('no-op when recipients is empty or missing', async () => {
  await logBroadcastSend({ shopDomain: 'shop.myshopify.com', signalType: 'manual', title: 'T', body: 'B', recipients: [] });
  await logBroadcastSend({ shopDomain: 'shop.myshopify.com', signalType: 'manual', title: 'T', body: 'B' });

  expect(ScheduledJob.insertMany).not.toHaveBeenCalled();
});

test('batches inserts past 500 recipients', async () => {
  ScheduledJob.insertMany.mockResolvedValue([]);
  const recipients = Array.from({ length: 1200 }, (_, i) => recipient({ token: `t${i}` }));

  await logBroadcastSend({
    shopDomain: 'shop.myshopify.com',
    signalType: 'festival',
    title: 'T',
    body: 'B',
    recipients,
  });

  expect(ScheduledJob.insertMany).toHaveBeenCalledTimes(3);
  const batchSizes = ScheduledJob.insertMany.mock.calls.map(([rows]) => rows.length);
  expect(batchSizes).toEqual([500, 500, 200]);
});
