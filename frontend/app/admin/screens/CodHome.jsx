'use client';

import React, { useState } from 'react';
import CodOrders from './CodOrders';
import PrepaidOffer from './PrepaidOffer';

const ACCENT = '#4F46E5';

const SECTIONS = [
  { key: 'orders', label: 'COD orders' },
  { key: 'prepaid', label: 'Prepaid offer' },
];

/** The Cash on delivery page: orders first, the prepaid offer one tab over. */
export default function CodHome({ shop }) {
  const [section, setSection] = useState('orders');
  return (
    <div>
      <div style={ui.barWrap}>
        <div role="tablist" aria-label="Cash on delivery sections" style={ui.bar}>
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
      {section === 'prepaid' ? <PrepaidOffer shop={shop} /> : <CodOrders shop={shop} />}
    </div>
  );
}

const ui = {
  barWrap: { maxWidth: 1080, margin: '0 auto', padding: '16px 20px 0', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  bar: { display: 'flex', gap: 4, borderBottom: '1px solid #E5E7EB' },
  tab: { height: 40, padding: '0 16px', background: 'transparent', border: 'none', borderBottom: '3px solid transparent', marginBottom: -1, fontSize: 14, fontWeight: 700, color: '#6B7280', cursor: 'pointer' },
  tabOn: { color: ACCENT, borderBottomColor: ACCENT },
};
