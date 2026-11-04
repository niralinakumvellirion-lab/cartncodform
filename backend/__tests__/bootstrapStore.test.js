'use strict';

/**
 * utils/bootstrapStore.js — Store set-up from an App Bridge session token (managed install),
 * against a real in-memory MongoDB. Only the calls to Shopify are replaced.
 */

jest.mock('../utils/shopify', () => ({
  exchangeSessionToken: jest.fn(),
  fetchShopInfo: jest.fn(),
  fetchBrandData: jest.fn(),
}));

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Store = require('../models/Store');
const shopify = require('../utils/shopify');
const { bootstrapStore } = require('../utils/bootstrapStore');

const SHOP = 'review-shop.myshopify.com';
let mongod;

const pair = (over = {}) => ({
  accessToken: 'shpat_new',
  accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000),
  refreshToken: 'shprt_new',
  refreshTokenExpiresAt: new Date(Date.now() + 90 * 86400 * 1000),
  ...over,
});

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Store.init();
}, 60000); // starting the in-memory database can be slow when every suite runs at once

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Store.deleteMany({});
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  shopify.exchangeSessionToken.mockResolvedValue(pair());
  shopify.fetchShopInfo.mockResolvedValue({ email: 'owner@example.com', ianaTimezone: 'America/New_York', shopName: 'Review Shop' });
  shopify.fetchBrandData.mockResolvedValue({ logoUrl: 'https://cdn/x.png', primaryColor: '#112233' });
});

afterEach(() => jest.restoreAllMocks());

describe('a shop Shopify installed by itself (no Store yet)', () => {
  it('creates the Store with tokens, owner, name, timezone and brand', async () => {
    const store = await bootstrapStore(SHOP, 'session-token');
    expect(shopify.exchangeSessionToken).toHaveBeenCalledWith(SHOP, 'session-token');
    expect(store).toMatchObject({
      shopDomain: SHOP, accessToken: 'shpat_new', refreshToken: 'shprt_new',
      ownerEmail: 'owner@example.com', shopName: 'Review Shop', timezone: 'America/New_York',
      logoUrl: 'https://cdn/x.png', primaryColor: '#112233', needsReauth: false,
    });
    expect(await Store.countDocuments({ shopDomain: SHOP })).toBe(1);
  });

  it('a new store has no paid plan, so the free-trial screen still applies', async () => {
    const store = await bootstrapStore(SHOP, 'session-token');
    expect(store.plan).not.toBe('pro');
  });

  it('keeps the default timezone when Shopify sends one we do not recognise, or none', async () => {
    shopify.fetchShopInfo.mockResolvedValue({ email: null, ianaTimezone: 'Mars/Olympus', shopName: null });
    const store = await bootstrapStore(SHOP, 't');
    expect(store.timezone).toBe('Asia/Kolkata');
    expect(store.ownerEmail == null).toBe(true);
  });

  it('still creates the Store when the shop-info lookup returns nothing', async () => {
    shopify.fetchShopInfo.mockResolvedValue({ email: null, ianaTimezone: null, shopName: null });
    shopify.fetchBrandData.mockResolvedValue({ logoUrl: null, primaryColor: null });
    expect(await bootstrapStore(SHOP, 't')).toMatchObject({ shopDomain: SHOP, accessToken: 'shpat_new' });
  });

  it('several requests at once cause ONE token exchange and one Store', async () => {
    let release;
    shopify.exchangeSessionToken.mockImplementation(() => new Promise((resolve) => { release = () => resolve(pair()); }));
    const calls = [bootstrapStore(SHOP, 't'), bootstrapStore(SHOP, 't'), bootstrapStore(SHOP, 't')];
    await new Promise((r) => setTimeout(r, 20));
    release();
    const results = await Promise.all(calls);
    expect(shopify.exchangeSessionToken).toHaveBeenCalledTimes(1);
    expect(results.every((s) => s && s.shopDomain === SHOP)).toBe(true);
    expect(await Store.countDocuments()).toBe(1);
  });

  it('returns null and creates nothing when Shopify refuses the token exchange', async () => {
    shopify.exchangeSessionToken.mockRejectedValue(Object.assign(new Error('bad'), { response: { status: 400, data: { error: 'invalid_subject_token' } } }));
    expect(await bootstrapStore(SHOP, 'expired')).toBeNull();
    expect(await Store.countDocuments()).toBe(0);
  });

  it('returns null and creates nothing when Shopify answers without an access token', async () => {
    shopify.exchangeSessionToken.mockResolvedValue({ accessToken: null });
    expect(await bootstrapStore(SHOP, 't')).toBeNull();
    expect(await Store.countDocuments()).toBe(0);
    shopify.exchangeSessionToken.mockResolvedValue(undefined);
    expect(await bootstrapStore(SHOP, 't')).toBeNull();
  });

  it('returns null without calling Shopify when there is no shop or token', async () => {
    expect(await bootstrapStore('', 't')).toBeNull();
    expect(await bootstrapStore(SHOP, '')).toBeNull();
    expect(shopify.exchangeSessionToken).not.toHaveBeenCalled();
  });

  it('does not log the session token or the new access token', async () => {
    shopify.exchangeSessionToken.mockRejectedValue(new Error('nope'));
    await bootstrapStore(SHOP, 'SECRET-SESSION-TOKEN');
    shopify.exchangeSessionToken.mockResolvedValue(pair({ accessToken: 'shpat_SECRET' }));
    await Store.deleteMany({});
    await bootstrapStore(SHOP, 'SECRET-SESSION-TOKEN');
    const logged = [console.log, console.warn, console.error].flatMap((f) => f.mock.calls).flat().join(' ');
    expect(logged).not.toContain('SECRET');
  });
});

