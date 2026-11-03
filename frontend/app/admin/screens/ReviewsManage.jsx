'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'hidden', label: 'Hidden' },
  { key: 'all', label: 'All' },
];

const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', hidden: 'Hidden' };
const STATUS_STYLE = {
  pending: { background: '#FEF3C7', color: '#92400E' },
  approved: { background: '#D1FAE5', color: '#065F46' },
  hidden: { background: '#E5E7EB', color: '#374151' },
};

const EMPTY_TEXT = {
  pending: 'No reviews are waiting for you.',
  approved: 'No approved reviews yet.',
  hidden: 'No hidden reviews.',
  all: 'No reviews yet. When a customer writes one on a product page, it will show up here.',
};

function Stars({ count }) {
  return (
    <span aria-label={`${count} out of 5 stars`} style={{ color: '#F59E0B', letterSpacing: 1 }}>
      {'★'.repeat(count)}{'☆'.repeat(5 - count)}
    </span>
  );
}

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function ReviewCard({ review, busy, onSetStatus, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  const r = review;
  return (
    <article style={ui.card} aria-label={`Review by ${r.authorName}`}>
      <div style={ui.cardTop}>
        <div style={ui.who}>
          <span style={ui.name}>{r.authorName}</span>
          {r.verified ? <span style={ui.verified}>✓ Verified buyer</span> : null}
          <span style={{ ...ui.chip, ...STATUS_STYLE[r.status] }}>{STATUS_LABEL[r.status]}</span>
        </div>
        <span style={ui.date}>{formatDate(r.createdAt)}</span>
      </div>

      <div style={ui.meta}>
        {typeof r.rating === 'number' ? <Stars count={r.rating} /> : <span style={{ color: '#6B7280' }}>No rating</span>}
        <span style={ui.dot}>·</span>
        <span>{r.productHandle ? `Product: ${r.productHandle}` : `Product ID ${r.productId}`}</span>
        {r.helpfulCount > 0 ? <><span style={ui.dot}>·</span><span>👍 {r.helpfulCount} helpful</span></> : null}
      </div>

      {r.title ? <div style={ui.title}>{r.title}</div> : null}
      <p style={ui.body}>{r.body}</p>

      {r.photos.length > 0 ? (
        <div style={ui.photos} aria-label={`${r.photos.length} photos`}>
          {r.photos.map((url) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" style={ui.thumbLink}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Customer photo" style={ui.thumb} loading="lazy" />
            </a>
          ))}
        </div>
      ) : null}

      <div style={ui.actions}>
        {r.status !== 'approved' ? (
          <button type="button" disabled={busy} onClick={() => onSetStatus(r, 'approved')} style={{ ...ui.btn, ...ui.btnPrimary }}>
            Approve
          </button>
        ) : null}
        {r.status !== 'hidden' ? (
          <button type="button" disabled={busy} onClick={() => onSetStatus(r, 'hidden')} style={{ ...ui.btn, ...ui.btnGhost }}>
            Hide
          </button>
        ) : null}
        {confirming ? (
          <span style={ui.confirm} role="group" aria-label="Confirm delete">
            <span>Delete this review for good?</span>
            <button type="button" disabled={busy} onClick={() => onDelete(r)} style={{ ...ui.btn, ...ui.btnDanger }}>Yes, delete</button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)} style={{ ...ui.btn, ...ui.btnGhost }}>Keep</button>
          </span>
        ) : (
          <button type="button" disabled={busy} onClick={() => setConfirming(true)} style={{ ...ui.btn, ...ui.btnLink }}>
            Delete
          </button>
        )}
      </div>
    </article>
  );
}

