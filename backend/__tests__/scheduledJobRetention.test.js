/**
 * ScheduledJob retention TTL (audits/queue-notification-detail-audit.txt
 * finding #3) — same pattern as StorefrontEvent/AttributedEvent: a 90-day
 * expireAfterSeconds index, keyed on createdAt since that's the only date
 * field every row (pending, sent, cancelled, failed, skipped) always has.
 */

const ScheduledJob = require('../models/ScheduledJob');

test('declares a 90-day TTL index on createdAt', () => {
  const ttlIndex = ScheduledJob.schema.indexes().find(
    ([keys]) => Object.prototype.hasOwnProperty.call(keys, 'createdAt')
  );

  expect(ttlIndex).toBeDefined();
  const [, options] = ttlIndex;
  expect(options.expireAfterSeconds).toBe(90 * 24 * 60 * 60);
});
