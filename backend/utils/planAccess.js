// Every installed store may use the app: no subscription means the Free plan, which has usage limits
// (utils/plans.js) instead of being blocked. An uninstalled store has no access (the poller skips it);
// internal stores always do.
function hasActivePlan(store) {
  if (!store) return false;
  if (store.isInternal === true) return true;
  return store.subscriptionStatus !== 'uninstalled';
}

const PLAN_REQUIRED_BODY = Object.freeze({
  error: 'This app is not installed on your store. Reinstall it from the Shopify App Store.',
  code: 'PLAN_REQUIRED',
  upgradeRequired: true,
});

module.exports = { hasActivePlan, PLAN_REQUIRED_BODY };
