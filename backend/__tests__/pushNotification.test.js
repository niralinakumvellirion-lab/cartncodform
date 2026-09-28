/**
 * utils/pushNotification.js — FCM 500-token batching (audits/
 * queue-notification-detail-audit.txt finding #1). mockSendEachForMulticast is
 * mocked; getApps() returns a non-empty array so the module's top-level
 * init takes the "already initialized" branch (firebaseReady = true)
 * without needing real Firebase credentials.
 */

const mockSendEachForMulticast = jest.fn();

jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  getApps: jest.fn(() => [{}]),
  cert: jest.fn(),
}));
jest.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEachForMulticast: mockSendEachForMulticast }),
}));
jest.mock('../models/CustomerPushSubscription');
jest.mock('../models/PushSubscription', () => ({ find: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../services/pushHygiene', () => ({
  handleStaleToken: jest.fn().mockResolvedValue(undefined),
  isStaleCode: (code) => code === 'messaging/registration-token-not-registered',
}));

const CustomerPushSubscription = require('../models/CustomerPushSubscription');
const { handleStaleToken } = require('../services/pushHygiene');
const { sendPushToCustomers, sendPushToStore } = require('../utils/pushNotification');

function tokensNamed(n, prefix = 't') {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`);
}
function subsFor(tokens) {
  return tokens.map((token) => ({ token }));
}
// Every response.success by default; `failIndexes` (into the FULL,
// unbatched token list) are marked stale instead — mockSendEachForMulticast
// itself only ever sees one batch's worth of tokens at a time, so this
// slices per call the same way real batching would.
function mockAllSucceedAcrossBatches(allTokens, failIndexes = new Set()) {
  mockSendEachForMulticast.mockImplementation(async ({ tokens: batchTokens }) => {
    const startIndex = allTokens.indexOf(batchTokens[0]);
    const responses = batchTokens.map((_, i) => {
      const globalIndex = startIndex + i;
      return failIndexes.has(globalIndex)
        ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
        : { success: true };
    });
    return { successCount: responses.filter((r) => r.success).length, responses };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('sendPushToCustomers — FCM 500-token batching', () => {
  test('1,200 tokens are sent in 3 batches (500 + 500 + 200) with a correct aggregate count', async () => {
    const tokens = tokensNamed(1200);
    CustomerPushSubscription.find.mockResolvedValue(subsFor(tokens));
    mockAllSucceedAcrossBatches(tokens);

    const result = await sendPushToCustomers('shop.myshopify.com', 'T', 'B', 'https://shop.myshopify.com', '');

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(3);
    const batchSizes = mockSendEachForMulticast.mock.calls.map(([m]) => m.tokens.length);
    expect(batchSizes).toEqual([500, 500, 200]);
    // Every call's tokens stay within the 500-token FCM limit.
    batchSizes.forEach((n) => expect(n).toBeLessThanOrEqual(500));
    expect(result).toEqual({ success: true, sent: 1200, tokensFound: 1200 });
  });

  test('exactly 500 tokens send in a single batch (boundary)', async () => {
    const tokens = tokensNamed(500);
    CustomerPushSubscription.find.mockResolvedValue(subsFor(tokens));
    mockAllSucceedAcrossBatches(tokens);

    const result = await sendPushToCustomers('shop.myshopify.com', 'T', 'B', 'https://shop.myshopify.com', '');

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(500);
  });

  test('501 tokens split into 2 batches (500 + 1)', async () => {
    const tokens = tokensNamed(501);
    CustomerPushSubscription.find.mockResolvedValue(subsFor(tokens));
    mockAllSucceedAcrossBatches(tokens);

    await sendPushToCustomers('shop.myshopify.com', 'T', 'B', 'https://shop.myshopify.com', '');

    const batchSizes = mockSendEachForMulticast.mock.calls.map(([m]) => m.tokens.length);
    expect(batchSizes).toEqual([500, 1]);
  });

  test('stale-token pruning still runs correctly for a token in a LATER batch', async () => {
    const tokens = tokensNamed(1200);
    CustomerPushSubscription.find.mockResolvedValue(subsFor(tokens));
    // One stale token in batch 1 (index 10), one in batch 3 (index 1150).
    mockAllSucceedAcrossBatches(tokens, new Set([10, 1150]));

    const result = await sendPushToCustomers('shop.myshopify.com', 'T', 'B', 'https://shop.myshopify.com', '');

    expect(handleStaleToken).toHaveBeenCalledTimes(2);
    expect(handleStaleToken).toHaveBeenCalledWith('t10', 'shop.myshopify.com');
    expect(handleStaleToken).toHaveBeenCalledWith('t1150', 'shop.myshopify.com');
    expect(result.sent).toBe(1198);
    expect(result.tokensFound).toBe(1200);
  });
});

describe('sendPushToStore — same batching helper', () => {
  const PushSubscription = require('../models/PushSubscription');

  test('600 owner-device tokens send in 2 batches', async () => {
    const tokens = tokensNamed(600, 'owner');
    PushSubscription.find.mockResolvedValue(subsFor(tokens));
    mockAllSucceedAcrossBatches(tokens);

    const result = await sendPushToStore('shop.myshopify.com', 'T', 'B');

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ success: true, sent: 600 });
  });
});
