'use client';

import { useState } from 'react';

// ── Colour-accessibility helpers ──────────────────────────────────────────────

const ACCENT_RE = /^#[0-9A-Fa-f]{6}$/;

function hexLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Returns '#ffffff' or '#171A22', whichever meets >= 4.5:1 contrast on bgHex.
 * Falls back to '#ffffff' on invalid input.
 */
export function pickReadableText(bgHex) {
  if (!ACCENT_RE.test(bgHex)) return '#ffffff';
  const lum = hexLuminance(bgHex);
  return 1.05 / (lum + 0.05) >= 4.5 ? '#ffffff' : '#171A22';
}

function chipTextOnTint(accentHex) {
  if (!ACCENT_RE.test(accentHex)) return '#171A22';
  const L = hexLuminance(accentHex);
  // Effective luminance of accent at ~10% opacity on white
  const tintL = 0.9 + 0.1 * L;
  const lighter = Math.max(L, tintL) + 0.05;
  const darker = Math.min(L, tintL) + 0.05;
  return lighter / darker >= 4.5 ? accentHex : '#171A22';
}

// ── Pricing ───────────────────────────────────────────────────────────────────

/**
 * Discounted unit price — replicates backend/utils/quantityTiers.js discountedUnitPrice.
 * Same rounding rule (round half-up to 2 d.p.) so COD, function and preview stay in sync.
 * Verified identical on: [[999,10],[999,15],[999,25],[1000,33],[1,1],[100,80]]
 */
export function discountedUnitPrice(price, percent) {
  const raw = price * (1 - percent / 100);
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const FALLBACK_TIERS = [
  { minQty: 2, percent: 10, badge: '' },
  { minQty: 3, percent: 15, badge: 'Most popular' },
  { minQty: 4, percent: 25, badge: 'Best value' },
];
const FALLBACK_HEADING = 'Buy more, save more';
const FALLBACK_ACCENT = '#4F46E5';

function defaultSelectedIdx(tiers) {
  const n = tiers.length;
  const mid = Math.floor((n - 1) / 2);
  let best = -1, bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    if (tiers[i].badge && String(tiers[i].badge).trim()) {
      const d = Math.abs(i - mid);
      if (d < bestDist) { bestDist = d; best = i; }
    }
  }
  return best >= 0 ? best : mid;
}

// ── TierPreview ───────────────────────────────────────────────────────────────

/**
 * Pure-presentational preview of the quantity-tier widget.
 * Props: config (full DiscountConfig doc), price (number), currencySymbol (string)
 */
