require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const axios = require('axios');

// This uses the Shopify Admin API to verify the current
// token has write_discounts scope
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Store = require('../models/Store');
  const store = await Store.findOne({
    shopDomain: 'cartncod-form.myshopify.com'
  });

  // Check current token scopes
  const res = await axios.get(
    'https://cartncod-form.myshopify.com/admin/api/2025-07/graphql.json',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': store.accessToken,
      },
      data: JSON.stringify({
        query: '{ shop { name } }'
      })
    }
  ).catch(e => ({ data: e.response?.data }));

  console.log('Token test:', JSON.stringify(res.data));
  mongoose.disconnect();
});
