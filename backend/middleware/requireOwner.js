const jwt = require('jsonwebtoken');
const Store = require('../models/Store');

/**
 * Verifies a NextAuth-issued JWT (Authorization: Bearer <token>),
 * extracts the authenticated email, and attaches it to req.userEmail.
 * Does NOT check store ownership — see requireStoreOwner for that.
 */
function requireAuth(req, res, next) {
  const authHeader = req.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  try {
    const secret = process.env.BACKEND_JWT_SECRET;
    if (!secret) {
      console.error('[auth] BACKEND_JWT_SECRET not configured on backend');
      return res.status(500).json({ error: 'Server auth misconfigured' });
    }
    const payload = jwt.verify(token, secret);
    const email = payload.email || (payload.user && payload.user.email);
    if (!email) {
      return res.status(401).json({ error: 'Token missing email claim' });
    }
    req.userEmail = String(email).trim().toLowerCase();
    next();
  } catch (err) {
    console.error('[auth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Requires requireAuth to have run first (sets req.userEmail).
 * Loads the Store by shopDomain (from req.params.shopDomain) and
 * asserts store.ownerEmail === req.userEmail. Attaches the loaded
 * store to req.store for downstream handlers to reuse.
 */
async function requireStoreOwner(req, res, next) {
  try {
    const shopDomain = (req.params.shopDomain || '').trim().toLowerCase();
    if (!shopDomain) {
      return res.status(400).json({ error: 'shopDomain required' });
    }

    const store = await Store.findOne({ shopDomain });
    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    if (!store.ownerEmail) {
      console.warn(`[auth] Store ${shopDomain} has no ownerEmail — denying access`);
      return res.status(403).json({ error: 'Store has no owner on record' });
    }

    if (store.ownerEmail !== req.userEmail) {
      return res.status(403).json({ error: 'Not authorized for this store' });
    }

    req.store = store;
    next();
  } catch (err) {
    console.error('[auth] requireStoreOwner error:', err.message);
    return res.status(500).json({ error: 'Authorization check failed' });
  }
}

module.exports = { requireAuth, requireStoreOwner };
