'use strict';

/**
 * emailUsers.test.js — the Email details drawer endpoints, against a real in-memory
 * MongoDB so the grouping/aggregation and revisit matching are exercised for real.
 */

jest.mock('../middleware/requireOwner', () => ({
  requireAuth: (req, res, next) => next(),
  requireStoreOwner: (req, res, next) => next(),
}));

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const ScheduledJob = require('../models/ScheduledJob');
const AttributedEvent = require('../models/AttributedEvent');
const FestivalQueue = require('../models/FestivalQueue');
const Profile = require('../models/Profile');
const router = require('../routes/emailUsers');

const SHOP = 'demo.myshopify.com';
const OTHER_SHOP = 'other.myshopify.com';
const HOUR = 3600 * 1000;
const now = Date.now();

let mongod;
let server;
let base;
let ids;

async function get(path) {
  const r = await fetch(`${base}/api/dashboard/${SHOP}/channels/email${path}`);
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch (_) { body = text; }
  return { status: r.status, body, headers: r.headers, text };
}

function emailJob(extra) {
  return {
    shopDomain: SHOP,
    channel: 'email',
    status: 'sent',
    runAt: new Date(now - 2 * HOUR),
    sentAt: new Date(now - 2 * HOUR),
    origin: 'automated',
    ...extra,
  };
}

async function seed() {
  const alice = await Profile.create({ shopDomain: SHOP, channels: { email: { address: 'alice@example.com' } }, identifiers: { emails: ['alice@example.com'] } });
  const bob = await Profile.create({ shopDomain: SHOP, channels: { email: { address: 'bob@example.com' } }, identifiers: { emails: ['bob@example.com'] } });
  const carol = await Profile.create({ shopDomain: SHOP, channels: { email: { address: 'carol@example.com' } }, identifiers: { emails: ['carol@example.com'] } });
  const dave = await Profile.create({ shopDomain: SHOP, channels: { email: { address: 'dave@example.com' } }, identifiers: { emails: ['dave@example.com'] } });
  const otherShopProfile = await Profile.create({ shopDomain: OTHER_SHOP, channels: { email: { address: 'zed@example.com' } }, identifiers: { emails: ['zed@example.com'] } });

  const broadcastId = new mongoose.Types.ObjectId();
  const festival = await FestivalQueue.create({ shopDomain: SHOP, title: 'Diwali', scheduledAt: new Date(now), channel: 'email' });
  const pushFestival = await FestivalQueue.create({ shopDomain: SHOP, title: 'Push only', scheduledAt: new Date(now), channel: 'push' });

  // Alice: an automated cart reminder (revisited), a manual send, a queue email
  const aliceCart = await ScheduledJob.create(emailJob({ profileId: alice._id, signalType: 'cart_abandon', payload: { subject: 'We saved your cart' } }));
  const aliceManual = await ScheduledJob.create(emailJob({ profileId: alice._id, signalType: 'manual', origin: 'manual', payload: { subject: 'Hello Alice' } }));
  await ScheduledJob.create(emailJob({ subscriptionToken: 'alice@example.com', signalType: 'festival', festivalQueueId: festival._id, origin: 'scheduled', payload: { title: 'Diwali offer' } }));
  // Broadcast to Alice and Bob (rows have the address only, no profileId)
  await ScheduledJob.create(emailJob({ subscriptionToken: 'alice@example.com', signalType: 'email_broadcast', broadcastId, origin: 'manual', payload: { title: 'Weekend sale' } }));
  await ScheduledJob.create(emailJob({ subscriptionToken: 'bob@example.com', signalType: 'email_broadcast', broadcastId, origin: 'manual', payload: { title: 'Weekend sale' } }));
  // Carol: old broadcast row logged before tracking ids existed
  await ScheduledJob.create(emailJob({ subscriptionToken: 'carol@example.com', signalType: 'email_broadcast', origin: 'manual', payload: { title: 'Old sale' } }));
  // Dave: tracked automated email, never came back
  await ScheduledJob.create(emailJob({ profileId: dave._id, signalType: 'lapsing', payload: { subject: 'We miss you' } }));
  // Must be excluded: a push row, another shop's email row, a row outside the window, a failed email
  const pushJob = await ScheduledJob.create({ shopDomain: SHOP, channel: 'push', status: 'sent', runAt: new Date(now - HOUR), sentAt: new Date(now - HOUR), profileId: alice._id, signalType: 'cart_abandon', origin: 'automated', payload: { title: 'push' } });
  await ScheduledJob.create(emailJob({ shopDomain: OTHER_SHOP, profileId: otherShopProfile._id, signalType: 'cart_abandon' }));
  await ScheduledJob.create(emailJob({ profileId: bob._id, signalType: 'winback', sentAt: new Date(now - 30 * 24 * HOUR), runAt: new Date(now - 30 * 24 * HOUR) }));
  await ScheduledJob.create(emailJob({ profileId: bob._id, signalType: 'welcome', status: 'failed' }));

  // Revisits
  await AttributedEvent.create({ shopDomain: SHOP, eventType: 'revisit', jobId: aliceCart._id, profileId: alice._id, ts: new Date(now - HOUR) });
  await AttributedEvent.create({ shopDomain: SHOP, eventType: 'add_to_cart', jobId: aliceCart._id, profileId: alice._id, ts: new Date(now - HOUR) });
  await AttributedEvent.create({ shopDomain: SHOP, eventType: 'revisit', jobId: broadcastId, profileId: bob._id, ts: new Date(now - HOUR) });
  await AttributedEvent.create({ shopDomain: SHOP, eventType: 'revisit', festivalQueueId: festival._id, profileId: alice._id, ts: new Date(now - 30 * 60 * 1000) });
  // A push revisit and a push-queue revisit: must never show up in email
  await AttributedEvent.create({ shopDomain: SHOP, eventType: 'revisit', jobId: pushJob._id, profileId: alice._id, ts: new Date(now - HOUR) });
  await AttributedEvent.create({ shopDomain: SHOP, eventType: 'revisit', festivalQueueId: pushFestival._id, profileId: dave._id, ts: new Date(now - HOUR) });

  return { alice, bob, carol, dave, otherShopProfile, aliceCart, aliceManual, broadcastId, festival };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = express();
  app.use('/api/dashboard/:shopDomain/channels/email', router);
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
  ids = await seed();
}, 120000);

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await mongoose.disconnect();
  await mongod.stop();
});

