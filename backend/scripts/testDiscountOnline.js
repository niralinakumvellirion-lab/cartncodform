require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const Store = require('../models/Store');
  const store = await Store.findOne({
    shopDomain: 'cartncod-form.myshopify.com'
  });

  const token = store.onlineAccessToken || store.accessToken;
  console.log('Using token:', token?.slice(0, 15));

  const code = 'PUSH_TEST_' + Date.now().toString(36).toUpperCase();
  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) {
                nodes { code }
              }
            }
          }
        }
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
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          basicCodeDiscount: {
            title: code,
            code,
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
            customerGets: {
              value: { percentage: 0.10 },
              items: { all: true }
            },
            appliesOncePerCustomer: true,
            usageLimit: 100,
            // Mirrors discounts.js: required as of the 2024-10+ discounts
            // schema — without it Shopify returns userErrors "Context can't
            // be blank". { all: 'ALL' } = applies to every buyer.
            context: { all: 'ALL' },
          }
        }
      })
    }
  );
  const data = await res.json();
  console.log('Result:', JSON.stringify(data, null, 2));
  mongoose.disconnect();
  process.exit(0);
}).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
