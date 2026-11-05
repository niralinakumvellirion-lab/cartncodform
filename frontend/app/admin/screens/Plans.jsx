'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../../lib/api';

const ACCENT = '#4F46E5';

export const LIMIT_LABELS = {
  codOrders: 'COD orders this month',
  subscribers: 'Push subscribers',
  messages: 'Automated messages this month',
};

const fmt = (n) => Number(n).toLocaleString('en-US');

export function priceLabel(price) {
  if (!price) return '$0';
  return `$${Number.isInteger(price) ? price : price.toFixed(2)}`;
}

/** The lines on a plan card, from the plan's limits. */
export function planFeatures(plan) {
  const l = plan.limits || {};
  const line = (v, one, many) => (v === null || v === undefined ? `Unlimited ${many}` : `${fmt(v)} ${one}`);
  const out = [
    line(l.codOrders, 'COD orders / month', 'COD orders'),
    line(l.subscribers, 'push subscribers', 'push subscribers'),
    line(l.messages, 'automated messages / month', 'automated messages'),
    'Product reviews',
  ];
  if (plan.prepaidOffer) out.push('Prepaid offer on the COD form');
  if (plan.aiCopy) out.push('AI-written messages');
  if (plan.prioritySupport) out.push('Priority support');
  return out;
}

/** Tier named by Shopify's plan_handle (welcome link back from the plan page), or null. */
export function tierFromHandle(handle) {
  const h = String(handle || '').toLowerCase();
  for (const t of ['growth', 'starter', 'pro', 'free']) {
    if (new RegExp(`(^|[^a-z])${t}([^a-z]|$)`).test(h)) return t;
  }
  return null;
}

function returnedHandle() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('plan_handle') || '';
}

function resetDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
  } catch {
    return '';
  }
}

// Poppins from Google Fonts, added once to the page (the same way the platform pages load their fonts).
export const POPPINS_HREF = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap';
export function usePoppins() {
  useEffect(() => {
    if (typeof document === 'undefined' || document.querySelector('link[data-ccf-poppins]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = POPPINS_HREF;
    link.setAttribute('data-ccf-poppins', '');
    document.head.appendChild(link);
  }, []);
}

export const TAGLINES = {
  free: 'Try the app on a new store',
  starter: 'For stores getting their first orders',
  growth: 'For brands growing every month',
  pro: 'For high-volume stores',
};

const Check = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 1 }}>
    <circle cx="10" cy="10" r="10" fill="#E8F5EE" />
    <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="#0E8A4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Shield = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: '0 0 auto' }}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" />
  </svg>
);

function UsageRow({ id, used, limit }) {
  const unlimited = limit === null || limit === undefined;
  const pct = unlimited ? 0 : Math.min(100, Math.round(((used || 0) / Math.max(1, limit)) * 100));
  const reached = !unlimited && used >= limit;
  const color = reached ? '#D72C0D' : pct >= 80 ? '#B98900' : ACCENT;
  return (
    <div style={ui.usageTile} data-usage={id}>
      <div style={ui.usageLabel}>{LIMIT_LABELS[id]}</div>
      <div style={ui.usageNum}>
        {unlimited ? `${fmt(used || 0)} · Unlimited` : `${fmt(used || 0)} of ${fmt(limit)}`}
      </div>
      {unlimited ? (
        <div style={ui.usageFoot}>No limit on your plan</div>
      ) : (
        <>
          <div
            style={ui.track}
            role="progressbar"
            aria-label={LIMIT_LABELS[id]}
            aria-valuemin={0}
            aria-valuemax={limit}
            aria-valuenow={Math.min(used || 0, limit)}
          >
            <div style={{ ...ui.fill, width: `${pct}%`, background: color }} />
          </div>
          <div style={{ ...ui.usageFoot, ...(reached ? ui.reached : null) }}>{reached ? 'Limit reached' : `${pct}% used`}</div>
        </>
      )}
    </div>
  );
}

