/**
 * Tests for sendMarketingEmail() in backend/utils/email.js.
 *
 * The Resend SDK is mocked. Covers the missing-key skip guard, the
 * invalid-email skip guard, the happy path (reusing the module's one shared
 * Resend client, never constructing a second one), and the Resend-failure
 * throw path.
 */

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

let savedKey;
beforeAll(() => {
  savedKey = process.env.RESEND_API_KEY;
});
afterAll(() => {
  if (savedKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = savedKey;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  process.env.RESEND_API_KEY = 'test-key';
});
afterEach(() => jest.restoreAllMocks());

// Re-require fresh each test since email.js reads process.env.RESEND_API_KEY
// once at module load to build its shared client — jest.resetModules keeps
// that read in sync with the env var set above.
function loadEmail() {
  jest.resetModules();
  return require('../utils/email');
}

test('a. RESEND_API_KEY unset -> skipped, no send attempted', async () => {
  delete process.env.RESEND_API_KEY;
  const { sendMarketingEmail } = loadEmail();

  const r = await sendMarketingEmail('shopper@example.com', 'Hi', 'Body', 'demo.myshopify.com');

  expect(r).toEqual({ skipped: true });
  expect(mockSend).not.toHaveBeenCalled();
});

test('b. invalid email address -> skipped, no send attempted', async () => {
  const { sendMarketingEmail } = loadEmail();

  const r = await sendMarketingEmail('not-an-email', 'Hi', 'Body', 'demo.myshopify.com');

  expect(r).toEqual({ skipped: true });
  expect(mockSend).not.toHaveBeenCalled();
});

test('c. happy path -> sends via the shared client, returns success + id', async () => {
  const { sendMarketingEmail } = loadEmail();
  mockSend.mockResolvedValue({ data: { id: 'email_789' }, error: null });

  const r = await sendMarketingEmail(
    'shopper@example.com', 'Hello', 'Some <b>body</b>', 'demo.myshopify.com'
  );

  expect(r).toEqual({ success: true, id: 'email_789' });
  expect(mockSend).toHaveBeenCalledTimes(1);
  const call = mockSend.mock.calls[0][0];
  expect(call.to).toBe('shopper@example.com');
  expect(call.subject).toBe('Hello');
  expect(call.html).toContain('Some <b>body</b>');
  expect(call.html).toContain('demo.myshopify.com');
});

test('d. Resend reports an error -> throws', async () => {
  const { sendMarketingEmail } = loadEmail();
  mockSend.mockResolvedValue({ data: null, error: { message: 'Invalid API key' } });

  await expect(
    sendMarketingEmail('shopper@example.com', 'Hi', 'Body', 'demo.myshopify.com')
  ).rejects.toThrow('Invalid API key');
});
