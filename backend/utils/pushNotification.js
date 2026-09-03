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

    const staleTokens = [];
    response.responses?.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          staleTokens.push(tokens[i]);
        }
      }
    });
    if (staleTokens.length > 0) {
      await PushSubscription.deleteMany({ token: { $in: staleTokens } });
      console.log(`[push] Deleted ${staleTokens.length} stale owner token(s)`);
    }

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
async function sendPushToCustomers(shopDomain, title, body, url, imageUrl, mobileOnly = true, cartToken = null, skipStaleCleanup = false, customerId = null) {
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

    const query = { shopDomain: shop };
    if (mobileOnly) {
      query.deviceType = { $in: ['mobile', 'unknown'] };
    }
    if (cartToken) {
      query.cartToken = cartToken;
      console.log(`[push-customer] targeting cartToken: ${cartToken}`);

      // Get ALL rows matching this cartToken, sorted by most recent.
      const cartSubs = await CustomerPushSubscription.find(query)
        .sort({ lastActivityAt: -1 });

      // Try each matching row until one succeeds.
      for (const sub of cartSubs) {
        console.log(`[push-customer] trying token: ${sub.token.substring(0, 20)}...`);
        const message = {
          data: {
            url: url || `https://${shopDomain}`,
            imageUrl: imageUrl || '',
            title: title,
            body: body,
            icon: imageUrl || 'https://img.icons8.com/color/96/shopping-cart--v1.png',
          },
          webpush: {
            headers: { Urgency: 'high' },
            notification: {
              title,
              body,
              icon: imageUrl || 'https://img.icons8.com/color/96/shopping-cart--v1.png',
              image: imageUrl || undefined,
              badge: 'https://img.icons8.com/color/96/shopping-cart--v1.png',
              requireInteraction: false,
              vibrate: [200, 100, 200],
            },
            fcm_options: { link: url || `https://${shopDomain}` },
          },
          tokens: [sub.token],
        };
        const response = await getMessaging().sendEachForMulticast(message);
        const result = response.responses[0];
        if (result.success) {
          console.log(`[push] Sent 1/1 to targeted device of ${shop}`);
          return { success: true, sent: 1, tokensFound: cartSubs.length };
        }
        // Token is stale — delete and try next.
        const code = result.error?.code || '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          await CustomerPushSubscription.deleteMany({ token: sub.token });
          console.log(`[push-customer] Deleted stale token, trying next...`);
        } else {
          // Non-stale error — stop trying.
          console.error(`[push-customer] token FAILED: ${code || result.error?.message}`);
          break;
        }
      }

      // No cartToken match succeeded — fall back to most recent
      // mobile subscriber for this shop (cart token may have rotated).
      console.log(`[push-customer] cartToken fallback — trying most recent mobile subscriber`);
      const fallbackQuery = {
        shopDomain: shop,
        deviceType: { $in: ['mobile', 'unknown'] }
      };
      if (customerId) {
        fallbackQuery.customerId = customerId;
        console.log(`[push-customer] fallback targeting customerId: ${customerId}`);
      }
      const fallbackSub = await CustomerPushSubscription.findOne(fallbackQuery)
        .sort({ lastActivityAt: -1 });

      if (!fallbackSub) {
        console.log(`[push] No customer subscribers for ${shop}`);
        return { success: true, sent: 0, tokensFound: 0 };
      }

      console.log(`[push-customer] fallback token: ${fallbackSub.token.substring(0, 20)}...`);
      const fallbackMessage = {
        data: {
          url: url || `https://${shopDomain}`,
          imageUrl: imageUrl || '',
          title: title,
          body: body,
          icon: imageUrl || 'https://img.icons8.com/color/96/shopping-cart--v1.png',
        },
        webpush: {
          headers: { Urgency: 'high' },
          notification: {
            title,
            body,
            icon: imageUrl || 'https://img.icons8.com/color/96/shopping-cart--v1.png',
            image: imageUrl || undefined,
            badge: 'https://img.icons8.com/color/96/shopping-cart--v1.png',
            requireInteraction: false,
            vibrate: [200, 100, 200],
          },
          fcm_options: { link: url || `https://${shopDomain}` },
        },
        tokens: [fallbackSub.token],
      };
      const fallbackResponse = await getMessaging().sendEachForMulticast(fallbackMessage);
      const fallbackResult = fallbackResponse.responses[0];
      if (fallbackResult.success) {
        console.log(`[push] Sent 1/1 via fallback to ${shop}`);
        return { success: true, sent: 1, tokensFound: 1 };
      }
      const fallbackCode = fallbackResult.error?.code || '';
      if (
        fallbackCode === 'messaging/registration-token-not-registered' ||
        fallbackCode === 'messaging/invalid-registration-token'
      ) {
        await CustomerPushSubscription.deleteMany({ token: fallbackSub.token });
        console.log(`[push-customer] Deleted stale fallback token`);
      }
      console.log(`[push] No active subscribers found for ${shop}`);
      return { success: true, sent: 0, tokensFound: 0 };
    }
    const subs = await CustomerPushSubscription.find(query);
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
      data: {
        url: url || `https://${shopDomain}`,
        imageUrl: imageUrl || '',
        title: title,
        body: body,
        icon: imageUrl || 'https://img.icons8.com/color/96/shopping-cart--v1.png',
      },
      webpush: {
        headers: {
          Urgency: 'high',
        },
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
      tokens,
    };
    const response = await getMessaging().sendEachForMulticast(message);

    console.log('[push-customer] FCM responses:', JSON.stringify(response.responses, null, 2));

    const staleTokens = [];
    response.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || '';
        const msg = r.error?.message || 'unknown error';
        console.error(`[push-customer] token ${i + 1} FAILED: ${code || msg}`);
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          staleTokens.push(tokens[i]);
        }
      }
    });

    if (staleTokens.length > 0 && !skipStaleCleanup) {
      await CustomerPushSubscription.deleteMany({ token: { $in: staleTokens } });
      console.log(`[push-customer] Deleted ${staleTokens.length} stale token(s)`);
    } else if (staleTokens.length > 0 && skipStaleCleanup) {
      console.log(`[push-customer] ${staleTokens.length} stale token(s) found but not deleted (skipStaleCleanup)`);
    }

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
