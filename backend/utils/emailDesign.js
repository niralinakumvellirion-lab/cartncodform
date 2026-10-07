// backend/utils/emailDesign.js
// Validation, mapping, and seeding helpers for email template design fields.
// All heavy rendering stays in emailEngine.js; this file only handles data.

const { LAYOUT_INFO, FONT_ORDER, FONTS, DEFAULT_LAYOUT_BY_TYPE: _DEFAULT_LAYOUT_BY_TYPE, designFromTemplate: _designFromTemplate } = require('./emailEngine');

const LAYOUT_KEYS = new Set(LAYOUT_INFO.map((l) => l.k));
const FONT_ORDER_SET = new Set(FONT_ORDER);

// Re-export from emailEngine so callers that import from emailDesign keep working.
const DEFAULT_LAYOUT_BY_TYPE = _DEFAULT_LAYOUT_BY_TYPE;

// ── field constraints ─────────────────────────────────────────────────────────

const MAX_LEN = {
  subject: 70, eyebrow: 40, headline: 70, offerText: 24,
  body: 600, ctaLabel: 30, note: 60, name: 60,
};

const HEX_RE = /^#[0-9a-f]{6}$/i;

function isValidHex(v) {
  return typeof v === 'string' && HEX_RE.test(v.trim());
}

function normaliseHex(v) {
  if (v == null || v === '') return null;
  const t = String(v).trim();
  if (!HEX_RE.test(t)) return undefined; // sentinel: invalid
  return t.toLowerCase();
}

// ── sanitizeDesignInput ────────────────────────────────────────────────────────
// Validates and normalises a request body that contains design fields.
// Returns { ok:true, value } or { ok:false, error, field }.
// Unknown fields are silently dropped; required fields (subject, body) are NOT
// checked here — that is the route's responsibility.

function sanitizeDesignInput(body) {
  const v = {};

  // ── string fields with max-length ─────────────────────────────────────────
  const STR_FIELDS = ['subject', 'eyebrow', 'headline', 'offerText', 'body', 'ctaLabel', 'note', 'name'];
  for (const f of STR_FIELDS) {
    if (f in body) {
      const val = String(body[f] == null ? '' : body[f]).trim();
      if (MAX_LEN[f] && val.length > MAX_LEN[f]) {
        return { ok: false, error: `${f} must be ${MAX_LEN[f]} characters or fewer`, field: f };
      }
      v[f] = val;
    }
  }

  // ── pass-through string fields without length limits ──────────────────────
  const PLAIN_STR = ['type', 'ctaUrl', 'imageUrl'];
  for (const f of PLAIN_STR) {
    if (f in body) v[f] = body[f];
  }

  // ── colour fields ─────────────────────────────────────────────────────────
  for (const f of ['color', 'pageBg', 'cardBg']) {
    if (f in body) {
      const h = normaliseHex(body[f]);
      if (h === undefined) {
        return { ok: false, error: `${f} must be a 6-digit hex colour (#rrggbb) or empty`, field: f };
      }
      v[f] = h;
    }
  }

  // ── layout ────────────────────────────────────────────────────────────────
  if ('layout' in body) {
    if (body.layout == null || body.layout === '') {
      v.layout = null;
    } else if (!LAYOUT_KEYS.has(body.layout)) {
      return { ok: false, error: `layout must be one of: ${[...LAYOUT_KEYS].join(', ')}`, field: 'layout' };
    } else {
      v.layout = body.layout;
    }
  }

  // ── fonts ─────────────────────────────────────────────────────────────────
  for (const f of ['hFont', 'bFont']) {
    if (f in body) {
      if (body[f] == null || body[f] === '') {
        v[f] = null;
      } else if (!FONT_ORDER_SET.has(body[f])) {
        return { ok: false, error: `${f} must be one of the supported font ids`, field: f };
      } else if (f === 'bFont' && FONTS[body[f]] && FONTS[body[f]].head) {
        return { ok: false, error: `${body[f]} is a heading-only font and cannot be used as body font`, field: f };
      } else {
        v[f] = body[f];
      }
    }
  }

  // ── radius ────────────────────────────────────────────────────────────────
  if ('radius' in body) {
    if (body.radius == null || body.radius === '') {
      v.radius = null;
    } else if (!['round', 'sharp'].includes(body.radius)) {
      return { ok: false, error: "radius must be 'round' or 'sharp'", field: 'radius' };
    } else {
      v.radius = body.radius;
    }
  }

  // ── showLogo ──────────────────────────────────────────────────────────────
  if ('showLogo' in body) {
    if (typeof body.showLogo !== 'boolean') {
      return { ok: false, error: 'showLogo must be a boolean', field: 'showLogo' };
    }
    v.showLogo = body.showLogo;
  }

  // ── imageUrl ──────────────────────────────────────────────────────────────
  if ('imageUrl' in body) {
    if (body.imageUrl == null || body.imageUrl === '') {
      v.imageUrl = null;
    } else {
      const u = String(body.imageUrl);
      if (u.length > 2000) {
        return { ok: false, error: 'imageUrl must be 2000 characters or fewer', field: 'imageUrl' };
      }
      if (!u.startsWith('https://')) {
        return { ok: false, error: 'imageUrl must start with https://', field: 'imageUrl' };
      }
      v.imageUrl = u;
    }
  }

  // ── ctaUrl ────────────────────────────────────────────────────────────────
  if ('ctaUrl' in body) {
    if (body.ctaUrl == null || body.ctaUrl === '') {
      v.ctaUrl = null;
    } else {
      const u = String(body.ctaUrl);
      if (!/^(https:\/\/|mailto:)/i.test(u)) {
        return { ok: false, error: 'ctaUrl must start with https:// or mailto:', field: 'ctaUrl' };
      }
      v.ctaUrl = u;
    }
  }

  // ── imgW / imgH ───────────────────────────────────────────────────────────
  const hasW = 'imgW' in body && body.imgW != null;
  const hasH = 'imgH' in body && body.imgH != null;
  if (hasW !== hasH) {
    return { ok: false, error: 'imgW and imgH must both be present or both absent', field: hasW ? 'imgH' : 'imgW' };
  }
  if (hasW) {
    const w = Math.round(Number(body.imgW));
    const h = Math.round(Number(body.imgH));
    if (!Number.isFinite(w) || w < 1 || w > 12000) {
      return { ok: false, error: 'imgW must be an integer between 1 and 12000', field: 'imgW' };
    }
    if (!Number.isFinite(h) || h < 1 || h > 12000) {
      return { ok: false, error: 'imgH must be an integer between 1 and 12000', field: 'imgH' };
    }
    v.imgW = w;
    v.imgH = h;
  }
  if ('imgW' in body && body.imgW == null) v.imgW = null;
  if ('imgH' in body && body.imgH == null) v.imgH = null;

  return { ok: true, value: v };
}

