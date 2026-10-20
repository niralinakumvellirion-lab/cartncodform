'use strict';

/**
 * Pure colour helpers for the announcement banner.
 *
 * An identical copy of ccfRelativeLuminance / ccfContrastRatio /
 * ccfResolveBannerColors lives in ccf-push.js (prefixed ccf*) because the
 * storefront and admin cannot share a Node module. A parity test in
 * backend/__tests__/bannerColors.test.js asserts that both copies agree on a
 * table of known inputs.
 */

/** sRGB relative luminance per WCAG 2.1 §1.4.3. */
function relativeLuminance(hex) {
  var raw = String(hex || '').trim().replace(/^#/, '');
  if (raw.length === 3) {
    raw = raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return 0;
  var r = parseInt(raw.slice(0, 2), 16) / 255;
  var g = parseInt(raw.slice(2, 4), 16) / 255;
  var b = parseInt(raw.slice(4, 6), 16) / 255;
  var linearise = function(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

/** WCAG contrast ratio between two hex colours. */
function contrastRatio(hexA, hexB) {
  var l1 = relativeLuminance(hexA);
  var l2 = relativeLuminance(hexB);
  var lighter = Math.max(l1, l2);
  var darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Resolve banner colours from config.
 *
 * @param {{ bgColor?: string, textColor?: string }} cfg
 * @returns {{ bg: string, fg: string, ctaBg: string, ctaFg: string, lowContrast: boolean }}
 */
function resolveBannerColors(cfg) {
  var HEX_RE = /^#[0-9a-fA-F]{6}$/;
  var rawBg  = String((cfg && cfg.bgColor) || '').trim();
  var bg     = HEX_RE.test(rawBg) ? rawBg : '#3730A3';
  var mode   = (cfg && cfg.textColor) || 'auto';

  var fg;
  if (mode === 'white') {
    fg = '#FFFFFF';
  } else if (mode === 'dark') {
    fg = '#171A22';
  } else {
    // auto: white if contrast >= 4.5, else near-black
    fg = contrastRatio(bg, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#171A22';
  }

  // CTA pill: inverse of fg
  var ctaBg, ctaFg;
  if (fg === '#FFFFFF') {
    ctaBg = '#FFFFFF';
    ctaFg = bg;
  } else {
    ctaBg = '#171A22';
    ctaFg = '#FFFFFF';
  }

  var lowContrast = contrastRatio(bg, fg) < 4.5;

  return { bg: bg, fg: fg, ctaBg: ctaBg, ctaFg: ctaFg, lowContrast: lowContrast };
}

module.exports = { relativeLuminance, contrastRatio, resolveBannerColors };
