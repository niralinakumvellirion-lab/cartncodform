require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Profile = require('./models/Profile');

  // Get email profiles and their cartTokens
  const profiles = await Profile.find({
    'channels.email.address': { $exists: true, $ne: null }
  }).lean();

  console.log('=== EMAIL PROFILE CART TOKENS ===');
  profiles.forEach((p, i) => {
    console.log('Profile', i+1, 'cartTokens:', p.identifiers.cartTokens);
  });

  // Check AbandonedCustomer collection
  const db = mongoose.connection.db;
  const abandonedCount = await db.collection('abandonedcustomers').countDocuments();
  console.log('\n=== ABANDONED CUSTOMERS COLLECTION ===');
  console.log('Total documents:', abandonedCount);

  // Show recent ones
  const recent = await db.collection('abandonedcustomers')
    .find({})
    .sort({ updatedAt: -1 })
    .limit(5)
    .toArray();

  console.log('Recent 5:');
  recent.forEach(a => {
    console.log('  sessionId(cartToken):', a.sessionId,
      '| hasEmail:', !!a.email,
      '| updatedAt:', a.updatedAt);
  });

  // Check if any email profile cartToken matches AbandonedCustomer
  console.log('\n=== CART TOKEN MATCHES ===');
  for (const p of profiles) {
    const cartTokens = p.identifiers.cartTokens || [];
    for (const ct of cartTokens) {
      const match = await db.collection('abandonedcustomers')
        .findOne({ sessionId: ct });
      console.log('cartToken:', ct, '-> match:', !!match);
    }
  }

  mongoose.disconnect();
});