// designFromTemplate is the canonical copy in emailEngine.js (shared with the
// frontend preview). Re-exported here so all existing imports keep working.
const designFromTemplate = _designFromTemplate;

// ── pickStarterDesign ─────────────────────────────────────────────────────────
// Returns design fields for a seeded starter template.
// Uses a stable hash of (shopDomain + type) % 3 so different stores get
// different looks and re-seeding produces the same result.

const STARTER_VARIANTS = {
  special_offer: [
    { layout: 'poster',   hFont: 'montserrat', bFont: 'arial'  },
    { layout: 'pop',      hFont: 'bebas',      bFont: 'arial'  },
    { layout: 'split',    hFont: 'poppins',    bFont: 'nunito' },
  ],
  festival: [
    { layout: 'float',    hFont: 'playfair',   bFont: 'lora'    },
    { layout: 'spotlight',hFont: 'dmserif',    bFont: 'lora'    },
    { layout: 'gallery',  hFont: 'cormorant',  bFont: 'georgia' },
  ],
  normal: [
    { layout: 'letter',   hFont: 'cormorant',  bFont: 'georgia' },
    { layout: 'magazine', hFont: 'abril',      bFont: 'georgia' },
    { layout: 'cards',    hFont: 'poppins',    bFont: 'nunito'  },
  ],
};

const STARTER_EYEBROW = {
  special_offer: 'Special offer',
  normal: '',
  // festival: the festival name (passed in)
};

function stableHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickStarterDesign(type, shopDomain, festivalName) {
  const variants = STARTER_VARIANTS[type] || STARTER_VARIANTS.normal;
  const idx = stableHash(shopDomain + type) % variants.length;
  const variant = variants[idx];

  return {
    layout:   variant.layout,
    hFont:    variant.hFont,
    bFont:    variant.bFont,
    color:    null,          // follows the store's brand colour
    radius:   'round',
    eyebrow:  type === 'festival' ? (festivalName || '') : (STARTER_EYEBROW[type] || ''),
    note:     '',
    ctaLabel: 'Shop now',
    ctaUrl:   'https://' + shopDomain,
  };
}

module.exports = { sanitizeDesignInput, designFromTemplate, pickStarterDesign, DEFAULT_LAYOUT_BY_TYPE };
