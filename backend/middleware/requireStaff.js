'use strict';

const jwt = require('jsonwebtoken');
const Staff = require('../models/Staff');

const PLATFORM_ISS = 'shopireachboost-platform';
const PLATFORM_AUD = 'platform-admin';

/**
 * Verify the platform JWT and load the Staff record on every request.
 * A Shopify App Bridge session token (iss ends .myshopify.com/admin) is
 * explicitly rejected so the two auth systems can never cross.
 * Sets req.staff = { id, email, name, role } on success.
 */
async function requireStaff(req, res, next) {
  const authHeader = req.get('Authorization') || '';
  const rawToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!rawToken) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  // Reject Shopify App Bridge tokens (their iss ends with .myshopify.com or /admin).
  const decoded = jwt.decode(rawToken, { complete: true });
  if (decoded?.payload?.iss && /myshopify\.com/.test(decoded.payload.iss)) {
    return res.status(401).json({ error: 'Shopify session tokens are not accepted here' });
  }

  const secret = process.env.PLATFORM_JWT_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'Platform admin is not configured' });
  }

  let payload;
  try {
    payload = jwt.verify(rawToken, secret, {
      algorithms: ['HS256'],
      issuer:   PLATFORM_ISS,
      audience: PLATFORM_AUD,
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Load the Staff record from the DB on every request so role/active changes
  // take effect without waiting for token expiry.
  let staff;
  try {
    staff = await Staff.findById(payload.sub).lean();
  } catch {
    return res.status(500).json({ error: 'Authorization check failed' });
  }

  if (!staff || !staff.active) {
    return res.status(401).json({ error: 'Account not found or deactivated' });
  }

  req.staff = {
    id:    String(staff._id),
    email: staff.email,
    name:  staff.name || '',
    role:  staff.role,
  };
  next();
}

/**
 * Returns middleware that allows only the given roles.
 * requireStaff must run first (sets req.staff).
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.staff) {
      return res.status(500).json({ error: 'requireRole must run after requireStaff' });
    }
    if (!roles.includes(req.staff.role)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }
    next();
  };
}

module.exports = { requireStaff, requireRole };
