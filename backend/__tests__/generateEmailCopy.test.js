/**
 * Tests for generateEmailCopy() in backend/services/aiService.js.
 *
 * global.fetch is stubbed; CopyCache is partially mocked (real buildCacheKey,
 * mocked findOne/create) — same setup as aiService.test.js. Covers the cache
 * hit/miss paths, the template fallback (known + unknown signal types), the
 * API-failure fallback, and that the cache key is scoped per shopDomain (the
 * fix that makes this function safe to call per-customer without hitting the
 * LLM per-customer — see the comment above generateEmailCopy in the source).
 */

jest.mock('../models/CopyCache', () => {
  const actual = jest.requireActual('../models/CopyCache');
  return {
    findOne: jest.fn(),
    create: jest.fn(),
    buildCacheKey: actual.buildCacheKey,
  };
});

const CopyCache = require('../models/CopyCache');
const { generateEmailCopy } = require('../services/aiService');

const VOICE = { tone: 'warm', signOff: '' };

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

function anthropicOk(text) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ content: [{ text }], usage: { input_tokens: 10 } }),
  });
}

test('1. returns cached copy on a cache hit (no API call)', async () => {
  CopyCache.findOne.mockResolvedValue({ subject: 'Cached S', body: 'Cached B' });
  const r = await generateEmailCopy('demo.myshopify.com', { type: 'cart_abandon' }, VOICE, {});
  expect(r).toEqual({ subject: 'Cached S', body: 'Cached B' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('2. calls the Anthropic API on a cache miss and caches the result', async () => {
  global.fetch.mockReturnValue(anthropicOk('{"subject":"AI S","body":"AI B"}'));
  const r = await generateEmailCopy('demo.myshopify.com', { type: 'cart_abandon' }, VOICE, {});
  expect(r).toEqual({ subject: 'AI S', body: 'AI B' });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(CopyCache.create).toHaveBeenCalledWith(
    expect.objectContaining({
      shopDomain: 'demo.myshopify.com',
      signalType: 'cart_abandon',
      channel: 'email-marketing',
      subject: 'AI S',
      body: 'AI B',
    })
  );
});

test('3. returns the signal-specific template when LLM_API_KEY is unset', async () => {
  delete process.env.LLM_API_KEY;
  const r = await generateEmailCopy('demo.myshopify.com', { type: 'winback' }, VOICE, {});
  expect(r.subject).toBe('A special message for you');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('4. unknown signal type falls back to the lapsing template', async () => {
  delete process.env.LLM_API_KEY;
  const r = await generateEmailCopy('demo.myshopify.com', { type: 'browse_abandon' }, VOICE, {});
  expect(r.subject).toBe('We miss you!');
});

test('5. returns template fallback when the API call throws', async () => {
  global.fetch.mockRejectedValue(new Error('network down'));
  const r = await generateEmailCopy('demo.myshopify.com', { type: 'lapsing' }, VOICE, {});
  expect(r.subject).toBe('We miss you!');
});

test('6. cache key is scoped per shopDomain — two shops never share a cache entry', () => {
  const { buildCacheKey } = jest.requireActual('../models/CopyCache');
  const crypto = require('crypto');
  const vh = crypto.createHash('md5').update(JSON.stringify(VOICE)).digest('hex');
  const keyShopA = buildCacheKey('shop-a.myshopify.com', 'cart_abandon', null, 'email-marketing', vh);
  const keyShopB = buildCacheKey('shop-b.myshopify.com', 'cart_abandon', null, 'email-marketing', vh);
  expect(keyShopA).not.toBe(keyShopB);
});
