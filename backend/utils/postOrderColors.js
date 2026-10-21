'use strict';

/**
 * Colour resolver for the post-order birthday block.
 *
 * An identical copy of the luminance/contrast maths and the resolution logic
 * lives in frontend/app/admin/lib/postOrderColors.js because the admin and
 * backend cannot share a module. A parity test in
 * backend/__tests__/postOrderColors.test.js asserts both copies agree.
 */

const { relativeLuminance, contrastRatio } = require('./bannerColors');

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Resolve post-order birthday block colours from the postOrder config sub-doc.
 *
 * Returns null when all colour fields are at their "no customisation" defaults
 * (accentColor='', bgColor='', buttonTextMode='auto', textMode='auto'), which
 * tells the caller to emit the existing CSS unchanged (byte-identical output).
 *
 * Otherwise returns:
 *   { accent, btnFg, bg, text, muted, skip, sep, lowBtnContrast }
 *   - accent  : resolved button/focus colour (#rrggbb)
 *   - btnFg   : text colour on the button (#rrggbb)
 *   - bg      : block background (#rrggbb) or null (keep transparent / border-top)
 *   - text    : primary text colour (#rrggbb)
 *   - muted   : secondary/consent text colour (#rrggbb)
 *   - skip    : skip-link colour (#rrggbb)
 *   - sep     : separator border colour (#rrggbb or null when bg set)
 */
function resolvePostOrderColors(cfg) {
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

  const accent       = HEX_RE.test(rawAccent) ? rawAccent : '#4f46e5';
  const bg           = HEX_RE.test(rawBg)     ? rawBg     : null;
  const effectiveBg  = bg || '#FFFFFF';

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
  const skip  = muted;
  const sep   = bg ? null : '#e4e4e7';

  const lowBtnContrast = btnMode !== 'auto' && (
    btnMode === 'white'
      ? contrastRatio(accent, '#FFFFFF') < 4.5
      : contrastRatio(accent, '#171A22') < 4.5
  );

  return { accent, btnFg, bg, text, muted, skip, sep, lowBtnContrast };
}

module.exports = { resolvePostOrderColors };