export default function ReviewsManage({ shop }) {
  const [tab, setTab] = useState('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const base = `/api/reviews/${encodeURIComponent(shop)}/items`;

  useEffect(() => {
    if (!shop) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ page: String(page) });
    if (tab !== 'all') qs.set('status', tab);
    apiGet(`${base}?${qs}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load reviews.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [shop, base, tab, page, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  function changeTab(key) {
    setTab(key);
    setPage(1);
    setActionError('');
  }

  async function setStatus(review, status) {
    setBusyId(review.id);
    setActionError('');
    try {
      await apiSend(`${base}/${review.id}`, 'PATCH', { status });
      reload();
    } catch (err) {
      setActionError(err.message || 'Could not update the review.');
    } finally {
      setBusyId('');
    }
  }

  async function remove(review) {
    setBusyId(review.id);
    setActionError('');
    try {
      await apiSend(`${base}/${review.id}`, 'DELETE');
      reload();
    } catch (err) {
      setActionError(err.message || 'Could not delete the review.');
    } finally {
      setBusyId('');
    }
  }

  const counts = (data && data.counts) || { pending: 0, approved: 0, hidden: 0, all: 0 };
  const items = (data && data.items) || [];

  return (
    <div>
      <div role="tablist" aria-label="Review status" style={ui.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => changeTab(t.key)}
            style={{ ...ui.tab, ...(tab === t.key ? ui.tabOn : null) }}
          >
            {t.label}
            <span style={{ ...ui.count, ...(t.key === 'pending' && counts.pending > 0 ? ui.countAlert : null) }}>{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {actionError ? <div style={ui.error} role="alert">{actionError}</div> : null}

      {loading && !data ? (
        <div style={ui.empty} role="status">Loading reviews…</div>
      ) : error ? (
        <div style={ui.error} role="alert">{error}</div>
      ) : items.length === 0 ? (
        <div style={ui.empty}>{EMPTY_TEXT[tab]}</div>
      ) : (
        <div style={{ ...ui.list, opacity: loading ? 0.6 : 1 }}>
          {items.map((r) => (
            <ReviewCard key={r.id} review={r} busy={busyId === r.id} onSetStatus={setStatus} onDelete={remove} />
          ))}
        </div>
      )}

      {data && data.pages > 1 ? (
        <nav style={ui.pager} aria-label="Pages">
          <button type="button" style={{ ...ui.btn, ...ui.btnGhost }} disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span style={{ fontSize: 13, color: '#6B7280' }}>Page {data.page} of {data.pages}</span>
          <button type="button" style={{ ...ui.btn, ...ui.btnGhost }} disabled={page >= data.pages || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
        </nav>
      ) : null}
    </div>
  );
}

const ACCENT = '#4F46E5';
const ui = {
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px', borderRadius: 999, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' },
  tabOn: { background: ACCENT, borderColor: ACCENT, color: '#fff' },
  count: { minWidth: 20, padding: '1px 6px', borderRadius: 999, background: 'rgba(107,114,128,0.15)', fontSize: 12, textAlign: 'center' },
  countAlert: { background: '#F59E0B', color: '#fff' },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 2px rgba(16,24,40,0.04)' },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  who: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 },
  name: { fontSize: 14, fontWeight: 800, color: '#111827' },
  verified: { fontSize: 11.5, fontWeight: 700, color: '#065F46', background: '#D1FAE5', borderRadius: 999, padding: '2px 8px' },
  chip: { fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '2px 8px' },
  date: { fontSize: 12, color: '#6B7280' },
  meta: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12.5, color: '#6B7280', marginTop: 6 },
  dot: { color: '#D1D5DB' },
  title: { fontSize: 14, fontWeight: 700, color: '#111827', marginTop: 10, overflowWrap: 'anywhere' },
  body: { fontSize: 13.5, color: '#374151', lineHeight: 1.55, margin: '4px 0 0', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  photos: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 },
  thumbLink: { display: 'inline-block', borderRadius: 8, overflow: 'hidden', border: '1px solid #E5E7EB' },
  thumb: { width: 72, height: 72, objectFit: 'cover', display: 'block' },
  actions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid #F3F4F6' },
  btn: { height: 34, padding: '0 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '1px solid transparent' },
  btnPrimary: { background: ACCENT, color: '#fff' },
  btnGhost: { background: '#fff', color: '#374151', borderColor: '#D1D5DB' },
  btnDanger: { background: '#DC2626', color: '#fff' },
  btnLink: { background: 'transparent', color: '#B91C1C', padding: '0 6px' },
  confirm: { display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: '#374151' },
  empty: { background: '#fff', border: '1px dashed #D1D5DB', borderRadius: 12, padding: '36px 20px', textAlign: 'center', color: '#6B7280', fontSize: 14 },
  error: { background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: 10, padding: '10px 14px', fontSize: 13, margin: '0 0 12px' },
  pager: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 16 },
};
