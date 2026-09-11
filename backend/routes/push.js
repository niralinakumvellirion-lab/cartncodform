const express = require('express');
const PushSubscription = require('../models/PushSubscription');
const CustomerPushSubscription = require('../models/CustomerPushSubscription');
const { sendPushToStore, sendPushToCustomers } = require('../utils/pushNotification');
const { sendAbandonedCartEmail } = require('../utils/email');
const { fetchProductImage } = require('./webhooks');
const { requireAuth } = require('../middleware/requireOwner');
const { upsertProfile } = require('../services/profileService');
const { Resend } = require('resend');

// Same safe-fallback pattern as utils/email.js: the Resend constructor
// throws if the key is falsy, which would otherwise take this whole route
// file down on load in an environment where RESEND_API_KEY is unset.
const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder_no_key');

const router = express.Router();

/**
 * POST /api/push/subscribe
 * Body: { shopDomain, token }
 * Upserts the FCM token for a store (token is unique).
 */
router.post('/subscribe', async (req, res) => {
  try {
    const { shopDomain, token } = req.body;

    if (!shopDomain || !token) {
      return res.status(400).json({ error: 'shopDomain and token are required' });
    }

    await PushSubscription.findOneAndUpdate(
      { token },
      { shopDomain: shopDomain.trim().toLowerCase(), token },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`[push] Subscribed token for ${shopDomain}`);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[push] POST /subscribe error:', err.message);
    return res.status(500).json({ error: 'Failed to save push subscription' });
  }
});

/**
 * POST /api/push/send
 * Body: { shopDomain, title, body }
 * Sends a notification to every token registered for the store.
 */
router.post('/send', requireAuth, async (req, res) => {
  try {
    const { shopDomain, title, body } = req.body;

    const Store = require('../models/Store');
    const store = await Store.findOne({ shopDomain: shopDomain?.trim().toLowerCase() });
    if (!store || req.shopDomain !== shopDomain?.trim().toLowerCase()) {
      return res.status(403).json({ error: 'Not authorized for this store' });
    }

    if (!shopDomain || !title || !body) {
      return res.status(400).json({ error: 'shopDomain, title and body are required' });
    }

    const result = await sendPushToStore(shopDomain, title, body);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    return res.json({ success: true, sent: result.sent || 0 });
  } catch (err) {
    console.error('[push] POST /send error:', err.message);
    return res.status(500).json({ error: 'Failed to send push notification' });
  }
});

/**
 * POST /api/push/subscribe-customer
 * Body: { shopDomain, token, oldToken, page }
 * Upserts a storefront-customer FCM token (from the Shopify theme script) and
 * cleans up a superseded token if one was supplied.
 */