export function TierPreview({ config, price = 999, currencySymbol = '₹' }) {
  const qt = (config && config.quantityTiers) || {};

  const rawTiers =
    Array.isArray(qt.tiers) && qt.tiers.length >= 1 && qt.tiers.length <= 4
      ? qt.tiers.filter(
          (t) =>
            Number.isInteger(Number(t.minQty)) &&
            Number.isInteger(Number(t.percent)),
        )
      : [];
  const tiers = rawTiers.length > 0 ? rawTiers : FALLBACK_TIERS;

  const heading =
    (qt.heading && String(qt.heading).trim()) || FALLBACK_HEADING;
  const accent = ACCENT_RE.test(qt.accentColor)
    ? qt.accentColor
    : FALLBACK_ACCENT;
  const layout = qt.layout === 'list' ? 'list' : 'cards';

  const [sel, setSel] = useState(() => defaultSelectedIdx(tiers));

  const tint = accent + '1A';
  const badgeTextColor = pickReadableText(accent);
  const chipText = chipTextOnTint(accent);

  // Shared card padding — identical for every card so heights are equal in a grid
  const CARD_PADDING = '20px 8px 14px';

  const cardStyle = (i) => ({
    position: 'relative',
    background: i === sel ? tint : '#fff',
    border: `${i === sel ? 2 : 1}px solid ${i === sel ? accent : '#C7CBD6'}`,
    borderRadius: 12,
    padding: CARD_PADDING,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    cursor: 'pointer',
    textAlign: 'center',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    // Focus visible outline rendered by browser default, guided by accent
    outlineColor: accent,
    outlineOffset: 2,
  });

  const chipStyle = (selected) => ({
    fontSize: 13,
    fontWeight: 800,
    color: selected ? pickReadableText(accent) : chipText,
    background: selected ? accent : tint,
    borderRadius: 6,
    padding: '3px 9px',
    display: 'inline-block',
    marginBottom: 8,
  });

  const floatingBadgeStyle = {
    position: 'absolute',
    top: 0,
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: accent,
    color: badgeTextColor,
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 999,
    padding: '3px 10px',
    whiteSpace: 'nowrap',
    maxWidth: 'calc(100% - 8px)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    lineHeight: 1.4,
    pointerEvents: 'none',
  };

  const inlineBadgeStyle = {
    display: 'inline-block',
    background: accent,
    color: badgeTextColor,
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 999,
    padding: '2px 8px',
    marginLeft: 8,
    verticalAlign: 'middle',
    maxWidth: 120,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.4,
  };

  return (
    <div>
      <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 10px', color: '#171A22' }}>
        Live preview
      </p>

      {/* Grey product panel */}
      <div style={{ background: '#F6F7F9', borderRadius: 12, padding: 18 }}>
        <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 4px', color: '#171A22' }}>
          Example product
        </p>
        <p style={{ fontSize: 18, fontWeight: 800, margin: '0 0 14px', color: '#171A22' }}>
          {currencySymbol}{price.toLocaleString('en-IN')}
        </p>
        <p
          style={{
            fontSize: 14,
            fontWeight: 800,
            margin: '0 0 10px',
            color: '#171A22',
            wordBreak: 'break-word',
          }}
        >
          {heading}
        </p>

        {layout === 'cards' ? (
          <div
            style={{
              display: 'grid',
              // auto-fit keeps N columns on wide screens, collapses to 2 on narrow
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 10,
              paddingTop: 12, // reserve space so floating badges are not clipped
            }}
          >
            {tiers.map((t, i) => {
              const unitPrice = discountedUnitPrice(price, Number(t.percent));
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={i === sel}
                  onClick={() => setSel(i)}
                  style={cardStyle(i)}
                >
                  {t.badge ? (
                    <span style={floatingBadgeStyle}>
                      {String(t.badge).slice(0, 20)}
                    </span>
                  ) : null}
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 800,
                      color: '#171A22',
                      display: 'block',
                      marginBottom: 6,
                    }}
                  >
                    Buy {t.minQty}
                  </span>
                  <span style={chipStyle(i === sel)}>{t.percent}% off</span>
                  <span style={{ fontSize: 12, color: '#4A5062', display: 'block' }}>
                    {currencySymbol}{unitPrice.toLocaleString('en-IN')} each
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tiers.map((t, i) => {
              const unitPrice = discountedUnitPrice(price, Number(t.percent));
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={i === sel}
                  onClick={() => setSel(i)}
                  style={{
                    background: i === sel ? tint : '#fff',
                    border: `${i === sel ? 2 : 1}px solid ${
                      i === sel ? accent : '#E1E4EA'
                    }`,
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    width: '100%',
                    boxSizing: 'border-box',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    outlineColor: accent,
                    outlineOffset: 2,
                  }}
                >
                  <div>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: '#171A22',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      Buy {t.minQty}
                      {t.badge ? (
                        <span style={inlineBadgeStyle}>
                          {String(t.badge).slice(0, 20)}
                        </span>
                      ) : null}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: '#4A5062',
                        display: 'block',
                        marginTop: 2,
                      }}
                    >
                      {currencySymbol}{unitPrice.toLocaleString('en-IN')} each
                    </span>
                  </div>
                  <span
                    style={{
                      ...chipStyle(i === sel),
                      marginBottom: 0,
                      flexShrink: 0,
                      marginLeft: 12,
                    }}
                  >
                    {t.percent}% off
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p style={{ fontSize: 12, color: '#4A5062', marginTop: 8, marginBottom: 0 }}>
        Prices shown are examples. On the real page each card uses the
        product&apos;s own price.
      </p>
    </div>
  );
}
