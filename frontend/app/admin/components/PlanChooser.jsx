'use client';

import React, { useEffect, useRef, useState } from 'react';
import { apiSend } from '../../../lib/api';
import { planFeatures, priceLabel } from '../screens/Plans';

const ACCENT = '#4F46E5';

/**
 * "Choose your plan": shown right after an install or reinstall, before the app. Paid plans show the free
 * trial and open Shopify's plan page (Shopify takes the payment); "Continue with Free" goes straight on.
 */
export default function PlanChooser({ shop, plans, trialDays, upgradeUrl, onChosen }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const headingRef = useRef(null);

  useEffect(() => { if (headingRef.current) headingRef.current.focus(); }, []);

  function startTrial(planId) {
    if (!upgradeUrl) return;
    setBusy(planId);
    window.open(upgradeUrl, '_top');
  }

  async function chooseFree() {
    setBusy('free');
    setError('');
    try {
      await apiSend(`/api/billing/${encodeURIComponent(shop)}/choose-free`, 'POST', {});
      onChosen();
    } catch (err) {
      setError(err.message || 'Could not save your choice. Please try again.');
      setBusy('');
    }
  }

  const trial = Number(trialDays) > 0 ? Number(trialDays) : 0;

  return (
    <div style={ui.wrap}>
      <div style={ui.inner}>
        <h1 ref={headingRef} tabIndex={-1} style={ui.title}>Choose your plan</h1>
        <p style={ui.sub}>
          {trial ? `Every paid plan starts with a ${trial}-day free trial. ` : ''}
          You can change or cancel your plan at any time from the Plans page.
        </p>

        {error ? <p role="alert" style={ui.error}>{error}</p> : null}

        <div style={ui.grid}>
          {(plans || []).map((p) => {
            const free = !p.price;
            const popular = p.id === 'growth';
            return (
              <section key={p.id} aria-label={`${p.name} plan`} data-plan={p.id} style={{ ...ui.card, ...(popular ? ui.cardPopular : null) }}>
                {popular ? <div style={ui.badge}>Most popular</div> : null}
                <h2 style={ui.name}>{p.name}</h2>
                <div style={ui.price}>{priceLabel(p.price)}<span style={ui.per}>/month</span></div>
                <div style={ui.trial}>{free ? 'Free forever' : trial ? `${trial}-day free trial` : ' '}</div>
                <ul style={ui.list}>
                  {planFeatures(p).map((f) => (
                    <li key={f} style={ui.li}><span aria-hidden="true" style={ui.tick}>✓</span>{f}</li>
                  ))}
                </ul>
                {free ? (
                  <button type="button" onClick={chooseFree} disabled={!!busy} style={{ ...ui.btn, ...ui.btnSecondary }}>
                    {busy === 'free' ? 'Saving…' : 'Continue with Free'}
                  </button>
                ) : (
                  <button type="button" onClick={() => startTrial(p.id)} disabled={!!busy} style={ui.btn}>
                    {busy === p.id ? 'Opening Shopify…' : trial ? 'Start free trial' : `Choose ${p.name}`}
                  </button>
                )}
              </section>
            );
          })}
        </div>

        <p style={ui.note}>
          Paid plans are billed by Shopify and appear on your Shopify bill. A free trial is offered once per store.
        </p>
      </div>
    </div>
  );
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const ui = {
  wrap: { minHeight: '100dvh', background: '#F6F6F7', padding: '32px 16px 48px', fontFamily: FONT, color: '#111827', boxSizing: 'border-box' },
  inner: { maxWidth: 1080, margin: '0 auto' },
  title: { fontSize: 28, fontWeight: 800, margin: 0, textAlign: 'center', outline: 'none' },
  sub: { margin: '8px auto 24px', maxWidth: 560, textAlign: 'center', fontSize: 15, lineHeight: 1.6, color: '#4B5563' },
  error: { background: '#FFF4F4', border: '1px solid #FED3D1', color: '#8E1F0B', borderRadius: 10, padding: '10px 14px', fontSize: 14, maxWidth: 560, margin: '0 auto 16px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 },
  card: { position: 'relative', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '22px 18px 18px', display: 'flex', flexDirection: 'column' },
  cardPopular: { border: `2px solid ${ACCENT}` },
  badge: { position: 'absolute', top: -11, left: 16, background: ACCENT, color: '#fff', fontSize: 11.5, fontWeight: 700, borderRadius: 99, padding: '3px 10px' },
  name: { fontSize: 16, fontWeight: 800, margin: 0 },
  price: { fontSize: 28, fontWeight: 800, margin: '6px 0 2px' },
  per: { fontSize: 13, fontWeight: 600, color: '#6B7280', marginLeft: 2 },
  trial: { fontSize: 13, fontWeight: 700, color: '#008060', marginBottom: 12 },
  list: { listStyle: 'none', padding: 0, margin: '0 0 16px', flex: 1 },
  li: { display: 'flex', gap: 8, fontSize: 13.5, color: '#374151', padding: '4px 0' },
  tick: { color: '#008060', fontWeight: 800 },
  btn: { height: 42, borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { background: '#fff', color: '#111827', border: '1px solid #D1D5DB' },
  note: { marginTop: 20, textAlign: 'center', fontSize: 13, color: '#6B7280', lineHeight: 1.6 },
};
