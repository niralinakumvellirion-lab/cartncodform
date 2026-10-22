(function () {
  'use strict';

  // ── Shared config promise (one fetch per page, shared across re-inserts) ────
  var _configPromise = null;

  function fetchConfig(shopDomain) {
    if (!_configPromise) {
      _configPromise = fetch(
        '/apps/cartncodform/discount-config?shop=' + encodeURIComponent(shopDomain)
      ).then(function (r) { return r.json(); }).catch(function () { return null; });
    }
    return _configPromise;
  }

  // ── Session ID ──────────────────────────────────────────────────────────────
  function getSessionId(shopDomain) {
    var key = 'ccf_analytics_session_' + shopDomain;
    try {
      var existing = localStorage.getItem(key);
      if (existing) return existing;
      var id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      localStorage.setItem(key, id);
      return id;
    } catch (e) { return ''; }
  }

  // ── localStorage gates ──────────────────────────────────────────────────────
  function getBdayKey(shopDomain)  { return 'ccf_bday_' + shopDomain; }
  function getSkipKey(shopDomain)  { return 'ccf_bday_pp_skip_' + shopDomain; }

  function isAlreadySaved(shopDomain) {
    try { return !!localStorage.getItem(getBdayKey(shopDomain)); } catch (e) { return false; }
  }

  function isSkippedRecently(shopDomain) {
    try {
      var ts = localStorage.getItem(getSkipKey(shopDomain));
      if (!ts) return false;
      return (Date.now() - parseInt(ts, 10)) < 7 * 24 * 60 * 60 * 1000;
    } catch (e) { return false; }
  }

  function markSaved(shopDomain) {
    try { localStorage.setItem(getBdayKey(shopDomain), '1'); } catch (e) {}
  }

  function markSkipped(shopDomain) {
    try { localStorage.setItem(getSkipKey(shopDomain), String(Date.now())); } catch (e) {}
  }

  // ── SVG helpers ─────────────────────────────────────────────────────────────
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgAttr(el, attrs) {
    var keys = Object.keys(attrs);
    for (var i = 0; i < keys.length; i++) {
      el.setAttribute(keys[i], String(attrs[i]));
    }
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) svgAttr(e, attrs);
    return e;
  }

  function makeGiftSvg(strokeColor) {
    var s = svgEl('svg', { width: '28', height: '28', viewBox: '0 0 24 24', fill: 'none',
      stroke: strokeColor, 'stroke-width': '1.8', 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.appendChild(svgEl('rect',  { x: '3',  y: '10', width: '18', height: '11', rx: '1' }));
    s.appendChild(svgEl('rect',  { x: '2',  y: '7',  width: '20', height: '3',  rx: '1' }));
    s.appendChild(svgEl('line',  { x1: '12', y1: '7', x2: '12', y2: '21' }));
    s.appendChild(svgEl('path',  { d: 'M12 7C12 7 11 4 9 3C7 2 6 3 7 5C8 7 12 7 12 7Z' }));
    s.appendChild(svgEl('path',  { d: 'M12 7C12 7 13 4 15 3C17 2 18 3 17 5C16 7 12 7 12 7Z' }));
    return s;
  }

  function makeCheckSvg(strokeColor) {
    var s = svgEl('svg', { width: '24', height: '24', viewBox: '0 0 24 24', fill: 'none',
      stroke: strokeColor, 'stroke-width': '2.5', 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '10' }));
    s.appendChild(svgEl('path',   { d: 'M7 12.5l3.5 3.5 6-7' }));
    return s;
  }

  function makeArrowSvg() {
    var s = svgEl('svg', { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.appendChild(svgEl('path', { d: 'M5 12h14M13 6l6 6-6 6' }));
    return s;
  }

  // Tiny 4-pointed star sparkle
  function makeSparkle(size, opacity) {
    var s = svgEl('svg', { width: String(size), height: String(size),
      viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' });
    var p = svgEl('path', {
      d: 'M8 1 L9 7 L15 8 L9 9 L8 15 L7 9 L1 8 L7 7 Z',
      fill: 'rgba(255,255,255,' + opacity + ')',
    });
    s.appendChild(p);
    return s;
  }

  // ── Color helpers ───────────────────────────────────────────────────────────
  function hexToRgb(hex) {
    var n = parseInt(String(hex).replace(/^#/, ''), 16);
    return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF];
  }

  function darkenHex(hex, amount) {
    var rgb = hexToRgb(hex);
    return '#' + rgb.map(function (v) {
      return ('0' + Math.round(v * (1 - amount)).toString(16)).slice(-2);
    }).join('');
  }

  function rgbaFromHex(hex, alpha) {
    var rgb = hexToRgb(hex);
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
  }

  // ── CSS builder ─────────────────────────────────────────────────────────────
  function buildCss(c) {
    var accent     = c.accent      || '#4F46E5';
    var stubFg     = c.stubFg      || '#FFFFFF';
    var sealText   = c.sealText    || accent;
    var bodyBg     = c.bodyBg      || '#FFFFFF';
    var text       = c.text        || '#18181B';
    var muted      = c.muted       || '#71717A';
    var fieldBg    = c.fieldBg     || '#FFFFFF';
    var fldBorder  = c.fieldBorder || '#D4D4D8';
    var chkBorder  = c.checkBorder || '#71717A';
    var btnFg      = c.btnFg       || '#FFFFFF';
    var err        = c.err         || '#DC2626';
    var errBg      = c.errBg       || '#FEE2E2';
    var ok         = c.ok          || '#16A34A';
    var ring       = c.ring        || rgbaFromHex(accent, 0.30);
    var sealSheen  = c.sealSheen   || rgbaFromHex(accent, 0.30);
    var hlStub     = c.hlStub      || rgbaFromHex(stubFg, 0.34);
    var hlBody     = c.hlBody      || rgbaFromHex(accent, 0.26);
    var sealText2  = c.sealText2   || sealText;
    var ribbon     = darkenHex(accent, 0.28);

    var notchStubR  = 'radial-gradient(circle 11px at 100% 0%,#0000 97%,#000),' +
                      'radial-gradient(circle 11px at 100% 100%,#0000 97%,#000)';
    var notchBodyL  = 'radial-gradient(circle 11px at 0% 0%,#0000 97%,#000),' +
                      'radial-gradient(circle 11px at 0% 100%,#0000 97%,#000)';
    var notchStubB  = 'radial-gradient(circle 11px at 0 100%,#0000 97%,#000),' +
                      'radial-gradient(circle 11px at 100% 100%,#0000 97%,#000)';
    var notchBodyT  = 'radial-gradient(circle 11px at 0 0,#0000 97%,#000),' +
                      'radial-gradient(circle 11px at 100% 0,#0000 97%,#000)';
    var dashedColor = (stubFg === '#FFFFFF') ? 'rgba(255,255,255,0.45)' : 'rgba(23,26,34,0.45)';

    return [
      // host — inherit font so it matches store font
      ':host{display:block;font-family:inherit;color:inherit;}',

      // ── Card wrapper ─────────────────────────────────────────────────────────
      '.ccf-bp-card{margin:16px 0;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.12));}',

      // ── CLOSED TEASER ────────────────────────────────────────────────────────
      // Teaser: horizontal ticket layout (flex row)
      '.ccf-bp-teaser{display:flex;width:100%;min-height:44px;border:none;padding:0;',
      'background:none;cursor:pointer;text-align:left;border-radius:0;',
      'filter:drop-shadow(0 2px 8px rgba(0,0,0,0.12));}',
      '.ccf-bp-teaser:focus-visible{outline:3px solid ' + ring + ';outline-offset:2px;border-radius:4px;}',

      // Teaser stub (left — accent bg)
      '.ccf-bp-tstub{background:' + accent + ';',
      'background-image:radial-gradient(circle 1.5px at 50% 50%,rgba(255,255,255,0.18) 100%,transparent 100%);',
      'background-size:12px 12px;',
      'min-width:88px;display:flex;flex-direction:column;align-items:center;',
      'justify-content:center;gap:6px;padding:12px 10px;position:relative;',
      'border-radius:16px 0 0 16px;',
      'mask:' + notchStubR + ';mask-composite:intersect;',
      '-webkit-mask:' + notchStubR + ';-webkit-mask-composite:source-in;}',

      // Ribbon decoration — thin horizontal band through stub center
      '.ccf-bp-ribbon{position:absolute;left:0;right:0;top:50%;height:8px;',
      'transform:translateY(-50%);background:' + ribbon + ';opacity:0.55;pointer-events:none;}',

      // Gift art + sparkles container
      '.ccf-bp-gift-wrap{position:relative;display:flex;align-items:center;justify-content:center;}',

      // Sparkles (positioned absolutely around the gift icon)
      '.ccf-bp-sp1{position:absolute;top:-8px;left:-4px;}',
      '.ccf-bp-sp2{position:absolute;top:-4px;right:-6px;}',
      '.ccf-bp-sp3{position:absolute;bottom:-6px;right:-2px;}',

      // Sparkle twinkle — opacity only (never transform)
      '@keyframes ccfSparkle1{0%,100%{opacity:0.9}50%{opacity:0.25}}',
      '@keyframes ccfSparkle2{0%,100%{opacity:0.5}50%{opacity:1.0}}',
      '@keyframes ccfSparkle3{0%,100%{opacity:0.7}70%{opacity:0.2}}',
      '.ccf-bp-sp1{animation:ccfSparkle1 2.4s ease-in-out infinite;}',
      '.ccf-bp-sp2{animation:ccfSparkle2 3.1s ease-in-out infinite 0.8s;}',
      '.ccf-bp-sp3{animation:ccfSparkle3 2.8s ease-in-out infinite 1.5s;}',

      // Teaser body (right — box bg)
      '.ccf-bp-tbody{flex:1;background:' + bodyBg + ';padding:12px 14px;',
      'display:flex;flex-direction:column;justify-content:center;gap:8px;',
      'border-radius:0 16px 16px 0;position:relative;',
      'mask:' + notchBodyL + ';mask-composite:intersect;',
      '-webkit-mask:' + notchBodyL + ';-webkit-mask-composite:source-in;}',

      // Dashed vertical seam — aria-hidden span
      '.ccf-bp-dashed-v{position:absolute;top:10px;bottom:10px;left:0;display:block;',
      'border-left:2px dashed ' + dashedColor + ';pointer-events:none;}',

      // Unlock title inside teaser body
      '.ccf-bp-unlock-title{font-size:14px;font-weight:700;color:' + text + ';line-height:1.3;margin:0;}',

      // CTA pill inside teaser body
      '.ccf-bp-cta-pill{display:inline-flex;align-items:center;gap:5px;',
      'background:' + accent + ';color:' + btnFg + ';font-size:12px;font-weight:700;',
      'padding:5px 12px;border-radius:20px;position:relative;overflow:hidden;}',

      // Gloss layer on CTA pill
      '.ccf-bp-cta-pill::before{content:"";position:absolute;inset:0 0 50% 0;',
      'background:linear-gradient(180deg,rgba(255,255,255,0.26) 0%,rgba(255,255,255,0) 100%);',
      'pointer-events:none;border-radius:inherit;}',

      // Sheen sweep on CTA pill
      '@keyframes ccfSheen{0%{transform:translateX(-120%)}25%,100%{transform:translateX(220%)}}',
      '.ccf-bp-cta-pill::after{content:"";position:absolute;inset:0;',
      'background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.45) 50%,transparent 60%);',
      'pointer-events:none;animation:ccfSheen 3.8s ease-in-out infinite;}',

      // Pill text must stay on top of gloss/sheen
      '.ccf-bp-cta-text{position:relative;z-index:1;}',
      '.ccf-bp-cta-pill svg{position:relative;z-index:1;}',

      '.ccf-bp-teaser:hover .ccf-bp-cta-pill{filter:brightness(1.08);}',
      '.ccf-bp-teaser:active .ccf-bp-cta-pill{transform:translateY(1px);}',

      // @supports fallback for mask — teaser
      '@supports not (mask:none){',
      '.ccf-bp-tstub{mask:none;-webkit-mask:none;border-radius:16px 0 0 16px;}',
      '.ccf-bp-tbody{mask:none;-webkit-mask:none;border-radius:0 16px 16px 0;}',
      '.ccf-bp-teaser{overflow:hidden;border-radius:16px;}}',

      // ── FORM CONTAINER ───────────────────────────────────────────────────────
      '.ccf-bp-form{opacity:0;transition:opacity 0.3s ease;}',
      '.ccf-bp-form.ccf-bp-visible{opacity:1;}',

      // Gift card (vertical — stub top, body bottom)
      // Stub — top radius 16px, notch mask cuts bottom corners
      '.ccf-bp-stub{background:' + accent + ';padding:16px 14px;',
      'display:flex;align-items:center;justify-content:space-between;gap:12px;',
      'border-radius:16px 16px 0 0;position:relative;',
      'mask:' + notchStubB + ';mask-composite:intersect;',
      '-webkit-mask:' + notchStubB + ';-webkit-mask-composite:source-in;}',
      '.ccf-bp-stub-text{flex:1;min-width:0;}',
      '.ccf-bp-stub-heading{font-size:15px;font-weight:700;color:' + stubFg + ';',
      'margin:0 0 4px;line-height:1.3;}',
      '.ccf-bp-stub-sub{font-size:12px;color:' + stubFg + ';opacity:0.85;margin:0;line-height:1.45;}',
      '.ccf-bp-hl{background:' + hlStub + ';border-radius:2px;padding:0 2px;}',

      // Seal (circular)
      '.ccf-bp-seal{width:74px;height:74px;flex-shrink:0;border-radius:50%;',
      'background:#FFFFFF;display:flex;flex-direction:column;align-items:center;',
      'justify-content:center;transform:rotate(-8deg);position:relative;',
      'box-shadow:0 2px 8px rgba(0,0,0,0.15);}',
      '.ccf-bp-seal-ring{position:absolute;inset:5px;border-radius:50%;',
      'border:1.5px dashed ' + sealText + ';pointer-events:none;}',
      // Seal ring shimmer
      '@keyframes ccfSealShimmer{0%,100%{opacity:0.3}50%{opacity:0.65}}',
      '.ccf-bp-seal-ring{animation:ccfSealShimmer 4s ease-in-out infinite;}',
      '.ccf-bp-seal-pct{font-size:13px;font-weight:800;letter-spacing:-0.5px;line-height:1;',
      'background:linear-gradient(180deg,' + sealText + ' 0%,' + sealText2 + ' 100%);',
      '-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}',
      // Seal SVG: must not be overridden by theme — inside shadow root this is safe
      '.ccf-bp-seal svg{display:block;width:28px;height:28px;flex-shrink:0;}',

      // Dashed horizontal separator
      '.ccf-bp-dashed{position:absolute;left:22px;right:22px;bottom:0;display:block;',
      'border-bottom:2px dashed ' + dashedColor + ';pointer-events:none;}',

      // Body — bottom radius 16px, notch mask cuts top corners
      '.ccf-bp-body{background:' + bodyBg + ';padding:14px 14px 12px;',
      'border-radius:0 0 16px 16px;',
      'mask:' + notchBodyT + ';mask-composite:intersect;',
      '-webkit-mask:' + notchBodyT + ';-webkit-mask-composite:source-in;}',
      '.ccf-bp-body-hl{background:' + hlBody + ';border-radius:2px;padding:0 2px;}',

      // @supports fallback — form card
      '@supports not (mask:none){',
      '.ccf-bp-stub{mask:none;-webkit-mask:none;border-radius:16px 16px 0 0;}',
      '.ccf-bp-body{mask:none;-webkit-mask:none;border-radius:0 0 16px 16px;}}',

      // Email input
      '.ccf-bp-email{width:100%;height:44px;font-size:16px;padding:0 12px;',
      'box-sizing:border-box;border:1px solid ' + fldBorder + ';border-radius:8px;',
      'background:' + fieldBg + ';color:' + text + ';margin-bottom:8px;display:block;',
      'outline:none;transition:border-color 0.15s,box-shadow 0.15s;}',
      '.ccf-bp-email:hover{border-color:' + ring + ';box-shadow:0 0 0 2px ' + ring + ';}',
      '.ccf-bp-email:focus{border-color:' + accent + ';box-shadow:0 0 0 3px ' + ring + ';}',

      // Month/day row
      '.ccf-bp-date-row{display:flex;gap:8px;margin-bottom:8px;}',
      '.ccf-bp-select{flex:1;height:44px;font-size:16px;padding:0 8px;',
      'box-sizing:border-box;border:1px solid ' + fldBorder + ';border-radius:8px;',
      'background:' + fieldBg + ';color:' + text + ';-webkit-appearance:none;',
      'outline:none;transition:border-color 0.15s,box-shadow 0.15s;}',
      '.ccf-bp-select:hover{border-color:' + ring + ';box-shadow:0 0 0 2px ' + ring + ';}',
      '.ccf-bp-select:focus{border-color:' + accent + ';box-shadow:0 0 0 3px ' + ring + ';}',

      // Error states on inputs
      '.ccf-bp-select.ccf-bp-error{border-color:' + err + ' !important;}',
      '.ccf-bp-email.ccf-bp-error{border-color:' + err + ' !important;}',

      // Consent row
      '.ccf-bp-consent{display:flex;gap:8px;align-items:flex-start;',
      'margin-bottom:10px;margin-top:2px;}',
      '.ccf-bp-check{width:18px;height:18px;flex-shrink:0;margin-top:1px;',
      'accent-color:' + accent + ';border:1px solid ' + chkBorder + ';}',
      '.ccf-bp-consent-text{font-size:12px;color:' + muted + ';line-height:1.4;}',

      // Error box
      '.ccf-bp-err-box{background:' + errBg + ';border-radius:6px;',
      'padding:6px 10px;margin-bottom:8px;}',
      '.ccf-bp-msg-err{font-size:12px;color:' + err + ';margin:0;}',

      // Save button — glossy + sheen
      '.ccf-bp-btn{width:100%;height:46px;font-size:15px;font-weight:700;',
      'background:' + accent + ';color:' + btnFg + ';border:none;border-radius:10px;',
      'cursor:pointer;margin-bottom:8px;position:relative;overflow:hidden;',
      'outline:none;transition:filter 0.15s,transform 0.08s;}',
      '.ccf-bp-btn::before{content:"";position:absolute;inset:0 0 50% 0;',
      'background:linear-gradient(180deg,rgba(255,255,255,0.26) 0%,rgba(255,255,255,0) 100%);',
      'pointer-events:none;}',
      '.ccf-bp-btn::after{content:"";position:absolute;inset:0;',
      'background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.45) 50%,transparent 60%);',
      'pointer-events:none;animation:ccfSheen 3.8s ease-in-out infinite 1.2s;}',
      '.ccf-bp-btn-text{position:relative;z-index:1;}',
      '.ccf-bp-btn:hover{filter:brightness(1.08);}',
      '.ccf-bp-btn:active{transform:translateY(1px);}',
      '.ccf-bp-btn:focus-visible{outline:3px solid ' + ring + ';outline-offset:2px;}',

      // Skip link
      '.ccf-bp-skip{display:block;width:100%;font-size:13px;color:' + muted + ';',
      'background:none;border:none;cursor:pointer;text-align:center;padding:4px 0;',
      'outline:none;border-radius:4px;}',
      '.ccf-bp-skip:hover{background:' + ring + ';}',
      '.ccf-bp-skip:focus-visible{outline:3px solid ' + ring + ';outline-offset:2px;}',

      // Success message
      '.ccf-bp-msg-ok{font-size:14px;font-weight:600;color:' + ok + ';',
      'text-align:center;padding:12px 0;display:flex;align-items:center;',
      'justify-content:center;gap:8px;}',
      // Success SVG — explicit size inside shadow root
      '.ccf-bp-msg-ok svg{display:block;width:24px;height:24px;flex-shrink:0;}',

      // Design-mode placeholder
      '.ccf-bp-design-placeholder{border:2px dashed #D4D4D8;border-radius:12px;',
      'padding:16px;text-align:center;font-size:13px;color:#9ca3af;margin:16px 0;}',

      // ── Reduced motion ───────────────────────────────────────────────────────
      '@media (prefers-reduced-motion:reduce){',
      '.ccf-bp-sp1,.ccf-bp-sp2,.ccf-bp-sp3{animation:none;}',
      '.ccf-bp-seal-ring{animation:none;opacity:0.3;}',
      '.ccf-bp-cta-pill::after,.ccf-bp-btn::after{animation:none;}',
      '.ccf-bp-form{transition:none;}',
      '.ccf-bp-email,.ccf-bp-select,.ccf-bp-btn,.ccf-bp-skip{transition:none;}}',
    ].join('');
  }

  // ── Text highlight: wrap pct% and days values in a span ───────────────────
  // Returns a document fragment with plain text and highlighted spans.
  function highlightText(text, pct, days, hlClass) {
    var frag = document.createDocumentFragment();
    var needle;
    var remaining = text;
    var patterns = [];
    if (pct) patterns.push(String(pct) + '%');
    if (days) patterns.push(String(days) + ' days');
    if (!patterns.length) { frag.appendChild(document.createTextNode(text)); return frag; }
    // Find all pattern positions
    var positions = [];
    for (var pi = 0; pi < patterns.length; pi++) {
      needle = patterns[pi];
      var idx = remaining.indexOf(needle);
      while (idx !== -1) {
        positions.push({ start: idx, end: idx + needle.length, needle: needle });
        idx = remaining.indexOf(needle, idx + 1);
      }
    }
    if (!positions.length) { frag.appendChild(document.createTextNode(text)); return frag; }
    positions.sort(function (a, b) { return a.start - b.start; });
    var pos = 0;
    for (var i = 0; i < positions.length; i++) {
      var p = positions[i];
      if (p.start < pos) continue;
      if (p.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, p.start)));
      var span = document.createElement('span');
      span.className = hlClass;
      span.textContent = p.needle;
      frag.appendChild(span);
      pos = p.end;
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    return frag;
  }

  // ── Months helper ───────────────────────────────────────────────────────────
  var MONTHS = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];

  // ── Unique id counter ───────────────────────────────────────────────────────
  var _instanceCount = 0;

  // ── Custom element ──────────────────────────────────────────────────────────
  var CCFBirthdayBox = (function () {
    function CCFBirthdayBox() {
      return Reflect.construct(HTMLElement, [], CCFBirthdayBox);
    }

    CCFBirthdayBox.prototype = Object.create(HTMLElement.prototype, {
      constructor: { value: CCFBirthdayBox, writable: true, configurable: true },
    });

    CCFBirthdayBox.prototype.connectedCallback = function () {
      if (this._rendered) return;
      this._rendered = true;
      var self = this;
      var shop = String(this.getAttribute('data-shop') || '');
      var isDesignMode = this.getAttribute('data-design-mode') === 'true';

      // Attach open shadow root — isolates all CSS from theme
      var shadow = this.attachShadow({ mode: 'open' });

      if (isDesignMode) {
        var styleEl = document.createElement('style');
        styleEl.textContent = ':host{display:block;}' +
          '.ccf-bp-design-placeholder{border:2px dashed #D4D4D8;border-radius:12px;' +
          'padding:16px;text-align:center;font-size:13px;color:#9ca3af;margin:16px 0;}';
        var ph = document.createElement('div');
        ph.className = 'ccf-bp-design-placeholder';
        ph.textContent = 'Birthday box — configure in the CartnCodForm admin';
        shadow.appendChild(styleEl);
        shadow.appendChild(ph);
        return;
      }

      if (!shop) return;
      if (isAlreadySaved(shop)) return;
      if (isSkippedRecently(shop)) return;

      fetchConfig(shop).then(function (data) {
        if (!data) return;
        var pp = data.birthdayCapture && data.birthdayCapture.productPage;
        if (!pp || !pp.enabled) return;

        var colors = pp.colors || {};
        var pct    = (pp.pct != null) ? String(pp.pct) : '15';
        var pctNum = parseInt(pct, 10);
        var daysNum = null;

        var copy = pp.copy || {};
        var uid  = 'ccf-bp-consent-' + shop.replace(/[^a-z0-9]/g, '-') + '-' + (++_instanceCount);
        var formId = 'ccf-bp-form-' + uid;

        // Inject styles into shadow root
        var styleEl = document.createElement('style');
        styleEl.textContent = buildCss(colors);
        shadow.appendChild(styleEl);

        // ── CLOSED TEASER ────────────────────────────────────────────────────
        var teaserBtn = document.createElement('button');
        teaserBtn.type = 'button';
        teaserBtn.className = 'ccf-bp-teaser';
        teaserBtn.setAttribute('aria-expanded', 'false');
        teaserBtn.setAttribute('aria-controls', formId);

        // Teaser stub (left)
        var tstub = document.createElement('div');
        tstub.className = 'ccf-bp-tstub';

        var ribbon = document.createElement('div');
        ribbon.className = 'ccf-bp-ribbon';
        ribbon.setAttribute('aria-hidden', 'true');
        tstub.appendChild(ribbon);

        // Gift art wrapper (gift SVG + 3 sparkles)
        var giftWrap = document.createElement('div');
        giftWrap.className = 'ccf-bp-gift-wrap';
        giftWrap.setAttribute('aria-hidden', 'true');

        var sp1 = document.createElement('span');
        sp1.className = 'ccf-bp-sp1';
        sp1.appendChild(makeSparkle(8, 0.85));
        var sp2 = document.createElement('span');
        sp2.className = 'ccf-bp-sp2';
        sp2.appendChild(makeSparkle(6, 0.7));
        var sp3 = document.createElement('span');
        sp3.className = 'ccf-bp-sp3';
        sp3.appendChild(makeSparkle(7, 0.6));

        giftWrap.appendChild(sp1);
        giftWrap.appendChild(sp2);
        giftWrap.appendChild(sp3);
        giftWrap.appendChild(makeGiftSvg('#FFFFFF'));
        tstub.appendChild(giftWrap);
        teaserBtn.appendChild(tstub);

        // Teaser body (right)
        var tbody = document.createElement('div');
        tbody.className = 'ccf-bp-tbody';

        // Dashed vertical line at seam
        var dashedV = document.createElement('span');
        dashedV.setAttribute('aria-hidden', 'true');
        dashedV.className = 'ccf-bp-dashed-v';
        tbody.appendChild(dashedV);

        // Unlock title with pct highlight
        var unlockTitleEl = document.createElement('p');
        unlockTitleEl.className = 'ccf-bp-unlock-title';
        var unlockTitleText = copy.unlockTitle || ('Unlock ' + pct + '% off your birthday gift');
        unlockTitleEl.appendChild(highlightText(unlockTitleText, pctNum, daysNum, 'ccf-bp-hl'));
        tbody.appendChild(unlockTitleEl);

        // CTA pill
        var ctaPill = document.createElement('span');
        ctaPill.className = 'ccf-bp-cta-pill';
        var ctaText = document.createElement('span');
        ctaText.className = 'ccf-bp-cta-text';
        ctaText.textContent = copy.openButton || 'Open my gift';
        ctaPill.appendChild(ctaText);
        ctaPill.appendChild(makeArrowSvg());
        tbody.appendChild(ctaPill);

        teaserBtn.appendChild(tbody);
        shadow.appendChild(teaserBtn);

        // ── OPEN FORM CONTAINER ──────────────────────────────────────────────
        var formContainer = document.createElement('div');
        formContainer.className = 'ccf-bp-form';
        formContainer.id = formId;

        // Gift card wrapper
        var card = document.createElement('div');
        card.className = 'ccf-bp-card';

        // Stub section
        var stub = document.createElement('div');
        stub.className = 'ccf-bp-stub';

        var stubText = document.createElement('div');
        stubText.className = 'ccf-bp-stub-text';

        if (copy.heading) {
          var h = document.createElement('div');
          h.className = 'ccf-bp-stub-heading';
          h.appendChild(highlightText(copy.heading, pctNum, daysNum, 'ccf-bp-hl'));
          stubText.appendChild(h);
        }
        if (copy.sub) {
          var sub = document.createElement('div');
          sub.className = 'ccf-bp-stub-sub';
          sub.appendChild(highlightText(copy.sub, pctNum, daysNum, 'ccf-bp-hl'));
          stubText.appendChild(sub);
        }
        stub.appendChild(stubText);

        // Seal
        var sealStroke = colors.sealText || colors.accent || '#4F46E5';
        var seal = document.createElement('div');
        seal.className = 'ccf-bp-seal';

        var sealRing = document.createElement('div');
        sealRing.className = 'ccf-bp-seal-ring';
        seal.appendChild(sealRing);

        seal.appendChild(makeGiftSvg(sealStroke));

        var sealPct = document.createElement('div');
        sealPct.className = 'ccf-bp-seal-pct';
        sealPct.textContent = '−' + pct + '%';
        seal.appendChild(sealPct);

        stub.appendChild(seal);

        var dashedLine = document.createElement('span');
        dashedLine.setAttribute('aria-hidden', 'true');
        dashedLine.className = 'ccf-bp-dashed';
        stub.appendChild(dashedLine);

        card.appendChild(stub);

        // Body section
        var body = document.createElement('div');
        body.className = 'ccf-bp-body';

        // Email
        var emailInput = document.createElement('input');
        emailInput.type = 'email';
        emailInput.className = 'ccf-bp-email';
        emailInput.placeholder = copy.emailPlaceholder || 'Your email';
        emailInput.setAttribute('autocomplete', 'email');
        body.appendChild(emailInput);

        // Month/Day row
        var MAX_DAYS = [0,31,29,31,30,31,30,31,31,30,31,30,31];
        var dateRow = document.createElement('div');
        dateRow.className = 'ccf-bp-date-row';

        var monthSel = document.createElement('select');
        monthSel.className = 'ccf-bp-select';
        var mOpt = document.createElement('option');
        mOpt.value = ''; mOpt.textContent = 'Month';
        monthSel.appendChild(mOpt);
        for (var mi = 0; mi < 12; mi++) {
          var mo = document.createElement('option');
          mo.value = String(mi + 1); mo.textContent = MONTHS[mi];
          monthSel.appendChild(mo);
        }
        dateRow.appendChild(monthSel);

        var daySel = document.createElement('select');
        daySel.className = 'ccf-bp-select';

        function updateDayOptions(m) {
          var prev = daySel.value;
          while (daySel.firstChild) { daySel.removeChild(daySel.firstChild); }
          var d0 = document.createElement('option');
          d0.value = ''; d0.textContent = 'Day'; daySel.appendChild(d0);
          var max = (m >= 1 && m <= 12) ? MAX_DAYS[m] : 31;
          for (var di = 1; di <= max; di++) {
            var dop = document.createElement('option');
            dop.value = String(di); dop.textContent = String(di);
            daySel.appendChild(dop);
          }
          if (Number(prev) >= 1 && Number(prev) <= max) daySel.value = prev;
        }
        updateDayOptions(0);

        monthSel.addEventListener('change', function () {
          updateDayOptions(parseInt(monthSel.value, 10));
        });

        dateRow.appendChild(daySel);
        body.appendChild(dateRow);

        // Consent row
        var consentRow = document.createElement('div');
        consentRow.className = 'ccf-bp-consent';

        var check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'ccf-bp-check';
        check.id = uid;

        var consentLbl = document.createElement('label');
        consentLbl.htmlFor = uid;
        consentLbl.className = 'ccf-bp-consent-text';
        consentLbl.textContent = copy.consent || 'Email me my birthday offer';

        consentRow.appendChild(check);
        consentRow.appendChild(consentLbl);
        body.appendChild(consentRow);

        // Error box
        var errBox = document.createElement('div');
        errBox.className = 'ccf-bp-err-box';
        errBox.style.display = 'none';
        var errMsg = document.createElement('div');
        errMsg.className = 'ccf-bp-msg-err';
        errBox.appendChild(errMsg);
        body.appendChild(errBox);

        // Save button
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ccf-bp-btn';
        var btnText = document.createElement('span');
        btnText.className = 'ccf-bp-btn-text';
        btnText.textContent = copy.button || 'Save my birthday';
        btn.appendChild(btnText);
        body.appendChild(btn);

        // Skip link
        if (copy.skip) {
          var skip = document.createElement('button');
          skip.type = 'button';
          skip.className = 'ccf-bp-skip';
          skip.textContent = copy.skip;
          skip.addEventListener('click', function () {
            markSkipped(shop);
            shadow.innerHTML = '';
          });
          body.appendChild(skip);
        }

        card.appendChild(body);
        formContainer.appendChild(card);
        shadow.appendChild(formContainer);

        // ── Teaser → form transition ─────────────────────────────────────────
        teaserBtn.addEventListener('click', function () {
          teaserBtn.setAttribute('aria-expanded', 'true');
          teaserBtn.style.display = 'none';
          formContainer.classList.add('ccf-bp-visible');
          // Focus email field after transition starts
          setTimeout(function () {
            emailInput.focus();
          }, 50);
        });

        // ── Validation + submit ──────────────────────────────────────────────
        btn.addEventListener('click', function () {
          errBox.style.display = 'none';
          errMsg.textContent = '';

          var emailVal   = emailInput.value.trim().toLowerCase();
          var monthVal   = parseInt(monthSel.value, 10);
          var dayVal     = parseInt(daySel.value, 10);
          var consentVal = check.checked;
          var hasError   = false;

          if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailVal)) {
            emailInput.classList.add('ccf-bp-error');
            errMsg.textContent = copy.emailError || 'Enter a valid email and tick the box.';
            errBox.style.display = '';
            hasError = true;
          } else {
            emailInput.classList.remove('ccf-bp-error');
          }

          if (!monthVal || !dayVal || isNaN(monthVal) || isNaN(dayVal)) {
            monthSel.classList.add('ccf-bp-error');
            daySel.classList.add('ccf-bp-error');
            if (!hasError) {
              errMsg.textContent = copy.error || 'Please select a month and day.';
              errBox.style.display = '';
            }
            hasError = true;
          } else {
            monthSel.classList.remove('ccf-bp-error');
            daySel.classList.remove('ccf-bp-error');
          }

          if (!consentVal) {
            if (!hasError) {
              errMsg.textContent = 'Please accept the consent checkbox.';
              errBox.style.display = '';
            }
            hasError = true;
          }

          if (hasError) return;
          btn.disabled = true;

          var sessionId = getSessionId(shop);
          var params = new URLSearchParams();
          params.set('shop', shop);

          fetch('/apps/cartncodform/birthday?' + params.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              month: monthVal, day: dayVal,
              email: emailVal, consent: true,
              sessionId: sessionId, source: 'product_page',
            }),
          }).then(function (r) { return r.json(); }).then(function (res) {
            if (res && res.ok) {
              markSaved(shop);
              while (body.firstChild) { body.removeChild(body.firstChild); }
              var okMsg = document.createElement('div');
              okMsg.className = 'ccf-bp-msg-ok';
              okMsg.appendChild(makeCheckSvg(colors.ok || '#16A34A'));
              var okSpan = document.createElement('span');
              okSpan.textContent = copy.saved || 'Thanks! Your gift will arrive before your birthday.';
              okMsg.appendChild(okSpan);
              body.appendChild(okMsg);
            } else {
              btn.disabled = false;
              errMsg.textContent = (res && res.message) || copy.error || 'Something went wrong. Please try again.';
              errBox.style.display = '';
            }
          }).catch(function () {
            btn.disabled = false;
            errMsg.textContent = copy.error || 'Something went wrong. Please try again.';
            errBox.style.display = '';
          });
        });
      }).catch(function () {});
    };

    return CCFBirthdayBox;
  }());

  if (typeof customElements !== 'undefined' && !customElements.get('ccf-birthday-box')) {
    customElements.define('ccf-birthday-box', CCFBirthdayBox);
  }
}());
