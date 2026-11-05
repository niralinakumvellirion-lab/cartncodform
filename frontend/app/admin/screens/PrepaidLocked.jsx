'use client';

import React, { useEffect, useRef, useState } from 'react';
import { planFeatures, priceLabel, usePoppins } from './Plans';

const ACCENT = '#4F46E5';
const VIOLET = '#7C3AED';

function plansHref() {
  if (typeof window === 'undefined') return '/admin/plans';
  return `/admin/plans${window.location.search || ''}`;
}

// Animations live in one small style block; people who ask their device for less motion get none.
const MOTION = `
@keyframes ccfLockFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes ccfLockGlow { 0% { box-shadow: 0 0 0 0 rgba(79,70,229,.45); } 70% { box-shadow: 0 0 0 16px rgba(79,70,229,0); } 100% { box-shadow: 0 0 0 0 rgba(79,70,229,0); } }
@keyframes ccfShine { 0% { transform: translateX(-140%) skewX(-18deg); } 55%, 100% { transform: translateX(260%) skewX(-18deg); } }
@keyframes ccfReveal { from { opacity: 0; transform: scale(.94); } to { opacity: 1; transform: scale(1); } }
@keyframes ccfFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes ccfPop { from { opacity: 0; transform: translateY(12px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.ccf-lock-float { animation: ccfLockFloat 3.2s ease-in-out infinite; }
.ccf-lock-glow { animation: ccfLockGlow 2.4s ease-out infinite; }
.ccf-shine { animation: ccfShine 3.6s ease-in-out 1s infinite; }
.ccf-reveal { animation: ccfReveal .5s cubic-bezier(.2,.8,.2,1) both; }
.ccf-fade { animation: ccfFadeIn .2s ease-out both; }
.ccf-pop { animation: ccfPop .28s cubic-bezier(.2,.8,.2,1) both; }
.ccf-up-btn { transition: transform .15s ease, box-shadow .15s ease; }
.ccf-up-btn:hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(79,70,229,.35); }
@media (prefers-reduced-motion: reduce) {
  .ccf-lock-float, .ccf-lock-glow, .ccf-shine, .ccf-reveal, .ccf-fade, .ccf-pop { animation: none !important; }
  .ccf-up-btn, .ccf-up-btn:hover { transition: none; transform: none; }
}
`;

const LockIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /><circle cx="12" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);
const Check = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 1 }}>
    <circle cx="10" cy="10" r="10" fill="#E8F5EE" />
    <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="#0E8A4F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Icon = ({ d }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((x) => <path key={x} d={x} />)}
  </svg>
);