function byName(users, name) {
  return users.find((u) => u.name === name);
}

describe('GET /users', () => {
  test('lists the people emailed in the window, one row per person, scoped to the shop', async () => {
    const r = await get('/users');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(4);
    expect(r.body.users.map((u) => u.name).sort()).toEqual(['Alice', 'Bob', 'Carol', 'Dave']);
  });

  test('counts every sent email per person, including broadcast rows that only carry the address', async () => {
    const { users } = (await get('/users')).body;
    expect(byName(users, 'Alice').sentCount).toBe(4); // cart + manual + queue email + broadcast
    expect(byName(users, 'Bob').sentCount).toBe(1);   // the in-window broadcast only
  });

  test('never returns a full email address, device type is null', async () => {
    const r = await get('/users');
    expect(r.text).not.toMatch(/alice@example\.com|bob@example\.com/);
    expect(byName(r.body.users, 'Alice').email).toBe('a***@example.com');
    expect(byName(r.body.users, 'Alice').deviceType).toBeNull();
    expect(r.text).not.toMatch(/zed/);
  });

  test('revisited: own-email revisit, broadcast revisit only for the person who came back', async () => {
    const { users } = (await get('/users')).body;
    expect(byName(users, 'Alice').revisited).toBe(true);   // cart email + queue email revisits
    expect(byName(users, 'Bob').revisited).toBe(true);     // broadcast revisit recorded for Bob
    expect(byName(users, 'Dave').revisited).toBe(false);   // tracked, never came back
    expect(byName(users, 'Carol').revisited).toBe('not_tracked'); // old broadcast row, no link id
  });

  test('a broadcast revisit by one person does not mark other recipients as revisited', async () => {
    // Alice also got the broadcast; her own revisit comes from her cart email, so filter to broadcast-only
    const r = await get('/users?type=email_broadcast');
    const alice = byName(r.body.users, 'Alice');
    expect(alice.sentCount).toBe(1);
    expect(alice.revisited).toBe(false);
    expect(byName(r.body.users, 'Bob').revisited).toBe(true);
  });

  test('push revisits never count as email revisits', async () => {
    const { users } = (await get('/users?type=lapsing')).body;
    expect(byName(users, 'Dave').revisited).toBe(false);
  });

  test('includeVia=1 returns what each person came back from', async () => {
    const { users } = (await get('/users?includeVia=1')).body;
    const via = byName(users, 'Alice').cameBackVia.map((v) => `${v.label}:${v.count}`).sort();
    expect(via).toEqual(['Campaign:1', 'Cart reminder:1']);
    expect(byName(users, 'Bob').cameBackVia.map((v) => v.label)).toEqual(['Email campaign']);
    expect(byName(users, 'Dave').cameBackVia).toEqual([]);
  });

  test('origin and type filters apply', async () => {
    const manual = (await get('/users?origin=manual')).body.users.map((u) => u.name).sort();
    expect(manual).toEqual(['Alice', 'Bob', 'Carol']);
    const lapsing = (await get('/users?type=lapsing')).body;
    expect(lapsing.users.map((u) => u.name)).toEqual(['Dave']);
  });

  test('name search and paging', async () => {
    expect((await get('/users?q=bob')).body.users.map((u) => u.name)).toEqual(['Bob']);
    const page = (await get('/users?limit=2&page=1')).body;
    expect(page.total).toBe(4);
    expect(page.users).toHaveLength(2);
  });

  test('the date window is applied (older send is excluded)', async () => {
    const wide = (await get(`/users?from=${new Date(now - 40 * 24 * HOUR).toISOString()}`)).body;
    expect(byName(wide.users, 'Bob').sentCount).toBe(2); // + the 30-day-old winback
  });
});

