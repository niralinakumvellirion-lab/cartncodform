require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Store = require('../models/Store');
  const store = await Store.findOne({
    shopDomain: 'cartncod-form.myshopify.com'
  });
  console.log('Store found:', !!store);
  console.log('Token prefix:', store?.accessToken?.slice(0, 15));
  console.log('Installed at:', store?.installedAt);
  console.log('Updated at:', store?.updatedAt);
  mongoose.disconnect();
});
