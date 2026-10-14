'use strict';

const B = '•'; // bullet character

/**
 * maskEmail('priya.shah@gmail.com') → 'p••••@gmail.com'
 * First character, four bullets, @ + domain.
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const at = email.lastIndexOf('@');
  if (at < 1) return (email[0] || '') + B.repeat(4);
  return email[0] + B.repeat(4) + email.slice(at);
}

/**
 * maskPhone('+919800000214') → '+91 ••••• ••214'
 * Treats the first two digits after '+' as the country code (covers most
 * 2-digit country codes: +91 India, +44 UK, +61 AU, etc.).
 * Shows: country-code, masked middle split into groups, last 3 digits.
 */
function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  if (!phone.startsWith('+')) return B.repeat(6);
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 5) return '+' + B.repeat(digits.length);
  const cc       = '+' + digits.slice(0, 2);          // e.g. '+91'
  const national = digits.slice(2);                    // e.g. '9800000214'
  if (national.length <= 3) return cc + ' ' + B.repeat(national.length);
  const last3  = national.slice(-3);
  const midLen = national.length - 3;
  const part1  = B.repeat(Math.min(5, midLen));
  const part2  = midLen > 5 ? B.repeat(midLen - 5) : '';
  const mid    = part2 ? part1 + ' ' + part2 : part1;
  return cc + ' ' + mid + last3;
}

/**
 * anonymousLabel('507f1f77bcf86cd799439011') → 'Anonymous · #39011'
 * Used when a profile has no email or phone on file.
 */
function anonymousLabel(profileId) {
  if (!profileId) return 'Anonymous';
  return 'Anonymous · #' + String(profileId).slice(-5);
}

module.exports = { maskEmail, maskPhone, anonymousLabel };
