'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { planFeatures, priceLabel } from './Plans';

/*
 * The animated tour that opens first on the Free plan's Prepaid offer tab (approved preview "Prepaid Offer
 * Tour Preview"). Seven steps, one per part of the offer; inside a step the picture and the points enter
 * one after another. Plays by itself (STEP_MS a step), pauses under the pointer, and is fully controllable:
 * Back, Next, Skip, ×, Escape, arrow keys and a click outside. No motion when the device asks for less.
 */

export const STEP_MS = 6000;
const TOTAL = 7;

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const CSS = `
.ccft-scrim { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.5); display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px 88px; overflow-y: auto; animation: ccftFade .2s ease-out both; font-family: -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif; font-size: 13px; line-height: 1.5; color: #303030; -webkit-font-smoothing: antialiased; }
.ccft-dialog { width: 100%; max-width: 760px; margin: auto 0; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.28), 0 0 0 1px rgba(0,0,0,.06); display: flex; flex-direction: column; animation: ccftPop .35s cubic-bezier(.2,.8,.2,1) both; }
.ccft-dh { display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 18px; background: #F3F3F3; border-bottom: 1px solid #E3E3E3; }
.ccft-ey { font-size: 11.5px; color: #616161; font-weight: 550; display: flex; align-items: center; gap: 6px; }
.ccft-lk { display: inline-flex; align-items: center; gap: 3px; background: #FFEB78; color: #4F4700; border-radius: 6px; padding: 0 6px; font-size: 11px; }
.ccft-dh h2 { margin: 1px 0 0; font-size: 15px; font-weight: 650; color: #303030; }
.ccft-x { margin-left: auto; width: 30px; height: 30px; border-radius: 8px; border: 0; background: transparent; color: #616161; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.ccft-x:hover { background: #E3E3E3; }
.ccft-progress { display: flex; gap: 4px; padding: 12px 18px 0; }
.ccft-seg { flex: 1; height: 4px; border-radius: 4px; background: #E8E8E8; overflow: hidden; }
.ccft-seg span { display: block; height: 100%; width: 0; background: #303030; }
.ccft-seg.done span { width: 100%; }
.ccft-seg.cur span { animation: ccftFill ${STEP_MS}ms linear forwards; }
.ccft-seg.cur.last span, .ccft-seg.cur.still span { animation: none; width: 100%; }
.ccft-dialog.paused .ccft-seg.cur span { animation-play-state: paused; }
.ccft-body { position: relative; height: 330px; overflow-y: auto; }
.ccft-step { display: grid; grid-template-columns: 330px minmax(0, 1fr); gap: 22px; padding: 16px 18px 8px; min-height: 100%; }
.ccft-vis { position: relative; border-radius: 14px; background: #F6F6F7; box-shadow: inset 0 0 0 1px #EDEDED; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 16px; min-height: 290px; }
.ccft-txt { display: flex; flex-direction: column; justify-content: center; padding-right: 6px; }
.ccft-kick { font-size: 11.5px; font-weight: 600; color: #616161; letter-spacing: .04em; text-transform: uppercase; }
.ccft-txt h3 { font-size: 20px; font-weight: 650; margin: 4px 0 6px; line-height: 1.25; color: #303030; }
.ccft-txt p { margin: 0 0 12px; color: #616161; font-size: 13.5px; }
.ccft-pts { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 9px; }
.ccft-pts li { display: flex; gap: 9px; align-items: flex-start; }
.ccft-pts svg { flex: 0 0 auto; margin-top: 1px; }
.ccft-in { animation: ccftRise .5s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--i, 0) * 140ms + 120ms); }
.ccft-pop { animation: ccftPopIn .45s cubic-bezier(.2,1.4,.4,1) both; animation-delay: calc(var(--i, 0) * 140ms + 120ms); }
.ccft-slide { animation: ccftSlide .55s cubic-bezier(.2,.8,.2,1) both; animation-delay: calc(var(--i, 0) * 140ms + 120ms); }
@keyframes ccftFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes ccftPop { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: none; } }
@keyframes ccftFill { from { width: 0; } to { width: 100%; } }
@keyframes ccftRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes ccftPopIn { 0% { opacity: 0; transform: scale(.8); } 70% { opacity: 1; transform: scale(1.06); } 100% { opacity: 1; transform: none; } }
@keyframes ccftSlide { from { opacity: 0; transform: translateX(26px); } to { opacity: 1; transform: none; } }
.ccft-mini { width: 100%; max-width: 280px; background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 8px 24px rgba(17,24,39,.08), inset 0 0 0 1px #EDEDED; }
.ccft-mt { font-weight: 650; font-size: 13px; margin-bottom: 8px; }
.ccft-ms { background: #F4F4F5; border-radius: 8px; padding: 7px 9px; font-size: 12px; color: #616161; margin-bottom: 9px; }
.ccft-offer { border: 1px solid #C7C9FF; background: #F7F7FF; border-radius: 10px; padding: 10px; position: relative; overflow: hidden; }
.ccft-offer.shine::after { content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 30%; background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.8), rgba(255,255,255,0)); transform: translateX(-160%) skewX(-20deg); animation: ccftShine 3.6s ease-in-out 1.4s infinite; }
@keyframes ccftShine { 60%, 100% { transform: translateX(320%) skewX(-20deg); } }
.ccft-ot { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-weight: 600; font-size: 12.5px; }
.ccft-save { font-size: 11px; font-weight: 600; color: #0C5132; background: #CDFEE1; border-radius: 6px; padding: 1px 6px; white-space: nowrap; }
.ccft-offer small { display: block; font-size: 11px; color: #616161; margin: 2px 0 8px; }
.ccft-pay { background: #4F46E5; color: #fff; border-radius: 8px; text-align: center; padding: 8px; font-weight: 600; font-size: 12.5px; }
.ccft-pay s { opacity: .7; font-weight: 400; margin-left: 5px; }
.ccft-pay.press { animation: ccftPress .5s ease 1s both; }
@keyframes ccftPress { 40% { transform: scale(.94); box-shadow: 0 0 0 6px rgba(79,70,229,.22); } to { transform: none; box-shadow: none; } }
.ccft-or { text-align: center; font-size: 11px; color: #8A8A8A; margin: 9px 0 6px; }
.ccft-fld { height: 22px; border-radius: 6px; box-shadow: inset 0 0 0 1px #E3E3E3; margin-top: 6px; }
.ccft-seg2 { display: inline-flex; background: #EBEBEB; border-radius: 9px; padding: 3px; gap: 2px; margin-bottom: 12px; }
.ccft-seg2 span { padding: 5px 12px; border-radius: 7px; font-weight: 600; font-size: 12px; color: #616161; transition: background .25s, color .25s, box-shadow .25s; }
.ccft-seg2 span.on { background: #fff; color: #303030; box-shadow: 0 1px 2px rgba(0,0,0,.12); }
.ccft-big { font-size: 30px; font-weight: 700; letter-spacing: -.02em; color: #0C5132; line-height: 1; }
.ccft-lab { color: #616161; font-size: 12px; margin-top: 4px; }
.ccft-swap { display: grid; }
.ccft-swap > div { grid-area: 1 / 1; transition: opacity .3s ease, transform .3s ease; }
.ccft-swap > div.off { opacity: 0; transform: translateY(6px); }
.ccft-lims { width: 100%; max-width: 290px; display: flex; flex-direction: column; gap: 8px; }
.ccft-lim { background: #fff; border-radius: 10px; padding: 9px 11px; box-shadow: inset 0 0 0 1px #E8E8E8; display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; }
.ccft-lim b { font-size: 12.5px; }
.ccft-lim small { color: #616161; font-size: 11.5px; }
.ccft-lim .r { grid-row: 1 / 3; grid-column: 2; font-weight: 650; font-size: 11.5px; border-radius: 6px; padding: 1px 7px; }
.ccft-lim .r.ok { color: #0C5132; background: #CDFEE1; }
.ccft-lim .r.cap { color: #4F4700; background: #FFEB78; }
.ccft-lim .r.no { color: #8E1F0B; background: #FEE9E8; }
.ccft-flow { width: 100%; max-width: 300px; position: relative; height: 230px; }
.ccft-flow .ccft-mini { position: absolute; left: 0; top: 10px; width: 210px; }
.ccft-co { position: absolute; right: 0; top: 46px; width: 210px; background: #fff; border-radius: 12px; padding: 11px; box-shadow: 0 14px 32px rgba(17,24,39,.16), inset 0 0 0 1px #E8E8E8; }
.ccft-co .h { font-weight: 650; font-size: 12.5px; margin-bottom: 7px; }
.ccft-co .r { display: flex; justify-content: space-between; font-size: 12px; color: #616161; margin: 4px 0; gap: 6px; }
.ccft-code { display: inline-flex; gap: 4px; align-items: center; font-size: 11px; font-weight: 600; background: #EBEBEB; color: #303030; border-radius: 6px; padding: 2px 7px; }
.ccft-co .t { display: flex; justify-content: space-between; font-weight: 650; font-size: 13px; border-top: 1px solid #EEE; padding-top: 6px; margin-top: 6px; color: #303030; }
.ccft-codebox { width: 100%; max-width: 280px; background: #fff; border-radius: 12px; padding: 14px; box-shadow: inset 0 0 0 1px #E8E8E8, 0 8px 24px rgba(17,24,39,.06); }
.ccft-chip { display: inline-flex; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 700; font-size: 15px; letter-spacing: .04em; background: #F1F1F1; border-radius: 8px; padding: 7px 11px; }
.ccft-rules { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 8px; }
.ccft-rules li { display: flex; gap: 8px; align-items: center; font-size: 12.5px; }
.ccft-stats { width: 100%; max-width: 290px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ccft-stat { background: #fff; border-radius: 10px; padding: 10px 12px; box-shadow: inset 0 0 0 1px #E8E8E8; }
.ccft-stat b { display: block; font-size: 19px; font-weight: 700; letter-spacing: -.01em; font-variant-numeric: tabular-nums; }
.ccft-stat span { font-size: 11.5px; color: #616161; }
.ccft-stat.wide { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; }
.ccft-plan { position: relative; width: 100%; max-width: 290px; background: #fff; border-radius: 12px; padding: 14px; box-shadow: inset 0 0 0 1px #E3E3E3, 0 10px 26px rgba(17,24,39,.08); }
.ccft-plan .nm { font-size: 15px; font-weight: 650; }
.ccft-plan .pr { font-size: 22px; font-weight: 700; }
.ccft-plan .per { color: #616161; }
.ccft-plan ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
.ccft-plan li { display: flex; gap: 7px; }
.ccft-lockbig { position: absolute; top: 14px; right: 14px; width: 34px; height: 34px; border-radius: 10px; background: #303030; color: #fff; display: flex; align-items: center; justify-content: center; }
.ccft-df { display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-top: 1px solid #E3E3E3; }
.ccft-count { color: #616161; font-size: 12px; font-variant-numeric: tabular-nums; }
.ccft-skip { background: none; border: 0; color: #616161; font: inherit; font-weight: 550; font-size: 12.5px; cursor: pointer; padding: 4px; }
.ccft-skip:hover { color: #303030; text-decoration: underline; }
.ccft-sp { flex: 1; }
.ccft-btn { display: inline-flex; align-items: center; min-height: 32px; padding: 0 12px; border-radius: 8px; border: 0; font: inherit; font-weight: 550; cursor: pointer; }
.ccft-btn.p { background: #303030; color: #fff; box-shadow: inset 0 -1px 0 #000, 0 1px 0 rgba(0,0,0,.2); }
.ccft-btn.p:hover { background: #1A1A1A; }
.ccft-btn.s { background: #fff; color: #303030; box-shadow: inset 0 0 0 1px #D4D4D4, 0 1px 0 rgba(0,0,0,.05); }
.ccft-btn.s:hover { background: #F7F7F7; }
.ccft-btn:focus-visible, .ccft-skip:focus-visible, .ccft-x:focus-visible { outline: 2px solid #005BD3; outline-offset: 2px; }
@media (max-width: 720px) {
  .ccft-body { height: auto; max-height: calc(100vh - 220px); }
  .ccft-step { grid-template-columns: 1fr; gap: 12px; }
  .ccft-vis { min-height: 220px; }
}
@media (prefers-reduced-motion: reduce) {
  .ccft-scrim, .ccft-dialog, .ccft-in, .ccft-pop, .ccft-slide, .ccft-offer.shine::after, .ccft-pay.press { animation: none !important; }
  .ccft-seg.cur span { animation: none; width: 100%; }
  .ccft-swap > div { transition: none; }
}
`;

