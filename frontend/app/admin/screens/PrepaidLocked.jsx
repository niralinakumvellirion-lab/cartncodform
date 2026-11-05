'use client';

import React, { useState } from 'react';
import { priceLabel } from './Plans';
import PrepaidTour from './PrepaidTour';

/*
 * Free plan: the Prepaid offer in the Shopify admin's own visual language (approved design "Option A"):
 * system font, black primary buttons, white cards with a hairline edge, a blue info banner and an
 * animated tour (PrepaidTour.jsx) that opens first. The page itself keeps motion small: a soft shine on the
 * locked preview.
 */

const INK = '#303030';
const SUB = '#616161';
const EDGE = '#E3E3E3';
const ACCENT = '#4F46E5';
const SAMPLE = { price: 999, save: 49.95 };

function plansHref() {
  if (typeof window === 'undefined') return '/admin/plans';
  return `/admin/plans${window.location.search || ''}`;
}

const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

const MOTION = `
@keyframes ccfShine { 0% { transform: translateX(-160%) skewX(-20deg); } 60%, 100% { transform: translateX(320%) skewX(-20deg); } }
.ccf-shine { animation: ccfShine 4s ease-in-out 1s infinite; }
.ccf-btn-primary:hover { background: #1A1A1A !important; }
.ccf-btn-plain:hover { background: #F7F7F7 !important; }
.ccf-btn-primary:focus-visible, .ccf-btn-plain:focus-visible, .ccf-link:focus-visible { outline: 2px solid #005BD3; outline-offset: 2px; }
.ccf-link:hover { text-decoration: underline; }
@media (prefers-reduced-motion: reduce) { .ccf-shine { animation: none !important; } }
`;

const LockIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
);
const InfoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" />
  </svg>
);
const Check = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 1 }}>
    <circle cx="10" cy="10" r="9" fill="#CDFEE1" />
    <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="#29845A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BENEFITS = [
  { title: 'Fewer refused parcels', text: 'Customers who pay first rarely refuse the delivery.' },
  { title: 'Get paid sooner', text: 'Money arrives through Shopify, not later from the courier.' },
  { title: 'You set the rules', text: 'Choose % or ₹ off, a maximum and a minimum order.' },
];

const STEPS = [
  { title: 'Customer opens your COD form', text: 'From the COD button on your product page.' },
  { title: 'They see the saving', text: '"Pay online and save" with the exact amount, above the fields.' },
  { title: 'They pay at checkout', text: 'A one-time code is already applied to their order.' },
];

function Button({ primary, children, ...rest }) {
  return (
    <button type="button" className={primary ? 'ccf-btn-primary' : 'ccf-btn-plain'} style={primary ? ui.btnPrimary : ui.btnPlain} {...rest}>
      {children}
    </button>
  );
}