router.post('/subscribe-customer', async (req, res) => {
  try {
    const { shopDomain, token, oldToken, page, deviceType, cartToken, customerId, ccfSessionId } = req.body;

    // Normalize cartToken — strip ?key=... suffix that /cart.js appends.
    const normalizedCartToken = cartToken
      ? cartToken.split('?')[0].trim() || null
      : null;

    if (!shopDomain || !token) {
      return res.status(400).json({ error: 'shopDomain and token required' });
    }

    const shop = shopDomain.trim().toLowerCase();

    // Remove old token if different from new token
    if (oldToken && oldToken !== token) {
      await CustomerPushSubscription.deleteOne({ token: oldToken });
      console.log(`[subscribe-customer] Removed old token for: ${shop}`);
    }

    // Upsert new token
    const result = await CustomerPushSubscription.findOneAndUpdate(
      { token },
      {
        shopDomain: shop,
        token,
        page: page || undefined,
        deviceType: deviceType || 'unknown',
        cartToken: normalizedCartToken || undefined,
        customerId: customerId || undefined,
        ccfSessionId: ccfSessionId || undefined,
        lastActivityAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Remove any OTHER rows with the same cartToken but a different
    // FCM token — prevents same-cart multi-row accumulation.
    if (normalizedCartToken) {
      await CustomerPushSubscription.deleteMany({
        shopDomain: shop,
        cartToken: normalizedCartToken,
        token: { $ne: token }
      });
    }

    // Identity resolution — fire-and-forget, never on the critical path.
    upsertProfile(shop, {
      sessionId: ccfSessionId,
      cartToken: normalizedCartToken,
      pushToken: token,
    }, {
      'channels.push.subscribed': true,
      'channels.push.lastToken': token,
      'channels.push.subscribedAt': new Date(),
      lastSeenAt: new Date(),
    }).catch((err) => console.error('[profile] upsert error:', err.message));

    console.log(`[subscribe-customer] Token saved for: ${shop}`);
    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[subscribe-customer] Error:', err.message);
    return res.status(500).json({ error: 'Failed to save subscription' });
  }
});
/**
 * POST /api/push/send-customer
 * Body: { shopDomain, title, body, url, imageUrl }
 * Sends a notification to every storefront customer subscribed for the shop.
 */
router.post('/send-customer', requireAuth, async (req, res) => {
  try {
    const { shopDomain, title, body, url, imageUrl, cartToken, productId } = req.body;

    const Store = require('../models/Store');
    const store = await Store.findOne({ shopDomain: shopDomain?.trim().toLowerCase() });
    if (!store || req.shopDomain !== shopDomain?.trim().toLowerCase()) {
      return res.status(403).json({ error: 'Not authorized for this store' });
    }

    console.log(`[send-customer] shopDomain received: ${shopDomain}`);
    console.log('[send-customer] imageUrl from request:', req.body.imageUrl || 'NONE');

    if (!shopDomain || !title || !body) {
      return res.status(400).json({ error: 'shopDomain, title and body are required' });
    }

    // Normalize cartToken — strip ?key=... suffix if present.
    const normalizedCartToken = cartToken
      ? cartToken.split('?')[0].trim() || null
      : null;

    // If a specific productId was passed, fetch its image from
    // Shopify Admin API to ensure we show the right product image.
    let resolvedImageUrl = imageUrl;
    if (productId && normalizedCartToken) {
      try {
        const Store = require('../models/Store');
        const store = await Store.findOne({
          shopDomain: shopDomain.trim().toLowerCase()
        });
        if (store && store.accessToken) {
          const fetchedImage = await fetchProductImage(
            shopDomain.trim().toLowerCase(),
            store.accessToken,
            String(productId)
          );
          if (fetchedImage) {
            resolvedImageUrl = fetchedImage;
            console.log(`[send-customer] Fetched image for product ${productId}: ${fetchedImage.substring(0, 50)}...`);
          }
        }
      } catch (e) {
        console.log(`[send-customer] Image fetch failed for product ${productId}:`, e.message);
      }
    }

    const result = await sendPushToCustomers(
      shopDomain, title, body, url, resolvedImageUrl,
      false,
      normalizedCartToken || null,
      normalizedCartToken ? false : true
    );

    console.log(`[send-customer] tokens found: ${result.tokensFound ?? 0}`);
    console.log(`[send-customer] FCM result: ${JSON.stringify(result)}`);

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    return res.json({ success: true, sent: result.sent || 0 });
  } catch (err) {
    console.error('[push] POST /send-customer error:', err.message);
    return res.status(500).json({ error: 'Failed to send customer push notification' });
  }
});

/**
 * POST /api/push/cart-activity
 * Body: { shopDomain, token, event, url }
 * Records storefront cart activity on the customer subscription.
 */
router.post('/cart-activity', async (req, res) => {
  try {
    const { shopDomain, token, event, url, ccfSessionId, cartToken } = req.body;

    console.log(`[cart-activity] shopDomain: ${shopDomain}, event: ${event}`);

    if (!shopDomain || !token) {
      return res.status(400).json({ error: 'shopDomain and token are required' });
    }

    // Find the subscription by token and stamp its last activity.
    const sub = await CustomerPushSubscription.findOneAndUpdate(
      { token },
      {
        lastEvent: event || 'unknown',
        lastActivityUrl: url || undefined,
        lastActivityAt: new Date(),
      },
      { new: true }
    );
    if (!sub) {
      console.log('[cart-activity] no CustomerPushSubscription matched this token');
    }

    // Identity resolution — fire-and-forget; this beacon fires on every event.
    upsertProfile(shopDomain, {
      sessionId: ccfSessionId,
      cartToken: cartToken || null,
      pushToken: token || null,
    }, {
      lastSeenAt: new Date(),
    }).catch((err) => console.error('[profile] upsert error:', err.message));

    // Phase F — a page_view from a suppressed profile lifts push suppression.
    if (event === 'page_view' && ccfSessionId) {
      const { clearPushSuppression } = require('../services/pushHygiene');
      const Profile = require('../models/Profile');
      const shop = shopDomain.trim().toLowerCase();
      const profile = await Profile.findOne({
        shopDomain: shop,
        'identifiers.sessionIds': ccfSessionId,
      });
      if (profile) {
        clearPushSuppression(profile._id, shop)
          .catch((err) => console.error('[hygiene] resubscribe error:', err.message));
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[push] POST /cart-activity error:', err.message);
    return res.status(500).json({ error: 'Failed to record cart activity' });
  }
});

/**
 * POST /api/push/send-email-test
 * Body: { shopDomain, cartToken, subject, body }
 * Sends a one-off abandoned-cart email to the customer on file for a cart,
 * so the merchant can preview the email content from the dashboard.
 */
router.post('/send-email-test', requireAuth, async (req, res) => {
  try {
    const { shopDomain, cartToken, subject, body } = req.body;
    const shop = shopDomain?.trim().toLowerCase();

    // IDOR: the verified token's shop must match the shop being acted on.
    if (req.shopDomain !== shop) {
      return res.status(403).json({ error: 'Not authorized for this store' });
    }

    const AbandonedCustomer = require('../models/AbandonedCustomer');
    const customer = await AbandonedCustomer.findOne({
      shopDomain: shop,
      sessionId: cartToken,
    });
    if (!customer || !customer.email) {
      return res.status(404).json({ error: 'No customer email found for this cart' });
    }

    const result = await sendAbandonedCartEmail(customer, {
      subject,
      body,
      cartUrl: `https://${shopDomain}/cart`,
    });

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[push] POST /send-email-test error:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to send test email' });
  }
});

/**
 * POST /api/push/send-journey
 * Body: { profileId, title, body, url }
 * Sends a one-off push to a single customer from the Journey screen.
 *
 * There is no :shopDomain in this route's path, so requireStoreOwner (which
 * compares req.shopDomain to req.params.shopDomain) doesn't apply here — the
 * route uses requireAuth only and scopes the Profile lookup by the verified
 * shopDomain from the session token itself (never a client-supplied value),
 * which is what actually prevents one shop from pushing to another shop's
 * customer via a guessed/leaked profileId.
 */
async function sendJourneyPush(shopDomain, { profileId, title, body, url }) {
  const Profile = require('../models/Profile');

  if (!profileId || !title || !body) {
    return { status: 400, payload: { error: 'profileId, title and body are required' } };
  }

  const shop = String(shopDomain || '').trim().toLowerCase();
  const profile = await Profile.findOne({ _id: profileId, shopDomain: shop });

  if (!profile || !profile.channels?.push?.subscribed) {
    return { status: 400, payload: { error: 'No push subscription' } };
  }

  const cartToken = profile.identifiers?.cartTokens?.[0] || null;
  const result = await sendPushToCustomers(
    shop, title, body, url, null, false, cartToken
  );

  if (!result.success) {
    return { status: 500, payload: { success: false, error: result.error } };
  }
  return { status: 200, payload: result };
}

router.post('/send-journey', requireAuth, async (req, res) => {
  try {
    const { profileId, title, body, url } = req.body;
    const { status, payload } = await sendJourneyPush(req.shopDomain, { profileId, title, body, url });
    return res.status(status).json(payload);
  } catch (err) {
    console.error('[push] POST /send-journey error:', err.message);
    return res.status(500).json({ error: 'Failed to send journey notification' });
  }
});

/**
 * POST /api/push/send-journey-email
 * Body: { profileId, subject, body }
 * Sends a one-off email to a single customer from the Journey screen.
 *
 * Same IDOR consideration as sendJourneyPush above, and a real gap in the
 * given spec: it looked the profile up with `Profile.findById(profileId)`
 * alone — no shop scope at all — so any authenticated shop could email any
 * other shop's customer by guessing/reusing a profileId. Scoped by the
 * verified req.shopDomain from the session token instead, same fix as
 * sendJourneyPush.
 */
async function sendJourneyEmail(shopDomain, { profileId, subject, body }) {
  const Profile = require('../models/Profile');

  if (!profileId || !subject || !body) {
    return { status: 400, payload: { error: 'Missing fields' } };
  }

  const shop = String(shopDomain || '').trim().toLowerCase();
  const profile = await Profile.findOne({ _id: profileId, shopDomain: shop })
    .select('identifiers channels');
  if (!profile) {
    return { status: 404, payload: { error: 'Profile not found' } };
  }

  const email = profile.channels?.email?.address ||
    profile.identifiers?.emails?.[0];
  if (!email) {
    return { status: 400, payload: { error: 'No email address' } };
  }

  const { data, error } = await resend.emails.send({
    from: 'CartnCodForm <onboarding@resend.dev>',
    to: email,
    subject: subject,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,
        sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
        <div style="background:#fff;border-radius:12px;
          border:1px solid #e5e7eb;padding:32px">
          ${body.replace(/\n/g, '<br>')}
          <hr style="margin:24px 0;border:none;
            border-top:1px solid #f3f4f6">
          <p style="font-size:12px;color:#9ca3af;margin:0">
            You received this email because you subscribed
            to notifications from this store.
          </p>
        </div>
      </div>
    `,
  });

  if (error) {
    console.error('[email] Resend error:', error.message);
    return { status: 500, payload: { error: error.message } };
  }

  console.log('[email] Sent to profile:', profileId);
  return { status: 200, payload: { success: true, id: data?.id } };
}

router.post('/send-journey-email', requireAuth, async (req, res) => {
  try {
    const { profileId, subject, body } = req.body;
    const { status, payload } = await sendJourneyEmail(req.shopDomain, { profileId, subject, body });
    return res.status(status).json(payload);
  } catch (err) {
    console.error('[email] send-journey-email error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.sendJourneyPush = sendJourneyPush;
module.exports.sendJourneyEmail = sendJourneyEmail;
