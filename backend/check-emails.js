require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Profile = require('./models/Profile');

  const total = await Profile.countDocuments();
  const withEmail = await Profile.countDocuments({
    'channels.email.address': { $exists: true, $ne: null }
  });
  const withPush = await Profile.countDocuments({
    'channels.push.subscribed': true
  });
  const withBoth = await Profile.countDocuments({
    'channels.push.subscribed': true,
    'channels.email.address': { $exists: true, $ne: null }
  });
  const withNeither = await Profile.countDocuments({
    'channels.push.subscribed': { $ne: true },
    'channels.email.address': { $exists: false }
  });

  console.log('Total profiles:', total);
  console.log('With email:', withEmail);
  console.log('With push:', withPush);
  console.log('With both:', withBoth);
  console.log('With neither:', withNeither);

  mongoose.disconnect();
});
