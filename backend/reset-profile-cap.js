require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Profile = require('./models/Profile');

  // Reset message history for email profiles so frequency cap clears
  const profiles = await Profile.find({
    'channels.email.address': { $exists: true, $ne: null }
  }).lean();

  for (const p of profiles) {
    await Profile.updateOne(
      { _id: p._id },
      { $set: { messages: [] } }
    );
    console.log('Reset profile:', p._id.toString());
  }

  console.log('Done — frequency caps cleared for', profiles.length, 'profiles');
  mongoose.disconnect();
});
