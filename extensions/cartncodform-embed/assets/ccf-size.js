/* ccf-size.js — "Find my size", CartnCodForm.
   Classes prefixed .ccf-sf-*. Settings + charts from the App Proxy; the size itself is worked out
   on the backend (POST /apps/cartncodform/size-finder/recommend). Height and weight stay on this
   device (localStorage, to pre-fill next time) and are sent only for the calculation.
   Opens as a "size advisor" drawer (desktop) or bottom sheet (phone), with a live estimate while the
   shopper moves the sliders. The admin's live preview (SizeFinderPreview.jsx) mirrors this design. */
(function () {
  'use strict';

  var PROXY = '/apps/cartncodform/size-finder';
  var CM_PER_IN = 2.54;
  var KG_PER_LB = 0.45359237;
  var RULER = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 15.5 15.5 3 21 8.5 8.5 21z"/><path d="m7 12 2 2M10 9l2 2M13 6l2 2"/></svg>';

var CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';

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

  // Editorial "size advisor" look: warm neutrals, thin rules, uppercase labels, one accent colour.
  // Desktop: a drawer from the right. Phones (≤640px): a bottom sheet.
  function injectStyles(accent) {
    if (document.getElementById('ccf-sf-styles')) return;
    var tint = accent + '14';
    var s = document.createElement('style');
    s.id = 'ccf-sf-styles';
    s.textContent = [
      '.ccf-sf *,.ccf-sf-overlay *,.ccf-sf-panel *{box-sizing:border-box}',
      '.ccf-sf{margin:14px 0;font-family:inherit;color:#1A1A1A;line-height:1.45;-webkit-font-smoothing:antialiased}',
      '.ccf-sf button,.ccf-sf-panel button{font-family:inherit;letter-spacing:normal;text-transform:none;min-height:0;margin:0}',
      // trigger card
      '.ccf-sf-trigger{width:100%;display:flex;align-items:center;gap:12px;padding:12px 14px;margin:0;border:1px solid ' + accent + '40;border-radius:14px;background:linear-gradient(135deg,' + accent + '0F,' + accent + '05);color:#1A1A1A;cursor:pointer;text-align:left;transition:border-color .15s,box-shadow .15s,transform .15s}',
      '.ccf-sf-trigger:hover{border-color:' + accent + ';box-shadow:0 6px 18px rgba(17,24,39,.08);transform:translateY(-1px)}',
      '.ccf-sf-trigger:focus-visible{outline:2px solid ' + accent + ';outline-offset:2px}',
      '.ccf-sf-icon{position:relative;width:42px;height:42px;border-radius:50%;background:#fff;color:' + accent + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 0 1px ' + accent + '33}',
      '.ccf-sf-icon::after{content:"";position:absolute;inset:-1px;border-radius:50%;border:2px solid ' + accent + ';opacity:0;animation:ccf-sf-pulse 2.2s ease-out 1s 3}',
      '@keyframes ccf-sf-pulse{0%{transform:scale(1);opacity:.45}100%{transform:scale(1.45);opacity:0}}',
      '.ccf-sf-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.ccf-sf-card-title{font-size:15px;font-weight:600;line-height:1.3}',
      '.ccf-sf-card-sub{font-size:12.5px;color:#6B6B6B;line-height:1.35}',
      '.ccf-sf-cta{flex-shrink:0;display:inline-flex;align-items:center;gap:4px;background:' + accent + ';color:#fff;border:1px solid ' + accent + ';border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;white-space:nowrap}',
      '.ccf-sf-cta.is-outline{background:#fff;color:' + accent + '}',
      '.ccf-sf-cta.is-soft{background:' + accent + '1F;border-color:transparent;color:' + accent + '}',
      '.ccf-sf-trigger.is-done .ccf-sf-icon{background:' + accent + ';color:#fff}',
      '.ccf-sf-trigger.is-done .ccf-sf-icon::after{display:none}',
      '.ccf-sf-trigger.is-done .ccf-sf-cta{background:#fff;border-color:' + accent + ';color:' + accent + '}',
      '@media (max-width:420px){.ccf-sf-trigger{padding:11px 12px;gap:10px}.ccf-sf-icon{width:38px;height:38px}.ccf-sf-card-title{font-size:14px}.ccf-sf-cta{padding:7px 11px;font-size:12px}}',

      // drawer + backdrop
      '.ccf-sf-overlay{position:fixed;inset:0;background:rgba(20,20,20,.38);z-index:2147483000;opacity:0;transition:opacity .25s}',
      '.ccf-sf-overlay.is-open{opacity:1}',
      // themes like Dawn hide empty divs (div:empty{display:none}); these two are empty on purpose
      '.ccf-sf-overlay.ccf-sf-overlay{display:block}',
      '.ccf-sf-overlay.ccf-sf-overlay[hidden]{display:none}',
      '.ccf-sf-panel{position:fixed;top:0;right:0;bottom:0;width:min(440px,100vw);z-index:2147483001;background:#fff;color:#1A1A1A;display:flex;flex-direction:column;font-size:14px;line-height:1.45;box-shadow:-12px 0 40px rgba(0,0,0,.14);transform:translateX(100%);transition:transform .3s cubic-bezier(.2,.8,.2,1);-webkit-font-smoothing:antialiased}',
      '.ccf-sf-panel.is-open{transform:none}',
      '.ccf-sf-panel[hidden]{display:none}',
      '.ccf-sf-grab{display:none}',
      '@media (max-width:640px){.ccf-sf-panel{top:auto;left:0;width:100%;max-height:92vh;border-radius:18px 18px 0 0;transform:translateY(100%);box-shadow:0 -12px 40px rgba(0,0,0,.18)}.ccf-sf-panel .ccf-sf-grab{display:block;width:40px;height:4px;border-radius:4px;background:#D9D6D0;margin:8px auto 0}}',
      '@media (prefers-reduced-motion:reduce){.ccf-sf-panel,.ccf-sf-overlay,.ccf-sf-trigger{transition:none}.ccf-sf-icon::after{animation:none}}',
      '.ccf-sf-top{display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-bottom:1px solid #EEECE8}',
      '.ccf-sf-brand{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#1A1A1A;margin:0}',
      '.ccf-sf-close{background:none;border:0;width:32px;height:32px;border-radius:50%;cursor:pointer;color:#1A1A1A;font-size:22px;line-height:32px;text-align:center;padding:0}',
      '.ccf-sf-close:hover{background:#F4F3F0}',
      '.ccf-sf-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 22px}',
      // product strip
      '.ccf-sf-product{display:flex;align-items:center;gap:12px;background:#F7F6F3;border-radius:6px;padding:10px;margin:16px 0 0}',
      '.ccf-sf-thumb{width:44px;height:44px;border-radius:4px;background:#E9E7E2;object-fit:cover;flex-shrink:0}',
      '.ccf-sf-pname{font-size:13px;font-weight:600;margin:0}',
      '.ccf-sf-pprice{font-size:12px;color:#6B6B6B;margin:2px 0 0}',
      // progress
      '.ccf-sf-progress{display:flex;gap:4px;margin:16px 0 6px}',
      '.ccf-sf-progress span{flex:1;height:3px;border-radius:2px;background:#E7E5E0;transition:background .2s}',
      '.ccf-sf-progress span.on{background:#1A1A1A}',
      '.ccf-sf-stepline{font-size:11.5px;color:#6B6B6B;margin:0}',
      '.ccf-sf-title{font-size:22px;font-weight:600;letter-spacing:-.01em;margin:18px 0 4px}',
      '.ccf-sf-lede{font-size:13px;color:#6B6B6B;margin:0 0 16px}',
      // gender
      '.ccf-sf-seg{display:flex;border:1px solid #1A1A1A;border-radius:4px;overflow:hidden;margin:0 0 18px}',
      '.ccf-sf-seg button{flex:1;border:0;background:#fff;padding:10px 8px;font-size:11.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#1A1A1A;cursor:pointer}',
      '.ccf-sf-seg button[aria-pressed="true"]{background:#1A1A1A;color:#fff}',
      // measurements with the figure
      '.ccf-sf-measure{display:flex;gap:14px;align-items:stretch}',
      '.ccf-sf-figure{width:64px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#1A1A1A}',
      '.ccf-sf-figure svg{transition:transform .25s}',
      '.ccf-sf-fields{flex:1;min-width:0}',
      '.ccf-sf-field{margin:0 0 16px;min-width:0}',
      '.ccf-sf-label{display:flex;justify-content:space-between;align-items:center;margin:0 0 4px}',
      '.ccf-sf-label > span:first-child{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#6B6B6B}',
      '.ccf-sf-unit{display:inline-flex;gap:2px}',
      '.ccf-sf-unit button{border:1px solid #E1DED8;background:#fff;border-radius:3px;padding:2px 7px;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6B6B6B;cursor:pointer}',
      '.ccf-sf-unit button[aria-pressed="true"]{background:#1A1A1A;border-color:#1A1A1A;color:#fff}',
      '.ccf-sf-value{font-size:30px;font-weight:600;letter-spacing:-.02em;line-height:1.1;margin:0 0 8px}',
      '.ccf-sf-value small{font-size:13px;font-weight:500;color:#6B6B6B;margin-left:3px}',
      '.ccf-sf-ctrl{display:flex;align-items:center;gap:8px}',
      '.ccf-sf-step-btn{width:26px;height:26px;border-radius:50%;border:1px solid #E1DED8;background:#fff;color:#1A1A1A;font-size:15px;line-height:1;cursor:pointer;flex-shrink:0;padding:0}',
      '.ccf-sf-step-btn:hover{border-color:#1A1A1A}',
      '.ccf-sf-range{flex:1;min-width:0;accent-color:#1A1A1A;margin:0;height:20px}',
      '.ccf-sf-live{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #E7E5E0;border-radius:6px;padding:12px 14px;margin:2px 0 18px}',
      '.ccf-sf-live b{display:block;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}',
      '.ccf-sf-live small{font-size:12px;color:#6B6B6B}',
      '.ccf-sf-live-size{font-size:24px;font-weight:600;min-width:32px;text-align:right}',
      '.ccf-sf-live.is-busy .ccf-sf-live-size{opacity:.35}',
      // step 2
      '.ccf-sf-q{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#6B6B6B;margin:0 0 8px}',
      '.ccf-sf-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 20px}',
      '.ccf-sf-card{border:1px solid #E1DED8;background:#fff;border-radius:6px;padding:12px 6px;text-align:center;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;transition:border-color .15s}',
      '.ccf-sf-card:hover{border-color:#1A1A1A}',
      '.ccf-sf-card b{font-size:14px;font-weight:600;color:#1A1A1A}',
      '.ccf-sf-card small{font-size:11px;color:#6B6B6B}',
      '.ccf-sf-card[aria-pressed="true"]{border:1.5px solid #1A1A1A;background:#F7F6F3}',
      '.ccf-sf-check{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#F7F6F3;border-radius:6px;padding:12px 14px;cursor:pointer;margin:0 0 18px}',
      '.ccf-sf-check span b{display:block;font-size:13px;font-weight:600;color:#1A1A1A}',
      '.ccf-sf-check span small{font-size:12px;color:#6B6B6B}',
      '.ccf-sf-check input{appearance:none;-webkit-appearance:none;width:40px;height:22px;border-radius:999px;background:#D1CEC7;position:relative;cursor:pointer;flex-shrink:0;margin:0;transition:background .15s}',
      '.ccf-sf-check input::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}',
      '.ccf-sf-check input:checked{background:#1A1A1A}',
      '.ccf-sf-check input:checked::after{left:20px}',
      // result
      '.ccf-sf-result{text-align:center;padding-bottom:6px}',
      '.ccf-sf-result .ccf-sf-title{margin-top:14px}',
      '.ccf-sf-ring{position:relative;width:132px;height:132px;margin:10px auto 12px;display:flex;flex-direction:column;align-items:center;justify-content:center}',
      '.ccf-sf-ring svg{position:absolute;inset:0}',
      '.ccf-sf-ring svg circle{transition:stroke-dashoffset .8s ease-out}',
      '.ccf-sf-size{font-size:40px;font-weight:600;line-height:1;letter-spacing:-.02em}',
      '.ccf-sf-ring-label{font-size:12px;color:#6B6B6B;margin-top:4px}',
      '.ccf-sf-verdict{font-size:13.5px;background:#F7F6F3;border-radius:6px;padding:12px 14px;margin:0 0 12px;text-align:left}',
      '.ccf-sf-reason{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px;background:#F7F6F3;border-left:3px solid #2F6B4F;border-radius:0 6px 6px 0;padding:10px 12px;margin:0 0 6px;text-align:left}',
      '.ccf-sf-reason.is-warn{border-left-color:#B7791F}',
      '.ccf-sf-reason.is-info{border-left-color:#C9C5BD}',
      '.ccf-sf-reason > span:first-child{font-weight:600}',
      '.ccf-sf-ok,.ccf-sf-warn{display:inline-flex;align-items:center;gap:7px}',
      '.ccf-sf-ok::before,.ccf-sf-warn::before{content:"";width:7px;height:7px;border-radius:50%;flex-shrink:0}',
      '.ccf-sf-ok::before{background:#2F6B4F}.ccf-sf-warn::before{background:#B7791F}',
      '.ccf-sf-muted{color:#6B6B6B}',
      '.ccf-sf-note{font-size:12px;color:#6B6B6B;margin:10px 0 0;text-align:center}',
      '.ccf-sf-strip{display:flex;justify-content:center;gap:6px;margin:22px 0 4px;flex-wrap:wrap}',
      '.ccf-sf-strip span{position:relative;min-width:40px;padding:8px 6px;border:1px solid #E1DED8;border-radius:4px;font-size:12.5px;font-weight:600;color:#1A1A1A;text-align:center}',
      '.ccf-sf-strip span.is-you{background:#1A1A1A;border-color:#1A1A1A;color:#fff}',
      '.ccf-sf-strip span.is-you::before{content:"YOU";position:absolute;left:50%;top:-17px;transform:translateX(-50%);font-size:9.5px;letter-spacing:.14em;color:#1A1A1A}',
      '.ccf-sf-strip span.is-missing{color:#B9B5AD;text-decoration:line-through}',
      '.ccf-sf-meter{margin:16px 0 4px;text-align:left}',
      '.ccf-sf-meter-bar{position:relative;height:4px;border-radius:4px;background:linear-gradient(90deg,#E8D9B5,#2F6B4F 50%,#E8D9B5)}',
      '.ccf-sf-meter-dot{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#fff;border:3px solid #1A1A1A}',
      '.ccf-sf-meter-labels{display:flex;justify-content:space-between;font-size:11px;color:#6B6B6B;margin-top:6px}',
      '.ccf-sf-link{background:none;border:0;padding:0;color:#1A1A1A;text-decoration:underline;text-underline-offset:3px;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}',
      '.ccf-sf-links{display:flex;justify-content:center;gap:22px;margin:12px 0 0}',
      '.ccf-sf-table{width:100%;border-collapse:collapse;margin-top:12px;font-size:12px}',
      '.ccf-sf-table th{font-size:10.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:#6B6B6B}',
      '.ccf-sf-table th,.ccf-sf-table td{border-bottom:1px solid #EEECE8;padding:8px 6px;text-align:center}',
      '.ccf-sf-table tr.is-you td{background:#F7F6F3;font-weight:600}',
      // footer
      '.ccf-sf-foot{border-top:1px solid #EEECE8;padding:14px 22px 16px;background:#fff}',
      '.ccf-sf-actions{display:flex;gap:10px}',
      '.ccf-sf-btn{flex:1;border:1px solid #1A1A1A;background:#fff;color:#1A1A1A;border-radius:4px;padding:14px 12px;font-size:14px;font-weight:600;cursor:pointer}',
      '.ccf-sf-btn-main{flex:2;background:' + accent + ';border-color:' + accent + ';color:#fff}',
      '.ccf-sf-btn-main:hover{filter:brightness(1.08)}',
      '.ccf-sf-btn-main[disabled]{opacity:.7;cursor:wait}',
      '.ccf-sf-arrow::after{content:" \\2192"}',
      '.ccf-sf-privacy{font-size:11.5px;color:#8A867E;margin:10px 0 0;text-align:center}',
      '.ccf-sf-err{font-size:13px;color:#B42318;font-weight:500;margin:0 0 12px;background:#FEF2F2;border-radius:6px;padding:9px 12px}',
      '.ccf-sf-tint{background:' + tint + '}',
      '@media (max-width:640px){.ccf-sf-top{padding:12px 18px}.ccf-sf-scroll{padding:0 18px}.ccf-sf-foot{padding:12px 18px 14px}.ccf-sf-title{font-size:20px}.ccf-sf-value{font-size:26px}}',
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

  // Fit-meter position (0–100) from the chest result.
  function meterPosition(reasons) {
    var chest = (reasons || []).filter(function (x) { return x.area === 'chest'; })[0];
    if (!chest) return 50;
    return chest.status === 'snug' ? 18 : chest.status === 'roomy' ? 82 : 50;
  }

  // Button look set in the admin: style (filled / outline / soft) and corner radius (24 = round).
  var CTA_STYLES = { outline: ' is-outline', soft: ' is-soft' };
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

  var STEP_NAMES = { 1: 'Measurements', 2: 'Your fit', 3: 'Your size' };
  // Words the store can change in the admin (same defaults as the backend).
  var TEXT_DEFAULTS = {
    womenLabel: 'Womenswear', menLabel: 'Menswear', advisorTitle: 'Size advisor',
    step1Title: 'Let’s find your fit', step1Text: 'Two measurements, about ten seconds.',
    step2Title: 'How do you like it to fit?', step2Text: 'Two quick choices make the size more accurate.',
    resultTitle: 'Your size', addToBagText: 'Add size {size} to bag',
  };
  var OPTION_DEFAULTS = { liveEstimate: true, rememberSize: true, addToBag: true, sizeChart: true };
  var REASON_TEXT = { right: 'Right for your fit', snug: 'A little snug', roomy: 'A little roomy' };
  var H_MIN = 140, H_MAX = 200, W_MIN = 40, W_MAX = 130;

  // Simple standing figure; gets wider with the body-mass index and taller with height.
  function figureSvg(heightCm, weightKg) {
    var bmi = weightKg / Math.pow(heightCm / 100, 2);
    var sx = Math.max(0.82, Math.min(1.35, bmi / 22));
    var sy = Math.max(0.88, Math.min(1.08, heightCm / 172));
    return '<svg width="56" height="150" viewBox="0 0 56 150" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform:scale(' + sx.toFixed(3) + ',' + sy.toFixed(3) + ');transform-origin:50% 100%">' +
      '<circle cx="28" cy="13" r="9"/>' +
      '<path d="M28 22v4M17 30c3-3 7-4 11-4s8 1 11 4l4 34M17 30l-4 34M19 32v40l-2 74M37 32v40l2 74M28 74v72M19 72h18"/>' +
      '</svg>';
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
    var accent = /^#[0-9A-Fa-f]{6}$/.test(settings.accentColor || '') ? settings.accentColor : '#111827';
    var genders = Array.isArray(settings.genders) ? settings.genders : [];
    if (!genders.length) { root.remove(); return; }
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
      step: 1,
      gender: genders.indexOf(saved.gender) !== -1 ? saved.gender : genders[0],
      heightCm: Number(saved.heightCm) || 162,
      weightKg: Number(saved.weightKg) || 60,
      hUnit: saved.hUnit === 'ft' ? 'ft' : (settings.unit === 'in' ? 'ft' : 'cm'),
      wUnit: saved.wUnit === 'lb' ? 'lb' : 'kg',
      shape: saved.shape || 'average',
      fit: saved.fit || 'regular',
      remember: false,
      result: null,
      live: '',
      liveBusy: false,
      busy: false,
      error: '',
      showChart: false,
    };

    var design = root.getAttribute('data-design-mode') === 'true' || !!(window.Shopify && window.Shopify.designMode);
    if (!design) placeNearSizePicker(root, sizeOption);

    // Trigger card on the page
    var wrap = el('div', 'ccf-sf');
    var open = el('button', 'ccf-sf-open ccf-sf-trigger');
    open.type = 'button';
    open.setAttribute('aria-expanded', 'false');
    open.setAttribute('aria-haspopup', 'dialog');
    wrap.appendChild(open);
    root.appendChild(wrap);

    // Drawer (desktop) / bottom sheet (phone), attached to <body> so theme layout can't clip it.
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
      var icon = el('span', 'ccf-sf-icon');
      icon.innerHTML = size ? CHECK : RULER;
      var copy = el('span', 'ccf-sf-copy');
      copy.appendChild(el('span', 'ccf-sf-card-title', size ? 'Your size: ' + size : (settings.cardTitle || 'Not sure about your size?')));
      copy.appendChild(el('span', 'ccf-sf-card-sub', size ? 'Based on your answers · tap to change' : (settings.cardText || '3 quick questions · takes 20 seconds')));
      open.appendChild(icon);
      open.appendChild(copy);
      var cta = el('span', 'ccf-sf-cta' + (CTA_STYLES[settings.buttonStyle] || ''), size ? 'Change' : (settings.buttonText || 'Find my size') + ' →');
      cta.style.borderRadius = ctaRadius(settings.buttonRadius);
      open.appendChild(cta);
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
      state.step = state.result ? 3 : 1;
      state.error = '';
      overlay.hidden = false;
      panel.hidden = false;
      prevOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      open.setAttribute('aria-expanded', 'true');
      document.addEventListener('keydown', onKey);
      draw();
      // next frame → slide in
      requestAnimationFrame(function () { overlay.classList.add('is-open'); panel.classList.add('is-open'); });
      var x = panel.querySelector('.ccf-sf-close');
      if (x) try { x.focus({ preventScroll: true }); } catch (e) {}
      if (state.step === 1 && !state.live && opts.liveEstimate) estimateSoon(0);
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

    function segmented(options, current, onPick, labelText) {
      var box = el('div', 'ccf-sf-seg');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', labelText);
      options.forEach(function (o) {
        var b = button(null, o.label, function () { onPick(o.value); draw(); });
        b.setAttribute('aria-pressed', o.value === current ? 'true' : 'false');
        box.appendChild(b);
      });
      return box;
    }

    function cards(options, current, onPick, labelText) {
      var box = el('div', 'ccf-sf-cards');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', labelText);
      options.forEach(function (o) {
        var b = button('ccf-sf-card', null, function () { onPick(o.value); draw(); }, o.label);
        b.setAttribute('aria-pressed', o.value === current ? 'true' : 'false');
        b.appendChild(el('b', null, o.label));
        b.appendChild(el('small', null, o.hint));
        box.appendChild(b);
      });
      return box;
    }

    function unitToggle(opts, current, onPick, labelText) {
      var box = el('span', 'ccf-sf-unit');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', labelText);
      opts.forEach(function (u) {
        var b = button(null, u[1], function () { onPick(u[0]); draw(); });
        b.setAttribute('aria-pressed', u[0] === current ? 'true' : 'false');
        box.appendChild(b);
      });
      return box;
    }

    function heightParts() {
      if (state.hUnit === 'cm') return [String(Math.round(state.heightCm)), 'cm'];
      var totalIn = Math.round(state.heightCm / CM_PER_IN);
      return [Math.floor(totalIn / 12) + '′ ' + (totalIn % 12) + '″', ''];
    }
    function weightParts() {
      return state.wUnit === 'kg' ? [String(Math.round(state.weightKg)), 'kg'] : [String(Math.round(state.weightKg / KG_PER_LB)), 'lb'];
    }
    function fillValue(v, parts) {
      v.textContent = parts[0];
      if (parts[1]) v.appendChild(el('small', null, parts[1]));
    }

    // One measurement: label + unit switch, big value, − slider +.
    function measure(label, min, max, get, setv, parts, unitEl, stepSize) {
      var f = el('div', 'ccf-sf-field');
      var l = el('div', 'ccf-sf-label');
      l.appendChild(el('span', null, label));
      l.appendChild(unitEl);
      f.appendChild(l);
      var v = el('div', 'ccf-sf-value');
      fillValue(v, parts());
      f.appendChild(v);
      var row = el('div', 'ccf-sf-ctrl');
      var input = el('input', 'ccf-sf-range');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = '1';
      input.value = String(Math.round(get()));
      input.setAttribute('aria-label', label);
      function changed(val) {
        setv(Math.max(min, Math.min(max, val)));
        input.value = String(Math.round(get()));
        fillValue(v, parts());
        redrawFigure();
      }
      input.addEventListener('input', function () { changed(Number(input.value)); });
      input.addEventListener('change', function () { estimateSoon(250); });
      row.appendChild(button('ccf-sf-step-btn', '−', function () { changed(get() - stepSize); estimateSoon(450); }, 'Less ' + label.toLowerCase()));
      row.appendChild(input);
      row.appendChild(button('ccf-sf-step-btn', '+', function () { changed(get() + stepSize); estimateSoon(450); }, 'More ' + label.toLowerCase()));
      f.appendChild(row);
      return f;
    }

    var figureBox = null;
    function redrawFigure() { if (figureBox) figureBox.innerHTML = figureSvg(state.heightCm, state.weightKg); }

    // Live estimate on step 1 (same backend maths, average shape + regular fit, never saved).
    var liveTimer = null;
    var liveBox = null;
    function paintLive() {
      if (!liveBox) return;
      liveBox.classList.toggle('is-busy', state.liveBusy);
      var s = liveBox.querySelector('.ccf-sf-live-size');
      if (s) s.textContent = state.live || '—';
    }
    function estimateSoon(ms) {
      if (!opts.liveEstimate) return;
      clearTimeout(liveTimer);
      state.liveBusy = true;
      paintLive();
      liveTimer = setTimeout(function () {
        if (!panel.isConnected || panel.hidden || state.step !== 1) { state.liveBusy = false; return; }
        fetch(PROXY + '/recommend?shop=' + encodeURIComponent(shop), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
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
        hUnit: state.hUnit, wUnit: state.wUnit, shape: state.shape, fit: state.fit,
        size: extra && extra.size ? extra.size : prev.size,
      });
    }

    function sessionId() {
      try { return localStorage.getItem('ccf_analytics_session_' + shop) || ''; } catch (e) { return ''; }
    }

    function getSize() {
      state.busy = true;
      state.error = '';
      draw();
      remember();
      fetch(PROXY + '/recommend?shop=' + encodeURIComponent(shop), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          gender: state.gender, heightCm: Math.round(state.heightCm), weightKg: Math.round(state.weightKg),
          shape: state.shape, fit: state.fit, remember: state.remember, sessionId: state.remember ? sessionId() : '',
        }),
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          state.busy = false;
          if (!res.ok || !res.d || !res.d.ok) {
            state.error = (res.d && res.d.error) || 'Could not work out a size. Try again.';
          } else {
            state.result = res.d;
            state.step = 3;
          }
          draw();
        })
        .catch(function () {
          state.busy = false;
          state.error = 'Could not work out a size. Check your connection and try again.';
          draw();
        });
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
          close();
          b.click();
        } else {
          state.error = 'Size ' + size + ' is sold out right now.';
          draw();
        }
      }, 350);
    }

    // ── drawing ──
    function draw() {
      panel.innerHTML = '';
      liveBox = null;
      figureBox = null;
      panel.appendChild(el('div', 'ccf-sf-grab'));
      var head = el('div', 'ccf-sf-top');
      head.appendChild(el('p', 'ccf-sf-brand', T('advisorTitle')));
      head.appendChild(button('ccf-sf-close', '×', close, 'Close'));
      panel.appendChild(head);

      var scroll = el('div', 'ccf-sf-scroll');
      panel.appendChild(scroll);
      var foot = el('div', 'ccf-sf-foot');
      panel.appendChild(foot);

      if (product.title) {
        var p = el('div', 'ccf-sf-product');
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
        scroll.appendChild(p);
      }

      var prog = el('div', 'ccf-sf-progress');
      prog.setAttribute('aria-hidden', 'true');
      for (var i = 1; i <= 3; i++) prog.appendChild(el('span', i <= state.step ? 'on' : null));
      scroll.appendChild(prog);
      var sl = el('p', 'ccf-sf-stepline');
      sl.appendChild(el('span', 'ccf-sf-step', 'Step ' + state.step + ' of 3'));
      sl.appendChild(document.createTextNode(' · ' + STEP_NAMES[state.step]));
      scroll.appendChild(sl);

      if (state.error) {
        var err = el('p', 'ccf-sf-err', state.error);
        err.setAttribute('role', 'alert');
      }

      if (state.step === 1) {
        scroll.appendChild(el('h2', 'ccf-sf-title', T('step1Title')));
        scroll.appendChild(el('p', 'ccf-sf-lede', T('step1Text')));
        if (genders.length > 1) {
          scroll.appendChild(segmented(
            genders.map(function (g) { return { value: g, label: g === 'men' ? T('menLabel') : T('womenLabel') }; }),
            state.gender, function (v) { if (v !== state.gender) { state.gender = v; estimateSoon(200); } }, 'Womenswear or menswear'
          ));
        }
        var m = el('div', 'ccf-sf-measure');
        figureBox = el('div', 'ccf-sf-figure');
        m.appendChild(figureBox);
        redrawFigure();
        var fields = el('div', 'ccf-sf-fields');
        fields.appendChild(measure('Height', H_MIN, H_MAX, function () { return state.heightCm; }, function (v) { state.heightCm = v; }, heightParts,
          unitToggle([['cm', 'cm'], ['ft', 'ft/in']], state.hUnit, function (u) { state.hUnit = u; }, 'Height unit'), 1));
        fields.appendChild(measure('Weight', W_MIN, W_MAX, function () { return state.weightKg; }, function (v) { state.weightKg = v; }, weightParts,
          unitToggle([['kg', 'kg'], ['lb', 'lb']], state.wUnit, function (u) { state.wUnit = u; }, 'Weight unit'), 1));
        m.appendChild(fields);
        scroll.appendChild(m);

        if (opts.liveEstimate) {
        liveBox = el('div', 'ccf-sf-live');
        liveBox.setAttribute('aria-live', 'polite');
        var lt = el('div');
        lt.appendChild(el('b', null, 'Live estimate'));
        lt.appendChild(el('small', null, 'Refines in the next steps'));
        liveBox.appendChild(lt);
        liveBox.appendChild(el('span', 'ccf-sf-live-size', state.live || '—'));
        scroll.appendChild(liveBox);
        paintLive();
        }

        if (err) foot.appendChild(err);
        var a1 = el('div', 'ccf-sf-actions');
        a1.appendChild(button('ccf-sf-btn ccf-sf-btn-main ccf-sf-arrow', 'Continue', function () { state.step = 2; state.error = ''; draw(); }));
        foot.appendChild(a1);
        foot.appendChild(el('p', 'ccf-sf-privacy', 'Used only to work out your size — your height and weight are never saved by the store.'));
      } else if (state.step === 2) {
        scroll.appendChild(el('h2', 'ccf-sf-title', T('step2Title')));
        scroll.appendChild(el('p', 'ccf-sf-lede', T('step2Text')));
        scroll.appendChild(el('p', 'ccf-sf-q', 'Body shape'));
        scroll.appendChild(cards([
          { value: 'slim', label: 'Slim', hint: 'Narrow frame' },
          { value: 'average', label: 'Average', hint: 'Medium frame' },
          { value: 'broad', label: 'Broad', hint: 'Wider frame' },
        ], state.shape, function (v) { state.shape = v; }, 'Body shape'));
        scroll.appendChild(el('p', 'ccf-sf-q', 'Preferred fit'));
        scroll.appendChild(cards([
          { value: 'snug', label: 'Snug', hint: 'Close to body' },
          { value: 'regular', label: 'Regular', hint: 'Classic fit' },
          { value: 'relaxed', label: 'Relaxed', hint: 'Loose and easy' },
        ], state.fit, function (v) { state.fit = v; }, 'Preferred fit'));
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
        scroll.appendChild(lbl);
        }

        if (err) foot.appendChild(err);
        var a2 = el('div', 'ccf-sf-actions');
        a2.appendChild(button('ccf-sf-btn', 'Back', function () { state.step = 1; state.error = ''; draw(); }));
        var see = button('ccf-sf-btn ccf-sf-btn-main', state.busy ? 'Working it out…' : 'See my size', getSize);
        see.disabled = state.busy;
        a2.appendChild(see);
        foot.appendChild(a2);
      } else {
        var r = state.result || {};
        var available = sells(r.size);
        var box = el('div', 'ccf-sf-result');
        box.appendChild(el('h2', 'ccf-sf-title', T('resultTitle')));

        var ring = el('div', 'ccf-sf-ring');
        var good = !r.outOfRange;
        var C = 2 * Math.PI * 60;
        ring.innerHTML = '<svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="60" fill="none" stroke="#EEECE8" stroke-width="6"/>' +
          '<circle cx="66" cy="66" r="60" fill="none" stroke="' + (good ? '#2F6B4F' : '#B7791F') + '" stroke-width="6" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (good ? 0 : C * 0.3).toFixed(1) + '" transform="rotate(-90 66 66)"/></svg>';
        var sz = el('div', 'ccf-sf-size', r.size || '?');
        sz.setAttribute('aria-label', 'Recommended size');
        ring.appendChild(sz);
        ring.appendChild(el('span', 'ccf-sf-ring-label', good ? 'Best fit' : 'Closest fit'));
        box.appendChild(ring);

        box.appendChild(el('p', 'ccf-sf-verdict', r.outOfRange
          ? (r.size + ' is our largest size — it may feel tight. Check the size chart below.')
          : (r.size + ' lines up best with your measurements and the fit you chose.')));

        (r.reasons || []).forEach(function (x) {
          var row = el('div', 'ccf-sf-reason' + (x.status === 'info' ? ' is-info' : x.status === 'right' ? '' : ' is-warn'));
          row.appendChild(el('span', null, x.area.charAt(0).toUpperCase() + x.area.slice(1)));
          if (x.status === 'info') {
            var len = state.hUnit === 'ft' ? (Math.round(x.value / CM_PER_IN * 10) / 10) + ' in' : x.value + ' cm';
            row.appendChild(el('span', 'ccf-sf-muted', 'Garment length ' + len));
          } else {
            row.appendChild(el('span', x.status === 'right' ? 'ccf-sf-ok' : 'ccf-sf-warn', REASON_TEXT[x.status] || ''));
          }
          box.appendChild(row);
        });

        var chartSizes = ((settings.charts && settings.charts[state.gender]) || []).map(function (c) { return String(c.size); });
        if (chartSizes.length) {
          var strip = el('div', 'ccf-sf-strip');
          strip.setAttribute('aria-hidden', 'true');
          chartSizes.forEach(function (s) {
            strip.appendChild(el('span', s === String(r.size) ? 'is-you' : (!sells(s) ? 'is-missing' : null), s));
          });
          box.appendChild(strip);
        }

        var meter = el('div', 'ccf-sf-meter');
        meter.setAttribute('aria-hidden', 'true');
        var bar = el('div', 'ccf-sf-meter-bar');
        var dot = el('span', 'ccf-sf-meter-dot');
        dot.style.left = meterPosition(r.reasons) + '%';
        bar.appendChild(dot);
        meter.appendChild(bar);
        var ml = el('div', 'ccf-sf-meter-labels');
        ['Snug', 'Just right', 'Roomy'].forEach(function (t) { ml.appendChild(el('span', null, t)); });
        meter.appendChild(ml);
        box.appendChild(meter);

        if (!available) box.appendChild(el('p', 'ccf-sf-note', 'This product doesn’t come in ' + r.size + '. Check the size chart for the closest size.'));
        if (r.saved) box.appendChild(el('p', 'ccf-sf-note', 'Saved — we’ll remember ' + r.size + ' for next time.'));
        box.appendChild(el('p', 'ccf-sf-note', 'Based on your height, weight and answers, compared with this product’s size chart. It’s a guide, not a guarantee.'));

        var links = el('div', 'ccf-sf-links');
        if (opts.sizeChart) links.appendChild(button('ccf-sf-link', state.showChart ? 'Hide size chart' : 'View size chart', function () { state.showChart = !state.showChart; draw(); }));
        links.appendChild(button('ccf-sf-link', 'Edit details', function () { state.step = 1; state.result = null; state.error = ''; draw(); estimateSoon(0); }));
        box.appendChild(links);
        if (opts.sizeChart && state.showChart) box.appendChild(chartTable(state.gender, r.size));
        scroll.appendChild(box);

        if (err) foot.appendChild(err);
        var a3 = el('div', 'ccf-sf-actions');
        if (available) {
          if (opts.addToBag && addButton()) {
            a3.appendChild(button('ccf-sf-btn', 'Select ' + r.size, function () { chooseSize(r.size, false); }, 'Select size ' + r.size + ' on the page'));
            a3.appendChild(button('ccf-sf-btn ccf-sf-btn-main', T('addToBagText', r.size), function () { chooseSize(r.size, true); }));
          } else {
            a3.appendChild(button('ccf-sf-btn ccf-sf-btn-main', 'Select size ' + r.size, function () { chooseSize(r.size, false); }));
          }
        } else {
          a3.appendChild(button('ccf-sf-btn ccf-sf-btn-main', 'Close', close));
        }
        foot.appendChild(a3);
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
