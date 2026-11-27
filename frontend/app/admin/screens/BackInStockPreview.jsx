'use client';

import { useState } from 'react';

// Mirrors backend/utils/restock.js TEXT_DEFAULTS / TEXT_MAX and the storefront look (ccf-restock.js).
export const RESTOCK_TEXT_DEFAULTS = {
  boxTitle: 'Sorry, {size} is sold out',
  boxText: 'Get a message the moment it’s back.',
  buttonText: 'Notify me',
  emailPlaceholder: 'Your email',
  successText: 'Done! We’ll tell you when {size} is back.',
  pushTitle: '{product} is back in stock 🎉',
  pushBody: 'Good news! {size} is available again. Tap to grab it before it sells out.',
  emailSubject: '{product} is back in stock',
  emailBody: 'Good news! {product} ({size}) is available again. Grab it before it sells out.',
  whatsappPlaceholder: 'WhatsApp number',
  whatsappHint: 'Fastest · we message you the moment it’s back',
  emailHint: 'We email you within {time} of the restock',
  whatsappMessage: 'Hi! Good news — {product} ({size}) is back in stock. Get it here before it sells out: {link}',
  meterLabel: 'Alert priority',
  partialText: 'Done! Add {next} too to reach 100%.',
  triggerText: 'Notify me when it’s back',
  chanceLabel: 'Your chance to be notified',
};
export const RESTOCK_TEXT_MAX = {
  boxTitle: 60, boxText: 90, buttonText: 30, emailPlaceholder: 40, successText: 90,
  pushTitle: 65, pushBody: 160, emailSubject: 90, emailBody: 400,
  whatsappPlaceholder: 40, whatsappHint: 80, emailHint: 80, whatsappMessage: 300,
  meterLabel: 40, partialText: 90, triggerText: 40, chanceLabel: 50,
};
/** WhatsApp share of the priority bar (0–100, default 80); email gets the rest. */
export function whatsappPercent(v) {
  const n = Math.round(Number(v));
  return v === '' || v == null || !Number.isFinite(n) ? 80 : Math.min(100, Math.max(0, n));
}
// Mirrors backend EMAIL_DELAYS / delayLabel.
export const EMAIL_DELAYS = [[0, 'Right away'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [240, '4 hours'], [720, '12 hours']];
export function delayLabel(minutes) {
  const m = EMAIL_DELAYS.some(([v]) => v === Number(minutes)) ? Number(minutes) : 60;
  if (m === 0) return 'a few minutes';
  if (m < 60) return `${m} minutes`;
  return m === 60 ? '1 hour' : `${m / 60} hours`;
}
export const SAMPLE = { product: 'Cotton Kurta', size: 'M', price: '₹1,299' };
// Price drop: mirrors backend/utils/priceDrop.js TEXT_DEFAULTS / TEXT_MAX.
export const PRICE_TEXT_DEFAULTS = {
  triggerText: 'Notify me if the price drops',
  boxTitle: 'Now {price}',
  chanceLabel: 'Your chance to be notified',
  boxText: 'We’ll tell you the moment it gets cheaper.',
  buttonText: 'Notify me',
  emailPlaceholder: 'Your email',
  whatsappPlaceholder: 'WhatsApp number',
  whatsappHint: 'Fastest · we message you the moment the price drops',
  emailHint: 'We email you when the price drops',
  partialText: 'Done! Add {next} too to reach 100%.',
  successText: 'Done! We’ll tell you when the price drops.',
  pushTitle: 'Price drop! {product} is now {price}',
  pushBody: 'Was {oldPrice}, now {price}. Grab it before the sale ends.',
  emailSubject: '{product} is now {price}',
  emailBody: 'Good news! {product} dropped from {oldPrice} to {price}. Grab it before the sale ends.',
  whatsappMessage: 'Hi! Good news — {product} is now {price} (was {oldPrice}). Get it here: {link}',
};
export const PRICE_TEXT_MAX = {
  triggerText: 40, boxTitle: 60, chanceLabel: 50, boxText: 90, buttonText: 30, emailPlaceholder: 40,
  whatsappPlaceholder: 40, whatsappHint: 80, emailHint: 80, partialText: 90, successText: 90,
  pushTitle: 65, pushBody: 160, emailSubject: 90, emailBody: 400, whatsappMessage: 300,
};
export const PRICE_SAMPLE = { before: '₹1,499', after: '₹1,199' };

/** Saved text (or the default when empty) with {product} / {size} filled from the sample. */
export function restockText(texts, key, sample = SAMPLE, extra = {}, defaults = RESTOCK_TEXT_DEFAULTS) {
  const raw = texts && texts[key] != null && String(texts[key]).trim() ? texts[key] : defaults[key];
  return String(raw)
    .replace(/\{product\}/g, sample.product)
    .replace(/\{size\}/g, sample.size)
    .replace(/\{time\}/g, extra.time || '1 hour')
    .replace(/\{link\}/g, extra.link || 'your-store.com/products/cotton-kurta')
    .replace(/\{next\}/g, extra.next || 'email')
    .replace(/\{percent\}/g, extra.percent != null ? String(extra.percent) : '80')
    .replace(/\{price\}/g, extra.price || PRICE_SAMPLE.after)
    .replace(/\{oldPrice\}/g, extra.oldPrice || PRICE_SAMPLE.before);
}
export function restockRadius(v) {
  const n = Number(v);
  if (v === '' || v == null || !Number.isFinite(n)) return '8px';
  return n >= 24 ? '999px' : `${Math.max(0, Math.round(n))}px`;
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;


const CHAT = <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.5 8.5 0 1 1 21 11.5z" />;
const MAIL = <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>;
function Icon({ children, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
  );
}

/** Box states the preview can show: the button, the open panel, and what each sign-up gives. */
export function boxViews(channels, waPct) {
  const ch = channels || {};
  if (ch.whatsapp && ch.email) {
    return [['closed', 'Button'], ['form', 'Open · 0%'], ['wa', `WhatsApp · ${waPct}%`], ['em', `Email · ${100 - waPct}%`], ['done', 'Both · 100%']];
  }
  return [['closed', 'Button'], ['form', 'Open · 0%'], ['done', 'Done · 100%']];
}

function Ring({ pct }) {
  const R = 22;
  const C = 2 * Math.PI * R;
  return (
    <span className="bp-ring" role="img" aria-label={`${pct}%`}>
      <svg width="50" height="50" viewBox="0 0 56 56" aria-hidden="true">
        <circle cx="28" cy="28" r={R} fill="none" stroke="#F1F1EF" strokeWidth="5" />
        <circle cx="28" cy="28" r={R} fill="none" stroke="#16A34A" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - pct / 100)).toFixed(1)} transform="rotate(-90 28 28)" style={{ transition: 'stroke-dashoffset .6s' }} />
      </svg>
      <span className="bp-ringpct">{pct}%</span>
    </span>
  );
}

