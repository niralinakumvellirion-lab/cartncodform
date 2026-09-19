require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Profile = require('./models/Profile');

  const profiles = await Profile.find({
    'channels.email.address': { $exists: true, $ne: null }
  }).lean();

  profiles.forEach((p, i) => {
    console.log('=== Profile', i + 1, '===');
    console.log('sessionIds:', p.identifiers.sessionIds);
    console.log('cartTokens:', p.identifiers.cartTokens);
    console.log('pushTokens:', p.identifiers.pushTokens ?
      p.identifiers.pushTokens.map(t => t.substring(0,15)+'...') : []);
    console.log('emails:', p.identifiers.emails);
    console.log('stage:', p.stage);
  });

  mongoose.disconnect();
});
