require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const ScheduledJob = require('./models/ScheduledJob');

  // Find the checkout_abandon job for our email profile
  const job = await ScheduledJob.findOne({
    signalType: 'checkout_abandon',
    status: 'pending'
  }).lean();

  if (!job) {
    console.log('No pending checkout_abandon job found');
    mongoose.disconnect();
    return;
  }

  console.log('Found job:', job._id, '| profile:', job.profileId);
  console.log('Status:', job.status, '| runAt:', job.runAt);

  // Force it to run now
  await ScheduledJob.updateOne(
    { _id: job._id },
    { runAt: new Date() }
  );
  console.log('Forced runAt to now');

  // Cancel ALL other pending jobs temporarily
  const r = await ScheduledJob.updateMany(
    { status: 'pending', _id: { $ne: job._id } },
    { runAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }
  );
  console.log('Deferred other jobs:', r.modifiedCount);

  mongoose.disconnect();
});
