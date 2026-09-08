/**
 * Tests for backend/services/pushHygiene.js.
 * CustomerPushSubscription / Profile / Store are auto-mocked.
 */

jest.mock('../models/CustomerPushSubscription');
jest.mock('../models/Profile');
jest.mock('../models/Store');

const CustomerPushSubscription = require('../models/CustomerPushSubscription');
const Profile = require('../models/Profile');
const Store = require('../models/Store');
const {
  handleStaleToken,
  checkUnopenedThreshold,
  updateDeliveredRate,
  clearPushSuppression,
} = require('../services/pushHygiene');

const SHOP = 'demo.myshopify.com';

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
  jest.clearAllMocks();
  CustomerPushSubscription.deleteMany.mockResolvedValue({ deletedCount: 1 });
  Profile.findOne.mockResolvedValue(null);
  Profile.findById.mockResolvedValue(null);
  Profile.updateOne.mockResolvedValue({});
  Store.findOne.mockResolvedValue(null);
  Store.updateOne.mockResolvedValue({});
});

describe('handleStaleToken', () => {
  test('1. deletes the CustomerPushSubscription row for the token', async () => {
    Profile.findOne.mockResolvedValue(null);
    const r = await handleStaleToken('tok', SHOP);
    expect(CustomerPushSubscription.deleteMany).toHaveBeenCalledWith({ token: 'tok' });
    expect(r).toEqual({ removed: false });
  });

  test('2. pulls the token from profile.identifiers.pushTokens', async () => {
    Profile.findOne.mockResolvedValue({
      _id: 'p1',
      identifiers: { pushTokens: ['tok', 'other'] },
    });
    const r = await handleStaleToken('tok', SHOP);
    expect(Profile.updateOne).toHaveBeenCalledWith(
      { _id: 'p1' },
      expect.objectContaining({ $pull: { 'identifiers.pushTokens': 'tok' } })
    );
    expect(r).toEqual({ removed: true });
  });

  test('3. sets channels.push.subscribed=false when that was the last token', async () => {
    Profile.findOne.mockResolvedValue({ _id: 'p1', identifiers: { pushTokens: ['tok'] } });
    await handleStaleToken('tok', SHOP);
    const update = Profile.updateOne.mock.calls[0][1];
    expect(update.$set['channels.push.subscribed']).toBe(false);
  });

  test('4. leaves subscribed alone when other tokens remain', async () => {
    Profile.findOne.mockResolvedValue({
      _id: 'p1',
      identifiers: { pushTokens: ['tok', 'keep'] },
    });
    await handleStaleToken('tok', SHOP);
    const update = Profile.updateOne.mock.calls[0][1];
    expect(update.$set).not.toHaveProperty('channels.push.subscribed');
  });
});