describe('a shop that already has a Store', () => {
  it('is returned as is, with no call to Shopify', async () => {
    await Store.create({ shopDomain: SHOP, accessToken: 'old', plan: 'pro', timezone: 'Asia/Dubai' });
    const store = await bootstrapStore(SHOP, 't');
    expect(store.accessToken).toBe('old');
    expect(shopify.exchangeSessionToken).not.toHaveBeenCalled();
  });
});

describe('a shop that uninstalled and installed again', () => {
  beforeEach(() => Store.create({
    shopDomain: SHOP, accessToken: 'revoked', refreshToken: 'revoked-r', plan: 'free', subscriptionStatus: 'uninstalled',
    timezone: 'Asia/Dubai', ownerEmail: 'kept@example.com', needsReauth: true,
  }));

  it('gets fresh tokens and loses the uninstalled flag, keeping its settings', async () => {
    const store = await bootstrapStore(SHOP, 't');
    expect(store).toMatchObject({ accessToken: 'shpat_new', refreshToken: 'shprt_new', needsReauth: false, timezone: 'Asia/Dubai', ownerEmail: 'kept@example.com' });
    expect(store.subscriptionStatus == null).toBe(true);
    expect(await Store.countDocuments()).toBe(1);
  });

  it('a paid plan from before the uninstall is not kept (Shopify ends it): Free, re-checked, plan asked again', async () => {
    const chosen = new Date(Date.now() - 86400000);
    await Store.updateOne({ shopDomain: SHOP }, { plan: 'pro', planTier: 'growth', planCheckedAt: chosen, planChosenAt: chosen });
    const store = await bootstrapStore(SHOP, 't');
    expect(store).toMatchObject({ plan: 'free', planTier: null, planCheckedAt: null });
    expect(store.installedAt.getTime()).toBeGreaterThan(chosen.getTime());
    expect(require('../utils/plans').needsPlanChoice(store)).toBe(true);
  });

  it('does not overwrite owner, timezone or brand from Shopify', async () => {
    await bootstrapStore(SHOP, 't');
    expect(shopify.fetchShopInfo).not.toHaveBeenCalled();
  });

  it('keeps the old Store when the exchange fails', async () => {
    shopify.exchangeSessionToken.mockRejectedValue(new Error('down'));
    expect(await bootstrapStore(SHOP, 't')).toBeNull();
    expect((await Store.findOne({ shopDomain: SHOP })).subscriptionStatus).toBe('uninstalled');
  });
});
