/**
 * Profile.messages must be an array of subdocuments, not Strings.
 * The item has a `type` field, which Mongoose would otherwise read as a
 * type declaration for the whole item. Real in-memory MongoDB.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Profile = require('../models/Profile');

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60000); // starting the in-memory database can be slow when every suite runs at once

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

test('messages schema is an array of subdocuments', () => {
  const path = Profile.schema.path('messages');
  expect(path.instance).toBe('Array');
  expect(path.caster.instance).not.toBe('String');
  expect(path.schema.path('type').instance).toBe('String');
  expect(path.schema.path('channel').instance).toBe('String');
  expect(path.schema.path('outcome').options.default).toBe('sent');
});

test('a $pushed message object is saved with its fields', async () => {
  const profile = await Profile.create({ shopDomain: 'msg-test.myshopify.com' });
  const jobId = new mongoose.Types.ObjectId();
  const sentAt = new Date('2026-11-01T10:00:00Z');

  await Profile.updateOne(
    { _id: profile._id },
    { $push: { messages: { channel: 'email', type: 'back_in_stock', sentAt, jobId } } }
  );

  const saved = await Profile.findById(profile._id).lean();
  expect(saved.messages).toHaveLength(1);
  const m = saved.messages[0];
  expect(m.channel).toBe('email');
  expect(m.type).toBe('back_in_stock');
  expect(new Date(m.sentAt).toISOString()).toBe(sentAt.toISOString());
  expect(String(m.jobId)).toBe(String(jobId));
  expect(m.outcome).toBe('sent');

  // positional outcome update used by attribution / webhooks still works
  await Profile.updateOne(
    { _id: profile._id, 'messages.jobId': jobId },
    { $set: { 'messages.$.outcome': 'clicked' } }
  );
  const after = await Profile.findById(profile._id).lean();
  expect(after.messages[0].outcome).toBe('clicked');
});