const Tick = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="9" fill="#CDFEE1" />
    <path d="M6 10.4l2.6 2.6L14 7.6" fill="none" stroke="#29845A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Lock = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
);

const d = (i) => ({ '--i': i });

function Text({ n, title, lead, points }) {
  return (
    <div className="ccft-txt">
      <span className="ccft-kick ccft-in" style={d(0)}>Step {n} of {TOTAL}</span>
      <h3 className="ccft-in" style={d(1)}>{title}</h3>
      <p className="ccft-in" style={d(2)}>{lead}</p>
      {points && points.length ? (
        <ul className="ccft-pts">
          {points.map((p, k) => <li key={k} className="ccft-in" style={d(3 + k)}><Tick />{p}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

/** Step 2: the discount type switches back and forth on its own. */
function DiscountSwitch({ still }) {
  const [pct, setPct] = useState(true);
  useEffect(() => {
    if (still) return undefined;
    const t = setInterval(() => setPct((v) => !v), 1800);
    return () => clearInterval(t);
  }, [still]);
  return (
    <div className="ccft-in" style={{ ...d(0), textAlign: 'center' }} data-testid="tour-discount" data-mode={pct ? 'pct' : 'fix'}>
      <div className="ccft-seg2"><span className={pct ? 'on' : ''}>Percentage</span><span className={pct ? '' : 'on'}>Fixed amount (₹)</span></div>
      <div className="ccft-swap">
        <div className={pct ? '' : 'off'}><div className="ccft-big">₹49.95</div><div className="ccft-lab">5% of a ₹999 order</div></div>
        <div className={pct ? 'off' : ''}><div className="ccft-big">₹50</div><div className="ccft-lab">₹50 off every order</div></div>
      </div>
    </div>
  );
}

/** Step 6: example numbers count up. */
function CountUp({ to, money, still }) {
  const fmt = (n) => `${money ? '₹' : ''}${Math.round(n).toLocaleString('en-IN')}`;
  const [v, setV] = useState(still ? to : 0);
  useEffect(() => {
    if (still || typeof requestAnimationFrame === 'undefined') { setV(to); return undefined; }
    let raf = 0;
    let t0 = 0;
    const start = setTimeout(() => {
      const tick = (t) => {
        if (!t0) t0 = t;
        const p = Math.min(1, (t - t0) / 1200);
        setV(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, 500);
    return () => { clearTimeout(start); cancelAnimationFrame(raf); };
  }, [to, still]);
  return <b>{fmt(v)}</b>;
}

function StepBody({ index, plan, still }) {
  switch (index) {
    case 0:
      return (
        <>
          <div className="ccft-vis">
            <div className="ccft-mini ccft-in" style={d(0)}>
              <div className="ccft-mt">Cash on Delivery Order</div>
              <div className="ccft-ms">Cotton Kurta · ₹999</div>
              <div className="ccft-offer shine ccft-pop" style={d(2)}>
                <div className="ccft-ot">Pay online and save <span className="ccft-save ccft-pop" style={d(4)}>Save ₹49.95</span></div>
                <small>Pay now by UPI, card or wallet.</small>
                <div className="ccft-pay">Pay online · ₹949.05<s>₹999</s></div>
              </div>
              <div className="ccft-or ccft-in" style={d(5)}>or pay with Cash on Delivery</div>
              <div className="ccft-fld ccft-in" style={d(6)} />
            </div>
          </div>
          <Text n={1} title="Turn COD orders into prepaid orders"
            lead={'A "Pay online and save" box appears at the top of your COD form. Customers who pay online get a small discount.'}
            points={['Fewer parcels refused at the door', 'Your money arrives sooner, through Shopify', 'Customers who want COD can still choose it']} />
        </>
      );
    case 1:
      return (
        <>
          <div className="ccft-vis"><DiscountSwitch still={still} /></div>
          <Text n={2} title="Choose the discount"
            lead="Give a percentage of the order or a fixed amount in rupees. The exact saving is shown to the customer."
            points={[<span key="a"><b>Percentage:</b> 1% to 50%, for example 5%</span>, <span key="b"><b>Fixed amount:</b> for example ₹50 off</span>, 'Worked out after your quantity discounts']} />
        </>
      );
    case 2:
      return (
        <>
          <div className="ccft-vis">
            <div className="ccft-lims">
              <div className="ccft-lim ccft-slide" style={d(0)}><b>₹999 order</b><small>5% of ₹999</small><span className="r ok">Save ₹49.95</span></div>
              <div className="ccft-lim ccft-slide" style={d(1)}><b>₹3,000 order</b><small>5% is ₹150, maximum is ₹100</small><span className="r cap">Save ₹100</span></div>
              <div className="ccft-lim ccft-slide" style={d(2)}><b>₹400 order</b><small>Below the ₹499 minimum</small><span className="r no">No offer</span></div>
            </div>
          </div>
          <Text n={3} title="Set a maximum and a minimum"
            lead="Keep the discount under control on big orders, and skip it on small ones."
            points={[<span key="a"><b>Maximum discount:</b> a percentage never goes above it</span>, <span key="b"><b>Minimum order:</b> no offer below this amount</span>]} />
        </>
      );
    case 3:
      return (
        <>
          <div className="ccft-vis">
            <div className="ccft-flow">
              <div className="ccft-mini ccft-in" style={d(0)}>
                <div className="ccft-mt">COD form</div>
                <div className="ccft-offer">
                  <div className="ccft-ot">Pay online and save <span className="ccft-save">Save ₹49.95</span></div>
                  <small>UPI, card or wallet</small>
                  <div className="ccft-pay press">Pay online · ₹949.05</div>
                </div>
              </div>
              <div className="ccft-co ccft-slide" style={d(8)}>
                <div className="h">Shopify checkout</div>
                <div className="r"><span>Cotton Kurta</span><span>₹999.00</span></div>
                <div className="r"><span className="ccft-code ccft-pop" style={d(10)}>PAYNOW-8KQ2</span><span>−₹49.95</span></div>
                <div className="t"><span>Total</span><span>₹949.05</span></div>
              </div>
            </div>
          </div>
          <Text n={4} title="The customer pays online"
            lead={'One tap on "Pay online" opens Shopify\'s checkout with the discount already applied. Nothing to type.'}
            points={['UPI, cards and wallets through Shopify', 'Quantity discounts still apply']} />
        </>
      );
    case 4:
      return (
        <>
          <div className="ccft-vis">
            <div className="ccft-codebox ccft-in" style={d(0)}>
              <span className="ccft-chip ccft-pop" style={d(1)}>PAYNOW-8KQ2</span>
              <ul className="ccft-rules">
                <li className="ccft-in" style={d(3)}><Tick />Works once</li>
                <li className="ccft-in" style={d(4)}><Tick />Only for this product</li>
                <li className="ccft-in" style={d(5)}><Tick />Expires after 24 hours</li>
              </ul>
            </div>
          </div>
          <Text n={5} title="Safe one-time codes"
            lead="Every customer gets their own code, so it can't be shared around. Unused codes are removed from your Shopify Discounts list for you." />
        </>
      );
    case 5:
      return (
        <>
          <div className="ccft-vis">
            <div className="ccft-stats">
              <div className="ccft-stat ccft-in" style={d(0)}><CountUp to={31} still={still} /><span>Prepaid orders</span></div>
              <div className="ccft-stat ccft-in" style={d(1)}><CountUp to={28741} money still={still} /><span>Prepaid sales</span></div>
              <div className="ccft-stat ccft-in" style={d(2)}><CountUp to={42} still={still} /><span>Chose to pay online</span></div>
              <div className="ccft-stat ccft-in" style={d(3)}><CountUp to={1520} money still={still} /><span>Discount given</span></div>
              <div className="ccft-stat wide ccft-in" style={d(4)}>
                <span>This month</span>
                <svg width="110" height="26" viewBox="0 0 110 26" aria-hidden="true"><path d="M0 22 L15 19 L30 20 L45 14 L60 15 L75 9 L90 10 L110 3 L110 26 L0 26 Z" fill="#E8E7FF" /><path d="M0 22 L15 19 L30 20 L45 14 L60 15 L75 9 L90 10 L110 3" fill="none" stroke="#4F46E5" strokeWidth="2" /><circle cx="107.5" cy="3.5" r="2.5" fill="#4F46E5" /></svg>
              </div>
            </div>
          </div>
          <Text n={6} title="See the results"
            lead="The Prepaid offer page shows what it earned you this month. Example numbers shown here."
            points={['Prepaid orders and sales', 'Discount given, and codes used with COD']} />
        </>
      );
    default: {
      const features = plan ? planFeatures(plan).slice(0, 5) : [];
      return (
        <>
          <div className="ccft-vis">
            <div className="ccft-plan ccft-in" style={d(0)}>
              <span className="ccft-lockbig ccft-pop" style={d(2)}><Lock /></span>
              <div className="nm">{plan ? plan.name : 'Paid plan'}</div>
              {plan ? <div><span className="pr">{priceLabel(plan.price)}</span> <span className="per">/month</span></div> : null}
              <div style={{ height: 10 }} />
              <ul>
                {features.map((f, k) => <li key={f} className="ccft-in" style={d(4 + k)}><Tick size={16} />{f}</li>)}
              </ul>
            </div>
          </div>
          <Text n={7} title={`Unlock it with ${plan ? plan.name : 'a paid plan'}`}
            lead={`You are on the Free plan. Upgrade to ${plan ? plan.name : 'a paid plan'} to turn the offer on; you can set it up in a minute.`}
            points={['Billed securely by Shopify', 'Cancel anytime']} />
        </>
      );
    }
  }
}

export default function PrepaidTour({ plan, startAt = 0, onUpgrade, onClose }) {
  const [step, setStep] = useState(Math.min(TOTAL - 1, Math.max(0, startAt)));
  const [paused, setPaused] = useState(false);
  const [still] = useState(prefersReducedMotion);
  const nextBtn = useRef(null);
  const timer = useRef(null);
  const stepStart = useRef(0);
  const remaining = useRef(STEP_MS);
  const last = step === TOTAL - 1;

  // Moves relative to the latest step, so quick repeated clicks each count.
  const move = useCallback((delta) => setStep((s) => Math.min(TOTAL - 1, Math.max(0, s + delta))), []);

  // A new step starts its full time.
  useEffect(() => { remaining.current = STEP_MS; }, [step]);

  // Plays by itself, except on the last step, while paused, and for reduced motion.
  useEffect(() => {
    clearTimeout(timer.current);
    if (still || paused || last) return undefined;
    stepStart.current = Date.now();
    timer.current = setTimeout(() => move(1), remaining.current);
    return () => {
      clearTimeout(timer.current);
      remaining.current = Math.max(400, remaining.current - (Date.now() - stepStart.current));
    };
  }, [step, paused, last, still, move]);

  useEffect(() => {
    if (nextBtn.current) {
      try { nextBtn.current.focus({ preventScroll: true }); } catch { nextBtn.current.focus(); }
    }
  }, []);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'ArrowLeft') move(-1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, move]);

  return (
    <div className="ccft-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{CSS}</style>
      <div
        className={`ccft-dialog${paused ? ' paused' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ccft-title"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="ccft-dh">
          <div>
            <div className="ccft-ey">Prepaid offer <span className="ccft-lk"><Lock size={9} />{plan ? plan.name : 'Paid'}</span></div>
            <h2 id="ccft-title">{last ? 'Unlock the Prepaid offer' : 'How the Prepaid offer works'}</h2>
          </div>
          <button type="button" className="ccft-x" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="ccft-progress" aria-hidden="true">
          {Array.from({ length: TOTAL }, (_, k) => (
            <div key={`${k}-${k === step ? step : 'x'}`} className={`ccft-seg${k < step ? ' done' : ''}${k === step ? ' cur' : ''}${k === step && last ? ' last' : ''}${still ? ' still' : ''}`}><span /></div>
          ))}
        </div>

        <div className="ccft-body" aria-live="polite">
          <section key={step} className="ccft-step" data-testid="tour-step" data-step={step + 1}>
            <StepBody index={step} plan={plan} still={still} />
          </section>
        </div>

        <div className="ccft-df">
          <span className="ccft-count">{step + 1} / {TOTAL}</span>
          <button type="button" className="ccft-skip" onClick={onClose}>{last ? 'Maybe later' : 'Skip tour'}</button>
          <span className="ccft-sp" />
          {step > 0 ? <button type="button" className="ccft-btn s" onClick={() => move(-1)}>Back</button> : null}
          <button
            ref={nextBtn}
            type="button"
            className="ccft-btn p"
            onClick={() => (last ? onUpgrade() : move(1))}
          >
            {last ? (plan ? `Upgrade to ${plan.name}` : 'Upgrade plan') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
