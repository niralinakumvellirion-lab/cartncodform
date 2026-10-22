'use strict';

/**
 * Colour resolver for the product-page birthday box — frontend mirror.
 * Always returns a fully resolved object (never null).
 * Keep in sync with backend/utils/productBoxColors.js.
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function _luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function _contrast(hexA, hexB) {
  const lA = _luminance(hexA);
  const lB = _luminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker  = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function resolveProductBoxColors(cfg) {
  const rawAccent = String((cfg && cfg.accentColor) || '').trim();
  const rawBg     = String((cfg && cfg.bgColor)     || '').trim();
  const btnMode   = (cfg && cfg.buttonTextMode) || 'auto';
  const txtMode   = (cfg && cfg.textMode)       || 'auto';

  const accent      = HEX_RE.test(rawAccent) ? rawAccent : '#4F46E5';
  const bg          = HEX_RE.test(rawBg)     ? rawBg     : null;
  const effectiveBg = bg || '#FFFFFF';

  // Button foreground
  let btnFg;
  if (btnMode === 'white') {
    btnFg = '#FFFFFF';
  } else if (btnMode === 'dark') {
    btnFg = '#171A22';
  } else {
    btnFg = _contrast(accent, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#171A22';
  }

  // Primary text
  let text;
  if (txtMode === 'white') {
    text = '#FFFFFF';
  } else if (txtMode === 'dark') {
    text = '#18181B';
  } else {
    text = _contrast(effectiveBg, '#FFFFFF') >= 4.5 ? '#F4F4F5' : '#18181B';
  }

  const isLightText = text === '#FFFFFF' || text === '#F4F4F5';
  const muted = isLightText ? '#C9CDD6' : '#71717A';

  const fieldBg     = isLightText ? '#27272A' : '#FFFFFF';
  const fieldBorder = isLightText ? '#3F3F46' : '#D4D4D8';
  const checkBorder = isLightText ? '#A1A1AA' : '#71717A';

  const lowBtnContrast = btnMode !== 'auto' && (
    btnMode === 'white'
      ? _contrast(accent, '#FFFFFF') < 4.5
      : _contrast(accent, '#171A22') < 4.5
  );

  const lowTextContrast = txtMode !== 'auto' && (
    txtMode === 'white'
      ? _contrast(effectiveBg, '#FFFFFF') < 4.5
      : _contrast(effectiveBg, '#18181B') < 4.5
  );

  return { accent, btnFg, bg, text, muted, fieldBg, fieldBorder, checkBorder, lowBtnContrast, lowTextContrast };
}
