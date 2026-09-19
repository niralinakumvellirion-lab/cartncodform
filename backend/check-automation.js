require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Profile = require('./models/Profile');
  const ScheduledJob = require('./models/ScheduledJob');
  const Store = require('./models/Store');

  // 1. Store token status
  const store = await Store.findOne({ shopDomain: 'cartncod-form.myshopify.com' })
    .select('onlineAccessToken onlineTokenExpiresAt needsReauth');
  console.log('=== STORE TOKEN ===');
  console.log('Online token:', store.onlineAccessToken ? store.onlineAccessToken.substring(0,10)+'...' : 'MISSING');
  console.log('Expires at:', store.onlineTokenExpiresAt);
  console.log('Needs reauth:', store.needsReauth);

  // 2. Profiles with email
  const withEmail = await Profile.countDocuments({
    'channels.email.address': { $exists: true, $ne: null }
  });
  const withPush = await Profile.countDocuments({
    'channels.push.subscribed': true
  });
  console.log('\n=== PROFILES ===');
  console.log('With email:', withEmail);
  console.log('With push:', withPush);

  // 3. Show last 3 profiles with email - their signals and messages
  const emailProfiles = await Profile.find({
    'channels.email.address': { $exists: true, $ne: null }
  }).select('channels.email.address stage messages').limit(3).lean();

  console.log('\n=== PROFILES WITH EMAIL ===');
  emailProfiles.forEach((p, i) => {
    console.log('Profile', i+1, '| email:', p.channels?.email?.address);
    console.log('  Last messages:', JSON.stringify(p.messages?.slice(-3)));
  });

  // 4. Recent scheduled jobs
  const recentJobs = await ScheduledJob.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();
  console.log('\n=== RECENT JOBS (last 10) ===');
  recentJobs.forEach(j => {
    console.log(j.status, '|', j.channel, '|', j.signalType, '|',
      j.shopDomain, '| runAt:', j.runAt, '| error:', j.error || 'none');
  });

  // 5. Job counts
  const pending = await ScheduledJob.countDocuments({ status: 'pending' });
  const sent = await ScheduledJob.countDocuments({ status: 'sent' });
  const failed = await ScheduledJob.countDocuments({ status: 'failed' });
  console.log('\n=== JOB COUNTS ===');
  console.log('Pending:', pending, '| Sent:', sent, '| Failed:', failed);

  // 6. Check signals for email profiles
  const Signal = require('./models/Signal');
  const emailProfileIds = emailProfiles.map(p => p._id);
  const signals = await Signal.find({
    profileId: { $in: emailProfileIds }
  }).lean();
  console.log('\n=== SIGNALS FOR EMAIL PROFILES ===');
  signals.forEach(s => {
    console.log(s.type, '| strength:', s.strength, '| updatedAt:', s.updatedAt);
  });

  mongoose.disconnect();
});
