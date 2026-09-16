'use client';

import { useState, useEffect } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

// Design system tokens for this screen (see audits/automation-redesign-audit.txt)
function ToggleSwitch({ checked, onChange }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer',
        background: checked ? '#4f46e5' : '#d1d5db', position: 'relative',
        transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: '3px', left: checked ? '23px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}

const DEFAULT_CONFIG = {
  enabled: true,
  brainRunHour: 2,
  brainRunMinute: 0,
  cartAbandonDelay: 60,
  checkoutAbandonDelay: 60,
  browseAbandonDelay: 30,
  lapsingDelay: 0,
  winbackDelay: 0,
  pageVisitDelay: 60,
  enabledSignals: {
    cart_abandon: true, checkout_abandon: true, browse_abandon: true,
    high_intent: true, price_hesitation: true, lapsing: true,
    winback: true, email_capture: true, post_purchase_d3: true,
    price_drop: true, back_in_stock: true, cod_to_prepaid: true,
    page_visit: true,
  },
  realtimeTriggers: { cart_abandon: false, checkout_abandon: false, page_visit: false },
};

// Section 5's 13 signal toggles — label text exactly as specified by the
// task; description text was not given, so short copy matching this
// app's existing tone (e.g. Discounts.jsx's DISCOUNT_ITEMS desc lines)
// was authored for each.
const SIGNAL_ITEMS = [
  { key: 'cart_abandon', label: 'Cart left behind', desc: "Customer added items but didn't complete checkout" },
  { key: 'checkout_abandon', label: 'Checkout left behind', desc: "Customer reached checkout but didn't finish" },
  { key: 'browse_abandon', label: "Browsed, didn't add", desc: 'Customer viewed products without adding to cart' },
  { key: 'high_intent', label: 'Keeps coming back', desc: 'Customer has viewed the same product multiple times' },
  { key: 'price_hesitation', label: 'Stopped at price', desc: 'Customer viewed the price and left without buying' },
  { key: 'lapsing', label: 'Going quiet', desc: "Customer hasn't been active in a while" },
  { key: 'winback', label: 'Been a while', desc: "Long-time customer who hasn't returned recently" },
  { key: 'email_capture', label: 'Ask for email', desc: 'Prompt anonymous visitors for their email' },
  { key: 'post_purchase_d3', label: '3 days after buying', desc: 'Follow up a few days after a purchase' },
  { key: 'price_drop', label: 'Price dropped', desc: "Notify when a saved item's price goes down" },
  { key: 'back_in_stock', label: 'Back in stock', desc: 'Notify when an out-of-stock item is available again' },
  { key: 'cod_to_prepaid', label: 'Offer prepaid on COD', desc: 'Encourage COD customers to pay online next time' },
  { key: 'page_visit', label: 'Website visit', desc: 'Send when customer visits the store' },
];

// Signal dot colors, per signal category (design system spec).
const DOT_COLOR = {
  cart_abandon: '#dc2626',
  checkout_abandon: '#dc2626',
  browse_abandon: '#d97706',
  high_intent: '#d97706',
  price_hesitation: '#d97706',
  lapsing: '#7c3aed',
  winback: '#7c3aed',
  email_capture: '#1d4ed8',
  post_purchase_d3: '#16a34a',
  price_drop: '#4f46e5',
  back_in_stock: '#4f46e5',
  cod_to_prepaid: '#ea580c',
  page_visit: '#0d9488',
};

const cardStyle = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16,
  padding: '16px 20px', marginBottom: 12,
};

function DelayInput({ value, onChange }) {
  const isHours = value >= 60 && value % 60 === 0;
  const [amount, setAmount] = useState(isHours ? value / 60 : value);
  const [unit, setUnit] = useState(isHours ? 'hours' : 'minutes');

  function update(a, u) {
    const mins = u === 'hours' ? a * 60 : a;
    onChange(mins);
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center',
                  flexShrink: 0 }}>
      <input
        type="number" min="1" max="999"
        value={amount}
        onChange={(e) => {
          const v = Math.max(1, parseInt(e.target.value) || 1);
          setAmount(v);
          update(v, unit);
        }}
        style={{
          width: 56, padding: '7px 8px', borderRadius: 8,
          border: '1px solid #e5e7eb', fontSize: 14,
          fontWeight: 600, textAlign: 'center', color: '#111827',
          background: '#f9fafb',
        }}
      />
      <select
        value={unit}
        onChange={(e) => {
          setUnit(e.target.value);
          update(amount, e.target.value);
        }}
        style={{
          padding: '7px 10px', borderRadius: 8,
          border: '1px solid #e5e7eb', fontSize: 13,
          background: '#f9fafb', color: '#374151',
          cursor: 'pointer',
        }}
      >
        <option value="minutes">min</option>
        <option value="hours">hrs</option>
      </select>
    </div>
  );
}

