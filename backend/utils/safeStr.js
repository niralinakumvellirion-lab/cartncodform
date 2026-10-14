'use strict';

/**
 * Protect a string cell value against spreadsheet formula injection (=, +, -, @).
 * Same behaviour as the inline helper in routes/export.js — shared here so
 * platform report routes can import it without duplicating the logic.
 */
function safeStr(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.length === 0) return '';
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

module.exports = { safeStr };