function Bell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/**
 * Live, view-only preview: the "Notify me" box on the product page, the push notification and the
 * email. `show` = 'box' | 'messages' | 'both' (follows the section being edited); `highlight.key`
 * outlines the part the field being edited changes.
 */
export default function BackInStockPreview({ kind = 'restock', settings, show = 'both', onShowBoth, highlight = null, boxView: boxViewProp, onBoxViewChange }) {
  const [ownView, setOwnView] = useState('form');
  const boxView = boxViewProp || ownView;
  const setBoxView = onBoxViewChange || setOwnView;
  const [device, setDevice] = useState('desktop');
  const accent = HEX_RE.test(settings.accentColor || '') ? settings.accentColor : '#111827';
  const radius = restockRadius(settings.buttonRadius);
  const isPrice = kind === 'price';
  const D = isPrice ? PRICE_TEXT_DEFAULTS : RESTOCK_TEXT_DEFAULTS;
  // Box words: {price} is today's price. Messages (tm): {price} is the lower price, {oldPrice} the old one.
  const t = (k) => restockText(settings.texts, k, SAMPLE, { time: delayLabel(settings.emailDelayMinutes), price: PRICE_SAMPLE.before }, D);
  const tm = (k) => restockText(settings.texts, k, SAMPLE, { time: delayLabel(settings.emailDelayMinutes) }, D);
  const hl = (...keys) => (highlight && keys.includes(highlight.key) ? ' is-hl' : '');
  const ch = settings.channels || { push: true, email: true, whatsapp: false };
  const waPct = whatsappPercent(settings.whatsappPercent);
  const both = !!(ch.whatsapp && ch.email);
  const PCT = both ? { whatsapp: waPct, email: 100 - waPct } : ch.whatsapp ? { whatsapp: 100 } : ch.email ? { email: 100 } : { push: 100 };
  const views = boxViews(ch, waPct);
  const view = views.some(([v]) => v === boxView) ? boxView : 'closed';
  const got = view === 'done'
    ? { whatsapp: ch.whatsapp, email: ch.email, push: !ch.whatsapp && !ch.email }
    : { whatsapp: view === 'wa', email: view === 'em' };
  const pct = Math.min(100, Object.keys(PCT).reduce((n, k) => n + (got[k] ? PCT[k] : 0), 0));
  const complete = pct >= 100;
  const isOpen = view !== 'closed';
  // In the "open" state show WhatsApp picked (its field visible) to show the round selectors at work.
  const picked = view === 'form' ? { whatsapp: ch.whatsapp, email: !ch.whatsapp && ch.email } : {};
  const tx = (k) => restockText(settings.texts, k, SAMPLE, { price: PRICE_SAMPLE.before,
    time: delayLabel(settings.emailDelayMinutes), next: got.whatsapp ? 'email' : 'WhatsApp', percent: pct,
  }, D);

  const option = (kind, channel, name, icon, badge, placeholderKey, hintKey, prefix) => {
    const done = !!got[channel];
    const on = !done && !!picked[channel];
    return (
      <div className={`bp-opt bp-opt-${kind}${on ? ' is-on' : ''}${done ? ' is-done' : ''}${hl(kind === 'wa' ? 'channelWhatsapp' : 'channelEmail')}`}>
        <div className="bp-row">
          <span className={`bp-chan bp-chan-${kind}`}><Icon>{icon}</Icon></span>
          <span className="bp-name">{name}</span>
          {badge && !done && <span className="bp-badge">{badge}</span>}
          {done
            ? <span className="bp-chip bp-added">Added</span>
            : <span className={`bp-chip${kind === 'em' ? ' bp-chip-em' : ''}${hl('whatsappPercent')}`}>{PCT[channel] < 100 ? `+${PCT[channel]}%` : ''}</span>}
          <span className="bp-radio">{done ? '✓' : null}</span>
        </div>
        {on && (
          <div className="bp-field">
            <div className={`bp-inputwrap${hl(placeholderKey)}`} style={{ borderRadius: radius }}>
              {prefix && <span className="bp-cc">{prefix}</span>}
              <span className="bp-input">{t(placeholderKey)}</span>
            </div>
            {hintKey && <span className={`bp-hint${hl(hintKey, hintKey === 'emailHint' ? 'emailDelayMinutes' : hintKey)}`}>{t(hintKey)}</span>}
          </div>
        )}
      </div>
    );
  };

  const box = (
    <div className={`bp-box${isOpen ? ' is-open' : ''}${complete ? ' is-full' : ''}`}>
      <span className={`bp-trigger${hl('triggerText', 'accentColor', 'buttonRadius')}`} style={{ borderRadius: radius }}>
        {complete ? <span aria-hidden="true">✓</span> : <Bell />}
        <span className="bp-tlabel">{complete ? 'You’re on the list' : t('triggerText')}</span>
        {pct > 0 && <span className="bp-tpct">{pct}%</span>}
        <span className="bp-chev" aria-hidden="true">›</span>
      </span>
      {isOpen && (
        <div className="bp-panel">
          <div className="bp-top">
            <span className="bp-thumb" />
            <span className="bp-topcopy">
              <span className={`bp-sold${isPrice ? ' is-price' : ''}${hl('boxTitle')}`}>{t('boxTitle')}</span>
              <span className={`bp-chance${hl('chanceLabel')}`}>{t('chanceLabel')}</span>
            </span>
            <span data-testid="preview-meter"><Ring pct={pct} /></span>
          </div>
          {complete ? (
            <div className={`bp-done${hl('successText')}`}><span aria-hidden="true">✓</span>{t('successText')}</div>
          ) : (<>
            {pct > 0 && <div className={`bp-done bp-partial${hl('partialText')}`}><span aria-hidden="true">✓</span>{tx('partialText')}</div>}
            {pct === 0 && <p className={`bp-text${hl('boxText')}`}>{t('boxText')}</p>}
            {(ch.email || ch.whatsapp) && (
              <div className="bp-opts">
                {ch.email && option('em', 'email', 'Email', MAIL, '', 'emailPlaceholder', ch.whatsapp ? 'emailHint' : '', '')}
                {ch.whatsapp && option('wa', 'whatsapp', 'WhatsApp', CHAT, 'Fastest', 'whatsappPlaceholder', 'whatsappHint', '+91')}
              </div>
            )}
            {(ch.email || ch.whatsapp) && <span className={`bp-submit${hl('buttonText')}`}>{t('buttonText')}</span>}
            {ch.push && (ch.email || ch.whatsapp)
              ? <span className={`bp-pushlink${hl('channelPush')}`}><Icon size={13}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></Icon> Also get a browser alert</span>
              : ch.push && <span className={`bp-submit${hl('buttonText', 'channelPush')}`}>{t('buttonText')}</span>}
          </>)}
        </div>
      )}
    </div>
  );

  return (
    <section className="bp" style={{ '--bp-accent': accent }} aria-label="Live preview">
      <style>{CSS}</style>
      <div className="bp-top">
        <div>
          <p className="bp-label">Live preview</p>
          <p className="bp-muted">
            {highlight && highlight.label ? <span className="bp-editing" data-testid="preview-editing"><i aria-hidden="true" />Editing: {highlight.label}</span> : null}
            {highlight && highlight.label ? ' · ' : null}
            {show === 'box' ? 'Showing the box you are editing' : show === 'messages' ? 'Showing the messages you are editing' : 'View only · updates as you edit, before you save'}
            {show !== 'both' && onShowBoth && <> · <button type="button" className="bp-both" onClick={onShowBoth}>Show all</button></>}
          </p>
        </div>
        <div className="bp-seg" role="group" aria-label="Preview size">
          {[['desktop', 'Desktop'], ['mobile', 'Mobile']].map(([v, l]) => (
            <button key={v} type="button" aria-pressed={device === v} onClick={() => setDevice(v)}>{l}</button>
          ))}
        </div>
      </div>

      <div className={`bp-stage${device === 'mobile' ? ' is-mobile' : ''}`}>
        {show !== 'messages' && (
          <div className="bp-block">
            <div className="bp-blockhead">
              <p className="bp-blocktitle"><span>1</span>Box on the product page</p>
              <div className="bp-seg" role="group" aria-label="Box state">
                {views.map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setBoxView(v)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="bp-page bp-static" data-testid="preview-box" {...{ inert: '' }}>
              <div className="bp-prod">
                <span className="bp-thumb" />
                <span><b>{SAMPLE.product}</b><small>{isPrice ? PRICE_SAMPLE.before : SAMPLE.price}</small></span>
              </div>
              <div className={`bp-sizes${isPrice ? ' is-price' : ''}`} aria-hidden="true">
                {['S', 'M', 'L', 'XL'].map((s) => <span key={s} className={s === SAMPLE.size ? 'on' : s === 'XL' && !isPrice ? 'out' : ''}>{s}</span>)}
              </div>
              {isPrice ? <>
                <span className="bp-addcart">Add to cart</span>
                <span className="bp-buynow">Buy it now</span>
              </> : <>
                <span className="bp-soldout">Sold out</span>
                {settings.replaceBuyNow === false && <span className="bp-buynow">Buy it now</span>}
              </>}
              {box}
            </div>
          </div>
        )}

        {show !== 'box' && (
          <div className="bp-block">
            <p className="bp-blocktitle"><span>2</span>{isPrice ? 'Message when the price drops' : 'Message when it’s back'}</p>
            <div className="bp-static" data-testid="preview-messages" {...{ inert: '' }}>
              {ch.push && (
                <div className="bp-push">
                  <p className="bp-sub">Push notification</p>
                  <div className="bp-notif">
                    <span className="bp-app">🛍</span>
                    <span className="bp-ncopy">
                      <span className="bp-nmeta">your-store.com · now</span>
                      <span className={`bp-ntitle${hl('pushTitle')}`}>{tm('pushTitle')}</span>
                      <span className={`bp-nbody${hl('pushBody')}`}>{tm('pushBody')}</span>
                    </span>
                    <span className="bp-nimg" />
                  </div>
                </div>
              )}
              {ch.whatsapp && (
                <div className="bp-wa">
                  <p className="bp-sub">WhatsApp · you send it</p>
                  <div className="bp-chat">
                    <span className={`bp-bubble${hl('whatsappMessage')}`}>{tm('whatsappMessage')}<small>now ✓✓</small></span>
                  </div>
                </div>
              )}
              {ch.email && (
                <div className="bp-mail">
                  <p className="bp-sub">Email</p>
                  <div className="bp-envelope">
                    <p className={`bp-subject${hl('emailSubject')}`}>{tm('emailSubject')}</p>
                    <div className="bp-mailbody">
                      <span className="bp-mailimg" />
                      <p className={`bp-mailtext${hl('emailBody')}`}>{tm('emailBody')}</p>
                      <span className={`bp-mailbtn${hl('accentColor')}`}>Shop now</span>
                      <p className="bp-unsub">Unsubscribe</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <p className="bp-sample">{isPrice
        ? `Sample: ${SAMPLE.product}, size ${SAMPLE.size}, ${PRICE_SAMPLE.before} → ${PRICE_SAMPLE.after}.`
        : `Sample: ${SAMPLE.product}, size ${SAMPLE.size} sold out.`}</p>
    </section>
  );
}

const CSS = `
.bp{font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;background:#fff;border:1px solid #E3E3E3;border-radius:14px;padding:16px;color:#1A1A1A;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.bp *{box-sizing:border-box}
.bp p{margin:0}
.bp button{font-family:inherit}
.bp-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
.bp-label{font-weight:600;font-size:14px}
.bp-muted{font-size:12px;color:#6B6B6B}
.bp-both{background:none;border:none;padding:0;color:#4338CA;font-size:12px;font-weight:600;cursor:pointer;text-decoration:underline}
.bp-editing{display:inline-flex;align-items:center;gap:5px;color:#4338CA;font-weight:600}
.bp-editing i{width:7px;height:7px;border-radius:50%;background:#4F46E5;box-shadow:0 0 0 3px rgba(79,70,229,.2)}
.bp-seg{display:inline-flex;background:#F1F1F1;border-radius:8px;padding:2px}
.bp-seg button{border:none;background:none;padding:5px 10px;font-size:12px;border-radius:6px;cursor:pointer;color:#4A4A4A}
.bp-seg button[aria-pressed=true]{background:#fff;color:#1A1A1A;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.1)}
.bp-stage{display:flex;flex-direction:column;gap:14px}
.bp-stage.is-mobile .bp-page,.bp-stage.is-mobile .bp-static{max-width:360px;margin:0 auto;width:100%}
.bp-block{background:#F6F5F2;border-radius:12px;padding:12px}
.bp-blockhead{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px}
.bp-blocktitle{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:#303030;margin-bottom:10px!important}
.bp-blockhead .bp-blocktitle{margin-bottom:0!important}
.bp-blocktitle span{width:20px;height:20px;border-radius:50%;background:#303030;color:#fff;font-size:11px;display:inline-flex;align-items:center;justify-content:center}
.bp-static{pointer-events:none;user-select:none}
.bp-page{background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.bp-prod{display:flex;gap:10px;align-items:center;margin-bottom:10px}
.bp-thumb{width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,#E9E4DA,#D8D0C2)}
.bp-prod b{display:block;font-size:13px}
.bp-prod small{font-size:12px;color:#6B6B6B}
.bp-sizes{display:flex;gap:6px;margin-bottom:8px}
.bp-sizes span{min-width:34px;text-align:center;padding:6px 8px;border:1px solid #D4D4D4;border-radius:6px;font-size:12px}
.bp-sizes span.on{border-color:#1A1A1A;box-shadow:inset 0 0 0 1px #1A1A1A;text-decoration:line-through;color:#8A8A8A}
.bp-sizes span.out{text-decoration:line-through;color:#B0B0B0}
.bp-sizes.is-price span.on{text-decoration:none;color:#1A1A1A}
.bp-addcart{display:block;text-align:center;padding:9px;border:1px solid #1A1A1A;border-radius:8px;font-size:13px;font-weight:600;color:#1A1A1A}
.bp-soldout{display:block;text-align:center;padding:9px;border:1px solid #E3E3E3;border-radius:8px;font-size:13px;color:#8A8A8A;background:#FAFAFA}
.bp-box{margin-top:8px}
.bp-buynow{display:block;text-align:center;margin-top:8px;padding:9px;border-radius:8px;background:#1A1A1A;color:#fff;font-size:13px;font-weight:600}
.bp-trigger{display:flex;align-items:center;gap:8px;padding:11px 12px;background:var(--bp-accent);color:#fff;border:1px solid var(--bp-accent);font-size:13.5px;font-weight:600}
.bp-tlabel{flex:1;min-width:0}
.bp-tpct{font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;background:rgba(255,255,255,.18)}
.bp-chev{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;transition:transform .25s}
.bp-box.is-open .bp-chev{transform:rotate(90deg)}
.bp-box.is-full .bp-trigger{background:#fff;color:#15803D;border-color:#86EFAC}
.bp-box.is-full .bp-chev,.bp-box.is-full .bp-tpct{background:#F0FDF4}
.bp-panel{margin-top:8px;padding:12px;border:1px solid #E7E5E4;border-radius:14px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.04),0 10px 26px rgba(16,24,40,.09)}
.bp-top{display:flex;align-items:center;gap:10px}
.bp-topcopy{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.bp-sold{font-size:11.5px;font-weight:600;color:#B42318}
.bp-sold.is-price{color:#15803D;font-weight:650}
.bp-chance{font-size:13.5px;font-weight:650;line-height:1.3}
.bp-ring{position:relative;width:50px;height:50px;display:inline-block;flex-shrink:0}
.bp-ringpct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:750;color:#15803D}
.bp-opts{margin-top:10px;border-top:1px solid #F0F0F0}
.bp-opt{border-bottom:1px solid #F0F0F0}
.bp-row{display:flex;align-items:center;gap:8px;padding:9px 2px}
.bp-name{font-size:12.5px;font-weight:600}
.bp-radio{width:18px;height:18px;border-radius:50%;border:2px solid #D4D4D8;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:10px;color:#fff}
.bp-opt.is-on .bp-radio{border-color:#16A34A;box-shadow:inset 0 0 0 3px #fff;background:#16A34A}
.bp-opt-em.is-on .bp-radio{border-color:var(--bp-accent);background:var(--bp-accent)}
.bp-opt.is-done .bp-radio{border-color:#16A34A;background:#16A34A}
.bp-added{color:#15803D}
.bp-field{padding:0 2px 10px;display:flex;flex-direction:column;gap:4px}
.bp-inputwrap{display:flex;border:1px solid #D4D4D8;background:#fff;overflow:hidden}
.bp-cc{display:flex;align-items:center;padding:0 8px;font-size:12px;font-weight:600;color:#3F3F46;background:#FAFAFA;border-right:1px solid #E4E4E7}
.bp-inputwrap .bp-input{border:none;border-radius:0}
.bp-submit{display:block;text-align:center;margin-top:10px;padding:10px;border-radius:999px;background:var(--bp-accent);color:#fff;font-size:13px;font-weight:650}
.bp-head{display:flex;gap:10px;align-items:center}
.bp-icon{width:36px;height:36px;border-radius:10px;background:color-mix(in srgb,var(--bp-accent) 8%,#fff);color:var(--bp-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.bp-meter{margin-top:11px}
.bp-meterrow{display:flex;justify-content:space-between;align-items:baseline;font-size:11.5px;font-weight:600;color:#3F3F46}
.bp-pct{font-size:12.5px;font-weight:750;color:#15803D}
.bp-bar{height:7px;margin-top:5px;border-radius:999px;background:#F1F1EF;overflow:hidden}
.bp-fill{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#4ADE80,#16A34A);transition:width .5s cubic-bezier(.2,.8,.2,1)}
.bp-box.is-full .bp-fill{background:linear-gradient(90deg,#22C55E,#15803D);box-shadow:0 0 8px rgba(34,197,94,.45)}
.bp-card{border:1px solid #EAEAEA;border-radius:10px;background:#FCFCFB;padding:10px;display:flex;flex-direction:column;gap:7px}
.bp-cardhead{display:flex;align-items:center;gap:7px}
.bp-chan{width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.bp-chan-wa{background:#E7F8EE;color:#15803D}
.bp-chan-em{background:color-mix(in srgb,var(--bp-accent) 8%,#fff);color:var(--bp-accent)}
.bp-cardtitle{font-size:12.5px;font-weight:600}
.bp-chip{margin-left:auto;font-size:11px;font-weight:700;padding:1px 8px;border-radius:999px;border:1px solid #BBF7D0;background:#F0FDF4;color:#15803D}
.bp-chip-em{border-color:#E2E8F0;background:#F8FAFC;color:#475569}
.bp-pushlink{align-self:center;display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--bp-accent)}
.bp-partial{border:1px solid #BBF7D0}
.bp-copy{display:flex;flex-direction:column;gap:1px;min-width:0}
.bp-title{font-size:13.5px;font-weight:600}
.bp-text{font-size:12px;color:#6B6B6B}
.bp-body{margin-top:10px;display:flex;flex-direction:column;gap:7px}
.bp-form .bp-btn{flex-shrink:0}
.bp-btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 12px;background:var(--bp-accent);color:#fff;border:1px solid var(--bp-accent);font-size:13px;font-weight:600}
.bp-or{display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#8A8A8A}
.bp-or::before,.bp-or::after{content:"";flex:1;height:1px;background:#E5E5E5}
.bp-form{display:flex;gap:6px}
.bp-input{flex:1;min-width:0;padding:9px 10px;border:1px solid #D4D4D4;background:#fff;font-size:12.5px;color:#9A9A9A}
.bp-btn2{flex-shrink:0;background:#fff;color:var(--bp-accent)}
.bp-form.is-only .bp-btn2{background:var(--bp-accent);color:#fff}
.bp-opt{display:flex;flex-direction:column;gap:5px}
.bp-optlabel{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600}
.bp-badge{font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 6px;border-radius:999px;background:#DCFCE7;color:#166534}
.bp-hint{font-size:11px;color:#6B6B6B}
.bp-wabtn{flex-shrink:0;background:#1FA855;border-color:#1FA855;color:#fff}
.bp-ghost{background:#fff;color:var(--bp-accent)}
.bp-wa{margin-bottom:12px}
.bp-chat{background:#EFE7DD;border-radius:10px;padding:12px;display:flex;justify-content:flex-end}
.bp-bubble{max-width:88%;background:#D9FDD3;border-radius:9px 2px 9px 9px;padding:8px 10px;font-size:12px;line-height:1.45;color:#111B21;box-shadow:0 1px 1px rgba(0,0,0,.08)}
.bp-bubble small{display:block;text-align:right;font-size:10px;color:#667781;margin-top:2px}
.bp-done{display:flex;gap:8px;align-items:center;margin-top:10px;padding:9px 10px;border-radius:9px;background:#ECFDF5;color:#065F46;font-size:12.5px;font-weight:500}
.bp-sub{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#303030;margin:0 0 6px!important}
.bp-push{margin-bottom:12px}
.bp-notif{display:flex;gap:10px;align-items:flex-start;background:rgba(255,255,255,.96);border-radius:14px;padding:10px 12px;box-shadow:0 6px 20px rgba(0,0,0,.12)}
.bp-app{width:30px;height:30px;border-radius:8px;background:#F1F1F1;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
.bp-ncopy{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}
.bp-nmeta{font-size:10.5px;color:#8A8A8A}
.bp-ntitle{font-size:13px;font-weight:600}
.bp-nbody{font-size:12px;color:#4A4A4A}
.bp-nimg{width:42px;height:42px;border-radius:8px;background:linear-gradient(135deg,#E9E4DA,#D8D0C2);flex-shrink:0}
.bp-envelope{background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.bp-subject{font-size:13px;font-weight:600;padding:10px 12px;border-bottom:1px solid #EEE}
.bp-mailbody{padding:14px 12px;display:flex;flex-direction:column;gap:10px;align-items:flex-start}
.bp-mailimg{width:72px;height:72px;border-radius:8px;background:linear-gradient(135deg,#E9E4DA,#D8D0C2)}
.bp-mailtext{font-size:12.5px;color:#303030;line-height:1.5}
.bp-mailbtn{display:inline-block;background:var(--bp-accent);color:#fff;padding:8px 16px;border-radius:7px;font-size:12.5px;font-weight:600}
.bp-unsub{font-size:10.5px;color:#9CA3AF;text-decoration:underline}
.bp-sample{font-size:11.5px;color:#8A8A8A;margin-top:10px!important}
.bp .is-hl{outline:1px dashed #A5B4FC;outline-offset:2px;border-radius:6px;animation:bp-hl 1.2s ease-in-out infinite}
@keyframes bp-hl{0%,100%{outline-color:#4F46E5}50%{outline-color:#C7D2FE}}
@media (prefers-reduced-motion:reduce){.bp .is-hl{animation:none}}
`;