/** The Prepaid offer on the Free plan: what it does, a locked preview of it, and the way to unlock it. */
export default function PrepaidLocked({ data }) {
  // The animated tour opens first; "See what is included" re-opens it on the plan step.
  const [tour, setTour] = useState({ open: true, start: 0 });
  const plan = data.upgradePlan || null;
  const trial = Number(data.trialDays) > 0 ? Number(data.trialDays) : 0;
  const planName = plan ? plan.name : 'a paid plan';
  const ctaLabel = trial ? `Start ${trial}-day free trial` : 'Upgrade to unlock';

  function upgrade() {
    if (data.upgradeUrl) window.open(data.upgradeUrl, '_top');
  }

  return (
    <div style={ui.page}>
      <style>{MOTION}</style>

      <div style={ui.titleBar}>
        <h1 style={ui.pageTitle}>Prepaid offer</h1>
        <Button primary onClick={upgrade}>Upgrade plan</Button>
      </div>

      <div role="status" style={ui.banner}>
        <span style={ui.bannerIcon}><InfoIcon /></span>
        <div style={{ minWidth: 0 }}>
          <strong style={ui.bannerTitle}>Available on {plan ? `${plan.name} and above` : 'paid plans'}</strong>
          <span>
            You are on the {data.planName} plan. Upgrade to show &quot;Pay online and save&quot; on your COD form.
            {trial ? ` Every paid plan starts with a ${trial}-day free trial.` : ''}
          </span>
          <div style={{ marginTop: 6 }}>
            <button type="button" className="ccf-link" onClick={() => setTour({ open: true, start: 6 })} style={ui.bannerLink}>See what is included</button>
          </div>
        </div>
      </div>

      <div style={ui.grid}>
        <section style={ui.card} aria-labelledby="ccf-pp-title">
          <h2 id="ccf-pp-title" style={ui.cardTitle}>Turn COD orders into prepaid orders</h2>
          <p style={ui.cardText}>Customers who pay online get a small discount on your COD form.</p>
          <ul style={ui.list}>
            {BENEFITS.map((b) => (
              <li key={b.title} style={ui.li}>
                <Check />
                <span><strong style={ui.liTitle}>{b.title}</strong><span style={ui.liText}>{b.text}</span></span>
              </li>
            ))}
          </ul>
          <div style={ui.row}>
            <Button primary onClick={upgrade}>{ctaLabel}</Button>
            <a href={plansHref()} className="ccf-btn-plain" style={ui.btnPlainLink}>Compare plans</a>
          </div>
          <p style={ui.fine}>Billed by Shopify · Cancel anytime</p>
        </section>

        <section style={ui.card} aria-labelledby="ccf-prev-title">
          <div style={ui.prevHead}>
            <h2 id="ccf-prev-title" style={ui.cardTitle}>Customer preview</h2>
            <span style={ui.lockedBadge}><LockIcon size={11} />Locked</span>
          </div>
          <div role="img" aria-label="Locked preview">
            <div style={ui.offer}>
              <span className="ccf-shine" style={ui.shine} aria-hidden="true" />
              <div style={ui.offerTop}>
                <span>Pay online and save</span>
                <span style={ui.save}>Save {inr(SAMPLE.save)}</span>
              </div>
              <span style={ui.offerSub}>Pay now by UPI, card or wallet.</span>
              <div style={ui.payBtn}>
                Pay online · {inr(Math.round((SAMPLE.price - SAMPLE.save) * 100) / 100)}
                <s style={ui.was}>{inr(SAMPLE.price)}</s>
              </div>
            </div>
            <div style={ui.lockLine}>
              <span style={ui.lockTile}><LockIcon /></span>
              <span>Unlocks on {planName}{plan ? ` (${priceLabel(plan.price)}/month)` : ''}</span>
            </div>
          </div>
        </section>
      </div>

      <section style={{ ...ui.card, marginTop: 16 }} aria-labelledby="ccf-how">
        <h2 id="ccf-how" style={ui.cardTitle}>How it works</h2>
        <ol style={ui.steps}>
          {STEPS.map((s, i) => (
            <li key={s.title} style={ui.step}>
              <span style={ui.num}>{i + 1}</span>
              <strong style={ui.stepTitle}>{s.title}</strong>
              <span style={ui.stepText}>{s.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {tour.open ? (
        <PrepaidTour
          key={tour.start}
          plan={plan}
          trialDays={data.trialDays}
          startAt={tour.start}
          onUpgrade={upgrade}
          onClose={() => setTour({ open: false, start: 0 })}
        />
      ) : null}
    </div>
  );
}

// Shopify admin font stack (what Polaris uses), so the screen blends in with the admin around it.
const FONT = "-apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";
const CARD_SHADOW = `0 1px 0 rgba(26,26,26,.07), inset 0 0 0 1px ${EDGE}`;
const ui = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '16px 20px 96px', fontFamily: FONT, color: INK, fontSize: 13, lineHeight: 1.5, WebkitFontSmoothing: 'antialiased' },
  titleBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 },
  pageTitle: { fontSize: 20, fontWeight: 650, margin: 0, letterSpacing: '-0.01em', color: INK },

  btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 550, color: '#fff', background: INK, boxShadow: 'inset 0 -1px 0 #000, 0 1px 0 rgba(0,0,0,.2)' },
  btnPlain: { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 550, color: INK, background: '#fff', boxShadow: 'inset 0 0 0 1px #D4D4D4, 0 1px 0 rgba(0,0,0,.05)' },
  btnPlainLink: { display: 'inline-flex', alignItems: 'center', minHeight: 32, padding: '0 12px', borderRadius: 8, fontSize: 13, fontWeight: 550, color: INK, background: '#fff', boxShadow: 'inset 0 0 0 1px #D4D4D4, 0 1px 0 rgba(0,0,0,.05)', textDecoration: 'none' },

  banner: { display: 'flex', gap: 10, alignItems: 'flex-start', background: '#EAF4FF', border: '1px solid #C5E1FF', borderRadius: 12, padding: '12px 14px', marginBottom: 16, color: INK },
  bannerIcon: { color: '#005BD3', flex: '0 0 auto', marginTop: 1 },
  bannerTitle: { display: 'block', fontWeight: 600, marginBottom: 2 },
  bannerLink: { background: 'none', border: 'none', padding: 0, color: '#005BD3', fontFamily: 'inherit', fontSize: 13, fontWeight: 550, cursor: 'pointer' },

  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' },
  card: { background: '#fff', borderRadius: 12, boxShadow: CARD_SHADOW, padding: 16 },
  cardTitle: { fontSize: 14, fontWeight: 650, margin: 0, color: INK },
  cardText: { color: SUB, margin: '4px 0 14px' },
  list: { listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  li: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  liTitle: { display: 'block', fontWeight: 600 },
  liText: { display: 'block', color: SUB },
  row: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  fine: { fontSize: 12, color: SUB, margin: '10px 0 0' },

  prevHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  lockedBadge: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 550, borderRadius: 8, padding: '2px 8px', background: '#FFEB78', color: '#4F4700' },
  offer: { position: 'relative', overflow: 'hidden', border: '1px solid #C7C9FF', background: '#F7F7FF', borderRadius: 10, padding: 12 },
  shine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '28%', background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.8), rgba(255,255,255,0))', pointerEvents: 'none' },
  offerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontWeight: 600 },
  save: { fontSize: 11.5, fontWeight: 600, color: '#0C5132', background: '#CDFEE1', borderRadius: 6, padding: '1px 6px' },
  offerSub: { display: 'block', color: SUB, fontSize: 12, margin: '2px 0 10px' },
  payBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: ACCENT, color: '#fff', borderRadius: 8, fontWeight: 600, padding: '9px 10px' },
  was: { opacity: 0.7, fontWeight: 400 },
  lockLine: { display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid #EBEBEB', color: SUB },
  lockTile: { width: 28, height: 28, borderRadius: 8, background: INK, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' },

  steps: { listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 },
  step: { display: 'flex', flexDirection: 'column', gap: 2, color: SUB },
  num: { width: 22, height: 22, borderRadius: '50%', background: '#F1F1F1', boxShadow: `inset 0 0 0 1px ${EDGE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: INK, marginBottom: 6 },
  stepTitle: { fontWeight: 600, color: INK },
  stepText: { color: SUB },

};
