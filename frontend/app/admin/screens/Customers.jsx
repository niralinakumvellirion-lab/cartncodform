'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, BACKEND_URL } from '../../../lib/api';
import { ShimmerTable } from '../components/Shimmer';
import { DS, StageBadge, ReachIcons, useWhatsapp, getCustomerEmail } from './customerShared';
import DateRangeFilter, { getDateRange, matchDatePreset } from '../components/DateRangeFilter';
import FilterDropdown from '../components/FilterDropdown';

function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start' }}>
        <div>
          <h1 style={DS.pageTitle}>{title}</h1>
          {subtitle && (
            <p style={DS.pageSubtitle}>{subtitle}</p>
          )}
        </div>
        {action && (
          <div style={{ flexShrink: 0, marginTop: 2 }}>{action}</div>
        )}
      </div>
      <div style={{ height: 3, background: 'linear-gradient(90deg, #4f46e5, #818cf8)',
                    borderRadius: 2, marginTop: 12, width: 48 }} />
    </div>
  );
}

const STAGE_CONFIG = {
  customer: { label: 'Bought once', bg: '#dcfce7', color: '#16a34a' },
  identified: { label: 'Has a cart', bg: '#fef9c3', color: '#ca8a04' },
  anonymous: { label: 'Visitor', bg: '#f3f4f6', color: '#6b7280' },
  lapsed: { label: 'Going quiet', bg: '#fee2e2', color: '#dc2626' },
};

function getRelativeTime(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

const GRID_COLS = 'minmax(180px,2fr) 100px minmax(100px,1fr) 90px 110px 70px';

const FILTER_TABS = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'has_cart', label: 'Has a cart' },
  { key: 'bought_once', label: 'Bought once' },
  { key: 'repeat_buyer', label: 'Repeat buyer' },
  { key: 'going_quiet', label: 'Going quiet' },
  { key: 'push_subscribed', label: 'Push subscribers' },
  { key: 'email_captured', label: 'Email captured' },
  { key: 'whatsapp_captured', label: 'WhatsApp' },
];

const SIGNAL_LABELS = {
  cart_abandon: 'Cart left behind',
  checkout_abandon: 'Reached checkout',
  browse_abandon: "Looked, didn't add",
  high_intent: 'Keeps coming back',
  price_hesitation: 'Stopped at the price',
  price_drop: 'Price dropped on a saved item',
  back_in_stock: 'Back in stock',
  post_purchase_d3: 'Three days after buying',
  lapsing: 'Going quiet',
  email_capture: 'Ask for an email',
  cod_to_prepaid: 'Offer prepaid on COD',
  winback: 'Win back',
};

// ── Export panel chip styles ──────────────────────────────────────────────────
const chipSelected   = { background: '#eef2ff', color: '#3730a3', border: '1px solid #818cf8', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', minHeight: 36, lineHeight: '1.4' };
const chipUnselected = { background: '#fff',    color: '#374151', border: '1px solid #d1d5db', borderRadius: 20, padding: '6px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', minHeight: 36, lineHeight: '1.4' };
const chipStyle = (selected) => selected ? chipSelected : chipUnselected;

const PANEL_SEGMENTS = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'has_cart', label: 'Has a cart' },
  { key: 'bought_once', label: 'Bought once' },
  { key: 'repeat_buyer', label: 'Repeat buyer' },
  { key: 'going_quiet', label: 'Going quiet' },
  { key: 'push_subscribed', label: 'Push subscribers' },
  { key: 'email_captured', label: 'Email captured' },
  { key: 'whatsapp_captured', label: 'WhatsApp' },
];