describe('checkUnopenedThreshold', () => {
  const OLD = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
  const RECENT = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // 1 day ago

  const subscribedProfile = (messages) => ({
    _id: 'p1',
    channels: { push: { subscribed: true } },
    messages,
  });
  const sentPush = (sentAt) => ({ channel: 'push', outcome: 'sent', sentAt });

  test('5. suppresses when >=5 sent pushes (oldest >7d), 0 clicks', async () => {
    Profile.findById.mockResolvedValue(
      subscribedProfile(Array.from({ length: 5 }, () => sentPush(OLD)))
    );
    Store.findOne.mockResolvedValue({ caps: { maxUnopenedPush: 5 } });
    const r = await checkUnopenedThreshold('p1', SHOP);
    expect(r).toEqual({ suppressed: true });
    expect(Profile.updateOne).toHaveBeenCalledWith(
      { _id: 'p1' },
      expect.objectContaining({ $set: expect.objectContaining({ 'channels.push.subscribed': false }) })
    );
  });

  test('5b. does NOT suppress when every sent push is < 7 days old', async () => {
    Profile.findById.mockResolvedValue(
      subscribedProfile(Array.from({ length: 6 }, () => sentPush(RECENT)))
    );
    Store.findOne.mockResolvedValue({ caps: { maxUnopenedPush: 5 } });
    const r = await checkUnopenedThreshold('p1', SHOP);
    expect(r).toEqual({ suppressed: false });
    expect(Profile.updateOne).not.toHaveBeenCalled();
  });

  test('6. does NOT suppress when there is at least one click', async () => {
    const msgs = Array.from({ length: 5 }, () => ({ channel: 'push', outcome: 'sent' }));
    msgs.push({ channel: 'push', outcome: 'clicked' });
    Profile.findById.mockResolvedValue(subscribedProfile(msgs));
    Store.findOne.mockResolvedValue({ caps: { maxUnopenedPush: 5 } });
    const r = await checkUnopenedThreshold('p1', SHOP);
    expect(r).toEqual({ suppressed: false });
    expect(Profile.updateOne).not.toHaveBeenCalled();
  });

  test('7. does NOT suppress when sent count is below the cap', async () => {
    Profile.findById.mockResolvedValue(
      subscribedProfile(Array.from({ length: 3 }, () => ({ channel: 'push', outcome: 'sent' })))
    );
    Store.findOne.mockResolvedValue({ caps: { maxUnopenedPush: 5 } });
    const r = await checkUnopenedThreshold('p1', SHOP);
    expect(r).toEqual({ suppressed: false });
  });

  test('8. respects a store.caps.maxUnopenedPush override', async () => {
    Profile.findById.mockResolvedValue(
      subscribedProfile(Array.from({ length: 2 }, () => sentPush(OLD)))
    );
    Store.findOne.mockResolvedValue({ caps: { maxUnopenedPush: 2 } });
    const r = await checkUnopenedThreshold('p1', SHOP);
    expect(r).toEqual({ suppressed: true });
  });
});

describe('updateDeliveredRate', () => {
  test('9. accumulates delivered + attempted and recomputes the rate', async () => {
    Store.findOne.mockResolvedValue({
      _id: 's1',
      pushStats: { deliveredLast7d: 10, attemptedLast7d: 20 },
    });
    await updateDeliveredRate(SHOP, 3, 4);
    expect(Store.updateOne).toHaveBeenCalledWith(
      { _id: 's1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          'pushStats.deliveredLast7d': 13,
          'pushStats.attemptedLast7d': 24,
          'pushStats.rateLast7d': 13 / 24,
        }),
      })
    );
  });

  test('no-op when the store is not found', async () => {
    Store.findOne.mockResolvedValue(null);
    await updateDeliveredRate(SHOP, 1, 1);
    expect(Store.updateOne).not.toHaveBeenCalled();
  });
});

describe('clearPushSuppression', () => {
  test('10. sets subscribed=true when a push token still exists', async () => {
    Profile.findById.mockResolvedValue({
      _id: 'p1',
      channels: { push: { subscribed: false } },
      identifiers: { pushTokens: ['t'] },
    });
    const r = await clearPushSuppression('p1', SHOP);
    expect(r).toEqual({ resubscribed: true });
    expect(Profile.updateOne).toHaveBeenCalledWith(
      { _id: 'p1' },
      expect.objectContaining({ $set: expect.objectContaining({ 'channels.push.subscribed': true }) })
    );
  });

  test('11. does nothing when the profile is already subscribed', async () => {
    Profile.findById.mockResolvedValue({
      _id: 'p1',
      channels: { push: { subscribed: true } },
      identifiers: { pushTokens: ['t'] },
    });
    const r = await clearPushSuppression('p1', SHOP);
    expect(r).toEqual({ resubscribed: false });
    expect(Profile.updateOne).not.toHaveBeenCalled();
  });

  test('12. does nothing when no push tokens remain', async () => {
    Profile.findById.mockResolvedValue({
      _id: 'p1',
      channels: { push: { subscribed: false } },
      identifiers: { pushTokens: [] },
    });
    const r = await clearPushSuppression('p1', SHOP);
    expect(r).toEqual({ resubscribed: false });
    expect(Profile.updateOne).not.toHaveBeenCalled();
  });
});
