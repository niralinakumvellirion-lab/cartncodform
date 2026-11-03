'use strict';

/**
 * whatsappUsers.test.js — the WhatsApp details drawer endpoints, against a real in-memory
 * MongoDB so grouping, purpose types and revisit matching are exercised for real.
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
const Profile = require('../models/Profile');
const router = require('../routes/whatsappUsers');

const SHOP = 'demo.myshopify.com';
const OTHER_SHOP = 'other.myshopify.com';
const HOUR = 3600 * 1000;
const now = Date.now();

let mongod;
let server;
let base;
let ids;

async function get(path) {
  const r = await fetch(`${base}/api/dashboard/${SHOP}/channels/whatsapp${path}`);
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch (_) { body = text; }
  return { status: r.status, body, headers: r.headers, text };
}

function waJob(extra) {
  return {
    shopDomain: SHOP,
    channel: 'whatsapp',
    status: 'sent',
    runAt: new Date(now - 2 * HOUR),
    sentAt: new Date(now - 2 * HOUR),
    origin: 'manual',
    sentBy: 'owner',
    purpose: 'followup',
    ...extra,
  };
}

async function seed() {
  const asha = await Profile.create({ shopDomain: SHOP, channels: { email: { address: 'asha@example.com' }, whatsapp: { phone: '+919876543210' } }, identifiers: { emails: ['asha@example.com'] } });
  const ben = await Profile.create({ shopDomain: SHOP, channels: { whatsapp: { phone: '+919811112222' } }, identifiers: { phones: ['+919811112222'] } });
  const cara = await Profile.create({ shopDomain: SHOP, channels: { email: { address: 'cara@example.com' } }, identifiers: { emails: ['cara@example.com'] } });
  const otherShopProfile = await Profile.create({ shopDomain: OTHER_SHOP, channels: { whatsapp: { phone: '+910000000000' } } });
  const orphanId = new mongoose.Types.ObjectId(); // profile record no longer exists

  // Asha: a follow-up (visited, carted, bought), an order message, and a row with no purpose (counts as follow-up)
  const ashaFollowup = await ScheduledJob.create(waJob({ profileId: asha._id, purpose: 'followup', productHandle: 'banarasi-saree' }));
  await ScheduledJob.create(waJob({ profileId: asha._id, purpose: 'order' }));
  const ashaNoPurpose = await ScheduledJob.create(waJob({ profileId: asha._id, purpose: undefined }));
  // Older rows can have no purpose field at all (ashaNoPurpose) or an explicit null (Ben's); both mean follow-up
  await ScheduledJob.collection.updateOne({ _id: ashaNoPurpose._id }, { $unset: { purpose: 1 } });
  // Ben: one follow-up (purpose stored as null), nobody came back
  const benJob = await ScheduledJob.create(waJob({ profileId: ben._id }));
  await ScheduledJob.collection.updateOne({ _id: benJob._id }, { $set: { purpose: null } });
  // Orphan: a message to a profile that is gone
  await ScheduledJob.create(waJob({ profileId: orphanId }));
  // Must be excluded
  await ScheduledJob.create(waJob({ profileId: cara._id, sentAt: new Date(now - 30 * 24 * HOUR), runAt: new Date(now - 30 * 24 * HOUR) })); // outside window
  await ScheduledJob.create(waJob({ profileId: cara._id, status: 'pending', sentAt: undefined }));                                              // not sent
  await ScheduledJob.create(waJob({ profileId: otherShopProfile._id, shopDomain: OTHER_SHOP }));                                                // other shop
  const emailJob = await ScheduledJob.create({ shopDomain: SHOP, channel: 'email', status: 'sent', runAt: new Date(now - HOUR), sentAt: new Date(now - HOUR), profileId: ben._id, signalType: 'manual', origin: 'manual' });
  const pushJob = await ScheduledJob.create({ shopDomain: SHOP, channel: 'push', status: 'sent', runAt: new Date(now - HOUR), sentAt: new Date(now - HOUR), profileId: ben._id, signalType: 'cart_abandon', origin: 'automated' });

  // Events
  await AttributedEvent.create({ shopDomain: SHOP, eventType: 'revisit', jobId: ashaFollowup._id, profileId: asha._id, ts: new Date(now - HOUR) });
  await AttributedEvent.create({ shopDomain: SHOP, eventType: 'add_to_cart', jobId: ashaFollowup._id, profileId: asha._id, ts: new Date(now - HOUR) });
  await AttributedEvent.create({ shopDomain: SHOP, eventType: 'purchase', jobId: ashaFollowup._id, profileId: asha._id, ts: new Date(now - HOUR) });
  // Email and push revisits must never show up as WhatsApp revisits
  await AttributedEvent.create({ shopDomain: SHOP, eventType: 'revisit', jobId: emailJob._id, profileId: ben._id, ts: new Date(now - HOUR) });
  await AttributedEvent.create({ shopDomain: SHOP, eventType: 'revisit', jobId: pushJob._id, profileId: ben._id, ts: new Date(now - HOUR) });

  return { asha, ben, cara, otherShopProfile, orphanId, ashaFollowup, ashaNoPurpose };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const app = express();
  app.use('/api/dashboard/:shopDomain/channels/whatsapp', router);
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

const byName = (users, name) => users.find((u) => u.name === name);

describe('GET /users', () => {
  test('lists people who were sent WhatsApp messages in the window, scoped to the shop', async () => {
    const r = await get('/users');
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(3);
    expect(r.body.users.map((u) => u.name).sort()).toEqual(['Anonymous visitor', 'Asha', 'Customer']);
  });

  test('counts messages per person (a row with no purpose counts too)', async () => {
    const { users } = (await get('/users')).body;
    expect(byName(users, 'Asha').sentCount).toBe(3);
    expect(byName(users, 'Customer').sentCount).toBe(1); // Ben: only his WhatsApp message, not the email/push rows
  });

  test('masks email and phone; never returns full values or internal ids', async () => {
    const r = await get('/users');
    expect(r.text).not.toMatch(/asha@example\.com|9876543210|9811112222/);
    const asha = byName(r.body.users, 'Asha');
    expect(asha.email).toBe('a***@example.com');
    expect(asha.phone).toBe('****3210');
    expect(byName(r.body.users, 'Customer').email).toBeNull();
    expect(byName(r.body.users, 'Customer').phone).toBe('****2222');
    expect(asha.jobIds).toBeUndefined();
    expect(asha.deviceType).toBeNull();
  });

  test('a person whose profile record is gone is listed as an anonymous visitor', async () => {
    const { users } = (await get('/users')).body;
    const orphan = users.find((u) => u.userKey === `p_${ids.orphanId}`);
    expect(orphan.name).toBe('Anonymous visitor');
    expect(orphan.email).toBeNull();
    expect(orphan.phone).toBeNull();
  });

  test('revisited: true only for the person whose WhatsApp message got a revisit', async () => {
    const { users } = (await get('/users')).body;
    expect(byName(users, 'Asha').revisited).toBe(true);
    expect(byName(users, 'Customer').revisited).toBe(false); // Ben came back from email and push, not WhatsApp
  });

  test('includeVia=1 returns what each person came back from', async () => {
    const { users } = (await get('/users?includeVia=1')).body;
    expect(byName(users, 'Asha').cameBackVia).toEqual([{ type: 'followup', label: 'Follow-up', count: 1 }]);
    expect(byName(users, 'Customer').cameBackVia).toEqual([]);
  });

  test('type filter: order messages vs follow-ups (no purpose = follow-up)', async () => {
    const order = (await get('/users?type=order')).body;
    expect(order.users.map((u) => u.name)).toEqual(['Asha']);
    expect(order.users[0].sentCount).toBe(1);
    const follow = (await get('/users?type=followup')).body;
    expect(byName(follow.users, 'Asha').sentCount).toBe(2);
    expect(follow.total).toBe(3);
  });

  test('search by name, email part or phone digits; paging', async () => {
    expect((await get('/users?q=asha')).body.users.map((u) => u.name)).toEqual(['Asha']);
    expect((await get('/users?q=3210')).body.users.map((u) => u.name)).toEqual(['Asha']);
    const page = (await get('/users?limit=2&page=1')).body;
    expect(page.total).toBe(3);
    expect(page.users).toHaveLength(1);
  });

  test('the date window is applied', async () => {
    const wide = (await get(`/users?from=${new Date(now - 40 * 24 * HOUR).toISOString()}`)).body;
    expect(wide.total).toBe(4); // + Cara's 30-day-old message
  });
});

describe('GET /users/:userKey/count', () => {
  test('counts by purpose', async () => {
    const r = await get(`/users/p_${ids.asha._id}/count`);
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(3);
    const types = Object.fromEntries(r.body.byType.map((t) => [t.type, t.count]));
    expect(types).toEqual({ followup: 2, order: 1 });
    expect(r.body.byType.find((t) => t.type === 'order').label).toBe('Order message');
  });

  test('works for a person whose profile record is gone; other shop or unknown id finds nothing', async () => {
    expect((await get(`/users/p_${ids.orphanId}/count`)).body.total).toBe(1);
    expect((await get(`/users/p_${ids.otherShopProfile._id}/count`)).body.total).toBe(0);
    expect((await get(`/users/p_${new mongoose.Types.ObjectId()}/count`)).body.total).toBe(0);
  });

  test('rejects push-style and invalid keys', async () => {
    expect((await get('/users/a_123/count')).status).toBe(400);
    expect((await get('/users/p_nope/count')).status).toBe(400);
  });
});

describe('GET /users/:userKey/revisit', () => {
  test('lists each message with type, product, status and funnel', async () => {
    const r = await get(`/users/p_${ids.asha._id}/revisit`);
    expect(r.status).toBe(200);
    expect(r.body.summary.sent).toBe(3);
    expect(r.body.summary.revisitedAfter).toBe(1);
    const visited = r.body.notifications.find((n) => n.jobId === String(ids.ashaFollowup._id));
    expect(visited.status).toBe('revisited');
    expect(visited.visits).toBe(1);
    expect(visited.title).toBe('Product page: banarasi-saree');
    expect(visited.label).toBe('Follow-up');
    expect(visited.funnel).toEqual({ addedToCart: 1, checkout: 0, purchased: 1 });
    const other = r.body.notifications.find((n) => n.jobId === String(ids.ashaNoPurpose._id));
    expect(other.status).toBe('no_revisit');
    expect(other.title).toBe('Store home page');
    expect(other.type).toBe('followup');
  });

  test('contains no raw contact details', async () => {
    const r = await get(`/users/p_${ids.asha._id}/revisit`);
    expect(r.text).not.toMatch(/asha@example\.com|9876543210/);
  });
});

describe('GET /revisited', () => {
  test('lists everyone who came back from a WhatsApp message', async () => {
    const r = await get('/revisited');
    expect(r.status).toBe(200);
    expect(r.body.users.map((u) => u.name)).toEqual(['Asha']);
    expect(r.body.users[0].revisits).toBe(1);
    expect(r.body.users[0].cameBackVia[0].label).toBe('Follow-up');
    expect(r.body.users[0].phone).toBe('****3210');
  });

  test('email and push revisits are excluded; type filter narrows', async () => {
    expect((await get('/revisited')).body.users.map((u) => u.name)).not.toContain('Customer');
    expect((await get('/revisited?type=order')).body.users).toEqual([]);
  });
});

describe('GET /users.csv', () => {
  test('exports masked users as CSV', async () => {
    const r = await get('/users.csv');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/text\/csv/);
    expect(r.headers.get('content-disposition')).toContain('whatsapp-users.csv');
    const lines = r.text.split('\r\n');
    expect(lines[0]).toBe('name,email,phone,sent_count,last_sent,revisited');
    expect(lines).toHaveLength(4);
    expect(r.text).toContain('****3210');
    expect(r.text).not.toMatch(/9876543210|asha@example\.com/);
  });
});
