'use client';

import { useState, useEffect, useRef } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

function currentShop() {
  if (typeof window === 'undefined') return '';
  const fromUrl = new URLSearchParams(window.location.search).get('shop');
  if (fromUrl) return fromUrl;
  return (window.shopify && window.shopify.config && window.shopify.config.shop) || '';
}

// Shows a "Start your free trial" screen instead of the app until the store
// has an active Shopify subscription (the trial counts as active). Fails open
// on any status-check error: the backend enforces the plan on every route, so
// this screen is only the friendly side of that rule.
export default function PlanGate({ children }) {
  const [blocked, setBlocked] = useState(false);
  const [price, setPrice] = useState(10);
  const [trialDays, setTrialDays] = useState(30);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const headingRef = useRef(null);

  useEffect(() => {
    function onRequired() {
      setBlocked(true);
    }
    window.addEventListener('ccf:plan-required', onRequired);

    let cancelled = false;
    const shop = currentShop();
    if (shop) {
      apiGet(`/api/billing/${encodeURIComponent(shop)}/status`)
        .then((s) => {
          if (cancelled || !s) return;
          if (Number.isFinite(s.priceUsd)) setPrice(s.priceUsd);
          if (Number.isFinite(s.trialDays)) setTrialDays(s.trialDays);
          if (s.hasAccess === false) setBlocked(true);
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
      window.removeEventListener('ccf:plan-required', onRequired);
    };
  }, []);

  useEffect(() => {
    if (blocked && headingRef.current) headingRef.current.focus();
  }, [blocked]);

  async function startTrial() {
    const shop = currentShop();
    if (!shop) {
      setError('Could not find your store. Please reopen the app from Shopify admin.');
      return;
    }
    setStarting(true);
    setError('');
    try {
      const data = await apiSend(`/api/billing/${encodeURIComponent(shop)}/start`, 'POST', {});
      if (!data || !data.confirmationUrl) throw new Error('No approval link was returned.');
      // Shopify's approval page must open in the top window, not the app iframe.
      window.open(data.confirmationUrl, '_top');
    } catch (err) {
      setError(err.message || 'Could not start your free trial. Please try again.');
      setStarting(false);
    }
  }

  if (!blocked) return <>{children}</>;

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#F1F0EF',
      padding: '1rem',
      fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '2.5rem 2rem',
        maxWidth: '460px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
      }}>
        <div role="status">
          <h1
            ref={headingRef}
            tabIndex={-1}
            style={{
              fontSize: '1.375rem',
              fontWeight: '700',
              color: '#202223',
              margin: '0 0 0.875rem',
              outline: 'none',
            }}
          >
            Start your {trialDays}-day free trial
          </h1>
        </div>

        <p style={{ color: '#6D7175', fontSize: '0.9375rem', lineHeight: '1.6', margin: '0 0 0.625rem' }}>
          ShopiReachBoost AI includes every feature: web push, cart emails, the
          Cash on Delivery form, birthday gifts and quantity discounts.
        </p>
        <p style={{ color: '#202223', fontSize: '0.9375rem', fontWeight: '600', lineHeight: '1.6', margin: '0 0 1.75rem' }}>
          Free for {trialDays} days, then ${price}/month. Cancel any time.
        </p>

        {error ? (
          <p role="alert" style={{ color: '#D72C0D', fontSize: '0.875rem', margin: '0 0 1rem' }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={startTrial}
            disabled={starting}
            style={{
              backgroundColor: '#4F46E5',
              color: '#ffffff',
              border: 'none',
              padding: '0.8125rem 1.5rem',
              borderRadius: '8px',
              cursor: starting ? 'default' : 'pointer',
              opacity: starting ? 0.7 : 1,
              fontWeight: '600',
              fontSize: '0.9375rem',
              fontFamily: 'inherit',
            }}
          >
            {starting ? 'Opening Shopify…' : 'Start free trial'}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid #C9CCCF',
              color: '#6D7175',
              padding: '0.8125rem 1.5rem',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.9375rem',
              fontFamily: 'inherit',
            }}
          >
            Check again
          </button>
        </div>
      </div>
    </div>
  );
}
