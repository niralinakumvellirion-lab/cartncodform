'use strict';

/**
 * Broadcast emails must carry a link id that the Email details drawer can tie back
 * to the recipient rows: the queue item id for queue emails, otherwise the
 * broadcast id that is also stored on every recipient row.
 */

const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn(() => ({ emails: { send: (...args) => mockSend(...args) } })),
}));
jest.mock('../models/EmailTemplate', () => ({ findOne: jest.fn(), findById: jest.fn() }));
jest.mock('../models/Profile', () => ({ countDocuments: jest.fn(), find: jest.fn() }));
jest.mock('../models/Store', () => ({ findOne: jest.fn() }));
jest.mock('../utils/email', () => ({ FROM: 'Test <t@example.com>' }));
jest.mock('../utils/unsubscribeToken', () => ({
  buildUnsubscribeHeaders: jest.fn(() => ({})),
  buildUnsubscribeUrl: jest.fn(() => 'https://example.com/unsub'),
}));
jest.mock('../utils/emailDesign', () => ({
  designFromTemplate: jest.fn(() => ({ ctaUrl: 'https://shop.example/offer', subject: 'S' })),
}));
jest.mock('../utils/emailEngine', () => ({
  renderEmailDocument: jest.fn((design) => JSON.stringify(design)),
}));
jest.mock('../utils/segmentQuery', () => ({ buildSegmentQuery: jest.fn(() => ({})) }));
jest.mock('../services/sendLogService', () => ({ logBroadcastSend: jest.fn().mockResolvedValue(undefined) }));

const mongoose = require('mongoose');
const EmailTemplate = require('../models/EmailTemplate');
const Profile = require('../models/Profile');
const Store = require('../models/Store');
const { logBroadcastSend } = require('../services/sendLogService');
const { sendEmailBroadcast } = require('../utils/emailBroadcast');

function sentHtmlLinks() {
  return mockSend.mock.calls.map(([msg]) => JSON.parse(msg.html).ctaUrl);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockSend.mockResolvedValue({ error: null });
  EmailTemplate.findOne = jest.fn().mockResolvedValue({ _id: 't1', subject: 'Hello', body: 'Body', imageUrl: '' });
  EmailTemplate.findById = jest.fn().mockResolvedValue({ _id: 't1', subject: 'Hello', body: 'Body', imageUrl: '' });
  Profile.countDocuments = jest.fn().mockResolvedValue(2);
  Profile.find = jest.fn(() => ({
    select: () => ({
      lean: () => Promise.resolve([
        { _id: new mongoose.Types.ObjectId(), channels: { email: { address: 'a@example.com' } }, identifiers: {} },
        { _id: new mongoose.Types.ObjectId(), channels: { email: { address: 'b@example.com' } }, identifiers: {} },
      ]),
    }),
  }));
  Store.findOne = jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ shopName: 'S' }) }) }));
});
afterEach(() => jest.restoreAllMocks());

test('non-queue broadcast: the email link and every logged row share one broadcast id', async () => {
  const result = await sendEmailBroadcast({ shopDomain: 'demo.myshopify.com', templateId: 't1', logOrigin: 'manual' });
  expect(result.sent).toBe(2);

  const links = sentHtmlLinks();
  const ids = links.map((l) => new URL(l).searchParams.get('ccf_job'));
  expect(new Set(ids).size).toBe(1);
  expect(new URL(links[0]).searchParams.get('ccf_src')).toBe('email');

  const logged = logBroadcastSend.mock.calls[0][0];
  expect(String(logged.broadcastId)).toBe(ids[0]);
  expect(logged.channel).toBe('email');
  expect(logged.recipients).toHaveLength(2);
});

test('queue email: the link carries the queue item id so a revisit resolves to it', async () => {
  const fqId = String(new mongoose.Types.ObjectId());
  await sendEmailBroadcast({ shopDomain: 'demo.myshopify.com', templateId: 't1', logOrigin: 'scheduled', festivalQueueId: fqId });

  const ids = sentHtmlLinks().map((l) => new URL(l).searchParams.get('ccf_job'));
  expect(ids).toEqual([fqId, fqId]);

  const logged = logBroadcastSend.mock.calls[0][0];
  expect(String(logged.festivalQueueId)).toBe(fqId);
  expect(logged.broadcastId).toBeTruthy();
});
