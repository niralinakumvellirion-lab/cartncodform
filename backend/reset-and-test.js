require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Profile = require('./models/Profile');
  const ScheduledJob = require('./models/ScheduledJob');

  // 1. Clear messages for email profile only
  const r = await Profile.updateOne(
    { _id: '6aa380cdb6f3edd0f85cbe4a' },
    { $set: { messages: [] } }
  );
  console.log('Frequency cap cleared:', r.modifiedCount);

  // 2. Cancel all pending jobs except checkout_abandon
  await ScheduledJob.updateMany(
    {
      status: 'pending',
      signalType: { $ne: 'checkout_abandon' }
    },
    { runAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }
  );

  // 3. Force checkout_abandon job to run now
  const job = await ScheduledJob.findOne({
    status: 'pending',
    signalType: 'checkout_abandon'
  });

  if (job) {
    await ScheduledJob.updateOne(
      { _id: job._id },
      { runAt: new Date() }
    );
    console.log('checkout_abandon job forced:', job._id);
    console.log('cartToken:', job.cartToken);
  } else {
    console.log('No pending checkout_abandon job — run brain first');
  }

  mongoose.disconnect();
});