const BENEFITS = [
  { icon: ['M3 12l5 5L21 4'], title: 'Fewer refused parcels', text: 'Customers who pay first rarely refuse the delivery.' },
  { icon: ['M12 2v20', 'M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6'], title: 'Get paid sooner', text: 'Money arrives through Shopify, not days later from the courier.' },
  { icon: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'], title: 'You stay in control', text: 'Choose % or ₹ off, a maximum, a minimum order and your colours.' },
];

const STEPS = [
  { title: 'Customer opens your COD form', text: 'From the COD button on your product page.' },
  { title: 'They see "Pay online and save"', text: 'With the exact amount they save, above the COD fields.' },
  { title: 'They pay at Shopify checkout', text: 'A one-time code is already applied. You get a prepaid order.' },
];

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
        <button type="button" aria-label="Close" onClick={onClose} style={ui.close}>×</button>
        <div style={ui.modalTop}>
          <div className="ccf-lock-float" style={ui.modalLock}><span className="ccf-lock-glow" style={ui.modalLockInner}><LockIcon size={26} /></span></div>
          <div style={ui.eyebrowLight}>{plan ? `${plan.name} plan feature` : 'Paid plan feature'}</div>
        </div>
        <div style={ui.modalBody}>
          <h2 id="ccf-up-title" style={ui.modalTitle}>Unlock the Prepaid offer</h2>
          <p id="ccf-up-text" style={ui.modalText}>
            You are on the {planName} plan. Upgrade to show &quot;Pay online and save&quot; on your COD form and turn
            more COD orders into prepaid orders.
          </p>
          {plan ? (
            <div style={ui.planBox}>
              <div style={ui.planBoxHead}>
                <span style={ui.planBoxName}>{plan.name}</span>
                <span><strong style={ui.planBoxPrice}>{priceLabel(plan.price)}</strong><span style={ui.per}>/month</span></span>
              </div>
              <ul style={ui.list}>
                {features.map((f) => <li key={f} style={ui.li}><Check />{f}</li>)}
              </ul>
            </div>
          ) : null}
          <button ref={primary} type="button" className="ccf-up-btn" onClick={onUpgrade} style={ui.primaryWide}>
            {trial ? `Start ${trial}-day free trial` : 'Upgrade now'}
          </button>
          <button type="button" onClick={onClose} style={ui.later}>Maybe later</button>
          <p style={ui.fine}>Billed securely by Shopify. Cancel anytime.{trial ? ' A free trial is offered once per store.' : ''}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The Prepaid offer on the Free plan: what it does, a locked preview of it, and the way to unlock it.
 * `preview` is the real COD-form preview, shown blurred behind the lock.
 */
export default function PrepaidLocked({ data, preview }) {
  usePoppins();
  const [open, setOpen] = useState(true);
  const plan = data.upgradePlan || null;
  const trial = Number(data.trialDays) > 0 ? Number(data.trialDays) : 0;

  function upgrade() {
    if (data.upgradeUrl) window.open(data.upgradeUrl, '_top');
  }

  return (
    <div style={ui.page}>
      <style>{MOTION}</style>

      <section style={ui.hero} aria-label="Prepaid offer">
        <div style={ui.heroGlow} aria-hidden="true" />
        <div style={ui.heroGrid}>
          <div style={ui.heroCopy}>
            <span style={ui.badge}><LockIcon size={14} />{plan ? `${plan.name} plan feature` : 'Paid plan feature'}</span>
            <h1 style={ui.title}>Turn COD orders into prepaid orders</h1>
            <p style={ui.lead}>
              Show a &quot;Pay online and save&quot; offer on your COD form. Customers who pay online get a small
              discount; you get fewer refused parcels and your money sooner.
            </p>
            <ul style={ui.benefits}>
              {BENEFITS.map((b) => (
                <li key={b.title} style={ui.benefit}>
                  <span style={ui.benefitIcon}><Icon d={b.icon} /></span>
                  <span><strong style={ui.benefitTitle}>{b.title}</strong><span style={ui.benefitText}>{b.text}</span></span>
                </li>
              ))}
            </ul>
            <div style={ui.ctaRow}>
              <button type="button" className="ccf-up-btn" onClick={upgrade} style={ui.primary}>
                <LockIcon size={16} />Upgrade to unlock
              </button>
              <a href={plansHref()} style={ui.secondary}>Compare plans</a>
            </div>
            <p style={ui.fineLeft}>
              {trial ? `${trial}-day free trial on paid plans · ` : ''}Cancel anytime · Billed by Shopify
            </p>
          </div>

          <div style={ui.previewWrap}>
            <div style={ui.previewLabel}>Preview of your COD form</div>
            <div style={ui.lockedCard} aria-label="Locked preview" role="img">
              <div style={ui.blurred} aria-hidden="true">{preview}</div>
              <div className="ccf-reveal" style={ui.glass} aria-hidden="true">
                <span className="ccf-shine" style={ui.shine} />
                <div className="ccf-lock-float" style={ui.lockBadge}>
                  <span className="ccf-lock-glow" style={ui.lockInner}><LockIcon size={28} /></span>
                </div>
                <strong style={ui.lockTitle}>Unlock with {plan ? plan.name : 'a paid plan'}</strong>
                <span style={ui.lockText}>Included in {plan ? `${plan.name} and above` : 'paid plans'}</span>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(true)} style={ui.whatBtn}>See what is included</button>
          </div>
        </div>
      </section>

      <section style={ui.how} aria-labelledby="ccf-how">
        <h2 id="ccf-how" style={ui.howTitle}>How it works</h2>
        <ol style={ui.steps}>
          {STEPS.map((s, i) => (
            <li key={s.title} style={ui.step}>
              <span style={ui.stepNum}>{i + 1}</span>
              <strong style={ui.stepTitle}>{s.title}</strong>
              <span style={ui.stepText}>{s.text}</span>
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
  page: { maxWidth: 1120, margin: '0 auto', padding: '24px 20px 64px', fontFamily: FONT, color: '#111827' },
  hero: { position: 'relative', overflow: 'hidden', borderRadius: 20, padding: 'clamp(20px, 4vw, 36px)', background: 'linear-gradient(135deg, #FFFFFF 0%, #F5F3FF 55%, #EEF2FF 100%)', border: '1px solid #E0E7FF', boxShadow: '0 1px 2px rgba(17,24,39,.04), 0 18px 40px rgba(79,70,229,.08)' },
  heroGlow: { position: 'absolute', width: 420, height: 420, right: -120, top: -160, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.18), rgba(124,58,237,0) 70%)', pointerEvents: 'none' },
  heroGrid: { position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center' },
  heroCopy: { flex: '1 1 420px', minWidth: 0 },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: ACCENT, background: '#EEF2FF', border: '1px solid #E0E7FF', borderRadius: 999, padding: '5px 12px', letterSpacing: '0.02em' },
  title: { fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', margin: '14px 0 10px' },
  lead: { fontSize: 15, color: '#4B5563', lineHeight: 1.65, margin: '0 0 20px', maxWidth: 560 },
  benefits: { listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 14 },
  benefit: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  benefitIcon: { flex: '0 0 auto', width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ACCENT, background: '#fff', border: '1px solid #E0E7FF', boxShadow: '0 1px 2px rgba(17,24,39,.05)' },
  benefitTitle: { display: 'block', fontSize: 14.5, fontWeight: 600 },
  benefitText: { display: 'block', fontSize: 13.5, color: '#6B7280', marginTop: 1 },
  ctaRow: { display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
  primary: { display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 22px', borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: '#fff', background: `linear-gradient(135deg, ${ACCENT}, ${VIOLET})` },
  secondary: { display: 'inline-flex', alignItems: 'center', height: 46, padding: '0 20px', borderRadius: 12, border: '1px solid #D1D5DB', background: '#fff', color: '#111827', fontSize: 15, fontWeight: 600, textDecoration: 'none' },
  fineLeft: { fontSize: 12.5, color: '#6B7280', margin: '12px 0 0' },
  previewWrap: { flex: '0 1 380px', minWidth: 280, margin: '0 auto' },
  previewLabel: { fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', marginBottom: 8 },
  lockedCard: { position: 'relative', borderRadius: 18, overflow: 'hidden' },
  blurred: { filter: 'blur(2px) saturate(.9)', opacity: 0.9, pointerEvents: 'none', userSelect: 'none' },
  glass: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center', padding: 20, overflow: 'hidden', background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,.92) 0%, rgba(255,255,255,.7) 38%, rgba(238,242,255,.55) 100%)', backdropFilter: 'blur(1px)' },
  shine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '35%', background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.65), rgba(255,255,255,0))', pointerEvents: 'none' },
  lockBadge: { marginBottom: 8 },
  lockInner: { width: 64, height: 64, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: `linear-gradient(135deg, ${ACCENT}, ${VIOLET})`, boxShadow: '0 12px 28px rgba(79,70,229,.35)' },
  lockTitle: { position: 'relative', fontSize: 16, fontWeight: 600, color: '#111827' },
  lockText: { position: 'relative', fontSize: 13, color: '#4B5563' },
  whatBtn: { display: 'block', margin: '12px auto 0', background: 'none', border: 'none', color: ACCENT, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit' },
  how: { marginTop: 28 },
  howTitle: { fontSize: 18, fontWeight: 600, margin: '0 0 14px' },
  steps: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 },
  step: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4 },
  stepNum: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: ACCENT, background: '#EEF2FF', marginBottom: 6 },
  stepTitle: { fontSize: 14.5, fontWeight: 600 },
  stepText: { fontSize: 13, color: '#6B7280', lineHeight: 1.5 },
  backdrop: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(17,24,39,.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: FONT },
  modal: { position: 'relative', width: '100%', maxWidth: 440, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', background: '#fff', borderRadius: 20, boxShadow: '0 24px 64px rgba(17,24,39,.28)' },
  close: { position: 'absolute', top: 10, right: 12, zIndex: 2, width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.2)', color: '#fff', fontSize: 22, lineHeight: '30px', cursor: 'pointer' },
  modalTop: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '28px 20px 22px', background: `linear-gradient(135deg, ${ACCENT}, ${VIOLET})`, color: '#fff' },
  modalLock: {},
  modalLockInner: { width: 60, height: 60, borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.35)' },
  eyebrowLight: { fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.9 },
  modalBody: { padding: '22px 24px 20px' },
  modalTitle: { fontSize: 22, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-0.01em' },
  modalText: { fontSize: 14, color: '#4B5563', lineHeight: 1.6, margin: '0 0 16px' },
  planBox: { border: '1px solid #E5E7EB', borderRadius: 14, padding: '14px 16px', marginBottom: 18, background: '#FAFAFF' },
  planBoxHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  planBoxName: { fontSize: 15, fontWeight: 600 },
  planBoxPrice: { fontSize: 20, fontWeight: 700 },
  per: { fontSize: 13, color: '#6B7280', marginLeft: 2 },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 },
  li: { display: 'flex', gap: 10, fontSize: 13.5, color: '#374151', lineHeight: 1.45 },
  primaryWide: { width: '100%', height: 48, borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, color: '#fff', background: `linear-gradient(135deg, ${ACCENT}, ${VIOLET})` },
  later: { display: 'block', width: '100%', marginTop: 8, height: 40, border: 'none', background: 'none', color: '#4B5563', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' },
  fine: { fontSize: 12, color: '#6B7280', textAlign: 'center', margin: '8px 0 0', lineHeight: 1.5 },
};
