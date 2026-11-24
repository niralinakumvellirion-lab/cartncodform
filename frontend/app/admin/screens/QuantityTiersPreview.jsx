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

// ── Rows preview (mirrors the storefront "rows" layout in ccf-tiers.js) ───────

/**
 * Builds the rows shown by the rows layout: one per tier, plus an optional
 * "1 item, standard price" row when showSingle is on and the first tier starts above 1.
 * Exported for tests.
 */
export function buildRowOptions(tiers, showSingle) {
  const rows = tiers.map((t) => ({
    qty: Number(t.minQty),
    percent: Number(t.percent),
    badge: t.badge || '',
    subtitle: t.subtitle || '',
  }));
  if (showSingle && rows.length && rows[0].qty > 1) {
    rows.unshift({ qty: 1, percent: 0, badge: '', subtitle: 'Standard price' });
  }
  return rows;
}

function money(sym, n) {
  const v = Math.round(n * 100) / 100;
  const digits = Number.isInteger(v) ? 0 : 2;
  return sym + v.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function RowsPreview({ qt, tiers, accent, price, currencySymbol }) {
  const showSingle = qt.showSingle === true;
  const showCompareAt = qt.showCompareAt !== false;
  const showTotal = qt.showTotal !== false;
  const topLabel = String(qt.topLabel || '').trim();
  const footerNote = String(qt.footerNote || '').trim();
  const rows = buildRowOptions(tiers, showSingle);
  const [sel, setSel] = useState(() => Math.min(showSingle ? 1 : 0, rows.length - 1));
  const active = rows[Math.min(sel, rows.length - 1)] || rows[0];
  const badgeText = pickReadableText(accent);
  const unit = (pct) => (pct > 0 ? discountedUnitPrice(price, pct) : price);

  return (
    <div>
      {topLabel ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontWeight: 700, color: chipTextOnTint(accent), textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px' }}>
          <span style={{ flex: 1, height: 1, background: '#E1E4EA' }} />
          {topLabel}
          <span style={{ flex: 1, height: 1, background: '#E1E4EA' }} />
        </div>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rows.map((r, i) => {
          const on = r === active;
          const each = unit(r.percent);
          return (
            <button
              key={i}
              type="button"
              aria-pressed={on}
              onClick={() => setSel(i)}
              style={{
                position: 'relative', display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', boxSizing: 'border-box', textAlign: 'left', fontFamily: 'inherit',
                background: on ? accent + '1A' : '#fff',
                border: `${on ? 2 : 1}px solid ${on ? accent : '#C7CBD6'}`,
                borderRadius: 12, padding: 14, cursor: 'pointer',
              }}
            >
              {r.badge ? (
                <span style={{ position: 'absolute', top: 0, right: 14, transform: 'translateY(-50%)', background: accent, color: badgeText, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap' }}>
                  {String(r.badge).slice(0, 20)}
                </span>
              ) : null}
              <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${on ? accent : '#C7CBD6'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxSizing: 'border-box' }}>
                {on ? <span style={{ width: 10, height: 10, borderRadius: '50%', background: accent }} /> : null}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: '#171A22', flexWrap: 'wrap' }}>
                  {r.qty === 1 ? '1 item' : `${r.qty} items`}
                  {r.percent > 0 ? (
                    <span style={{ fontSize: 11, fontWeight: 800, background: accent, color: badgeText, borderRadius: 4, padding: '2px 6px' }}>
                      {r.percent}% OFF
                    </span>
                  ) : null}
                </span>
                {r.subtitle ? <span style={{ display: 'block', fontSize: 12, color: '#4A5062' }}>{String(r.subtitle).slice(0, 40)}</span> : null}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: '#171A22' }}>{money(currencySymbol, each * r.qty)}</span>
                {showCompareAt && r.percent > 0 ? (
                  <s style={{ fontSize: 12, color: '#6B7280' }}>{money(currencySymbol, price * r.qty)}</s>
                ) : null}
                {r.qty > 1 ? <span style={{ fontSize: 11, color: '#4A5062' }}>{money(currencySymbol, each)} / each</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {(footerNote || showTotal) ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12, fontSize: 13, color: '#171A22' }}>
          {footerNote ? <span style={{ fontWeight: 700, color: '#0F766E' }}>{footerNote}</span> : <span />}
          {showTotal && active ? (
            <span style={{ fontWeight: 800 }}>Total: {money(currencySymbol, unit(active.percent) * active.qty)}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
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
  const layout = qt.layout === 'list' || qt.layout === 'rows' ? qt.layout : 'cards';

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

        {layout === 'rows' ? (
          <RowsPreview qt={qt} tiers={tiers} accent={accent} price={price} currencySymbol={currencySymbol} />
        ) : layout === 'cards' ? (
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
