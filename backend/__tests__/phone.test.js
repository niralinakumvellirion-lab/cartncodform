/**
 * Tests for backend/utils/phone.js — normalizePhone and toWaDigits.
 */

jest.mock('libphonenumber-js', () => {
  // Minimal stub: treat strings starting with '+91' followed by 10 digits as valid,
  // and bare 10-digit Indian mobiles (starting with 6–9) as valid under 'IN'.
  const phoneNumberMap = {
    '+919876543210': '+919876543210',
    '+918888888888': '+918888888888',
    '+12025551234': '+12025551234',
  };
  const indianMobile = /^[6-9]\d{9}$/;
  const e164 = /^\+\d{7,15}$/;

  return {
    isValidPhoneNumber(raw, country) {
      const s = String(raw || '').trim();
      if (e164.test(s)) return s in phoneNumberMap || /^\+91[6-9]\d{9}$/.test(s);
      if (country === 'IN' && indianMobile.test(s)) return true;
      return false;
    },
    parsePhoneNumber(raw, country) {
      const s = String(raw || '').trim();
      const normalized = e164.test(s) ? s : `+91${s}`;
      return {
        format: (fmt) => (fmt === 'E.164' ? normalized : normalized),
      };
    },
  };
});

const { normalizePhone, toWaDigits } = require('../utils/phone');

describe('normalizePhone', () => {
  test('bare 10-digit Indian mobile → E.164', () => {
    expect(normalizePhone('9876543210', 'IN')).toBe('+919876543210');
  });

  test('already E.164 → unchanged', () => {
    expect(normalizePhone('+919876543210', 'IN')).toBe('+919876543210');
  });

  test('invalid string → null', () => {
    expect(normalizePhone('not-a-phone', 'IN')).toBeNull();
  });

  test('empty string → null', () => {
    expect(normalizePhone('', 'IN')).toBeNull();
  });

  test('null → null', () => {
    expect(normalizePhone(null, 'IN')).toBeNull();
  });

  test('undefined → null', () => {
    expect(normalizePhone(undefined, 'IN')).toBeNull();
  });

  test('defaults to IN country code', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
  });
});

describe('toWaDigits', () => {
  test('strips leading +', () => {
    expect(toWaDigits('+919876543210')).toBe('919876543210');
  });

  test('no + → unchanged', () => {
    expect(toWaDigits('919876543210')).toBe('919876543210');
  });

  test('null → null', () => {
    expect(toWaDigits(null)).toBeNull();
  });

  test('empty/falsy → null', () => {
    expect(toWaDigits('')).toBeNull();
  });
});
