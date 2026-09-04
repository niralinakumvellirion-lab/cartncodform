const axios = require('axios');

/**
 * Execute a GraphQL query/mutation against the Shopify Admin API.
 */
async function shopifyGraphQL(shop, accessToken, query, variables = {}) {
  const res = await axios.post(
    `https://${shop}/admin/api/2025-01/graphql.json`,
    { query, variables },
    {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    }
  );
  if (res.data.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(res.data.errors)}`);
  }
  return res.data.data;
}

module.exports = { shopifyGraphQL };
