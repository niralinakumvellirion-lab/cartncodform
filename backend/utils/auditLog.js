'use strict';

const AuditLog = require('../models/AuditLog');

// Keys whose names match this pattern are removed from meta before saving.
// Exception: the exact key 'emailDomain' is always kept.
const KEY_DENY_RE = /(e-?mail|phone|token|session|cart|password|secret)/i;

// String values that look like email addresses or E.164 phone numbers are
// replaced with '[removed]' so callers cannot accidentally leak PII via meta.
const EMAIL_VALUE_RE  = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_VALUE_RE  = /^\+[1-9]\d{6,14}$/;

/**
 * Strip dangerous keys and values from a meta object before persisting.
 * Only shallow — nested objects are passed through as-is since our audit
 * meta is always flat by convention.
 */
function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return meta;
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k !== 'emailDomain' && KEY_DENY_RE.test(k)) continue;
    if (typeof v === 'string' && (EMAIL_VALUE_RE.test(v) || PHONE_VALUE_RE.test(v))) {
      out[k] = '[removed]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Create an audit log entry. Never throws — failures are logged to stderr
 * without any PII.
 *
 * @param {object} opts
 * @param {object|null} opts.staff   - req.staff ({ email, role }) or null for pre-auth events
 * @param {string}      opts.action  - short machine-readable action name, e.g. 'login'
 * @param {string}      [opts.shopDomain]
 * @param {object}      [opts.meta]  - MUST NOT contain shopper emails/phones/tokens
 * @param {object}      [opts.req]   - Express request (used to extract IP)
 */
async function logAudit({ staff, action, shopDomain, meta, req }) {
  try {
    const ip = req
      ? (req.ip || req.headers['x-forwarded-for'] || null)
      : null;
    await AuditLog.create({
      staffEmail: staff?.email || '',
      staffRole:  staff?.role  || '',
      action,
      shopDomain: shopDomain || null,
      meta:       sanitizeMeta(meta) ?? null,
      ip:         typeof ip === 'string' ? ip.split(',')[0].trim() : null,
    });
  } catch (err) {
    // Log the problem but never expose what action or who failed — just the error class.
    console.error('[auditLog] failed to write audit row:', err.message);
  }
}

module.exports = { logAudit, sanitizeMeta };
