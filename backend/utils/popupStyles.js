/**
 * Backend-side mirror of the popup style registry. The admin's copy
 * (frontend/app/admin/lib/popupStyles.js) is the single source of truth
 * for what each style LOOKS like (labels, descriptions, defaults shown in
 * the UI); this file only needs enough to VALIDATE what the admin sends —
 * the style id itself, and the shape of each style's extra `styleFields`.
 *
 * Round 1: classic, flash_sale, gift_reveal.
 * Round 2 (mobile-specific styles — see
 * audits/mobile-popup-styles-proposal.txt and -after.txt): bottom_sheet,
 * top_bar, story_card. (full_takeover was removed; see
 * audits/remove-full-takeover-audit.txt.) These are device-restricted
 * ("mobile-only") in the admin UI and in ccf-push.js's ccfResolveStyle(),
 * but this file (like Store.js's enum) does NOT enforce that restriction —
 * it only validates that an id/extra-field shape is a RECOGNIZED one, not
 * which device it's allowed on. The "never on desktop" guarantee is the
 * three resolution points named in the task (admin registry lookup, admin
 * preview, ccf-push.js), not the save-time validation here.
 */

const STYLE_IDS = ['classic', 'flash_sale', 'gift_reveal',
  'bottom_sheet', 'top_bar', 'story_card'];

// Ids that used to exist and may still be saved on old documents. A PATCH
// that carries one is normalized to 'classic' instead of being dropped, so
// the stale value gets overwritten on the shop's next save.
const REMOVED_STYLE_IDS = ['full_takeover'];

// Style ids that only ever render on mobile — mirrors
// frontend/app/admin/lib/popupStyles.js's MOBILE_ONLY_STYLE_IDS. Exported
// for tests/consumers that want to assert device-gating without needing
// the full frontend registry.
const MOBILE_ONLY_STYLE_IDS = ['bottom_sheet', 'top_bar', 'story_card'];

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
  bottom_sheet: {
    iconArtEnabled: { type: 'boolean' },
    dragHandleEnabled: { type: 'boolean' },
  },
  top_bar: {
    arrowCta: { type: 'boolean' },
  },
  story_card: {
    scrimEnabled: { type: 'boolean' },
  },
};

function isValidStyleId(id) {
  return STYLE_IDS.indexOf(id) !== -1;
}

// PATCH-time normalization: a removed id becomes 'classic'; anything else is
// returned as-is (callers still gate on isValidStyleId).
function normalizeStyleId(id) {
  return REMOVED_STYLE_IDS.indexOf(id) !== -1 ? 'classic' : id;
}

/**
 * Device-aware resolution — mirrors frontend/app/admin/lib/popupStyles.js's
 * resolveStyleId() and ccf-push.js's ccfResolveStyle() exactly: an
 * unrecognized id, OR a recognized mobile-only id being resolved for
 * 'desktop', both fall back to 'classic'. Not currently called by any
 * route (save-time validation only checks isValidStyleId — see the header
 * comment on why); provided so backend code/tests can assert the same
 * fallback contract the other two implementations promise, and as the
 * one place to update if the backend ever needs to resolve a style for a
 * specific device itself.
 */
function resolveStyleId(id, device) {
  const resolved = isValidStyleId(id) ? id : 'classic';
  if (MOBILE_ONLY_STYLE_IDS.indexOf(resolved) !== -1 && device !== 'mobile') return 'classic';
  return resolved;
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

module.exports = {
  STYLE_IDS, MOBILE_ONLY_STYLE_IDS, STYLE_EXTRA_FIELDS,
  isValidStyleId, normalizeStyleId, sanitizeStyleFields, resolveStyleId,
};
