'use client';

import { useState, useEffect } from 'react';
import { apiGet } from '../../../lib/api';

function currentShop() {
  if (typeof window === 'undefined') return '';
  const fromUrl = new URLSearchParams(window.location.search).get('shop');
  if (fromUrl) return fromUrl;
  return (window.shopify && window.shopify.config && window.shopify.config.shop) || '';
}

const PAUSED = {
  codOrders: 'the COD form is paused',
  subscribers: 'new push sign-ups are paused',
  messages: 'automated messages are paused',
};

export function limitMessage(planName, reached) {
  const parts = reached.map((k) => PAUSED[k]).filter(Boolean);
  if (!parts.length) return '';
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `You have reached a limit of the ${planName || 'current'} plan: ${list}.`;
}

// Every installed store can use the app (no subscription = Free plan with limits), so this never
// blocks. It shows a banner above every admin page while a plan limit is reached, linking to the
// Plans page. Fails quietly: on any error the app shows without a banner.
export default function PlanGate({ children }) {
  const [notice, setNotice] = useState('');
  const [plansHref, setPlansHref] = useState('/admin/plans');

  useEffect(() => {
    let cancelled = false;
    const shop = currentShop();
    if (typeof window !== 'undefined') {
      setPlansHref(`/admin/plans${window.location.search || ''}`);
      if (window.location.pathname.startsWith('/admin/plans')) return undefined; // the page says it itself
    }
    if (shop) {
      apiGet(`/api/billing/${encodeURIComponent(shop)}/usage`)
        .then((u) => {
          if (cancelled || !u || !Array.isArray(u.reached)) return;
          setNotice(limitMessage(u.plan && u.plan.name, u.reached));
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {notice ? (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            background: '#FFF5EA',
            borderBottom: '1px solid #FFD79D',
            color: '#4A2C00',
            padding: '10px 20px',
            fontSize: '14px',
            lineHeight: 1.5,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <span>{notice}</span>
          <a href={plansHref} style={{ color: '#4F46E5', fontWeight: 700, textDecoration: 'none' }}>
            See plans
          </a>
        </div>
      ) : null}
      {children}
    </>
  );
}
