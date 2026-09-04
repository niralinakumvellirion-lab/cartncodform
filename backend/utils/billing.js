const { shopifyGraphQL } = require('./shopifyGraphQL');

const PLAN_NAME = 'CartnCodForm Pro';
const PLAN_PRICE = 9.99;
const PLAN_CURRENCY = 'USD';
const TRIAL_DAYS = 7;

/**
 * Query Shopify for this shop's currently active subscription(s).
 * Returns the first ACTIVE subscription, or null.
 */
async function getActiveSubscription(shop, accessToken) {
  const query = `
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          test
        }
      }
    }
  `;
  const data = await shopifyGraphQL(shop, accessToken, query);
  const subs = data?.currentAppInstallation?.activeSubscriptions || [];
  return subs.find(s => s.status === 'ACTIVE') || null;
}

/**
 * Create a new app subscription. Returns the Shopify-hosted
 * confirmationUrl the merchant must visit to approve the charge.
 */
async function createSubscription(shop, accessToken, returnUrl, isTest) {
  const mutation = `
    mutation AppSubscriptionCreate(
      $name: String!
      $lineItems: [AppSubscriptionLineItemInput!]!
      $returnUrl: URL!
      $trialDays: Int
      $test: Boolean
    ) {
      appSubscriptionCreate(
        name: $name
        lineItems: $lineItems
        returnUrl: $returnUrl
        trialDays: $trialDays
        test: $test
      ) {
        confirmationUrl
        appSubscription {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    name: PLAN_NAME,
    returnUrl,
    trialDays: TRIAL_DAYS,
    test: !!isTest,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: PLAN_PRICE, currencyCode: PLAN_CURRENCY },
            interval: 'EVERY_30_DAYS',
          },
        },
      },
    ],
  };

  const data = await shopifyGraphQL(shop, accessToken, mutation, variables);
  const result = data?.appSubscriptionCreate;

  if (result?.userErrors?.length > 0) {
    throw new Error(`Billing error: ${JSON.stringify(result.userErrors)}`);
  }

  return {
    confirmationUrl: result?.confirmationUrl || null,
    subscriptionId: result?.appSubscription?.id || null,
  };
}

module.exports = { getActiveSubscription, createSubscription, PLAN_NAME, PLAN_PRICE };
