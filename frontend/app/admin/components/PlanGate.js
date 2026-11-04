'use client';

import { useState, useEffect } from 'react';
import { apiGet } from '../../../lib/api';
import PlanChooser from './PlanChooser';

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

// Right after an install or reinstall the merchant first chooses a plan ("Choose your plan": Free, or a
// paid plan with its free trial on Shopify's plan page). After that the app is never blocked: no
// subscription = Free plan with limits, and a banner shows while a limit is reached. Fails open: on any
// error the app shows. While the check runs (at most CHECK_TIMEOUT_MS) the page loads but stays hidden, so
// a new install never flashes the dashboard before "Choose your plan".
export const CHECK_TIMEOUT_MS = 3000;

export default function PlanGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState('');
  const [chooser, setChooser] = useState(null);
  const [plansHref, setPlansHref] = useState('/admin/plans');

  useEffect(() => {
    let cancelled = false;
    const done = () => { if (!cancelled) setChecking(false); };
    const shop = currentShop();
    if (typeof window !== 'undefined') {
      setPlansHref(`/admin/plans${window.location.search || ''}`);
      // The Plans page is where a plan is chosen (and where Shopify sends the merchant back).
      if (window.location.pathname.startsWith('/admin/plans')) { done(); return undefined; }
    }
    if (!shop) { done(); return undefined; }
    const timer = setTimeout(done, CHECK_TIMEOUT_MS);
    apiGet(`/api/billing/${encodeURIComponent(shop)}/usage`)
      .then((u) => {
        if (cancelled || !u) return;
        if (u.needsPlanChoice === true && Array.isArray(u.plans) && u.plans.length) {
          setChooser({ shop, plans: u.plans, trialDays: u.trialDays, upgradeUrl: u.upgradeUrl });
          return;
        }
        if (Array.isArray(u.reached)) setNotice(limitMessage(u.plan && u.plan.name, u.reached));
      })
      .catch(() => {})
      .finally(() => { clearTimeout(timer); done(); });
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  if (chooser) {
    return <PlanChooser {...chooser} onChosen={() => setChooser(null)} />;
  }

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
      <div aria-busy={checking || undefined} style={checking ? { visibility: 'hidden' } : undefined}>
        {children}
      </div>
    </>
  );
}
