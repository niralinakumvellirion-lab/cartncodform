require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const ScheduledJob = require('./models/ScheduledJob');

  // Find ALL checkout_abandon jobs ever
  const jobs = await ScheduledJob.find({
    signalType: 'checkout_abandon'
  }).sort({ createdAt: -1 }).limit(5).lean();

  console.log('=== CHECKOUT_ABANDON JOBS ===');
  jobs.forEach(j => {
    console.log('status:', j.status,
      '| profileId:', j.profileId,
      '| runAt:', j.runAt,
      '| error:', j.error || 'none',
      '| updatedAt:', j.updatedAt);
  });

  // Also check profile messages
  const Profile = require('./models/Profile');
  const p = await Profile.findById('6aa380cdb6f3edd0f85cbe4a')
    .select('messages channels.email').lean();

  console.log('\n=== PROFILE MESSAGES ===');
  console.log('Email:', p?.channels?.email?.address ? '[redacted]@gmail.com' : 'none');
  console.log('Messages:', JSON.stringify(p?.messages?.slice(-5)));

  mongoose.disconnect();
});
