'use client';

import { useState } from 'react';

// Mirrors backend/utils/restock.js TEXT_DEFAULTS / TEXT_MAX and the storefront look (ccf-restock.js).
export const RESTOCK_TEXT_DEFAULTS = {
  boxTitle: 'Sold out in this size',
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
};
export const RESTOCK_TEXT_MAX = {
  boxTitle: 60, boxText: 90, buttonText: 30, emailPlaceholder: 40, successText: 90,
  pushTitle: 65, pushBody: 160, emailSubject: 90, emailBody: 400,
  whatsappPlaceholder: 40, whatsappHint: 80, emailHint: 80, whatsappMessage: 300,
};
// Mirrors backend EMAIL_DELAYS / delayLabel.
export const EMAIL_DELAYS = [[0, 'Right away'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [240, '4 hours'], [720, '12 hours']];
export function delayLabel(minutes) {
  const m = EMAIL_DELAYS.some(([v]) => v === Number(minutes)) ? Number(minutes) : 60;
  if (m === 0) return 'a few minutes';
  if (m < 60) return `${m} minutes`;
  return m === 60 ? '1 hour' : `${m / 60} hours`;
}
export const SAMPLE = { product: 'Cotton Kurta', size: 'M', price: '₹1,299' };

/** Saved text (or the default when empty) with {product} / {size} filled from the sample. */
export function restockText(texts, key, sample = SAMPLE, extra = {}) {
  const raw = texts && texts[key] != null && String(texts[key]).trim() ? texts[key] : RESTOCK_TEXT_DEFAULTS[key];
  return String(raw)
    .replace(/\{product\}/g, sample.product)
    .replace(/\{size\}/g, sample.size)
    .replace(/\{time\}/g, extra.time || '1 hour')
    .replace(/\{link\}/g, extra.link || 'your-store.com/products/cotton-kurta');
}
export function restockRadius(v) {
  const n = Number(v);
  if (v === '' || v == null || !Number.isFinite(n)) return '8px';
  return n >= 24 ? '999px' : `${Math.max(0, Math.round(n))}px`;
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const BOX_VIEWS = [['form', 'Before'], ['done', 'After sign-up']];

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
export default function BackInStockPreview({ settings, show = 'both', onShowBoth, highlight = null, boxView: boxViewProp, onBoxViewChange }) {
  const [ownView, setOwnView] = useState('form');
  const boxView = boxViewProp || ownView;
  const setBoxView = onBoxViewChange || setOwnView;
  const [device, setDevice] = useState('desktop');
  const accent = HEX_RE.test(settings.accentColor || '') ? settings.accentColor : '#111827';
  const radius = restockRadius(settings.buttonRadius);
  const t = (k) => restockText(settings.texts, k, SAMPLE, { time: delayLabel(settings.emailDelayMinutes) });
  const hl = (...keys) => (highlight && keys.includes(highlight.key) ? ' is-hl' : '');
  const ch = settings.channels || { push: true, email: true, whatsapp: false };
  const many = [ch.whatsapp, ch.push, ch.email].filter(Boolean).length > 1;

  const box = (
    <div className={`bp-box${hl('accentColor')}`}>
      <div className="bp-head">
        <span className="bp-icon"><Bell /></span>
        <span className="bp-copy">
          <span className={`bp-title${hl('boxTitle')}`}>{t('boxTitle')}</span>
          <span className={`bp-text${hl('boxText')}`}>{t('boxText')}</span>
        </span>
      </div>
      {boxView === 'done' ? (
        <div className={`bp-done${hl('successText')}`}><span aria-hidden="true">✓</span>{t('successText')}</div>
      ) : (
        <div className="bp-body">
          {ch.whatsapp && (
            <div className={`bp-opt${hl('channelWhatsapp')}`}>
              {many && <span className="bp-optlabel">WhatsApp <span className="bp-badge">Fastest</span></span>}
              <div className="bp-form">
                <span className={`bp-input${hl('whatsappPlaceholder')}`} style={{ borderRadius: radius }}>{t('whatsappPlaceholder')}</span>
                <span className={`bp-btn bp-wabtn${hl('buttonText', 'buttonRadius')}`} style={{ borderRadius: radius }}>{t('buttonText')}</span>
              </div>
              <span className={`bp-hint${hl('whatsappHint')}`}>{t('whatsappHint')}</span>
            </div>
          )}
          {ch.push && ch.whatsapp && <span className="bp-or">or</span>}
          {ch.push && (
            <span className={`bp-btn${ch.whatsapp ? ' bp-ghost' : ''}${hl('buttonText', 'buttonRadius', 'channelPush')}`} style={{ borderRadius: radius }}>
              <Bell /> {ch.whatsapp ? 'Get a browser alert' : t('buttonText')}
            </span>
          )}
          {ch.email && (ch.push || ch.whatsapp) && <span className="bp-or">or by email</span>}
          {ch.email && (
            <div className={`bp-opt${hl('channelEmail')}`}>
              <div className={`bp-form${ch.push || ch.whatsapp ? '' : ' is-only'}`}>
                <span className={`bp-input${hl('emailPlaceholder')}`} style={{ borderRadius: radius }}>{t('emailPlaceholder')}</span>
                <span className={`bp-btn bp-btn2${hl('buttonText', 'buttonRadius')}`} style={{ borderRadius: radius }}>{t('buttonText')}</span>
              </div>
              {ch.whatsapp && <span className={`bp-hint${hl('emailHint', 'emailDelayMinutes')}`}>{t('emailHint')}</span>}
            </div>
          )}
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
                {BOX_VIEWS.map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={boxView === v} onClick={() => setBoxView(v)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="bp-page bp-static" data-testid="preview-box" {...{ inert: '' }}>
              <div className="bp-prod">
                <span className="bp-thumb" />
                <span><b>{SAMPLE.product}</b><small>{SAMPLE.price}</small></span>
              </div>
              <div className="bp-sizes" aria-hidden="true">
                {['S', 'M', 'L', 'XL'].map((s) => <span key={s} className={s === SAMPLE.size ? 'on' : s === 'XL' ? 'out' : ''}>{s}</span>)}
              </div>
              <span className="bp-soldout">Sold out</span>
              {box}
            </div>
          </div>
        )}

        {show !== 'box' && (
          <div className="bp-block">
            <p className="bp-blocktitle"><span>2</span>Message when it’s back</p>
            <div className="bp-static" data-testid="preview-messages" {...{ inert: '' }}>
              {ch.push && (
                <div className="bp-push">
                  <p className="bp-sub">Push notification</p>
                  <div className="bp-notif">
                    <span className="bp-app">🛍</span>
                    <span className="bp-ncopy">
                      <span className="bp-nmeta">your-store.com · now</span>
                      <span className={`bp-ntitle${hl('pushTitle')}`}>{t('pushTitle')}</span>
                      <span className={`bp-nbody${hl('pushBody')}`}>{t('pushBody')}</span>
                    </span>
                    <span className="bp-nimg" />
                  </div>
                </div>
              )}
              {ch.whatsapp && (
                <div className="bp-wa">
                  <p className="bp-sub">WhatsApp · you send it</p>
                  <div className="bp-chat">
                    <span className={`bp-bubble${hl('whatsappMessage')}`}>{t('whatsappMessage')}<small>now ✓✓</small></span>
                  </div>
                </div>
              )}
              {ch.email && (
                <div className="bp-mail">
                  <p className="bp-sub">Email</p>
                  <div className="bp-envelope">
                    <p className={`bp-subject${hl('emailSubject')}`}>{t('emailSubject')}</p>
                    <div className="bp-mailbody">
                      <span className="bp-mailimg" />
                      <p className={`bp-mailtext${hl('emailBody')}`}>{t('emailBody')}</p>
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
      <p className="bp-sample">Sample: {SAMPLE.product}, size {SAMPLE.size} sold out.</p>
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
.bp-soldout{display:block;text-align:center;padding:9px;border:1px solid #E3E3E3;border-radius:8px;font-size:13px;color:#8A8A8A;background:#FAFAFA}
.bp-box{margin-top:12px;padding:12px;border:1px solid color-mix(in srgb,var(--bp-accent) 22%,transparent);border-radius:12px;background:linear-gradient(135deg,color-mix(in srgb,var(--bp-accent) 5%,#fff),color-mix(in srgb,var(--bp-accent) 1%,#fff))}
.bp-head{display:flex;gap:10px;align-items:flex-start}
.bp-icon{width:34px;height:34px;border-radius:50%;background:#fff;color:var(--bp-accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 0 1px color-mix(in srgb,var(--bp-accent) 20%,transparent)}
.bp-copy{display:flex;flex-direction:column;gap:1px;min-width:0}
.bp-title{font-size:13.5px;font-weight:600}
.bp-text{font-size:12px;color:#6B6B6B}
.bp-body{margin-top:10px;display:flex;flex-direction:column;gap:7px}
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
