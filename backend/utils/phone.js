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

/**
 * Return the national number from an E.164 phone (e.g. "+919876543210" → "9876543210").
 * Used by profileService to build backward-compat identity queries that match both
 * the E.164 form and the old raw national-number form stored by the COD form.
 * Returns null for non-E.164 input or parse errors.
 */
function getNationalNumber(e164) {
  if (!e164 || !e164.startsWith('+')) return null;
  try {
    return parsePhoneNumber(e164).nationalNumber || null;
  } catch {
    return null;
  }
}

module.exports = { normalizePhone, toWaDigits, getNationalNumber };
