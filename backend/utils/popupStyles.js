/**
 * Backend-side mirror of the popup style registry. The admin's copy
 * (frontend/app/admin/lib/popupStyles.js) is the single source of truth
 * for what each style LOOKS like (labels, descriptions, defaults shown in
 * the UI); this file only needs enough to VALIDATE what the admin sends —
 * the style id itself, and the shape of each style's extra `styleFields`.
 *
 * Round 1 (this change): classic, flash_sale, gift_reveal only. Editorial
 * and Spotlight are NOT registered anywhere yet — adding a style later
 * means adding its id here (and to the Store.js enum, and to the admin
 * registry) alongside its own extra-field list.
 */

const STYLE_IDS = ['classic', 'flash_sale', 'gift_reveal'];

// Per-style extra-field definitions, used only to sanitize incoming
// styleFields: { key: 'boolean' | 'string' | { type: 'string', maxLength } }.
// styleFields is stored as ONE FLAT object across all styles (see the
// comment on Store.js's styleFields field) — sanitizeStyleFields therefore
// validates against the UNION of every registered style's fields, not just
// the currently-selected style, so a field that belongs to a style the
// shop isn't using right now is still preserved rather than stripped.
const STYLE_EXTRA_FIELDS = {
  classic: {},
  flash_sale: {
    countdownSource: { type: 'enum', values: ['discount_expiry', 'fixed_date'] },
    // ISO datetime string — validated as "looks like a date", not deeply.
    countdownEndsAt: { type: 'string', maxLength: 40 },
    badgeText: { type: 'string', maxLength: 24 },
  },
  gift_reveal: {
    giftIconEnabled: { type: 'boolean' },
    secondaryButtonStyle: { type: 'enum', values: ['pill', 'text-link'] },
    codeChipEmphasis: { type: 'boolean' },
  },
};

function isValidStyleId(id) {
  return STYLE_IDS.indexOf(id) !== -1;
}

/**
 * Sanitize a client-supplied styleFields object down to known keys, with
 * each value coerced/validated per STYLE_EXTRA_FIELDS. Unknown keys and
 * invalid values are dropped silently (same permissive-but-safe pattern
 * POPUP_FIELDS already uses elsewhere in routes/profiles.js) rather than
 * rejecting the whole save over one bad field.
 */
function sanitizeStyleFields(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const styleId of STYLE_IDS) {
    const fields = STYLE_EXTRA_FIELDS[styleId];
    for (const key of Object.keys(fields)) {
      if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
      const def = fields[key];
      const value = input[key];
      if (def.type === 'boolean') {
        out[key] = !!value;
      } else if (def.type === 'enum') {
        if (def.values.indexOf(value) !== -1) out[key] = value;
      } else if (def.type === 'string') {
        if (typeof value === 'string') out[key] = value.trim().slice(0, def.maxLength || 200);
      }
    }
  }
  return out;
}

module.exports = { STYLE_IDS, STYLE_EXTRA_FIELDS, isValidStyleId, sanitizeStyleFields };
