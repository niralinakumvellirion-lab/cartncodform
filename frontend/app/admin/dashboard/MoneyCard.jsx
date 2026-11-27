'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '../../../lib/api';

/** ₹48,250 / ₹1,199.50 / $19.99 — the store's currency (INR when not known yet). */
export function money(n, currency) {
  const code = /^[A-Z]{3}$/.test(String(currency || '')) ? currency : 'INR';
  const v = Number(n) || 0;
  try {
    return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency', currency: code, maximumFractionDigits: v % 1 ? 2 : 0,
    }).format(v);
  } catch (e) {
    return `${code} ${v}`;
  }
}

/** 'YYYY-MM' of this month (offset 0) or last month (offset -1), UTC — matches the backend. */
export function monthKey(offset = 0, now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = [[0, 'This month'], [-1, 'Last month']];

/**
 * "Money earned": orders our messages brought back this month (or last), split by feature, compared with the
 * month before, next to what the plan costs. Data from GET /api/money/:shop?month=YYYY-MM.
 */
export default function MoneyCard({ shop }) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!shop) return undefined;
    let cancelled = false;
    setData(null);
    setError('');
    apiGet(`/api/money/${encodeURIComponent(shop)}?month=${monthKey(offset)}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Could not load the money earned'); });
    return () => { cancelled = true; };
  }, [shop, offset]);

  const top = data && data.byFeature && data.byFeature.length ? data.byFeature[0].revenue : 0;
  const up = data && data.changePct != null && data.changePct >= 0;

  return (
    <section style={ui.card} aria-label="Money earned">
      <div style={ui.head}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={ui.icon} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>
          </span>
          <div>
            <p style={ui.title}>Money earned</p>
            <p style={ui.sub}>Orders our messages brought back</p>
          </div>
        </div>
        <div style={ui.seg} role="group" aria-label="Month">
          {MONTHS.map(([o, l]) => (
            <button key={o} type="button" aria-pressed={offset === o} onClick={() => setOffset(o)} style={offset === o ? ui.segOn : ui.segOff}>{l}</button>
          ))}
        </div>
      </div>

      {error && <p style={ui.error} role="alert">{error}</p>}
      {!error && !data && <p style={ui.muted}>Loading…</p>}

      {data && (
        <>
          <div style={ui.bigRow}>
            <span style={ui.big} data-testid="money-total">{money(data.total, data.currency)}</span>
            {data.changePct != null && (
              <span style={{ ...ui.change, ...(up ? ui.changeUp : ui.changeDown) }} data-testid="money-change">
                {up ? '↑' : '↓'} {Math.abs(data.changePct)}% vs last month
              </span>
            )}
          </div>
          <p style={ui.muted}>
            from <b>{data.orders}</b> order{data.orders === 1 ? '' : 's'} · {data.sent} message{data.sent === 1 ? '' : 's'} sent
          </p>

          {data.byFeature.length === 0 ? (
            <p style={ui.empty}>
              No tracked sales yet {offset === 0 ? 'this month' : 'last month'}. When a shopper buys after one of our
              messages (cart reminder, back in stock, price drop…), it shows up here.
            </p>
          ) : (
            <ul style={ui.list} aria-label="Money by feature">
              {data.byFeature.map((f) => (
                <li key={f.key} style={ui.row}>
                  <span style={ui.rowLabel}>{f.label}</span>
                  <span style={ui.barWrap} aria-hidden="true">
                    <span style={{ ...ui.bar, width: `${top > 0 ? Math.max(4, Math.round((f.revenue / top) * 100)) : 0}%` }} />
                  </span>
                  <span style={ui.rowMoney}>{money(f.revenue, data.currency)}</span>
                  <span style={ui.rowOrders}>{f.orders} order{f.orders === 1 ? '' : 's'}</span>
                </li>
              ))}
            </ul>
          )}

          <div style={ui.foot}>
            <span>
              Your plan: <b>{data.plan.name}</b>
              {data.plan.price > 0 ? ` · ${money(data.plan.price, data.plan.currency)}/month` : ' · free'}
            </span>
            {data.returnMultiple != null && (
              <span style={ui.roi} data-testid="money-roi">≈ {data.returnMultiple}× what you pay</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}

const ui = {
  card: { background: 'linear-gradient(180deg,#F0FDF4 0%,#FFFFFF 70%)', border: '1px solid #BBF7D0', borderRadius: 12, padding: '16px 18px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  icon: { width: 34, height: 34, borderRadius: 10, background: '#DCFCE7', color: '#15803D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { margin: 0, fontSize: 15, fontWeight: 700, color: '#111827' },
  sub: { margin: '2px 0 0', fontSize: 12, color: '#6B7280' },
  seg: { display: 'inline-flex', background: '#F3F4F6', borderRadius: 8, padding: 2 },
  segOn: { border: 'none', background: '#fff', color: '#111827', fontWeight: 600, fontSize: 12, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,.1)' },
  segOff: { border: 'none', background: 'none', color: '#4B5563', fontSize: 12, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' },
  bigRow: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  big: { fontSize: 30, fontWeight: 800, color: '#14532D', letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' },
  change: { fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 999 },
  changeUp: { background: '#DCFCE7', color: '#166534' },
  changeDown: { background: '#FEE2E2', color: '#991B1B' },
  muted: { margin: '2px 0 10px', fontSize: 12.5, color: '#4B5563' },
  empty: { margin: '6px 0 10px', fontSize: 12.5, color: '#4B5563', background: '#F9FAFB', borderRadius: 8, padding: '10px 12px' },
  list: { listStyle: 'none', margin: '4px 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 7 },
  row: { display: 'grid', gridTemplateColumns: 'minmax(110px,1.2fr) minmax(60px,2fr) auto auto', alignItems: 'center', gap: 10, fontSize: 13 },
  rowLabel: { color: '#111827', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  barWrap: { height: 8, background: '#F1F5F9', borderRadius: 999, overflow: 'hidden' },
  bar: { display: 'block', height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#4ADE80,#16A34A)' },
  rowMoney: { fontWeight: 700, color: '#14532D', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  rowOrders: { color: '#6B7280', fontSize: 12, minWidth: 56, textAlign: 'right' },
  foot: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #E5E7EB', paddingTop: 10, fontSize: 12.5, color: '#374151' },
  roi: { fontWeight: 700, color: '#15803D', background: '#DCFCE7', padding: '2px 8px', borderRadius: 999 },
  error: { fontSize: 13, color: '#DC2626' },
};
