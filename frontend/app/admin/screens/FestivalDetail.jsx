'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet } from '../../../lib/api';

// Same status->color mapping as QueueScreen.jsx's FESTIVAL_STATUS_BADGE
// (that constant is local/unexported there, so duplicated here rather
// than restructuring an existing file for a 4-line constant).
const STATUS_BADGE = {
  draft: { bg: '#f3f4f6', color: '#6b7280', label: 'Draft' },
  approved: { bg: '#dcfce7', color: '#16a34a', label: 'Approved' },
  sent: { bg: '#dbeafe', color: '#2563eb', label: 'Sent' },
  cancelled: { bg: '#f3f4f6', color: '#9ca3af', label: 'Cancelled' },
};

const OUTCOME_COLORS = { delivered: '#16a34a', failed: '#dc2626' };

const card = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16,
};

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ ...card, textAlign: 'center', padding: '16px 12px' }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || '#111827' }}>{value}</div>
      <div style={{
        fontSize: 11, color: '#9ca3af', marginTop: 4, textTransform: 'uppercase',
        letterSpacing: '0.5px', fontWeight: 600,
      }}>{label}</div>
    </div>
  );
}

export default function FestivalDetail({ shop, festivalId }) {
  const router = useRouter();
  const navigate = (path) => {
    const sep = path.includes('?') ? '&' : '?';
    router.push(`${path}${sep}shop=${encodeURIComponent(shop)}`);
  };

  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 600);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Festival item itself — no dedicated single-item endpoint exists (the
  // task scoped exactly 3 backend endpoints), so this reuses the same
  // GET .../festival list the calendar already fetches and finds the
  // matching row client-side.
  const [item, setItem] = useState(null);
  const [itemLoading, setItemLoading] = useState(true);
  const [itemError, setItemError] = useState('');
  // Other dates in the same multi-date campaign (audits/
  // multi-date-festival-audit.txt design (a) — one document per date,
  // linked by groupId). Derived client-side from the same list fetch
  // rather than a new endpoint — the list already has every item's
  // groupId.
  const [groupSiblings, setGroupSiblings] = useState([]);

  const loadItem = useCallback(async (ctl) => {
    if (!shop || !festivalId) { setItemLoading(false); return; }
    setItemLoading(true);
    setItemError('');
    try {
      const data = await apiGet(`/api/queue/${encodeURIComponent(shop)}/festival`);
      if (ctl?.aborted) return;
      const items = data.items || [];
      const found = items.find((i) => i._id === festivalId);
      setItem(found || null);
      if (!found) {
        setItemError('Festival item not found');
        setGroupSiblings([]);
      } else if (found.groupId) {
        setGroupSiblings(
          items
            .filter((i) => i.groupId === found.groupId)
            .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
        );
      } else {
        setGroupSiblings([]);
      }
    } catch (e) {
      if (ctl?.aborted) return;
      setItemError(e.message || 'Failed to load festival');
    } finally {
      if (!ctl?.aborted) setItemLoading(false);
    }
  }, [shop, festivalId]);

  useEffect(() => {
    const ctl = { aborted: false };
    loadItem(ctl);
    return () => { ctl.aborted = true; };
  }, [loadItem]);

  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');

  const loadSummary = useCallback(async (ctl) => {
    if (!shop || !festivalId) { setSummaryLoading(false); return; }
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const data = await apiGet(
        `/api/queue/${encodeURIComponent(shop)}/festival/${encodeURIComponent(festivalId)}/summary`
      );
      if (ctl?.aborted) return;
      setSummary(data.summary || null);
    } catch (e) {
      if (ctl?.aborted) return;
      setSummaryError(e.message || 'Failed to load summary');
    } finally {
      if (!ctl?.aborted) setSummaryLoading(false);
    }
  }, [shop, festivalId]);

  useEffect(() => {
    const ctl = { aborted: false };
    loadSummary(ctl);
    return () => { ctl.aborted = true; };
  }, [loadSummary]);

  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [page, setPage] = useState(0);
  const limit = 20;
  const [rows, setRows] = useState([]);
  const [rowsTotal, setRowsTotal] = useState(0);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [rowsError, setRowsError] = useState('');

  const loadRecipients = useCallback(async (ctl) => {
    if (!shop || !festivalId) { setRowsLoading(false); return; }
    setRowsLoading(true);
    setRowsError('');
    try {
      const outcomeQs = outcomeFilter !== 'all' ? `&outcome=${encodeURIComponent(outcomeFilter)}` : '';
      const data = await apiGet(
        `/api/queue/${encodeURIComponent(shop)}/festival/${encodeURIComponent(festivalId)}/recipients?page=${page}${outcomeQs}`
      );
      if (ctl?.aborted) return;
      setRows(data.rows || []);
      setRowsTotal(data.total || 0);
    } catch (e) {
      if (ctl?.aborted) return;
      setRowsError(e.message || 'Failed to load recipients');
    } finally {
      if (!ctl?.aborted) setRowsLoading(false);
    }
  }, [shop, festivalId, outcomeFilter, page]);

  useEffect(() => {
    const ctl = { aborted: false };
    loadRecipients(ctl);
    return () => { ctl.aborted = true; };
  }, [loadRecipients]);

  useEffect(() => { setPage(0); }, [outcomeFilter]);

  const backButton = (
    <button onClick={() => navigate('/admin/queue')} style={{
      background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '8px 14px',
      fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer', marginBottom: 16,
    }}>
      ← Back to queue
    </button>
  );

  if (itemLoading) {
    return (
      <div style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>
        {backButton}
        <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 40 }}>Loading…</div>
      </div>
    );
  }

  if (itemError || !item) {
    return (
      <div style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>
        {backButton}
        <div style={{ ...card, textAlign: 'center', padding: '40px 16px', color: '#9ca3af', fontSize: 14 }}>
          {itemError || 'Festival item not found'}
        </div>
      </div>
    );
  }

  const badge = STATUS_BADGE[item.status] || STATUS_BADGE.draft;
  const totalPages = Math.max(1, Math.ceil(rowsTotal / limit));

  return (
    <div style={{ padding: isNarrow ? '20px 12px 32px' : '24px 20px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {backButton}

      {/* HEADER — festival name, date, status, and the notification as the customer saw it */}
      <div style={{ ...card, marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {(item.mobileImageUrl || item.desktopImageUrl || item.imageUrl) && (
          <img
            src={item.mobileImageUrl || item.desktopImageUrl || item.imageUrl}
            alt=""
            style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f0f0f', margin: 0, letterSpacing: '-0.3px' }}>
              {item.festival || item.title}
            </h1>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              background: badge.bg, color: badge.color,
            }}>{badge.label}</span>
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 10 }}>
            {formatDateTime(item.sentAt || item.scheduledAt)}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{item.title}</div>
          {item.body && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{item.body}</div>}
          {groupSiblings.length > 1 && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 10 }}>
              Date {groupSiblings.findIndex((i) => i._id === item._id) + 1} of {groupSiblings.length} in this campaign
            </div>
          )}
        </div>

        {/* Date picker — only when this item belongs to a group. Newest
            first, each marked sent/pending; picking one navigates to that
            date's own report (its own summary + recipient table, fetched
            fresh via festivalId changing — same mechanism the "Date X of
            Y" links used before this, just repackaged as a picker). */}
        {groupSiblings.length > 1 && (
          <div style={{
            width: isNarrow ? '100%' : 200, flexShrink: 0,
            border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden',
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
              letterSpacing: '0.5px', padding: '8px 10px', background: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
            }}>
              Dates in this campaign
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {[...groupSiblings].reverse().map((sibling, i, arr) => {
                const isCurrent = sibling._id === item._id;
                const isSent = sibling.status === 'sent';
                return (
                  <button
                    key={sibling._id}
                    type="button"
                    onClick={() => !isCurrent && navigate(`/admin/queue/${sibling._id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                      padding: '8px 10px', fontSize: 12, textAlign: 'left',
                      border: 'none', borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none',
                      background: isCurrent ? '#eef2ff' : '#fff',
                      color: isCurrent ? '#4f46e5' : '#374151',
                      fontWeight: isCurrent ? 700 : 500,
                      cursor: isCurrent ? 'default' : 'pointer',
                    }}
                  >
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, flexShrink: 0,
                      background: isSent ? '#dbeafe' : '#dcfce7',
                      color: isSent ? '#2563eb' : '#16a34a',
                    }}>{isSent ? 'Sent' : 'Pending'}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatDateTime(sibling.scheduledAt).split(',')[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* SUMMARY CARDS */}
      {summaryLoading ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>Loading summary…</div>
      ) : summaryError ? (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          color: '#b91c1c', fontSize: 13, padding: '12px 0',
        }}>
          <span>{summaryError}</span>
          <button onClick={() => loadSummary({ aborted: false })} style={{
            background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '5px 12px',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#374151',
          }}>Retry</button>
        </div>
      ) : summary && summary.total > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isNarrow ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 12, marginBottom: 20,
        }}>
          <StatCard label="Total" value={summary.total} />
          <StatCard label="Delivered" value={summary.delivered} color="#16a34a" />
          <StatCard label="Failed" value={summary.failed} color={summary.failed > 0 ? '#dc2626' : undefined} />
          {Object.entries(summary.byChannel || {}).map(([ch, s]) => (
            <StatCard key={ch} label={ch} value={s.total} />
          ))}
        </div>
      ) : (
        <div style={{ ...card, textAlign: 'center', color: '#9ca3af', fontSize: 13, marginBottom: 20 }}>
          {item.status === 'sent'
            ? 'Sent, but no delivery data was recorded for this date.'
            : `Not sent yet — scheduled for ${formatDateTime(item.scheduledAt).split(',')[0]}.`}
        </div>
      )}

      {/* RECIPIENT TABLE */}
      <div style={card}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 10, marginBottom: 12,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Recipients</div>
          <div style={{ display: 'inline-flex', gap: 4, padding: 3, background: '#f3f4f6', borderRadius: 8 }}>
            {['all', 'delivered', 'failed'].map((k) => (
              <button
                key={k}
                onClick={() => setOutcomeFilter(k)}
                style={{
                  border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 11,
                  fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                  background: outcomeFilter === k ? '#fff' : 'transparent',
                  color: outcomeFilter === k ? '#111827' : '#6b7280',
                  boxShadow: outcomeFilter === k ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}
              >{k}</button>
            ))}
          </div>
        </div>

        {rowsLoading ? (
          <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 32 }}>Loading…</div>
        ) : rowsError ? (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            color: '#b91c1c', fontSize: 13, padding: '12px 0',
          }}>
            <span>{rowsError}</span>
            <button onClick={() => loadRecipients({ aborted: false })} style={{
              background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '5px 12px',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#374151',
            }}>Retry</button>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: '#9ca3af', fontSize: 13 }}>
            {item.status !== 'sent'
              ? `Not sent yet — scheduled for ${formatDateTime(item.scheduledAt).split(',')[0]}.`
              : `No recipients${outcomeFilter !== 'all' ? ` with outcome "${outcomeFilter}"` : ''} yet.`}
          </div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              {rows.map((r) => (
                <div
                  key={r._id}
                  onClick={() => r.profileId && navigate(`/admin/customers/${r.profileId}?from=queue&fid=${festivalId}`)}
                  onMouseEnter={(e) => { if (r.profileId) e.currentTarget.style.background = '#f9fafb'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 4px', borderBottom: '1px solid #f9fafb',
                    cursor: r.profileId ? 'pointer' : 'default',
                    minWidth: isNarrow ? 480 : 0,
                  }}
                >
                  <div style={{ flex: 2, minWidth: 0, fontSize: 13, color: '#111827', fontWeight: 500 }}>
                    {r.email || `Anonymous · #${(r.subscriptionTokenMasked || r.cartToken || '?????').slice(-5)}`}
                  </div>
                  <div style={{ flex: 1, fontSize: 12, color: '#6b7280' }}>
                    {r.channel === 'email' ? '✉️ Email' : '🔔 Push'}
                  </div>
                  <div style={{
                    flex: 1, fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
                    color: OUTCOME_COLORS[r.outcome] || '#9ca3af',
                  }}>
                    {r.outcome || '—'}
                  </div>
                  <div style={{ flex: 1, fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>
                    {formatDateTime(r.sentAt)}
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  style={{
                    padding: '5px 12px', fontSize: 12, borderRadius: 6, border: 'none',
                    background: '#f3f4f6', color: page === 0 ? '#d1d5db' : '#374151',
                    cursor: page === 0 ? 'not-allowed' : 'pointer',
                  }}
                >Prev</button>
                <span style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  style={{
                    padding: '5px 12px', fontSize: 12, borderRadius: 6, border: 'none',
                    background: '#f3f4f6', color: page + 1 >= totalPages ? '#d1d5db' : '#374151',
                    cursor: page + 1 >= totalPages ? 'not-allowed' : 'pointer',
                  }}
                >Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
