'use client';

import React, { useEffect, useRef, useState } from 'react';
import { planFeatures, priceLabel, usePoppins } from './Plans';

const ACCENT = '#4F46E5';
const VIOLET = '#7C3AED';
const SAMPLE = { price: 999, save: 49.95 };

function plansHref() {
  if (typeof window === 'undefined') return '/admin/plans';
  return `/admin/plans${window.location.search || ''}`;
}

const inr = (n) => `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

// Light animations only (transform and opacity): no blur filters or animated shadows, which made the page
// stutter inside the Shopify admin. Nothing moves for people who ask their device for reduced motion.
const MOTION = `
@keyframes ccfFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes ccfRing { 0% { transform: scale(.85); opacity: .55; } 100% { transform: scale(1.6); opacity: 0; } }
@keyframes ccfShine { 0% { transform: translateX(-160%) skewX(-20deg); } 60%, 100% { transform: translateX(320%) skewX(-20deg); } }
@keyframes ccfRise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes ccfFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ccfPop { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
.ccf-float { animation: ccfFloat 3s ease-in-out infinite; will-change: transform; }
.ccf-ring { animation: ccfRing 2.2s ease-out infinite; }
.ccf-shine { animation: ccfShine 3.8s ease-in-out .8s infinite; }
.ccf-rise { animation: ccfRise .45s cubic-bezier(.2,.8,.2,1) both; }
.ccf-fade { animation: ccfFade .18s ease-out both; }
.ccf-pop { animation: ccfPop .24s cubic-bezier(.2,.8,.2,1) both; }
.ccf-cta { transition: transform .15s ease, box-shadow .15s ease, filter .15s ease; }
.ccf-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(79,70,229,.32); filter: brightness(1.04); }
.ccf-ghost { transition: background .15s ease, border-color .15s ease; }
.ccf-ghost:hover { background: #F9FAFB; border-color: #C7CBD3; }
.ccf-x:hover { background: rgba(255,255,255,.28) !important; }
@media (prefers-reduced-motion: reduce) {
  .ccf-float, .ccf-ring, .ccf-shine, .ccf-rise, .ccf-fade, .ccf-pop { animation: none !important; }
  .ccf-ring { opacity: 0; }
  .ccf-cta, .ccf-cta:hover { transition: none; transform: none; }
}
`;

const LockIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
);
const Check = ({ dark }) => (
  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 1 }}>
    <circle cx="10" cy="10" r="10" fill={dark ? '#EEF2FF' : '#E8F5EE'} />
    <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke={dark ? ACCENT : '#0E8A4F'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Icon = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((x) => <path key={x} d={x} />)}
  </svg>
);
const CardGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" />
  </svg>
);

const BENEFITS = [
  { icon: ['M20 6L9 17l-5-5'], title: 'Fewer refused parcels', text: 'Customers who pay first rarely refuse the delivery.' },
  { icon: ['M12 2v20', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'], title: 'Get paid sooner', text: 'Money arrives through Shopify, not later from the courier.' },
  { icon: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'], title: 'You stay in control', text: 'Choose % or ₹ off, a maximum, a minimum order and colours.' },
];

const STEPS = [
  { title: 'Customer opens your COD form', text: 'From the COD button on your product page.' },
  { title: 'They see "Pay online and save"', text: 'With the exact amount they save.' },
  { title: 'They pay at Shopify checkout', text: 'A one-time code is already applied.' },
];

/** What customers will see, sharp (not blurred), marked as locked. */
function LockedOfferCard({ planLabel }) {
  return (
    <div style={ui.cardWrap} role="img" aria-label="Locked preview">
      <div style={ui.cardHead}>
        <span style={ui.cardHeadText}>What your customers will see</span>
        <span style={ui.lockedPill}><LockIcon size={12} />Locked</span>
      </div>
      <div style={ui.offer}>
        <span className="ccf-shine" style={ui.shine} aria-hidden="true" />
        <div style={ui.offerTop}>
          <span style={ui.offerIcon}><CardGlyph /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={ui.offerTitleRow}>
              <strong style={ui.offerTitle}>Pay online and save</strong>
              <span style={ui.offerSave}>Save {inr(SAMPLE.save)}</span>
            </div>
            <span style={ui.offerSub}>Pay now by UPI, card or wallet.</span>
          </div>
        </div>
        <div style={ui.offerBtn}>
          <span>Pay online · {inr(Math.round((SAMPLE.price - SAMPLE.save) * 100) / 100)}</span>
          <s style={ui.offerWas}>{inr(SAMPLE.price)}</s>
        </div>
      </div>
      <div style={ui.cardFoot}>
        <span style={ui.lockBadgeWrap} aria-hidden="true">
          <span className="ccf-ring" style={ui.lockRing} />
          <span className="ccf-float" style={ui.lockBadge}><LockIcon size={16} /></span>
        </span>
        <span>
          <strong style={ui.unlockTitle}>Unlock with {planLabel}</strong>
          <span style={ui.unlockText}>Turn it on in one click after upgrading.</span>
        </span>
      </div>
    </div>
  );
}

/** The "upgrade to unlock" popup. Closes with Maybe later, ×, Escape or a click outside. */
function UpgradeModal({ plan, trialDays, planName, onUpgrade, onClose }) {
  const primary = useRef(null);
  useEffect(() => {
    if (primary.current) primary.current.focus();
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const features = plan ? planFeatures(plan) : [];
  const trial = Number(trialDays) > 0 ? Number(trialDays) : 0;
  return (
    <div className="ccf-fade" style={ui.backdrop} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ccf-pop" role="dialog" aria-modal="true" aria-labelledby="ccf-up-title" aria-describedby="ccf-up-text" style={ui.modal}>
        <div style={ui.mHead}>
          <span style={ui.mIcon}><LockIcon size={20} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={ui.mEyebrow}>{plan ? `${plan.name} plan feature` : 'Paid plan feature'}</div>
            <h2 id="ccf-up-title" style={ui.mTitle}>Unlock the Prepaid offer</h2>
          </div>
          <button type="button" className="ccf-x" aria-label="Close" onClick={onClose} style={ui.mClose}>×</button>
        </div>

        <div style={ui.mBody}>
          <p id="ccf-up-text" style={ui.mText}>
            You are on the {planName} plan. Upgrade to show &quot;Pay online and save&quot; on your COD form and turn
            more COD orders into prepaid orders.
          </p>
          {plan ? (
            <div style={ui.mPlan}>
              <div style={ui.mPlanHead}>
                <span style={ui.mPlanName}>{plan.name}</span>
                <span><strong style={ui.mPlanPrice}>{priceLabel(plan.price)}</strong><span style={ui.mPer}>/month</span></span>
              </div>
              <ul style={ui.mList}>
                {features.map((f) => <li key={f} style={ui.mLi}><Check />{f}</li>)}
              </ul>
            </div>
          ) : null}
        </div>

        <div style={ui.mFoot}>
          <button ref={primary} type="button" className="ccf-cta" onClick={onUpgrade} style={ui.mPrimary}>
            {trial ? `Start ${trial}-day free trial` : 'Upgrade now'}
          </button>
          <div style={ui.mFootRow}>
            <span style={ui.mFine}>Billed securely by Shopify · Cancel anytime</span>
            <button type="button" onClick={onClose} style={ui.mLater}>Maybe later</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The Prepaid offer on the Free plan: what it does, a locked preview of it, and the way to unlock it. */
export default function PrepaidLocked({ data }) {
  usePoppins();
  const [open, setOpen] = useState(true);
  const plan = data.upgradePlan || null;
  const trial = Number(data.trialDays) > 0 ? Number(data.trialDays) : 0;
  const planLabel = plan ? plan.name : 'a paid plan';

  function upgrade() {
    if (data.upgradeUrl) window.open(data.upgradeUrl, '_top');
  }

  return (
    <div style={ui.page}>
      <style>{MOTION}</style>

      <section className="ccf-rise" style={ui.hero} aria-label="Prepaid offer">
        <div style={ui.heroCopy}>
          <span style={ui.badge}><LockIcon size={13} />{plan ? `${plan.name} plan feature` : 'Paid plan feature'}</span>
          <h1 style={ui.title}>Turn COD orders into prepaid orders</h1>
          <p style={ui.lead}>
            Show a &quot;Pay online and save&quot; offer on your COD form. Customers who pay online get a small
            discount; you get fewer refused parcels and your money sooner.
          </p>
          <div style={ui.ctaRow}>
            <button type="button" className="ccf-cta" onClick={upgrade} style={ui.primary}>
              <LockIcon size={15} />Upgrade to unlock
            </button>
            <a href={plansHref()} className="ccf-ghost" style={ui.secondary}>Compare plans</a>
          </div>
          <p style={ui.fine}>
            {trial ? `${trial}-day free trial on paid plans · ` : ''}Cancel anytime · Billed by Shopify
          </p>
        </div>
        <div style={ui.heroSide}>
          <LockedOfferCard planLabel={planLabel} />
          <button type="button" onClick={() => setOpen(true)} style={ui.linkBtn}>See what is included</button>
        </div>
      </section>

      <ul style={ui.benefits} aria-label="Why it helps">
        {BENEFITS.map((b, i) => (
          <li key={b.title} className="ccf-rise" style={{ ...ui.benefit, animationDelay: `${0.08 * (i + 1)}s` }}>
            <span style={ui.benefitIcon}><Icon d={b.icon} /></span>
            <strong style={ui.benefitTitle}>{b.title}</strong>
            <span style={ui.benefitText}>{b.text}</span>
          </li>
        ))}
      </ul>

      <section style={ui.how} aria-labelledby="ccf-how">
        <h2 id="ccf-how" style={ui.howTitle}>How it works</h2>
        <ol style={ui.steps}>
          {STEPS.map((s, i) => (
            <li key={s.title} style={ui.step}>
              <span style={ui.stepNum}>{i + 1}</span>
              <span style={{ minWidth: 0 }}>
                <strong style={ui.stepTitle}>{s.title}</strong>
                <span style={ui.stepText}>{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {open ? (
        <UpgradeModal plan={plan} trialDays={data.trialDays} planName={data.planName} onUpgrade={upgrade} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

const FONT = "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const ui = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '20px 20px 96px', fontFamily: FONT, color: '#111827' },

  hero: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 28, padding: 'clamp(18px, 3vw, 28px)', borderRadius: 18, background: 'linear-gradient(120deg, #FFFFFF 0%, #FAF8FF 45%, #EEF0FF 100%)', border: '1px solid #E4E7FB', boxShadow: '0 1px 2px rgba(17,24,39,.04)' },
  heroCopy: { flex: '1 1 380px', minWidth: 0 },
  heroSide: { flex: '0 1 360px', minWidth: 260, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: ACCENT, background: '#EEF2FF', border: '1px solid #E0E7FF', borderRadius: 999, padding: '4px 11px' },
  title: { fontSize: 'clamp(22px, 2.6vw, 28px)', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.02em', margin: '12px 0 8px' },
  lead: { fontSize: 14.5, color: '#4B5563', lineHeight: 1.65, margin: '0 0 18px', maxWidth: 520 },
  ctaRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  primary: { display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 20px', borderRadius: 11, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14.5, fontWeight: 600, color: '#fff', background: `linear-gradient(135deg, ${ACCENT}, ${VIOLET})`, boxShadow: '0 4px 12px rgba(79,70,229,.22)' },
  secondary: { display: 'inline-flex', alignItems: 'center', height: 44, padding: '0 18px', borderRadius: 11, border: '1px solid #D9DCE3', background: '#fff', color: '#111827', fontSize: 14.5, fontWeight: 600, textDecoration: 'none' },
  fine: { fontSize: 12.5, color: '#6B7280', margin: '10px 0 0' },
  linkBtn: { marginTop: 8, background: 'none', border: 'none', color: ACCENT, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 4 },

  cardWrap: { width: '100%', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, padding: 14, boxShadow: '0 10px 30px rgba(31,41,55,.08)' },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardHeadText: { fontSize: 11.5, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6B7280' },
  lockedPill: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: '#fff', background: '#111827', borderRadius: 999, padding: '3px 9px' },
  offer: { position: 'relative', overflow: 'hidden', border: '1px solid rgba(79,70,229,.32)', background: 'rgba(79,70,229,.045)', borderRadius: 12, padding: 12, opacity: 0.92 },
  shine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '30%', background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.75), rgba(255,255,255,0))', pointerEvents: 'none' },
  offerTop: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  offerIcon: { width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', color: ACCENT, background: 'rgba(79,70,229,.12)' },
  offerTitleRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '4px 8px' },
  offerTitle: { fontSize: 13.5, fontWeight: 600 },
  offerSave: { fontSize: 11, fontWeight: 600, color: '#166534', background: '#DCFCE7', borderRadius: 999, padding: '2px 8px' },
  offerSub: { display: 'block', fontSize: 11.5, color: '#6B7280', marginTop: 2 },
  offerBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, height: 38, borderRadius: 9, color: '#fff', fontSize: 13, fontWeight: 600, background: ACCENT },
  offerWas: { fontSize: 11.5, fontWeight: 500, opacity: 0.75 },
  cardFoot: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px dashed #E5E7EB' },
  lockBadgeWrap: { position: 'relative', width: 36, height: 36, flex: '0 0 auto' },
  lockRing: { position: 'absolute', inset: 0, borderRadius: 11, border: `2px solid ${ACCENT}` },
  lockBadge: { position: 'absolute', inset: 0, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: `linear-gradient(135deg, ${ACCENT}, ${VIOLET})`, boxShadow: '0 6px 14px rgba(79,70,229,.3)' },
  unlockTitle: { display: 'block', fontSize: 13.5, fontWeight: 600 },
  unlockText: { display: 'block', fontSize: 12, color: '#6B7280' },

  benefits: { listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  benefit: { display: 'flex', flexDirection: 'column', gap: 4, background: '#fff', border: '1px solid #ECEEF2', borderRadius: 14, padding: '14px 16px' },
  benefitIcon: { width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, background: '#EEF2FF', marginBottom: 6 },
  benefitTitle: { fontSize: 14, fontWeight: 600 },
  benefitText: { fontSize: 13, color: '#6B7280', lineHeight: 1.5 },

  how: { marginTop: 22 },
  howTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 10px' },
  steps: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 },
  step: { display: 'flex', gap: 12, alignItems: 'flex-start', background: '#fff', border: '1px solid #ECEEF2', borderRadius: 14, padding: '12px 14px' },
  stepNum: { flex: '0 0 auto', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700, color: '#fff', background: `linear-gradient(135deg, ${ACCENT}, ${VIOLET})` },
  stepTitle: { display: 'block', fontSize: 13.5, fontWeight: 600 },
  stepText: { display: 'block', fontSize: 12.5, color: '#6B7280', marginTop: 2 },

  // Popup: sits high in the frame (Shopify's assistant bar covers the bottom), never taller than the frame,
  // and its main button stays in view at the bottom of the popup.
  backdrop: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(17,24,39,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px 88px', overflowY: 'auto', fontFamily: FONT },
  modal: { width: '100%', maxWidth: 460, maxHeight: 'calc(100vh - 112px)', display: 'flex', flexDirection: 'column', margin: 'auto 0', background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 60px rgba(17,24,39,.3)' },
  mHead: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 16px 16px 20px', background: `linear-gradient(120deg, ${ACCENT}, ${VIOLET})`, color: '#fff' },
  mIcon: { width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', background: 'rgba(255,255,255,.18)', border: '1px solid rgba(255,255,255,.3)' },
  mEyebrow: { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.85 },
  mTitle: { fontSize: 18, fontWeight: 700, margin: '1px 0 0', lineHeight: 1.3 },
  mClose: { flex: '0 0 auto', width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.16)', color: '#fff', fontSize: 20, lineHeight: '30px', cursor: 'pointer' },
  mBody: { padding: '16px 20px 4px', overflowY: 'auto' },
  mText: { fontSize: 13.5, color: '#4B5563', lineHeight: 1.6, margin: '0 0 14px' },
  mPlan: { border: '1px solid #E8EAF6', borderRadius: 14, padding: '12px 14px', background: '#FAFAFF' },
  mPlanHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 },
  mPlanName: { fontSize: 14.5, fontWeight: 600 },
  mPlanPrice: { fontSize: 19, fontWeight: 700 },
  mPer: { fontSize: 12.5, color: '#6B7280', marginLeft: 2 },
  mList: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '7px 12px' },
  mLi: { display: 'flex', gap: 8, fontSize: 12.5, color: '#374151', lineHeight: 1.45 },
  mFoot: { padding: '14px 20px 16px', borderTop: '1px solid #F1F2F6', background: '#fff' },
  mPrimary: { width: '100%', height: 46, borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: '#fff', background: `linear-gradient(135deg, ${ACCENT}, ${VIOLET})` },
  mFootRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  mFine: { fontSize: 11.5, color: '#6B7280' },
  mLater: { background: 'none', border: 'none', color: '#4B5563', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: '4px 2px' },
};
