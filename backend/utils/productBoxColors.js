'use strict';

/**
 * Colour resolver for the product-page birthday box.
 * Always returns a fully resolved object (never null).
 * Mirrors frontend/app/admin/lib/productBoxColors.js — keep in sync.
 */

const { relativeLuminance, contrastRatio } = require('./bannerColors');

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function resolveProductBoxColors(cfg) {
  const rawAccent = String((cfg && cfg.accentColor) || '').trim();
  const rawBg     = String((cfg && cfg.bgColor)     || '').trim();
  const btnMode   = (cfg && cfg.buttonTextMode) || 'auto';
  const txtMode   = (cfg && cfg.textMode)       || 'auto';

  const accent     = HEX_RE.test(rawAccent) ? rawAccent : '#4F46E5';
  const bg         = HEX_RE.test(rawBg)     ? rawBg     : null;
  const effectiveBg = bg || '#FFFFFF';

  // Button foreground
  let btnFg;
  if (btnMode === 'white') {
    btnFg = '#FFFFFF';
  } else if (btnMode === 'dark') {
    btnFg = '#171A22';
  } else {
    btnFg = contrastRatio(accent, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#171A22';
  }

  // Primary text
  let text;
  if (txtMode === 'white') {
    text = '#FFFFFF';
  } else if (txtMode === 'dark') {
    text = '#18181B';
  } else {
    text = contrastRatio(effectiveBg, '#FFFFFF') >= 4.5 ? '#F4F4F5' : '#18181B';
  }

  const isLightText = text === '#FFFFFF' || text === '#F4F4F5';
  const muted = isLightText ? '#C9CDD6' : '#71717A';

  // Input field colours depend on text lightness (i.e. background darkness)
  const fieldBg     = isLightText ? '#27272A' : '#FFFFFF';
  const fieldBorder = isLightText ? '#3F3F46' : '#D4D4D8';
  const checkBorder = isLightText ? '#A1A1AA' : '#71717A';

  const lowBtnContrast = btnMode !== 'auto' && (
    btnMode === 'white'
      ? contrastRatio(accent, '#FFFFFF') < 4.5
      : contrastRatio(accent, '#171A22') < 4.5
  );

  const lowTextContrast = txtMode !== 'auto' && (
    txtMode === 'white'
      ? contrastRatio(effectiveBg, '#FFFFFF') < 4.5
      : contrastRatio(effectiveBg, '#18181B') < 4.5
  );

  // Gift-card restyle keys
  const stubFg   = contrastRatio(accent, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#171A22';
  const sealText = contrastRatio(accent, '#FFFFFF') >= 3.0  ? accent    : '#171A22';
  const bodyBg   = effectiveBg;
  const err      = isLightText ? '#F87171' : '#DC2626';
  const errBg    = isLightText ? '#450A0A' : '#FEE2E2';
  const ok       = isLightText ? '#4ADE80' : '#16A34A';

  // Highlight / animation color keys
  function hexToRgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF];
  }
  function mixHex(h1, h2, t) {
    var a = hexToRgb(h1), b = hexToRgb(h2);
    return '#' + [0,1,2].map(function(i) {
      return ('0' + Math.round(a[i]*(1-t) + b[i]*t).toString(16)).slice(-2);
    }).join('');
  }
  var accentRgb = hexToRgb(accent);
  // Highlight must never lower contrast: darken if text is light, lighten if dark
  var isLightStubFg = stubFg === '#FFFFFF';
  var hlStub   = isLightStubFg ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.35)';
  var hlBody   = isLightText   ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.35)';
  var ring     = 'rgba(' + accentRgb.join(',') + ',0.30)';
  var sealSheen = 'rgba(' + accentRgb.join(',') + ',0.30)';
  var sealText2 = mixHex(sealText, '#000000', 0.40);

  return { accent, btnFg, bg, text, muted, fieldBg, fieldBorder, checkBorder, lowBtnContrast, lowTextContrast,
           stubFg, sealText, bodyBg, err, errBg, ok,
           hlStub, hlBody, ring, sealSheen, sealText2 };
}

module.exports = { resolveProductBoxColors };
