'use strict';

const express    = require('express');
const rateLimit  = require('express-rate-limit');
const jwt        = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const AuditLog = require('../../models/AuditLog');
const Staff    = require('../../models/Staff');
const { logAudit } = require('../../utils/auditLog');
const { requireStaff, requireRole } = require('../../middleware/requireStaff');
const storesRouter = require('./stores');
const staffRouter  = require('./staff');

const PLATFORM_ISS = 'shopireachboost-platform';
const PLATFORM_AUD = 'platform-admin';

// ── Configuration guard ──────────────────────────────────────────────────────
// Validate PLATFORM_JWT_SECRET at module load time. If misconfigured, every
// route in this router answers 503. The rest of the app is unaffected.

function isPlatformConfigured() {
  const secret = process.env.PLATFORM_JWT_SECRET;
  if (!secret) return false;
  if (secret.length < 32) return false;
  if (secret === process.env.SHOPIFY_API_SECRET) return false;
  return true;
}

let _configuredCache = null;
function platformConfigured() {
  if (_configuredCache === null) {
    _configuredCache = isPlatformConfigured();
    if (!_configuredCache) {
      console.warn('[platform] PLATFORM_JWT_SECRET is missing, too short, or equals SHOPIFY_API_SECRET — platform admin disabled');
    }
  }
  return _configuredCache;
}

// Export for testing (so tests can reset the cache).
function _resetConfigCache() { _configuredCache = null; }

// ── Rate limiters ────────────────────────────────────────────────────────────

const isTest = process.env.NODE_ENV === 'test';

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: 'Too many auth attempts. Try again in a minute.' },
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => isTest,
  message: { error: 'Too many requests.' },
});

// ── 503 guard middleware ─────────────────────────────────────────────────────

function requireConfigured(req, res, next) {
  if (!platformConfigured()) {
    return res.status(503).json({ error: 'Platform admin is not configured' });
  }
  next();
}

// ── Router ───────────────────────────────────────────────────────────────────

const router = express.Router();

// Apply rate limits: auth routes get the strict limiter; everything else general.
router.use('/auth', authLimiter);
router.use(generalLimiter);

// Apply config guard to all routes.
router.use(requireConfigured);

// ── POST /api/platform/auth/google ────────────────────────────────────────────

router.post('/auth/google', async (req, res) => {
  const { idToken } = req.body || {};
  if (!idToken || typeof idToken !== 'string') {
    return res.status(400).json({ error: 'idToken is required' });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'Google sign-in is not configured' });
  }

  // Verify the Google ID token.
  let ticket;
  try {
    const client = new OAuth2Client(clientId);
    ticket = await client.verifyIdToken({ idToken, audience: clientId });
  } catch {
    return res.status(401).json({ error: 'Invalid Google token' });
  }

  const googlePayload = ticket.getPayload();
  if (!googlePayload?.email_verified) {
    return res.status(403).json({ error: 'Google account email is not verified' });
  }

  const email = (googlePayload.email || '').toLowerCase().trim();
  if (!email) {
    return res.status(403).json({ error: 'This account is not allowed' });
  }

  const emailDomain = email.split('@')[1] || '';

  // Bootstrap: if the Staff collection is completely empty AND the email
  // matches PLATFORM_OWNER_EMAIL, create the first owner account.
  const staffCount = await Staff.countDocuments();
  if (staffCount === 0) {
    const ownerEmail = (process.env.PLATFORM_OWNER_EMAIL || '').toLowerCase().trim();
    if (!ownerEmail || email !== ownerEmail) {
      await logAudit({ staff: null, action: 'login_refused', meta: { emailDomain }, req });
      return res.status(403).json({ error: 'This account is not allowed' });
    }
    const newOwner = await Staff.create({
      email,
      name: googlePayload.name || '',
      role: 'owner',
      active: true,
      createdBy: 'bootstrap',
      lastLoginAt: new Date(),
    });
    const token = signToken(newOwner._id);
    await logAudit({ staff: { email: newOwner.email, role: newOwner.role }, action: 'login', req });
    return res.json({
      token,
      staff: { email: newOwner.email, name: newOwner.name, role: newOwner.role },
    });
  }

  // Normal path: look up existing, active staff member.
  const staff = await Staff.findOne({ email, active: true }).lean();
  if (!staff) {
    await logAudit({ staff: null, action: 'login_refused', meta: { emailDomain }, req });
    return res.status(403).json({ error: 'This account is not allowed' });
  }

  // Update lastLoginAt.
  await Staff.updateOne({ _id: staff._id }, { lastLoginAt: new Date() });
  await logAudit({ staff: { email: staff.email, role: staff.role }, action: 'login', req });

  const token = signToken(staff._id);
  return res.json({
    token,
    staff: { email: staff.email, name: staff.name || '', role: staff.role },
  });
});

// ── GET /api/platform/me ─────────────────────────────────────────────────────

router.get('/me', requireStaff, (req, res) => {
  const { email, name, role } = req.staff;
  return res.json({ email, name, role });
});

// ── GET /api/platform/audit ───────────────────────────────────────────────────

router.get('/audit', requireStaff, requireRole('owner', 'admin'), async (req, res) => {
  try {
    const { shopDomain, action } = req.query;
    const pageNum = Math.max(0, parseInt(req.query.page, 10) || 0);
    const limit   = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip    = pageNum * limit;

    const filter = {};
    if (shopDomain) filter.shopDomain = shopDomain;
    if (action)     filter.action     = action;

    // Allow-list projection: never return ip.
    const [logs, total] = await Promise.all([
      AuditLog.find(filter, 'at staffEmail staffRole action shopDomain meta -_id')
        .sort({ at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
    ]);

    return res.json({ total, page: pageNum, limit, logs });
  } catch (err) {
    console.error('[platform/audit] error:', err.message);
    return res.status(500).json({ error: 'Failed to load audit log' });
  }
});

// ── /api/platform/stores (sub-router) ────────────────────────────────────────

router.use('/stores', storesRouter);

// ── /api/platform/staff (sub-router) ─────────────────────────────────────────

router.use('/staff', staffRouter);

// ── Helpers ───────────────────────────────────────────────────────────────────

function signToken(staffId) {
  return jwt.sign(
    { sub: String(staffId) },
    process.env.PLATFORM_JWT_SECRET,
    {
      algorithm:  'HS256',
      expiresIn:  '8h',
      issuer:     PLATFORM_ISS,
      audience:   PLATFORM_AUD,
    }
  );
}

module.exports = router;
module.exports._resetConfigCache = _resetConfigCache;
