'use strict';

/**
 * Frontend mirror of backend/utils/postOrderColors.js.
 * Keep in sync — a parity test proves both return identical values.
 */

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function _luminance(hex) {
  const raw = String(hex || '').replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function _contrast(a, b) {
  const [la, lb] = [_luminance(a), _luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Resolve post-order birthday block colours.
 * Returns null when all fields are at default (caller emits unchanged CSS).
 * Otherwise returns { accent, btnFg, bg, text, muted, skip, sep }.
 */
export function resolvePostOrderColors(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;

  const rawAccent = String(cfg.accentColor || '').trim();
  const rawBg     = String(cfg.bgColor     || '').trim();
  const btnMode   = cfg.buttonTextMode || 'auto';
  const txtMode   = cfg.textMode       || 'auto';

  const isDefault =
    rawAccent === '' &&
    rawBg     === '' &&
    btnMode   === 'auto' &&
    txtMode   === 'auto';

  if (isDefault) return null;

  const accent      = HEX_RE.test(rawAccent) ? rawAccent : '#4f46e5';
  const bg          = HEX_RE.test(rawBg)     ? rawBg     : null;
  const effectiveBg = bg || '#FFFFFF';

  let btnFg;
  if (btnMode === 'white') {
    btnFg = '#FFFFFF';
  } else if (btnMode === 'dark') {
    btnFg = '#171A22';
  } else {
    btnFg = _contrast(accent, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#171A22';
  }

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
  const skip  = muted;
  const sep   = bg ? null : '#e4e4e7';

  return { accent, btnFg, bg, text, muted, skip, sep };
}
