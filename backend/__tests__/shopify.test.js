// Set env BEFORE requiring the module under test — verifyHmac/
// verifyWebhookHmac read SHOPIFY_API_SECRET at call time via
// process.env, but the module itself is required once.
process.env.SHOPIFY_API_SECRET = 'test_secret_12345';

const crypto = require('crypto');
const { verifyHmac, verifyWebhookHmac } = require('../utils/shopify');

describe('verifyHmac (OAuth query string, hex digest)', () => {
  function buildValidQuery(params) {
    const message = Object.keys(params)
      .sort()
      .map((key) => `${key}=${params[key]}`)
      .join('&');
    const hmac = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
      .update(message)
      .digest('hex');
    return { ...params, hmac };
  }

  test('accepts a correctly signed query', () => {
    const query = buildValidQuery({ shop: 'test.myshopify.com', code: 'abc123', state: 'xyz' });
    expect(verifyHmac(query)).toBe(true);
  });

  test('rejects a tampered query (different shop)', () => {
    const query = buildValidQuery({ shop: 'test.myshopify.com', code: 'abc123', state: 'xyz' });
    query.shop = 'attacker.myshopify.com';
    expect(verifyHmac(query)).toBe(false);
  });

  test('rejects when hmac is missing', () => {
    expect(verifyHmac({ shop: 'test.myshopify.com', code: 'abc' })).toBe(false);
  });

  test('rejects a garbage/short hmac without throwing', () => {
    expect(() => verifyHmac({ shop: 'test.myshopify.com', hmac: 'x' })).not.toThrow();
    expect(verifyHmac({ shop: 'test.myshopify.com', hmac: 'x' })).toBe(false);
  });

  test('ignores the signature param when building the message', () => {
    const query = buildValidQuery({ shop: 'test.myshopify.com', code: 'abc' });
    query.signature = 'irrelevant';
    expect(verifyHmac(query)).toBe(true);
  });
});

describe('verifyWebhookHmac (webhook header, base64 digest)', () => {
  function signBody(rawBody) {
    return crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
      .update(rawBody, 'utf8')
      .digest('base64');
  }

  test('accepts a correctly signed webhook body', () => {
    const rawBody = JSON.stringify({ id: 123, total_price: '20.00' });
    const validHmac = signBody(rawBody);
    expect(verifyWebhookHmac(rawBody, validHmac)).toBe(true);
  });

  test('rejects a tampered body', () => {
    const rawBody = JSON.stringify({ id: 123, total_price: '20.00' });
    const validHmac = signBody(rawBody);
    const tamperedBody = JSON.stringify({ id: 123, total_price: '999.00' });
    expect(verifyWebhookHmac(tamperedBody, validHmac)).toBe(false);
  });

  test('rejects when hmacHeader is missing', () => {
    expect(verifyWebhookHmac('{"id":123}', undefined)).toBe(false);
    expect(verifyWebhookHmac('{"id":123}', '')).toBe(false);
  });

  test('rejects a garbage header without throwing', () => {
    expect(() => verifyWebhookHmac('{"id":123}', 'not-valid-base64!!!')).not.toThrow();
    expect(verifyWebhookHmac('{"id":123}', 'not-valid-base64!!!')).toBe(false);
  });

  test('rejects when rawBody is empty but header is set', () => {
    const validHmac = signBody('{"id":123}');
    expect(verifyWebhookHmac('', validHmac)).toBe(false);
  });
});
