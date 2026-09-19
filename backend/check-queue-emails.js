require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const ScheduledJob = require('./models/ScheduledJob');
  const Profile = require('./models/Profile');

  // Get last 10 jobs
  const jobs = await ScheduledJob.find()
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  console.log('=== LAST 10 JOBS ===');
  for (const job of jobs) {
    const profile = job.profileId
      ? await Profile.findById(job.profileId)
          .select('channels.email identifiers.emails')
          .lean()
      : null;
    console.log(
      'job:', job._id,
      '| signal:', job.signalType,
      '| status:', job.status,
      '| email:',
        profile?.channels?.email?.address ||
        profile?.identifiers?.emails?.[0] ||
        'NO EMAIL'
    );
  }

  // Also show total profiles with email
  const withEmail = await Profile.countDocuments({
    'channels.email.address': { $exists: true, $ne: null }
  });
  const total = await Profile.countDocuments();
  console.log('\n=== SUMMARY ===');
  console.log('Total profiles:', total);
  console.log('Profiles with email:', withEmail);
  console.log('Profiles without email:', total - withEmail);

  mongoose.disconnect();
});
