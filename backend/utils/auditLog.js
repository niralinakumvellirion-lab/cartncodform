'use strict';

const AuditLog = require('../models/AuditLog');

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
      meta:       meta       || null,
      ip:         typeof ip === 'string' ? ip.split(',')[0].trim() : null,
    });
  } catch (err) {
    // Log the problem but never expose what action or who failed — just the error class.
    console.error('[auditLog] failed to write audit row:', err.message);
  }
}

module.exports = { logAudit };
