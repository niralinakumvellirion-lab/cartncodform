'use strict';

/**
 * Setup checklist kept per store (utils/onboarding.js, routes/onboarding.js). Real in-memory MongoDB;
 * auth is replaced (the real middleware is covered elsewhere). A reinstall (newer installedAt) starts the
 * checklist again.
 */

jest.mock('../middleware/requireOwner', () => {
  const Store = require('../models/Store');
  const owner = async (req, res, next) => {
    req.store = await Store.findOne({ shopDomain: req.params.shopDomain });
    if (!req.store) return res.status(404).json({ error: 'Store not found' });
    return next();
  };
  return { requireAuth: (_req, _res, next) => next(), requireStoreOwner: owner, requireStoreOwnerAnyPlan: owner };
});

const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Store = require('../models/Store');
const { STEP_IDS, onboardingState } = require('../utils/onboarding');

const SHOP = 'ob-shop.myshopify.com';
let mongod;
let server;
let base;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = express();
  app.use(express.json());
  app.use('/api/onboarding', require('../routes/onboarding'));
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api/onboarding`;
}, 60000); // starting the in-memory database can be slow when every suite runs at once
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await Store.deleteMany({});
});
afterEach(() => jest.restoreAllMocks());

const makeStore = (over = {}) => Store.create({ shopDomain: SHOP, accessToken: 't', installedAt: new Date(Date.now() - 60000), ...over });
const get = async () => (await fetch(`${base}/${SHOP}`)).json();
const tick = (id, done) => fetch(`${base}/${SHOP}/steps/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done }) });

describe('onboardingState', () => {
  it('four steps; nothing done and not completed on a new install', () => {
    expect(STEP_IDS).toEqual(['embed', 'voice', 'signals', 'storefront']);
    expect(onboardingState({ installedAt: new Date() })).toEqual({
      steps: { embed: false, voice: false, signals: false, storefront: false }, doneCount: 0, total: 4, completed: false,
    });
  });

  it('ticks and completion from before the current install do not count (reinstall starts again)', () => {
    const installedAt = new Date('2026-11-08T10:00:00Z');
    const before = new Date('2026-11-01T10:00:00Z');
    const after = new Date('2026-11-08T11:00:00Z');
    const s = onboardingState({ installedAt, onboarding: { completedAt: before, steps: [{ id: 'embed', done: true, doneAt: before }, { id: 'voice', done: true, doneAt: after }] } });
    expect(s).toMatchObject({ completed: false, doneCount: 1, steps: { embed: false, voice: true } });
    expect(onboardingState({ installedAt, onboarding: { completedAt: after } }).completed).toBe(true);
  });

  it('an unticked step is not done; unknown saved ids are ignored', () => {
    const now = new Date();
    const s = onboardingState({ installedAt: new Date(now - 1000), onboarding: { steps: [{ id: 'embed', done: false, doneAt: now }, { id: 'push', done: true, doneAt: now }] } });
    expect(s.doneCount).toBe(0);
  });
});

describe('routes', () => {
  it('GET → the state for this store', async () => {
    await makeStore();
    expect(await get()).toMatchObject({ completed: false, doneCount: 0, total: 4 });
  });

  it('PUT a step → saved for the store (any browser sees it), untick works, other steps kept', async () => {
    await makeStore();
    expect((await (await tick('embed', true)).json()).steps.embed).toBe(true);
    await tick('voice', true);
    await tick('voice', false);
    const s = await get();
    expect(s.steps).toEqual({ embed: true, voice: false, signals: false, storefront: false });
    const saved = (await Store.findOne({ shopDomain: SHOP }).lean()).onboarding.steps;
    expect(saved.map((x) => x.id).sort()).toEqual(['embed', 'voice']);
  });

  it('PUT an unknown step or without done:boolean → 400, nothing saved', async () => {
    await makeStore();
    expect((await tick('hack', true)).status).toBe(400);
    expect((await fetch(`${base}/${SHOP}/steps/embed`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"done":"yes"}' })).status).toBe(400);
    expect((await Store.findOne({ shopDomain: SHOP }).lean()).onboarding.steps).toHaveLength(0);
  });

  it('POST complete → completed; a later reinstall shows the checklist again', async () => {
    await makeStore();
    const r = await fetch(`${base}/${SHOP}/complete`, { method: 'POST' });
    expect((await r.json()).completed).toBe(true);
    expect((await get()).completed).toBe(true);
    await Store.updateOne({ shopDomain: SHOP }, { installedAt: new Date(Date.now() + 1000) });
    expect((await get()).completed).toBe(false);
  });

  it('unknown store → 404', async () => {
    expect((await fetch(`${base}/nobody.myshopify.com`)).status).toBe(404);
  });
});
