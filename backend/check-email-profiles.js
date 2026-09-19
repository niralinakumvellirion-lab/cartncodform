require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Profile = require('./models/Profile');
  const ScheduledJob = require('./models/ScheduledJob');

  // Show email profiles and their recent jobs
  const profiles = await Profile.find({
    'channels.email.address': { $exists: true, $ne: null }
  }).select('channels.email.address channels.push.subscribed identifiers._id').lean();

  console.log('=== EMAIL PROFILES ===');
  for (const p of profiles) {
    const jobs = await ScheduledJob.find({ profileId: p._id })
      .sort({ createdAt: -1 })
      .limit(2)
      .lean();
    console.log(
      'email: [redacted]@' + p.channels.email.address.split('@')[1],
      '| push:', p.channels?.push?.subscribed ? 'yes' : 'no',
      '| recent jobs:', jobs.map(j => j.signalType + ':' + j.status).join(', ') || 'none'
    );
  }

  mongoose.disconnect();
});
