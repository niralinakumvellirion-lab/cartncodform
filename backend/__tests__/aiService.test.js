/**
 * Tests for backend/services/aiService.js.
 *
 * global.fetch is stubbed; CopyCache is partially mocked (real buildCacheKey,
 * mocked findOne/create). LLM_API_KEY is set/cleared per test.
 */

jest.mock('../models/CopyCache', () => {
  const actual = jest.requireActual('../models/CopyCache');
  return {
    findOne: jest.fn(),
    create: jest.fn(),
    buildCacheKey: actual.buildCacheKey,
  };
});

const crypto = require('crypto');
const CopyCache = require('../models/CopyCache');
const { generateCopy, generateWeeklyNarrative } = require('../services/aiService');

const STORE = {
  shopDomain: 'demo.myshopify.com',
  voice: { tone: 'warm', emoji: true, lang: 'en', signOff: '' },
};
const PRODUCT = { title: 'Silk Saree', price: 2999, productId: '42' };

let savedKey;
beforeAll(() => {
  savedKey = process.env.LLM_API_KEY;
});
afterAll(() => {
  if (savedKey === undefined) delete process.env.LLM_API_KEY;
  else process.env.LLM_API_KEY = savedKey;
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  global.fetch = jest.fn();
  CopyCache.findOne.mockResolvedValue(null);
  CopyCache.create.mockResolvedValue({});
  process.env.LLM_API_KEY = 'test-key';
});
afterEach(() => jest.restoreAllMocks());

function anthropicOk(text, tokens = 10) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ content: [{ text }], usage: { input_tokens: tokens } }),
  });
}

test('1. returns cached copy on a cache hit (no API call)', async () => {
  CopyCache.findOne.mockResolvedValue({ title: 'Cached T', body: 'Cached B', subject: '' });
  const r = await generateCopy(STORE, 'cart_abandon', PRODUCT, 'push');
  expect(r).toEqual({ title: 'Cached T', body: 'Cached B', subject: '' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('2. calls the Anthropic API on a cache miss', async () => {
  global.fetch.mockReturnValue(anthropicOk('{"title":"AI T","body":"AI B"}'));
  const r = await generateCopy(STORE, 'cart_abandon', PRODUCT, 'push');
  expect(r.title).toBe('AI T');
  expect(r.body).toBe('AI B');
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [url, opts] = global.fetch.mock.calls[0];
  expect(url).toBe('https://api.anthropic.com/v1/messages');
  expect(opts.headers['x-api-key']).toBe('test-key');
  expect(opts.headers['anthropic-version']).toBe('2023-06-01');
});

test('3. returns fallback copy when LLM_API_KEY is not set', async () => {
  delete process.env.LLM_API_KEY;
  const r = await generateCopy(STORE, 'cart_abandon', PRODUCT, 'push');
  expect(r.title).toBe('You left something behind');
  expect(r.body).toBe('Come back and complete your order.');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('4. returns fallback copy when the API call throws', async () => {
  global.fetch.mockRejectedValue(new Error('network down'));
  const r = await generateCopy(STORE, 'cart_abandon', PRODUCT, 'email');
  expect(r.subject).toBe('We saved your cart');
  expect(r.body).toMatch(/left items in your cart/);
});

test('5. strips markdown fences before parsing JSON', async () => {
  global.fetch.mockReturnValue(anthropicOk('```json\n{"title":"Fenced","body":"B"}\n```'));
  const r = await generateCopy(STORE, 'cart_abandon', PRODUCT, 'push');
  expect(r.title).toBe('Fenced');
});

test('6. saves the generated copy to CopyCache', async () => {
  global.fetch.mockReturnValue(anthropicOk('{"title":"T","body":"B"}', 33));
  await generateCopy(STORE, 'cart_abandon', PRODUCT, 'push');
  expect(CopyCache.create).toHaveBeenCalledWith(
    expect.objectContaining({
      cacheKey: expect.any(String),
      signalType: 'cart_abandon',
      channel: 'push',
      body: 'B',
      promptTokens: 33,
      expiresAt: expect.any(Date),
    })
  );
});

test('7. generateWeeklyNarrative returns a rule-based string without an API key', async () => {
  delete process.env.LLM_API_KEY;
  const stats = {
    messagesSent: 12,
    profilesLookedAt: 340,
    conversions: 5,
    revenueRecovered: 8000,
  };
  const n = await generateWeeklyNarrative('demo.myshopify.com', stats);
  expect(n).toContain('12 messages');
  expect(n).toContain('340');
  expect(n).toContain('5 conversions');
  expect(n).toContain('8000');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('8. cache key differs for different store voices (voiceHash)', () => {
  const { buildCacheKey } = jest.requireActual('../models/CopyCache');
  const vh = (v) => crypto.createHash('md5').update(JSON.stringify(v)).digest('hex');
  const keyWarm = buildCacheKey('s', 'cart_abandon', '1', 'push', vh({ tone: 'warm' }));
  const keyPlayful = buildCacheKey('s', 'cart_abandon', '1', 'push', vh({ tone: 'playful' }));
  expect(keyWarm).not.toBe(keyPlayful);
});
