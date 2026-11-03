'use client';

import React, { useState } from 'react';
import Reviews from './Reviews';
import ReviewsManage from './ReviewsManage';

const ACCENT = '#4F46E5';

const SECTIONS = [
  { key: 'manage', label: 'Manage reviews' },
  { key: 'settings', label: 'Settings' },
];

/** The Reviews page: moderation first, settings one tab over. */
export default function ReviewsHome({ shop }) {
  const [section, setSection] = useState('manage');

  return (
    <div>
      <div style={ui.barWrap}>
        <div role="tablist" aria-label="Reviews sections" style={ui.bar}>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={section === s.key}
              onClick={() => setSection(s.key)}
              style={{ ...ui.tab, ...(section === s.key ? ui.tabOn : null) }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {section === 'settings' ? (
        <Reviews shop={shop} />
      ) : (
        <div style={ui.page}>
          <h1 style={ui.title}>Product reviews</h1>
          <p style={ui.subtitle}>Approve, hide or delete what customers write on your product pages.</p>
          <ReviewsManage shop={shop} />
        </div>
      )}
    </div>
  );
}

const ui = {
  barWrap: { maxWidth: 1080, margin: '0 auto', padding: '16px 20px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  bar: { display: 'flex', gap: 4, borderBottom: '1px solid #E5E7EB' },
  tab: { height: 40, padding: '0 16px', background: 'transparent', border: 'none', borderBottom: '3px solid transparent', marginBottom: -1, fontSize: 14, fontWeight: 700, color: '#6B7280', cursor: 'pointer' },
  tabOn: { color: ACCENT, borderBottomColor: ACCENT },
  page: { maxWidth: 1080, margin: '0 auto', padding: '20px 20px 64px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#111827' },
  title: { fontSize: 24, fontWeight: 800, margin: 0, color: '#111827' },
  subtitle: { margin: '4px 0 18px', fontSize: 13.5, color: '#6B7280' },
};
