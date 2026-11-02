const { shopifyGraphQL } = require('./shopifyGraphQL');

const PLAN_NAME = 'ShopiReachBoost AI Pro';
const PLAN_PRICE = 10;
const PLAN_CURRENCY = 'USD';
const TRIAL_DAYS = 30;

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
 * True for Shopify partner development stores. Those stores have no payment
 * method, so a real (non-test) charge cannot be approved there; the charge
 * must be created with test: true. Any error → false (treat as a real store).
 */
async function isDevelopmentShop(shop, accessToken) {
  try {
    const data = await shopifyGraphQL(
      shop,
      accessToken,
      'query { shop { plan { partnerDevelopment } } }'
    );
    return data?.shop?.plan?.partnerDevelopment === true;
  } catch (err) {
    console.warn('[billing] could not check development store flag:', err.message);
    return false;
  }
}

/**
 * Whether a new subscription for this shop must be a test charge: always
 * outside production, and on development stores in production.
 */
async function shouldUseTestCharge(shop, accessToken) {
  if (process.env.NODE_ENV !== 'production') return true;
  return isDevelopmentShop(shop, accessToken);
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

module.exports = { getActiveSubscription, createSubscription, isDevelopmentShop, shouldUseTestCharge, PLAN_NAME, PLAN_PRICE, PLAN_CURRENCY, TRIAL_DAYS };
