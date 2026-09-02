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
async function sendPushToCustomers(shopDomain, title, body, url, imageUrl) {
  const CustomerPushSubscription = require('../models/CustomerPushSubscription');
  try {
    if (!firebaseReady) {
      console.log('[push] Skipped (customers) — Firebase Admin not configured');
      return { success: false, error: 'Firebase Admin not configured', tokensFound: 0 };
    }

    // Docs are stored with a lowercased shopDomain — normalise the lookup key
    // so a mixed-case caller still matches.
    const shop = String(shopDomain || '').trim().toLowerCase();
    console.log(`[push-customer] querying subscriptions for shopDomain: ${shop}`);

    const subs = await CustomerPushSubscription.find({ shopDomain: shop });
    if (!subs.length) {
      console.log(`[push] No customer subscribers for ${shop}`);
      return { success: true, sent: 0, tokensFound: 0 };
    }
    const tokens = subs.map((s) => s.token);
    tokens.forEach((t, i) => {
      console.log(`[push-customer] token ${i + 1}/${tokens.length}: ${t}`);
    });

    console.log('[push-customer] imageUrl received:', imageUrl || 'NONE');
    console.log('[push-customer] webpush notification image:',
      imageUrl ? imageUrl.substring(0, 50) + '...' : 'NOT SET');

    const message = {
      notification: {
        title,
        body,
        imageUrl: imageUrl || undefined,
      },
      webpush: {
        notification: {
          title,
          body,
          icon: imageUrl || 'https://img.icons8.com/color/96/shopping-cart--v1.png',
          image: imageUrl || undefined,
          badge: 'https://img.icons8.com/color/96/shopping-cart--v1.png',
          requireInteraction: false,
          vibrate: [200, 100, 200],
        },
        fcm_options: {
          link: url || `https://${shopDomain}`,
        },
      },
      data: {
        url: url || `https://${shopDomain}`,
        imageUrl: imageUrl || '',
        title: title,
        body: body,
      },
      tokens,
    };
    const response = await getMessaging().sendEachForMulticast(message);

    console.log('[push-customer] FCM responses:', JSON.stringify(response.responses, null, 2));
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const e = r.error || {};
        console.error(
          `[push-customer] token ${i + 1} FAILED: ${e.code || e.message || 'unknown error'}`
        );
      }
    });

    console.log(
      `[push] Sent ${response.successCount}/${tokens.length} to customers of ${shop}`
    );
    return { success: true, sent: response.successCount, tokensFound: tokens.length };
  } catch (err) {
    console.error('[push] Error (customers):', err.message);
    return { success: false, error: err.message, tokensFound: 0 };
  }
}

module.exports = { sendPushToStore, sendPushToCustomers };