describe('GET /users/:userKey/count', () => {
  test('counts by type, matching broadcast rows by address', async () => {
    const r = await get(`/users/p_${ids.alice._id}/count`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(4);
    const types = Object.fromEntries(r.body.byType.map((t) => [t.type, t.count]));
    expect(types).toEqual({ cart_abandon: 1, manual: 1, festival: 1, email_broadcast: 1 });
    expect(r.body.byType.find((t) => t.type === 'email_broadcast').label).toBe('Email campaign');
  });

  test('rejects an anonymous (push style) key and invalid ids', async () => {
    expect((await get('/users/a_123/count')).status).toBe(400);
    expect((await get('/users/p_notanid/count')).status).toBe(400);
  });

  test('another shop\'s profile is a 404', async () => {
    expect((await get(`/users/p_${ids.otherShopProfile._id}/count`)).status).toBe(404);
    expect((await get(`/users/p_${new mongoose.Types.ObjectId()}/count`)).status).toBe(404);
  });
});

describe('GET /users/:userKey/revisit', () => {
  test('lists each email with its subject, type and revisit status', async () => {
    const r = await get(`/users/p_${ids.alice._id}/revisit`);
    expect(r.status).toBe(200);
    expect(r.body.summary.sent).toBe(4);
    expect(r.body.summary.revisitedAfter).toBe(2);
    const byType = Object.fromEntries(r.body.notifications.map((n) => [n.type, n]));
    expect(byType.cart_abandon.title).toBe('We saved your cart');
    expect(byType.cart_abandon.status).toBe('revisited');
    expect(byType.cart_abandon.visits).toBe(1);
    expect(byType.cart_abandon.funnel.addedToCart).toBe(1);
    expect(byType.manual.title).toBe('Hello Alice');
    expect(byType.manual.status).toBe('no_revisit');
    expect(byType.festival.title).toBe('Diwali offer');
    expect(byType.festival.status).toBe('revisited');
    expect(byType.email_broadcast.title).toBe('Weekend sale');
    expect(byType.email_broadcast.status).toBe('no_revisit'); // Bob came back, not Alice
  });

  test('broadcast revisit shows only for the person who came back', async () => {
    const r = await get(`/users/p_${ids.bob._id}/revisit`);
    expect(r.body.notifications).toHaveLength(1);
    expect(r.body.notifications[0].status).toBe('revisited');
  });

  test('old broadcast rows without a link id are reported as not tracked', async () => {
    const r = await get(`/users/p_${ids.carol._id}/revisit`);
    expect(r.body.notifications[0].status).toBe('not_tracked');
  });

  test('summary byType lists sends by type and the response has no raw email', async () => {
    const r = await get(`/users/p_${ids.alice._id}/revisit`);
    expect(r.body.summary.byType.reduce((s, t) => s + t.count, 0)).toBe(4);
    expect(r.text).not.toMatch(/alice@example\.com/);
  });
});

describe('GET /revisited', () => {
  test('lists everyone who came back from an email, with what they came back from', async () => {
    const r = await get('/revisited');
    expect(r.status).toBe(200);
    expect(r.body.users.map((u) => u.name).sort()).toEqual(['Alice', 'Bob']);
    const alice = byName(r.body.users, 'Alice');
    expect(alice.revisits).toBe(2);
    expect(alice.cameBackVia.map((v) => v.label).sort()).toEqual(['Campaign', 'Cart reminder']);
    expect(byName(r.body.users, 'Bob').cameBackVia[0].label).toBe('Email campaign');
  });

  test('push-only revisits are excluded (push job and push queue item)', async () => {
    const r = await get('/revisited');
    expect(r.body.users.map((u) => u.name)).not.toContain('Dave');
    expect(r.body.total).toBe(2);
  });

  test('type filter narrows the list', async () => {
    const r = await get('/revisited?type=email_broadcast');
    expect(r.body.users.map((u) => u.name)).toEqual(['Bob']);
  });
});

describe('GET /users.csv', () => {
  test('exports masked users as CSV', async () => {
    const r = await get('/users.csv');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/csv/);
    expect(r.headers.get('content-disposition')).toContain('email-users.csv');
    const lines = r.text.split('\r\n');
    expect(lines[0]).toBe('name,email,sent_count,last_sent,revisited,came_back_via');
    expect(lines).toHaveLength(5);
    expect(r.text).toContain('a***@example.com');
    expect(r.text).not.toMatch(/alice@example\.com/);
  });
});
