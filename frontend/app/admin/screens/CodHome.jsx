'use client';

import React, { useEffect, useState } from 'react';
import { apiGet } from '../../../lib/api';
import CodOrders from './CodOrders';
import PrepaidOffer from './PrepaidOffer';


const SECTIONS = [
  { key: 'orders', label: 'COD orders' },
  { key: 'prepaid', label: 'Prepaid offer' },
];

/** The Cash on delivery page: orders first, the prepaid offer one tab over. */
export default function CodHome({ shop }) {
  const [section, setSection] = useState('orders');
  // Loaded once: tells the tab whether the offer is locked (Free plan), and is handed to the tab itself.
  const [offer, setOffer] = useState(null);

  useEffect(() => {
    if (!shop) return undefined;
    let cancelled = false;
    apiGet(`/api/prepaid-offer/${encodeURIComponent(shop)}`)
      .then((d) => { if (!cancelled && d && d.settings) setOffer(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [shop]);

  const locked = offer && offer.allowed === false;
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
              {s.key === 'prepaid' && locked ? (
                <span style={ui.lockTag} aria-label={`Locked: ${offer.upgradePlan ? offer.upgradePlan.name : 'paid'} plan`}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10.5" width="16" height="10.5" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>
                  {offer.upgradePlan ? offer.upgradePlan.name : 'Paid'}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
      {section === 'prepaid' ? <PrepaidOffer shop={shop} initialData={offer} /> : <CodOrders shop={shop} />}
    </div>
  );
}

const ui = {
  barWrap: { maxWidth: 1080, margin: '0 auto', padding: '16px 20px 0', fontFamily: "-apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif" },
  bar: { display: 'flex', gap: 2, borderBottom: '1px solid #E3E3E3' },
  tab: { display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 12px', background: 'transparent', border: 'none', borderBottom: '2px solid transparent', marginBottom: -1, fontSize: 13, fontWeight: 500, color: '#616161', cursor: 'pointer', fontFamily: 'inherit' },
  lockTag: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#4A4A4A', background: '#EBEBEB', borderRadius: 8, padding: '1px 7px' },
  tabOn: { color: '#303030', borderBottomColor: '#303030', fontWeight: 600 },
};
