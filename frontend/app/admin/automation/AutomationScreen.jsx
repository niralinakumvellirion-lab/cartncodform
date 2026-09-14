'use client';

import { useState, useEffect } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

// Matches Discounts.jsx's own toggle-switch visual (read for reference
// per this task's instruction) — reimplemented locally rather than
// imported, since this screen has its own component boundary and the
// task explicitly said not to touch any other component.
function ToggleSwitch({ on, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: '44px', height: '24px', borderRadius: '12px', cursor: 'pointer',
        background: on ? '#16a34a' : '#d1d5db', position: 'relative',
        transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: '3px', left: on ? '23px' : '3px',
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
  enabledSignals: {
    cart_abandon: true, checkout_abandon: true, browse_abandon: true,
    high_intent: true, price_hesitation: true, lapsing: true,
    winback: true, email_capture: true, post_purchase_d3: true,
    price_drop: true, back_in_stock: true, cod_to_prepaid: true,
  },
  realtimeTriggers: { cart_abandon: false, checkout_abandon: false },
};

const CART_CHECKOUT_DELAY_OPTIONS = [
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '6 hours', value: 360 },
  { label: 'Next brain run', value: 0 },
];

const BROWSE_DELAY_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: 'Next brain run', value: 0 },
];

// Section 5's 12 signal toggles — label text exactly as specified by the
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
];

function formatHour12(h) {
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
}

function formatRunTime(hour, minute) {
  const period = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const mm = String(minute).padStart(2, '0');
  return `${h12}:${mm} ${period}`;
}

const cardStyle = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
  padding: '20px 24px', marginBottom: '16px',
};

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

  function toggleSignal(key) {
    setConfig((c) => ({
      ...c,
      enabledSignals: { ...c.enabledSignals, [key]: !c.enabledSignals?.[key] },
    }));
  }

  function toggleRealtime(key) {
    setConfig((c) => ({
      ...c,
      realtimeTriggers: { ...c.realtimeTriggers, [key]: !c.realtimeTriggers?.[key] },
    }));
  }

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

  return (
    <div style={{ padding: isMobileView ? '0 12px 24px' : '0 24px 24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#111827', margin: '0 0 6px' }}>
          Automation
        </h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>
          Control when and how notifications are sent automatically
        </p>
      </div>

      {/* SECTION 1 — Master switch */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#111827' }}>
              Automation enabled
            </div>
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px', maxWidth: '440px' }}>
              When off, no automated notifications will be sent. Manual sends from
              Journey screen still work.
            </div>
          </div>
          <ToggleSwitch
            on={!!config.enabled}
            onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
          />
        </div>
      </div>

      {/* SECTION 2 — Brain run time */}
      <div style={cardStyle}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
          Daily automation time
        </div>
        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '14px' }}>
          Brain runs once daily at this time to schedule notifications for all customers
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={config.brainRunHour}
            onChange={(e) => setConfig((c) => ({ ...c, brainRunHour: Number(e.target.value) }))}
            style={selectStyle}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{formatHour12(h)}</option>
            ))}
          </select>
          <select
            value={config.brainRunMinute}
            onChange={(e) => setConfig((c) => ({ ...c, brainRunMinute: Number(e.target.value) }))}
            style={selectStyle}
          >
            {[0, 15, 30, 45].map((m) => (
              <option key={m} value={m}>:{String(m).padStart(2, '0')}</option>
            ))}
          </select>
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '10px' }}>
          Runs daily at {formatRunTime(config.brainRunHour, config.brainRunMinute)} IST
        </div>
      </div>

      {/* SECTION 3 — Signal delays */}
      <div style={cardStyle}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
          Send delay after trigger
        </div>
        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '14px' }}>
          How long to wait after a customer action before sending a notification
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '13px', color: '#374151' }}>Cart abandoned</span>
            <select
              value={config.cartAbandonDelay}
              onChange={(e) => setConfig((c) => ({ ...c, cartAbandonDelay: Number(e.target.value) }))}
              style={selectStyle}
            >
              {CART_CHECKOUT_DELAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '13px', color: '#374151' }}>Checkout abandoned</span>
            <select
              value={config.checkoutAbandonDelay}
              onChange={(e) => setConfig((c) => ({ ...c, checkoutAbandonDelay: Number(e.target.value) }))}
              style={selectStyle}
            >
              {CART_CHECKOUT_DELAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '13px', color: '#374151' }}>Browse abandoned</span>
            <select
              value={config.browseAbandonDelay}
              onChange={(e) => setConfig((c) => ({ ...c, browseAbandonDelay: Number(e.target.value) }))}
              style={selectStyle}
            >
              {BROWSE_DELAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 4 — Real-time triggers */}
      <div style={cardStyle}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
          Send immediately
        </div>
        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '14px' }}>
          Skip the delay and send as soon as the signal is detected
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '500', color: '#111827' }}>Cart abandon</div>
              <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                Send immediately when customer abandons cart
              </div>
            </div>
            <ToggleSwitch
              on={!!config.realtimeTriggers?.cart_abandon}
              onClick={() => toggleRealtime('cart_abandon')}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '500', color: '#111827' }}>Checkout abandon</div>
              <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                Send immediately when customer reaches checkout but leaves
              </div>
            </div>
            <ToggleSwitch
              on={!!config.realtimeTriggers?.checkout_abandon}
              onClick={() => toggleRealtime('checkout_abandon')}
            />
          </div>
        </div>
      </div>

      {/* SECTION 5 — Signal controls */}
      <div style={cardStyle}>
        <div style={{ fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '4px' }}>
          Active signals
        </div>
        <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '14px' }}>
          Choose which signals trigger automated notifications
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobileView ? '1fr' : 'repeat(2, 1fr)',
          gap: '12px',
        }}>
          {SIGNAL_ITEMS.map((item) => (
            <div key={item.key} style={{
              background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px',
              padding: '14px 16px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', gap: '12px',
            }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#111827' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                  {item.desc}
                </div>
              </div>
              <ToggleSwitch
                on={!!config.enabledSignals?.[item.key]}
                onClick={() => toggleSignal(item.key)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 6 — Save button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={saveConfig}
          disabled={saving}
          style={{
            flex: 1,
            padding: '13px', fontSize: '14px', fontWeight: '700',
            color: '#fff',
            background: saving ? '#9ca3af' : '#111827',
            border: 'none', borderRadius: '10px',
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save automation settings'}
        </button>
      </div>
      {saveResult && (
        <div style={{
          marginTop: '10px', fontSize: '13px', fontWeight: '600', textAlign: 'center',
          color: saveResult.success ? '#16a34a' : '#dc2626',
        }}>
          {saveResult.msg}
        </div>
      )}
    </div>
  );
}

const selectStyle = {
  padding: '8px 12px', fontSize: '13px', color: '#111827',
  border: '1px solid #e5e7eb', borderRadius: '8px', outline: 'none',
  background: '#fff',
};
