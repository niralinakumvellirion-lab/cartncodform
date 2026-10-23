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

  // Paint properties that must use inline style (not presentation attributes) so they
  // can't be overridden by CSS inheritance from the host page (Shopify theme sets fill/stroke
  // on svg elements via CSS which crosses shadow-DOM inheritance boundaries).
  var PAINT_PROPS = { fill: 1, stroke: 1, 'stroke-width': 1, 'stroke-linecap': 1, 'stroke-linejoin': 1, opacity: 1 };

  function svgAttr(el, attrs) {
    var keys = Object.keys(attrs);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = String(attrs[keys[i]]);   // FIX: was attrs[i] (integer index → always undefined)
      if (PAINT_PROPS[k]) {
        el.style.setProperty(k, v);    // inline style wins over CSS inherited values
      } else {
        el.setAttribute(k, v);
      }
    }
  }

  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) svgAttr(e, attrs);
    return e;
  }

  // Gift icon — outline stroked, no fill. strokeColor must be a concrete hex/rgb string.
  function makeGiftSvg(strokeColor, size) {
    var sz = String(size || 28);
    var s = svgEl('svg', { width: sz, height: sz, viewBox: '0 0 24 24', fill: 'none',
      stroke: strokeColor, 'stroke-width': '1.8', 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.appendChild(svgEl('rect',  { x: '3',  y: '10', width: '18', height: '11', rx: '1', fill: 'none' }));
    s.appendChild(svgEl('rect',  { x: '2',  y: '7',  width: '20', height: '3',  rx: '1', fill: 'none' }));
    s.appendChild(svgEl('line',  { x1: '12', y1: '7', x2: '12', y2: '21', fill: 'none' }));
    s.appendChild(svgEl('path',  { d: 'M12 7C12 7 11 4 9 3C7 2 6 3 7 5C8 7 12 7 12 7Z', fill: 'none' }));
    s.appendChild(svgEl('path',  { d: 'M12 7C12 7 13 4 15 3C17 2 18 3 17 5C16 7 12 7 12 7Z', fill: 'none' }));
    return s;
  }

  // Check / success icon — circle + checkmark, stroke only.
  function makeCheckSvg(strokeColor) {
    var s = svgEl('svg', { width: '24', height: '24', viewBox: '0 0 24 24', fill: 'none',
      stroke: strokeColor, 'stroke-width': '2.5', 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '10', fill: 'none' }));
    s.appendChild(svgEl('path',   { d: 'M7 12.5l3.5 3.5 6-7', fill: 'none' }));
    return s;
  }

  // Arrow icon — used in CTA pill.
  function makeArrowSvg(strokeColor) {
    var color = strokeColor || '#FFFFFF';
    var s = svgEl('svg', { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none',
      stroke: color, 'stroke-width': '2.5', 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.appendChild(svgEl('path', { d: 'M5 12h14M13 6l6 6-6 6', fill: 'none' }));
    return s;
  }

  // Envelope icon — for email input.
  function makeEnvelopeSvg(strokeColor) {
    var s = svgEl('svg', { width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none',
      stroke: strokeColor, 'stroke-width': '1.8', 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.appendChild(svgEl('rect',  { x: '2',  y: '4',  width: '20', height: '16', rx: '2', fill: 'none' }));
    s.appendChild(svgEl('path',  { d: 'M2 7l10 7 10-7', fill: 'none' }));
    return s;
  }

  // Chevron-down icon — for select dropdowns.
  function makeChevronSvg(strokeColor) {
    var s = svgEl('svg', { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none',
      stroke: strokeColor, 'stroke-width': '2', 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.appendChild(svgEl('path', { d: 'M6 9l6 6 6-6', fill: 'none' }));
    return s;
  }

  // Tiny 4-pointed star sparkle.
  function makeSparkle(size, opacity, fillColor) {
    var fc = fillColor || 'rgba(255,255,255,' + (opacity || 0.7) + ')';
    var sz = String(size || 8);
    var s = svgEl('svg', { width: sz, height: sz,
      viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' });
    s.appendChild(svgEl('path', {
      d: 'M8 1 L9 7 L15 8 L9 9 L8 15 L7 9 L1 8 L7 7 Z',
      fill: fc,
    }));
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

  // Fallback: return val if it looks like a concrete color (hex/rgb/rgba/named), else fb.
  function safeColor(val, fb) {
    var v = String(val || '').trim();
    if (v && v !== 'undefined' && v !== 'null') return v;
    return fb;
  }

  // ── Color helpers (cont.) ───────────────────────────────────────────────────
  // Returns true when hex is a light colour (YIQ perceived brightness > 128).
  function isLightColor(hex) {
    var rgb = hexToRgb(hex);
    return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 128;
  }

  // ── CSS builder ─────────────────────────────────────────────────────────────
  function buildCss(c) {
    var accent     = safeColor(c.accent,      '#4F46E5');
    var stubFg     = safeColor(c.stubFg,      '#FFFFFF');
    var sealText   = safeColor(c.sealText,    accent);
    var bodyBg     = safeColor(c.bodyBg,      '#FFFFFF');
    var text       = safeColor(c.text,        '#18181B');
    var muted      = safeColor(c.muted,       '#71717A');
    var fieldBg    = safeColor(c.fieldBg,     '#FFFFFF');
    var fldBorder  = safeColor(c.fieldBorder, '#D4D4D8');
    var chkBorder  = safeColor(c.checkBorder, '#71717A');
    var btnFg      = safeColor(c.btnFg,       '#FFFFFF');
    var err        = safeColor(c.err,         '#DC2626');
    var errBg      = safeColor(c.errBg,       '#FEE2E2');
    var ok         = safeColor(c.ok,          '#16A34A');
    var ring       = safeColor(c.ring,        rgbaFromHex(accent, 0.30));
    var sealSheen  = safeColor(c.sealSheen,   rgbaFromHex(accent, 0.30));
    // hlStub: darken when stubFg is light (contrast rule), lighten when dark.
    // Old fallback was rgbaFromHex(stubFg,0.34) → white-on-accent, not an accent tint.
    var hlStubFb   = (stubFg === '#FFFFFF') ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.35)';
    var hlStub     = safeColor(c.hlStub,      hlStubFb);
    // hlBody: accent tint — stronger on dark body so it stays visible.
    var hlBodyFb   = rgbaFromHex(accent, isLightColor(bodyBg) ? 0.26 : 0.40);
    var hlBody     = safeColor(c.hlBody,      hlBodyFb);
    var sealText2  = safeColor(c.sealText2,   sealText);
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
      // ── Host reset — prevents Shopify theme CSS from leaking through CSS inheritance ──
      // all:initial resets every CSS property; then re-enable what we need to inherit.
      ':host{all:initial;display:block;font-family:inherit;color:inherit;}',
      // all:initial resets font on form controls — restore inherited font so the
      // teaser, CTA, and form fields use the store's typeface, not browser UA defaults.
      'button,input,select{font:inherit}',

      // SVG base reset — fill:none;stroke:none means shapes are invisible UNLESS overridden
      // by inline styles (set via el.style.setProperty in svgAttr). This ensures:
      //   (a) no shape bleeds when inline styles are absent
      //   (b) the mutation-check test fails (invalid inline → CSS none → invisible)
      'svg{display:block;flex:none;fill:none;stroke:none;}',

      // ── Card wrapper ─────────────────────────────────────────────────────────
      '.ccf-bp-card{margin:16px 0;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.12));}',

      // ── CLOSED TEASER ────────────────────────────────────────────────────────
      '.ccf-bp-teaser{display:flex;width:100%;min-height:132px;border:none;padding:0;',
      'background:none;cursor:pointer;text-align:left;border-radius:0;',
      'filter:drop-shadow(0 2px 8px rgba(0,0,0,0.12));}',
      '.ccf-bp-teaser:focus-visible{outline:3px solid ' + ring + ';outline-offset:2px;border-radius:4px;}',

      // Teaser stub (left — accent bg) — fixed 112px, flex:none
      '.ccf-bp-tstub{background:' + accent + ';',
      'background-image:radial-gradient(circle 1.5px at 50% 50%,rgba(255,255,255,0.18) 100%,transparent 100%);',
      'background-size:12px 12px;',
      'width:112px;flex:none;min-height:132px;box-sizing:border-box;',
      'display:flex;flex-direction:column;align-items:center;',
      'justify-content:center;gap:6px;padding:12px 10px;position:relative;',
      'border-radius:16px 0 0 16px;overflow:hidden;',
      'mask:' + notchStubR + ';mask-composite:intersect;',
      '-webkit-mask:' + notchStubR + ';-webkit-mask-composite:source-in;}',

      // Ribbon decoration
      '.ccf-bp-ribbon{position:absolute;left:0;right:0;top:50%;height:8px;',
      'transform:translateY(-50%);background:' + ribbon + ';opacity:0.55;pointer-events:none;}',

      // Gift art — explicit 78×78 container, flex:none
      '.ccf-bp-gift-wrap{position:relative;display:flex;align-items:center;justify-content:center;',
      'width:78px;height:78px;flex:none;}',

      // Sparkles (positioned absolutely around the gift icon)
      '.ccf-bp-sp1{position:absolute;top:-8px;left:-4px;}',
      '.ccf-bp-sp2{position:absolute;top:-4px;right:-6px;}',
      '.ccf-bp-sp3{position:absolute;bottom:-6px;right:-2px;}',

      '@keyframes ccfSparkle1{0%,100%{opacity:0.9}50%{opacity:0.25}}',
      '@keyframes ccfSparkle2{0%,100%{opacity:0.5}50%{opacity:1.0}}',
      '@keyframes ccfSparkle3{0%,100%{opacity:0.7}70%{opacity:0.2}}',
      '.ccf-bp-sp1{animation:ccfSparkle1 2.4s ease-in-out infinite;}',
      '.ccf-bp-sp2{animation:ccfSparkle2 3.1s ease-in-out infinite 0.8s;}',
      '.ccf-bp-sp3{animation:ccfSparkle3 2.8s ease-in-out infinite 1.5s;}',

      // Teaser body (right — box bg)
      '.ccf-bp-tbody{flex:1;min-width:0;background:' + bodyBg + ';padding:12px 14px;',
      'display:flex;flex-direction:column;justify-content:center;gap:8px;',
      'border-radius:0 16px 16px 0;position:relative;',
      'mask:' + notchBodyL + ';mask-composite:intersect;',
      '-webkit-mask:' + notchBodyL + ';-webkit-mask-composite:source-in;}',

      // Dashed vertical seam
      '.ccf-bp-dashed-v{position:absolute;top:10px;bottom:10px;left:0;display:block;',
      'border-left:2px dashed ' + dashedColor + ';pointer-events:none;}',

      // Unlock title — max 3 lines via line-clamp
      '.ccf-bp-unlock-title{font-size:17px;font-weight:800;color:' + text + ';line-height:1.3;margin:0;',
      'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}',

      // CTA pill — white-space:nowrap prevents wrapping
      '.ccf-bp-cta-pill{display:inline-flex;align-items:center;gap:5px;',
      'background:' + accent + ';color:' + btnFg + ';font-size:14px;font-weight:800;',
      'padding:5px 12px;border-radius:20px;position:relative;overflow:hidden;',
      'white-space:nowrap;min-height:42px;box-sizing:border-box;width:fit-content;}',

      '.ccf-bp-cta-pill::before{content:"";position:absolute;inset:0 0 50% 0;',
      'background:linear-gradient(180deg,rgba(255,255,255,0.26) 0%,rgba(255,255,255,0) 100%);',
      'pointer-events:none;border-radius:inherit;}',

      '@keyframes ccfSheen{0%{transform:translateX(-120%)}25%,100%{transform:translateX(220%)}}',
      '.ccf-bp-cta-pill::after{content:"";position:absolute;inset:0;',
      'background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.45) 50%,transparent 60%);',
      'pointer-events:none;animation:ccfSheen 3.8s ease-in-out infinite;}',

      '.ccf-bp-cta-text{position:relative;z-index:1;}',
      '.ccf-bp-cta-pill svg{position:relative;z-index:1;width:14px;height:14px;flex-shrink:0;}',

      '.ccf-bp-teaser:hover .ccf-bp-cta-pill{filter:brightness(1.08);}',
      '.ccf-bp-teaser:active .ccf-bp-cta-pill{transform:translateY(1px);}',

      '@supports not (mask:none){',
      '.ccf-bp-tstub{mask:none;-webkit-mask:none;border-radius:16px 0 0 16px;}',
      '.ccf-bp-tbody{mask:none;-webkit-mask:none;border-radius:0 16px 16px 0;}',
      '.ccf-bp-teaser{overflow:hidden;border-radius:16px;}}',

      // ── FORM CONTAINER ───────────────────────────────────────────────────────
      '.ccf-bp-form{opacity:0;transition:opacity 0.3s ease;}',
      '.ccf-bp-form.ccf-bp-visible{opacity:1;}',

      // Gift card stub — top
      '.ccf-bp-stub{background:' + accent + ';padding:22px 18px 26px;',
      'display:flex;align-items:center;justify-content:space-between;gap:12px;',
      'border-radius:16px 16px 0 0;position:relative;',
      'mask:' + notchStubB + ';mask-composite:intersect;',
      '-webkit-mask:' + notchStubB + ';-webkit-mask-composite:source-in;}',
      '.ccf-bp-stub-text{flex:1;min-width:0;}',
      '.ccf-bp-stub-heading{font-size:17px;font-weight:800;color:' + stubFg + ';',
      'margin:0 0 4px;line-height:1.3;}',
      '.ccf-bp-stub-sub{font-size:12.5px;color:' + stubFg + ';opacity:0.85;margin:0;line-height:1.45;}',
      '.ccf-bp-hl{background:linear-gradient(transparent 52%,' + hlStub + ' 52%,' + hlStub + ' 92%,transparent 92%);padding:0 2px;}',

      // Seal (circular)
      '.ccf-bp-seal{width:74px;height:74px;flex-shrink:0;border-radius:50%;overflow:hidden;',
      'background:#FFFFFF;display:flex;flex-direction:column;align-items:center;',
      'justify-content:center;transform:rotate(-8deg);position:relative;',
      'box-shadow:0 2px 8px rgba(0,0,0,0.15);}',
      '.ccf-bp-seal-ring{position:absolute;inset:5px;border-radius:50%;',
      'border:1.5px dashed ' + sealText + ';pointer-events:none;}',
      '@keyframes ccfSealShimmer{0%,100%{opacity:0.3}50%{opacity:0.65}}',
      '.ccf-bp-seal-ring{animation:ccfSealShimmer 4s ease-in-out infinite;}',
      '@keyframes ccfSealSheen{0%{transform:translateX(-200%)}30%,100%{transform:translateX(300%)}}',
      '.ccf-bp-seal::after{content:"";position:absolute;inset:0;border-radius:50%;',
      'background:linear-gradient(105deg,transparent 35%,' + sealSheen + ' 50%,transparent 65%);',
      'pointer-events:none;animation:ccfSealSheen 5s ease-in-out infinite 1.2s;}',
      '.ccf-bp-seal-pct{font-size:13px;font-weight:800;letter-spacing:-0.5px;line-height:1;',
      'background:linear-gradient(180deg,' + sealText + ' 0%,' + sealText2 + ' 100%);',
      '-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}',
      '.ccf-bp-seal svg{display:block;width:17px;height:17px;flex-shrink:0;}',

      // Dashed horizontal separator
      '.ccf-bp-dashed{position:absolute;left:22px;right:22px;bottom:0;display:block;',
      'border-bottom:2px dashed ' + dashedColor + ';pointer-events:none;}',

      // Body — bottom radius 16px, notch mask cuts top corners
      '.ccf-bp-body{background:' + bodyBg + ';padding:14px 14px 12px;',
      'border-radius:0 0 16px 16px;',
      'mask:' + notchBodyT + ';mask-composite:intersect;',
      '-webkit-mask:' + notchBodyT + ';-webkit-mask-composite:source-in;}',
      '.ccf-bp-body-hl{background:linear-gradient(transparent 52%,' + hlBody + ' 52%,' + hlBody + ' 92%,transparent 92%);padding:0 2px;}',

      '@supports not (mask:none){',
      '.ccf-bp-stub{mask:none;-webkit-mask:none;border-radius:16px 16px 0 0;}',
      '.ccf-bp-body{mask:none;-webkit-mask:none;border-radius:0 0 16px 16px;}}',

      // Email input with envelope icon wrapper
      '.ccf-bp-email-wrap{position:relative;margin-bottom:8px;}',
      '.ccf-bp-email-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);',
      'pointer-events:none;display:flex;align-items:center;}',
      '.ccf-bp-email{width:100%;height:44px;font-size:16px;padding:0 12px 0 38px;',
      'box-sizing:border-box;border:1px solid ' + fldBorder + ';border-radius:8px;',
      'background:' + fieldBg + ';color:' + text + ';display:block;',
      'outline:none;transition:border-color 0.15s,box-shadow 0.15s;}',
      '.ccf-bp-email:hover{border-color:' + ring + ';box-shadow:0 0 0 2px ' + ring + ';}',
      '.ccf-bp-email:focus{border-color:' + accent + ';box-shadow:0 0 0 3px ' + ring + ';}',

      // Month/day row with chevron wrappers
      '.ccf-bp-date-row{display:flex;gap:8px;margin-bottom:8px;}',
      '.ccf-bp-sel-wrap{flex:1;position:relative;}',
      '.ccf-bp-sel-icon{position:absolute;right:10px;top:50%;transform:translateY(-50%);',
      'pointer-events:none;display:flex;align-items:center;}',
      '.ccf-bp-select{width:100%;height:44px;font-size:16px;padding:0 32px 0 8px;',
      'box-sizing:border-box;border:1px solid ' + fldBorder + ';border-radius:8px;',
      'background:' + fieldBg + ';color:' + text + ';-webkit-appearance:none;appearance:none;',
      'outline:none;transition:border-color 0.15s,box-shadow 0.15s;}',
      '.ccf-bp-select:hover{border-color:' + ring + ';box-shadow:0 0 0 2px ' + ring + ';}',
      '.ccf-bp-select:focus{border-color:' + accent + ';box-shadow:0 0 0 3px ' + ring + ';}',

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

      // Save button — 48px tall, gift icon left of text
      '.ccf-bp-btn{width:100%;height:48px;font-size:15px;font-weight:700;',
      'background:' + accent + ';color:' + btnFg + ';border:none;border-radius:10px;',
      'cursor:pointer;margin-bottom:8px;position:relative;overflow:hidden;',
      'display:flex;align-items:center;justify-content:center;gap:7px;',
      'outline:none;transition:filter 0.15s,transform 0.08s;}',
      '.ccf-bp-btn::before{content:"";position:absolute;inset:0 0 50% 0;',
      'background:linear-gradient(180deg,rgba(255,255,255,0.26) 0%,rgba(255,255,255,0) 100%);',
      'pointer-events:none;}',
      '.ccf-bp-btn::after{content:"";position:absolute;inset:0;',
      'background:linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.45) 50%,transparent 60%);',
      'pointer-events:none;animation:ccfSheen 3.8s ease-in-out infinite 1.2s;}',
      '.ccf-bp-btn-text{position:relative;z-index:1;}',
      '.ccf-bp-btn svg{position:relative;z-index:1;width:18px;height:18px;flex-shrink:0;}',
      '.ccf-bp-btn:hover{filter:brightness(1.08);}',
      '.ccf-bp-btn:active{transform:translateY(1px);}',
      '.ccf-bp-btn:focus-visible{outline:3px solid ' + ring + ';outline-offset:2px;}',

      // Skip link — 36px min-height
      '.ccf-bp-skip{display:block;width:100%;font-size:13px;color:' + muted + ';',
      'background:none;border:none;cursor:pointer;text-align:center;padding:8px 0;',
      'min-height:36px;line-height:20px;',
      'outline:none;border-radius:4px;}',
      '.ccf-bp-skip:hover{background:' + ring + ';}',
      '.ccf-bp-skip:focus-visible{outline:3px solid ' + ring + ';outline-offset:2px;}',

      // ── SAVED SUCCESS CARD ───────────────────────────────────────────────────
      // Replaces the whole form card after save. No stub, no notches.
      '.ccf-bp-success-card{background:' + bodyBg + ';border-radius:16px;',
      'filter:drop-shadow(0 2px 8px rgba(0,0,0,0.12));',
      'padding:20px 16px;display:flex;flex-direction:column;align-items:center;gap:10px;',
      'margin:16px 0;}',
      // Gift + check badge container
      '.ccf-bp-sc-art{position:relative;display:flex;align-items:center;justify-content:center;',
      'width:56px;height:56px;}',
      '.ccf-bp-sc-check-badge{position:absolute;bottom:-2px;right:-4px;',
      'width:22px;height:22px;border-radius:50%;',
      'background:' + ok + ';border:2.5px solid ' + bodyBg + ';',
      'display:flex;align-items:center;justify-content:center;}',
      '.ccf-bp-sc-check-badge svg{width:12px;height:12px;}',
      // Saved text
      '.ccf-bp-sc-text{font-size:14px;font-weight:600;color:' + ok + ';',
      'text-align:center;line-height:1.4;margin:0;}',

      // Success message (legacy — kept for the open-form success path before card replace)
      '.ccf-bp-msg-ok{font-size:14px;font-weight:600;color:' + ok + ';',
      'text-align:center;padding:12px 0;display:flex;align-items:center;',
      'justify-content:center;gap:8px;}',
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
  function highlightText(text, pct, days, hlClass) {
    var frag = document.createDocumentFragment();
    var needle;
    var remaining = text;
    var patterns = [];
    if (pct) patterns.push(String(pct) + '%');
    if (days) patterns.push(String(days) + ' days');
    if (!patterns.length) { frag.appendChild(document.createTextNode(text)); return frag; }
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
      var shop = String(this.getAttribute('data-shop') || '');
      var isDesignMode = this.getAttribute('data-design-mode') === 'true';

      var shadow = this.attachShadow({ mode: 'open' });

      if (isDesignMode) {
        var styleEl = document.createElement('style');
        styleEl.textContent = ':host{all:initial;display:block;}' +
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

        var btnFg  = safeColor(colors.btnFg,  '#FFFFFF');
        var okColor = safeColor(colors.ok,    '#16A34A');
        var sealStroke = safeColor(colors.sealText, safeColor(colors.accent, '#4F46E5'));

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

        // Gift art wrapper (gift SVG 78×78 + 3 sparkles)
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
        giftWrap.appendChild(makeGiftSvg('#FFFFFF', 78));
        tstub.appendChild(giftWrap);
        teaserBtn.appendChild(tstub);

        // Teaser body (right)
        var tbody = document.createElement('div');
        tbody.className = 'ccf-bp-tbody';

        var dashedV = document.createElement('span');
        dashedV.setAttribute('aria-hidden', 'true');
        dashedV.className = 'ccf-bp-dashed-v';
        tbody.appendChild(dashedV);

        var unlockTitleEl = document.createElement('p');
        unlockTitleEl.className = 'ccf-bp-unlock-title';
        var unlockTitleText = copy.unlockTitle || ('Unlock ' + pct + '% off your birthday gift');
        // Unlock title is on bodyBg (white/custom), not accent — use body-hl (accent tint).
        unlockTitleEl.appendChild(highlightText(unlockTitleText, pctNum, daysNum, 'ccf-bp-body-hl'));
        tbody.appendChild(unlockTitleEl);

        var ctaPill = document.createElement('span');
        ctaPill.className = 'ccf-bp-cta-pill';
        var ctaText = document.createElement('span');
        ctaText.className = 'ccf-bp-cta-text';
        ctaText.textContent = copy.openButton || 'Open my gift';
        ctaPill.appendChild(ctaText);
        ctaPill.appendChild(makeArrowSvg(btnFg));
        tbody.appendChild(ctaPill);

        teaserBtn.appendChild(tbody);
        shadow.appendChild(teaserBtn);

        // ── OPEN FORM CONTAINER ──────────────────────────────────────────────
        var formContainer = document.createElement('div');
        formContainer.className = 'ccf-bp-form';
        formContainer.id = formId;

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
        var seal = document.createElement('div');
        seal.className = 'ccf-bp-seal';

        var sealRing = document.createElement('div');
        sealRing.className = 'ccf-bp-seal-ring';
        seal.appendChild(sealRing);

        seal.appendChild(makeGiftSvg(sealStroke, 17));

        var sealPct = document.createElement('div');
        sealPct.className = 'ccf-bp-seal-pct';
        sealPct.textContent = '−15%'.replace('15', pct);
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

        // Email input wrapped with envelope icon
        var emailWrap = document.createElement('div');
        emailWrap.className = 'ccf-bp-email-wrap';

        var emailIconWrap = document.createElement('span');
        emailIconWrap.className = 'ccf-bp-email-icon';
        emailIconWrap.setAttribute('aria-hidden', 'true');
        emailIconWrap.appendChild(makeEnvelopeSvg(safeColor(colors.muted, '#71717A')));
        emailWrap.appendChild(emailIconWrap);

        var emailInput = document.createElement('input');
        emailInput.type = 'email';
        emailInput.className = 'ccf-bp-email';
        emailInput.placeholder = copy.emailPlaceholder || 'Your email';
        emailInput.setAttribute('autocomplete', 'email');
        emailWrap.appendChild(emailInput);
        body.appendChild(emailWrap);

        // Month/Day row — each select in a wrapper with chevron
        var MAX_DAYS = [0,31,29,31,30,31,30,31,31,30,31,30,31];
        var dateRow = document.createElement('div');
        dateRow.className = 'ccf-bp-date-row';

        function makeSelWrap(sel) {
          var w = document.createElement('div');
          w.className = 'ccf-bp-sel-wrap';
          w.appendChild(sel);
          var iconWrap = document.createElement('span');
          iconWrap.className = 'ccf-bp-sel-icon';
          iconWrap.setAttribute('aria-hidden', 'true');
          iconWrap.appendChild(makeChevronSvg(safeColor(colors.muted, '#71717A')));
          w.appendChild(iconWrap);
          return w;
        }

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
        dateRow.appendChild(makeSelWrap(monthSel));

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

        dateRow.appendChild(makeSelWrap(daySel));
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

        // Save button — with gift icon
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ccf-bp-btn';
        btn.appendChild(makeGiftSvg(btnFg, 18));
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
          setTimeout(function () { emailInput.focus(); }, 50);
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
              // ── STEP 3: replace card with success card (no stub) ──────────
              if (card.parentNode) { card.parentNode.removeChild(card); }
              var sc = document.createElement('div');
              sc.className = 'ccf-bp-success-card';

              // Gift art (56px) with sparkles
              var scArt = document.createElement('div');
              scArt.className = 'ccf-bp-sc-art';
              scArt.setAttribute('aria-hidden', 'true');
              var scSp1 = document.createElement('span');
              scSp1.className = 'ccf-bp-sp1';
              scSp1.appendChild(makeSparkle(8, 0.8, okColor));
              var scSp2 = document.createElement('span');
              scSp2.className = 'ccf-bp-sp2';
              scSp2.appendChild(makeSparkle(6, 0.65, okColor));
              var scSp3 = document.createElement('span');
              scSp3.className = 'ccf-bp-sp3';
              scSp3.appendChild(makeSparkle(7, 0.55, okColor));
              scArt.appendChild(scSp1);
              scArt.appendChild(scSp2);
              scArt.appendChild(scSp3);
              scArt.appendChild(makeGiftSvg(okColor, 56));
              // Check badge
              var scBadge = document.createElement('div');
              scBadge.className = 'ccf-bp-sc-check-badge';
              // Simple check SVG inside badge
              var checkSmall = svgEl('svg', { width: '12', height: '12', viewBox: '0 0 24 24', fill: 'none',
                stroke: '#FFFFFF', 'stroke-width': '3', 'stroke-linecap': 'round',
                'stroke-linejoin': 'round', 'aria-hidden': 'true' });
              checkSmall.appendChild(svgEl('path', { d: 'M5 12l5 5L20 7', fill: 'none' }));
              scBadge.appendChild(checkSmall);
              scArt.appendChild(scBadge);

              var scText = document.createElement('p');
              scText.className = 'ccf-bp-sc-text';
              scText.textContent = copy.saved || 'Thanks! Your gift will arrive before your birthday.';
              scText.setAttribute('role', 'status');
              scText.setAttribute('aria-live', 'polite');
              scText.setAttribute('tabindex', '-1');

              sc.appendChild(scArt);
              sc.appendChild(scText);
              formContainer.appendChild(sc);
              // Move focus to saved message so screen readers announce it immediately
              setTimeout(function() { scText.focus(); }, 50);
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
