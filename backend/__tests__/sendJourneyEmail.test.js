/**
 * Tests for sendJourneyEmail() in backend/routes/push.js.
 *
 * Profile + the Resend SDK are mocked. Covers the missing-field guard, the
 * shop-scoped IDOR protection (Profile.findOne is always queried with the
 * verified shopDomain, never a bare findById), the "no email on file" guard,
 * the happy path, and the Resend-failure path.
 */

jest.mock('../models/Profile', () => ({
  findOne: jest.fn(),
}));

jest.mock('../models/Store', () => ({
  findOne: jest.fn(),
}));

const mockScheduledJobCreate = jest.fn().mockResolvedValue({});
jest.mock('../models/ScheduledJob', () => ({
  create: (...args) => mockScheduledJobCreate(...args),
}));

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

const Profile = require('../models/Profile');
const Store = require('../models/Store');
const { sendJourneyEmail } = require('../routes/push');

const SHOP = 'demo.myshopify.com';

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockScheduledJobCreate.mockResolvedValue({});
  // Default store mock — sendJourneyEmail loads brand data from Store.
  Store.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({ shopName: 'Test Store', logoUrl: null, primaryColor: null }),
  });
});
afterEach(() => jest.restoreAllMocks());

test('a. missing profileId/subject/body -> 400, no DB/email call', async () => {
  const r = await sendJourneyEmail(SHOP, { profileId: null, subject: 'Hi', body: '' });

  expect(r.status).toBe(400);
  expect(r.payload.error).toBe('Missing fields');
  expect(Profile.findOne).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
});

test('b. no matching profile for this shop -> 404 (IDOR-safe: scoped by shopDomain, not findById)', async () => {
  Profile.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

  const r = await sendJourneyEmail(SHOP, { profileId: 'p1', subject: 'Hi', body: 'there' });

  expect(r.status).toBe(404);
  expect(r.payload.error).toBe('Profile not found');
  expect(Profile.findOne).toHaveBeenCalledWith({ _id: 'p1', shopDomain: SHOP });
});

test('c. profile found but no email on file -> 400 No email address', async () => {
  Profile.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      identifiers: { emails: [] },
      channels: {},
    }),
  });

  const r = await sendJourneyEmail(SHOP, { profileId: 'p1', subject: 'Hi', body: 'there' });

  expect(r.status).toBe(400);
  expect(r.payload.error).toBe('No email address');
  expect(mockSend).not.toHaveBeenCalled();
});

test('d. happy path -> sends to the profile\'s email, returns 200 + id', async () => {
  Profile.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      identifiers: { emails: ['shopper@example.com'] },
      channels: {},
    }),
  });
  mockSend.mockResolvedValue({ data: { id: 'email_123' }, error: null });

  const r = await sendJourneyEmail(SHOP, {
    profileId: 'p1', subject: 'Hello', body: 'Line one\nLine two',
  });

  expect(r.status).toBe(200);
  expect(r.payload).toEqual({ success: true, id: 'email_123' });
  expect(mockSend).toHaveBeenCalledTimes(1);
  const call = mockSend.mock.calls[0][0];
  expect(call.to).toBe('shopper@example.com');
  expect(call.subject).toBe('Hello');
  expect(call.html).toContain('Line one<br>Line two');
  expect(call.headers).toMatchObject({ 'List-Unsubscribe': expect.any(String), 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
});

test('e. channels.email.address takes priority over identifiers.emails[0]', async () => {
  Profile.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      identifiers: { emails: ['old@example.com'] },
      channels: { email: { address: 'preferred@example.com' } },
    }),
  });
  mockSend.mockResolvedValue({ data: { id: 'email_456' }, error: null });

  await sendJourneyEmail(SHOP, { profileId: 'p1', subject: 'Hi', body: 'there' });

  expect(mockSend.mock.calls[0][0].to).toBe('preferred@example.com');
});

test('f. Resend reports an error -> 500', async () => {
  Profile.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      identifiers: { emails: ['shopper@example.com'] },
      channels: {},
    }),
  });
  mockSend.mockResolvedValue({ data: null, error: { message: 'Invalid API key' } });

  const r = await sendJourneyEmail(SHOP, { profileId: 'p1', subject: 'Hi', body: 'there' });

  expect(r.status).toBe(500);
  expect(r.payload.error).toBe('Invalid API key');
});

const profileMock = (email) => ({
  _id: 'pid1',
  identifiers: { emails: [email] },
  channels: {},
});

test('g. successful send creates ScheduledJob with origin="manual"', async () => {
  Profile.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(profileMock('a@e.com')) });
  mockSend.mockResolvedValue({ data: { id: 'r1' }, error: null });

  await sendJourneyEmail(SHOP, { profileId: 'pid1', subject: 'Subj', body: 'Body' });

  expect(mockScheduledJobCreate).toHaveBeenCalledTimes(1);
  const job = mockScheduledJobCreate.mock.calls[0][0];
  expect(job.origin).toBe('manual');
  expect(job.sentBy).toBe('owner');
  expect(job.channel).toBe('email');
  expect(job.status).toBe('sent');
  expect(job.signalType).toBe('manual');
});

test('h. Resend failure creates ScheduledJob with status="failed"', async () => {
  Profile.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(profileMock('a@e.com')) });
  mockSend.mockResolvedValue({ data: null, error: { message: 'Rate limit' } });

  const r = await sendJourneyEmail(SHOP, { profileId: 'pid1', subject: 'S', body: 'B' });

  expect(r.status).toBe(500);
  expect(mockScheduledJobCreate).toHaveBeenCalledTimes(1);
  const job = mockScheduledJobCreate.mock.calls[0][0];
  expect(job.status).toBe('failed');
  expect(job.origin).toBe('manual');
});

test('j. suppressed profile -> 400, no email sent', async () => {
  Profile.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      _id: 'pid1',
      identifiers: { emails: ['shopper@example.com'] },
      channels: {},
      suppressed: true,
    }),
  });

  const r = await sendJourneyEmail(SHOP, { profileId: 'pid1', subject: 'Hi', body: 'there' });

  expect(r.status).toBe(400);
  expect(r.payload.error).toMatch(/suppressed/i);
  expect(mockSend).not.toHaveBeenCalled();
});

test('i. ScheduledJob logging failure does not fail the send', async () => {
  Profile.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(profileMock('a@e.com')) });
  mockSend.mockResolvedValue({ data: { id: 'r2' }, error: null });
  mockScheduledJobCreate.mockRejectedValue(new Error('Mongo write error'));

  const r = await sendJourneyEmail(SHOP, { profileId: 'pid1', subject: 'S', body: 'B' });

  expect(r.status).toBe(200);
  expect(console.error).toHaveBeenCalled();
});
