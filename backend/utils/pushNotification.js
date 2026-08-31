// firebase-admin v14 exposes only the modular API from the default require:
//   admin.apps.length      -> getApps().length
//   admin.credential.cert  -> cert(...)
//   admin.messaging()      -> getMessaging()
// Behaviour / return shapes below match the original spec.
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

// Initialize only once. Guarded so a missing service-account config does not
// crash server startup — pushes simply no-op with an error until creds are set.
let firebaseReady = false;

if (!getApps().length) {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    try {
      initializeApp({
        credential: cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
      });
      firebaseReady = true;
      console.log('[push] Firebase Admin initialized');
    } catch (err) {
      console.error('[push] Firebase Admin init failed:', err.message);
    }
  } else {
    console.warn(
      '[push] FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY not set — push disabled'
    );
  }
} else {
  firebaseReady = true;
}

async function sendPushToStore(shopDomain, title, body) {
  const PushSubscription = require('../models/PushSubscription');
  try {
    if (!firebaseReady) {
      console.log('[push] Skipped — Firebase Admin not configured');
      return { success: false, error: 'Firebase Admin not configured' };
    }

    const subs = await PushSubscription.find({ shopDomain });
    if (!subs.length) {
      console.log(`[push] No subscribers for ${shopDomain}`);
      return { success: true, sent: 0 };
    }
    const tokens = subs.map((s) => s.token);
    const message = {
      notification: { title, body },
      tokens,
    };
    const response = await getMessaging().sendEachForMulticast(message);
    console.log(`[push] Sent ${response.successCount}/${tokens.length} for ${shopDomain}`);
    return { success: true, sent: response.successCount };
  } catch (err) {
    console.error('[push] Error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send a push notification to every STOREFRONT CUSTOMER who subscribed via the
 * Shopify theme script (CustomerPushSubscription), for one shop.
 */
async function sendPushToCustomers(shopDomain, title, body, url) {
  const CustomerPushSubscription = require('../models/CustomerPushSubscription');
  try {
    if (!firebaseReady) {
      console.log('[push] Skipped (customers) — Firebase Admin not configured');
      return { success: false, error: 'Firebase Admin not configured' };
    }

    const subs = await CustomerPushSubscription.find({ shopDomain });
    if (!subs.length) {
      console.log(`[push] No customer subscribers for ${shopDomain}`);
      return { success: true, sent: 0 };
    }
    const tokens = subs.map((s) => s.token);
    const message = {
      notification: { title, body },
      data: url ? { url: String(url) } : {},
      tokens,
    };
    const response = await getMessaging().sendEachForMulticast(message);
    console.log(
      `[push] Sent ${response.successCount}/${tokens.length} to customers of ${shopDomain}`
    );
    return { success: true, sent: response.successCount };
  } catch (err) {
    console.error('[push] Error (customers):', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendPushToStore, sendPushToCustomers };
