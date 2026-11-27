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
      '.ccf-sf-avatar .ccf-sf-wear{position:absolute;z-index:2;left:50%;top:17%;height:60%;width:auto;max-width:76%;transform:translateX(-50%);object-fit:contain;mix-blend-mode:multiply;pointer-events:none;border:0;border-radius:0;box-shadow:none;background:transparent}',
      '.ccf-sf-me{position:absolute;z-index:3;left:8px;right:8px;bottom:8px;display:flex;justify-content:center}',
      '.ccf-sf-me span{padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.92);box-shadow:0 1px 3px rgba(0,0,0,.08);font-size:10.5px;font-weight:600;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.ccf-sf-prod{display:flex;gap:10px;align-items:center;padding-bottom:12px;border-bottom:1px solid #F0F0F0}',
      '.ccf-sf-thumb{width:44px;height:44px;border-radius:10px;object-fit:cover;background:#F3F4F6;flex-shrink:0;display:block;border:1px solid #F0F0F0}',
      '.ccf-sf-pname{margin:0;font-size:13px;font-weight:650;line-height:1.3}',
      '.ccf-sf-pprice{margin:2px 0 0;font-size:12px;color:#6B7280}',
      '.ccf-sf-hero{margin:12px 0 0;padding:12px 14px;border-radius:14px;background:#FAFAF9;border:1px solid #EFEEEC}',
      '.ccf-sf-rtitle{margin:0;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#6B7280}',
      '.ccf-sf-big{display:flex;align-items:center;gap:10px;margin:4px 0 2px}',
      '.ccf-sf-big b{font-size:34px;line-height:1;font-weight:750;letter-spacing:-.02em;color:#111}',
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

  // A soft, filled mannequin. Wider with body-mass index and the chosen build, taller with height.
  function figureSvg(heightCm, weightKg, build, size) {
    var bmi = weightKg / Math.pow(heightCm / 100, 2);
    var b = BUILDS.filter(function (x) { return x.value === build; })[0];
    var sx = Math.max(0.8, Math.min(1.4, (bmi / 22) * (b ? b.sx : 1)));
    var sy = Math.max(0.88, Math.min(1.08, heightCm / 172));
    var h = size || 160;
    var w = Math.round(h * 0.42);
    var id = 'ccfsfg' + Math.floor(Math.random() * 1e6);
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 64 160" aria-hidden="true" style="transform:scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ');transform-origin:50% 100%">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B8B8B6"/><stop offset=".5" stop-color="#D9D9D7"/><stop offset="1" stop-color="#A8A8A6"/></linearGradient></defs>' +
      '<g fill="url(#' + id + ')">' +
      '<ellipse cx="32" cy="13" rx="9" ry="10.5"/>' +
      '<path d="M28 23h8v5h-8z"/>' +
      '<path d="M18 30c4-3 9-3.5 14-3.5s10 .5 14 3.5c3 2 4 5 4.5 9l2.5 34c.2 3-1.5 5-3.5 5s-3.3-1.6-3.6-4L46 46l-1 30c0 6 .5 10 .5 14l-2 63c-.1 3-2 4.5-4.3 4.5s-4-1.6-4-4.4L33.5 94h-3L29 153c0 2.8-1.8 4.4-4 4.4s-4.2-1.5-4.3-4.5l-2-63c0-4 .5-8 .5-14l-1-30-2.4 28c-.3 2.4-1.6 4-3.6 4s-3.7-2-3.5-5l2.5-34c.5-4 1.5-7 4.5-9z"/>' +
      '</g></svg>';
  }

  function init(root, settings) {
    var shop = root.getAttribute('data-shop') || '';
    var sizeOption = root.getAttribute('data-size-option') || 'Size';
    var sizeValues = (root.getAttribute('data-size-values') || '').split('|').filter(Boolean);
    var product = {
      title: root.getAttribute('data-product-title') || '',
      price: root.getAttribute('data-product-price') || '',
      image: root.getAttribute('data-product-image') || '',
    };
    if (product.image.indexOf('//') === 0) product.image = 'https:' + product.image;
    var accent = /^#[0-9A-Fa-f]{6}$/.test(settings.accentColor || '') ? settings.accentColor : '#111827';
    var genders = Array.isArray(settings.genders) ? settings.genders : [];
    // Shoes / rings / bangles: one measurement instead of height, weight and build.
    var M = settings.measure && settings.storeType && settings.storeType !== 'clothing' && Array.isArray(settings.measure.chart)
      ? settings.measure : null;
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
    function shortMeasure() {
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
      if (figureBox) figureBox.innerHTML = figureSvg(state.heightCm, state.weightKg, state.step >= 3 ? state.shape : 'average', 96);
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
          body: JSON.stringify(M ? { value: measuredValue(), remember: false, sessionId: '' } : {
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
        state.status = 'Finalizing the render…';
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
        body: JSON.stringify(M ? { value: measuredValue(), remember: state.remember, sessionId: state.remember ? sessionId() : '' } : {
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
    function addButton() {
      var scope = root.closest('.shopify-section') || document;
      var form = scope.querySelector('form[action*="/cart/add"]') || document.querySelector('form[action*="/cart/add"]');
      if (!form) return null;
      return form.querySelector('button[type="submit"][name="add"], button[name="add"], button[type="submit"], input[type="submit"]');
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
      // Themes swap the variant after the size changes; press "Add to cart" once that has happened.
      setTimeout(function () {
        var b = addButton();
        if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true') {
          state.added = true;
          draw();
          setTimeout(function () { close(); b.click(); }, 450);
        } else {
          state.error = 'Size ' + size + ' is sold out right now.';
          draw();
        }
      }, 350);
    }

    function privacy(foot) {
      var p = el('p', 'ccf-sf-privacy');
      p.innerHTML = LOCK;
      p.appendChild(el('span', null, T('privacyText')));
      foot.appendChild(p);
    }

    // Step 1 for shoes / rings / bangles: drawing, the way to measure, one slider, how-to, remember.
    function drawMeasure(body, foot, err) {
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
        fig1.innerHTML = figureSvg(state.heightCm, state.weightKg, 'average', 150);
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
          f.innerHTML = figureSvg(170, 22 * 2.89 * bd.sx, 'average', 46);
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
        stage.insertAdjacentHTML('beforeend', figureSvg(state.heightCm, state.weightKg, state.shape, 200));
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
        if (M) {
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
        av.innerHTML = '<span class="ccf-sf-floor"></span>' + figureSvg(state.heightCm, state.weightKg, state.shape, 230);
        }
        if (!M && product.image) {
          var wear = el('img', 'ccf-sf-wear');
          wear.src = product.image;
          wear.alt = '';
          wear.loading = 'lazy';
          av.appendChild(wear);
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
        big.appendChild(el('b', null, String(pick)));
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
  window.__ccfSizeFinder = { selectSizeOnPage: selectSizeOnPage };
})();