/** Plans and usage: current plan, how much of each limit is used, and the four plans. */
export default function Plans({ shop }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  // Set when Shopify sent the merchant back here after choosing a plan.
  const [handle] = useState(returnedHandle);
  usePoppins();

  const load = useCallback(() => {
    if (!shop) {
      setError('Could not find your store. Please reopen the app from Shopify admin.');
      return;
    }
    setError('');
    // refresh=1: the merchant may have just picked a plan on Shopify's page.
    apiGet(`/api/billing/${encodeURIComponent(shop)}/usage?refresh=1`)
      .then((d) => setData(d))
      .catch((err) => setError(err.message || 'Could not load your plan.'));
  }, [shop]);

  useEffect(() => { load(); }, [load]);

  function openPlans() {
    if (data && data.upgradeUrl) window.open(data.upgradeUrl, '_top');
  }

  const header = (
    <div style={ui.header}>
      <div>
        <h1 style={ui.title}>Plans and usage</h1>
        <p style={ui.subtitle}>
          Every plan includes web push, cart emails, the COD form, birthday gifts, quantity discounts and reviews.
        </p>
      </div>
      <span style={ui.chip}><Shield />Billed securely by Shopify</span>
    </div>
  );

  if (error) {
    return (
      <div style={ui.page}>
        {header}
        <div role="alert" style={ui.error}>
          {error}{' '}
          <button type="button" onClick={load} style={ui.linkBtn}>Try again</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={ui.page}>
        {header}
        <p style={ui.loading} role="status">Loading your plan…</p>
      </div>
    );
  }

  const plans = data.plans || [];
  const current = plans.find((p) => p.id === data.tier) || data.plan || { name: 'Free' };
  const currentIndex = plans.findIndex((p) => p.id === data.tier);
  const reached = data.reached || [];
  const onFree = data.tier === 'free';

  return (
    <div style={ui.page}>
      {header}

      {handle ? (() => {
        const expected = tierFromHandle(handle);
        const confirmed = expected ? expected === data.tier : data.tier !== 'free';
        return confirmed ? (
          <div role="status" style={ui.ok}>
            <strong>Your {current.name} plan is active.</strong> Thanks! The new limits apply now.
          </div>
        ) : (
          <div role="status" style={ui.info}>
            Shopify has not confirmed your new plan yet. This can take a minute.{' '}
            <button type="button" onClick={load} style={ui.linkBtn}>Check again</button>
          </div>
        );
      })() : null}

      {reached.length ? (
        <div role="alert" style={ui.warn}>
          <strong>You have reached a limit of the {current.name} plan.</strong>{' '}
          {reached.includes('codOrders') ? 'The COD form is paused. ' : ''}
          {reached.includes('subscribers') ? 'New push sign-ups are paused. ' : ''}
          {reached.includes('messages') ? 'Automated messages are paused. ' : ''}
          Upgrade to continue{reached.some((k) => k !== 'subscribers') ? `, or wait for the reset on ${resetDate(data.resetsAt)}` : ''}.
        </div>
      ) : null}

      <section style={ui.current} aria-labelledby="ccf-current-plan">
        <div style={ui.currentHead}>
          <div>
            <div style={ui.eyebrow}>Current plan</div>
            <h2 id="ccf-current-plan" style={ui.currentName}>
              {current.name}
              <span style={ui.currentPrice}>{priceLabel(current.price)}/month</span>
            </h2>
            <div style={ui.resets}>Monthly usage resets on {resetDate(data.resetsAt)}</div>
          </div>
          <button type="button" onClick={openPlans} style={ui.changeBtn}>Change plan</button>
        </div>
        <div style={ui.usageGrid}>
          {['codOrders', 'subscribers', 'messages'].map((k) => (
            <UsageRow key={k} id={k} used={data.usage?.[k]?.used} limit={data.usage?.[k]?.limit} />
          ))}
        </div>
      </section>

      <h2 style={ui.sectionTitle}>Choose the plan that fits your store</h2>
      <div style={ui.grid}>
        {plans.map((p, i) => {
          const isCurrent = p.id === data.tier;
          const popular = p.id === 'growth';
          const label = isCurrent ? 'Current plan' : i > currentIndex ? `Upgrade to ${p.name}` : `Switch to ${p.name}`;
          let btnStyle = ui.btnSecondary;
          if (isCurrent) btnStyle = ui.btnCurrent;
          else if (i > currentIndex) btnStyle = popular ? null : ui.btnDark;
          return (
            <section
              key={p.id}
              data-plan={p.id}
              aria-label={`${p.name} plan`}
              style={{ ...ui.plan, ...(isCurrent ? ui.planCurrent : popular ? ui.planPopular : null) }}
            >
              {popular && !isCurrent ? <div style={ui.badge}>Most popular</div> : null}
              {isCurrent ? <div style={{ ...ui.badge, background: '#111827' }}>Your plan</div> : null}
              <h3 style={ui.planName}>{p.name}</h3>
              <p style={ui.tagline}>{TAGLINES[p.id] || ''}</p>
              <div style={ui.planPrice}>
                {priceLabel(p.price)}<span style={ui.per}>/month</span>
              </div>
              <div style={ui.trialRow}>
                {p.price && onFree && Number(data.trialDays) > 0 ? (
                  <span style={ui.trial}>{data.trialDays}-day free trial</span>
                ) : null}
              </div>
              <button type="button" disabled={isCurrent} onClick={openPlans} style={{ ...ui.btn, ...btnStyle }}>
                {label}
              </button>
              <div style={ui.divider} />
              <ul style={ui.list}>
                {planFeatures(p).map((f) => (
                  <li key={f} style={ui.li}><Check />{f}</li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <p style={ui.note}>
        <Shield />
        <span>
          Plans are billed by Shopify and appear on your Shopify bill. You choose or change your plan on
          Shopify&apos;s plan page; this page updates when you come back.
        </span>
      </p>
    </div>
  );
}

const FONT = "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const ui = {
  page: { maxWidth: 1120, margin: '0 auto', padding: '24px 20px 64px', fontFamily: FONT, color: '#111827' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 20 },
  title: { fontSize: 26, fontWeight: 600, margin: 0, letterSpacing: '-0.01em', color: '#111827' },
  subtitle: { margin: '6px 0 0', fontSize: 14, color: '#6B7280', maxWidth: 640, lineHeight: 1.6 },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: '#0C5132', background: '#E8F5EE', borderRadius: 999, padding: '6px 12px', whiteSpace: 'nowrap' },
  loading: { fontSize: 14, color: '#6B7280' },
  error: { background: '#FFF4F4', border: '1px solid #FED3D1', color: '#8E1F0B', borderRadius: 12, padding: '12px 16px', fontSize: 14 },
  linkBtn: { background: 'none', border: 'none', color: ACCENT, fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 14, fontFamily: 'inherit' },
  ok: { background: '#F1F8F5', border: '1px solid #B4E1CC', color: '#0C5132', borderRadius: 12, padding: '12px 16px', fontSize: 14, lineHeight: 1.5, marginBottom: 16 },
  info: { background: '#F2F7FE', border: '1px solid #C6DCF8', color: '#13315C', borderRadius: 12, padding: '12px 16px', fontSize: 14, lineHeight: 1.5, marginBottom: 16 },
  warn: { background: '#FFF5EA', border: '1px solid #FFD79D', color: '#4A2C00', borderRadius: 12, padding: '12px 16px', fontSize: 14, lineHeight: 1.5, marginBottom: 16 },
  current: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, padding: 22, marginBottom: 32, boxShadow: '0 1px 2px rgba(17,24,39,.04)' },
  currentHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 18 },
  eyebrow: { fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: ACCENT },
  currentName: { fontSize: 24, fontWeight: 600, margin: '4px 0 2px', display: 'flex', alignItems: 'baseline', gap: 10 },
  currentPrice: { fontSize: 15, fontWeight: 500, color: '#6B7280' },
  resets: { fontSize: 13, color: '#6B7280' },
  changeBtn: { height: 40, padding: '0 18px', borderRadius: 10, border: '1px solid #D1D5DB', background: '#fff', color: '#111827', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  usageGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  usageTile: { background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: 12, padding: '14px 16px' },
  usageLabel: { fontSize: 13, color: '#6B7280', fontWeight: 500 },
  usageNum: { fontSize: 18, fontWeight: 600, margin: '4px 0 10px', fontVariantNumeric: 'tabular-nums' },
  usageFoot: { fontSize: 12, color: '#6B7280', marginTop: 6 },
  track: { height: 6, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99, transition: 'width .3s ease' },
  reached: { fontWeight: 600, color: '#D72C0D' },
  sectionTitle: { fontSize: 18, fontWeight: 600, margin: '0 0 22px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, alignItems: 'stretch' },
  plan: { position: 'relative', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, padding: '24px 20px 20px', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 2px rgba(17,24,39,.04)' },
  planCurrent: { border: '2px solid #111827' },
  planPopular: { border: `2px solid ${ACCENT}`, boxShadow: '0 12px 32px rgba(79,70,229,.14)' },
  badge: { position: 'absolute', top: -12, left: 20, background: ACCENT, color: '#fff', fontSize: 11.5, fontWeight: 600, borderRadius: 99, padding: '4px 12px', letterSpacing: '0.02em' },
  planName: { fontSize: 18, fontWeight: 600, margin: 0 },
  tagline: { fontSize: 13, color: '#6B7280', margin: '4px 0 16px', minHeight: 40, lineHeight: 1.5 },
  planPrice: { fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1 },
  per: { fontSize: 14, fontWeight: 500, color: '#6B7280', marginLeft: 4, letterSpacing: 0 },
  trialRow: { minHeight: 26, margin: '10px 0 16px' },
  trial: { display: 'inline-block', fontSize: 12, fontWeight: 600, color: '#0C5132', background: '#E8F5EE', borderRadius: 99, padding: '4px 10px' },
  btn: { height: 42, borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  btnDark: { background: '#111827' },
  btnSecondary: { background: '#fff', color: '#111827', border: '1px solid #D1D5DB' },
  btnCurrent: { background: '#F3F4F6', color: '#6B7280', cursor: 'default' },
  divider: { height: 1, background: '#F3F4F6', margin: '18px 0 14px' },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  li: { display: 'flex', gap: 10, fontSize: 13.5, color: '#374151', lineHeight: 1.45 },
  note: { display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 24, fontSize: 13, color: '#6B7280', lineHeight: 1.6 },
};
