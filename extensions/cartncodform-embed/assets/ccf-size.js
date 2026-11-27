/* ccf-size.js — "Find my size", CartnCodForm.
   Classes prefixed .ccf-sf-*. Settings + charts from the App Proxy; the size itself is worked out
   on the backend (POST /apps/cartncodform/size-finder/recommend). Height and weight stay on this
   device (localStorage, to pre-fill next time) and are sent only for the calculation.
   Look: a full-width "Find my ideal size" button under the sizes opens a "Try it on me"-style sheet
   (bottom sheet on phones, centred card on desktop) with a 4-step stepper:
     1. Choose your avatar base (Man / Woman)   2. Height and weight   3. Choose your build
     4. Creating your avatar (short animation while the size is worked out)  → Result: avatar, product,
     "Recommended size" list (fits close / recommended / roomy) and Add to cart.
   Shoes / rings / bangles stores (settings.measure) get a 2-step flow instead: 1. Measure (drawing,
   how-to, one slider — or a ring/bangle that fits) → Result with the product picture.
   Baby & kids clothes (settings.baby) use the same 2 steps: the baby's length + weight, or age only,
   and "Fits now / Room to grow".
   The admin's live preview (SizeFinderPreview.jsx) mirrors this design. */
(function () {
  'use strict';

  var PROXY = '/apps/cartncodform/size-finder';
  var CM_PER_IN = 2.54;
  var KG_PER_LB = 0.45359237;
  var SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var HANGER = SVG + '<path d="M12 6a2 2 0 1 1 2 2c-1 .4-2 1-2 2.2V11"/><path d="M12 11 3.5 17a1.5 1.5 0 0 0 .9 2.7h15.2a1.5 1.5 0 0 0 .9-2.7L12 11z"/></svg>';
  var CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
  var CHEV = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  var BACK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  var INFO = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>';
  var RULER = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15 15 3l6 6L9 21z"/><path d="m7 11 2 2M10 8l2 2M13 5l2 2"/></svg>';
  var PEN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
  var LOCK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  var SHIRT = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3z"/></svg>';
  // Button icon per kind of store, and the drawing on the measure screen (same as the admin preview).
  var TYPE_ICONS = {
    baby: SVG + '<path d="M9 3h6l1 3 4 2-2 4-2-1v9H8v-9l-2 1-2-4 4-2z"/><path d="M10 6c.6.7 1.2 1 2 1s1.4-.3 2-1"/></svg>',
    shoes: SVG + '<path d="M3 16.5V8.5c0-.8.7-1.5 1.5-1.5H7l2 3.5c.9 1.6 2.6 2.5 4.4 2.5H15l4 1.2c1.2.4 2 1.4 2 2.6v.7H3z"/><path d="M3 19h18"/></svg>',
    rings: SVG + '<circle cx="12" cy="14.5" r="6"/><path d="M9.5 8.8 8 5.5h8l-1.5 3.3"/><path d="M10 5.5 12 3l2 2.5"/></svg>',
    bangles: SVG + '<ellipse cx="12" cy="12" rx="8.5" ry="4.5"/><ellipse cx="12" cy="12" rx="5.5" ry="2.6"/></svg>',
  };
  function measureArt(type, accent) {
    var a = accent;
    var out = '<svg width="160" height="90" viewBox="0 0 160 90" aria-hidden="true" fill="none">';
    if (type === 'shoes') {
      out += '<rect x="8" y="64" width="144" height="16" rx="4" fill="#F3F4F6" stroke="#D1D5DB"/>';
      for (var i = 0; i < 14; i++) out += '<path d="M' + (16 + i * 10) + ' 64v' + (i % 2 ? 4 : 7) + '" stroke="#9CA3AF"/>';
      out += '<path d="M22 40c0-10 9-17 24-17h52c14 0 26 5 30 13 3 7-2 14-12 15l-18 2H44c-14 0-22-5-22-13z" fill="#EADFD3" stroke="#C8B6A3"/>';
      [[128, 30, 5], [136, 36, 3.6], [139, 42, 3.2], [139, 48, 2.8], [135, 53, 2.5]].forEach(function (t) {
        out += '<circle cx="' + t[0] + '" cy="' + t[1] + '" r="' + t[2] + '" fill="#EADFD3" stroke="#C8B6A3"/>';
      });
      out += '<path d="M22 58h122" stroke="' + a + '" stroke-width="2"/><path d="M22 54v8M144 54v8" stroke="' + a + '" stroke-width="2"/>';
    } else if (type === 'baby') {
      out += '<rect x="8" y="70" width="144" height="12" rx="4" fill="#F3F4F6" stroke="#D1D5DB"/>';
      for (var k = 0; k < 14; k++) out += '<path d="M' + (16 + k * 10) + ' 70v' + (k % 2 ? 3 : 6) + '" stroke="#9CA3AF"/>';
      out += '<circle cx="34" cy="42" r="11" fill="#F1E4D6" stroke="#D9C2AA"/>' +
        '<path d="M45 34h52c8 0 14 4 18 8l14 2c5 1 5 9 0 10l-14 2c-4 4-10 8-18 8H45c-6 0-9-5-9-15s3-15 9-15z" fill="#DCEBFB" stroke="#A9C7EA"/>' +
        '<path d="M24 62h110" stroke="' + a + '" stroke-width="2"/><path d="M24 58v8M134 58v8" stroke="' + a + '" stroke-width="2"/>';
    } else if (type === 'rings') {
      out += '<rect x="62" y="4" width="34" height="86" rx="17" fill="#F1E4D6" stroke="#D9C2AA"/>' +
        '<path d="M70 18c3 2 15 2 18 0" stroke="#D9C2AA"/>' +
        '<ellipse cx="79" cy="58" rx="20" ry="6" stroke="#D4A24C" stroke-width="4"/>' +
        '<ellipse cx="79" cy="36" rx="20" ry="5.5" stroke="' + a + '" stroke-width="2" stroke-dasharray="4 3"/>' +
        '<path d="M99 36h48" stroke="' + a + '" stroke-width="2" stroke-dasharray="4 3"/>';
      for (var j = 0; j < 5; j++) out += '<path d="M' + (107 + j * 9) + ' 40v6" stroke="#9CA3AF"/>';
    } else {
      out += '<path d="M52 86V50c0-8 2-14 6-18l4-18c1-5 8-5 9 0l1 12 2-16c1-5 8-5 9 0l1 16 2-14c1-5 8-5 9 0l1 16 2-10c1-5 8-4 8 1l-2 26c0 8-2 14-6 18v23z" fill="#F1E4D6" stroke="#D9C2AA" stroke-linejoin="round"/>' +
        '<path d="M44 48h72" stroke="' + a + '" stroke-width="2"/><path d="M44 44v8M116 44v8" stroke="' + a + '" stroke-width="2"/>' +
        '<ellipse cx="80" cy="80" rx="30" ry="7" stroke="#D4A24C" stroke-width="4"/>';
    }
    return out + '</svg>';
  }
  var MALE = SVG + '<circle cx="10" cy="14" r="5"/><path d="M14 10l6-6M15 4h5v5"/></svg>';
  var FEMALE = SVG + '<circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 18h6"/></svg>';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function writeJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  // Clean "try-on" look: white sheet, soft greys, black primary buttons, one accent colour for the
  // product-page button and selections. Phones (≤640px): bottom sheet. Desktop: centred card.
  function injectStyles(accent) {
    if (document.getElementById('ccf-sf-styles')) return;
    var s = document.createElement('style');
    s.id = 'ccf-sf-styles';
    s.textContent = [
      '.ccf-sf *,.ccf-sf-overlay *,.ccf-sf-panel *{box-sizing:border-box}',
      '.ccf-sf{margin:12px 0;font-family:inherit;color:#111;line-height:1.45;-webkit-font-smoothing:antialiased}',
      '.ccf-sf button,.ccf-sf-panel button,.ccf-sf-panel input{font-family:inherit;letter-spacing:normal;text-transform:none;min-height:0;margin:0}',
      // product-page button
      '.ccf-sf-trigger{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:12px 18px;border:1.5px solid ' + accent + ';background:#fff;color:' + accent + ';font-size:15px;font-weight:600;cursor:pointer;transition:background .15s,box-shadow .2s,transform .15s}',
      '.ccf-sf-trigger.is-filled{background:' + accent + ';color:#fff}',
      '.ccf-sf-trigger.is-soft{background:' + accent + '14;border-color:transparent}',
      '.ccf-sf-trigger:hover{box-shadow:0 6px 18px ' + accent + '26}',
      '.ccf-sf-trigger:active{transform:translateY(1px)}',
      '.ccf-sf-trigger:focus-visible{outline:2px solid ' + accent + ';outline-offset:3px}',
      '.ccf-sf-trigger.is-done{justify-content:space-between;background:#F0FDF4;border-color:#86EFAC;color:#14532D}',
      '.ccf-sf-tmain{display:inline-flex;align-items:center;gap:10px}',
      '.ccf-sf-tchange{font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px}',
      '.ccf-sf-caption{margin:6px 0 0;font-size:12px;color:#6B7280;text-align:center}',
      // overlay + sheet
      '.ccf-sf-overlay.ccf-sf-overlay{display:block;position:fixed;inset:0;z-index:2147483000;background:rgba(17,17,17,.45);opacity:0;transition:opacity .25s}',
      '.ccf-sf-overlay[hidden]{display:none}',
      '.ccf-sf-overlay.is-open{opacity:1}',
      '.ccf-sf-panel{position:fixed;z-index:2147483001;left:50%;top:50%;width:min(440px,calc(100vw - 32px));max-height:min(760px,calc(100vh - 40px));display:flex;flex-direction:column;background:#fff;color:#111;border-radius:22px;box-shadow:0 30px 80px rgba(0,0,0,.28);transform:translate(-50%,-46%);opacity:0;transition:transform .3s cubic-bezier(.2,.8,.2,1),opacity .25s;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",sans-serif}',
      '.ccf-sf-panel[hidden]{display:none}',
      '.ccf-sf-panel.is-open{transform:translate(-50%,-50%);opacity:1}',
      '.ccf-sf-panel .ccf-sf-grab{display:none}',
      '.ccf-sf-head{display:grid;grid-template-columns:36px 1fr 36px;align-items:center;padding:14px 14px 6px}',
      '.ccf-sf-htitle{margin:0;text-align:center;font-size:14px;font-weight:600;color:#111}',
      '.ccf-sf-icon-btn{width:34px;height:34px;border:none;border-radius:50%;background:transparent;color:#111;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;line-height:1}',
      '.ccf-sf-icon-btn:hover{background:#F3F4F6}',
      '.ccf-sf-icon-btn:focus-visible,.ccf-sf-row:focus-visible,.ccf-sf-build:focus-visible,.ccf-sf-size:focus-visible{outline:2px solid ' + accent + ';outline-offset:2px}',
      '.ccf-sf-body{flex:1;overflow:auto;padding:4px 22px 8px}',
      '.ccf-sf-foot{padding:12px 22px 16px}',
      // stepper
      '.ccf-sf-stepper{display:flex;align-items:center;justify-content:center;gap:0;margin:2px 0 14px}',
      '.ccf-sf-dot{width:24px;height:24px;border-radius:50%;border:1.5px solid #D1D5DB;color:#9CA3AF;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;background:#fff;flex-shrink:0}',
      '.ccf-sf-dot.is-on{border-color:#111;background:#111;color:#fff}',
      '.ccf-sf-dot.is-done{border-color:#111;background:#111;color:#fff}',
      '.ccf-sf-dot svg{width:12px;height:12px}',
      '.ccf-sf-line{width:34px;height:1.5px;background:#E5E7EB}',
      '.ccf-sf-line.is-done{background:#111}',
      '.ccf-sf-title{margin:0;text-align:center;font-size:19px;font-weight:650;letter-spacing:-.01em;line-height:1.25}',
      '.ccf-sf-lede{margin:4px 0 0;text-align:center;font-size:13px;color:#6B7280}',
      // figure
      '.ccf-sf-figure{display:flex;justify-content:center;align-items:flex-end;margin:12px auto 8px;color:#9CA3AF}',
      '.ccf-sf-figure svg{transition:transform .3s}',
      '.ccf-sf-figure.is-small{margin:8px auto 4px}',
      // step 1 rows
      '.ccf-sf-rows{margin-top:10px;border-top:1px solid #F0F0F0}',
      '.ccf-sf-row{width:100%;display:flex;align-items:center;gap:12px;padding:15px 4px;background:none;border:none;border-bottom:1px solid #F0F0F0;cursor:pointer;color:#111;font-size:15px;font-weight:500;text-align:left}',
      '.ccf-sf-row:hover{background:#FAFAFA}',
      '.ccf-sf-row .ccf-sf-ricon{width:34px;height:34px;border-radius:50%;background:#F3F4F6;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '.ccf-sf-row .ccf-sf-rlabel{flex:1}',
      '.ccf-sf-row .ccf-sf-rchev{color:#9CA3AF;display:flex}',
      '.ccf-sf-row.is-on{font-weight:650}',
      // step 2 sliders
      '.ccf-sf-field{margin:14px 0 6px}',
      '.ccf-sf-frow{display:flex;justify-content:space-between;align-items:center;gap:8px}',
      '.ccf-sf-flabel{font-size:14px;font-weight:600}',
      '.ccf-sf-fval{font-size:14px;font-weight:650;font-variant-numeric:tabular-nums;padding:4px 10px;border:1px solid #E5E7EB;border-radius:8px;min-width:76px;text-align:center}',
      '.ccf-sf-units{display:inline-flex;gap:2px;margin-left:8px}',
      '.ccf-sf-units button{border:none;background:none;padding:2px 6px;border-radius:6px;font-size:11.5px;color:#9CA3AF;cursor:pointer}',
      '.ccf-sf-units button[aria-pressed="true"]{background:#F3F4F6;color:#111;font-weight:600}',
      '.ccf-sf-range{-webkit-appearance:none;appearance:none;width:100%;height:24px;background:transparent;margin:6px 0 0;cursor:pointer}',
      '.ccf-sf-range::-webkit-slider-runnable-track{height:3px;border-radius:3px;background:linear-gradient(90deg,#111 var(--p,50%),#E5E7EB var(--p,50%))}',
      '.ccf-sf-range::-moz-range-track{height:3px;border-radius:3px;background:#E5E7EB}',
      '.ccf-sf-range::-moz-range-progress{height:3px;border-radius:3px;background:#111}',
      '.ccf-sf-range::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;margin-top:-7.5px;border-radius:50%;background:#111;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}',
      '.ccf-sf-range::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#111;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)}',
      '.ccf-sf-minmax{display:flex;justify-content:space-between;font-size:11px;color:#9CA3AF}',
      '.ccf-sf-live{display:flex;justify-content:center;margin:10px 0 0}',
      '.ccf-sf-live span{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:#374151;background:#F3F4F6;border-radius:999px;padding:5px 12px}',
      '.ccf-sf-live b{font-size:13.5px;color:#111}',
      '.ccf-sf-live.is-busy b{opacity:.4}',
      // step 3 build cards
      '.ccf-sf-builds{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}',
      '.ccf-sf-build{position:relative;display:flex;align-items:center;gap:10px;padding:12px;border:1.5px solid #E5E7EB;border-radius:14px;background:#fff;cursor:pointer;text-align:left;color:#111;transition:border-color .15s,box-shadow .15s}',
      '.ccf-sf-build:hover{border-color:#C4C4C4}',
      '.ccf-sf-build[aria-pressed="true"]{border-color:#111;box-shadow:0 0 0 1px #111}',
      '.ccf-sf-bfig{width:26px;display:flex;justify-content:center;color:#6B7280;flex-shrink:0}',
      '.ccf-sf-bcopy{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.ccf-sf-bcopy b{font-size:14px;font-weight:650}',
      '.ccf-sf-bcopy small{font-size:11.5px;color:#6B7280;line-height:1.3}',
      '.ccf-sf-bcheck{position:absolute;top:8px;right:8px;width:18px;height:18px;border-radius:50%;background:#111;color:#fff;display:none;align-items:center;justify-content:center}',
      '.ccf-sf-bcheck svg{width:11px;height:11px}',
      '.ccf-sf-build[aria-pressed="true"] .ccf-sf-bcheck{display:flex}',
      '.ccf-sf-check{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:14px 0 0;padding:10px 12px;border-radius:12px;background:#F9FAFB;cursor:pointer}',
      '.ccf-sf-check b{display:block;font-size:13px}',
      '.ccf-sf-check small{display:block;font-size:11.5px;color:#6B7280}',
      '.ccf-sf-check input{width:18px;height:18px;accent-color:#111;flex-shrink:0}',
      // step 4 creating
      '.ccf-sf-creating{text-align:center;padding:8px 0 4px}',
      '.ccf-sf-shirt{display:flex;justify-content:center;color:#111;margin-bottom:6px}',
      '.ccf-sf-stage{position:relative;display:flex;justify-content:center;align-items:flex-end;height:220px;margin:12px 0 8px}',
      '.ccf-sf-stage svg{position:relative;z-index:1;animation:ccf-sf-breathe 1.6s ease-in-out infinite}',
      '.ccf-sf-pedestal{position:absolute;bottom:-6px;left:50%;width:180px;height:34px;margin-left:-90px;border-radius:50%;border:1.5px solid #D1D5DB;background:radial-gradient(ellipse at center,#F3F4F6 0,#fff 70%)}',
      '@keyframes ccf-sf-breathe{0%,100%{opacity:.75;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}',
      '.ccf-sf-bar{height:3px;border-radius:3px;background:#E5E7EB;overflow:hidden;margin:14px 0 8px}',
      '.ccf-sf-bar span{display:block;height:100%;width:8%;background:#111;border-radius:inherit;transition:width 1.4s cubic-bezier(.3,.7,.3,1)}',
      '.ccf-sf-status{font-size:12.5px;color:#6B7280}',
      // result
      '.ccf-sf-change{display:inline-flex;align-items:center;gap:4px;background:none;border:none;padding:4px 0;color:#111;font-size:13px;font-weight:600;cursor:pointer}',
      '.ccf-sf-result{display:grid;grid-template-columns:40% 1fr;gap:16px;margin-top:10px;align-items:start}',
      '.ccf-sf-avatar{position:relative;border-radius:18px;background:radial-gradient(120% 70% at 50% 18%,#FFFFFF 0,#F4F3F0 55%,#E9E7E2 100%);display:flex;align-items:flex-end;justify-content:center;min-height:262px;padding:14px 0 26px;overflow:hidden;color:#A3A3A3;box-shadow:inset 0 0 0 1px rgba(0,0,0,.04)}',
      '.ccf-sf-avatar svg{position:relative;z-index:1}',
      '.ccf-sf-floor{position:absolute;left:50%;bottom:20px;width:62%;height:14px;transform:translateX(-50%);border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,.16) 0,rgba(0,0,0,0) 70%)}',
      // The product "worn" by the mannequin: no frame; multiply blends the photo's white background away.
      '.ccf-sf-avatar svg{filter:drop-shadow(0 6px 10px rgba(0,0,0,.08))}',
      '.ccf-sf-wearing{position:absolute;z-index:3;top:10px;left:10px;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(17,17,17,.86);color:#fff;font-size:11px;font-weight:650;letter-spacing:.01em}',
      '.ccf-sf-wdot{width:6px;height:6px;border-radius:50%;background:#4ADE80}',
      '.ccf-sf-me{position:absolute;z-index:3;left:8px;right:8px;bottom:8px;display:flex;justify-content:center}',
      '.ccf-sf-me span{padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.92);box-shadow:0 1px 3px rgba(0,0,0,.08);font-size:10.5px;font-weight:600;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ccf-sf-prod{display:flex;gap:10px;align-items:center;padding-bottom:12px;border-bottom:1px solid #F0F0F0}',
      '.ccf-sf-thumb{width:44px;height:44px;border-radius:10px;object-fit:cover;background:#F3F4F6;flex-shrink:0;display:block;border:1px solid #F0F0F0}',
      '.ccf-sf-pname{margin:0;font-size:13px;font-weight:650;line-height:1.3}',
      '.ccf-sf-pprice{margin:2px 0 0;font-size:12px;color:#6B7280}',
      '.ccf-sf-hero{margin:12px 0 0;padding:12px 14px;border-radius:14px;background:#FAFAF9;border:1px solid #EFEEEC}',
      '.ccf-sf-rtitle{margin:0;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6B7280}',
      '.ccf-sf-big{display:flex;align-items:center;gap:10px;margin:4px 0 2px}',
      '.ccf-sf-big{flex-wrap:wrap;row-gap:6px}',
      '.ccf-sf-big b{font-size:34px;line-height:1;font-weight:750;letter-spacing:-.02em;color:#111;white-space:nowrap}',
      '.ccf-sf-big b.is-long{font-size:26px}',
      '.ccf-sf-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:650;background:#DCFCE7;color:#166534}',
      '.ccf-sf-pill svg{width:12px;height:12px}',
      '.ccf-sf-pill.is-alt{background:#FEF3C7;color:#92400E}',
      '.ccf-sf-fit{margin:4px 0 0;font-size:12px;color:#4B5563;line-height:1.4}',
      '.ccf-sf-other{margin:12px 0 6px;font-size:11.5px;font-weight:600;color:#6B7280}',
      '.ccf-sf-sizes{display:flex;gap:6px}',
      '.ccf-sf-size{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 4px;border:1.5px solid #E5E7EB;border-radius:12px;background:#fff;cursor:pointer;color:#111;text-align:center;transition:border-color .15s,background .15s}',
      '.ccf-sf-size:hover{border-color:#9CA3AF}',
      '.ccf-sf-size b{font-size:14px;font-weight:700}',
      '.ccf-sf-size small{font-size:10.5px;color:#6B7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}',
      '.ccf-sf-size.is-rec small{color:#15803D;font-weight:650}',
      '.ccf-sf-size[aria-pressed="true"]{border-color:#111;background:#111;color:#fff}',
      '.ccf-sf-size[aria-pressed="true"] small{color:rgba(255,255,255,.8)}',
      '.ccf-sf-size.is-out{cursor:not-allowed;background:#F9FAFB;border-style:dashed;color:#9CA3AF}',
      '.ccf-sf-size.is-out:hover{border-color:#E5E7EB}',
      '.ccf-sf-size.is-out b{text-decoration:line-through;font-weight:600}',
      '.ccf-sf-size.is-out small{color:#9CA3AF}',
      '.ccf-sf-note{display:flex;gap:8px;align-items:flex-start;margin:12px 0 0;padding:10px 12px;border-radius:12px;background:#F3F4F6;font-size:12px;color:#374151;line-height:1.45}',
      '.ccf-sf-note svg{flex-shrink:0;margin-top:1px}',
      '.ccf-sf-note.is-warn{background:#FFFBEB;color:#78350F}',
      '.ccf-sf-note.is-ok{background:#F0FDF4;color:#14532D}',
      '.ccf-sf-links{display:flex;justify-content:center;gap:8px;margin:14px 0 0}',
      '.ccf-sf-link{display:inline-flex;align-items:center;gap:5px;background:#fff;border:1px solid #E5E7EB;border-radius:999px;padding:6px 12px;color:#111;font-size:12px;font-weight:600;cursor:pointer}',
      '.ccf-sf-link:hover{border-color:#9CA3AF}',
      '.ccf-sf-fine{margin:10px 0 0;text-align:center;font-size:11px;color:#9CA3AF;line-height:1.4}',
      '.ccf-sf-table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}',
      '.ccf-sf-table th{font-size:11px;font-weight:600;color:#6B7280}',
      '.ccf-sf-table th,.ccf-sf-table td{border-bottom:1px solid #F0F0F0;padding:7px 6px;text-align:center}',
      '.ccf-sf-table tr.is-you td{background:#F0FDF4;font-weight:650}',
      // buttons + notes
      '.ccf-sf-main{width:100%;min-height:50px;border:none;border-radius:14px;background:#111;color:#fff;font-size:15px;font-weight:650;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:opacity .15s}',
      '.ccf-sf-panel .ccf-sf-main{min-height:50px;padding:0 16px}',
      '.ccf-sf .ccf-sf-trigger{min-height:48px}',
      '.ccf-sf-panel .ccf-sf-row{min-height:56px}',
      '.ccf-sf-main:hover{opacity:.92}',
      '.ccf-sf-main[disabled]{opacity:.5;cursor:default}',
      '.ccf-sf-main.is-added{background:#15803D}',
      '.ccf-sf-ghost{display:block;margin:10px auto 0;background:none;border:none;color:#374151;font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px;cursor:pointer}',
      '.ccf-sf-privacy{display:flex;align-items:center;justify-content:center;gap:6px;margin:12px 0 0;font-size:11.5px;color:#9CA3AF}',
      '.ccf-sf-err{font-size:13px;color:#B42318;font-weight:500;margin:0 0 12px;background:#FEF2F2;border-radius:10px;padding:9px 12px}',
      // measure flow (shoes / rings / bangles)
      '.ccf-sf-art{display:flex;justify-content:center;margin:12px 0 4px;padding:10px;border-radius:16px;background:linear-gradient(180deg,#FAFAF9,#F3F2EF)}',
      '.ccf-sf-art svg{width:230px;max-width:100%;height:auto}',
      '.ccf-sf-modes{display:flex;gap:4px;background:#F3F4F6;border-radius:12px;padding:4px;margin:12px 0 0}',
      '.ccf-sf-modes button{flex:1;border:0;background:transparent;border-radius:9px;padding:8px 6px;font-size:12.5px;font-weight:600;color:#6B7280;cursor:pointer}',
      '.ccf-sf-modes button[aria-pressed="true"]{background:#fff;color:#111;box-shadow:0 1px 3px rgba(0,0,0,.1)}',
      '.ccf-sf-adj{display:inline-flex;align-items:center;gap:6px}',
      '.ccf-sf-adj button{width:30px;height:30px;border-radius:50%;border:1px solid #E5E7EB;background:#fff;color:#111;font-size:17px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}',
      '.ccf-sf-adj button:hover{border-color:#9CA3AF}',
      '.ccf-sf-fitcards{display:flex;gap:8px;margin:14px 0 0}',
      '.ccf-sf-fitcards button{flex:1;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:10px 12px;border:1.5px solid #E5E7EB;border-radius:12px;background:#fff;color:#111;text-align:left;cursor:pointer}',
      '.ccf-sf-fitcards button b{font-size:13px;font-weight:650}',
      '.ccf-sf-fitcards button small{font-size:11.5px;color:#6B7280}',
      '.ccf-sf-fitcards button[aria-pressed="true"]{border-color:' + accent + ';box-shadow:0 0 0 1px ' + accent + '}',
      '.ccf-sf-howto{margin:12px 0 0;border-radius:12px;background:#F9FAFB;border:1px solid #F0F0F0}',
      '.ccf-sf-howto summary{list-style:none;cursor:pointer;padding:10px 12px;font-size:13px;font-weight:600;display:flex;justify-content:space-between;align-items:center}',
      '.ccf-sf-howto summary::-webkit-details-marker{display:none}',
      '.ccf-sf-howto summary:after{content:"+";font-size:16px;color:#6B7280}',
      '.ccf-sf-howto[open] summary:after{content:"−"}',
      '.ccf-sf-howto ol{margin:0;padding:0 12px 12px 30px;font-size:12.5px;color:#374151;line-height:1.5;display:flex;flex-direction:column;gap:4px}',
      '.ccf-sf-pvis{position:relative;border-radius:18px;background:radial-gradient(120% 70% at 50% 18%,#FFFFFF 0,#F4F3F0 55%,#E9E7E2 100%);min-height:220px;display:flex;align-items:center;justify-content:center;padding:18px 14px 40px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,0,0,.04)}',
      '.ccf-sf-pvis img{max-width:100%;max-height:170px;object-fit:contain;mix-blend-mode:multiply;border:0;border-radius:0;box-shadow:none;background:transparent}',
      '.ccf-sf-pvis .ccf-sf-picon{width:84px;height:84px;border-radius:22px;background:#EDE8E0;color:#6B5B45;display:flex;align-items:center;justify-content:center}',
      '.ccf-sf-pvis .ccf-sf-picon svg{width:40px;height:40px}',
      '.ccf-sf-pvis .ccf-sf-me{position:absolute;left:8px;right:8px;bottom:10px;display:flex;justify-content:center}',
      '.ccf-sf-pvis.is-shoe{flex-direction:column;justify-content:center;gap:10px;padding:46px 12px 44px}',
      '.ccf-sf-pvis .ccf-sf-shoe{width:100%;max-width:250px;height:auto;filter:drop-shadow(0 4px 8px rgba(0,0,0,.08))}',
      '.ccf-sf-toe{width:100%;max-width:220px}',
      '.ccf-sf-pvis.is-baby{flex-direction:column;justify-content:flex-end;gap:8px;padding:40px 12px 44px}',
      '.ccf-sf-pvis .ccf-sf-baby{width:100%;max-width:120px;height:auto;filter:drop-shadow(0 4px 8px rgba(0,0,0,.06))}',
      '.ccf-sf-pvis.is-bangle{flex-direction:column;justify-content:center;gap:8px;padding:40px 12px 44px}',
      '.ccf-sf-pvis .ccf-sf-bangle{width:100%;max-width:140px;height:auto;filter:drop-shadow(0 4px 8px rgba(0,0,0,.08))}',
      '.ccf-sf-pvis.is-ring{flex-direction:column;justify-content:center;gap:8px;padding:40px 12px 44px}',
      '.ccf-sf-pvis .ccf-sf-ring{width:100%;max-width:150px;height:auto;filter:drop-shadow(0 4px 8px rgba(0,0,0,.08))}',
      '.ccf-sf-toebar{position:relative;display:flex;height:6px;border-radius:6px;overflow:visible;gap:2px}',
      '.ccf-sf-toezone{flex:1;border-radius:4px;opacity:.35}',
      '.ccf-sf-toezone.is-tight{background:#F87171}.ccf-sf-toezone.is-right{background:#22C55E}.ccf-sf-toezone.is-roomy{background:#F59E0B}',
      '.ccf-sf-toe.is-tight .is-tight,.ccf-sf-toe.is-right .is-right,.ccf-sf-toe.is-roomy .is-roomy{opacity:1}',
      '.ccf-sf-toemark{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;border:2.5px solid #111;box-shadow:0 1px 3px rgba(0,0,0,.25)}',
      '.ccf-sf-toetext{margin:7px 0 0;text-align:center;font-size:11.5px;font-weight:600;color:#374151}',
      '@media (max-width:640px){.ccf-sf-panel{left:0;right:0;top:auto;bottom:0;width:100%;max-height:92vh;border-radius:22px 22px 0 0;transform:translateY(100%);opacity:1}.ccf-sf-panel.is-open{transform:translateY(0)}.ccf-sf-panel .ccf-sf-grab{display:block;width:38px;height:4px;border-radius:4px;background:#D1D5DB;margin:8px auto 0}.ccf-sf-body{padding:4px 18px 8px}.ccf-sf-foot{padding:10px 18px 16px}.ccf-sf-avatar{min-height:230px}.ccf-sf-big b{font-size:30px}}',
      '@media (prefers-reduced-motion:reduce){.ccf-sf-panel,.ccf-sf-overlay,.ccf-sf-stage svg,.ccf-sf-bar span{transition:none!important;animation:none!important}}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Picking the size on the product page ───────────────────────────────────
  // Themes use radio buttons or a <select> for options. We look for the Size option by name.

  function selectSizeOnPage(optionName, value) {
    var want = String(value).toLowerCase();
    var name = String(optionName || 'size').toLowerCase();
    var done = false;

    var radios = document.querySelectorAll('input[type="radio"]');
    for (var i = 0; i < radios.length && !done; i++) {
      var r = radios[i];
      if (String(r.value).toLowerCase() !== want) continue;
      var fs = r.closest('fieldset');
      var legend = fs && fs.querySelector('legend');
      var ctx = (String(r.name) + ' ' + (legend ? legend.textContent : '')).toLowerCase();
      if (ctx.indexOf(name) === -1 && ctx.indexOf('size') === -1) continue;
      r.checked = true;
      try { r.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
      try { r.click(); } catch (e) {}
      done = true;
    }

    if (!done) {
      var selects = document.querySelectorAll('select');
      for (var j = 0; j < selects.length && !done; j++) {
        var sel = selects[j];
        var label = sel.id && document.querySelector('label[for="' + sel.id + '"]');
        var sctx = (String(sel.name) + ' ' + (label ? label.textContent : '') + ' ' + (sel.getAttribute('aria-label') || '')).toLowerCase();
        if (sctx.indexOf(name) === -1 && sctx.indexOf('size') === -1) continue;
        for (var k = 0; k < sel.options.length; k++) {
          if (String(sel.options[k].value).toLowerCase() === want || String(sel.options[k].text).trim().toLowerCase() === want) {
            sel.value = sel.options[k].value;
            try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
            done = true;
            break;
          }
        }
      }
    }

    // The tier widget's per-item colour/size picker follows this choice.
    try { document.dispatchEvent(new CustomEvent('ccf:size-selected', { detail: { option: optionName, value: value } })); } catch (e) {}
    return done;
  }

  // Button look set in the admin: style (filled / outline / soft) and corner radius (24 = round).
  var TRIGGER_STYLES = { filled: ' is-filled', soft: ' is-soft' };
  function ctaRadius(v) {
    var n = Number(v);
    if (v === undefined || v === null || v === '' || !isFinite(n) || n >= 24) return '999px';
    return Math.max(0, Math.round(n)) + 'px';
  }

  // ── Placement ──────────────────────────────────────────────────────────────
  // Shoppers miss the button when the theme puts the block under the description, so we move it
  // to just below the theme's variant picker (outside it: themes redraw the picker on each change).
  function placeNearSizePicker(root, optionName) {
    var name = String(optionName || 'size').toLowerCase();
    var scope = root.closest('.shopify-section') || document;
    if (!scope.querySelector('form[action*="/cart/add"], fieldset, select')) scope = document;
    var mine = function (n) { return n.closest('[class*="ccf-"]'); };
    var anchor = null;
    var sets = scope.querySelectorAll('fieldset');
    for (var i = 0; i < sets.length && !anchor; i++) {
      var lg = sets[i].querySelector('legend');
      var t = (lg ? lg.textContent : '').toLowerCase();
      if (!mine(sets[i]) && (t.indexOf(name) !== -1 || t.indexOf('size') !== -1)) anchor = sets[i];
    }
    if (!anchor) {
      var sels = scope.querySelectorAll('select');
      for (var j = 0; j < sels.length && !anchor; j++) {
        var sel = sels[j];
        var label = sel.id && document.querySelector('label[for="' + sel.id + '"]');
        var ctx = (String(sel.name) + ' ' + (label ? label.textContent : '') + ' ' + (sel.getAttribute('aria-label') || '')).toLowerCase();
        if (!mine(sel) && (ctx.indexOf(name) !== -1 || ctx.indexOf('size') !== -1)) {
          anchor = sel.closest('.product-form__input, .selector-wrapper') || sel.parentElement;
        }
      }
    }
    if (!anchor) return false;
    var outer = anchor.closest('variant-selects, variant-radios, variant-picker, product-variant-picker, .product-form__variants, .variant-picker');
    if (outer) anchor = outer;
    if (anchor === root || anchor.contains(root) || root.contains(anchor) || !anchor.parentNode) return false;
    anchor.parentNode.insertBefore(root, anchor.nextSibling);
    return true;
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  // Words the store can change in the admin (same defaults as the backend).
  var TEXT_DEFAULTS = {
    womenLabel: 'Woman', menLabel: 'Man', advisorTitle: 'Find my size',
    step1Title: 'Choose your avatar base', step1Text: 'Pick the one closest to you.',
    step2Title: 'Enter your height and weight', step2Text: 'Used only to work out your size.',
    step3Title: 'Choose your build', step3Text: 'Pick the one that looks most like you.',
    creatingTitle: 'Creating your avatar', resultTitle: 'Recommended size', addToBagText: 'Add to cart',
    privacyText: 'Your data stays private and secure',
  };
  var OPTION_DEFAULTS = { liveEstimate: true, rememberSize: true, addToBag: true, sizeChart: true };
  var BUILDS = [
    { value: 'slim', label: 'Slim', hint: 'Lean, narrow frame', sx: 0.86 },
    { value: 'athletic', label: 'Athletic', hint: 'Broad chest, fit waist', sx: 1.02 },
    { value: 'average', label: 'Balanced', hint: 'Average proportions', sx: 1 },
    { value: 'broad', label: 'Broad', hint: 'Wider, fuller frame', sx: 1.18 },
  ];
  var H_MIN = 140, H_MAX = 210, W_MIN = 40, W_MAX = 140;
  // Minimum time the "Creating your avatar" step shows (tests set window.__ccfSizeCreatingMs).
  var CREATING_MS = typeof window.__ccfSizeCreatingMs === 'number' ? window.__ccfSizeCreatingMs : 1700;

  // ── Clothes on the avatar (clothing stores) ──
  // The garment is drawn in the mannequin's own SVG (viewBox 64×160), so it follows height, weight and
  // build. Its fabric is the product photo itself (a centre crop, so prints and colours show through),
  // with shading and seams on top. No AI and no extra requests: the photo is already on the page.
  var GARMENTS = {
    tshirt: {
      body: 'M25 27.5Q32 31.5 39 27.5L46.5 29.5Q50.6 31 51.7 39L52.5 47.2L46.7 48.6L46.2 46.5L45.4 76L46 93Q32 95.2 18 93L18.6 76L17.8 46.5L17.3 48.6L11.5 47.2L12.3 39Q13.4 31 17.5 29.5Z',
      detail: 'M25 27.5Q32 31.5 39 27.5M25.8 28.6Q32 32.4 38.2 28.6M46.7 48.6L52.5 47.2M17.3 48.6L11.5 47.2M18 91.4Q32 93.6 46 91.4M24 33Q26 60 24.5 90M40 33Q38 60 39.5 90',
    },
    shirt: {
      body: 'M25 27.5L32 32.5L39 27.5L46.5 29.5Q50.6 31 51.7 39L53.7 74.5L49.2 75L46.4 47.5L45.4 76L46 94Q32 96 18 94L18.6 76L17.6 47.5L14.8 75L10.3 74.5L12.3 39Q13.4 31 17.5 29.5Z',
      detail: 'M25 27.5L28.4 33.4L32 32.5L35.6 33.4L39 27.5M32 32.5V94M49.4 71.3L53.5 70.8M14.6 71.3L10.5 70.8M18 92.4Q32 94.4 46 92.4',
      dots: [[32, 40], [32, 50], [32, 60], [32, 70], [32, 80]],
    },
    kurta: {
      body: 'M25 27.5Q32 32.5 39 27.5L46.5 29.5Q50.6 31 51.7 39L52.9 62L48.3 62.6L46.3 47L45.4 74L47.3 100L49.2 121Q32 123.2 14.8 121L16.7 100L18.6 74L17.7 47L15.7 62.6L11.1 62L12.3 39Q13.4 31 17.5 29.5Z',
      detail: 'M25 27.5Q32 32.5 39 27.5M32 30.6V42M48.3 62.6L52.9 62M15.7 62.6L11.1 62M15.2 117.8Q32 120 48.8 117.8M47.4 104.5L48.5 121M16.6 104.5L15.5 121M26 76L24 118M38 76L40 118',
    },
    dress: {
      body: 'M24.5 28.5Q32 34 39.5 28.5L44.8 29.6L46.2 46L45.4 70Q51.5 97 54.5 124Q32 128 9.5 124Q12.5 97 18.6 70L17.8 46L19.2 29.6Z',
      detail: 'M24.5 28.5Q32 34 39.5 28.5M18.6 70Q32 72.4 45.4 70M27 74L22 124M32 74V126.5M37 74L42 124M10.6 121.4Q32 125.4 53.4 121.4',
    },
    hoodie: {
      body: 'M25 27.5Q32 31 39 27.5L46.5 29.5Q50.6 31 51.7 39L53.8 74.5L49.1 75L46.4 47.5L45.6 78L46.4 96Q32 98 17.6 96L18.4 78L17.6 47.5L14.9 75L10.2 74.5L12.3 39Q13.4 31 17.5 29.5Z',
      extra: ['M21.8 29.8Q32 38 42.2 29.8Q40.6 25.2 32 25.6Q23.4 25.2 21.8 29.8Z'],
      detail: 'M23.5 80H40.5L42.5 90H21.5ZM30 33.5V42M34 33.5V42M49.2 71.5L53.6 71M14.8 71.5L10.4 71M17.8 92.6Q32 94.6 46.2 92.6',
    },
    pants: {
      body: 'M18.8 74H45.2L45.9 90L43.8 152L37.2 152.4L33.4 96H30.6L26.8 152.4L20.2 152L18.1 90Z',
      detail: 'M18.8 77.6H45.2M32 77.6V90M20.2 80.5Q23.4 82.4 23 87M43.8 80.5Q40.6 82.4 41 87M20.4 149H26.7M37.3 149H43.6M25 96L23.6 148M39 96L40.4 148',
    },
    shorts: {
      body: 'M18.8 74H45.2L46 90L45.8 108L35.4 108.6L33.4 96H30.6L28.6 108.6L18.2 108L18 90Z',
      detail: 'M18.8 77.6H45.2M32 77.6V90M20.2 80.5Q23.4 82.4 23 87M43.8 80.5Q40.6 82.4 41 87M18.3 105.6H28.8M35.2 105.6H45.7',
    },
    skirt: {
      body: 'M18.8 72H45.2Q50 96 52.5 117Q32 121 11.5 117Q14 96 18.8 72Z',
      detail: 'M18.8 75.4H45.2M25 76L20 118M32 76V120M39 76L44 118M12.4 114.6Q32 118.4 51.6 114.6',
    },
    saree: {
      body: 'M24.5 28.5Q32 34 39.5 28.5L44.8 29.6L46.2 46L45.4 70Q51.5 97 54.5 124Q32 128 9.5 124Q12.5 97 18.6 70L17.8 46L19.2 29.6Z',
      extra: ['M38.6 28.4L45.2 29.8L34.2 79L26.6 76.4Z'],
      detail: 'M45.2 29.8L34.2 79M38.6 28.4L26.6 76.4M10.6 120.6Q32 124.6 53.4 120.6M10 123Q32 127 54 123M27 80L23 124M33 80V126',
    },
  };
  // Words in the product title / type / tags → garment. First match wins (t-shirt before shirt).
  var GARMENT_WORDS = [
    ['saree', ['saree', 'sari', 'sarees']],
    ['dress', ['dress', 'dresses', 'gown', 'frock', 'maxi', 'anarkali', 'jumpsuit', 'lehenga', 'playsuit']],
    ['kurta', ['kurta', 'kurti', 'kurtas', 'kurtis', 'tunic', 'kaftan', 'sherwani', 'pathani']],
    ['hoodie', ['hoodie', 'hoodies', 'sweatshirt', 'jacket', 'jackets', 'sweater', 'blazer', 'coat', 'cardigan', 'pullover', 'windcheater']],
    ['tshirt', ['t shirt', 'tshirt', 'tshirts', 'tee', 'tees', 'polo', 'top', 'tops', 'tank', 'crop', 'camisole', 'vest', 'jersey']],
    ['shirt', ['shirt', 'shirts', 'blouse', 'blouses', 'overshirt']],
    ['pants', ['jeans', 'jean', 'trouser', 'trousers', 'pant', 'pants', 'joggers', 'pyjama', 'pajama', 'leggings', 'palazzo', 'chinos', 'trackpants', 'cargo']],
    ['shorts', ['shorts', 'bermuda', 'boxers']],
    ['skirt', ['skirt', 'skirts', 'ghagra']],
  ];
  function garmentKind(title, type, tags) {
    var t = ' ' + [title, type, tags].join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
    for (var i = 0; i < GARMENT_WORDS.length; i++) {
      for (var j = 0; j < GARMENT_WORDS[i][1].length; j++) {
        if (t.indexOf(' ' + GARMENT_WORDS[i][1][j] + ' ') !== -1) return GARMENT_WORDS[i][0];
      }
    }
    return 'tshirt';
  }
  function attr(v) { return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  // dress = { kind, image, fit } — fit: −2…2 steps from the recommended size (looser / closer drape).
  function garmentSvg(dress) {
    var g = GARMENTS[dress.kind] || GARMENTS.tshirt;
    var n = Math.floor(Math.random() * 1e6);
    var fab = 'ccfsffab' + n, shade = 'ccfsfsh' + n, light = 'ccfsflt' + n;
    var f = Math.max(-2, Math.min(2, dress.fit || 0));
    var fx = (1 + 0.045 * f).toFixed(3), fy = (1 + 0.015 * f).toFixed(3);
    var out = '<defs>' +
      '<pattern id="' + fab + '" patternContentUnits="objectBoundingBox" width="1" height="1">' +
        '<rect width="1" height="1" fill="#CDBFAA"/>' +
        (dress.image ? '<image href="' + attr(dress.image) + '" x="-0.5" y="-0.25" width="2" height="1.5" preserveAspectRatio="xMidYMid slice"/>' : '') +
      '</pattern>' +
      '<linearGradient id="' + shade + '" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#000" stop-opacity=".26"/><stop offset=".22" stop-color="#fff" stop-opacity=".08"/>' +
        '<stop offset=".5" stop-color="#000" stop-opacity="0"/><stop offset=".78" stop-color="#000" stop-opacity=".06"/>' +
        '<stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>' +
      '<linearGradient id="' + light + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/>' +
        '<stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>' +
      '</defs>' +
      '<g class="ccf-sf-garment" data-kind="' + dress.kind + '" transform="translate(32 64) scale(' + fx + ' ' + fy + ') translate(-32 -64)">';
    var shapes = [g.body].concat(g.extra || []);
    shapes.forEach(function (d) {
      out += '<path d="' + d + '" fill="url(#' + fab + ')"/>' +
        '<path d="' + d + '" fill="url(#' + shade + ')"/><path d="' + d + '" fill="url(#' + light + ')"/>' +
        '<path d="' + d + '" fill="none" stroke="#000" stroke-opacity=".28" stroke-width=".45" stroke-linejoin="round"/>';
    });
    out += '<path d="' + g.detail + '" fill="none" stroke="#000" stroke-opacity=".2" stroke-width=".5" stroke-linecap="round" stroke-linejoin="round"/>';
    (g.dots || []).forEach(function (p) {
      out += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r=".75" fill="#fff" fill-opacity=".85" stroke="#000" stroke-opacity=".3" stroke-width=".25"/>';
    });
    return out + '</g>';
  }

  // ── Shoes "worn" in a shoe shape (shoes & footwear stores) ──
  // Side view, toe to the right, viewBox 220×120 (ground at y≈106). The upper is filled with the product
  // photo (centre crop), shaded, on a sole, with details. Same idea as the clothes on the avatar.
  var SHOES = {
    sneaker: {
      upper: ['M30 92C28 72 33 56 50 49L70 45C79 35 92 31 104 34L113 40C127 52 150 60 176 66C194 70 205 79 205 90L205 92Z'],
      sole: 'M24 91H207C212 91 213 97 211 101C209 105 204 107 198 107H34C28 107 23 103 23 98C23 94 22 91 24 91Z',
      soleFill: '#F6F5F2',
      detail: 'M50 49C59 56 73 58 87 52M108 41L114 50M117 45L122 55M126 50L131 59M135 54L139 63M144 58L147 66M168 67C185 71 197 79 203 89M33 72C33 61 37 54 44 50M62 80C96 86 140 86 182 78M30 97H205',
    },
    boot: {
      upper: ['M40 92L40 30C40 22 46 17 55 17L92 17C99 17 103 22 103 30L105 58C126 63 160 67 180 73C196 78 205 84 205 92Z'],
      sole: 'M34 91H207C212 91 212 99 208 102C205 105 201 107 196 107H66V101H44V107H36C31 107 30 99 34 91Z',
      soleFill: '#3F3A36',
      detail: 'M97 24V58M93 22H101M45 26H98M44 92V40M105 62C128 70 160 74 196 82M40 97H205',
    },
    heel: {
      upper: ['M56 76C64 63 82 58 102 62L150 70C171 74 190 81 202 90L203 94H152C134 86 104 84 82 89C72 91 63 88 56 76Z'],
      sole: 'M52 74L47 106H54L62 86ZM150 93H204C207 93 207 97 204 98H150Z',
      soleFill: '#2F2B28',
      detail: 'M82 89C104 82 132 84 152 93M102 62C112 70 128 74 146 72M60 82L56 104',
    },
    sandal: {
      upper: ['M44 96C44 76 52 64 64 59L69 66C60 71 55 81 55 96Z', 'M70 96C76 72 94 64 114 70L109 77C94 72 80 79 80 96Z', 'M138 96C148 80 171 78 186 90L180 95C170 87 155 87 149 96Z'],
      sole: 'M28 95H205C211 95 212 104 205 106H36C27 106 24 96 28 95Z',
      soleFill: '#C7A27E',
      detail: 'M30 100H205M60 63L66 64M86 71L92 73M158 85L163 88',
    },
    slider: {
      upper: ['M96 96C100 72 150 64 178 78C186 84 189 91 189 96Z'],
      sole: 'M26 95H207C213 95 214 104 207 106H34C25 106 22 96 26 95Z',
      soleFill: '#D9D4CC',
      detail: 'M28 100H206M104 88C130 80 160 80 182 88M120 74L122 95M150 70V95',
    },
    loafer: {
      upper: ['M34 92C32 78 40 66 56 62L100 60C130 62 168 68 192 78C202 84 206 90 206 94Z'],
      sole: 'M28 92H208C212 92 213 98 210 101C207 105 202 106 197 106H64V101H40V106H34C28 106 26 98 28 92Z',
      soleFill: '#4A3A2E',
      detail: 'M112 64C134 60 168 66 186 78M110 67L134 65M118 64V70M56 62C70 70 90 72 104 66M34 97H208',
    },
  };
  var SHOE_WORDS = [
    ['boot', ['boot', 'boots', 'chelsea', 'chukka', 'ankle boot']],
    ['heel', ['heel', 'heels', 'stiletto', 'pump', 'pumps', 'wedge', 'wedges', 'block heel']],
    ['sandal', ['sandal', 'sandals', 'floaters', 'gladiator', 'kolhapuri']],
    ['slider', ['slider', 'sliders', 'slides', 'slipper', 'slippers', 'chappal', 'chappals', 'flip', 'flops', 'crocs', 'clogs']],
    ['loafer', ['loafer', 'loafers', 'formal', 'oxford', 'derby', 'brogue', 'brogues', 'moccasin', 'jutti', 'juttis', 'mojari', 'ballerina', 'flats']],
    ['sneaker', ['sneaker', 'sneakers', 'running', 'sports', 'trainer', 'trainers', 'canvas', 'shoe', 'shoes']],
  ];
  function shoeKind(title, type, tags) {
    var t = ' ' + [title, type, tags].join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
    for (var i = 0; i < SHOE_WORDS.length; i++) {
      for (var j = 0; j < SHOE_WORDS[i][1].length; j++) {
        if (t.indexOf(' ' + SHOE_WORDS[i][1][j] + ' ') !== -1) return SHOE_WORDS[i][0];
      }
    }
    return 'sneaker';
  }
  // shoe = { kind, image, fit } — fit: −2…2 steps from the recommended size (a size longer / shorter).
  function shoeSvg(shoe) {
    var g = SHOES[shoe.kind] || SHOES.sneaker;
    var n = Math.floor(Math.random() * 1e6);
    var fab = 'ccfsfsfab' + n, sh = 'ccfsfssh' + n, gl = 'ccfsfsgl' + n;
    var f = Math.max(-2, Math.min(2, shoe.fit || 0));
    var sx = (1 + 0.035 * f).toFixed(3);
    var out = '<svg class="ccf-sf-shoe" data-kind="' + shoe.kind + '" viewBox="0 0 230 124" aria-hidden="true">' +
      '<defs>' +
      '<pattern id="' + fab + '" patternContentUnits="objectBoundingBox" width="1" height="1">' +
        '<rect width="1" height="1" fill="#B9AE9E"/>' +
        (shoe.image ? '<image href="' + attr(shoe.image) + '" x="-0.5" y="-0.35" width="2" height="1.7" preserveAspectRatio="xMidYMid slice"/>' : '') +
      '</pattern>' +
      '<linearGradient id="' + sh + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>' +
        '<stop offset="1" stop-color="#000" stop-opacity=".26"/></linearGradient>' +
      '<radialGradient id="' + gl + '" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".22"/>' +
        '<stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      '<ellipse cx="117" cy="110" rx="96" ry="7" fill="url(#' + gl + ')"/>' +
      '<g transform="translate(117 0) scale(' + sx + ' 1) translate(-117 0)">' +
      '<path d="' + g.sole + '" fill="' + g.soleFill + '" stroke="#000" stroke-opacity=".22" stroke-width=".8"/>';
    g.upper.forEach(function (d) {
      out += '<path d="' + d + '" fill="url(#' + fab + ')"/><path d="' + d + '" fill="url(#' + sh + ')"/>' +
        '<path d="' + d + '" fill="none" stroke="#000" stroke-opacity=".3" stroke-width=".9" stroke-linejoin="round"/>';
    });
    out += '<path d="' + g.detail + '" fill="none" stroke="#000" stroke-opacity=".24" stroke-width="1" stroke-linecap="round" stroke-dasharray="' + (shoe.kind === 'sneaker' ? '0' : '0') + '"/>' +
      '</g></svg>';
    return out;
  }
  // Toe room = the size's foot length − the shopper's foot (cm) → words + a marker on tight / right / roomy.
  function toeRoom(cm) {
    var v = Math.round(cm * 10) / 10;
    var pos = Math.max(4, Math.min(96, ((v + 1) / 3) * 100)); // −1 cm … +2 cm across the bar
    if (v < 0) return { pos: pos, zone: 'tight', text: Math.abs(v) + ' cm shorter than your foot — tight' };
    if (v <= 1) return { pos: pos, zone: 'right', text: v + ' cm toe room — just right' };
    return { pos: pos, zone: 'roomy', text: v + ' cm toe room — roomy' };
  }

  // ── A ring worn on a finger (ring stores) ──
  // viewBox 160×170: a finger, the band's back half behind it and front half over it, and the setting on
  // top. Band and stone are filled with the product photo (centre crop) with a metal shine and sparkle.
  var RING_WORDS = [
    ['cocktail', ['cocktail', 'statement', 'kundan', 'polki', 'halo', 'cluster', 'antique', 'temple']],
    ['band', ['band', 'bands', 'wedding', 'couple', 'plain', 'eternity', 'toe', 'spinner', 'stackable', 'mens', 'men']],
    ['solitaire', ['solitaire', 'engagement', 'diamond', 'stone', 'gem', 'gemstone', 'zircon', 'cz', 'moissanite', 'ruby', 'emerald', 'sapphire']],
  ];
  function ringKind(title, type, tags) {
    var t = ' ' + [title, type, tags].join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
    for (var i = 0; i < RING_WORDS.length; i++) {
      for (var j = 0; j < RING_WORDS[i][1].length; j++) {
        if (t.indexOf(' ' + RING_WORDS[i][1][j] + ' ') !== -1) return RING_WORDS[i][0];
      }
    }
    return 'solitaire';
  }
  // ring = { kind, image, fit } — fit: −2…2 steps from the recommended size (a size bigger / smaller).
  function ringSvg(ring) {
    var n = Math.floor(Math.random() * 1e6);
    var fab = 'ccfsfrfab' + n, shine = 'ccfsfrsh' + n, gem = 'ccfsfrgem' + n, skin = 'ccfsfrskin' + n;
    var f = Math.max(-2, Math.min(2, ring.fit || 0));
    var k = 1 + 0.04 * f; // ring size relative to the finger
    var cx = 80, cy = 96, rx = 31 * k, ry = 9 * k, w = 6;
    var arc = function (top) {
      var sweepOut = top ? 1 : 0, sweepIn = top ? 0 : 1;
      return 'M' + (cx - rx) + ' ' + cy + 'A' + rx + ' ' + ry + ' 0 0 ' + sweepOut + ' ' + (cx + rx) + ' ' + cy +
        'L' + (cx + rx - w) + ' ' + cy + 'A' + (rx - w) + ' ' + (ry - 2.6) + ' 0 0 ' + sweepIn + ' ' + (cx - rx + w) + ' ' + cy + 'Z';
    };
    var out = '<svg class="ccf-sf-ring" data-kind="' + ring.kind + '" viewBox="0 0 160 170" aria-hidden="true">' +
      '<defs>' +
      '<pattern id="' + fab + '" patternContentUnits="objectBoundingBox" width="1" height="1">' +
        '<rect width="1" height="1" fill="#D4AF6A"/>' +
        (ring.image ? '<image href="' + attr(ring.image) + '" x="-1" y="-1" width="3" height="3" preserveAspectRatio="xMidYMid slice"/>' : '') +
      '</pattern>' +
      '<linearGradient id="' + shine + '" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset=".3" stop-color="#fff" stop-opacity=".55"/>' +
        '<stop offset=".45" stop-color="#fff" stop-opacity=".05"/><stop offset=".7" stop-color="#fff" stop-opacity=".35"/>' +
        '<stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>' +
      '<radialGradient id="' + gem + '" cx=".38" cy=".32" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".85"/>' +
        '<stop offset=".35" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient>' +
      '<linearGradient id="' + skin + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E3CBB2"/>' +
        '<stop offset=".45" stop-color="#F4E6D7"/><stop offset="1" stop-color="#DCC1A6"/></linearGradient>' +
      '</defs>' +
      // band behind the finger
      '<path d="' + arc(true) + '" fill="url(#' + fab + ')"/><path d="' + arc(true) + '" fill="#000" fill-opacity=".25"/>' +
      // finger with nail and knuckle creases
      '<path d="M58 170V34C58 18 68 8 80 8S102 18 102 34V170Z" fill="url(#' + skin + ')" stroke="#C9AE93" stroke-width="1"/>' +
      '<path d="M69 30C69 20 74 15 80 15S91 20 91 30V40C91 44 87 46 80 46S69 44 69 40Z" fill="#F7EDE3" stroke="#D9C2AA" stroke-width=".9"/>' +
      '<path d="M70 64C76 67 84 67 90 64M72 70C77 72 83 72 88 70M70 136C76 139 84 139 90 136" fill="none" stroke="#C9AE93" stroke-width=".9" stroke-linecap="round"/>' +
      // band over the finger
      '<path d="' + arc(false) + '" fill="url(#' + fab + ')"/><path d="' + arc(false) + '" fill="url(#' + shine + ')"/>' +
      '<path d="' + arc(false) + '" fill="none" stroke="#000" stroke-opacity=".3" stroke-width=".8"/>';
    var gy = cy + ry - 3; // the setting sits on the front of the band
    if (ring.kind === 'solitaire') {
      out += '<path d="M73 ' + (gy - 2) + 'L76 ' + (gy - 12) + 'M87 ' + (gy - 2) + 'L84 ' + (gy - 12) + '" stroke="#8C7A5B" stroke-width="1.6" stroke-linecap="round"/>' +
        '<circle cx="80" cy="' + (gy - 10) + '" r="8.5" fill="url(#' + fab + ')" stroke="#000" stroke-opacity=".3" stroke-width=".8"/>' +
        '<circle cx="80" cy="' + (gy - 10) + '" r="8.5" fill="url(#' + gem + ')"/>' +
        '<path d="M80 ' + (gy - 18.5) + 'L80 ' + (gy - 1.5) + 'M71.5 ' + (gy - 10) + 'H88.5M74 ' + (gy - 16) + 'L86 ' + (gy - 4) + 'M86 ' + (gy - 16) + 'L74 ' + (gy - 4) + '" stroke="#fff" stroke-opacity=".45" stroke-width=".6"/>' +
        '<path d="M77 ' + (gy - 15) + 'l1.2 2.4 2.4 1.2-2.4 1.2-1.2 2.4-1.2-2.4-2.4-1.2 2.4-1.2z" fill="#fff"/>';
    } else if (ring.kind === 'cocktail') {
      for (var i = 0; i < 12; i++) {
        var a = (Math.PI * 2 * i) / 12;
        out += '<circle cx="' + (80 + 15 * Math.cos(a)).toFixed(1) + '" cy="' + (gy - 12 + 11 * Math.sin(a)).toFixed(1) + '" r="2.3" fill="#fff" stroke="#8C7A5B" stroke-width=".6"/>';
      }
      out += '<ellipse cx="80" cy="' + (gy - 12) + '" rx="12" ry="9" fill="url(#' + fab + ')" stroke="#000" stroke-opacity=".3" stroke-width=".8"/>' +
        '<ellipse cx="80" cy="' + (gy - 12) + '" rx="12" ry="9" fill="url(#' + gem + ')"/>' +
        '<path d="M76 ' + (gy - 17) + 'l1.4 2.6 2.6 1.4-2.6 1.4-1.4 2.6-1.4-2.6-2.6-1.4 2.6-1.4z" fill="#fff"/>';
    } else {
      out += '<path d="M' + (cx - rx + 9) + ' ' + (cy + 4) + 'Q80 ' + (cy + ry + 1) + ' ' + (cx + rx - 9) + ' ' + (cy + 4) + '" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="1"/>';
    }
    return out + '</svg>';
  }
  // Room = the ring's size around − the shopper's finger (mm).
  function ringRoom(mm) {
    var v = Math.round(mm * 10) / 10;
    var pos = Math.max(4, Math.min(96, ((v + 1.5) / 4.5) * 100)); // −1.5 mm … +3 mm across the bar
    if (v < 0) return { pos: pos, zone: 'tight', text: Math.abs(v) + ' mm smaller than your finger — tight' };
    if (v === 0) return { pos: pos, zone: 'right', text: 'Exact fit — comfortable' };
    if (v <= 1.5) return { pos: pos, zone: 'right', text: v + ' mm room — comfortable' };
    return { pos: pos, zone: 'roomy', text: v + ' mm extra — may slip' };
  }
  // A fit meter: tight / right / roomy zones, a marker and one line of text.
  function fitMeter(fit) {
    var meter = el('div', 'ccf-sf-toe is-' + fit.zone);
    var bar = el('div', 'ccf-sf-toebar');
    bar.appendChild(el('span', 'ccf-sf-toezone is-tight'));
    bar.appendChild(el('span', 'ccf-sf-toezone is-right'));
    bar.appendChild(el('span', 'ccf-sf-toezone is-roomy'));
    var mark = el('i', 'ccf-sf-toemark');
    mark.style.left = fit.pos + '%';
    bar.appendChild(mark);
    meter.appendChild(bar);
    meter.appendChild(el('p', 'ccf-sf-toetext', fit.text));
    return meter;
  }

  // ── Bangles worn on a wrist (bangles & bracelets stores) ──
  // viewBox 160×190: a hand (fingers together, thumb tucked) and forearm; bangles around the wrist with the
  // back half behind the arm and the front half over it, filled with the product photo plus a shine.
  var BANGLE_WORDS = [
    ['bracelet', ['bracelet', 'bracelets', 'chain', 'charm', 'tennis', 'link', 'beaded', 'rakhi']],
    ['kada', ['kada', 'kadas', 'kara', 'cuff', 'cuffs', 'kangan', 'broad', 'thick']],
    ['set', ['set', 'sets', 'chudi', 'churi', 'chooda', 'chura', 'glass', 'lac', 'pair', 'stack']],
    ['bangle', ['bangle', 'bangles']],
  ];
  function bangleKind(title, type, tags) {
    var t = ' ' + [title, type, tags].join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
    for (var i = 0; i < BANGLE_WORDS.length; i++) {
      for (var j = 0; j < BANGLE_WORDS[i][1].length; j++) {
        if (t.indexOf(' ' + BANGLE_WORDS[i][1][j] + ' ') !== -1) return BANGLE_WORDS[i][0];
      }
    }
    return 'bangle';
  }
  // bangle = { kind, image, fit } — fit: −2…2 steps from the recommended size (a size bigger / smaller).
  function bangleSvg(b) {
    var n = Math.floor(Math.random() * 1e6);
    var fab = 'ccfsfbfab' + n, shine = 'ccfsfbsh' + n, skin = 'ccfsfbskin' + n;
    var f = Math.max(-2, Math.min(2, b.fit || 0));
    var k = 1 + 0.04 * f;
    var cx = 80, rx = 34 * k, ry = 8.5 * k;
    // One band: back (top) half or front (bottom) half of an elliptical ring, thickness w.
    var band = function (cy, w, top) {
      var so = top ? 1 : 0, si = top ? 0 : 1;
      return 'M' + (cx - rx) + ' ' + cy + 'A' + rx + ' ' + ry + ' 0 0 ' + so + ' ' + (cx + rx) + ' ' + cy +
        'L' + (cx + rx) + ' ' + (cy + w) + 'A' + rx + ' ' + ry + ' 0 0 ' + si + ' ' + (cx - rx) + ' ' + (cy + w) + 'Z';
    };
    var rows = b.kind === 'set' ? [[114, 3.2], [121, 3.2], [128, 3.2], [135, 3.2]]
      : b.kind === 'kada' ? [[116, 12]]
      : b.kind === 'bracelet' ? [[122, 3.5]]
      : [[120, 6]];
    var defs = '<defs>' +
      '<pattern id="' + fab + '" patternContentUnits="objectBoundingBox" width="1" height="1">' +
        '<rect width="1" height="1" fill="#D4AF6A"/>' +
        (b.image ? '<image href="' + attr(b.image) + '" x="-1" y="-1" width="3" height="3" preserveAspectRatio="xMidYMid slice"/>' : '') +
      '</pattern>' +
      '<linearGradient id="' + shine + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".4" stop-color="#fff" stop-opacity=".08"/>' +
        '<stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>' +
      '<linearGradient id="' + skin + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#E3CBB2"/>' +
        '<stop offset=".45" stop-color="#F4E6D7"/><stop offset="1" stop-color="#DCC1A6"/></linearGradient>' +
      '</defs>';
    var out = '<svg class="ccf-sf-bangle" data-kind="' + b.kind + '" viewBox="0 0 160 190" aria-hidden="true">' + defs;
    rows.forEach(function (row) { // backs, behind the arm
      out += '<path d="' + band(row[0], row[1], true) + '" fill="url(#' + fab + ')"/>' +
        '<path d="' + band(row[0], row[1], true) + '" fill="#000" fill-opacity=".3"/>';
    });
    // forearm + hand (fingers together, thumb tucked), knuckle and wrist creases
    out += '<path d="M60 190V112C60 104 58 98 56 92L50 58C48 46 50 36 54 28L57 14C58 9 63 7 66 10L68 22L70 8C71 3 77 3 78 8L79 22L81 6C82 1 88 1 89 6L90 22L92 9C93 4 99 5 99 10L98 30C104 34 108 40 107 48L104 90C102 98 100 104 100 112V190Z" fill="url(#' + skin + ')" stroke="#C9AE93" stroke-width="1"/>' +
      '<path d="M57 64C66 58 72 58 78 63M66 40H74M77 38H86M88 40H96M60 100C72 103 88 103 100 100" fill="none" stroke="#C9AE93" stroke-width=".9" stroke-linecap="round"/>';
    rows.forEach(function (row) { // fronts, over the arm
      var d = band(row[0], row[1], false);
      out += '<path d="' + d + '" fill="url(#' + fab + ')"/><path d="' + d + '" fill="url(#' + shine + ')"/>' +
        '<path d="' + d + '" fill="none" stroke="#000" stroke-opacity=".3" stroke-width=".7"/>';
    });
    if (b.kind === 'kada') {
      for (var i = 1; i < 10; i++) {
        var a = Math.PI * (i / 10);
        out += '<circle cx="' + (cx - rx * Math.cos(a)).toFixed(1) + '" cy="' + (116 + 6 + ry * Math.sin(a)).toFixed(1) + '" r="1.3" fill="#fff" fill-opacity=".75"/>';
      }
    } else if (b.kind === 'bracelet') {
      for (var j = 1; j < 14; j++) {
        var t = Math.PI * (j / 14);
        out += '<ellipse cx="' + (cx - rx * Math.cos(t)).toFixed(1) + '" cy="' + (122 + 1.8 + ry * Math.sin(t)).toFixed(1) + '" rx="2.6" ry="2" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".7"/>';
      }
      out += '<rect x="' + (cx - 4) + '" y="' + (122 + ry - 1) + '" width="8" height="5" rx="1.5" fill="url(#' + fab + ')" stroke="#000" stroke-opacity=".35" stroke-width=".7"/>';
    }
    return out + '</svg>';
  }
  // Room = the bangle's inside width − the shopper's hand (mm).
  function bangleRoom(mm) {
    var v = Math.round(mm * 10) / 10;
    var pos = Math.max(4, Math.min(96, ((v + 2) / 8) * 100)); // −2 mm … +6 mm across the bar
    if (v < 0) return { pos: pos, zone: 'tight', text: Math.abs(v) + ' mm smaller than your hand — hard to slip on' };
    if (v <= 2.5) return { pos: pos, zone: 'right', text: (v === 0 ? 'Exact fit' : v + ' mm room') + ' — slides on, sits well' };
    return { pos: pos, zone: 'roomy', text: v + ' mm extra — loose on the wrist' };
  }

  // ── A baby wearing the product (baby & kids clothes stores) ──
  // viewBox 90×140: a sleeping baby (big head, chubby arms and legs) that grows with length and weight,
  // dressed in the product's outfit shape filled with the product photo, shading and small details.
  var BABY_OUTFITS = {
    romper: {
      body: ['M30 44Q45 49 60 44L66 50L64 60L60 58L61 78Q60 90 52 92L47 86H43L38 92Q30 90 29 78L30 58L26 60L24 50Z'],
      detail: 'M30 44Q45 49 60 44M32 47Q45 52 58 47M60 58L64 60M30 58L26 60M38 92Q45 88 52 92',
      dots: [[45, 80], [42, 85], [48, 85]],
    },
    dress: {
      body: ['M30 44Q45 49 60 44L64 49L62 56L60 55L61 66Q70 84 72 98Q45 104 18 98Q20 84 29 66L30 55L28 56L26 49Z'],
      detail: 'M30 44Q45 49 60 44M29 66Q45 69 61 66M19 95Q45 101 71 95M36 70L30 98M45 70V101M54 70L60 98',
      dots: [[45, 52], [45, 58]],
    },
    top: {
      body: ['M30 44Q45 49 60 44L66 50L64 60L60 58L61 76Q45 80 29 76L30 58L26 60L24 50Z'],
      detail: 'M30 44Q45 49 60 44M37 46L57 74M55 62L50 66M55 62L58 67M29 74Q45 78 61 74',
    },
    set: {
      body: ['M30 44Q45 49 60 44L66 50L64 60L60 58L61 74Q45 78 29 74L30 58L26 60L24 50Z', 'M30 74H60L62 92L48 94L45 86L42 94L28 92Z'],
      detail: 'M30 44Q45 49 60 44M29 72Q45 76 61 72M30 77H60M45 77V86',
    },
    pants: {
      body: ['M30 74H60L60 112L48 114L45 86L42 114L30 112Z'],
      detail: 'M30 77H60M45 77V86M30 109H42M48 109H60',
    },
    kurta: {
      body: ['M30 44Q45 49 60 44L66 50L65 66L61 65L62 98Q45 102 28 98L29 65L25 66L24 50Z'],
      detail: 'M30 44Q45 49 60 44M45 47V62M61 65L65 66M29 65L25 66M29 95Q45 99 61 95M61 84L62 98M29 84L28 98',
      dots: [[45, 51], [45, 55], [45, 59]],
    },
  };
  var BABY_WORDS = [
    ['dress', ['frock', 'frocks', 'dress', 'dresses', 'gown', 'skirt', 'lehenga']],
    ['kurta', ['kurta', 'kurtas', 'kurti', 'sherwani', 'dhoti']],
    ['set', ['set', 'sets', 'co', 'ord', 'combo', 'outfit', 'shorts']],
    ['pants', ['pant', 'pants', 'pyjama', 'pajama', 'joggers', 'leggings', 'trousers', 'jeans']],
    ['top', ['jhabla', 'jabla', 'top', 'tops', 'tee', 'tshirt', 't', 'shirt', 'vest']],
    ['romper', ['romper', 'rompers', 'onesie', 'onesies', 'bodysuit', 'sleepsuit', 'jumpsuit', 'dungaree']],
  ];
  function babyOutfit(title, type, tags) {
    var t = ' ' + [title, type, tags].join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
    for (var i = 0; i < BABY_WORDS.length; i++) {
      for (var j = 0; j < BABY_WORDS[i][1].length; j++) {
        if (t.indexOf(' ' + BABY_WORDS[i][1][j] + ' ') !== -1) return BABY_WORDS[i][0];
      }
    }
    return 'romper';
  }
  // baby = { lengthCm, weightKg, outfit, image, fit }
  function babySvg(baby) {
    var g = BABY_OUTFITS[baby.outfit] || BABY_OUTFITS.romper;
    var n = Math.floor(Math.random() * 1e6);
    var fab = 'ccfsfbbfab' + n, sh = 'ccfsfbbsh' + n, skin = 'ccfsfbbskin' + n;
    var bmi = baby.weightKg / Math.pow(baby.lengthCm / 100, 2);
    var sx = Math.max(0.85, Math.min(1.25, bmi / 16)), sy = Math.max(0.72, Math.min(1.25, baby.lengthCm / 85));
    var f = Math.max(-2, Math.min(2, baby.fit || 0));
    var gx = (1 + 0.05 * f).toFixed(3), gy = (1 + 0.025 * f).toFixed(3);
    var limbs = 'M30 46Q22 50 20 62Q19 70 23 72Q27 72 28 66L31 54Z M60 46Q68 50 70 62Q71 70 67 72Q63 72 62 66L59 54Z' +
      'M31 78Q30 98 32 112Q32 120 38 120Q43 119 43 112L44 82Z M59 78Q60 98 58 112Q58 120 52 120Q47 119 47 112L46 82Z';
    var out = '<svg class="ccf-sf-baby" data-outfit="' + baby.outfit + '" viewBox="0 0 90 140" aria-hidden="true">' +
      '<defs>' +
      '<pattern id="' + fab + '" patternContentUnits="objectBoundingBox" width="1" height="1">' +
        '<rect width="1" height="1" fill="#BFD6EE"/>' +
        (baby.image ? '<image href="' + attr(baby.image) + '" x="-0.5" y="-0.3" width="2" height="1.6" preserveAspectRatio="xMidYMid slice"/>' : '') +
      '</pattern>' +
      '<linearGradient id="' + sh + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".2"/>' +
        '<stop offset=".3" stop-color="#fff" stop-opacity=".12"/><stop offset=".7" stop-color="#000" stop-opacity="0"/>' +
        '<stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>' +
      '<radialGradient id="' + skin + '" cx=".45" cy=".35" r=".75"><stop offset="0" stop-color="#FBE9DA"/>' +
        '<stop offset="1" stop-color="#EBC9AC"/></radialGradient>' +
      '</defs>' +
      '<ellipse cx="45" cy="131" rx="26" ry="4" fill="#000" fill-opacity=".1"/>' +
      '<g transform="translate(45 124) scale(' + sx.toFixed(3) + ' ' + sy.toFixed(3) + ') translate(-45 -124)">' +
      // body: limbs, torso, feet, then the outfit, then the head on top
      '<path d="' + limbs + '" fill="url(#' + skin + ')" stroke="#D9B89A" stroke-width=".7"/>' +
      '<path d="M30 44Q45 40 60 44L62 78Q45 84 28 78Z" fill="url(#' + skin + ')" stroke="#D9B89A" stroke-width=".7"/>' +
      '<ellipse cx="37" cy="121" rx="7" ry="4" fill="url(#' + skin + ')" stroke="#D9B89A" stroke-width=".7"/>' +
      '<ellipse cx="53" cy="121" rx="7" ry="4" fill="url(#' + skin + ')" stroke="#D9B89A" stroke-width=".7"/>' +
      '<g class="ccf-sf-outfit" transform="translate(45 70) scale(' + gx + ' ' + gy + ') translate(-45 -70)">';
    g.body.forEach(function (d) {
      out += '<path d="' + d + '" fill="url(#' + fab + ')"/><path d="' + d + '" fill="url(#' + sh + ')"/>' +
        '<path d="' + d + '" fill="none" stroke="#000" stroke-opacity=".25" stroke-width=".6" stroke-linejoin="round"/>';
    });
    out += '<path d="' + g.detail + '" fill="none" stroke="#000" stroke-opacity=".2" stroke-width=".6" stroke-linecap="round"/>';
    (g.dots || []).forEach(function (p) {
      out += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="1" fill="#fff" fill-opacity=".9" stroke="#000" stroke-opacity=".25" stroke-width=".3"/>';
    });
    out += '</g>' +
      '<circle cx="27" cy="27" r="4" fill="url(#' + skin + ')" stroke="#D9B89A" stroke-width=".7"/>' +
      '<circle cx="63" cy="27" r="4" fill="url(#' + skin + ')" stroke="#D9B89A" stroke-width=".7"/>' +
      '<circle cx="45" cy="26" r="18" fill="url(#' + skin + ')" stroke="#D9B89A" stroke-width=".7"/>' +
      '<path d="M40 9Q45 4 49 9Q46 7 44 10" fill="none" stroke="#8B6B52" stroke-width="1.2" stroke-linecap="round"/>' +
      '<path d="M36 27Q39 29.5 42 27M48 27Q51 29.5 54 27" fill="none" stroke="#6B4F3A" stroke-width="1.1" stroke-linecap="round"/>' +
      '<path d="M41 34Q45 37 49 34" fill="none" stroke="#C0705E" stroke-width="1.1" stroke-linecap="round"/>' +
      '<circle cx="34" cy="32" r="2.6" fill="#F4A6A0" fill-opacity=".45"/><circle cx="56" cy="32" r="2.6" fill="#F4A6A0" fill-opacity=".45"/>' +
      '</g></svg>';
    return out;
  }
  // Grow meter: by length (cm left in the size) or by age (months left in the size).
  function babyRoom(left, byAge) {
    var v = Math.round(left * 10) / 10;
    if (byAge) {
      var pos = Math.max(4, Math.min(96, ((v + 3) / 12) * 100));
      if (v <= 0) return { pos: pos, zone: 'tight', text: 'Outgrown — ' + Math.abs(v) + ' months past this size' };
      if (v <= 3) return { pos: pos, zone: 'right', text: v + (v === 1 ? ' month' : ' months') + ' left in this size — fits now' };
      return { pos: pos, zone: 'roomy', text: v + ' months to grow into' };
    }
    var p = Math.max(4, Math.min(96, ((v + 3) / 11) * 100));
    if (v < 0) return { pos: p, zone: 'tight', text: Math.abs(v) + ' cm longer than this size — too small' };
    if (v <= 4) return { pos: p, zone: 'right', text: v + ' cm room — fits now' };
    return { pos: p, zone: 'roomy', text: v + ' cm room to grow' };
  }
  // Rough length / weight for an age in months, to draw the baby when only the age is known.
  function babyFromAge(m) {
    var len = m <= 12 ? 50 + m * 2.2 : 76.4 + (m - 12) * 0.9;
    var wt = m <= 12 ? 3.3 + m * 0.55 : 9.9 + (m - 12) * 0.2;
    return { lengthCm: len, weightKg: wt };
  }

  // A soft, filled mannequin. Wider with body-mass index and the chosen build, taller with height.
  // With dress = { kind, image, fit } it wears that garment. gender 'women' = narrower shoulders, a waist,
  // fuller hips and a hair bun; anything else = the broader-shouldered figure.
  var WOMAN_BODY = 'M21 31c3-2.6 7-3.5 11-3.5s8 .9 11 3.5c2.6 2 3.6 4.8 4 8.2l2.3 33c.2 3-1.4 5-3.3 5s-3.1-1.6-3.4-4L43 47c-.4 5-2 10-2 15 0 6 4.5 13 4.5 22l-2.2 69c-.1 3-2 4.5-4.2 4.5s-4-1.6-4-4.4L33.5 96h-3L29 153.1c0 2.8-1.8 4.4-4 4.4s-4.1-1.5-4.2-4.5l-2.2-69c0-9 4.5-16 4.5-22 0-5-1.6-10-2-15l-1.6 26c-.3 2.4-1.6 4-3.4 4s-3.5-2-3.3-5l2.3-33c.4-3.4 1.4-6.2 4-8.2z';
  function figureSvg(heightCm, weightKg, build, size, dress, gender) {
    var woman = gender === 'women';
    var bmi = weightKg / Math.pow(heightCm / 100, 2);
    var b = BUILDS.filter(function (x) { return x.value === build; })[0];
    var sx = Math.max(0.8, Math.min(1.4, (bmi / 22) * (b ? b.sx : 1)));
    var sy = Math.max(0.88, Math.min(1.08, heightCm / 172));
    var h = size || 160;
    var w = Math.round(h * 0.42);
    var id = 'ccfsfg' + Math.floor(Math.random() * 1e6);
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 64 160" aria-hidden="true" data-gender="' + (woman ? 'women' : 'men') + '" style="transform:scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ');transform-origin:50% 100%">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B8B8B6"/><stop offset=".5" stop-color="#D9D9D7"/><stop offset="1" stop-color="#A8A8A6"/></linearGradient></defs>' +
      '<g fill="url(#' + id + ')">' +
      (woman
        ? '<circle cx="32" cy="2.8" r="4.3"/><ellipse cx="32" cy="13.4" rx="8.4" ry="10"/><path d="M29 23h6v5h-6z"/><path d="' + WOMAN_BODY + '"/>'
        : '<ellipse cx="32" cy="13" rx="9" ry="10.5"/><path d="M28 23h8v5h-8z"/>' +
      '<path d="M18 30c4-3 9-3.5 14-3.5s10 .5 14 3.5c3 2 4 5 4.5 9l2.5 34c.2 3-1.5 5-3.5 5s-3.3-1.6-3.6-4L46 46l-1 30c0 6 .5 10 .5 14l-2 63c-.1 3-2 4.5-4.3 4.5s-4-1.6-4-4.4L33.5 94h-3L29 153c0 2.8-1.8 4.4-4 4.4s-4.2-1.5-4.3-4.5l-2-63c0-4 .5-8 .5-14l-1-30-2.4 28c-.3 2.4-1.6 4-3.6 4s-3.7-2-3.5-5l2.5-34c.5-4 1.5-7 4.5-9z"/>') +
      '</g>' + (dress ? garmentSvg(dress) : '') + '</svg>';
  }

  function init(root, settings) {
    var shop = root.getAttribute('data-shop') || '';
    var sizeOption = root.getAttribute('data-size-option') || 'Size';
    var sizeValues = (root.getAttribute('data-size-values') || '').split('|').filter(Boolean);
    var product = {
      title: root.getAttribute('data-product-title') || '',
      type: root.getAttribute('data-product-type') || '',
      price: root.getAttribute('data-product-price') || '',
      image: root.getAttribute('data-product-image') || '',
    };
    if (product.image.indexOf('//') === 0) product.image = 'https:' + product.image;
    product.babyOutfit = babyOutfit(product.title, product.type, (root.getAttribute('data-tags') || '').replace(/\|/g, ' '));
    product.bangle = bangleKind(product.title, product.type, (root.getAttribute('data-tags') || '').replace(/\|/g, ' '));
    product.ring = ringKind(product.title, product.type, (root.getAttribute('data-tags') || '').replace(/\|/g, ' '));
    product.shoe = shoeKind(product.title, product.type, (root.getAttribute('data-tags') || '').replace(/\|/g, ' '));
    product.garment = garmentKind(product.title, product.type, (root.getAttribute('data-tags') || '').replace(/\|/g, ' '));
    var accent = /^#[0-9A-Fa-f]{6}$/.test(settings.accentColor || '') ? settings.accentColor : '#111827';
    var genders = Array.isArray(settings.genders) ? settings.genders : [];
    // Shoes / rings / bangles: one measurement instead of height, weight and build.
    var M = settings.measure && settings.storeType && settings.storeType !== 'clothing' && Array.isArray(settings.measure.chart)
      ? settings.measure : null;
    // Baby & kids clothes: length + weight (or age); shown with the same 2-step layout.
    var BB = settings.storeType === 'baby' && settings.baby && Array.isArray(settings.baby.chart) ? settings.baby : null;
    if (BB) {
      M = {
        chart: BB.chart, title: BB.title, text: BB.text, howTo: BB.howTo, fit: BB.fit,
        value: 'Length', unit: 'cm', min: BB.length.min, max: BB.length.max, step: BB.length.step, start: BB.length.start,
      };
    }
    if (M ? !M.chart.length : !genders.length) { root.remove(); return; }
    var texts = settings.texts || {};
    function T(key, size) {
      var v = typeof texts[key] === 'string' && texts[key].trim() ? texts[key].trim() : TEXT_DEFAULTS[key];
      return size == null ? v : v.replace(/\{size\}/g, size);
    }
    var opts = {};
    Object.keys(OPTION_DEFAULTS).forEach(function (k) {
      opts[k] = settings.options && typeof settings.options[k] === 'boolean' ? settings.options[k] : OPTION_DEFAULTS[k];
    });

    injectStyles(accent);
    var STORE_KEY = 'ccf_size_answers_' + shop;
    var saved = readJSON(STORE_KEY) || {};
    var state = {
      step: 1, // 1 base · 2 height/weight · 3 build · 4 creating · 5 result
      gender: genders.indexOf(saved.gender) !== -1 ? saved.gender : genders[0],
      heightCm: Number(saved.heightCm) || 165,
      weightKg: Number(saved.weightKg) || 62,
      hUnit: saved.hUnit === 'ft' ? 'ft' : (settings.unit === 'in' ? 'ft' : 'cm'),
      wUnit: saved.wUnit === 'lb' ? 'lb' : 'kg',
      shape: BUILDS.some(function (b) { return b.value === saved.shape; }) ? saved.shape : 'average',
      fit: 'regular',
      remember: false,
      result: null,
      pick: '',
      live: '',
      liveBusy: false,
      busy: false,
      added: false,
      error: '',
      status: '',
      showChart: false,
      // measure flow
      mval: M && Number(saved.mval) >= M.min && Number(saved.mval) <= M.max ? Number(saved.mval) : (M ? M.start : 0),
      aval: M && M.alt && Number(saved.aval) >= M.alt.min && Number(saved.aval) <= M.alt.max ? Number(saved.aval) : (M && M.alt ? M.alt.start : 0),
      mode: M && M.alt && saved.mode === 'alt' ? 'alt' : 'self',
      mUnit: saved.mUnit === 'in' || (!saved.mUnit && settings.unit === 'in') ? 'in' : 'cm',
      // baby
      blen: BB && Number(saved.blen) >= BB.length.min && Number(saved.blen) <= BB.length.max ? Number(saved.blen) : (BB ? BB.length.start : 0),
      bwt: BB && Number(saved.bwt) >= BB.weight.min && Number(saved.bwt) <= BB.weight.max ? Number(saved.bwt) : (BB ? BB.weight.start : 0),
      bage: BB && Number(saved.bage) >= BB.age.min && Number(saved.bage) <= BB.age.max ? Number(saved.bage) : (BB ? BB.age.start : 0),
      bmode: BB && saved.bmode === 'age' ? 'age' : 'measure',
      grow: !!(BB && saved.grow === true),
    };

    var design = root.getAttribute('data-design-mode') === 'true' || !!(window.Shopify && window.Shopify.designMode);
    if (!design) placeNearSizePicker(root, sizeOption);

    // The button on the page
    var wrap = el('div', 'ccf-sf');
    var open = el('button', 'ccf-sf-open ccf-sf-trigger' + (TRIGGER_STYLES[settings.buttonStyle] || ''));
    open.type = 'button';
    open.setAttribute('aria-expanded', 'false');
    open.setAttribute('aria-haspopup', 'dialog');
    open.style.borderRadius = ctaRadius(settings.buttonRadius);
    wrap.appendChild(open);
    var caption = el('p', 'ccf-sf-caption');
    wrap.appendChild(caption);
    root.appendChild(wrap);

    // Sheet (phone) / centred card (desktop), attached to <body> so theme layout can't clip it.
    var overlay = el('div', 'ccf-sf-overlay');
    overlay.hidden = true;
    var panel = el('div', 'ccf-sf-panel');
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', T('advisorTitle'));
    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    function setOpenLabel(size) {
      open.innerHTML = '';
      open.classList.toggle('is-done', !!size);
      var main = el('span', 'ccf-sf-tmain');
      main.innerHTML = size ? CHECK : ((M && TYPE_ICONS[settings.storeType]) || HANGER);
      main.appendChild(el('span', 'ccf-sf-tlabel', size ? 'Your size: ' + size : (settings.buttonText || 'Find my ideal size')));
      open.appendChild(main);
      if (size) open.appendChild(el('span', 'ccf-sf-tchange', 'Change'));
      caption.textContent = size ? '' : (settings.cardText || '');
      caption.hidden = !caption.textContent;
    }
    function sells(size) {
      return !sizeValues.length || sizeValues.some(function (v) { return v.toLowerCase() === String(size).toLowerCase(); });
    }
    setOpenLabel(saved.size && sells(saved.size) ? saved.size : '');

    var lastFocus = null;
    var prevOverflow = '';
    function onKey(e) { if (e.key === 'Escape') close(); }
    function show() {
      lastFocus = document.activeElement;
      state.step = state.result ? 5 : 1;
      state.error = '';
      state.added = false;
      overlay.hidden = false;
      panel.hidden = false;
      prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      open.setAttribute('aria-expanded', 'true');
      document.addEventListener('keydown', onKey);
      draw();
      if (M && state.step === 1) estimateSoon(0);
      requestAnimationFrame(function () { overlay.classList.add('is-open'); panel.classList.add('is-open'); });
      var x = panel.querySelector('.ccf-sf-close');
      if (x) try { x.focus({ preventScroll: true }); } catch (e) {}
    }
    function close() {
      overlay.classList.remove('is-open');
      panel.classList.remove('is-open');
      overlay.hidden = true;
      panel.hidden = true;
      document.documentElement.style.overflow = prevOverflow;
      open.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKey);
      if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
    }
    open.addEventListener('click', function () { if (panel.hidden) show(); else close(); });
    overlay.addEventListener('click', close);

    // ── small builders ──
    function button(cls, text, onClick, label) {
      var b = el('button', cls, text);
      b.type = 'button';
      if (label) b.setAttribute('aria-label', label);
      b.addEventListener('click', onClick);
      return b;
    }
    function go(step) { state.step = step; state.error = ''; draw(); }

    function stepper(current, total) {
      var n = total || 4;
      var s = el('div', 'ccf-sf-stepper');
      s.setAttribute('aria-label', 'Step ' + current + ' of ' + n);
      for (var i = 1; i <= n; i++) {
        var d = el('span', 'ccf-sf-dot' + (i < current ? ' is-done' : i === current ? ' is-on' : ''));
        if (i < current) d.innerHTML = CHECK; else d.textContent = String(i);
        s.appendChild(d);
        if (i < n) s.appendChild(el('span', 'ccf-sf-line' + (i < current ? ' is-done' : '')));
      }
      return s;
    }

    // ── measure flow helpers ──
    function roundTo(v, step) { var k = 1 / (step || 1); return Math.round(v * k) / k; }
    function fmt(v) { var n = Math.round(v * 10) / 10; return (n % 1 === 0 ? String(n) : n.toFixed(1)); }
    // What goes to the backend, in the chart's unit (a ring's inside width → around the finger).
    function measuredValue() {
      var v = state.mode === 'alt' && M.alt
        ? (M.alt.toValue === 'circle' ? Math.PI * state.aval : state.aval)
        : state.mval;
      return Math.round(Math.max(M.min, Math.min(M.max, v)) * 10) / 10;
    }
    function mText(v, unit) {
      if (unit === 'cm' && state.mUnit === 'in') return fmt(v / CM_PER_IN) + ' in';
      return fmt(v) + ' ' + unit;
    }
    // What goes to /recommend for shoes / rings / bangles (one value) or a baby (length + weight, or age).
    function measureBody(extra) {
      var b = !BB ? { value: measuredValue() }
        : state.bmode === 'age' ? { mode: 'age', ageMonths: Math.round(state.bage), grow: state.grow }
        : { mode: 'measure', lengthCm: Math.round(state.blen * 10) / 10, weightKg: Math.round(state.bwt * 10) / 10, grow: state.grow };
      Object.keys(extra || {}).forEach(function (k) { b[k] = extra[k]; });
      return b;
    }
    function babyWeightText(kg) {
      return state.wUnit === 'lb' ? fmt(kg / KG_PER_LB) + ' lb' : fmt(kg) + ' kg';
    }
    function ageText(m) {
      var n = Math.round(m);
      if (n < 12) return n + (n === 1 ? ' month' : ' months');
      var y = Math.floor(n / 12), mo = n % 12;
      return y + (y === 1 ? ' year' : ' years') + (mo ? ' ' + mo + ' m' : '');
    }
    function shortMeasure() {
      if (BB) return state.bmode === 'age' ? 'Age ' + ageText(state.bage) : mText(state.blen, 'cm') + ' · ' + babyWeightText(state.bwt);
      var word = state.mode === 'alt' && M.alt ? (settings.storeType === 'rings' ? 'Ring' : 'Bangle') : M.value.split(' ')[0];
      var shown = state.mode === 'alt' && M.alt ? state.aval : state.mval;
      return word + ' ' + mText(shown, M.unit);
    }

    function unitToggle(options, current, onPick, labelText) {
      var box = el('span', 'ccf-sf-units');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', labelText);
      options.forEach(function (u) {
        var b = button(null, u[1], function () { onPick(u[0]); draw(); });
        b.setAttribute('aria-pressed', u[0] === current ? 'true' : 'false');
        box.appendChild(b);
      });
      return box;
    }

    // One short line on how the suggested size fits.
    var FIT_AREA = { chest: 'chest', waist: 'waist', hip: 'hips', hips: 'hips', shoulder: 'shoulders' };
    var FIT_WORD = { right: 'just right', roomy: 'a little roomy', tight: 'a little snug' };
    function fitText(r, pick, chart, at) {
      if (M && String(pick) === String(r.size)) {
        var st = r.reasons && r.reasons[0] && r.reasons[0].status;
        if (BB) return BB.fit[st] || BB.fit.right;
        return (M.fit && M.fit[st === 'roomy' ? 'roomy' : 'right']) || '';
      }
      if (String(pick) !== String(r.size)) {
        var d = chart.indexOf(String(pick)) - at;
        if (at === -1 || chart.indexOf(String(pick)) === -1 || !d) return '';
        var steps = Math.abs(d) === 1 ? 'One size' : Math.abs(d) + ' sizes';
        return d > 0 ? steps + ' up from ' + r.size + ' — expect a roomier fit.' : steps + ' down from ' + r.size + ' — expect a closer fit.';
      }
      var parts = (r.reasons || []).filter(function (x) { return FIT_AREA[x.area] && FIT_WORD[x.status]; })
        .map(function (x) { return FIT_AREA[x.area].charAt(0).toUpperCase() + FIT_AREA[x.area].slice(1) + ' ' + FIT_WORD[x.status]; });
      return parts.length ? parts.slice(0, 2).join(' · ') : 'Fits your measurements best.';
    }

    function heightText() {
      if (state.hUnit === 'cm') return Math.round(state.heightCm) + ' cm';
      var totalIn = Math.round(state.heightCm / CM_PER_IN);
      return Math.floor(totalIn / 12) + '′ ' + (totalIn % 12) + '″';
    }
    function weightText() {
      return state.wUnit === 'kg' ? Math.round(state.weightKg) + ' kg' : Math.round(state.weightKg / KG_PER_LB) + ' lb';
    }

    // One measurement: label (+ units) and value on top, slider, min / max underneath.
    function measure(label, min, max, get, setv, text, unitEl, minText, maxText, step) {
      var f = el('div', 'ccf-sf-field');
      var top = el('div', 'ccf-sf-frow');
      var lab = el('span', 'ccf-sf-flabel', label);
      if (unitEl) lab.appendChild(unitEl);
      top.appendChild(lab);
      var v = el('span', 'ccf-sf-fval', text());
      v.setAttribute('aria-live', 'polite');
      var input = el('input', 'ccf-sf-range');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step || 1);
      input.value = String(step ? get() : Math.round(get()));
      input.setAttribute('aria-label', label);
      function paintTrack() { input.style.setProperty('--p', ((get() - min) / (max - min)) * 100 + '%'); }
      function changed() {
        v.textContent = text();
        paintTrack();
        redrawFigure();
        estimateSoon(350);
      }
      if (step) {
        // Fine steps (shoes 0.1 cm, rings 0.5 mm): − and + around the value for exact numbers.
        var adj = el('span', 'ccf-sf-adj');
        var minus = button(null, '−', function () { setv(roundTo(Math.max(min, get() - step), step)); input.value = String(get()); changed(); }, 'Less');
        var plus = button(null, '+', function () { setv(roundTo(Math.min(max, get() + step), step)); input.value = String(get()); changed(); }, 'More');
        adj.appendChild(minus);
        adj.appendChild(v);
        adj.appendChild(plus);
        top.appendChild(adj);
      } else {
        top.appendChild(v);
      }
      f.appendChild(top);
      paintTrack();
      input.addEventListener('input', function () {
        setv(Math.max(min, Math.min(max, Number(input.value))));
        changed();
      });
      f.appendChild(input);
      var mm = el('div', 'ccf-sf-minmax');
      mm.appendChild(el('span', null, minText));
      mm.appendChild(el('span', null, maxText));
      f.appendChild(mm);
      return f;
    }

    var figureBox = null;
    function redrawFigure() {
      if (figureBox) figureBox.innerHTML = figureSvg(state.heightCm, state.weightKg, state.step >= 3 ? state.shape : 'average', 96, null, state.gender);
    }

    // Live estimate on step 2 (same backend maths, balanced build + regular fit, never saved).
    var liveTimer = null;
    var liveBox = null;
    function paintLive() {
      if (!liveBox) return;
      liveBox.classList.toggle('is-busy', state.liveBusy);
      var s = liveBox.querySelector('b');
      if (s) s.textContent = state.live || '—';
    }
    function estimateSoon(ms) {
      if (!opts.liveEstimate) return;
      clearTimeout(liveTimer);
      state.liveBusy = true;
      paintLive();
      liveTimer = setTimeout(function () {
        if (!panel.isConnected || panel.hidden || state.step !== (M ? 1 : 2)) { state.liveBusy = false; return; }
        fetch(PROXY + '/recommend?shop=' + encodeURIComponent(shop), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(M ? measureBody({ remember: false, sessionId: '' }) : {
            gender: state.gender, heightCm: Math.round(state.heightCm), weightKg: Math.round(state.weightKg),
            shape: 'average', fit: 'regular', remember: false, sessionId: '',
          }),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) { state.live = d && d.ok && d.size ? d.size : ''; })
          .catch(function () { state.live = ''; })
          .then(function () { state.liveBusy = false; paintLive(); });
      }, ms);
    }

    function chartTable(gender, you) {
      if (BB) {
        var bt = el('table', 'ccf-sf-table');
        var bh = el('tr');
        ['Size', 'Length (' + (state.mUnit === 'in' ? 'in' : 'cm') + ')', 'Weight (' + (state.wUnit === 'lb' ? 'lb' : 'kg') + ')', 'Age'].forEach(function (h) { bh.appendChild(el('th', null, h)); });
        bt.appendChild(bh);
        var prevAge = 0;
        BB.chart.forEach(function (row) {
          var tr = el('tr', String(row.size) === String(you) ? 'is-you' : null);
          tr.appendChild(el('td', null, row.size));
          tr.appendChild(el('td', null, 'up to ' + mText(row.maxLength, 'cm').replace(/ (cm|in)$/, '')));
          tr.appendChild(el('td', null, 'up to ' + babyWeightText(row.maxWeight).replace(/ (kg|lb)$/, '')));
          tr.appendChild(el('td', null, prevAge + '–' + row.maxAge + ' m'));
          prevAge = row.maxAge;
          bt.appendChild(tr);
        });
        return bt;
      }
      if (M) {
        var mt = el('table', 'ccf-sf-table');
        var mh = el('tr');
        var colUnit = M.unit === 'cm' && state.mUnit === 'in' ? 'in' : M.unit;
        mh.appendChild(el('th', null, 'Size'));
        mh.appendChild(el('th', null, M.value + ' (' + colUnit + ')'));
        mt.appendChild(mh);
        M.chart.forEach(function (row) {
          var tr = el('tr', String(row.size) === String(you) ? 'is-you' : null);
          tr.appendChild(el('td', null, row.size));
          tr.appendChild(el('td', null, mText(row.value, M.unit).replace(/ (cm|mm|in)$/, '')));
          mt.appendChild(tr);
        });
        return mt;
      }
      var rows = (settings.charts && settings.charts[gender]) || [];
      var inch = state.hUnit === 'ft';
      var t = el('table', 'ccf-sf-table');
      var head = el('tr');
      ['Size', 'Chest', 'Waist', 'Length'].forEach(function (h) { head.appendChild(el('th', null, h + (h === 'Size' ? '' : inch ? ' (in)' : ' (cm)'))); });
      t.appendChild(head);
      rows.forEach(function (r) {
        var tr = el('tr', String(r.size) === String(you) ? 'is-you' : null);
        tr.appendChild(el('td', null, r.size));
        [r.chest, r.waist, r.length].forEach(function (n) {
          tr.appendChild(el('td', null, !n ? '—' : inch ? (Math.round(n / CM_PER_IN * 10) / 10).toString() : String(n)));
        });
        t.appendChild(tr);
      });
      return t;
    }

    function remember(extra) {
      var prev = readJSON(STORE_KEY) || {};
      writeJSON(STORE_KEY, {
        gender: state.gender, heightCm: state.heightCm, weightKg: state.weightKg,
        hUnit: state.hUnit, wUnit: state.wUnit, shape: state.shape,
        mval: state.mval, aval: state.aval, mode: state.mode, mUnit: state.mUnit,
        blen: state.blen, bwt: state.bwt, bage: state.bage, bmode: state.bmode, grow: state.grow,
        size: extra && extra.size ? extra.size : prev.size,
      });
    }

    function sessionId() {
      try { return localStorage.getItem('ccf_analytics_session_' + shop) || ''; } catch (e) { return ''; }
    }

    // Step 4: show "Creating your avatar" while the size is worked out (at least CREATING_MS).
    var creatingTimers = [];
    function getSize() {
      state.busy = true;
      state.error = '';
      state.result = null;
      state.status = 'Generating…';
      state.step = M ? 1 : 4;
      draw();
      remember();
      var started = Date.now();
      creatingTimers.forEach(clearTimeout);
      creatingTimers = [setTimeout(function () {
        if (state.step !== 4) return;
        state.status = 'Dressing your avatar…';
        var st = panel.querySelector('.ccf-sf-status');
        if (st) st.textContent = state.status;
      }, Math.round(CREATING_MS * 0.55))];
      function finish(fn) {
        if (M) { fn(); return; }
        var wait = Math.max(0, CREATING_MS - (Date.now() - started));
        creatingTimers.push(setTimeout(function () { if (state.step === 4) fn(); }, wait));
      }
      fetch(PROXY + '/recommend?shop=' + encodeURIComponent(shop), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(M ? measureBody({ remember: state.remember, sessionId: state.remember ? sessionId() : '' }) : {
          gender: state.gender, heightCm: Math.round(state.heightCm), weightKg: Math.round(state.weightKg),
          shape: state.shape, fit: state.fit, remember: state.remember, sessionId: state.remember ? sessionId() : '',
        }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          finish(function () {
            state.busy = false;
            if (!res.ok || !res.d || !res.d.ok) {
              state.error = (res.d && res.d.error) || 'Could not work out a size. Try again.';
              state.step = M ? 1 : 3;
            } else {
              state.result = res.d;
              state.pick = closestSold(res.d.size);
              state.step = 5;
            }
            draw();
          });
        })
        .catch(function () {
          finish(function () {
            state.busy = false;
            state.error = 'Could not work out a size. Check your connection and try again.';
            state.step = M ? 1 : 3;
            draw();
          });
        });
    }

    // The recommended size, or — when this product isn't sold in it — the nearest size it is sold in
    // (bigger first, then smaller), so the shopper can still pick and add a size.
    function closestSold(size) {
      if (sells(size)) return String(size);
      var chart = chartSizes();
      var at = chart.indexOf(String(size));
      if (at === -1) return String(size);
      for (var d = 1; d < chart.length; d++) {
        if (at + d < chart.length && sells(chart[at + d])) return chart[at + d];
        if (at - d >= 0 && sells(chart[at - d])) return chart[at - d];
      }
      return String(size);
    }

    // Size names of the chart in use, smallest first.
    function chartSizes() {
      var rows = M ? M.chart : ((settings.charts && settings.charts[state.gender]) || []);
      return rows.map(function (c) { return String(c.size); });
    }

    // The theme's add-to-cart button for this product, if there is one we can press.
    // Themes can have several /cart/add forms (e.g. Dawn's hidden payment-terms form): use the first one that
    // has a submit button — in this product's section first, then anywhere on the page.
    var ADD_WAIT_MS = typeof window.__ccfSizeAddWaitMs === 'number' ? window.__ccfSizeAddWaitMs : 2500;
    var ADD_BTN = 'button[type="submit"][name="add"], button[name="add"], button[type="submit"], input[type="submit"]';
    function addButton() {
      var scopes = [root.closest('.shopify-section'), document];
      for (var i = 0; i < scopes.length; i++) {
        if (!scopes[i]) continue;
        var forms = scopes[i].querySelectorAll('form[action*="/cart/add"]');
        for (var j = 0; j < forms.length; j++) {
          var b = forms[j].querySelector(ADD_BTN);
          if (b) return b;
        }
      }
      return null;
    }

    function chooseSize(size, addToBag) {
      var ok = selectSizeOnPage(sizeOption, size);
      if (!ok) {
        state.error = 'Choose ' + size + ' from the sizes on the page.';
        draw();
        return;
      }
      remember({ size: size });
      setOpenLabel(size);
      if (!addToBag) { close(); return; }
      // Themes swap the variant after the size changes and disable their button while they do (Dawn re-renders
      // the section). Press "Add to cart" once it is enabled again; only if it stays disabled is the size sold out.
      var waited = 0;
      (function tryAdd() {
        var b = addButton();
        if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true') {
          state.added = true;
          draw();
          setTimeout(function () { close(); b.click(); }, 450);
        } else if (waited < ADD_WAIT_MS) {
          waited += 150;
          setTimeout(tryAdd, 150);
        } else {
          state.error = 'Size ' + size + ' is sold out right now.';
          draw();
        }
      })();
    }

    function privacy(foot) {
      var p = el('p', 'ccf-sf-privacy');
      p.innerHTML = LOCK;
      p.appendChild(el('span', null, T('privacyText')));
      foot.appendChild(p);
    }

    // Step 1 for shoes / rings / bangles: drawing, the way to measure, one slider, how-to, remember.
    // Step 1 for baby & kids clothes: length + weight (or age), fits now / room to grow.
    function drawBaby(body, foot, err) {
      body.appendChild(stepper(1, 2));
      body.appendChild(el('h2', 'ccf-sf-title', BB.title));
      body.appendChild(el('p', 'ccf-sf-lede', BB.text));
      var art = el('div', 'ccf-sf-art');
      art.innerHTML = measureArt('baby', accent);
      body.appendChild(art);
      var modes = el('div', 'ccf-sf-modes');
      modes.setAttribute('role', 'group');
      modes.setAttribute('aria-label', 'What you know');
      [['measure', 'Length & weight'], ['age', 'Age only']].forEach(function (m) {
        var b = button(null, m[1], function () { state.bmode = m[0]; state.live = ''; draw(); estimateSoon(0); });
        b.setAttribute('aria-pressed', state.bmode === m[0] ? 'true' : 'false');
        modes.appendChild(b);
      });
      body.appendChild(modes);
      if (state.bmode === 'age') {
        body.appendChild(measure(BB.age.label, BB.age.min, BB.age.max,
          function () { return state.bage; }, function (v) { state.bage = v; },
          function () { return ageText(state.bage); }, null, 'Newborn', '6 years', BB.age.step));
      } else {
        body.appendChild(measure(BB.length.label, BB.length.min, BB.length.max,
          function () { return state.blen; }, function (v) { state.blen = v; },
          function () { return mText(state.blen, 'cm'); },
          unitToggle([['cm', 'cm'], ['in', 'in']], state.mUnit, function (u) { state.mUnit = u; }, 'Length unit'),
          mText(BB.length.min, 'cm'), mText(BB.length.max, 'cm'), BB.length.step));
        body.appendChild(measure(BB.weight.label, BB.weight.min, BB.weight.max,
          function () { return state.bwt; }, function (v) { state.bwt = v; },
          function () { return babyWeightText(state.bwt); },
          unitToggle([['kg', 'kg'], ['lb', 'lb']], state.wUnit, function (u) { state.wUnit = u; }, 'Weight unit'),
          babyWeightText(BB.weight.min), babyWeightText(BB.weight.max), BB.weight.step));
      }
      var fits = el('div', 'ccf-sf-fitcards');
      fits.setAttribute('role', 'group');
      fits.setAttribute('aria-label', 'Fit');
      [[false, 'Fits now', 'The right size for today'], [true, 'Room to grow', 'One size up, lasts longer']].forEach(function (f) {
        var b = button(null, null, function () { state.grow = f[0]; draw(); estimateSoon(0); }, f[1]);
        b.setAttribute('aria-pressed', state.grow === f[0] ? 'true' : 'false');
        b.appendChild(el('b', null, f[1]));
        b.appendChild(el('small', null, f[2]));
        fits.appendChild(b);
      });
      body.appendChild(fits);
      if (opts.liveEstimate) {
        liveBox = el('div', 'ccf-sf-live');
        liveBox.setAttribute('aria-live', 'polite');
        var chip = el('span', null, 'Likely size ');
        chip.appendChild(el('b', null, state.live || '—'));
        liveBox.appendChild(chip);
        body.appendChild(liveBox);
        paintLive();
      }
      if (state.bmode !== 'age' && BB.howTo && BB.howTo.length) {
        var how = el('details', 'ccf-sf-howto');
        how.appendChild(el('summary', null, 'How to measure your baby'));
        var ol = el('ol');
        BB.howTo.forEach(function (h) { ol.appendChild(el('li', null, h)); });
        how.appendChild(ol);
        body.appendChild(how);
      }
      if (opts.rememberSize) {
        var lbl = el('label', 'ccf-sf-check');
        var txt = el('span');
        txt.appendChild(el('b', null, 'Remember my baby’s size'));
        txt.appendChild(el('small', null, 'We save only the size, never the length, weight or age.'));
        lbl.appendChild(txt);
        var cb = el('input');
        cb.type = 'checkbox';
        cb.checked = state.remember;
        cb.setAttribute('aria-label', 'Remember my size');
        cb.addEventListener('change', function () { state.remember = cb.checked; });
        lbl.appendChild(cb);
        body.appendChild(lbl);
      }
      if (err) foot.appendChild(err);
      var go2 = button('ccf-sf-main', state.busy ? 'Finding the size…' : 'Find my baby’s size', getSize);
      go2.disabled = state.busy;
      foot.appendChild(go2);
      privacy(foot);
    }

    function drawMeasure(body, foot, err) {
      if (BB) { drawBaby(body, foot, err); return; }
      body.appendChild(stepper(1, 2));
      body.appendChild(el('h2', 'ccf-sf-title', M.title));
      body.appendChild(el('p', 'ccf-sf-lede', M.text));
      var art = el('div', 'ccf-sf-art');
      art.innerHTML = measureArt(settings.storeType, accent);
      body.appendChild(art);
      if (M.alt) {
        var modes = el('div', 'ccf-sf-modes');
        modes.setAttribute('role', 'group');
        modes.setAttribute('aria-label', 'How to measure');
        [['self', 'Measure yourself'], ['alt', M.alt.label]].forEach(function (m) {
          var b = button(null, m[1], function () { state.mode = m[0]; state.live = ''; draw(); estimateSoon(0); });
          b.setAttribute('aria-pressed', state.mode === m[0] ? 'true' : 'false');
          modes.appendChild(b);
        });
        body.appendChild(modes);
      }
      var alt = state.mode === 'alt' && M.alt;
      var cfg = alt ? M.alt : M;
      var unitEl = null;
      if (M.unit === 'cm') {
        unitEl = unitToggle([['cm', 'cm'], ['in', 'in']], state.mUnit, function (u) { state.mUnit = u; }, 'Unit');
      }
      body.appendChild(measure(
        cfg.value, cfg.min, cfg.max,
        function () { return alt ? state.aval : state.mval; },
        function (v) { if (alt) state.aval = v; else state.mval = v; },
        function () { return mText(alt ? state.aval : state.mval, M.unit); },
        unitEl, mText(cfg.min, M.unit), mText(cfg.max, M.unit), cfg.step || M.step || 0.5
      ));
      if (opts.liveEstimate) {
        liveBox = el('div', 'ccf-sf-live');
        liveBox.setAttribute('aria-live', 'polite');
        var chip = el('span', null, 'Likely size ');
        chip.appendChild(el('b', null, state.live || '—'));
        liveBox.appendChild(chip);
        body.appendChild(liveBox);
        paintLive();
      }
      if (!alt && M.howTo && M.howTo.length) {
        var how = el('details', 'ccf-sf-howto');
        how.appendChild(el('summary', null, 'How to measure'));
        var ol = el('ol');
        M.howTo.forEach(function (h) { ol.appendChild(el('li', null, h)); });
        how.appendChild(ol);
        body.appendChild(how);
      }
      if (opts.rememberSize) {
        var lbl = el('label', 'ccf-sf-check');
        var txt = el('span');
        txt.appendChild(el('b', null, 'Remember my size'));
        txt.appendChild(el('small', null, 'We save only the size, never your measurement.'));
        lbl.appendChild(txt);
        var cb = el('input');
        cb.type = 'checkbox';
        cb.checked = state.remember;
        cb.setAttribute('aria-label', 'Remember my size');
        cb.addEventListener('change', function () { state.remember = cb.checked; });
        lbl.appendChild(cb);
        body.appendChild(lbl);
      }
      if (err) foot.appendChild(err);
      var go2 = button('ccf-sf-main', state.busy ? 'Finding your size…' : 'Find my size', getSize);
      go2.disabled = state.busy;
      foot.appendChild(go2);
      privacy(foot);
    }

    // ── drawing ──
    function draw() {
      panel.innerHTML = '';
      liveBox = null;
      figureBox = null;
      panel.appendChild(el('div', 'ccf-sf-grab'));
      var head = el('div', 'ccf-sf-head');
      var back = null;
      if (state.step === 2 || state.step === 3) {
        back = button('ccf-sf-icon-btn ccf-sf-back', null, function () { go(state.step - 1); }, 'Back');
        back.innerHTML = BACK;
      }
      head.appendChild(back || el('span'));
      head.appendChild(el('p', 'ccf-sf-htitle', T('advisorTitle')));
      head.appendChild(button('ccf-sf-icon-btn ccf-sf-close', '×', close, 'Close'));
      panel.appendChild(head);

      var body = el('div', 'ccf-sf-body');
      panel.appendChild(body);
      var foot = el('div', 'ccf-sf-foot');
      panel.appendChild(foot);

      var err = null;
      if (state.error) {
        err = el('p', 'ccf-sf-err', state.error);
        err.setAttribute('role', 'alert');
      }

      if (M && state.step === 1) {
        drawMeasure(body, foot, err);
      } else if (state.step === 1) {
        body.appendChild(stepper(1));
        body.appendChild(el('h2', 'ccf-sf-title', T('step1Title')));
        body.appendChild(el('p', 'ccf-sf-lede', T('step1Text')));
        var fig1 = el('div', 'ccf-sf-figure');
        fig1.innerHTML = figureSvg(state.heightCm, state.weightKg, 'average', 150, null, state.gender);
        body.appendChild(fig1);
        var rows = el('div', 'ccf-sf-rows');
        rows.setAttribute('role', 'group');
        rows.setAttribute('aria-label', 'Avatar base');
        var order = genders.indexOf('men') !== -1 ? ['men', 'women'] : ['women'];
        order.filter(function (g) { return genders.indexOf(g) !== -1; }).forEach(function (g) {
          var row = button('ccf-sf-row' + (g === state.gender ? ' is-on' : ''), null, function () {
            if (g !== state.gender) state.live = '';
            state.gender = g;
            go(2);
            estimateSoon(0);
          }, g === 'men' ? T('menLabel') : T('womenLabel'));
          var ic = el('span', 'ccf-sf-ricon');
          ic.innerHTML = g === 'men' ? MALE : FEMALE;
          row.appendChild(ic);
          row.appendChild(el('span', 'ccf-sf-rlabel', g === 'men' ? T('menLabel') : T('womenLabel')));
          var ch = el('span', 'ccf-sf-rchev');
          ch.innerHTML = CHEV;
          row.appendChild(ch);
          rows.appendChild(row);
        });
        body.appendChild(rows);
        if (err) foot.appendChild(err);
        privacy(foot);
      } else if (state.step === 2) {
        body.appendChild(stepper(2));
        body.appendChild(el('h2', 'ccf-sf-title', T('step2Title')));
        body.appendChild(el('p', 'ccf-sf-lede', T('step2Text')));
        figureBox = el('div', 'ccf-sf-figure is-small');
        body.appendChild(figureBox);
        redrawFigure();
        var inch = state.hUnit === 'ft';
        body.appendChild(measure('Height', H_MIN, H_MAX, function () { return state.heightCm; }, function (v) { state.heightCm = v; }, heightText,
          unitToggle([['cm', 'cm'], ['ft', 'ft']], state.hUnit, function (u) { state.hUnit = u; }, 'Height unit'),
          inch ? '4′ 7″' : H_MIN + ' cm', inch ? '6′ 11″' : H_MAX + ' cm'));
        var lb = state.wUnit === 'lb';
        body.appendChild(measure('Weight', W_MIN, W_MAX, function () { return state.weightKg; }, function (v) { state.weightKg = v; }, weightText,
          unitToggle([['kg', 'kg'], ['lb', 'lb']], state.wUnit, function (u) { state.wUnit = u; }, 'Weight unit'),
          lb ? Math.round(W_MIN / KG_PER_LB) + ' lb' : W_MIN + ' kg', lb ? Math.round(W_MAX / KG_PER_LB) + ' lb' : W_MAX + ' kg'));
        if (opts.liveEstimate) {
          liveBox = el('div', 'ccf-sf-live');
          liveBox.setAttribute('aria-live', 'polite');
          var chip = el('span', null, 'Likely size ');
          chip.appendChild(el('b', null, state.live || '—'));
          liveBox.appendChild(chip);
          body.appendChild(liveBox);
          paintLive();
        }
        if (err) foot.appendChild(err);
        foot.appendChild(button('ccf-sf-main', 'Continue', function () { go(3); }));
        privacy(foot);
      } else if (state.step === 3) {
        body.appendChild(stepper(3));
        body.appendChild(el('h2', 'ccf-sf-title', T('step3Title')));
        body.appendChild(el('p', 'ccf-sf-lede', T('step3Text')));
        var builds = el('div', 'ccf-sf-builds');
        builds.setAttribute('role', 'group');
        builds.setAttribute('aria-label', 'Build');
        BUILDS.forEach(function (bd) {
          var b = button('ccf-sf-build', null, function () { state.shape = bd.value; draw(); }, bd.label);
          b.setAttribute('aria-pressed', bd.value === state.shape ? 'true' : 'false');
          var f = el('span', 'ccf-sf-bfig');
          f.innerHTML = figureSvg(170, 22 * 2.89 * bd.sx, 'average', 46, null, state.gender);
          b.appendChild(f);
          var c = el('span', 'ccf-sf-bcopy');
          c.appendChild(el('b', null, bd.label));
          c.appendChild(el('small', null, bd.hint));
          b.appendChild(c);
          var ck = el('span', 'ccf-sf-bcheck');
          ck.innerHTML = CHECK;
          b.appendChild(ck);
          builds.appendChild(b);
        });
        body.appendChild(builds);
        if (opts.rememberSize) {
          var lbl = el('label', 'ccf-sf-check');
          var txt = el('span');
          txt.appendChild(el('b', null, 'Remember my size'));
          txt.appendChild(el('small', null, 'We save only the size, never your height or weight.'));
          lbl.appendChild(txt);
          var cb = el('input');
          cb.type = 'checkbox';
          cb.checked = state.remember;
          cb.setAttribute('aria-label', 'Remember my size');
          cb.addEventListener('change', function () { state.remember = cb.checked; });
          lbl.appendChild(cb);
          body.appendChild(lbl);
        }
        if (err) foot.appendChild(err);
        var cont = button('ccf-sf-main', 'Continue', getSize);
        cont.disabled = state.busy;
        foot.appendChild(cont);
        privacy(foot);
      } else if (state.step === 4) {
        var c4 = el('div', 'ccf-sf-creating');
        var shirt = el('div', 'ccf-sf-shirt');
        shirt.innerHTML = SHIRT;
        c4.appendChild(shirt);
        c4.appendChild(el('h2', 'ccf-sf-title', T('creatingTitle')));
        var stage = el('div', 'ccf-sf-stage');
        stage.appendChild(el('span', 'ccf-sf-pedestal'));
        stage.insertAdjacentHTML('beforeend', figureSvg(state.heightCm, state.weightKg, state.shape, 200, null, state.gender));
        c4.appendChild(stage);
        var bar = el('div', 'ccf-sf-bar');
        var fill = el('span');
        bar.appendChild(fill);
        c4.appendChild(bar);
        var st = el('p', 'ccf-sf-status', state.status || 'Generating…');
        st.setAttribute('aria-live', 'polite');
        c4.appendChild(st);
        body.appendChild(c4);
        setTimeout(function () { fill.style.width = '92%'; }, 30);
      } else {
        var r = state.result || {};
        var pick = state.pick || r.size;
        var changeLabel = M ? 'Measure again' : 'Change my avatar';
        var ch2 = button('ccf-sf-change', null, function () { state.result = null; go(1); if (M) estimateSoon(0); }, changeLabel);
        ch2.innerHTML = BACK;
        ch2.appendChild(document.createTextNode(' ' + changeLabel));
        body.appendChild(ch2);

        var grid = el('div', 'ccf-sf-result');
        var av;
        if (M && settings.storeType === 'shoes') {
          // The product as a shoe, with a "Wearing 7" chip and a toe-room meter.
          var shoeSizes = chartSizes();
          var shoeAt = shoeSizes.indexOf(String(r.size));
          av = el('div', 'ccf-sf-pvis is-shoe');
          av.setAttribute('role', 'img');
          av.setAttribute('aria-label', (product.title || 'This shoe') + ' in size ' + pick);
          av.insertAdjacentHTML('beforeend', shoeSvg({
            kind: product.shoe, image: product.image,
            fit: shoeAt === -1 ? 0 : shoeSizes.indexOf(String(pick)) - shoeAt,
          }));
          var sw = el('span', 'ccf-sf-wearing');
          sw.appendChild(el('span', 'ccf-sf-wdot'));
          sw.appendChild(document.createTextNode('Wearing ' + pick));
          av.appendChild(sw);
          var pickRow = M.chart.filter(function (c) { return String(c.size) === String(pick); })[0];
          if (pickRow && state.mode !== 'alt') av.appendChild(fitMeter(toeRoom(pickRow.value - measuredValue())));
          var sme = el('div', 'ccf-sf-me');
          sme.appendChild(el('span', null, shortMeasure()));
          av.appendChild(sme);
        } else if (M && settings.storeType === 'rings') {
          // The ring worn on a finger, with a "Wearing 12" chip and a fit meter.
          var ringSizes = chartSizes();
          var ringAt = ringSizes.indexOf(String(r.size));
          av = el('div', 'ccf-sf-pvis is-ring');
          av.setAttribute('role', 'img');
          av.setAttribute('aria-label', (product.title || 'This ring') + ' in size ' + pick + ' on your finger');
          av.insertAdjacentHTML('beforeend', ringSvg({
            kind: product.ring, image: product.image,
            fit: ringAt === -1 ? 0 : ringSizes.indexOf(String(pick)) - ringAt,
          }));
          var rw = el('span', 'ccf-sf-wearing');
          rw.appendChild(el('span', 'ccf-sf-wdot'));
          rw.appendChild(document.createTextNode('Wearing ' + pick));
          av.appendChild(rw);
          var ringRow = M.chart.filter(function (c) { return String(c.size) === String(pick); })[0];
          if (ringRow) av.appendChild(fitMeter(ringRoom(ringRow.value - measuredValue())));
          var rme = el('div', 'ccf-sf-me');
          rme.appendChild(el('span', null, shortMeasure()));
          av.appendChild(rme);
        } else if (M && settings.storeType === 'bangles') {
          // The bangles worn on a wrist, with a "Wearing 2.6" chip and a fit meter.
          var bSizes = chartSizes();
          var bAt = bSizes.indexOf(String(r.size));
          av = el('div', 'ccf-sf-pvis is-bangle');
          av.setAttribute('role', 'img');
          av.setAttribute('aria-label', (product.title || 'These bangles') + ' in size ' + pick + ' on your wrist');
          av.insertAdjacentHTML('beforeend', bangleSvg({
            kind: product.bangle, image: product.image,
            fit: bAt === -1 ? 0 : bSizes.indexOf(String(pick)) - bAt,
          }));
          var bw = el('span', 'ccf-sf-wearing');
          bw.appendChild(el('span', 'ccf-sf-wdot'));
          bw.appendChild(document.createTextNode('Wearing ' + pick));
          av.appendChild(bw);
          var bRow = M.chart.filter(function (c) { return String(c.size) === String(pick); })[0];
          if (bRow) av.appendChild(fitMeter(bangleRoom(bRow.value - measuredValue())));
          var bme = el('div', 'ccf-sf-me');
          bme.appendChild(el('span', null, shortMeasure()));
          av.appendChild(bme);
        } else if (BB) {
          // The baby wearing the outfit, with a "Wearing 3-6 M" chip and a grow meter.
          var kSizes = chartSizes();
          var kAt = kSizes.indexOf(String(r.size));
          var byAge = state.bmode === 'age';
          var kidBody = byAge ? babyFromAge(state.bage) : { lengthCm: state.blen, weightKg: state.bwt };
          av = el('div', 'ccf-sf-pvis is-baby');
          av.setAttribute('role', 'img');
          av.setAttribute('aria-label', 'Your baby wearing ' + (product.title || 'this outfit') + ' in size ' + pick);
          av.insertAdjacentHTML('beforeend', babySvg({
            lengthCm: kidBody.lengthCm, weightKg: kidBody.weightKg, outfit: product.babyOutfit, image: product.image,
            fit: kAt === -1 ? 0 : kSizes.indexOf(String(pick)) - kAt,
          }));
          var kw = el('span', 'ccf-sf-wearing');
          kw.appendChild(el('span', 'ccf-sf-wdot'));
          kw.appendChild(document.createTextNode('Wearing ' + pick));
          av.appendChild(kw);
          var kRow = BB.chart.filter(function (c) { return String(c.size) === String(pick); })[0];
          if (kRow) av.appendChild(fitMeter(byAge ? babyRoom(kRow.maxAge - Math.round(state.bage), true) : babyRoom(kRow.maxLength - state.blen, false)));
          var kme = el('div', 'ccf-sf-me');
          kme.appendChild(el('span', null, shortMeasure()));
          av.appendChild(kme);
        } else if (M) {
          av = el('div', 'ccf-sf-pvis');
          if (product.image) {
            var pim = el('img');
            pim.src = product.image;
            pim.alt = '';
            pim.loading = 'lazy';
            av.appendChild(pim);
          } else {
            var pic = el('span', 'ccf-sf-picon');
            pic.innerHTML = TYPE_ICONS[settings.storeType] || '';
            av.appendChild(pic);
          }
          var mme = el('div', 'ccf-sf-me');
          mme.appendChild(el('span', null, shortMeasure()));
          av.appendChild(mme);
        } else {
        av = el('div', 'ccf-sf-avatar');
        // The avatar wears this product; another size drapes looser or closer.
        var sizesNow = chartSizes();
        var fitStep = sizesNow.indexOf(String(pick)) - sizesNow.indexOf(String(r.size));
        av.innerHTML = '<span class="ccf-sf-floor"></span>' + figureSvg(state.heightCm, state.weightKg, state.shape, 230,
          { kind: product.garment, image: product.image, fit: sizesNow.indexOf(String(r.size)) === -1 ? 0 : fitStep }, state.gender);
        av.setAttribute('role', 'img');
        av.setAttribute('aria-label', 'Your avatar wearing ' + (product.title || 'this product') + ' in size ' + pick);
        var wearing = el('span', 'ccf-sf-wearing');
        wearing.appendChild(el('span', 'ccf-sf-wdot'));
        wearing.appendChild(document.createTextNode('Wearing ' + pick));
        av.appendChild(wearing);
        }
        if (!M) {
          var me = el('div', 'ccf-sf-me');
          me.appendChild(el('span', null, heightText() + ' · ' + weightText()));
          av.appendChild(me);
        }
        grid.appendChild(av);

        var info = el('div');
        if (product.title) {
          var p = el('div', 'ccf-sf-prod');
          if (product.image) {
            var img = el('img', 'ccf-sf-thumb');
            img.src = product.image;
            img.alt = '';
            img.loading = 'lazy';
            p.appendChild(img);
          } else {
            p.appendChild(el('span', 'ccf-sf-thumb'));
          }
          var pt = el('div');
          pt.appendChild(el('p', 'ccf-sf-pname', product.title));
          if (product.price) pt.appendChild(el('p', 'ccf-sf-pprice', product.price));
          p.appendChild(pt);
          info.appendChild(p);
        }

        // The size we suggest, big, with a "Best match" / "Closest available" pill and one line on the fit.
        var chart = chartSizes();
        var at = chart.indexOf(String(r.size));
        var isBest = String(pick) === String(r.size);
        var hero = el('div', 'ccf-sf-hero');
        hero.appendChild(el('p', 'ccf-sf-rtitle', T('resultTitle')));
        var big = el('div', 'ccf-sf-big');
        big.appendChild(el('b', String(pick).length > 3 ? 'is-long' : null, String(pick)));
        if (sells(pick)) {
          var pill = el('span', 'ccf-sf-pill' + (isBest ? '' : ' is-alt'));
          pill.innerHTML = isBest ? CHECK : '';
          pill.appendChild(document.createTextNode(isBest ? 'Best match' : 'Closest available'));
          big.appendChild(pill);
        }
        hero.appendChild(big);
        var fitLine = fitText(r, pick, chart, at);
        if (fitLine) hero.appendChild(el('p', 'ccf-sf-fit', fitLine));
        info.appendChild(hero);

        // The recommended size with its neighbours: fits close · recommended · roomy.
        var shown = at === -1 ? [String(r.size)] : chart.slice(Math.max(0, at - 1), at + 2);
        if (shown.indexOf(String(pick)) === -1 && chart.indexOf(String(pick)) !== -1) shown.push(String(pick));
        shown.sort(function (x, y) { return chart.indexOf(x) - chart.indexOf(y); });
        info.appendChild(el('p', 'ccf-sf-other', 'Compare sizes'));
        var list = el('div', 'ccf-sf-sizes');
        list.setAttribute('role', 'group');
        list.setAttribute('aria-label', 'Sizes');
        shown.forEach(function (s) {
          var i = chart.indexOf(s);
          var isRec = s === String(r.size);
          var note = !sells(s) ? 'Not available' : isRec ? 'Recommended' : i < at ? (M ? 'Snugger' : 'Fits close') : (M ? 'Looser' : 'Roomy fit');
          var row = button('ccf-sf-size' + (isRec ? ' is-rec' : '') + (!sells(s) ? ' is-out' : ''), null, function () {
            if (!sells(s)) return;
            state.pick = s;
            state.error = '';
            draw();
          }, s + ' — ' + note);
          row.setAttribute('aria-pressed', s === pick ? 'true' : 'false');
          if (!sells(s)) row.setAttribute('aria-disabled', 'true');
          row.appendChild(el('b', null, s));
          row.appendChild(el('small', null, note));
          list.appendChild(row);
        });
        info.appendChild(list);
        grid.appendChild(info);
        body.appendChild(grid);

        var addNote = function (text, kind) {
          var n = el('p', 'ccf-sf-note' + (kind ? ' is-' + kind : ''));
          n.innerHTML = kind === 'ok' ? CHECK.replace(/18/g, '15') : INFO;
          n.appendChild(el('span', null, text));
          body.appendChild(n);
        };
        if (!sells(r.size)) {
          addNote(sells(pick)
            ? 'This product doesn’t come in ' + r.size + ' — ' + pick + ' is the closest size it has.'
            : 'This product doesn’t come in ' + r.size + '. Check the size chart for the closest size.', 'warn');
        }
        if (r.outOfRange) addNote(r.size + ' is the largest size in the chart — it may feel tight.', 'warn');
        if (r.saved) addNote('Saved — we’ll remember ' + r.size + ' for next time.', 'ok');
        var links = el('div', 'ccf-sf-links');
        if (opts.sizeChart) {
          var sc = button('ccf-sf-link', null, function () { state.showChart = !state.showChart; draw(); }, state.showChart ? 'Hide size chart' : 'View size chart');
          sc.innerHTML = RULER;
          sc.appendChild(document.createTextNode(state.showChart ? 'Hide size chart' : 'View size chart'));
          links.appendChild(sc);
        }
        var edLabel = M ? 'Edit measurement' : 'Edit details';
        var ed = button('ccf-sf-link', null, function () { state.result = null; go(M ? 1 : 2); estimateSoon(0); }, edLabel);
        ed.innerHTML = PEN;
        ed.appendChild(document.createTextNode(edLabel));
        links.appendChild(ed);
        body.appendChild(links);
        if (opts.sizeChart && state.showChart) body.appendChild(chartTable(state.gender, r.size));
        body.appendChild(el('p', 'ccf-sf-fine', M
          ? 'Based on your measurement, compared with this product’s size chart. A guide, not a guarantee.'
          : 'Based on your height, weight and build, compared with this product’s size chart. A guide, not a guarantee.'));

        if (err) foot.appendChild(err);
        var canAdd = opts.addToBag && addButton() && sells(pick);
        if (canAdd) {
          var add = button('ccf-sf-main' + (state.added ? ' is-added' : ''), null, function () { if (!state.added) chooseSize(pick, true); });
          if (state.added) {
            add.innerHTML = CHECK;
            add.appendChild(document.createTextNode(' Added to cart'));
          } else {
            add.textContent = T('addToBagText', pick);
          }
          foot.appendChild(add);
          foot.appendChild(button('ccf-sf-ghost', 'Just select size ' + pick, function () { chooseSize(pick, false); }));
        } else if (sells(pick)) {
          foot.appendChild(button('ccf-sf-main', 'Select size ' + pick, function () { chooseSize(pick, false); }));
        } else {
          foot.appendChild(button('ccf-sf-main', 'Close', close));
        }
      }
    }
  }

  function start() {
    var root = document.getElementById('ccf-sf-root');
    if (!root || root.getAttribute('data-ccf-ready')) return;
    root.setAttribute('data-ccf-ready', '1');
    var shop = root.getAttribute('data-shop') || '';
    var design = root.getAttribute('data-design-mode') === 'true' || !!(window.Shopify && window.Shopify.designMode);
    var hasSize = !!root.getAttribute('data-size-option');
    var tags = (root.getAttribute('data-tags') || '').toLowerCase().split('|');

    function getConfig(tries) {
      return fetch(PROXY + '/config?shop=' + encodeURIComponent(shop), { headers: { Accept: 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('config ' + r.status); return r.json(); })
        .catch(function (e) {
          if (tries <= 0) throw e;
          return new Promise(function (res) { setTimeout(res, 1500); }).then(function () { return getConfig(tries - 1); });
        });
    }
    getConfig(1)
      .then(function (d) {
        var s = d && d.settings;
        var tagOk = s && (!s.productTag || tags.indexOf(String(s.productTag).toLowerCase()) !== -1);
        if (s && s.enabled && hasSize && tagOk) { init(root, s); return; }
        if (design) {
          var why = !s || !s.enabled ? 'Turn on "Find my size" in the app to show it here.'
            : !hasSize ? 'This product has no Size option, so "Find my size" is hidden here.'
            : 'Hidden: this product does not have the tag "' + s.productTag + '".';
          var n = el('p', null, why);
          n.style.cssText = 'font-size:12px;color:#6B7280;margin:8px 0';
          root.appendChild(n);
          return;
        }
        root.remove();
      })
      .catch(function () { if (!design) root.remove(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  document.addEventListener('shopify:section:load', start);

  // Exposed for tests
  window.__ccfSizeFinder = { selectSizeOnPage: selectSizeOnPage, garmentKind: garmentKind, shoeKind: shoeKind, toeRoom: toeRoom, ringKind: ringKind, ringRoom: ringRoom, bangleKind: bangleKind, bangleRoom: bangleRoom, babyOutfit: babyOutfit, babyRoom: babyRoom };
})();
