'use client';

import { useState, useCallback } from 'react';
import { apiSend } from '../../../lib/api';
import { TierPreview } from './QuantityTiersPreview';

// ── Defaults matching board 2 of the "Birthday and Tier Offers" canvas ──────
const DEFAULT_TIERS = [
  { minQty: 2, percent: 10, badge: '' },
  { minQty: 3, percent: 15, badge: 'Most popular' },
  { minQty: 4, percent: 25, badge: 'Best value' },
];
const DEFAULT_HEADING = 'Buy more, save more';
const DEFAULT_ACCENT = '#4F46E5';
const ACCENT_RE = /^#[0-9A-Fa-f]{6}$/;
const EXAMPLE_PRICE = 999;

function initTiers(raw) {
  if (Array.isArray(raw) && raw.length) return raw.map((t) => ({ ...t }));
  return DEFAULT_TIERS.map((t) => ({ ...t }));
}

/**
 * QuantityTiers — "Buy more, save more" section inside the Discounts screen.
 * Props: config (full DiscountConfig doc), shopDomain, onSaveComplete(updatedConfig)
 */
export default function QuantityTiers({ config, shopDomain, onSaveComplete }) {
  const qt = (config && config.quantityTiers) || {};

  const [enabled, setEnabled] = useState(!!qt.enabled);
  const [heading, setHeading] = useState(qt.heading || DEFAULT_HEADING);
  const [accentColor, setAccentColor] = useState(
    ACCENT_RE.test(qt.accentColor || '') ? qt.accentColor : DEFAULT_ACCENT
  );
  const [layout, setLayout] = useState(qt.layout === 'list' ? 'list' : 'cards');
  const [tiers, setTiers] = useState(() => initTiers(qt.tiers));
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null); // null | 'synced' | 'failed'
  const [syncError, setSyncError] = useState('');
  const [errors, setErrors] = useState({});

  // ── Tier helpers ────────────────────────────────────────────────────────────

  const updateTier = useCallback((i, field, value) => {
    setTiers((prev) => {
      const next = prev.map((t) => ({ ...t }));
      next[i] = { ...next[i], [field]: value };
      return next;
    });
    setErrors((e) => ({ ...e, tiers: undefined }));
  }, []);

  const addTier = useCallback(() => {
    setTiers((prev) => {
      if (prev.length >= 4) return prev;
      const lastQty = prev.length ? prev[prev.length - 1].minQty : 1;
      const lastPct = prev.length ? prev[prev.length - 1].percent : 0;
      return [...prev, { minQty: lastQty + 1, percent: lastPct + 5, badge: '' }];
    });
  }, []);

  const removeTier = useCallback((i) => {
    setTiers((prev) => prev.filter((_, idx) => idx !== i));
    setErrors((e) => ({ ...e, tiers: undefined }));
  }, []);

  // ── Client-side validation (mirrors backend rules) ─────────────────────────

  function validate() {
    const errs = {};
    if (!heading.trim()) errs.heading = 'Heading is required';
    if (heading.trim().length > 60) errs.heading = 'Max 60 characters';
    if (!ACCENT_RE.test(accentColor)) errs.accentColor = 'Must be a valid #RRGGBB hex colour';
    if (tiers.length < 1 || tiers.length > 4) {
      errs.tiers = '1 to 4 tiers required';
    } else {
      for (let i = 0; i < tiers.length; i++) {
        const qty = Number(tiers[i].minQty);
        const pct = Number(tiers[i].percent);
        if (!Number.isInteger(qty) || qty < 2 || qty > 99)
          errs.tiers = `Row ${i + 1}: minimum quantity must be an integer between 2 and 99`;
        if (!Number.isInteger(pct) || pct < 1 || pct > 80)
          errs.tiers = `Row ${i + 1}: discount must be an integer between 1 and 80`;
        if (String(tiers[i].badge || '').length > 20)
          errs.tiers = `Row ${i + 1}: badge must be 20 characters or fewer`;
        if (i > 0) {
          if (qty <= Number(tiers[i - 1].minQty)) errs.tiers = 'Minimum quantities must strictly increase row by row';
          if (pct <= Number(tiers[i - 1].percent)) errs.tiers = 'Discounts must strictly increase row by row';
        }
      }
    }
    return errs;
  }

  // ── Save + sync ─────────────────────────────────────────────────────────────

  async function handleSave() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setSaving(true);
    setSyncStatus(null);
    setSyncError('');

    const body = {
      quantityTiers: {
        enabled,
        heading: heading.trim().slice(0, 60),
        accentColor: ACCENT_RE.test(accentColor) ? accentColor : DEFAULT_ACCENT,
        layout,
        tiers: tiers.map((t) => ({
          minQty: Number(t.minQty),
          percent: Number(t.percent),
          badge: String(t.badge || '').slice(0, 20),
        })),
      },
    };

    try {
      const res = await apiSend(`/api/discounts/${shopDomain}/config`, 'PATCH', body);
      if (res.updated && res.synced) {
        setSyncStatus('synced');
      } else if (res.updated) {
        setSyncStatus('failed');
        setSyncError(res.syncError || 'Shopify sync failed');
      }
      if (res.config && onSaveComplete) onSaveComplete(res.config);
    } catch (err) {
      setSyncStatus('failed');
      setSyncError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncAgain() {
    setSaving(true);
    setSyncStatus(null);
    setSyncError('');
    try {
      const res = await apiSend(`/api/discounts/${shopDomain}/sync-tiers`, 'POST', {});
      setSyncStatus(res.synced ? 'synced' : 'failed');
      setSyncError(res.syncError || '');
    } catch (err) {
      setSyncStatus('failed');
      setSyncError(err.message || 'Sync failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Live preview ─────────────────────────────────────────────────────────────

  function previewTiers() {
    const valid = tiers.filter(
      (t) => Number.isInteger(Number(t.minQty)) && Number.isInteger(Number(t.percent))
    );
    return valid;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const accent = ACCENT_RE.test(accentColor) ? accentColor : DEFAULT_ACCENT;

  // Build a config-shaped object from live state for the preview component
  const previewConfig = {
    quantityTiers: {
      tiers: previewTiers(),
      heading,
      accentColor: accent,
      layout,
      enabled: true,
    },
  };

  return (
    <section style={styles.section} aria-label="Quantity tiers">
      {/* ── Header ── */}
      <div style={styles.cardHeader}>
        <div>
          <p style={styles.cardTitle}>Buy more, save more</p>
          <p style={styles.cardSub}>Automatic discounts for customers who buy multiple items of the same product.</p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label="Enable quantity tiers"
          onClick={() => setEnabled((v) => !v)}
          style={{ ...styles.toggle, background: enabled ? '#4F46E5' : '#D1D5DB' }}
        >
          <span style={{ ...styles.toggleKnob, transform: enabled ? 'translateX(20px)' : 'translateX(0)' }} />
        </button>
      </div>

      {/* ── Tiers table ── */}
      <div style={styles.card}>
        <p style={styles.sectionLabel}>Tiers</p>
        <table style={styles.table} aria-label="Discount tiers">
          <thead>
            <tr>
              {['Buy at least', 'Discount (%)', 'Badge', ''].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier, i) => (
              <tr key={i}>
                <td style={styles.td}>
                  <input
                    type="number"
                    min={2}
                    max={99}
                    value={tier.minQty}
                    onChange={(e) => updateTier(i, 'minQty', Number(e.target.value))}
                    style={styles.numInput}
                    aria-label={`Tier ${i + 1} minimum quantity`}
                  />
                </td>
                <td style={styles.td}>
                  <input
                    type="number"
                    min={1}
                    max={80}
                    value={tier.percent}
                    onChange={(e) => updateTier(i, 'percent', Number(e.target.value))}
                    style={styles.numInput}
                    aria-label={`Tier ${i + 1} discount percent`}
                  />
                </td>
                <td style={styles.td}>
                  <input
                    type="text"
                    maxLength={20}
                    value={tier.badge}
                    onChange={(e) => updateTier(i, 'badge', e.target.value)}
                    placeholder="e.g. Most popular"
                    style={styles.textInput}
                    aria-label={`Tier ${i + 1} badge`}
                  />
                </td>
                <td style={styles.td}>
                  <button
                    onClick={() => removeTier(i)}
                    style={styles.removeBtn}
                    aria-label={`Remove tier ${i + 1}`}
                    disabled={tiers.length <= 1}
                  >✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {errors.tiers && <p style={styles.errorMsg}>{errors.tiers}</p>}
        {tiers.length < 4 && (
          <button onClick={addTier} style={styles.addBtn}>+ Add a tier</button>
        )}
      </div>

      {/* ── Look and wording ── */}
      <div style={styles.card}>
        <p style={styles.sectionLabel}>Look and wording</p>
        <label style={styles.fieldLabel}>Heading
          <input
            type="text"
            maxLength={60}
            value={heading}
            onChange={(e) => { setHeading(e.target.value); setErrors((er) => ({ ...er, heading: undefined })); }}
            style={styles.textInput}
            aria-label="Section heading"
          />
          {errors.heading && <span style={styles.errorMsg}>{errors.heading}</span>}
        </label>
        <label style={styles.fieldLabel}>Accent colour
          <div style={styles.colorRow}>
            <input
              type="color"
              value={accent}
              onChange={(e) => { setAccentColor(e.target.value); setErrors((er) => ({ ...er, accentColor: undefined })); }}
              style={styles.colorPicker}
              aria-label="Accent colour picker"
            />
            <input
              type="text"
              value={accentColor}
              maxLength={7}
              onChange={(e) => { setAccentColor(e.target.value); setErrors((er) => ({ ...er, accentColor: undefined })); }}
              style={{ ...styles.textInput, width: 100 }}
              aria-label="Accent colour hex"
            />
          </div>
          {errors.accentColor && <span style={styles.errorMsg}>{errors.accentColor}</span>}
        </label>
        <fieldset style={styles.fieldset}>
          <legend style={styles.fieldLabel}>Layout</legend>
          {['cards', 'list'].map((opt) => (
            <label key={opt} style={styles.radioLabel}>
              <input
                type="radio"
                name="qt-layout"
                value={opt}
                checked={layout === opt}
                onChange={() => setLayout(opt)}
              />
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </label>
          ))}
        </fieldset>
      </div>

      {/* ── Where it applies ── */}
      <div style={styles.card}>
        <p style={styles.sectionLabel}>Where it applies</p>
        <label style={styles.radioLabel}>
          <input type="radio" name="qt-scope" value="all" checked readOnly />
          All products
        </label>
        <label style={{ ...styles.radioLabel, opacity: 0.45, cursor: 'not-allowed' }}>
          <input type="radio" name="qt-scope" value="collections" disabled />
          Selected collections
          <span style={styles.comingSoon}>Coming soon</span>
        </label>
      </div>

      {/* ── Amber note ── */}
      <div style={styles.amberNote} role="note">
        <span style={styles.amberIcon}>⚠</span>
        Add the <strong>Quantity tiers</strong> block in your theme editor under the price and size picker to show the discount table to shoppers.
      </div>

      {/* ── Live preview ── */}
      <div style={styles.card}>
        <TierPreview config={previewConfig} price={EXAMPLE_PRICE} currencySymbol="₹" />
      </div>

      {/* ── Save + sync status ── */}
      <div style={styles.saveRow}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ ...styles.saveBtn, opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving…' : 'Save and sync to Shopify'}
        </button>
        {syncStatus === 'synced' && (
          <span style={styles.syncOk}>✓ Synced to Shopify</span>
        )}
        {syncStatus === 'failed' && (
          <span style={styles.syncFail}>
            Shopify sync failed: {syncError}
            {' '}
            <button onClick={handleSyncAgain} disabled={saving} style={styles.syncAgainBtn}>
              Sync again
            </button>
          </span>
        )}
      </div>
    </section>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  section: { display: 'flex', flexDirection: 'column', gap: 16, marginTop: 32 },
  card: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: 20 },
  cardHeader: {
    background: '#fff',
    border: '1px solid #E5E7EB',
    borderRadius: 8,
    padding: '16px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  cardTitle: { fontWeight: 600, fontSize: 15, margin: 0 },
  cardSub: { fontSize: 13, color: '#6B7280', margin: '4px 0 0' },
  sectionLabel: { fontWeight: 600, fontSize: 13, color: '#374151', marginBottom: 12 },
  toggle: {
    position: 'relative', display: 'inline-flex', alignItems: 'center',
    width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
    transition: 'background 0.2s', flexShrink: 0,
  },
  toggleKnob: {
    position: 'absolute', left: 2, width: 20, height: 20,
    background: '#fff', borderRadius: '50%', transition: 'transform 0.2s',
  },
  table: { width: '100%', borderCollapse: 'collapse', marginBottom: 12 },
  th: { textAlign: 'left', padding: '6px 8px', fontSize: 12, color: '#6B7280', fontWeight: 500, borderBottom: '1px solid #E5E7EB' },
  td: { padding: '8px 8px' },
  numInput: { width: 70, padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14 },
  textInput: { width: '100%', padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 14 },
  removeBtn: { background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 14, padding: '4px 8px' },
  addBtn: { background: 'none', border: 'none', color: '#4F46E5', cursor: 'pointer', fontSize: 13, padding: '4px 0', fontWeight: 500 },
  fieldLabel: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#374151', fontWeight: 500, marginBottom: 14 },
  colorRow: { display: 'flex', alignItems: 'center', gap: 8 },
  colorPicker: { width: 36, height: 36, border: '1px solid #D1D5DB', borderRadius: 6, cursor: 'pointer', padding: 2 },
  fieldset: { border: 'none', padding: 0, margin: '0 0 14px' },
  radioLabel: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', marginBottom: 6, cursor: 'pointer' },
  comingSoon: { fontSize: 11, background: '#F3F4F6', color: '#6B7280', borderRadius: 4, padding: '2px 6px', marginLeft: 4 },
  amberNote: {
    background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8,
    padding: '12px 16px', fontSize: 13, color: '#92400E', display: 'flex', gap: 8, alignItems: 'flex-start',
  },
  amberIcon: { flexShrink: 0, fontSize: 16 },
  saveRow: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  saveBtn: {
    background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 6,
    padding: '10px 20px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
  },
  syncOk: { fontSize: 13, color: '#059669' },
  syncFail: { fontSize: 13, color: '#DC2626' },
  syncAgainBtn: {
    background: 'none', border: '1px solid #DC2626', color: '#DC2626', borderRadius: 4,
    padding: '2px 8px', fontSize: 12, cursor: 'pointer', marginLeft: 4,
  },
  errorMsg: { fontSize: 12, color: '#DC2626', margin: '4px 0 0', display: 'block' },
};
