const { parsePhoneNumber, isValidPhoneNumber } = require('libphonenumber-js');

/**
 * Normalize a raw phone string to E.164 format.
 * Returns null if the input cannot be parsed as a valid number.
 */
function normalizePhone(raw, defaultCountry = 'IN') {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;
  try {
    if (!isValidPhoneNumber(str, defaultCountry)) return null;
    return parsePhoneNumber(str, defaultCountry).format('E.164');
  } catch {
    return null;
  }
}

/**
 * Strip the leading '+' from an E.164 number for use in wa.me URLs.
 * wa.me/<digits> expects digits only, no '+'.
 */
function toWaDigits(e164) {
  if (!e164) return null;
  return e164.replace(/^\+/, '');
}

module.exports = { normalizePhone, toWaDigits };
