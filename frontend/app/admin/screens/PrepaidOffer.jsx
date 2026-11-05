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

/** The offer as customers see it above the COD form. */
function Preview({ s }) {
  const amount = previewAmount(s, SAMPLE_PRICE);
  return (
    <div style={ui.phone} aria-label="Preview of the COD form">
      <div style={ui.phoneTitle}>Cash on Delivery Order</div>
      <div style={ui.phoneProduct}>Cotton Kurta · {money(SAMPLE_PRICE)}</div>
      {amount ? (
        <>
          <div style={{ ...ui.ppBox, borderColor: s.accentColor }} data-testid="preview-offer">
            <strong style={ui.ppHead}>{s.heading || ' '}</strong>
            <span style={ui.ppSub}>Pay now by UPI, card or wallet and get {money(amount)} off this order.</span>
            <div style={{ ...ui.ppBtn, background: s.accentColor }}>
              {s.buttonText || ' '} – {money(Math.round((SAMPLE_PRICE - amount) * 100) / 100)}
            </div>
          </div>
          <div style={ui.or}>or pay with Cash on Delivery</div>
        </>
      ) : (
        <div style={ui.noOffer}>
          {Number(s.minOrder) > SAMPLE_PRICE
            ? `A ${money(SAMPLE_PRICE)} order is below your minimum of ${money(s.minOrder)}, so no offer is shown.`
            : 'With these settings no offer is shown for this order.'}
        </div>
      )}
      <div style={ui.fakeField} />
      <div style={ui.fakeField} />
      <div style={ui.fakeBtn}>Place COD Order</div>
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

  return (
    <div style={ui.page}>
      <h1 style={ui.title}>Prepaid offer</h1>
      <p style={ui.sub}>
        Offer a discount on the COD form when the customer pays online instead. Prepaid orders are rarely
        refused at the door, and you get paid sooner.
      </p>

      {locked ? (
        <div role="status" style={ui.locked}>
          The prepaid offer is included in the Starter plan and above. You are on the {data.planName} plan.{' '}
          <a href={plansHref()} style={ui.link}>See plans</a>
        </div>
      ) : null}

      <div style={ui.stats} aria-label="This month">
        <Stat label="Chose to pay online" value={st.offersTaken || 0} />
        <Stat label="Prepaid orders" value={st.prepaidOrders || 0} />
        <Stat label="Prepaid sales" value={money(st.prepaidRevenue)} />
        <Stat label="Discount given" value={money(st.discountGiven)} />
        <Stat label="Used code but paid COD" value={st.usedWithCod || 0} />
      </div>

      <div style={ui.cols}>
        <section style={ui.card} aria-label="Offer settings">
          <label style={ui.switchRow}>
            <input
              type="checkbox"
              checked={!!form.enabled}
              disabled={locked}
              onChange={(e) => set('enabled', e.target.checked)}
            />
            <span><strong>Show the offer on the COD form</strong> {form.enabled ? '(On)' : '(Off)'}</span>
          </label>

          <fieldset style={ui.fieldset}>
            <legend style={ui.label}>Discount type</legend>
            <label style={ui.radio}>
              <input type="radio" name="pp-type" checked={pct} onChange={() => set('discountType', 'percent')} /> Percentage of the order
            </label>
            <label style={ui.radio}>
              <input type="radio" name="pp-type" checked={!pct} onChange={() => set('discountType', 'fixed')} /> Fixed amount (₹)
            </label>
          </fieldset>

          <div style={ui.row}>
            <label style={ui.field}>
              <span style={ui.label}>{pct ? 'Discount (%)' : 'Discount (₹)'}</span>
              <input style={ui.input} type="number" min="1" max={pct ? 50 : undefined} value={form.value} onChange={(e) => set('value', e.target.value)} />
            </label>
            {pct ? (
              <label style={ui.field}>
                <span style={ui.label}>Maximum discount (₹, 0 = no limit)</span>
                <input style={ui.input} type="number" min="0" value={form.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} />
              </label>
            ) : null}
          </div>

          <label style={ui.field}>
            <span style={ui.label}>Minimum order (₹, 0 = every order)</span>
            <input style={ui.input} type="number" min="0" value={form.minOrder} onChange={(e) => set('minOrder', e.target.value)} />
          </label>

          <label style={ui.field}>
            <span style={ui.label}>Heading</span>
            <input style={ui.input} type="text" maxLength={60} value={form.heading} onChange={(e) => set('heading', e.target.value)} />
          </label>

          <div style={ui.row}>
            <label style={ui.field}>
              <span style={ui.label}>Button text</span>
              <input style={ui.input} type="text" maxLength={30} value={form.buttonText} onChange={(e) => set('buttonText', e.target.value)} />
            </label>
            <label style={ui.field}>
              <span style={ui.label}>Button colour</span>
              <span style={{ display: 'flex', gap: 8 }}>
                <input type="color" aria-label="Pick the button colour" value={/^#[0-9a-fA-F]{6}$/.test(form.accentColor) ? form.accentColor : ACCENT} onChange={(e) => set('accentColor', e.target.value)} style={ui.color} />
                <input style={ui.input} type="text" aria-label="Button colour code" maxLength={7} value={form.accentColor} onChange={(e) => set('accentColor', e.target.value)} />
              </span>
            </label>
          </div>

          {error ? <p role="alert" style={ui.error}>{error}</p> : null}
          {saved ? <p role="status" style={ui.ok}>Saved.</p> : null}

          <button type="button" onClick={save} disabled={saving} style={ui.save}>
            {saving ? 'Saving…' : 'Save'}
          </button>

          <p style={ui.help}>
            Tip: add <code style={ui.code}>&amp;variantId={'{{ product.selected_or_first_available_variant.id }}'}</code> to
            your COD button link. Then &quot;Pay online&quot; goes straight to checkout with the right size or colour.
            Without it, customers of products with several options pick theirs on the product page, with the
            discount already applied.
          </p>
          <p style={ui.help}>
            Each customer gets their own code: one use, this product only, valid for 24 hours. If your Shopify
            checkout also offers Cash on Delivery, a customer could use the code and still pick COD there; those
            orders are counted under &quot;Used code but paid COD&quot;.
          </p>
        </section>

        <section style={ui.previewCol} aria-label="Preview">
          <div style={ui.previewLabel}>Preview ({money(SAMPLE_PRICE)} order)</div>
          <Preview s={form} />
        </section>
      </div>
    </div>
  );
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const ui = {
  page: { maxWidth: 1080, margin: '0 auto', padding: '20px 20px 64px', fontFamily: FONT, color: '#111827' },
  title: { fontSize: 24, fontWeight: 800, margin: 0 },
  sub: { margin: '4px 0 18px', fontSize: 13.5, color: '#6B7280', maxWidth: 720, lineHeight: 1.6 },
  locked: { background: '#F2F7FE', border: '1px solid #C6DCF8', color: '#13315C', borderRadius: 10, padding: '12px 14px', fontSize: 14, marginBottom: 16 },
  link: { color: ACCENT, fontWeight: 700, textDecoration: 'none' },
  stats: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 },
  stat: { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '12px 14px' },
  statValue: { fontSize: 20, fontWeight: 800 },
  statLabel: { fontSize: 12.5, color: '#6B7280', marginTop: 2 },
  cols: { display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' },
  card: { flex: '1 1 420px', background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 },
  previewCol: { flex: '0 1 360px', position: 'sticky', top: 16 },
  previewLabel: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', marginBottom: 8 },
  switchRow: { display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 },
  fieldset: { border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  radio: { display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 180px' },
  label: { fontSize: 13, fontWeight: 600, color: '#374151' },
  input: { height: 38, border: '1px solid #D1D5DB', borderRadius: 8, padding: '0 10px', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
  color: { width: 44, height: 38, border: '1px solid #D1D5DB', borderRadius: 8, padding: 2, background: '#fff', flex: '0 0 auto' },
  error: { background: '#FFF4F4', border: '1px solid #FED3D1', color: '#8E1F0B', borderRadius: 8, padding: '10px 12px', fontSize: 14, margin: 0 },
  ok: { color: '#0C5132', fontSize: 14, fontWeight: 600, margin: 0 },
  save: { alignSelf: 'flex-start', height: 40, padding: '0 22px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' },
  help: { fontSize: 12.5, color: '#6B7280', lineHeight: 1.6, margin: 0 },
  code: { background: '#F3F4F6', borderRadius: 4, padding: '1px 4px', fontSize: 12 },
  phone: { background: '#F4F4F5', borderRadius: 16, padding: 14, border: '1px solid #E5E7EB' },
  phoneTitle: { fontSize: 16, fontWeight: 800, marginBottom: 4 },
  phoneProduct: { fontSize: 13, color: '#52525B', background: '#fff', borderRadius: 8, padding: '8px 10px', marginBottom: 12 },
  ppBox: { border: '2px solid', borderRadius: 12, padding: 12, background: '#FAFAFA' },
  ppHead: { display: 'block', fontSize: 14.5, fontWeight: 700 },
  ppSub: { display: 'block', fontSize: 12.5, color: '#52525B', margin: '4px 0 10px', lineHeight: 1.5 },
  ppBtn: { color: '#fff', textAlign: 'center', borderRadius: 10, padding: '11px 8px', fontWeight: 700, fontSize: 14 },
  or: { textAlign: 'center', fontSize: 12, color: '#71717A', margin: '12px 0 8px' },
  noOffer: { fontSize: 12.5, color: '#6B7280', background: '#fff', borderRadius: 8, padding: 10, marginBottom: 8 },
  fakeField: { height: 34, background: '#fff', border: '1px solid #E4E4E7', borderRadius: 8, margin: '8px 0' },
  fakeBtn: { background: '#18181B', color: '#fff', textAlign: 'center', borderRadius: 10, padding: '11px 8px', fontWeight: 700, fontSize: 14, marginTop: 10 },
};
