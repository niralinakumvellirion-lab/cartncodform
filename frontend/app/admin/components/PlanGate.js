'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

const usageUrl = (shop, refresh) => `/api/billing/${encodeURIComponent(shop)}/usage${refresh ? '?refresh=1' : ''}`;
const paidName = (u) => (u && u.tier && u.tier !== 'free' ? (u.plan && u.plan.name) || 'paid' : '');

export default function PlanGate({ children }) {
  const [checking, setChecking] = useState(true);
  const [notice, setNotice] = useState('');
  const [chooser, setChooser] = useState(null);
  const [plansHref, setPlansHref] = useState('/admin/plans');
  // Name of the paid plan just confirmed with Shopify ("Your Starter plan is active."), or ''.
  const [activated, setActivated] = useState('');
  const recheckRef = useRef(null);

  // While "Choose your plan" shows: ask Shopify again (the merchant may have approved a plan on Shopify's
  // page and come back to this screen). A paid plan closes the chooser and confirms it.
  // -> true when the chooser was closed.
  const recheck = useCallback(() => {
    const shop = currentShop();
    if (!shop) return Promise.resolve(false);
    if (recheckRef.current) return recheckRef.current;
    const p = apiGet(usageUrl(shop, true))
      .then((u) => {
        if (!u || u.needsPlanChoice !== false) return false;
        setChooser(null);
        setActivated(paidName(u));
        return true;
      })
      .catch(() => false)
      .finally(() => { recheckRef.current = null; });
    recheckRef.current = p;
    return p;
  }, []);

  useEffect(() => {
    if (!chooser || typeof window === 'undefined') return undefined;
    const onShow = () => { if (document.visibilityState !== 'hidden') recheck(); };
    window.addEventListener('pageshow', onShow);
    window.addEventListener('focus', onShow);
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener('focus', onShow);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [chooser, recheck]);

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
    // Back from Shopify's plan page (welcome link): confirm the new plan with Shopify right away.
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const back = !!params && (params.has('plan_handle') || params.has('charge_id'));
    apiGet(usageUrl(shop, back))
      .then((u) => {
        if (cancelled || !u) return;
        if (u.needsPlanChoice === true && Array.isArray(u.plans) && u.plans.length) {
          setChooser({ shop, plans: u.plans, trialDays: u.trialDays, upgradeUrl: u.upgradeUrl });
          return;
        }
        // Back from Shopify's plan page with a paid plan: confirm it.
        if (back) setActivated(paidName(u));
        if (Array.isArray(u.reached)) setNotice(limitMessage(u.plan && u.plan.name, u.reached));
      })
      .catch(() => {})
      .finally(() => { clearTimeout(timer); done(); });
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  if (chooser) {
    return <PlanChooser {...chooser} onChosen={() => setChooser(null)} onCheckAgain={recheck} />;
  }

  return (
    <>
      {activated ? (
        <div role="status" style={ui.ok}>
          <span><strong>Your {activated} plan is active.</strong> Thanks! The new limits apply now.</span>
          <button type="button" onClick={() => setActivated('')} aria-label="Dismiss" style={ui.close}>×</button>
        </div>
      ) : null}
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

const ui = {
  ok: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
    background: '#ECFDF3', borderBottom: '1px solid #ABEFC6', color: '#054F31', padding: '10px 20px',
    fontSize: '14px', lineHeight: 1.5, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  close: { background: 'none', border: 'none', color: '#054F31', fontSize: '18px', lineHeight: 1, cursor: 'pointer', padding: '0 4px' },
};
