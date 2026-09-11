/**
 * Tests for sendJourneyPush() in backend/routes/push.js.
 *
 * Profile + sendPushToCustomers are mocked. Covers the missing-field guard,
 * the "no subscription" guard, the happy path, the Firebase-failure path,
 * and the shop-scoped IDOR protection (Profile.findOne is always queried
 * with the verified req.shopDomain, never a client-supplied one).
 */

jest.mock('../models/Profile', () => ({
  findOne: jest.fn(),
}));
jest.mock('../utils/pushNotification', () => ({
  sendPushToStore: jest.fn(),
  sendPushToCustomers: jest.fn(),
}));

const Profile = require('../models/Profile');
const { sendPushToCustomers } = require('../utils/pushNotification');
const { sendJourneyPush } = require('../routes/push');

const SHOP = 'demo.myshopify.com';

beforeEach(() => {
  jest.clearAllMocks();
});

test('a. missing profileId/title/body -> 400, no DB/push call', async () => {
  const r = await sendJourneyPush(SHOP, { profileId: null, title: 'Hi', body: '' });

  expect(r.status).toBe(400);
  expect(Profile.findOne).not.toHaveBeenCalled();
  expect(sendPushToCustomers).not.toHaveBeenCalled();
});

test('b. no matching profile for this shop -> 400 No push subscription (IDOR-safe)', async () => {
  Profile.findOne.mockResolvedValue(null);

  const r = await sendJourneyPush(SHOP, { profileId: 'p1', title: 'Hi', body: 'there' });

  expect(r.status).toBe(400);
  expect(r.payload.error).toBe('No push subscription');
  expect(Profile.findOne).toHaveBeenCalledWith({ _id: 'p1', shopDomain: SHOP });
});

test('c. profile found but not push-subscribed -> 400 No push subscription', async () => {
  Profile.findOne.mockResolvedValue({
    _id: 'p1',
    channels: { push: { subscribed: false } },
    identifiers: { cartTokens: [] },
  });

  const r = await sendJourneyPush(SHOP, { profileId: 'p1', title: 'Hi', body: 'there' });

  expect(r.status).toBe(400);
  expect(r.payload.error).toBe('No push subscription');
  expect(sendPushToCustomers).not.toHaveBeenCalled();
});

test('d. happy path -> sends via the profile\'s first cartToken, returns 200 + result', async () => {
  Profile.findOne.mockResolvedValue({
    _id: 'p1',
    channels: { push: { subscribed: true } },
    identifiers: { cartTokens: ['cart-123'] },
  });
  sendPushToCustomers.mockResolvedValue({ success: true, sent: 1 });

  const r = await sendJourneyPush(SHOP, {
    profileId: 'p1', title: 'Hi', body: 'there', url: 'https://demo.myshopify.com',
  });

  expect(r.status).toBe(200);
  expect(r.payload).toEqual({ success: true, sent: 1 });
  expect(sendPushToCustomers).toHaveBeenCalledWith(
    SHOP, 'Hi', 'there', 'https://demo.myshopify.com', null, false, 'cart-123'
  );
});

test('e. sendPushToCustomers reports failure -> 500', async () => {
  Profile.findOne.mockResolvedValue({
    _id: 'p1',
    channels: { push: { subscribed: true } },
    identifiers: { cartTokens: [] },
  });
  sendPushToCustomers.mockResolvedValue({ success: false, error: 'Firebase Admin not configured' });

  const r = await sendJourneyPush(SHOP, { profileId: 'p1', title: 'Hi', body: 'there' });

  expect(r.status).toBe(500);
  expect(r.payload.error).toBe('Firebase Admin not configured');
});
