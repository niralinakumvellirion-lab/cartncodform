// A store may use the app only while it has an active Shopify subscription
// (plan 'pro' covers the free-trial period too) or is flagged internal.
function hasActivePlan(store) {
  if (!store) return false;
  return store.plan === 'pro' || store.isInternal === true;
}

const PLAN_REQUIRED_BODY = Object.freeze({
  error: 'A subscription is required. Start your free trial to continue.',
  code: 'PLAN_REQUIRED',
  upgradeRequired: true,
});

module.exports = { hasActivePlan, PLAN_REQUIRED_BODY };
