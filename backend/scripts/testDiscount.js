require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Store = require('../models/Store');
  const store = await Store.findOne({
    shopDomain: 'cartncod-form.myshopify.com'
  });

  console.log('accessToken exists:', !!store?.accessToken);
  console.log('accessToken prefix:',
    store?.accessToken?.slice(0, 10));

  const mutation = `
    mutation discountCodeBasicCreate(
      $basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(
        basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }
  `;

  const res = await fetch(
    'https://cartncod-form.myshopify.com/admin/api/2025-01/graphql.json',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': store.accessToken,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          basicCodeDiscount: {
            title: 'TEST_DISC',
            code: 'TEST_DISC_' + Date.now(),
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() +
              7*24*60*60*1000).toISOString(),
            customerGets: {
              value: { percentage: 0.10 },
              items: { all: true },
            },
            appliesOncePerCustomer: true,
            usageLimit: 100,
          }
        }
      })
    }
  );

  const data = await res.json();
  console.log('Response:', JSON.stringify(data, null, 2));
  mongoose.disconnect();
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
