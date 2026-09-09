'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

// Signal definitions — hardcoded, these never change.
const SIGNALS = {
  right_now: [
    {
      type: 'cart_abandon',
      title: 'Cart left behind',
      description: 'Added to cart, no checkout within 60 min.',
      defaultOn: true,
    },
    {
      type: 'checkout_abandon',
      title: 'Checkout left behind',
      description: 'Reached checkout, no order within 60 min.',
      defaultOn: false,
    },
    {
      type: 'price_drop',
      title: 'Price dropped on a saved item',
      description: 'A product they viewed got cheaper.',
      defaultOn: true,
    },
    {
      type: 'back_in_stock',
      title: 'Back in stock',
      description: 'A product they viewed is available again.',
      defaultOn: true,
    },
    {
      type: 'cod_to_prepaid',
      title: 'Offer prepaid on COD',
      description: 'COD order from someone who has paid online before.',
      defaultOn: true,
    },
  ],
  within_the_hour: [
    {
      type: 'browse_abandon',
      title: "Looked, didn't add",
      description: 'Viewed a product, nothing added within 30 min.',
      defaultOn: true,
    },
    {
      type: 'high_intent',
      title: 'Keeps coming back',
      description: 'Same product viewed 3+ times in 7 days, never carted.',
      defaultOn: true,
    },
    {
      type: 'price_hesitation',
      title: 'Stopped at the price',
      description:
        '40s+ on page, scroll stalled around the price, no add to cart.',
      defaultOn: true,
    },
  ],
  over_the_coming_days: [
    {
      type: 'post_purchase_d3',
      title: 'Three days after buying',
      description: 'Care tips and a thank you, no selling.',
      defaultOn: true,
      notSelling: true,
    },
    {
      type: 'lapsing',
      title: 'Going quiet',
      description: "A buyer who hasn't visited in 21 days.",
      defaultOn: true,
    },
    {
      type: 'winback',
      title: 'Been a while',
      description: "A buyer who hasn't visited in 60 days.",
      defaultOn: false,
    },
    {
      type: 'email_capture',
      title: 'Ask for an email',
      description: 'Push-only visitor at a high-value moment.',
      defaultOn: true,
      notSelling: true,
    },
  ],
};

const ALL_SIGNALS = SIGNALS.right_now.concat(
  SIGNALS.within_the_hour,
  SIGNALS.over_the_coming_days
);

const SECTIONS = [
  { key: 'right_now', label: 'Right now' },
  { key: 'within_the_hour', label: 'Within the hour' },
  { key: 'over_the_coming_days', label: 'Over the coming days' },
];

function getConfig(configs, type) {
  return (
    configs.find((c) => c.signalType === type) || {
      enabled: ALL_SIGNALS.find((s) => s.type === type)?.defaultOn ?? true,
      signalType: type,
    }
  );
}

function getRate(weights, type) {
  if (!weights?.signalRates) return null;
  const rates = weights.signalRates;
  // signalRates is a Map, serialised to a plain object over JSON
  const entry = rates[type] || (rates.get && rates.get(type));
  if (!entry || entry.sends < 10) return null;
  return (entry.rate * 100).toFixed(1) + '%';
}

export default function WhatToActOn({ shop }) {
  const [configs, setConfigs] = useState([]);
  const [weights, setWeights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!shop) return;
    setLoading(true);
    setError('');
    try {
      const [cfgRes, wRes] = await Promise.all([
        apiGet(`/api/profiles/${encodeURIComponent(shop)}/signal-configs`),
        apiGet(`/api/profiles/${encodeURIComponent(shop)}/weights`),
      ]);
      setConfigs(Array.isArray(cfgRes?.configs) ? cfgRes.configs : []);
      setWeights(wRes?.weights || null);
    } catch (err) {
      setError(err.message || 'Failed to load signals');
    } finally {
      setLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function toggleSignal(type, currentEnabled) {
    const newEnabled = !currentEnabled;
    // Optimistic update
    setConfigs((prev) => {
      const existing = prev.find((c) => c.signalType === type);
      if (existing) {
        return prev.map((c) =>
          c.signalType === type ? { ...c, enabled: newEnabled } : c
        );
      }
      return [...prev, { signalType: type, enabled: newEnabled }];
    });
    // Persist
    setSaving(true);
    try {
      await apiSend(
        `/api/profiles/${encodeURIComponent(shop)}/signal-configs/${type}`,
        'PATCH',
        { enabled: newEnabled }
      );
    } catch (err) {
      // roll back on failure
      setConfigs((prev) =>
        prev.map((c) =>
          c.signalType === type ? { ...c, enabled: currentEnabled } : c
        )
      );
      setError(err.message || 'Could not save that change');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: '0 24px 24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#111827',
            margin: '0 0 8px',
          }}
        >
          What to act on
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: 0,
            lineHeight: '1.5',
          }}
        >
          Each of these is something I watch for. Turn off anything you don&apos;t
          want customers to hear about. I write the message; you don&apos;t need
          to.
        </p>
      </div>

      {error && (
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#b91c1c',
          }}
        >
          {error}
        </div>
      )}

      {/* Sections */}
      {SECTIONS.map((section) => (
        <div key={section.key} style={{ marginBottom: '28px' }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: '600',
              color: '#9ca3af',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '10px',
            }}
          >
            {section.label}
          </div>

          <div
            style={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              overflow: 'hidden',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {SIGNALS[section.key].map((sig, i) => {
              const cfg = getConfig(configs, sig.type);
              const isEnabled = cfg.enabled ?? sig.defaultOn;
              const rate = getRate(weights, sig.type);

              return (
                <div
                  key={sig.type}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '16px 20px',
                    borderBottom:
                      i < SIGNALS[section.key].length - 1
                        ? '1px solid #f3f4f6'
                        : 'none',
                  }}
                >
                  {/* Toggle */}
                  <div
                    onClick={() =>
                      !saving && toggleSignal(sig.type, isEnabled)
                    }
                    style={{
                      width: '44px',
                      height: '24px',
                      borderRadius: '12px',
                      background: isEnabled ? '#16a34a' : '#d1d5db',
                      position: 'relative',
                      cursor: saving ? 'default' : 'pointer',
                      flexShrink: 0,
                      transition: 'background 0.2s',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: '3px',
                        left: isEnabled ? '23px' : '3px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: '#fff',
                        transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }}
                    />
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: '#111827',
                        marginBottom: '2px',
                      }}
                    >
                      {sig.title}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {sig.description}
                    </div>
                  </div>

                  {/* Rate */}
                  <div
                    style={{
                      textAlign: 'right',
                      flexShrink: 0,
                      minWidth: '120px',
                    }}
                  >
                    {sig.notSelling ? (
                      <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                        Not a selling message
                      </div>
                    ) : rate ? (
                      <>
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            color: '#111827',
                          }}
                        >
                          {rate}
                        </div>
                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>
                          bought after, your store
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: '11px', color: '#d1d5db' }}>
                        bought after, your store
                      </div>
                    )}
                  </div>

                  {/* Arrow */}
                  <div
                    style={{ color: '#d1d5db', fontSize: '16px', flexShrink: 0 }}
                  >
                    ›
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
