const jwt = require('jsonwebtoken');
const Store = require('../models/Store');

/**
 * Verifies a Shopify App Bridge session token (Authorization: Bearer <token>).
 * The token is an HS256 JWT signed with the app's API secret. On success it
 * attaches the token's shop domain to req.shopDomain. Does NOT check that the
 * shop matches the requested resource — see requireStoreOwner for that.
 */
function requireAuth(req, res, next) {
  const authHeader = req.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error('[auth] SHOPIFY_API_SECRET not configured on backend');
    return res.status(500).json({ error: 'Server auth misconfigured' });
  }

  // 1. Decode without verifying, so a malformed token fails fast and clearly.
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header || !decoded.payload) {
    return res.status(401).json({ error: 'Malformed session token' });
  }

  // 2. Verify the signature (HS256, app secret). Time claims are validated
  //    manually below so the app's exact rules (incl. the 10s nbf skew) apply.
  let payload;
  try {
    payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      ignoreExpiration: true,
      ignoreNotBefore: true,
    });
  } catch (err) {
    console.error('[auth] Session token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid session token' });
  }

  // 3. Validate the claims.
  const nowSec = Date.now() / 1000;

  // iss: a real Shopify session token's iss is
  // "https://<shop>.myshopify.com/admin" — the trailing "/admin" is stripped
  // before the host check (see SESSION_TOKEN_SWAP_AUDIT.txt, deviation note).
  if (
    typeof payload.iss !== 'string' ||
    !payload.iss.startsWith('https://') ||
    !payload.iss.replace(/\/admin\/?$/, '').endsWith('.myshopify.com')
  ) {
    return res.status(401).json({ error: 'Session token: invalid iss claim' });
  }
  if (
    typeof payload.dest !== 'string' ||
    !payload.dest.startsWith('https://') ||
    !payload.dest.endsWith('.myshopify.com')
  ) {
    return res.status(401).json({ error: 'Session token: invalid dest claim' });
  }
  if (payload.aud !== process.env.SHOPIFY_API_KEY) {
    return res.status(401).json({ error: 'Session token: aud does not match this app' });
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    return res.status(401).json({ error: 'Session token expired' });
  }
  if (typeof payload.nbf !== 'number' || payload.nbf > nowSec + 10) {
    return res.status(401).json({ error: 'Session token not yet valid' });
  }

  // 4. Extract the shop domain from `dest` and attach it.
  let shopDomain;
  try {
    shopDomain = new URL(payload.dest).hostname;
  } catch (err) {
    return res.status(401).json({ error: 'Session token: unparseable dest claim' });
  }

  req.shopDomain = shopDomain;
  next();
}

/**
 * Requires requireAuth to have run first (sets req.shopDomain).
 * Loads the Store for that shop and asserts the token's shop matches the
 * shop named in the request path (IDOR protection). Attaches the loaded
 * store to req.store for downstream handlers to reuse.
 */
async function requireStoreOwner(req, res, next) {
  try {
    const store = await Store.findOne({ shopDomain: req.shopDomain });
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    if (req.shopDomain !== req.params.shopDomain) {
      return res.status(403).json({ error: 'Not authorized for this store' });
    }

    req.store = store;
    next();
  } catch (err) {
    console.error('[auth] requireStoreOwner error:', err.message);
    return res.status(500).json({ error: 'Authorization check failed' });
  }
}

/**
 * Requires requireStoreOwner to have run first (sets req.store).
 * Blocks access unless the store's plan is 'pro'.
 */
function requirePaidPlan(req, res, next) {
  if (!req.store) {
    return res.status(500).json({ error: 'requirePaidPlan must run after requireStoreOwner' });
  }
  if (req.store.plan !== 'pro') {
    return res.status(402).json({
      error: 'This feature requires the Pro plan',
      upgradeRequired: true,
    });
  }
  next();
}

module.exports = { requireAuth, requireStoreOwner, requirePaidPlan };
