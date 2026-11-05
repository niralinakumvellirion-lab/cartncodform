'use client';

import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

const ACCENT = '#4F46E5';
const SAMPLE_PRICE = 999;

/** Same rule as backend/utils/prepaidOffer.computeDiscount (0 = the order does not qualify). */
export function previewAmount(s, subtotal) {
  const sub = Number(subtotal);
  if (!(sub > 0) || sub < Number(s.minOrder || 0)) return 0;
  let a = s.discountType === 'fixed' ? Number(s.value) : (sub * Number(s.value)) / 100;
  if (s.discountType === 'percent' && Number(s.maxDiscount) > 0) a = Math.min(a, Number(s.maxDiscount));
  a = Math.floor(a * 100 + 1e-6) / 100;
  return a >= 1 && a < sub ? a : 0;
}

export function money(n) {
  const v = Number(n) || 0;
  return `₹${Math.round(v) === v ? v.toLocaleString('en-IN') : v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function plansHref() {
  if (typeof window === 'undefined') return '/admin/plans';
  return `/admin/plans${window.location.search || ''}`;
}

function tint(hex, alpha) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  const [r, g, b] = m ? [m[1], m[2], m[3]].map((h) => parseInt(h, 16)) : [79, 70, 229];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function textOn(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) return '#ffffff';
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? '#111827' : '#ffffff';
}

const CardIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" />
  </svg>
);
const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/** The offer exactly as customers see it above the COD form (same layout as the storefront page). */
function Preview({ s }) {
  const amount = previewAmount(s, SAMPLE_PRICE);
  const color = /^#[0-9a-fA-F]{6}$/.test(s.accentColor) ? s.accentColor : ACCENT;
  return (
    <div style={ui.device} aria-label="Preview of the COD form">
      <div style={ui.pvTitle}>Cash on Delivery Order</div>
      <div style={ui.pvSummary}>
        <div style={{ fontWeight: 600 }}>Cotton Kurta</div>
        <div style={{ color: '#52525B' }}>Price: <strong>{money(SAMPLE_PRICE)}</strong></div>
      </div>
      {amount ? (
        <>
          <div style={{ ...ui.pvBox, borderColor: tint(color, 0.35), background: tint(color, 0.05) }} data-testid="preview-offer">
            <div style={ui.pvTop}>
              <span style={{ ...ui.pvIcon, background: tint(color, 0.12), color }}><CardIcon /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={ui.pvTitleRow}>
                  <strong style={ui.pvHead}>{s.heading || ' '}</strong>
                  <span style={ui.pvBadge}>Save {money(amount)}</span>
                </div>
                <span style={ui.pvSub}>Pay now by UPI, card or wallet. No cash needed at delivery.</span>
              </div>
            </div>
            <div style={{ ...ui.pvBtn, background: color, color: textOn(color) }}>
              <span>{s.buttonText || ' '} · {money(Math.round((SAMPLE_PRICE - amount) * 100) / 100)}</span>
              <s style={ui.pvWas}>{money(SAMPLE_PRICE)}</s>
            </div>
            <div style={ui.pvSecure}><LockIcon />Secure checkout by Shopify</div>
          </div>
          <div style={ui.pvOr}><span style={ui.pvLine} />or pay with Cash on Delivery<span style={ui.pvLine} /></div>
        </>
      ) : (
        <div style={ui.pvNone}>
          {Number(s.minOrder) > SAMPLE_PRICE
            ? `A ${money(SAMPLE_PRICE)} order is below your minimum of ${money(s.minOrder)}, so no offer is shown.`
            : 'With these settings no offer is shown for this order.'}
        </div>
      )}
      <div style={ui.pvLabel}>Full Name <span style={{ color: '#DC2626' }}>*</span></div>
      <div style={ui.pvField} />
      <div style={ui.pvLabel}>Phone Number <span style={{ color: '#DC2626' }}>*</span></div>
      <div style={ui.pvField} />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={ui.stat}>
      <div style={ui.statValue}>{value}</div>
      <div style={ui.statLabel}>{label}</div>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section style={ui.section}>
      <div style={ui.sectionHead}>
        <h2 style={ui.sectionTitle}>{title}</h2>
        {hint ? <p style={ui.sectionHint}>{hint}</p> : null}
      </div>
      <div style={ui.sectionBody}>{children}</div>
    </section>
  );
}

/** Text input with a ₹ or % sign inside the box. */
function AffixInput({ label, prefix, suffix, ...props }) {
  return (
    <label style={ui.field}>
      <span style={ui.label}>{label}</span>
      <span style={ui.affix}>
        {prefix ? <span style={ui.affixSign}>{prefix}</span> : null}
        <input {...props} aria-label={label} style={ui.affixInput} />
        {suffix ? <span style={ui.affixSign}>{suffix}</span> : null}
      </span>
    </label>
  );
}

/** Settings for the "Pay online and save" offer on the COD form. */
export default function PrepaidOffer({ shop }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!shop) return;
    apiGet(`/api/prepaid-offer/${encodeURIComponent(shop)}`)
      .then((d) => { setData(d); setForm(d.settings); })
      .catch((err) => setError(err.message || 'Could not load the prepaid offer.'));
  }, [shop]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  // Switching % <-> ₹ starts from a sensible amount instead of carrying "5" over as ₹5.
  function changeType(type) {
    if (type === form.discountType) return;
    setForm((f) => ({ ...f, discountType: type, value: type === 'fixed' ? 50 : 5 }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const body = {
        ...form,
        value: Number(form.value),
        maxDiscount: Number(form.maxDiscount),
        minOrder: Number(form.minOrder),
      };
      const d = await apiSend(`/api/prepaid-offer/${encodeURIComponent(shop)}`, 'PUT', body);
      setData(d);
      setForm(d.settings);
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!data || !form) {
    return (
      <div style={ui.page}>
        <h1 style={ui.title}>Prepaid offer</h1>
        {error ? <p role="alert" style={ui.error}>{error}</p> : <p style={ui.sub} role="status">Loading…</p>}
      </div>
    );
  }

  const locked = !data.allowed;
  const pct = form.discountType === 'percent';
  const st = data.stats || {};
  const color = /^#[0-9a-fA-F]{6}$/.test(form.accentColor) ? form.accentColor : ACCENT;

  return (
    <div style={ui.page}>
      <div style={ui.header}>
        <div>
          <h1 style={ui.title}>Prepaid offer</h1>
          <p style={ui.sub}>
            Give a discount on the COD form when the customer pays online. Prepaid orders are rarely refused at
            the door, and you are paid sooner.
          </p>
        </div>
        <span style={{ ...ui.pill, ...(form.enabled && !locked ? ui.pillOn : null) }}>
          {form.enabled && !locked ? 'Live on COD form' : 'Off'}
        </span>
      </div>

      {locked ? (
        <div role="status" style={ui.locked}>
          The prepaid offer is included in the Starter plan and above. You are on the {data.planName} plan.{' '}
          <a href={plansHref()} style={ui.link}>See plans</a>
        </div>
      ) : null}

      <div style={ui.statsHead}>This month</div>
      <div style={ui.stats}>
        <Stat label="Chose to pay online" value={st.offersTaken || 0} />
        <Stat label="Prepaid orders" value={st.prepaidOrders || 0} />
        <Stat label="Prepaid sales" value={money(Math.round(Number(st.prepaidRevenue) || 0))} />
        <Stat label="Discount given" value={money(Math.round(Number(st.discountGiven) || 0))} />
        <Stat label="Used code but paid COD" value={st.usedWithCod || 0} />
      </div>

      <div style={ui.cols}>
        <div style={ui.card} aria-label="Offer settings">
          <Section title="Offer" hint="Show the offer above the fields on your COD form.">
            <label style={{ ...ui.switchRow, ...(locked ? { opacity: 0.55 } : null) }}>
              <input
                type="checkbox"
                role="switch"
                aria-checked={!!form.enabled}
                checked={!!form.enabled}
                disabled={locked}
                onChange={(e) => set('enabled', e.target.checked)}
                style={ui.srOnly}
              />
              <span aria-hidden="true" style={{ ...ui.switchTrack, ...(form.enabled ? { background: ACCENT } : null) }}>
                <span style={{ ...ui.switchKnob, ...(form.enabled ? { transform: 'translateX(18px)' } : null) }} />
              </span>
              <span style={ui.switchText}>Show the offer on the COD form</span>
            </label>
          </Section>

          <Section title="Discount" hint="Worked out on the order total after quantity discounts.">
            <div role="radiogroup" aria-label="Discount type" style={ui.segment}>
              {[['percent', 'Percentage'], ['fixed', 'Fixed amount (₹)']].map(([v, l]) => (
                <label key={v} style={{ ...ui.segBtn, ...(form.discountType === v ? ui.segOn : null) }}>
                  <input type="radio" name="pp-type" checked={form.discountType === v} onChange={() => changeType(v)} style={ui.srOnly} />
                  {l}
                </label>
              ))}
            </div>
            <div style={ui.grid}>
              {pct ? (
                <>
                  <AffixInput label="Discount (%)" suffix="%" type="number" min="1" max="50" value={form.value} onChange={(e) => set('value', e.target.value)} />
                  <AffixInput label="Maximum discount (₹, 0 = no limit)" prefix="₹" type="number" min="0" value={form.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} />
                </>
              ) : (
                <AffixInput label="Discount (₹)" prefix="₹" type="number" min="1" value={form.value} onChange={(e) => set('value', e.target.value)} />
              )}
              <AffixInput label="Minimum order (₹, 0 = every order)" prefix="₹" type="number" min="0" value={form.minOrder} onChange={(e) => set('minOrder', e.target.value)} />
            </div>
          </Section>

          <Section title="Text and colour">
            <div style={ui.grid}>
              <label style={ui.field}>
                <span style={ui.label}>Heading</span>
                <input style={ui.input} type="text" maxLength={60} aria-label="Heading" value={form.heading} onChange={(e) => set('heading', e.target.value)} />
              </label>
              <label style={ui.field}>
                <span style={ui.label}>Button text</span>
                <input style={ui.input} type="text" maxLength={30} aria-label="Button text" value={form.buttonText} onChange={(e) => set('buttonText', e.target.value)} />
              </label>
              <label style={ui.field}>
                <span style={ui.label}>Button colour</span>
                <span style={ui.colorRow}>
                  <input type="color" aria-label="Pick the button colour" value={color} onChange={(e) => set('accentColor', e.target.value)} style={ui.colorSwatch} />
                  <input style={ui.input} type="text" aria-label="Button colour code" maxLength={7} value={form.accentColor} onChange={(e) => set('accentColor', e.target.value)} />
                </span>
              </label>
            </div>
          </Section>

          <div style={ui.footer}>
            <div style={{ minHeight: 20 }}>
              {error ? <p role="alert" style={ui.error}>{error}</p> : null}
              {saved ? <p role="status" style={ui.ok}>Saved.</p> : null}
            </div>
            <button type="button" onClick={save} disabled={saving} style={ui.save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <aside style={ui.side} aria-label="Preview">
          <div style={ui.sideHead}>Preview · {money(SAMPLE_PRICE)} order</div>
          <Preview s={form} />
          <div style={ui.tips}>
            <div style={ui.tip}>
              <strong style={ui.tipTitle}>Send customers straight to checkout</strong>
              Add <code style={ui.code}>&amp;variantId={'{{ product.selected_or_first_available_variant.id }}'}</code> to
              your COD button link. Without it, customers of products with several options pick theirs on the
              product page, with the discount already applied.
            </div>
            <div style={ui.tip}>
              <strong style={ui.tipTitle}>How the code works</strong>
              Each customer gets their own code: one use, this product only, valid for 24 hours. If your Shopify
              checkout also offers Cash on Delivery, a customer could still pick it there; those orders show as
              &quot;Used code but paid COD&quot;.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const ui = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '20px 20px 64px', fontFamily: FONT, color: '#111827' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 800, margin: 0 },
  sub: { margin: '4px 0 0', fontSize: 13.5, color: '#6B7280', maxWidth: 640, lineHeight: 1.6 },
  pill: { fontSize: 12.5, fontWeight: 700, borderRadius: 999, padding: '5px 12px', background: '#F3F4F6', color: '#4B5563', whiteSpace: 'nowrap' },
  pillOn: { background: '#DCFCE7', color: '#166534' },
  locked: { background: '#F2F7FE', border: '1px solid #C6DCF8', color: '#13315C', borderRadius: 10, padding: '12px 14px', fontSize: 14, marginBottom: 16 },
  link: { color: ACCENT, fontWeight: 700, textDecoration: 'none' },
  statsHead: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', marginBottom: 8 },
  stats: { display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  stat: { flex: '1 1 110px', minWidth: 0, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px' },
  statValue: { fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', lineHeight: 1.25 },
  statLabel: { fontSize: 12.5, color: '#6B7280', marginTop: 2 },
  cols: { display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' },
  card: { flex: '1 1 460px', minWidth: 0, background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, overflow: 'hidden' },
  section: { padding: '16px 20px', borderBottom: '1px solid #F3F4F6' },
  sectionHead: { marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: 700, margin: 0 },
  sectionHint: { fontSize: 12.5, color: '#6B7280', margin: '2px 0 0' },
  sectionBody: { display: 'flex', flexDirection: 'column', gap: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  input: { height: 38, border: '1px solid #D1D5DB', borderRadius: 8, padding: '0 10px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', background: '#fff' },
  affix: { display: 'flex', alignItems: 'center', height: 38, border: '1px solid #D1D5DB', borderRadius: 8, background: '#fff', overflow: 'hidden' },
  affixSign: { padding: '0 10px', color: '#6B7280', fontSize: 14, background: '#F9FAFB', alignSelf: 'stretch', display: 'flex', alignItems: 'center' },
  affixInput: { flex: 1, minWidth: 0, height: '100%', border: 'none', outline: 'none', padding: '0 10px', fontSize: 14, fontFamily: 'inherit' },
  colorRow: { display: 'flex', gap: 8 },
  colorSwatch: { width: 42, height: 38, border: '1px solid #D1D5DB', borderRadius: 8, padding: 3, background: '#fff', flex: '0 0 auto', cursor: 'pointer' },
  srOnly: { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 },
  switchRow: { display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', position: 'relative' },
  switchTrack: { width: 40, height: 22, borderRadius: 999, background: '#D1D5DB', position: 'relative', flex: '0 0 auto', transition: 'background .15s' },
  switchKnob: { position: 'absolute', top: 2, left: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)', transition: 'transform .15s' },
  switchText: { fontSize: 14, fontWeight: 600 },
  segment: { display: 'inline-flex', alignSelf: 'flex-start', background: '#F3F4F6', borderRadius: 10, padding: 3, gap: 2 },
  segBtn: { position: 'relative', padding: '7px 14px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, color: '#4B5563', cursor: 'pointer' },
  segOn: { background: '#fff', color: '#111827', boxShadow: '0 1px 2px rgba(0,0,0,.08)' },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 20px', background: '#FAFAFA' },
  error: { background: '#FFF4F4', border: '1px solid #FED3D1', color: '#8E1F0B', borderRadius: 8, padding: '8px 12px', fontSize: 13.5, margin: 0 },
  ok: { color: '#0C5132', fontSize: 14, fontWeight: 600, margin: 0 },
  save: { height: 38, padding: '0 22px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', flex: '0 0 auto' },
  side: { flex: '0 1 360px', minWidth: 280, position: 'sticky', top: 16 },
  sideHead: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', marginBottom: 8 },
  device: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, padding: 16, boxShadow: '0 8px 24px rgba(17,24,39,.06)', fontSize: 13 },
  pvTitle: { fontSize: 16, fontWeight: 800, marginBottom: 10 },
  pvSummary: { background: '#F4F4F5', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 13, lineHeight: 1.5 },
  pvBox: { border: '1px solid', borderRadius: 12, padding: 12 },
  pvTop: { display: 'flex', gap: 10, alignItems: 'flex-start' },
  pvIcon: { width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' },
  pvTitleRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '4px 8px' },
  pvHead: { fontSize: 14, fontWeight: 700 },
  pvBadge: { background: '#DCFCE7', color: '#166534', fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' },
  pvSub: { display: 'block', fontSize: 12, color: '#52525B', marginTop: 2, lineHeight: 1.45 },
  pvBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, minHeight: 42, borderRadius: 10, fontWeight: 700, fontSize: 14 },
  pvWas: { fontWeight: 500, fontSize: 12.5, opacity: 0.75 },
  pvSecure: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 7, fontSize: 11, color: '#71717A' },
  pvOr: { display: 'flex', alignItems: 'center', gap: 8, color: '#71717A', fontSize: 11.5, margin: '14px 0 2px' },
  pvLine: { flex: 1, height: 1, background: '#E4E4E7' },
  pvNone: { fontSize: 12.5, color: '#6B7280', background: '#F9FAFB', border: '1px dashed #E5E7EB', borderRadius: 10, padding: 12 },
  pvLabel: { fontSize: 12, fontWeight: 600, margin: '10px 0 4px' },
  pvField: { height: 32, border: '1px solid #E4E4E7', borderRadius: 8 },
  tips: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 },
  tip: { fontSize: 12.5, color: '#4B5563', lineHeight: 1.6, background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: 10, padding: '10px 12px' },
  tipTitle: { display: 'block', color: '#111827', fontSize: 13, marginBottom: 2 },
  code: { background: '#EEF2FF', color: '#3730A3', borderRadius: 4, padding: '1px 4px', fontSize: 11.5, wordBreak: 'break-all' },
};
