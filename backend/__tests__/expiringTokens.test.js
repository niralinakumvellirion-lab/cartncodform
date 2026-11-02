process.env.SHOPIFY_API_KEY = 'test_key';
process.env.SHOPIFY_API_SECRET = 'test_secret';

jest.mock('axios');
jest.mock('../models/Store');

const axios = require('axios');
const Store = require('../models/Store');
const {
  exchangeCodeForToken,
  exchangeSessionToken,
  refreshAccessTokenIfNeeded,
} = require('../utils/shopify');

const SHOP = 'tok-shop.myshopify.com';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function tokenResponse(over = {}) {
  return {
    data: {
      access_token: 'new-access',
      expires_in: 3600,
      refresh_token: 'new-refresh',
      refresh_token_expires_in: 90 * 24 * 3600,
      ...over,
    },
  };
}

function formOf(callIndex = 0) {
  return new URLSearchParams(axios.post.mock.calls[callIndex][1]);
}

function savedSet() {
  return Store.updateOne.mock.calls.find(([, upd]) => upd.$set && upd.$set.accessToken)[1].$set;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  Store.updateOne.mockResolvedValue({});
});

afterEach(() => jest.restoreAllMocks());

describe('token requests', () => {
  test('authorization-code exchange asks for an expiring token (form-encoded)', async () => {
    axios.post.mockResolvedValue(tokenResponse());
    await exchangeCodeForToken(SHOP, 'the-code');
    const [url, , cfg] = axios.post.mock.calls[0];
    expect(url).toBe(`https://${SHOP}/admin/oauth/access_token`);
    expect(cfg.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const f = formOf();
    expect(f.get('code')).toBe('the-code');
    expect(f.get('expiring')).toBe('1');
    expect(f.get('client_id')).toBe('test_key');
  });

  test('session-token exchange asks for an expiring OFFLINE token and parses the pair', async () => {
    axios.post.mockResolvedValue(tokenResponse());
    const pair = await exchangeSessionToken(SHOP, 'session-jwt');
    const f = formOf();
    expect(f.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:token-exchange');
    expect(f.get('subject_token')).toBe('session-jwt');
    expect(f.get('requested_token_type')).toBe('urn:shopify:params:oauth:token-type:offline-access-token');
    expect(f.get('expiring')).toBe('1');
    expect(pair.accessToken).toBe('new-access');
    expect(pair.refreshToken).toBe('new-refresh');
    expect(pair.accessTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(pair.refreshTokenExpiresAt.getTime()).toBeGreaterThan(Date.now() + 80 * DAY);
  });
});

describe('refreshAccessTokenIfNeeded', () => {
  test('valid expiring token → returned, no network, nothing saved', async () => {
    const store = { shopDomain: SHOP, accessToken: 'live', accessTokenExpiresAt: new Date(Date.now() + HOUR) };
    expect(await refreshAccessTokenIfNeeded(store)).toBe('live');
    expect(axios.post).not.toHaveBeenCalled();
    expect(Store.updateOne).not.toHaveBeenCalled();
  });

  test('expired token + refresh token → refresh grant, new pair saved and returned', async () => {
    axios.post.mockResolvedValue(tokenResponse());
    const store = {
      shopDomain: SHOP, accessToken: 'old', accessTokenExpiresAt: new Date(Date.now() - HOUR),
      refreshToken: 'old-refresh', refreshTokenExpiresAt: new Date(Date.now() + 30 * DAY),
    };
    expect(await refreshAccessTokenIfNeeded(store)).toBe('new-access');
    const f = formOf();
    expect(f.get('grant_type')).toBe('refresh_token');
    expect(f.get('refresh_token')).toBe('old-refresh');
    const saved = savedSet();
    expect(saved.accessToken).toBe('new-access');
    expect(saved.refreshToken).toBe('new-refresh');
    expect(saved.needsReauth).toBe(false);
  });

  test('token expiring in under 5 minutes is refreshed too', async () => {
    axios.post.mockResolvedValue(tokenResponse());
    const store = {
      shopDomain: SHOP, accessToken: 'old', accessTokenExpiresAt: new Date(Date.now() + 60 * 1000),
      refreshToken: 'r',
    };
    expect(await refreshAccessTokenIfNeeded(store)).toBe('new-access');
  });

  test('refresh gets 401 → refresh token cleared, session token mints a new pair', async () => {
    axios.post
      .mockRejectedValueOnce({ message: 'x', response: { status: 401, data: { error: 'invalid_request' } } })
      .mockResolvedValueOnce(tokenResponse({ access_token: 'from-session' }));
    const store = {
      shopDomain: SHOP, accessToken: 'old', accessTokenExpiresAt: new Date(Date.now() - HOUR),
      refreshToken: 'dead',
    };
    expect(await refreshAccessTokenIfNeeded(store, { sessionToken: 'jwt' })).toBe('from-session');
    expect(Store.updateOne).toHaveBeenCalledWith(
      { shopDomain: SHOP },
      { $set: { refreshToken: null, refreshTokenExpiresAt: null } }
    );
    expect(formOf(1).get('subject_token')).toBe('jwt');
  });

  test('expired + no refresh token + session token → exchange mints a new pair', async () => {
    axios.post.mockResolvedValue(tokenResponse({ access_token: 'minted' }));
    const store = { shopDomain: SHOP, accessToken: 'old', accessTokenExpiresAt: new Date(Date.now() - HOUR) };
    expect(await refreshAccessTokenIfNeeded(store, { sessionToken: 'jwt' })).toBe('minted');
    expect(savedSet().accessToken).toBe('minted');
  });

  test('legacy non-expiring token → migrated once with the old token as subject', async () => {
    axios.post.mockResolvedValue(tokenResponse({ access_token: 'migrated' }));
    const store = { shopDomain: SHOP, accessToken: 'shpat_legacy' };
    expect(await refreshAccessTokenIfNeeded(store)).toBe('migrated');
    const f = formOf();
    expect(f.get('subject_token')).toBe('shpat_legacy');
    expect(f.get('subject_token_type')).toBe('urn:shopify:params:oauth:token-type:offline-access-token');
    expect(f.get('expiring')).toBe('1');
    expect(savedSet().accessToken).toBe('migrated');
    expect(savedSet().refreshToken).toBe('new-refresh');
  });

  test('legacy migration rejected → falls back to a valid online token', async () => {
    axios.post.mockRejectedValue({ message: 'bad', response: { status: 400, data: { error: 'invalid_subject_token' } } });
    const store = {
      shopDomain: SHOP, accessToken: 'shpat_legacy',
      onlineAccessToken: 'shpua_online', onlineTokenExpiresAt: new Date(Date.now() + HOUR),
    };
    expect(await refreshAccessTokenIfNeeded(store)).toBe('shpua_online');
  });

  test('nothing usable and expiry known past → needsReauth flagged, stored token returned', async () => {
    const store = { shopDomain: SHOP, accessToken: 'old', accessTokenExpiresAt: new Date(Date.now() - HOUR) };
    expect(await refreshAccessTokenIfNeeded(store)).toBe('old');
    expect(Store.updateOne).toHaveBeenCalledWith({ shopDomain: SHOP }, { $set: { needsReauth: true } });
  });

  test('two concurrent calls for one shop → a single refresh request', async () => {
    let release;
    axios.post.mockImplementation(() => new Promise((r) => { release = () => r(tokenResponse()); }));
    const store = {
      shopDomain: SHOP, accessToken: 'old', accessTokenExpiresAt: new Date(Date.now() - HOUR), refreshToken: 'r',
    };
    const a = refreshAccessTokenIfNeeded(store);
    const b = refreshAccessTokenIfNeeded(store);
    await new Promise((r) => setImmediate(r));
    release();
    expect(await a).toBe('new-access');
    expect(await b).toBe('new-access');
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('token values are never written to the console', async () => {
    axios.post.mockRejectedValue({ message: 'boom', response: { status: 500, data: {} } });
    const store = { shopDomain: SHOP, accessToken: 'SECRET-OLD', accessTokenExpiresAt: new Date(Date.now() - HOUR), refreshToken: 'SECRET-REFRESH' };
    await refreshAccessTokenIfNeeded(store, { sessionToken: 'SECRET-JWT' });
    const logged = JSON.stringify([...console.warn.mock.calls, ...console.log.mock.calls]);
    expect(logged).not.toMatch(/SECRET/);
  });
});
