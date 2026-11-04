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

function UsageRow({ id, used, limit }) {
  const unlimited = limit === null || limit === undefined;
  const pct = unlimited ? 0 : Math.min(100, Math.round(((used || 0) / Math.max(1, limit)) * 100));
  const reached = !unlimited && used >= limit;
  const color = reached ? '#D72C0D' : pct >= 80 ? '#B98900' : ACCENT;
  return (
    <div style={ui.usageRow} data-usage={id}>
      <div style={ui.usageTop}>
        <span style={ui.usageLabel}>{LIMIT_LABELS[id]}</span>
        <span style={ui.usageNum}>
          {unlimited ? `${fmt(used || 0)} · Unlimited` : `${fmt(used || 0)} of ${fmt(limit)}`}
        </span>
      </div>
      {unlimited ? null : (
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
      )}
      {reached ? <div style={ui.reached}>Limit reached</div> : null}
    </div>
  );
}

/** Plans and usage: current plan, how much of each limit is used, and the four plans. */
export default function Plans({ shop }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  // Set when Shopify sent the merchant back here after choosing a plan.
  const [handle] = useState(returnedHandle);

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

  if (error) {
    return (
      <div style={ui.page}>
        <h1 style={ui.title}>Plans and usage</h1>
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
        <h1 style={ui.title}>Plans and usage</h1>
        <p style={ui.subtitle} role="status">Loading your plan…</p>
      </div>
    );
  }

  const plans = data.plans || [];
  const current = plans.find((p) => p.id === data.tier) || data.plan || { name: 'Free' };
  const currentIndex = plans.findIndex((p) => p.id === data.tier);
  const reached = data.reached || [];

  return (
    <div style={ui.page}>
      <h1 style={ui.title}>Plans and usage</h1>
      <p style={ui.subtitle}>Every plan includes web push, cart emails, the COD form, birthday gifts, quantity discounts and reviews.</p>

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

      <section style={ui.card} aria-labelledby="ccf-current-plan">
        <div style={ui.currentHead}>
          <div>
            <div style={ui.eyebrow}>Current plan</div>
            <h2 id="ccf-current-plan" style={ui.currentName}>
              {current.name}
              <span style={ui.currentPrice}>{priceLabel(current.price)}/month</span>
            </h2>
          </div>
          <div style={ui.resets}>Monthly usage resets on {resetDate(data.resetsAt)}</div>
        </div>
        {['codOrders', 'subscribers', 'messages'].map((k) => (
          <UsageRow key={k} id={k} used={data.usage?.[k]?.used} limit={data.usage?.[k]?.limit} />
        ))}
      </section>

      <div style={ui.grid}>
        {plans.map((p, i) => {
          const isCurrent = p.id === data.tier;
          const popular = p.id === 'growth';
          const label = isCurrent ? 'Current plan' : i > currentIndex ? `Upgrade to ${p.name}` : `Switch to ${p.name}`;
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
              <div style={ui.planPrice}>
                {priceLabel(p.price)}<span style={ui.per}>/month</span>
              </div>
              {p.price && data.tier === 'free' && Number(data.trialDays) > 0 ? (
                <div style={ui.trial}>{data.trialDays}-day free trial</div>
              ) : null}
              <ul style={ui.list}>
                {planFeatures(p).map((f) => (
                  <li key={f} style={ui.li}><span aria-hidden="true" style={ui.tick}>✓</span>{f}</li>
                ))}
              </ul>
              <button
                type="button"
                disabled={isCurrent}
                onClick={openPlans}
                style={{ ...ui.btn, ...(isCurrent ? ui.btnCurrent : i > currentIndex ? null : ui.btnSecondary) }}
              >
                {label}
              </button>
            </section>
          );
        })}
      </div>

      <p style={ui.note}>
        Plans are billed by Shopify and appear on your Shopify bill. You choose or change your plan on
        Shopify&apos;s plan page; this page updates when you come back.
      </p>
    </div>
  );
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const ui = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '20px 20px 64px', fontFamily: FONT, color: '#111827' },
  title: { fontSize: 24, fontWeight: 800, margin: 0, color: '#111827' },
  subtitle: { margin: '4px 0 18px', fontSize: 13.5, color: '#6B7280' },
  error: { background: '#FFF4F4', border: '1px solid #FED3D1', color: '#8E1F0B', borderRadius: 10, padding: '12px 14px', fontSize: 14, marginTop: 16 },
  linkBtn: { background: 'none', border: 'none', color: ACCENT, fontWeight: 700, cursor: 'pointer', padding: 0, fontSize: 14 },
  ok: { background: '#F1F8F5', border: '1px solid #B4E1CC', color: '#0C5132', borderRadius: 10, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, marginBottom: 16 },
  info: { background: '#F2F7FE', border: '1px solid #C6DCF8', color: '#13315C', borderRadius: 10, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, marginBottom: 16 },
  warn: { background: '#FFF5EA', border: '1px solid #FFD79D', color: '#4A2C00', borderRadius: 10, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, marginBottom: 16 },
  card: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '18px 20px', marginBottom: 20 },
  currentHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 6 },
  eyebrow: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280' },
  currentName: { fontSize: 22, fontWeight: 800, margin: '2px 0 0', display: 'flex', alignItems: 'baseline', gap: 10 },
  currentPrice: { fontSize: 14, fontWeight: 600, color: '#6B7280' },
  resets: { fontSize: 13, color: '#6B7280' },
  usageRow: { padding: '12px 0', borderTop: '1px solid #F3F4F6' },
  usageTop: { display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, marginBottom: 8 },
  usageLabel: { fontWeight: 600 },
  usageNum: { color: '#374151', fontVariantNumeric: 'tabular-nums' },
  track: { height: 8, background: '#F3F4F6', borderRadius: 99, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 99, transition: 'width .3s ease' },
  reached: { marginTop: 6, fontSize: 12.5, fontWeight: 700, color: '#D72C0D' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 },
  plan: { position: 'relative', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '22px 18px 18px', display: 'flex', flexDirection: 'column' },
  planCurrent: { border: '2px solid #111827' },
  planPopular: { border: `2px solid ${ACCENT}` },
  badge: { position: 'absolute', top: -11, left: 16, background: ACCENT, color: '#fff', fontSize: 11.5, fontWeight: 700, borderRadius: 99, padding: '3px 10px' },
  planName: { fontSize: 16, fontWeight: 800, margin: 0 },
  planPrice: { fontSize: 28, fontWeight: 800, margin: '6px 0 12px' },
  per: { fontSize: 13, fontWeight: 600, color: '#6B7280', marginLeft: 2 },
  trial: { fontSize: 13, fontWeight: 700, color: '#008060', margin: '-6px 0 12px' },
  list: { listStyle: 'none', padding: 0, margin: '0 0 16px', flex: 1 },
  li: { display: 'flex', gap: 8, fontSize: 13.5, color: '#374151', padding: '4px 0' },
  tick: { color: '#008060', fontWeight: 800 },
  btn: { height: 40, borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  btnSecondary: { background: '#fff', color: '#111827', border: '1px solid #D1D5DB' },
  btnCurrent: { background: '#F3F4F6', color: '#6B7280', cursor: 'default' },
  note: { marginTop: 18, fontSize: 13, color: '#6B7280', lineHeight: 1.6 },
};
