require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Profile = require('./models/Profile');
  const ScheduledJob = require('./models/ScheduledJob');

  // 1. Find the sent checkout_abandon job
  const job = await ScheduledJob.findOne({
    signalType: 'checkout_abandon',
    status: 'sent'
  }).lean();

  console.log('=== SENT JOB ===');
  console.log('profileId:', job?.profileId);
  console.log('channel:', job?.channel);
  console.log('outcome:', job?.outcome);
  console.log('error:', job?.error || 'none');

  // 2. Check the profile's push subscription
  const profile = await Profile.findById(job?.profileId)
    .select('channels.push identifiers.pushTokens identifiers.cartTokens')
    .lean();

  console.log('\n=== PROFILE PUSH STATUS ===');
  console.log('push.subscribed:', profile?.channels?.push?.subscribed);
  console.log('push.token (first 20):',
    profile?.channels?.push?.token
      ? profile.channels.push.token.substring(0,20)+'...'
      : 'MISSING');
  console.log('pushTokens count:', profile?.identifiers?.pushTokens?.length || 0);
  console.log('pushTokens (first 20 chars each):',
    (profile?.identifiers?.pushTokens || []).map(t => t.substring(0,20)+'...'));

  // 3. Check CustomerPushSubscription for this profile
  const db = mongoose.connection.db;
  const subs = await db.collection('customerpushsubscriptions')
    .find({
      shopDomain: 'cartncod-form.myshopify.com',
      $or: [
        { cartToken: { $in: profile?.identifiers?.cartTokens || [] } },
        { token: { $in: profile?.identifiers?.pushTokens || [] } }
      ]
    })
    .toArray();

  console.log('\n=== PUSH SUBSCRIPTIONS ===');
  console.log('Matching subscriptions:', subs.length);
  subs.forEach((s, i) => {
    console.log('Sub', i+1, '| token (first 20):', s.token?.substring(0,20)+'...',
      '| cartToken:', s.cartToken,
      '| active:', s.active !== false);
  });

  // 4. Check what sendPushToCustomers does —
  // does it find this profile's token?
  const allSubs = await db.collection('customerpushsubscriptions')
    .find({ shopDomain: 'cartncod-form.myshopify.com' })
    .limit(5).toArray();
  console.log('\n=== SAMPLE SUBSCRIPTIONS IN DB ===');
  allSubs.forEach(s => {
    console.log('cartToken:', s.cartToken,
      '| token:', s.token?.substring(0,15)+'...',
      '| active:', s.active !== false);
  });

  mongoose.disconnect();
});