function SectionLabel({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{children}</div>;
}

function Divider() {
  return <div style={{ height: 1, background: '#eef0f3', margin: '20px 0' }} />;
}

function ChipGroup({ options, value, onChange, multi = false, label }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => {
        const selected = multi ? (Array.isArray(value) ? value.includes(opt.key) : false) : value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              if (multi) {
                const arr = Array.isArray(value) ? value : [];
                onChange(selected ? arr.filter(k => k !== opt.key) : [...arr, opt.key]);
              } else {
                onChange(opt.key);
              }
            }}
            style={chipStyle(selected)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function NumberInput({ value, onChange, placeholder, min = 0 }) {
  return (
    <input
      type="number"
      min={min}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{ width: 100, padding: '7px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none' }}
      onFocus={e => { e.target.style.borderColor = '#818cf8'; }}
      onBlur={e => { e.target.style.borderColor = '#d1d5db'; }}
    />
  );
}

// Shopify Sidekick floats ~64px above the page bottom; 80px keeps the footer clear.
const SIDEKICK_CLEARANCE = 80;

// ── ExportPanel component ────────────────────────────────────────────────────
function ExportPanel({ shop, initialSegment, initialSearch, onClose, isMobile }) {
  const [segment,      setSegment]      = useState(initialSegment || 'everyone');
  const [custType,     setCustType]     = useState('all');
  const [reach,        setReach]        = useState([]); // ['push','email','phone']
  const [search,       setSearch]       = useState(initialSearch || '');
  const [lastSeen,     setLastSeen]     = useState('any');
  const [lastSeenFrom, setLastSeenFrom] = useState('');
  const [lastSeenTo,   setLastSeenTo]   = useState('');
  const [firstSeen,    setFirstSeen]    = useState('any');
  const [ordersMin,    setOrdersMin]    = useState('');
  const [ordersMax,    setOrdersMax]    = useState('');
  const [spentMin,     setSpentMin]     = useState('');
  const [spentMax,     setSpentMax]     = useState('');
  const [payment,      setPayment]      = useState('any');
  const [lastOrder,    setLastOrder]    = useState('any');
  const [messaged,     setMessaged]     = useState('any');
  const [emailStatus,  setEmailStatus]  = useState('any');
  const [inclActivity, setInclActivity] = useState(false);
  const [actDays,      setActDays]      = useState('30');

  const [countResult,  setCountResult]  = useState(null); // {count, overLimit}
  const [counting,     setCounting]     = useState(false);
  const [countError,   setCountError]   = useState('');
  const [downloading,  setDownloading]  = useState(false);
  const [dlError,      setDlError]      = useState('');

  // Build URL params from current panel state
  function buildParams(extra = {}) {
    const p = new URLSearchParams();
    if (segment !== 'everyone') p.set('segment', segment);
    if (custType !== 'all') p.set('type', custType);
    if (reach.includes('push'))  p.set('reachPush', 'true');
    if (reach.includes('email')) p.set('reachEmail', 'true');
    if (reach.includes('phone')) p.set('reachPhone', 'true');
    if (search.trim()) p.set('search', search.trim());
    if (lastSeen !== 'any') {
      p.set('lastSeen', lastSeen);
      if (lastSeen === 'custom') {
        if (lastSeenFrom) p.set('lastSeenFrom', lastSeenFrom);
        if (lastSeenTo)   p.set('lastSeenTo', lastSeenTo);
      }
    }
    if (firstSeen !== 'any') p.set('firstSeen', firstSeen);
    if (ordersMin !== '') p.set('ordersMin', ordersMin);
    if (ordersMax !== '') p.set('ordersMax', ordersMax);
    if (spentMin !== '') p.set('spentMin', spentMin);
    if (spentMax !== '') p.set('spentMax', spentMax);
    if (payment !== 'any') p.set('payment', payment);
    if (lastOrder !== 'any') p.set('lastOrder', lastOrder);
    if (messaged !== 'any') p.set('messaged', messaged);
    if (emailStatus !== 'any') p.set('emailStatus', emailStatus);
    if (inclActivity) { p.set('includeActivity', 'true'); p.set('activityDays', actDays); }
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  }

  // Count debounce
  useEffect(() => {
    if (!shop) return;
    setCounting(true);
    setCountError('');
    const controller = { aborted: false };
    const tid = setTimeout(async () => {
      try {
        const token = await window.shopify.idToken();
        const qs = buildParams();
        const res = await fetch(`${BACKEND_URL}/api/export/${encodeURIComponent(shop)}/customers/count?${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (controller.aborted) return;
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setCountError(body.error || 'Couldn\'t count customers');
          setCountResult(null);
        } else {
          const data = await res.json();
          setCountResult(data);
        }
      } catch {
        if (!controller.aborted) setCountError('Couldn\'t count customers');
      } finally {
        if (!controller.aborted) setCounting(false);
      }
    }, 300);
    return () => { controller.aborted = true; clearTimeout(tid); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, segment, custType, reach, search, lastSeen, lastSeenFrom, lastSeenTo, firstSeen, ordersMin, ordersMax, spentMin, spentMax, payment, lastOrder, messaged, emailStatus, inclActivity, actDays]);

  // Focus close button on open; return focus on close
  const closeRef = useRef(null);
  const triggerRef = useRef(null);
  useEffect(() => {
    if (closeRef.current) closeRef.current.focus();
    return () => { if (triggerRef.current) triggerRef.current.focus(); };
  }, []);

  // Esc key closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Count banner props
  const overLimit = countResult?.overLimit;
  const ct = countResult?.count ?? 0;
  const activeFilters = [segment !== 'everyone', custType !== 'all', reach.length > 0, search.trim(), lastSeen !== 'any', firstSeen !== 'any', ordersMin || ordersMax, spentMin || spentMax, payment !== 'any', lastOrder !== 'any', messaged !== 'any', emailStatus !== 'any'].filter(Boolean).length;

  function resetAll() {
    setSegment('everyone'); setCustType('all'); setReach([]); setSearch('');
    setLastSeen('any'); setLastSeenFrom(''); setLastSeenTo(''); setFirstSeen('any');
    setOrdersMin(''); setOrdersMax(''); setSpentMin(''); setSpentMax('');
    setPayment('any'); setLastOrder('any'); setMessaged('any'); setEmailStatus('any');
    setInclActivity(false); setActDays('30');
  }

  async function handleDownloadAll() {
    setDownloading(true);
    setDlError('');
    let objectUrl = null;
    try {
      const token = await window.shopify.idToken();
      const qs = buildParams();
      const res = await fetch(`${BACKEND_URL}/api/export/${encodeURIComponent(shop)}/customers?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDlError(body.error || 'Couldn\'t prepare the file. Please try again.');
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : 'customers.xlsx';
      objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } catch {
      setDlError('Couldn\'t prepare the file. Please try again.');
    } finally {
      setDownloading(false);
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  }

  const dlDisabled = downloading || counting || ct === 0 || overLimit;
  const bannerBg = overLimit ? '#fffbeb' : (ct === 0 && !counting ? '#f9fafb' : '#eef2ff');
  const bannerBorder = overLimit ? '#fcd34d' : (ct === 0 && !counting ? '#e5e7eb' : '#c7d2fe');
  const bannerColor = overLimit ? '#92400e' : (ct === 0 && !counting ? '#6b7280' : '#312e81');

  const panelWidth = isMobile ? '100%' : 560;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-panel-title"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: panelWidth,
          background: '#fff',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 12px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div>
            <div id="export-panel-title" style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>Export customers</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Download a filtered Excel file. Up to 10,000 customers per file.</div>
          </div>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close export panel"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9ca3af', lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>

          {/* Count banner */}
          <div style={{ background: bannerBg, border: `1px solid ${bannerBorder}`, borderRadius: 10, padding: '12px 16px', marginBottom: 20, minHeight: 52 }}>
            {counting ? (
              <div style={{ fontSize: 13, color: '#9ca3af' }}>Counting…</div>
            ) : countError ? (
              <div style={{ fontSize: 13, color: '#b91c1c' }}>{countError}</div>
            ) : overLimit ? (
              <div style={{ color: bannerColor }}>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{ct.toLocaleString()}</span>
                <span style={{ fontSize: 13, marginLeft: 8 }}>customers match. A file holds up to 10,000, so add a filter to narrow it down.</span>
              </div>
            ) : ct === 0 ? (
              <div style={{ fontSize: 13, color: bannerColor }}>No customers match. Loosen a filter to include more people.
                {activeFilters > 0 && <> <button type="button" onClick={resetAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4f46e5', fontSize: 13, padding: 0, textDecoration: 'underline' }}>Reset all filters</button></>}
              </div>
            ) : (
              <div style={{ color: bannerColor }}>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{ct.toLocaleString()}</span>
                <span style={{ fontSize: 13, marginLeft: 8 }}>
                  {activeFilters > 0 ? `customer${ct !== 1 ? 's' : ''} match your ${activeFilters} filter${activeFilters !== 1 ? 's' : ''}` : `customer${ct !== 1 ? 's' : ''} in your store`}
                </span>
                {activeFilters > 0 && (
                  <> · <button type="button" onClick={resetAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4f46e5', fontSize: 13, padding: 0, textDecoration: 'underline' }}>Reset all filters</button></>
                )}
              </div>
            )}
          </div>

          {/* GROUP */}
          <SectionLabel>Group</SectionLabel>
          <ChipGroup options={PANEL_SEGMENTS} value={segment} onChange={setSegment} label="Customer segment" />

          <Divider />

          {/* WHO */}
          <SectionLabel>Who</SectionLabel>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Customer type</div>
            <ChipGroup
              label="Customer type"
              value={custType}
              onChange={setCustType}
              options={[{ key: 'all', label: 'All customers' }, { key: 'identified', label: 'Identified (has email or phone)' }, { key: 'anonymous', label: 'Anonymous visitors' }]}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Can be reached by <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>(must have all you pick)</span></div>
            <ChipGroup
              label="Reach channels"
              value={reach}
              onChange={setReach}
              multi={true}
              options={[{ key: 'push', label: 'Push' }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }]}
            />
          </div>
          <div>
            <label htmlFor="ep-search" style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Email or phone contains</label>
            <input
              id="ep-search"
              type="text"
              value={search}
              maxLength={100}
              onChange={e => setSearch(e.target.value)}
              placeholder="e.g. @gmail.com"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = '#818cf8'; }}
              onBlur={e => { e.target.style.borderColor = '#d1d5db'; }}
            />
          </div>

          <Divider />

          {/* DATES */}
          <SectionLabel>Dates</SectionLabel>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Last seen</div>
            <ChipGroup
              label="Last seen"
              value={lastSeen}
              onChange={setLastSeen}
              options={[
                { key: 'any', label: 'Any time' },
                { key: 'today', label: 'Today' },
                { key: '7d', label: 'Last 7 days' },
                { key: '30d', label: 'Last 30 days' },
                { key: 'custom', label: 'Custom range' },
              ]}
            />
            {lastSeen === 'custom' && (
              <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>From</label>
                  <input type="date" value={lastSeenFrom} max={lastSeenTo || undefined} onChange={e => setLastSeenFrom(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 8 }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 4 }}>To</label>
                  <input type="date" value={lastSeenTo} min={lastSeenFrom || undefined} onChange={e => setLastSeenTo(e.target.value)}
                    style={{ padding: '7px 10px', fontSize: 13, border: '1px solid #d1d5db', borderRadius: 8 }} />
                </div>
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>First seen</div>
            <ChipGroup
              label="First seen"
              value={firstSeen}
              onChange={setFirstSeen}
              options={[{ key: 'any', label: 'Any time' }, { key: '30d', label: 'Last 30 days' }, { key: '90d', label: 'Last 90 days' }]}
            />
          </div>

          <Divider />

          {/* ORDERS AND VALUE */}
          <SectionLabel>Orders and value</SectionLabel>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Number of orders</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <NumberInput value={ordersMin} onChange={setOrdersMin} placeholder="Min" />
              <span style={{ color: '#9ca3af', fontSize: 13 }}>–</span>
              <NumberInput value={ordersMax} onChange={setOrdersMax} placeholder="Max" />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Total spent (₹)</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <NumberInput value={spentMin} onChange={setSpentMin} placeholder="Min" />
              <span style={{ color: '#9ca3af', fontSize: 13 }}>–</span>
              <NumberInput value={spentMax} onChange={setSpentMax} placeholder="Max" />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Payment type</div>
            <ChipGroup
              label="Payment type"
              value={payment}
              onChange={setPayment}
              options={[{ key: 'any', label: 'Any payment' }, { key: 'cod', label: 'Has COD orders' }, { key: 'prepaid', label: 'Has prepaid orders' }]}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Last order</div>
            <ChipGroup
              label="Last order"
              value={lastOrder}
              onChange={setLastOrder}
              options={[{ key: 'any', label: 'Any time' }, { key: '30d', label: 'Within 30 days' }, { key: '90d', label: 'Within 90 days' }]}
            />
          </div>

          <Divider />

          {/* MESSAGES */}
          <SectionLabel>Messages</SectionLabel>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Messages sent to them</div>
            <ChipGroup
              label="Messaging state"
              value={messaged}
              onChange={setMessaged}
              options={[{ key: 'any', label: 'Any' }, { key: 'never', label: 'Never messaged' }, { key: 'before', label: 'Messaged before' }]}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Email status</div>
            <ChipGroup
              label="Email status"
              value={emailStatus}
              onChange={setEmailStatus}
              options={[{ key: 'any', label: 'Any status' }, { key: 'subscribed', label: 'Subscribed' }, { key: 'unsubscribed', label: 'Unsubscribed' }]}
            />
          </div>

          <Divider />

          {/* ACTIVITY SHEET */}
          <SectionLabel>Add browsing activity</SectionLabel>
          <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', padding: '12px 14px', border: `1px solid ${inclActivity ? '#818cf8' : '#e5e7eb'}`, borderRadius: 10, background: inclActivity ? '#f5f3ff' : '#fafafa' }}>
            <input
              type="checkbox"
              checked={inclActivity}
              onChange={e => setInclActivity(e.target.checked)}
              style={{ marginTop: 2, flexShrink: 0, accentColor: '#4f46e5' }}
            />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>Include an "Activity" sheet</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Every page, product and cart visit of the selected customers, in a second sheet. Up to 200,000 rows.</div>
            </div>
          </label>
          {inclActivity && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8 }}>Activity period</div>
              <ChipGroup
                label="Activity period"
                value={actDays}
                onChange={setActDays}
                options={[{ key: '7', label: 'Last 7 days' }, { key: '30', label: 'Last 30 days' }, { key: '90', label: 'Last 90 days' }]}
              />
            </div>
          )}

          <div style={{ height: 24 }} />
        </div>

        {/* Sticky footer — extra bottom padding lifts content above the Shopify Sidekick bar */}
        <div style={{ borderTop: '1px solid #f3f4f6', padding: `14px 20px ${SIDEKICK_CLEARANCE}px`, flexShrink: 0, background: '#fff' }}>
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10, lineHeight: 1.5 }}>
            Up to 10,000 customers per file. Push tokens and internal IDs are never included. Unsubscribed customers are included and marked.
          </div>
          {dlError && (
            <div style={{ fontSize: 12, color: '#b91c1c', marginBottom: 8 }}>{dlError}</div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={resetAll} style={{ flex: 'none', background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 9, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Reset
            </button>
            <button
              type="button"
              onClick={handleDownloadAll}
              disabled={dlDisabled}
              style={{
                flex: 1,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: dlDisabled ? '#e5e7eb' : '#4f46e5',
                color: dlDisabled ? '#6b7280' : '#fff',
                border: 'none', borderRadius: 10, padding: '0 18px', height: 44,
                fontSize: 13, fontWeight: 600, cursor: dlDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {downloading ? 'Preparing…' : `Download Excel${countResult && !overLimit && ct > 0 ? ` · ${ct.toLocaleString()} customers` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export default function Customers({ shop, initialFilter, initialSignal, initialFrom, initialTo }) {
  const router = useRouter();
  // Carries `shop` forward on client-side nav (every admin/*/page.js
  // wrapper reads it from searchParams.get('shop')).
  const navigate = (path) => {
    const sep = path.includes('?') ? '&' : '?';
    router.push(`${path}${sep}shop=${encodeURIComponent(shop)}`);
  };
  const [profiles, setProfiles] = useState([]);
  const [signalMap, setSignalMap] = useState({});
  const [signalCountMap, setSignalCountMap] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Seeded from the Dashboard's Push Subscribers / Emails Captured
  // tiles. from/to are only meaningful combined with those two filter
  // values (see routes/profiles.js) — kept sticky for the visit, same
  // as Messages.jsx's equivalent seeded params, not re-derived per tab
  // click.
  const [filter, setFilter] = useState(
    FILTER_TABS.some((t) => t.key === initialFilter) ? initialFilter : 'everyone'
  );
  // Date range filter: same preset-matching logic as Messages.jsx.
  const initialPreset = matchDatePreset(initialFrom, initialTo);
  const [dateFilter, setDateFilter] = useState(
    initialPreset || (initialFrom ? 'custom' : '7d')
  );
  const [search, setSearch] = useState('');
  const [activeSignalType, setActiveSignalType] = useState(initialSignal || '');

  const [exportOpen, setExportOpen] = useState(false);
  const exportBtnRef = useRef(null);

  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const { sendWhatsapp, waError: waRowError, waFallbackUrl, clearWaError } = useWhatsapp();


  const loadData = useCallback(
    async (signal) => {
      if (!shop) return;
      setLoading(true);
      setError('');
      try {
        const { from: rangeFrom, to: rangeTo } = dateFilter === 'custom'
          ? { from: initialFrom || null, to: initialTo || null }
          : getDateRange(dateFilter);
        const params = new URLSearchParams({ limit: '50' });
        if (filter && filter !== 'everyone') params.set('filter', filter);
        if (activeSignalType) params.set('signal', activeSignalType);
        if (rangeFrom) params.set('from', rangeFrom);
        if (rangeTo) params.set('to', rangeTo);
        if (search.trim()) params.set('search', search.trim());

        const [profRes, sigRes] = await Promise.all([
          apiGet(`/api/profiles/${encodeURIComponent(shop)}/profiles?${params.toString()}`),
          apiGet(`/api/profiles/${encodeURIComponent(shop)}/signals?limit=200`),
        ]);
        if (signal?.aborted) return;

        setProfiles(Array.isArray(profRes?.profiles) ? profRes.profiles : []);
        setTotal(Number.isFinite(profRes?.total) ? profRes.total : 0);
        setError(null);

        // strongest signal per profile + a per-profile signal count
        const map = {};
        const countMap = {};
        for (const sig of Array.isArray(sigRes?.signals) ? sigRes.signals : []) {
          const pid =
            typeof sig.profileId === 'object' && sig.profileId
              ? sig.profileId._id
              : sig.profileId;
          if (!pid) continue;
          const key = String(pid);
          countMap[key] = (countMap[key] || 0) + 1;
          if (!map[key] || (sig.strength || 0) > (map[key].strength || 0)) {
            map[key] = { type: sig.type, strength: sig.strength || 0 };
          }
        }
        setSignalMap(map);
        setSignalCountMap(countMap);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err.message || 'Failed to load customers');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [shop, filter, activeSignalType, dateFilter, initialFrom, initialTo, search]
  );

  useEffect(() => {
    const controller = { aborted: false };
    // debounce so typing in the search box doesn't fire a request per keystroke
    const t = setTimeout(() => loadData(controller), 300);
    return () => {
      controller.aborted = true;
      clearTimeout(t);
    };
  }, [loadData]);

  return (
    <div style={{ ...DS.page, overflowX: 'hidden', width: '100%' }}>
      <PageHeader
        title="Customers"
        subtitle="All push notification subscribers"
        action={
          <button
            ref={exportBtnRef}
            type="button"
            onClick={() => setExportOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: '#fff', color: '#374151',
              border: '1px solid #d1d5db', borderRadius: 9,
              padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export
          </button>
        }
      />

      {exportOpen && (
        <ExportPanel
          shop={shop}
          initialSegment={filter !== 'everyone' ? filter : 'everyone'}
          initialSearch={search}
          onClose={() => { setExportOpen(false); exportBtnRef.current?.focus(); }}
          isMobile={isMobileView}
        />
      )}

      {error && (
        <div
          style={{
            background: DS.dangerLight,
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

      {(waRowError || waFallbackUrl) && (
        <div style={{
          background: waFallbackUrl ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${waFallbackUrl ? '#bbf7d0' : '#fecaca'}`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 12,
          fontSize: 13, color: waFallbackUrl ? '#15803d' : '#b91c1c',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
        }}>
          {waFallbackUrl ? (
            <span>Popup was blocked. <a href={waFallbackUrl} target="_blank" rel="noreferrer" style={{ color: '#128C7E', fontWeight: 600 }}>Open WhatsApp</a></span>
          ) : (
            <span>{waRowError}</span>
          )}
          <button onClick={clearWaError} aria-label="Dismiss" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af', lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {/* Date range filter */}
      <div style={{ marginBottom: '12px' }}>
        <DateRangeFilter
          value={dateFilter}
          onChange={setDateFilter}
          customLabel={
            dateFilter === 'custom' && initialFrom && initialTo
              ? `${new Date(initialFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(initialTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
              : undefined
          }
        />
      </div>

      {/* Signal segment chip — shown when navigating from "Do This Next" */}
      {activeSignalType && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#ede9fe', borderRadius: 20, padding: '4px 12px 4px 10px',
            fontSize: 12, fontWeight: 600, color: '#4f46e5',
          }}>
            <span>Signal: {SIGNAL_LABELS[activeSignalType] || activeSignalType.replace(/_/g, ' ')}</span>
            <button
              type="button"
              onClick={() => setActiveSignalType('')}
              aria-label="Clear signal filter"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#6d28d9', fontSize: 14, lineHeight: 1, padding: 0,
              }}
            >×</button>
          </div>
          <span style={{ fontSize: 12, color: '#9ca3af' }}>{total} customer{total !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Search + Filter row — stacks on mobile */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '16px',
          alignItems: 'center',
          flexDirection: isMobileView ? 'column' : 'row',
        }}
      >
        <input
          type="text"
          placeholder="Search by name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: isMobileView ? 'none' : '1',
            width: isMobileView ? '100%' : undefined,
            minWidth: isMobileView ? 0 : '200px',
            maxWidth: isMobileView ? '100%' : '400px',
            padding: '8px 12px',
            fontSize: '13px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            outline: 'none',
            background: '#fff',
            boxSizing: 'border-box',
          }}
        />

        {/* Disable the segment dropdown while a signal filter is active
            so the two filtering modes don't silently combine. */}
        {!activeSignalType && (
          <FilterDropdown
            options={FILTER_TABS}
            value={filter}
            onChange={setFilter}
            aria-label="Filter customers by segment"
          />
        )}
      </div>

        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <div
            style={{ ...DS.card, padding: 0, overflow: 'hidden',
                     overflowX: 'auto', minWidth: 600 }}
          >
            {/* Table header — desktop only */}
            {!isMobileView && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: GRID_COLS,
                  padding: '8px 16px',
                  borderBottom: '1px solid #e5e7eb',
                  background: '#f9fafb',
                }}
              >
                {['Customer', 'Stage', 'Most interested in', 'Reach', 'Last messaged', 'Spent'].map(
                  (h) => (
                    <div
                      key={h}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#9ca3af',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {h}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Rows */}
            {loading ? (
              <ShimmerTable rows={8} />
            ) : profiles.length ? (
              profiles.map((p, i) => {
                // `sig` (this profile's strongest signal, from signalMap)
                // is no longer read here — the rebuilt desktop row's
                // "Most interested in" column dropped the secondary
                // signal-type sub-line the earlier design had (the given
                // rebuild JSX's column is a single non-wrapping line with
                // no room for a second line). signalMap/signalCountMap
                // state itself is untouched — see
                // audits/customers-row-rebuild-audit.txt.
                const lastMsg = p.messages?.length
                  ? p.messages[p.messages.length - 1]
                  : null;

                const name =
                  getCustomerEmail(p) || p.channels?.whatsapp?.phone || p.identifiers?.phones?.[0] || null;
                const displayName = name
                  ? name
                  : `Anonymous shopper · #${p._id?.toString().slice(-5)}`;

                const lastSeen = p.lastSeenAt
                  ? getRelativeTime(new Date(p.lastSeenAt))
                  : null;

                const interests = p.interests ? Object.entries(p.interests) : [];
                const topInterest = interests.sort((a, b) => b[1] - a[1])[0];

                if (isMobileView) {
                  const sigN = signalCountMap[p._id] || 0;
                  return (
                    <div
                      key={p._id}
                      onClick={() => navigate(`/admin/customers/${encodeURIComponent(p._id)}`)}
                      style={{
                        padding: '14px 16px',
                        borderBottom:
                          i < profiles.length - 1 ? '1px solid #f9fafb' : 'none',
                        cursor: 'pointer',
                        background: 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f9fafb';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#fff';
                      }}
                    >
                      {/* Row 1: Name + Stage badge */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '6px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            color: '#111827',
                          }}
                        >
                          {getCustomerEmail(p) ||
                            p.channels?.whatsapp?.phone ||
                            p.identifiers?.phones?.[0] ||
                            `Anonymous #${p._id?.toString().slice(-5)}`}
                        </div>
                        <div style={{ flexShrink: 0, marginLeft: '8px' }}>
                          <StageBadge customer={p} />
                        </div>
                      </div>

                      {/* Row 2: Last seen + Signal */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '4px',
                        }}
                      >
                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                          {p.lastSeenAt
                            ? `seen ${getRelativeTime(new Date(p.lastSeenAt))}`
                            : ''}
                        </div>
                        {sigN > 0 && (
                          <span
                            style={{
                              fontSize: '11px',
                              color: '#f97316',
                              fontWeight: '500',
                            }}
                          >
                            {sigN} signal{sigN > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Row 3: Channels + LTV */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <ReachIcons customer={p} />
                        {p.orders?.ltv > 0 && (
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: '600',
                              color: '#111827',
                            }}
                          >
                            ₹{p.orders.ltv.toLocaleString('en-IN')}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // "Most interested in" truncated to 20 chars, per the
                // redesign spec. NOTE: the task described this as a
                // "product title", but no per-product data is fetched
                // for the list view (topProducts only exists once a
                // customer's detail page is loaded, per-row, on
                // click) — the only "most interested in" data actually
                // available for every row up front is the existing
                // topInterest name (from p.interests), so that's what
                // gets truncated here. See
                // audits/customers-ui-redesign-audit.txt.
                const interestRaw = topInterest?.[0] || null;
                const interestDisplay = interestRaw
                  ? (interestRaw.length > 20 ? interestRaw.slice(0, 20) + '…' : interestRaw)
                  : '—';

                const avatarSource = p.identifiers?.emails?.[0];
                const avatarInitial = (avatarSource || '?').charAt(0).toUpperCase();

                // Rebuilt row (see audits/customers-row-rebuild-audit.txt).
                // NOTE: the task's given JSX referenced customer.email,
                // customer.lastSeenLabel, customer.topInterest,
                // customer.lastMessaged, customer.ltv, and
                // customer.profileId — NONE of these fields exist on the
                // Profile documents this screen actually fetches (GET
                // /api/profiles/:shop/profiles). Verified this by reading
                // the pre-existing derived-variable block directly above
                // (displayName/lastSeen/interestRaw/interestDisplay/
                // avatarInitial, already computed a few lines up in this
                // same .map callback) plus the real field paths used
                // throughout the rest of this file: p.identifiers.emails/
                // phones, p.lastSeenAt (via getRelativeTime), p.interests
                // (via topInterest/interestRaw), p.messages (via lastMsg),
                // p.orders.ltv. Used those real values/paths below instead
                // of the given (nonexistent) field names, per this task's
                // own explicit instruction not to guess. Kept the loop's
                // existing variable name `p` (not `customer`, matching
                // every other row/section in this file).
                const lastMessagedDisplay = lastMsg
                  ? getRelativeTime(new Date(lastMsg.sentAt))
                  : 'Never';

                return (
                  <div
                    key={p._id}
                    onClick={() => navigate(`/admin/customers/${encodeURIComponent(p._id)}`)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: GRID_COLS,
                      alignItems: 'center',
                      padding: '10px 16px',
                      borderBottom: '1px solid #f3f4f6',
                      cursor: 'pointer',
                      background: '#fff',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f9fafb';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#fff';
                    }}
                  >
                    {/* CUSTOMER column */}
                    <div style={{ display: 'flex', alignItems: 'center',
                                  gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: '#eef2ff', color: '#4f46e5',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 13,
                        fontWeight: 700, flexShrink: 0,
                      }}>
                        {avatarInitial}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827',
                                      overflow: 'hidden', textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap' }}>
                          {displayName}
                        </div>
                        {lastSeen && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                            seen {lastSeen}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* STAGE column */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <StageBadge customer={p} />
                    </div>

                    {/* MOST INTERESTED IN column */}
                    <div style={{ fontSize: 12, color: '#374151',
                                  overflow: 'hidden', textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap', paddingRight: 8 }}>
                      {interestDisplay}
                    </div>

                    {/* REACH column */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ReachIcons customer={p} />
                      {p.hasWhatsappReachable && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const wa = p.channels?.whatsapp;
                            const purpose = (wa?.consentedAt && !wa?.optedOutAt) ? 'followup' : 'order';
                            sendWhatsapp({ shopDomain: shop, profileId: String(p._id), purpose });
                          }}
                          aria-label="Send WhatsApp message"
                          title="Send WhatsApp"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 24, height: 24, borderRadius: 6,
                            background: '#dcfce7', border: '1px solid #86efac',
                            cursor: 'pointer', padding: 0, flexShrink: 0,
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                            stroke="#15803d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                            aria-hidden="true">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* LAST MESSAGED column */}
                    <div style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {lastMessagedDisplay}
                    </div>

                    {/* SPENT column */}
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111827',
                                  display: 'flex', justifyContent: 'flex-end' }}>
                      {p.orders?.ltv > 0 ? `₹${p.orders.ltv.toLocaleString('en-IN')}` : '—'}
                    </div>
                  </div>
                );
              })
            ) : (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  fontSize: '13px',
                  color: '#9ca3af',
                }}
              >
                No customers match this view.
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