const DELAY_ROWS = [
  { label: 'Cart abandoned', key: 'cartAbandonDelay',
    desc: 'Customer adds to cart but does not checkout' },
  { label: 'Checkout abandoned', key: 'checkoutAbandonDelay',
    desc: 'Customer reaches checkout but does not complete' },
  { label: 'Browse abandoned', key: 'browseAbandonDelay',
    desc: 'Customer views products but does not add to cart' },
  { label: 'Website visit', key: 'pageVisitDelay',
    desc: 'Customer visits the store' },
];

const REALTIME_ROWS = [
  { label: 'Cart abandoned', key: 'cart_abandon',
    desc: 'Send the moment a customer abandons their cart' },
  { label: 'Checkout abandoned', key: 'checkout_abandon',
    desc: 'Send the moment a customer leaves checkout' },
  { label: 'Website visit', key: 'page_visit',
    desc: 'Send the moment a customer visits the store' },
];

export default function AutomationScreen({ shop }) {
  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);

  // FETCH: GET /api/automation/:shop on mount.
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setLoading(true);
    apiGet(`/api/automation/${encodeURIComponent(shop)}`)
      .then((data) => {
        if (cancelled) return;
        setConfig(data || DEFAULT_CONFIG);
      })
      .catch(() => {
        if (cancelled) return;
        setConfig(DEFAULT_CONFIG);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shop]);

  // SAVE: PATCH /api/automation/:shop on button click. Sends only the
  // config's own mutable fields — not the GET response's _id/shopDomain/
  // createdAt/updatedAt/__v — both to avoid MongoDB's immutable-_id
  // error and to keep the request scoped to what this screen actually
  // edits. Both nested objects (enabledSignals/realtimeTriggers) are
  // sent COMPLETE, every key, every time: the backend's PATCH handler
  // applies `$set: req.body` directly, so a partial nested object would
  // wholesale-replace the stored subdocument and silently drop any
  // sibling toggle not included in that particular call (same class of
  // bug as an earlier task this session, audits/mobile-popup-merge-audit.txt)
  // — sending the full objects here is what keeps that safe.
  async function saveConfig() {
    if (!config) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const body = {
        enabled: config.enabled,
        brainRunHour: config.brainRunHour,
        brainRunMinute: config.brainRunMinute,
        cartAbandonDelay: config.cartAbandonDelay,
        checkoutAbandonDelay: config.checkoutAbandonDelay,
        browseAbandonDelay: config.browseAbandonDelay,
        pageVisitDelay: config.pageVisitDelay,
        lapsingDelay: config.lapsingDelay,
        winbackDelay: config.winbackDelay,
        enabledSignals: config.enabledSignals,
        realtimeTriggers: config.realtimeTriggers,
      };
      const updated = await apiSend(`/api/automation/${encodeURIComponent(shop)}`, 'PATCH', body);
      setConfig(updated);
      setSaveResult({ success: true, msg: 'Saved!' });
      setTimeout(() => setSaveResult(null), 3000);
    } catch (e) {
      setSaveResult({ success: false, msg: e.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !config) {
    return (
      <div style={{ padding: '0 24px 24px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ fontSize: '13px', color: '#9ca3af', paddingTop: '24px' }}>Loading…</div>
      </div>
    );
  }

  const saved = !!saveResult?.success;

  return (
    <div style={{ padding: isMobileView ? '0 12px 24px' : '0 24px 24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header + master toggle — combined compact row (see
          audits/automation-ui-fix-audit.txt). Replaces the old separate
          "Header" block and "SECTION 1 — Master switch" status card. */}
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#111827',
                       margin: 0 }}>Automation</h1>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 0' }}>
            Control when and how notifications are sent automatically
          </p>
          <div style={{ height: 3, width: 40, borderRadius: 2,
                        background: 'linear-gradient(90deg, #4f46e5, #818cf8)',
                        marginTop: 10 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: config.enabled
                          ? '#4f46e5' : '#9ca3af', fontWeight: 600 }}>
            {config.enabled ? 'ON' : 'OFF'}
          </span>
          <ToggleSwitch
            checked={config.enabled}
            onChange={(v) => setConfig(c => ({ ...c, enabled: v }))}
          />
        </div>
      </div>

      {/* SECTION 2 — Brain run time: removed from render per task
          instructions (see audits/automation-ui-fix-audit.txt). The
          brainRunHour/brainRunMinute fields remain in `config` state
          (from the GET response / DEFAULT_CONFIG) and are still sent
          unchanged in saveConfig()'s PATCH body below — only the JSX
          that displayed/edited them was removed, so the shop keeps
          whatever run time it already had, saved silently on every
          Save settings click. */}

      {/* SECTION 3 — Signal delays */}
      <div style={cardStyle}>
        <div style={{ borderLeft: '3px solid #f59e0b', paddingLeft: 12,
                      marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
            Send delay after trigger
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            How long to wait before sending after customer action
          </div>
        </div>

        {DELAY_ROWS.map(({ label, key, desc }) => (
          <div key={key} style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', padding: '12px 0',
                        borderBottom: '1px solid #f3f4f6' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600,
                            color: '#111827' }}>{label}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                {desc}
              </div>
            </div>
            <DelayInput
              value={config[key] || 60}
              onChange={(mins) => setConfig(c => ({ ...c, [key]: mins }))}
            />
          </div>
        ))}
      </div>

      {/* SECTION 4 — Real-time triggers */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center',
                      gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10,
                        background: '#dcfce7', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="#16a34a" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
              Send immediately
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              Skip the delay — send as soon as the trigger fires
            </div>
          </div>
        </div>

        {REALTIME_ROWS.map(({ label, key, desc }, i, arr) => (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', gap: 12, padding: '14px 0' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600,
                              color: '#111827' }}>{label}</div>
                <div style={{ fontSize: 11, color: '#9ca3af',
                              marginTop: 2 }}>{desc}</div>
              </div>
              <ToggleSwitch
                checked={config.realtimeTriggers?.[key] || false}
                onChange={(v) => setConfig(c => ({
                  ...c,
                  realtimeTriggers: { ...c.realtimeTriggers, [key]: v },
                }))}
              />
            </div>
            {i < arr.length - 1 && (
              <div style={{ height: 1, background: '#f3f4f6' }} />
            )}
          </div>
        ))}
      </div>

      {/* SECTION 5 — Signal controls */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center',
                      gap: 10, marginBottom: 20 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10,
                        background: '#eef2ff', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="#4f46e5" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round">
              <path d="M3 12h4l3 8 4-16 3 8h4"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
              Active signals
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
              Choose which signals trigger automated notifications
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobileView ? '1fr' : 'repeat(2, 1fr)',
          gap: '12px',
        }}>
          {SIGNAL_ITEMS.map((item) => (
            <div key={item.key} style={{
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', padding: '12px 16px',
              background: '#f9fafb', borderRadius: 10,
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%',
                              background: DOT_COLOR[item.key],
                              flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600,
                                color: '#111827' }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af',
                                marginTop: 1 }}>{item.desc}</div>
                </div>
              </div>
              <ToggleSwitch
                checked={config.enabledSignals?.[item.key] !== false}
                onChange={(v) => setConfig(c => ({
                  ...c,
                  enabledSignals: { ...c.enabledSignals, [item.key]: v },
                }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 6 — Save bar */}
      <div style={{
        position: 'sticky', bottom: 0,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(8px)',
        borderTop: '1px solid #e5e7eb',
        padding: '16px 24px',
        marginTop: 8,
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>
          Changes are saved to your store's automation settings
        </div>
        <button
          onClick={saveConfig}
          disabled={saving}
          style={{
            padding: '10px 28px', borderRadius: 10,
            border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
            background: saving ? '#e5e7eb' : '#4f46e5',
            color: saving ? '#9ca3af' : '#fff',
            fontSize: 14, fontWeight: 700,
            opacity: saving ? 0.7 : 1,
            transition: 'all 0.15s',
            minWidth: 140,
          }}
        >
          {saving ? '⏳ Saving...' : saved ? '✓ Saved!' : 'Save settings'}
        </button>
      </div>
      {saveResult && !saveResult.success && (
        <div style={{
          marginTop: '10px', fontSize: '13px', fontWeight: '600', textAlign: 'center',
          color: '#dc2626',
        }}>
          {saveResult.msg}
        </div>
      )}
    </div>
  );
}
