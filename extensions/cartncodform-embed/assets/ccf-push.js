(function() {
  'use strict';

  var BACKEND_URL = 'https://api.shopireachboost.com';

  // App Proxy URL - serves SW from same origin as store
  var PROXY_SW_URL = window.location.origin + '/apps/cartncodform/sw.js';

  var VAPID_KEY = 'BMPrLf4eInbFu1IpI_ZqyblmkbSYIm0JyukselN80lglfwuBfyaU7kOQZ6FFxo1PjUqh1xnGzd2uVPdJrYEh0Jo';

  var firebaseConfig = {
    apiKey: "AIzaSyASPGdEC4K_acNQYY7AeQvskDQ5Xq4-ecU",
    projectId: "cartncodform",
    messagingSenderId: "133172185047",
    appId: "1:133172185047:web:23be3ca1f3ccf357a62d92",
    authDomain: "cartncodform.firebaseapp.com",
    storageBucket: "cartncodform.appspot.com",
  };

  var SHOP_DOMAIN = window.Shopify && window.Shopify.shop
    ? window.Shopify.shop
    : window.location.hostname;

  var TOKEN_KEY = 'ccf_fcm_token_' + SHOP_DOMAIN;
  var SUBSCRIBED_KEY = 'ccf_subscribed_' + SHOP_DOMAIN;

  // Phase 1 attribution — resolves which push notification (if any) this
  // session's storefront activity should be attributed to. Separate from
  // handlePushClickAttribution() below (which records the click itself and
  // stamps the Shopify cart for order-level attribution): this one persists
  // the job id across page loads for up to 7 days so ordinary trackEvent()
  // calls (revisit, add_to_cart, checkout, etc. — see /api/events) can carry
  // it too, feeding the AttributedEvent funnel model.
  function getAttributionJob() {
    try {
      // Check URL params first (fresh click)
      var params = new URLSearchParams(window.location.search);
      var jobFromUrl = params.get('ccf_job');
      if (jobFromUrl) {
        // Store in sessionStorage for subsequent pages
        localStorage.setItem('ccf_attribution_job', jobFromUrl);
        localStorage.setItem('ccf_attribution_ts', Date.now().toString());
        return jobFromUrl;
      }
      // Check sessionStorage (subsequent pages in same session)
      var storedJob = localStorage.getItem('ccf_attribution_job');
      var storedTs = localStorage.getItem('ccf_attribution_ts');
      if (storedJob && storedTs) {
        // 7-day attribution window
        var age = Date.now() - parseInt(storedTs, 10);
        if (age < 7 * 24 * 60 * 60 * 1000) return storedJob;
        // Expired - clear it
        localStorage.removeItem('ccf_attribution_job');
        localStorage.removeItem('ccf_attribution_ts');
      }
    } catch (e) {}
    return null;
  }


  // ============================================
  // SOFT PUSH PROMPT — intent triggers (Phase D)
  // ============================================
  // No timer. A small soft card is shown when ONE of four intent triggers
  // fires (first match wins, once per session). The native
  // Notification.requestPermission() is only called if the visitor taps Allow.

  var VIEWED_KEY = 'ccf_viewed_products';
  var PROMPT_SHOWN_KEY = 'ccf_prompt_shown'; // sessionStorage
  var PAGE_LOAD_TOKEN_KEY = 'ccf_push_token'; // set to '1' once subscribed
  var DWELL_MS = 1500; // all intent triggers fire within 1-2s

  function ccfProductTitle() {
    var el = document.getElementById('ccf-embed-root');
    var fromAttr = el ? (el.getAttribute('data-product-title') || '') : '';
    if (fromAttr) return fromAttr;
    var m = getProductMeta();
    return (m && m.title) || '';
  }

  function promptAlreadyShown() {
    try { return sessionStorage.getItem(PROMPT_SHOWN_KEY) === 'true'; } catch (e) { return false; }
  }
  function markPromptShown() {
    try { sessionStorage.setItem(PROMPT_SHOWN_KEY, 'true'); } catch (e) {}
  }

  function canPrompt() {
    if (!('Notification' in window)) return false;
    if (Notification.permission !== 'default') return false; // already granted or denied
    if (promptAlreadyShown()) return false;
    if (localStorage.getItem(SUBSCRIBED_KEY) === '1') return false;
    try { if (sessionStorage.getItem('ccf_denied_session')) return false; } catch (e) {}
    return true;
  }

  // discount-feature: lets showSoftPrompt run for an ALREADY-subscribed
  // customer (Notification.permission === 'granted') purely to capture
  // email/phone for a bigger discount — canPrompt() above hard-blocks that
  // case since there's no push permission left to ask for. Reuses
  // promptAlreadyShown() (NOT a raw sessionStorage read) so this stays in
  // sync with the same once-per-session guard every other trigger uses.
  function canPromptForDiscount() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'denied') return false;
    try {
      if (sessionStorage.getItem('ccf_disc_redirected') === '1') return false;
    } catch (e) {}
    if (promptAlreadyShown()) return false;
    return true;
  }

  var PROMPT_COPY = {
    dwell: function (t) { return 'Get notified if ' + (t || 'this product') + ' goes on sale or comes back in stock.'; },
    return_visit: function () { return "You've looked at this before. Want a reminder if the price drops?"; },
    add_to_cart: function () { return 'Want a reminder if you leave something behind?'; },
    exit_intent: function () { return 'Before you go — get notified about deals from this store?'; },
    page_load: function () { return 'Get notified about deals and restocks from this store.'; }
  };

  var promptAutoDismissTimer = null;

  // popup-customizer: appearance config, fetched once from the App Proxy.
  // Stays {} (defaults below) until fetchPopupConfig() resolves.
  // popup-responsive: mobilePopupConfig holds the <=600px overrides.
  var popupConfig = {};
  var mobilePopupConfig = {};

  // discount-feature: which subscribe actions earn a Shopify discount code,
  // their percentages, and the offer headline. Fetched once (fetchDiscountConfig).
  var discountConfig = {};

  function ccfRuleOn(key) {
    var r = discountConfig && discountConfig[key];
    return !!(r && r.enabled);
  }
  function ccfDiscountEnabled() {
    return ccfRuleOn('pushDiscount') || ccfRuleOn('emailDiscount') ||
      ccfRuleOn('phoneDiscount') || ccfRuleOn('bothDiscount');
  }
  function ccfShowEmailField() {
    return ccfRuleOn('emailDiscount') || ccfRuleOn('bothDiscount');
  }
  function ccfShowPhoneField() {
    return false;
  }
  function ccfPct(key) {
    var r = discountConfig && discountConfig[key];
    return (r && r.enabled && r.percentage) ? r.percentage : 0;
  }
  function ccfFieldPct(singleKey) {
    return Math.max(ccfPct(singleKey), ccfPct('bothDiscount')) || 0;
  }
  // Merchant-written offer text for one rule ('' when unset). Raw text —
  // callers must escape it (ccfEscapeHtml) before putting it in innerHTML.
  function ccfOfferText(key) {
    var r = discountConfig && discountConfig[key];
    var t = r && typeof r.offerText === 'string' ? r.offerText.trim() : '';
    return t.slice(0, 120);
  }
  function ccfEscapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Inline SVG icons (Lucide-style paths, ISC licence). stroke=currentColor
  // so they inherit the surrounding text colour; __S__ = size, __M__ = margin.
  var CCF_SVG_OPEN = '<svg xmlns="http://www.w3.org/2000/svg" width="__S__" height="__S__" ' +
    'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
    'style="vertical-align:middle;flex-shrink:0;__M__">';
  var CCF_ICONS = {
    tag: CCF_SVG_OPEN +
      '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/>' +
      '<circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
    gift: CCF_SVG_OPEN +
      '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/>' +
      '<path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/>' +
      '<path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>',
    lock: CCF_SVG_OPEN +
      '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    bag: CCF_SVG_OPEN +
      '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>' +
      '<path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    check: CCF_SVG_OPEN + '<path d="M20 6 9 17l-5-5"/></svg>',
    loader: CCF_SVG_OPEN.replace('<svg ', '<svg class="ccf-spin" ') +
      '<path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'
  };
  function ccfIcon(name, size, marginRight) {
    return CCF_ICONS[name]
      .replace(/__S__/g, String(size))
      .replace('__M__', marginRight ? 'margin-right:6px;' : '');
  }
  // Button label = icon + escaped text (never raw HTML from merchant strings).
  function ccfSetLabel(el, iconKey, text) {
    el.innerHTML = ccfIcon(iconKey, 16, true) + ccfEscapeHtml(text);
  }

  // popup-style: format a real remaining duration (ms, already known to be
  // > 0) as text. Never called with a fabricated per-visitor duration —
  // see ccfResolveStyle()'s countdownSource handling below.
  function ccfFormatCountdown(ms) {
    if (!(ms > 0)) return null;
    var totalSeconds = Math.floor(ms / 1000);
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    if (days > 0) return days + 'd ' + pad(hours) + 'h ' + pad(minutes) + 'm';
    return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
  }

  // Ticks `el`'s text every second toward a real endsAtMs timestamp, and
  // removes `containerEl` from the DOM once the deadline passes (a
  // countdown that reaches zero is no longer a real deadline to show).
  // Returns nothing — the interval clears itself.
  function ccfStartCountdown(el, containerEl, endsAtMs) {
    function tick() {
      var remaining = endsAtMs - Date.now();
      var text = ccfFormatCountdown(remaining);
      if (!text) {
        clearInterval(timer);
        if (containerEl && containerEl.parentNode) containerEl.parentNode.removeChild(containerEl);
        return;
      }
      el.textContent = text;
    }
    tick();
    var timer = setInterval(tick, 1000);
  }

  // mobile-only styles (audits/mobile-popup-styles-proposal.txt) — mirrors
  // frontend/app/admin/lib/popupStyles.js's MOBILE_ONLY_STYLE_IDS exactly.
  var CCF_MOBILE_ONLY_STYLE_IDS = ['bottom_sheet', 'top_bar', 'story_card'];
  var CCF_KNOWN_STYLE_IDS = ['flash_sale', 'gift_reveal', 'spotlight', 'noir', 'color_block']
    .concat(CCF_MOBILE_ONLY_STYLE_IDS);

  // popup-style: resolve which style + extra fields are actually in force.
  // Independent of cfg's own layout-presence mobile fallback above — the
  // desktop style is the default for BOTH devices; mobile only diverges
  // when popupConfig.mobileStyleOverride is explicitly on AND
  // mobilePopupConfig actually has its own styleId saved (matches the
  // admin's own resolution in Settings.jsx).
  function ccfResolveStyle(isMobileDevice) {
    var styleId = (popupConfig && popupConfig.styleId) || 'classic';
    var styleFields = (popupConfig && popupConfig.styleFields) || {};
    if (isMobileDevice && popupConfig && popupConfig.mobileStyleOverride &&
        mobilePopupConfig && mobilePopupConfig.styleId) {
      styleId = mobilePopupConfig.styleId;
      styleFields = mobilePopupConfig.styleFields || {};
    }
    // An id this build of the theme extension doesn't recognize (e.g. a
    // style registered in a later admin release than the currently-cached
    // theme asset) falls back to Classic rather than rendering nothing.
    if (CCF_KNOWN_STYLE_IDS.indexOf(styleId) === -1) {
      styleId = 'classic';
    } else if (CCF_MOBILE_ONLY_STYLE_IDS.indexOf(styleId) !== -1 && !isMobileDevice) {
      // mobile-only-fallback: never render one of these for a desktop
      // visitor, no matter how the id got here (stale cache, a direct API
      // write, popup.styleId somehow holding a mobile-only id) — the
      // storefront half of the "never on desktop, anywhere" requirement.
      styleId = 'classic';
    }
    return { id: styleId, fields: styleFields };
  }

  // popup-redesign-2: shared style builders so the main popup, the
  // discount-capture popup, and the split layout all match the same
  // premium visual language.
  function ccfInputStyle() {
    return 'width:100%;padding:11px 14px;font-size:13px;' +
      'border:1.5px solid #e5e7eb;border-radius:12px;box-sizing:border-box;' +
      'margin-bottom:8px;color:#111827;background:#f9fafb;font-family:inherit;';
  }
  // popup-style: ctaStyle applies to EVERY Allow button (Split, Card, Flash
  // Sale, Gift Reveal, Bottom Sheet, Top Bar, Story Card). `compact`
  // selects Top Bar's smaller sizing (its own inline bar) — everything else
  // uses the full-size button. An unrecognized/missing ctaStyle falls back
  // to 'rounded'.
  function ccfAllowButtonStyle(accentColor, ctaStyle, compact) {
    var radius = ({ rounded: '14px', square: '0px', pill: '999px',
      outlined: '14px', soft: '14px' })[ctaStyle] || '14px';
    var pad = compact ? '8px 16px' : '14px';
    var fontSize = compact ? '13px' : '15px';
    var sizing = (compact ? '' : 'width:100%;') +
      'padding:' + pad + ';font-size:' + fontSize + ';font-weight:700;' +
      'border-radius:' + radius + ';cursor:pointer;letter-spacing:0.3px;' +
      (compact ? '' : 'margin-bottom:10px;');

    if (ctaStyle === 'outlined') {
      var oColor = compact ? '#fff' : accentColor;
      return sizing + 'color:' + oColor + ';background:transparent;' +
        'border:1.5px solid ' + oColor + ';';
    }
    if (ctaStyle === 'soft') {
      var sColor = compact ? '#fff' : accentColor;
      var sBg = compact ? 'rgba(255,255,255,0.18)' : accentColor + '1f';
      return sizing + 'color:' + sColor + ';background:' + sBg + ';border:none;';
    }
    // rounded / square / pill / unrecognized (-> rounded)
    if (compact) {
      return sizing + 'color:' + accentColor + ';background:#fff;border:none;';
    }
    return sizing + 'color:#fff;' +
      'background:linear-gradient(135deg,' + accentColor + ',' + accentColor + 'dd);' +
      'border:none;box-shadow:0 4px 15px ' + accentColor + '44;';
  }
  function ccfDenyButtonStyle() {
    return 'display:block;width:100%;text-align:center;font-size:12px;' +
      'color:#9ca3af;cursor:pointer;padding:6px 0;background:none;border:none;' +
      'font-family:inherit;letter-spacing:0.3px;';
  }
  // The percentage-aware line used in the main popup's discount-offer box.
  // Returns RAW text (merchant offerText when set, else the automatic line);
  // escape before inserting into innerHTML.
  function ccfDiscountOfferText() {
    var emailPct = (discountConfig.emailDiscount && discountConfig.emailDiscount.percentage) || 0;
    var pushPct = (discountConfig.pushDiscount && discountConfig.pushDiscount.percentage) || 0;
    if (ccfShowEmailField()) {
      return ccfOfferText('emailDiscount') || 'Add your email to get ' + emailPct + '% off';
    }
    return ccfOfferText('pushDiscount') || 'You get ' + pushPct + '% off as a subscriber';
  }
  // Injects the popup's animation/hover/focus CSS once per page.
  // #ccf-push-prompt (main popup, any layout) gets the bottom-anchored
  // slide-up by default; layouts positioned screen-center (split) opt into
  // a scale+fade via the 'layout-center' class instead, and the full-width
  // full-width Top Bar opts OUT of animation entirely via 'layout-bar' —
  // both classes are added where the wrap is built in showSoftPrompt().
  function ccfInjectPopupStyles() {
    var styleId = 'ccf-popup-styles';
    if (document.getElementById(styleId)) return;
    var s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      #ccf-push-prompt {
        animation: ccfSlideUp 0.4s cubic-bezier(0.34,1.56,0.64,1);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      #ccf-push-prompt:hover {
        transform: translateX(-50%) translateY(-2px);
        box-shadow: 0 24px 60px rgba(0,0,0,0.22), 0 8px 20px rgba(0,0,0,0.1) !important;
      }
      @keyframes ccfSlideUp {
        from { opacity:0; transform:translateX(-50%) translateY(30px) scale(0.95); }
        to   { opacity:1; transform:translateX(-50%) translateY(0) scale(1); }
      }
      @keyframes ccfPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      @keyframes ccfShimmer {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
      #ccf-allow-btn {
        transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1);
        position: relative;
        overflow: hidden;
      }
      #ccf-allow-btn::after {
        content: '';
        position: absolute;
        top: 0; left: -100%;
        width: 100%; height: 100%;
        background: linear-gradient(90deg,
          transparent, rgba(255,255,255,0.2), transparent);
        transition: left 0.5s ease;
      }
      #ccf-allow-btn:hover::after {
        left: 100%;
      }
      #ccf-allow-btn:hover {
        transform: translateY(-3px) scale(1.02);
        box-shadow: 0 8px 25px rgba(0,0,0,0.25) !important;
        filter: brightness(1.08);
      }
      #ccf-allow-btn:active {
        transform: translateY(-1px) scale(0.99);
        filter: brightness(0.95);
      }
      #ccf-deny-btn {
        transition: all 0.2s ease;
        position: relative;
      }
      #ccf-deny-btn:hover {
        color: #374151 !important;
        letter-spacing: 0.5px;
      }
      .ccf-input {
        transition: all 0.2s ease !important;
      }
      .ccf-input:focus {
        border-color: var(--ccf-accent, #4f46e5) !important;
        box-shadow: 0 0 0 4px rgba(79,70,229,0.08) !important;
        outline: none !important;
        background: #fff !important;
        transform: translateY(-1px);
      }
      .ccf-input:hover {
        border-color: #9ca3af !important;
      }
      #ccf-close-btn {
        transition: all 0.2s ease;
      }
      #ccf-close-btn:hover {
        background: rgba(0,0,0,0.6) !important;
        transform: rotate(90deg) scale(1.1);
      }
      @keyframes ccfBounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }
      @keyframes ccfSpin {
        to { transform: rotate(360deg); }
      }
      .ccf-spin {
        animation: ccfSpin 0.9s linear infinite;
      }
      .ccf-discount-badge {
        animation: ccfBounce 2s ease infinite;
      }

      /* Image section effects */
      .ccf-img-wrap {
        position: relative;
        overflow: hidden;
      }
      .ccf-img-wrap::after {
        content: '';
        position: absolute;
        bottom: 0; left: 0; right: 0;
        height: 60%;
        background: linear-gradient(to top,
          rgba(0,0,0,0.4) 0%, transparent 100%);
        pointer-events: none;
      }
      .ccf-img-wrap::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(135deg,
          rgba(255,255,255,0.08) 0%, transparent 50%);
        pointer-events: none;
        z-index: 1;
      }
      .ccf-popup-img {
        transition: transform 0.6s cubic-bezier(0.25,0.46,0.45,0.94);
      }
      #ccf-push-prompt:hover .ccf-popup-img {
        transform: scale(1.05);
      }
      .ccf-corner-dots::before {
        content: '';
        position: absolute;
        top: 8px; right: 8px;
        width: 60px; height: 60px;
        background-image: radial-gradient(circle,
          rgba(255,255,255,0.4) 1px, transparent 1px);
        background-size: 8px 8px;
        border-radius: 50%;
        pointer-events: none;
        z-index: 2;
      }

      /* Product page discount nudge — a normal in-flow block (inserted
         after the Buy button, not position:fixed like the popup), so it
         gets its own vertical-only entrance rather than reusing ccfSlideUp
         (which assumes translateX(-50%) fixed-centering and would visibly
         jump sideways then snap back here). */
      #ccf-product-nudge {
        animation: ccfNudgeSlideUp 0.4s cubic-bezier(0.34,1.56,0.64,1);
      }
      @keyframes ccfNudgeSlideUp {
        from { opacity:0; transform:translateY(12px); }
        to   { opacity:1; transform:translateY(0); }
      }
      #ccf-nudge-btn {
        transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1);
      }
      #ccf-nudge-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(0,0,0,0.2) !important;
        filter: brightness(1.08);
      }
      #ccf-nudge-btn:active {
        transform: translateY(0);
      }

      /* Safety overrides — NOT part of the requested design, kept from the
         prior redesign pass. Centered popups (translate(-50%,-50%)) and the
         full-width Top Bar (no transform at all) don't rest at
         translateX(-50%), which every rule above assumes; without these
         they visibly glitch on open and on hover. */
      #ccf-push-prompt.layout-center {
        animation: ccfFadeIn 0.4s cubic-bezier(0.34,1.56,0.64,1);
      }
      @keyframes ccfFadeIn {
        from { opacity:0; transform:translate(-50%,-50%) scale(0.95); }
        to   { opacity:1; transform:translate(-50%,-50%) scale(1); }
      }
      #ccf-push-prompt.layout-center:hover {
        transform: translate(-50%,-50%);
      }
      #ccf-push-prompt.layout-bar {
        animation: none;
      }
      #ccf-push-prompt.layout-bar:hover {
        transform: none;
      }
      /* mobile-styles: Bottom Sheet genuinely slides up from the bottom
         edge (0 horizontal transform, unlike every layout above) — its
         own keyframe + no-hover-lift override, same reasoning as
         layout-center/layout-bar just above. */
      /* round-3 styles (spotlight / noir / color_block): centered entrance
         with a short rise, staggered content, and reduced-motion opt-out. */
      #ccf-push-prompt.layout-pro {
        animation: ccfProIn 260ms cubic-bezier(0.2,0.8,0.2,1) both;
      }
      @keyframes ccfProIn {
        from { opacity:0; transform:translate(-50%,-50%) translateY(10px) scale(0.98); }
        to   { opacity:1; transform:translate(-50%,-50%) translateY(0) scale(1); }
      }
      #ccf-push-prompt.layout-pro:hover {
        transform: translate(-50%,-50%);
      }
      @keyframes ccfRise {
        from { opacity:0; transform:translateY(8px); }
        to   { opacity:1; transform:translateY(0); }
      }
      .ccf-input.ccf-input-dark:focus {
        background: rgba(255,255,255,0.14) !important;
        border-color: rgba(255,255,255,0.5) !important;
        box-shadow: 0 0 0 3px rgba(255,255,255,0.16) !important;
      }
      @media (prefers-reduced-motion: reduce) {
        #ccf-push-prompt, #ccf-push-prompt *, #ccf-overlay {
          animation: none !important;
          transition: none !important;
        }
      }
      #ccf-push-prompt.layout-sheet {
        animation: ccfSheetSlideUp 0.35s cubic-bezier(0.34,1.56,0.64,1);
      }
      @keyframes ccfSheetSlideUp {
        from { opacity:0; transform:translateY(100%); }
        to   { opacity:1; transform:translateY(0); }
      }
      #ccf-push-prompt.layout-sheet:hover {
        transform: none;
      }
    `;
    document.head.appendChild(s);
  }

  // Build the offer headline + email input shown inside the popup.
  // Used by the SPLIT layout only (card builds its own inline field to
  // match its own content-section design — see showSoftPrompt()).
  // Returns a <div id="ccf-discount-fields"> or null when no discount is on.
  // Phone field removed — email-only capture (see ccfShowPhoneField()).
  function ccfBuildDiscountFields() {
    if (!ccfDiscountEnabled()) return null;

    var box = document.createElement('div');
    box.id = 'ccf-discount-fields';
    box.style.cssText = 'margin-top:10px;';

    var head = document.createElement('div');
    head.style.cssText = 'font-size:13px;color:#6b7280;margin-bottom:10px;text-align:center;';
    head.textContent = (discountConfig && discountConfig.offerHeadline) ||
      'Get a discount on your first order!';
    box.appendChild(head);

    if (ccfShowEmailField()) {
      var ei = document.createElement('input');
      ei.type = 'email';
      ei.id = 'ccf-email-input';
      ei.className = 'ccf-input';
      var ep = ccfFieldPct('emailDiscount');
      ei.placeholder = 'Your email' + (ep ? ' (get ' + ep + '% off)' : '');
      ei.style.cssText = ccfInputStyle();
      box.appendChild(ei);
    }
    return box;
  }

  // discount-feature: after a code is minted, decide how to surface it.
  //   push / email / phone            -> store-wide code, popup only
  //   both (email+phone) on a PDP     -> product-specific: also inject a
  //                                      "Buy with X% OFF" button under Buy Now
  function handleDiscount(d, action, productHandle, style) {
    if (!d || !d.code) return;

    var isProductSpecific = (action === 'both') && productHandle;
    if (isProductSpecific) {
      injectProductDiscountButton(d, productHandle);
    }

    // Always show the code inside the popup.
    renderDiscountCode(d, action, productHandle, style);
  }

  // Inject a discount CTA directly under the product page's Buy Now / Add to
  // Cart button. Links to Shopify's /discount/<code> apply URL, which sets the
  // cart discount and then bounces back to the product.
  function injectProductDiscountButton(d, productHandle) {
    if (document.getElementById('ccf-product-disc-btn')) return;

    var buyBtn = document.querySelector(
      '[name="add"], .shopify-payment-button__button, ' +
      'button[data-testid="Checkout-button"], ' +
      '.product-form__submit'
    );
    if (!buyBtn || !buyBtn.parentNode) return;

    var discBtn = document.createElement('a');
    discBtn.id = 'ccf-product-disc-btn';
    discBtn.href = '/discount/' + d.code +
      '?redirect=' + encodeURIComponent('/products/' + productHandle);
    discBtn.style.cssText = [
      'display:block',
      'width:100%',
      'padding:14px',
      'margin-top:10px',
      'background:linear-gradient(135deg,#16a34a,#15803d)',
      'color:#fff',
      'font-size:15px',
      'font-weight:700',
      'text-align:center',
      'border-radius:8px',
      'text-decoration:none',
      'box-shadow:0 4px 12px rgba(22,163,74,0.3)',
      'cursor:pointer'
    ].join(';');
    discBtn.innerHTML = ccfIcon('gift', 16, true) + 'Buy with ' +
      ccfEscapeHtml(d.percentage) + '% OFF — Use code ' + ccfEscapeHtml(d.code);

    buyBtn.parentNode.insertBefore(discBtn, buyBtn.nextSibling);
  }

  // Render the discount code block inside the open popup, with Copy + Shop now.
  // `style` ({id, fields}, from ccfResolveStyle()) is optional — Classic (or
  // no style passed, e.g. from a call site that predates popup-style) keeps
  // this function's original light-on-white look, byte-for-byte.
  // NOTE on countdowns here: this view auto-redirects 2s after it renders
  // (see the setTimeout below), so a live ticking countdown would barely
  // move before the page navigates away. The already-existing "Expires in
  // N days" line below already states the REAL deadline (the discount's
  // actual expiryDays, from the /generate-discount response) as a plain
  // fact for every style — Flash Sale/Gift Reveal only re-theme this view's
  // colors/emphasis to match their own initial popup, they don't add a
  // second, practically-useless ticking clock on top of it. The real,
  // genuinely live countdown (fixed_date source) is shown in the INITIAL
  // popup instead, where it can matter — see the flash_sale branch above.
  function renderDiscountCode(d, action, productHandle, style) {
    var popup = document.getElementById('ccf-push-prompt');
    if (!popup) return;
    var sId = (style && style.id) || 'classic';
    var sFields = (style && style.fields) || {};

    // Always include a ?redirect= target so Shopify lands the shopper on a
    // real page after applying the discount session — never a bare
    // /discount/<code> (which Shopify drops to the homepage when the code is
    // unknown or the redirect is missing).
    var redirectPath;
    if (productHandle) {
      redirectPath = '/products/' + productHandle;
    } else if (window.location.pathname && window.location.pathname !== '/') {
      redirectPath = window.location.pathname;
    } else {
      redirectPath = '/collections/all';
    }
    var redirectUrl = '/discount/' + d.code +
      '?redirect=' + encodeURIComponent(redirectPath);


    // popup-redesign-2: update the popup's own content section IN PLACE
    // (headline/inputs/buttons swap for the "unlocked" state) instead of
    // appending a second box below them — no more flash-then-redirect.
    // popup-style: Flash Sale keeps this dark (matches its own wrap
    // background, set on `wrap` in the flash_sale/gift_reveal branch
    // above); Gift Reveal's codeChipEmphasis makes the code block bigger
    // and bolder. Classic (sId === 'classic') is these same original
    // colors/sizes, untouched. Story Card also renders on a dark/photo
    // background (mobile-styles) — same light-on-dark need, mirrors
    // Settings.jsx's UnlockedView isDark check exactly.
    var isDark = sId === 'flash_sale' || sId === 'story_card' ||
      popup.getAttribute('data-ccf-dark') === '1';
    var titleColor = isDark ? '#ffffff' : '#111827';
    var subColor = isDark ? '#d4d4d8' : '#6b7280';
    var chipBig = sId === 'gift_reveal' && sFields.codeChipEmphasis !== false;
    var isGift = sId === 'gift_reveal';
    var chipBg = isDark
      ? 'linear-gradient(135deg,#27272a,#3f3f46)'
      : (isGift ? 'linear-gradient(135deg,#ffedd5,#fed7aa)' : 'linear-gradient(135deg,#f0f4ff,#e8edff)');
    var chipBorder = isDark ? '1.5px dashed #52525b' : (isGift ? '1.5px dashed #fb923c' : '1.5px dashed #818cf8');
    var chipCodeColor = isDark ? '#ffffff' : (isGift ? '#c2410c' : '#4338ca');
    var chipCodeSize = chipBig ? '26px' : '22px';
    var chipLabelColor = isDark ? '#a1a1aa' : (isGift ? '#ea580c' : '#6366f1');
    var footerColor = isDark ? '#86efac' : '#16a34a';

    var html =
      '<div style="text-align:center;padding:8px 0 4px">' +
      // display:flex + justify-content:center here (not just relying on
      // the outer text-align:center) — some storefront themes reset
      // svg { display:block }, which would otherwise sit left-aligned
      // since text-align only centers inline content, not a block child.
      '<div style="color:' + footerColor + ';line-height:1;margin-bottom:10px;' +
      'display:flex;justify-content:center;' +
      'animation:ccfBounce 1s ease 3">' + ccfIcon('gift', 40) + '</div>' +
      '<div style="font-size:18px;font-weight:800;color:' + titleColor + ';' +
      'margin-bottom:4px">' + d.percentage + '% OFF Unlocked!</div>' +
      '<div style="font-size:12px;color:' + subColor + ';margin-bottom:14px">' +
      'Expires in ' + d.expiryDays + ' days</div>' +
      '<div style="background:' + chipBg + ';' +
      'border:' + chipBorder + ';border-radius:14px;' +
      'padding:' + (chipBig ? '18px' : '14px') + ';margin-bottom:14px">' +
      '<div style="font-size:11px;color:' + chipLabelColor + ';font-weight:600;' +
      'letter-spacing:2px;margin-bottom:6px">YOUR DISCOUNT CODE</div>' +
      '<div style="font-size:' + chipCodeSize + ';font-weight:800;letter-spacing:4px;' +
      'font-family:monospace;color:' + chipCodeColor + '">' + d.code + '</div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;justify-content:center;' +
      'gap:6px;font-size:13px;color:' + footerColor + ';font-weight:500">' +
      '<span style="animation:ccfPulse 1.5s ease infinite;display:inline-block;line-height:1">' + ccfIcon('check', 14) + '</span>' +
      ' Applying your discount automatically...</div>' +
      '</div>';

    var contentEl = document.getElementById('ccf-content-section');
    if (contentEl) {
      contentEl.innerHTML = html;
    } else {
      // Fallback for a layout without #ccf-content-section — append as before.
      var box = document.createElement('div');
      box.style.cssText = 'margin-top:12px;';
      box.innerHTML = html;
      popup.appendChild(box);
    }

    // Wire copy-on-click for the code, wherever it landed.
    var codeEl = (contentEl || popup).querySelector('[style*="monospace"]');
    if (codeEl) {
      codeEl.style.cursor = 'pointer';
      codeEl.title = 'Click to copy';
      codeEl.addEventListener('click', function() {
        navigator.clipboard.writeText(d.code)
          .catch(function() {});
        codeEl.innerHTML = ccfIcon('check', 14, true) + 'Copied!';
        setTimeout(function() {
          codeEl.textContent = d.code;
        }, 1500);
      });
    }

    // Auto-redirect after 2 seconds to apply discount
    setTimeout(function() {
      // Stash the code for cross-page badges —
      // FIRST, immediately before navigating, so no earlier code path can
      // leave a stale ccf_active_discount that blocks a later attempt.
      try {
        sessionStorage.setItem('ccf_active_discount', d.code);
        sessionStorage.setItem('ccf_active_pct', String(d.percentage));
      } catch (e) {}
      window.location.href = redirectUrl;
    }, 2000);
  }

  // discount-feature: once a CCF discount is active (code minted this session),
  // badge every product price on collection / home / search pages.
  function checkActiveDiscount() {
    var activeCode, activePct;
    try {
      activeCode = sessionStorage.getItem('ccf_active_discount');
      activePct = sessionStorage.getItem('ccf_active_pct');
    } catch (e) { return; }
    if (!activeCode || !activePct) return;

    var priceEls = document.querySelectorAll(
      '.price, .product-item__price, .price__regular, ' +
      '[class*="price"], .money'
    );

    for (var i = 0; i < priceEls.length; i++) {
      var el = priceEls[i];
      if (el.dataset.ccfBadged || !el.parentNode) continue;
      el.dataset.ccfBadged = '1';

      var badge = document.createElement('span');
      badge.style.cssText = [
        'display:inline-block',
        'background:#16a34a',
        'color:#fff',
        'font-size:11px',
        'font-weight:700',
        'padding:2px 6px',
        'border-radius:4px',
        'margin-left:6px',
        'vertical-align:middle'
      ].join(';');
      badge.textContent = activePct + '% OFF';
      el.parentNode.insertBefore(badge, el.nextSibling);
    }
  }

  // Perceived-brightness test so the round-3 styles pick readable secondary
  // colours (input, subtext, CTA) whatever background the merchant chose.
  function ccfIsDarkColor(hex) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return false;
    var h = m[1];
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.45;
  }

  // Per-field merge: mobile value wins where it is set, desktop fills the rest.
  // '', null and undefined mean "not set"; false and 0 are real values.
  function ccfMergeConfig(base, over) {
    var out = {};
    var k;
    for (k in (base || {})) {
      if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    }
    for (k in (over || {})) {
      if (!Object.prototype.hasOwnProperty.call(over, k)) continue;
      var v = over[k];
      if (v === '' || v === null || v === undefined) continue;
      out[k] = v;
    }
    return out;
  }

  function showSoftPrompt(trigger, productId) {
    // discount-capture path: an already-subscribed customer, shown purely
    // to collect email/phone for a bigger discount — bypasses canPrompt()'s
    // permission-state gate (there's no push permission left to ask for).
    // Feature-detect Notification first — canPrompt() does the same before
    // touching .permission, since it throws on browsers without support.
    var isDiscountCapture = ccfDiscountEnabled() &&
      ('Notification' in window) && Notification.permission === 'granted';
    if (!isDiscountCapture && !canPrompt()) return;
    if (document.getElementById('ccf-push-prompt')) return;
    markPromptShown();
    ccfInjectPopupStyles();

    // Log push_prompt_shown via the existing event pipe (-> StorefrontEvent).
    try { trackEvent('push_prompt_shown', { trigger: trigger, productId: productId || null }); } catch (e) {}

    // popup-mobile: sub-600px phones get a stacked layout, set inline.
    var isMobile = window.innerWidth <= 600;
    // mobile-popup-polish: narrow-phone breakpoint (iPhone SE and smaller)
    // for the 4 mobile-only styles' outer padding token (20px, 16px below
    // this width) — see the token table in
    // audits/mobile-popup-polish-audit.txt.
    var isNarrowPhone = window.innerWidth < 360;
    var ccfMobileOuterPad = isNarrowPhone ? '16px' : '20px';

    // ================================================================
    // popup-redesign: two layouts (split / card) driven by
    // cfg.layout. Everything falls back to sensible defaults so an
    // empty config still renders a usable prompt.
    // popup-responsive: on phones cfg is a per-field merge of the desktop
    // config and mobilePopupConfig (see ccfMergeConfig): a mobile value
    // wins wherever it is set, and desktop fills any field that is blank
    // ('', null, undefined; false and 0 count as set). Fields with a
    // non-empty schema default in mobilePopup (layout, colors, fonts, button
    // text, ctaStyle, borderRadius, etc.) are never blank, so they always
    // win over desktop; only truly blank fields (headline, subtext,
    // brandName, imageUrl) inherit. styleId/styleFields are not read from
    // cfg — ccfResolveStyle() reads them.
    // ================================================================
    var cfg = isMobile ? (mobilePopupConfig || {}) : (popupConfig || {});
    if (isMobile) cfg = ccfMergeConfig(popupConfig || {}, mobilePopupConfig || {});
    // popup-mobile debug: which config are we using and does it carry an image?
    console.log('[CCF] device:', isMobile ? 'mobile' : 'desktop',
      '| layout:', cfg.layout,
      '| hasImage:', !!(cfg.imageUrl));
    var layout = cfg.layout || 'split';
    // Split is never valid on mobile, so mobile is always 'card'. 'banner'
    // (a removed layout that may still be stored) renders as 'card' on
    // every device, never blank.
    if (isMobile || layout === 'banner') layout = 'card';
    var ccfStyle = ccfResolveStyle(isMobile);
    var bg = cfg.bgColor || '#ffffff';
    var fg = cfg.textColor || '#111827';
    var font = cfg.fontFamily || 'inherit';
    var accent = cfg.accentColor || '#4f46e5';
    var imagePosition = cfg.imagePosition || 'center center';
    var allowLabel = cfg.allowText || 'Allow';
    var denyLabel = cfg.denyText || 'No thanks';
    var promptText = (PROMPT_COPY[trigger] || PROMPT_COPY.dwell)(
      trigger === 'dwell' ? ccfProductTitle() : null
    );
    var headline = cfg.headline || promptText;

    function buildAllowBtn(styleStr) {
      var b = document.createElement('button');
      b.id = 'ccf-allow-btn';
      b.type = 'button';
      b.textContent = allowLabel;
      b.setAttribute('style', styleStr);
      return b;
    }
    function buildDenyBtn(styleStr) {
      var b = document.createElement('button');
      b.id = 'ccf-deny-btn';
      b.type = 'button';
      b.textContent = denyLabel;
      b.setAttribute('style', styleStr);
      return b;
    }
    function buildBranding(styleStr) {
      var d = document.createElement('div');
      d.setAttribute('style', styleStr);
      d.textContent = 'Powered by ShopiReachBoost AI';
      return d;
    }

    // ---- Round 3 (spotlight / noir / color_block) shared pieces ----
    function ccfProPalette(defBg, defFg, defAccent) {
      var pBg = cfg.bgColor || defBg;
      var pFg = cfg.textColor || defFg;
      var dark = ccfIsDarkColor(pBg);
      return {
        bg: pBg, fg: pFg, dark: dark, accent: cfg.accentColor || defAccent,
        inputBg: dark ? 'rgba(255,255,255,0.08)' : '#ffffff',
        inputBorder: dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)',
        font: cfg.fontFamily || '-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif'
      };
    }
    function ccfProOverlay(alpha, blurPx) {
      var o = document.createElement('div');
      o.id = 'ccf-overlay';
      o.setAttribute('style',
        'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483646;' +
        'background:rgba(0,0,0,' + alpha + ');' +
        (blurPx ? '-webkit-backdrop-filter:blur(' + blurPx + 'px);backdrop-filter:blur(' + blurPx + 'px);' : ''));
      return o;
    }
    function buildProClose(pal, posCss, onPhoto) {
      var b = document.createElement('button');
      b.id = 'ccf-close-btn';
      b.type = 'button';
      b.textContent = '×';
      b.setAttribute('aria-label', 'Dismiss');
      var sz = isMobile ? 44 : 36;
      b.style.cssText = 'position:absolute;' + posCss + 'width:' + sz + 'px;height:' + sz + 'px;border:none;' +
        'border-radius:50%;font-size:18px;line-height:' + sz + 'px;text-align:center;cursor:pointer;z-index:10;' +
        (onPhoto ? 'background:rgba(0,0,0,0.5);color:#ffffff;'
          : 'background:' + (pal.dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.08)') + ';color:' + pal.fg + ';');
      closeBtn = b;
      return b;
    }
    // Headline + subtext + email + Allow + Deny (+ branding) in one
    // #ccf-content-section, children staggered in. `o` carries per-style
    // sizing/alignment; merchant strings only ever go through textContent.
    function buildProContent(pal, o) {
      var c = document.createElement('div');
      c.id = 'ccf-content-section';
      c.style.cssText = 'text-align:' + o.align + ';' + (o.contentStyle || '');
      if (o.eyebrow) {
        var eb = document.createElement('div');
        eb.style.cssText = 'margin-bottom:12px;';
        var ebi = document.createElement('span');
        ebi.style.cssText = 'display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.14em;' +
          'text-transform:uppercase;' + (o.eyebrowStyle || '');
        ebi.textContent = String(o.eyebrow).slice(0, 24);
        eb.appendChild(ebi);
        c.appendChild(eb);
      }
      (o.before || []).forEach(function (el) { c.appendChild(el); });
      var hd = document.createElement('div');
      hd.id = 'ccf-prompt-text';
      hd.style.cssText = 'font-size:' + o.headSize + 'px;font-weight:700;line-height:1.12;' +
        'letter-spacing:-0.02em;margin-bottom:12px;';
      hd.textContent = headline;
      c.appendChild(hd);
      if (cfg.subtext) {
        var sb = document.createElement('div');
        sb.style.cssText = 'font-size:' + o.subSize + 'px;line-height:1.5;opacity:0.75;margin-bottom:20px;';
        sb.textContent = cfg.subtext;
        c.appendChild(sb);
      }
      if (ccfShowEmailField()) {
        var ew = document.createElement('div');
        ew.style.cssText = 'position:relative;margin-bottom:12px;';
        var ei = document.createElement('input');
        ei.type = 'email';
        ei.id = 'ccf-email-input';
        ei.className = 'ccf-input' + (pal.dark ? ' ccf-input-dark' : '');
        var pctE = ccfFieldPct('emailDiscount');
        ei.placeholder = 'Your email' + (pctE ? ' (get ' + pctE + '% off)' : '');
        ei.style.cssText = ccfInputStyle() + 'height:48px;padding:0 ' + (o.lockIcon ? '44px' : '16px') +
          ' 0 16px;font-size:15px;margin-bottom:0;border-radius:' + o.inputRadius + ';background:' + pal.inputBg +
          ';color:' + pal.fg + ';border-color:' + pal.inputBorder + ';box-sizing:border-box;';
        ew.appendChild(ei);
        if (o.lockIcon) {
          var lk = document.createElement('span');
          lk.style.cssText = 'position:absolute;right:16px;top:50%;transform:translateY(-50%);opacity:0.5;' +
            'display:flex;color:' + pal.fg + ';';
          lk.innerHTML = ccfIcon('lock', 16); // hardcoded icon markup, no merchant string
          ew.appendChild(lk);
        }
        c.appendChild(ew);
      }
      allow = buildAllowBtn(ccfAllowButtonStyle(pal.accent, cfg.ctaStyle) + 'font-size:16px;padding:15px;' +
        (o.ctaLight ? 'background:#ffffff;color:#0f1115;box-shadow:none;border:none;' : ''));
      c.appendChild(allow);
      deny = buildDenyBtn(ccfDenyButtonStyle() + 'color:' + pal.fg + ';opacity:0.65;font-size:13px;' +
        'text-decoration:underline;padding:12px 0;' + (o.denyDotted ? 'text-decoration-style:dotted;' : ''));
      c.appendChild(deny);
      if (cfg.showBranding) {
        c.appendChild(buildBranding('margin-top:8px;font-size:10px;text-align:center;letter-spacing:0.5px;' +
          'opacity:0.45;color:' + pal.fg + ';'));
      }
      for (var ci = 0; ci < c.children.length; ci++) {
        c.children[ci].style.animation = 'ccfRise 340ms cubic-bezier(0.2,0.8,0.2,1) both';
        c.children[ci].style.animationDelay = (80 + ci * 45) + 'ms';
      }
      return c;
    }
    function ccfProPhoto(pal, heightCss, fadeCss) {
      var ph = document.createElement('div');
      ph.style.cssText = 'position:relative;overflow:hidden;' + heightCss + 'background:' +
        (cfg.imageUrl ? '#000' : ('linear-gradient(135deg,' + pal.accent + ',' + pal.bg + ')')) + ';';
      if (cfg.imageUrl) {
        var pim = document.createElement('img');
        pim.src = cfg.imageUrl;
        pim.alt = '';
        pim.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;' +
          'object-position:' + (cfg.imagePosition || '50% 50%') + ';';
        pim.onerror = function () { pim.style.display = 'none'; };
        ph.appendChild(pim);
      }
      if (fadeCss) {
        var fd = document.createElement('div');
        fd.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;background:' + fadeCss + ';';
        ph.appendChild(fd);
      }
      return ph;
    }

    var wrap = document.createElement('div');
    wrap.id = 'ccf-push-prompt';
    var allow, deny, closeBtn;
    var overlay = null;

    if (ccfStyle.id === 'flash_sale' || ccfStyle.id === 'gift_reveal') {
      // ---------- POPUP STYLE: Flash Sale / Gift Reveal — both wrap the
      // `card` layout (see frontend/app/admin/lib/popupStyles.js), so
      // `layout` itself is not consulted here; only cfg's OTHER fields
      // (colors, image, copy) still apply, same as every other style. ----
      var isFlashSale = ccfStyle.id === 'flash_sale';
      var styleFields = ccfStyle.fields;
      var cardRadius2 = (cfg.borderRadius != null ? cfg.borderRadius : 16) + 'px';
      var sBg = isFlashSale ? '#18181b' : (cfg.bgColor || '#fff7ed');
      var sFg = isFlashSale ? '#ffffff' : (cfg.textColor || '#111827');

      // mobile-popup-polish: MOBILE is centered (both axes) with a
      // max-height/overflow-y safety net and a narrow-viewport width guard.
      // DESKTOP is the exact original array (bottom-anchored), kept as its
      // own separate branch so its output string stays byte-identical.
      wrap.style.cssText = isMobile ? [
        'position:fixed',
        'top:50%',
        'left:50%',
        'transform:translate(-50%,-50%)',
        'width:min(300px, calc(100vw - 32px))',
        'max-height:calc(100vh - 32px)',
        'overflow-x:hidden',
        'overflow-y:auto',
        'background:' + sBg,
        'color:' + sFg,
        'border-radius:' + cardRadius2,
        'box-shadow:0 20px 60px rgba(0,0,0,0.25),0 4px 12px rgba(0,0,0,0.1)',
        'z-index:2147483647',
        'font-family:' + (cfg.fontFamily || '-apple-system,BlinkMacSystemFont,sans-serif'),
        'max-width:90vw'
      ].join(';') : [
        'position:fixed',
        'bottom:24px',
        'left:50%',
        'transform:translateX(-50%)',
        'width:' + (isMobile ? '300px' : 'min(340px,90vw)'),
        'background:' + sBg,
        'color:' + sFg,
        'border-radius:' + cardRadius2,
        'overflow:hidden',
        'box-shadow:0 20px 60px rgba(0,0,0,0.25),0 4px 12px rgba(0,0,0,0.1)',
        'z-index:2147483647',
        'font-family:' + (cfg.fontFamily || '-apple-system,BlinkMacSystemFont,sans-serif'),
        'max-width:90vw'
      ].join(';');
      // Mobile rests at translate(-50%,-50%); desktop keeps the default
      // translateX(-50%) animation, so the class is mobile-only.
      if (isMobile) wrap.classList.add('layout-center');

      var sImageUrl = cfg.imageUrl || '';
      if (sImageUrl) {
        var sImgEl = document.createElement('img');
        sImgEl.src = sImageUrl;
        sImgEl.alt = '';
        sImgEl.style.cssText = 'width:100%;height:' + (isMobile ? '120px' : '140px') +
          ';object-fit:cover;display:block;object-position:' + (cfg.imagePosition || '50% 50%') + ';';
        sImgEl.onerror = function () { sImgEl.style.display = 'none'; };
        wrap.appendChild(sImgEl);
      } else if (!isFlashSale && styleFields.giftIconEnabled !== false) {
        var giftWrap = document.createElement('div');
        giftWrap.style.cssText = 'height:84px;display:flex;align-items:center;' +
          'justify-content:center;color:#ea580c;';
        giftWrap.innerHTML = ccfIcon('gift', 44);
        wrap.appendChild(giftWrap);
      }

      var sContent = document.createElement('div');
      sContent.id = 'ccf-content-section';
      sContent.style.cssText = 'padding:20px 18px 18px;text-align:center;';

      if (isFlashSale && styleFields.badgeText) {
        var sBadge = document.createElement('span');
        sBadge.style.cssText = 'display:inline-block;font-size:10px;font-weight:700;' +
          'letter-spacing:0.05em;text-transform:uppercase;color:' + accent + ';' +
          'border:1px solid ' + accent + ';border-radius:999px;padding:3px 10px;margin-bottom:8px;';
        sBadge.textContent = String(styleFields.badgeText).slice(0, 24);
        sContent.appendChild(sBadge);
      }

      var sHead = document.createElement('div');
      sHead.id = 'ccf-prompt-text';
      sHead.style.cssText = 'font-size:17px;font-weight:800;line-height:1.3;margin-bottom:6px;';
      sHead.textContent = headline;
      sContent.appendChild(sHead);

      if (cfg.subtext) {
        var sSub = document.createElement('div');
        sSub.style.cssText = 'font-size:13px;margin-bottom:12px;line-height:1.4;' +
          'color:' + (isFlashSale ? '#d4d4d8' : '#6b7280') + ';';
        sSub.textContent = cfg.subtext;
        sContent.appendChild(sSub);
      }

      if (ccfShowEmailField()) {
        var sEmailInput = document.createElement('input');
        sEmailInput.type = 'email';
        sEmailInput.id = 'ccf-email-input';
        sEmailInput.className = 'ccf-input';
        var sEp = ccfFieldPct('emailDiscount');
        sEmailInput.placeholder = 'Your email' + (sEp ? ' (get ' + sEp + '% off)' : '');
        sEmailInput.style.cssText = ccfInputStyle() +
          (isFlashSale ? 'background:#ffffff;color:#111827;border-color:#d4d4d8;' : '');
        sContent.appendChild(sEmailInput);
      }

      // Real-deadline countdown only — never a fake per-visitor timer.
      // 'fixed_date' with a valid future date: shown now, ticking live.
      // 'discount_expiry': no real deadline exists yet before a code is
      // actually minted, so nothing is shown here; renderDiscountCode()
      // shows a real one once the code (and its real expiry) exists.
      if (isFlashSale && styleFields.countdownSource === 'fixed_date' && styleFields.countdownEndsAt) {
        var sEndsAtMs = new Date(styleFields.countdownEndsAt).getTime();
        if (sEndsAtMs > Date.now()) {
          var sCountdownWrap = document.createElement('div');
          sCountdownWrap.style.cssText = 'font-size:18px;font-weight:800;letter-spacing:0.08em;' +
            'margin-bottom:10px;font-variant-numeric:tabular-nums;';
          sContent.appendChild(sCountdownWrap);
          ccfStartCountdown(sCountdownWrap, sCountdownWrap, sEndsAtMs);
        }
      }

      allow = buildAllowBtn(ccfAllowButtonStyle(accent, cfg.ctaStyle));
      sContent.appendChild(allow);

      if (!isFlashSale && styleFields.secondaryButtonStyle === 'pill') {
        // Only reachable when !isFlashSale (Gift Reveal), so the border is
        // always the light #e5e7eb — the old ternary's '#3f3f46' branch was
        // dead code (isFlashSale can never be true here).
        deny = buildDenyBtn(
          'width:100%;padding:11px;font-size:13px;font-weight:600;border-radius:999px;' +
          'border:1px solid #e5e7eb;background:transparent;' +
          'color:' + sFg + ';cursor:pointer;margin-top:8px;');
      } else {
        deny = buildDenyBtn(ccfDenyButtonStyle() +
          (isFlashSale ? 'color:#a1a1aa;' : ''));
      }
      sContent.appendChild(deny);

      if (cfg.showBranding) {
        sContent.appendChild(buildBranding(
          'margin-top:12px;font-size:10px;text-align:center;letter-spacing:0.5px;' +
          'color:' + (isFlashSale ? '#52525b' : '#d1d5db') + ';'));
      }

      wrap.appendChild(sContent);

      closeBtn = document.createElement('button');
      closeBtn.id = 'ccf-close-btn';
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.style.cssText = 'position:absolute;top:12px;right:12px;' +
        'background:rgba(' + (isFlashSale ? '255,255,255,0.12' : '0,0,0,0.35') + ');color:#fff;' +
        'border:none;border-radius:50%;width:26px;height:26px;font-size:14px;line-height:26px;' +
        'text-align:center;cursor:pointer;z-index:10;';
      wrap.appendChild(closeBtn);

    } else if (ccfStyle.id === 'spotlight') {
      // ---------- POPUP STYLE: Spotlight — a soft round shape floating over
      // the page, no boxed panel. Desktop circle/oval; mobile a rounded
      // "pebble" (a circle can't hold the input and CTA at 320px). ----------
      var spF = ccfStyle.fields || {};
      var spPal = ccfProPalette('#fbf4e8', '#1c1917', '#c2410c');
      var spOval = !isMobile && spF.shape === 'oval';
      wrap.style.cssText = [
        'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
        isMobile ? 'width:min(360px, calc(100vw - 32px))'
          : (spOval ? 'width:min(520px, calc(100vw - 48px));aspect-ratio:520/430'
            : 'width:min(460px, calc(100vw - 48px));aspect-ratio:1/1'),
        isMobile ? 'max-height:calc(100vh - 32px);overflow-x:hidden;overflow-y:auto' : 'overflow:visible',
        'border-radius:' + (isMobile ? '56px' : '50%'),
        'box-sizing:border-box',
        'padding:' + (isMobile ? '40px 24px 28px' : '0'),
        'display:flex', 'flex-direction:column', 'justify-content:center',
        'background:' + spPal.bg, 'color:' + spPal.fg, 'text-align:center',
        'box-shadow:0 24px 70px rgba(0,0,0,0.28)',
        'z-index:2147483647', 'font-family:' + spPal.font
      ].join(';');
      wrap.classList.add('layout-pro');
      wrap.setAttribute('data-ccf-dark', spPal.dark ? '1' : '0');
      overlay = ccfProOverlay(0.45, 3);

      if (spF.showSquiggle !== false) {
        var sqg = document.createElement('span');
        sqg.setAttribute('aria-hidden', 'true');
        sqg.style.cssText = 'position:absolute;pointer-events:none;opacity:0.35;color:' + spPal.accent + ';' +
          (isMobile ? 'top:26px;left:26px;width:64px;' : 'bottom:22%;left:14%;width:14%;');
        sqg.innerHTML = '<svg viewBox="0 0 120 20" width="100%" fill="none" stroke="currentColor" ' +
          'stroke-width="2.5" stroke-linecap="round"><path d="M0 10 Q 15 0 30 10 T 60 10 T 90 10 T 120 10"/></svg>';
        wrap.appendChild(sqg);
      }
      if (cfg.imageUrl) {
        var seal = document.createElement('div');
        seal.style.cssText = 'width:64px;height:64px;border-radius:50%;overflow:hidden;flex-shrink:0;' +
          (isMobile ? 'margin:0 auto 14px;'
            : 'position:absolute;top:-32px;left:50%;transform:translateX(-50%);border:4px solid ' + spPal.bg + ';');
        var sealImg = document.createElement('img');
        sealImg.src = cfg.imageUrl;
        sealImg.alt = '';
        sealImg.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;object-position:' +
          (cfg.imagePosition || '50% 50%') + ';';
        sealImg.onerror = function () { seal.style.display = 'none'; };
        seal.appendChild(sealImg);
        wrap.appendChild(seal);
      }
      wrap.appendChild(buildProContent(spPal, {
        align: 'center', headSize: isMobile ? 26 : 30, subSize: isMobile ? 14 : 15,
        eyebrow: spF.badgeText, eyebrowStyle: 'opacity:0.7;', inputRadius: '999px',
        contentStyle: isMobile ? '' : 'width:68%;margin:0 auto;'
      }));
      wrap.appendChild(buildProClose(spPal, isMobile ? 'top:12px;right:12px;' : 'top:13%;right:13%;'));

    } else if (ccfStyle.id === 'noir') {
      // ---------- POPUP STYLE: Noir Split — photo one side, dark calm panel
      // the other, small uppercase eyebrow tag. Mobile: centered card, hero
      // photo fading into the panel. ----------
      var nF = ccfStyle.fields || {};
      var nPal = ccfProPalette('#0f1115', '#f4f4f5', '#9a6b1f');
      var nRight = !isMobile && nF.imageSide === 'right';
      wrap.style.cssText = [
        'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
        isMobile ? 'width:min(400px, calc(100vw - 32px));max-height:calc(100vh - 32px);overflow-x:hidden;overflow-y:auto'
          : 'width:min(780px, calc(100vw - 48px));display:grid;min-height:440px;overflow:hidden;grid-template-columns:' +
            (nRight ? '54fr 46fr' : '46fr 54fr'),
        'border-radius:' + (isMobile ? '20px' : '18px'),
        'background:' + nPal.bg, 'color:' + nPal.fg,
        'box-shadow:0 24px 70px rgba(0,0,0,0.35)',
        'z-index:2147483647', 'font-family:' + nPal.font
      ].join(';');
      wrap.classList.add('layout-pro');
      wrap.setAttribute('data-ccf-dark', nPal.dark ? '1' : '0');
      overlay = ccfProOverlay(0.5, 0);
      var nPhoto = ccfProPhoto(nPal, isMobile ? 'height:168px;' : 'order:' + (nRight ? 2 : 1) + ';',
        isMobile ? 'linear-gradient(180deg,transparent 35%,' + nPal.bg + ' 100%)'
          : 'linear-gradient(' + (nRight ? '270deg' : '90deg') + ',transparent 75%,' + nPal.bg + ' 100%)');
      wrap.appendChild(nPhoto);
      wrap.appendChild(buildProContent(nPal, {
        align: 'left', headSize: isMobile ? 26 : 34, subSize: isMobile ? 14 : 15,
        eyebrow: nF.badgeText,
        eyebrowStyle: 'border:1px solid ' + (nPal.dark ? '#e7c07d' : '#9a6b1f') + ';color:' +
          (nPal.dark ? '#e7c07d' : '#9a6b1f') + ';padding:4px 10px;border-radius:999px;',
        inputRadius: '12px', ctaLight: nPal.dark,
        contentStyle: isMobile ? 'position:relative;padding:0 24px 24px;margin-top:-36px;'
          : 'position:relative;padding:48px 44px;display:flex;flex-direction:column;justify-content:center;order:' +
            (nRight ? 1 : 2) + ';'
      }));
      wrap.appendChild(buildProClose(nPal, 'top:12px;right:12px;', isMobile || nRight));

    } else if (ccfStyle.id === 'color_block') {
      // ---------- POPUP STYLE: Colour Block — warm colour field, big serif
      // offer figure (real discount only), playful decline link. ----------
      var cbF = ccfStyle.fields || {};
      var cbPal = ccfProPalette('#f6e3c4', '#1c1917', '#0f766e');
      wrap.style.cssText = [
        'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
        isMobile ? 'width:min(400px, calc(100vw - 32px));max-height:calc(100vh - 32px);overflow-x:hidden;overflow-y:auto'
          : 'width:min(740px, calc(100vw - 48px));display:grid;grid-template-columns:1fr 1fr;min-height:420px;overflow:hidden',
        'border-radius:24px',
        'background:' + cbPal.bg, 'color:' + cbPal.fg,
        'box-shadow:0 24px 70px rgba(0,0,0,0.3)',
        'z-index:2147483647', 'font-family:' + cbPal.font
      ].join(';');
      wrap.classList.add('layout-pro');
      wrap.setAttribute('data-ccf-dark', cbPal.dark ? '1' : '0');
      overlay = ccfProOverlay(0.5, 0);
      var cbShort = window.innerHeight < 620;
      wrap.appendChild(ccfProPhoto(cbPal, isMobile ? 'height:' + (cbShort ? '84' : '110') + 'px;' : 'order:1;', ''));

      var cbBefore = [];
      var cbPct = Math.max(ccfPct('pushDiscount'), ccfPct('emailDiscount'), ccfPct('bothDiscount'));
      var cbFigure = '';
      if (ccfDiscountEnabled()) {
        cbFigure = cbF.offerFigure ? String(cbF.offerFigure).slice(0, 12) : (cbPct ? cbPct + '% OFF' : '');
      }
      if (cbFigure) {
        var cbFig = document.createElement('div');
        cbFig.style.cssText = 'font-family:Georgia,\'Iowan Old Style\',\'Times New Roman\',serif;font-size:' +
          (isMobile ? (window.innerWidth < 360 || cbShort ? '44px' : '52px') : '56px') + ';font-weight:900;line-height:1;letter-spacing:-0.04em;margin-bottom:12px;';
        cbFig.textContent = cbFigure;
        cbBefore.push(cbFig);
        var cbDiv = document.createElement('div');
        cbDiv.style.cssText = 'width:44px;height:1px;background:' + cbPal.fg + ';opacity:0.3;margin-bottom:14px;';
        cbBefore.push(cbDiv);
      }
      if (cbF.countdownSource === 'fixed_date' && cbF.countdownEndsAt) {
        var cbEnds = new Date(cbF.countdownEndsAt).getTime();
        if (cbEnds > Date.now()) {
          var cbCd = document.createElement('div');
          cbCd.style.cssText = 'display:inline-block;font-size:16px;font-weight:800;letter-spacing:0.08em;' +
            'font-variant-numeric:tabular-nums;padding:6px 12px;border-radius:10px;margin-bottom:14px;' +
            'background:' + cbPal.fg + ';color:' + cbPal.bg + ';';
          cbBefore.push(cbCd);
          ccfStartCountdown(cbCd, cbCd, cbEnds);
        }
      }
      wrap.appendChild(buildProContent(cbPal, {
        align: 'left', headSize: isMobile ? 22 : 24, subSize: 14,
        eyebrow: cbF.badgeText, eyebrowStyle: 'opacity:0.75;', before: cbBefore,
        inputRadius: '12px', lockIcon: true, denyDotted: true,
        contentStyle: isMobile
          ? 'position:relative;margin-top:-20px;border-radius:24px 24px 0 0;padding:24px 24px 26px;background:' + cbPal.bg + ';'
          : 'position:relative;padding:44px 40px;display:flex;flex-direction:column;justify-content:center;order:2;'
      }));
      wrap.appendChild(buildProClose(cbPal, 'top:12px;right:12px;', isMobile));

    } else if (ccfStyle.id === 'bottom_sheet') {
      // ---------- POPUP STYLE: Bottom Sheet — anchored to the viewport's
      // bottom edge, rounded top corners only, safe-area-inset-bottom
      // padding, small drag handle as the swipe-down-to-dismiss
      // affordance. Mobile-only (see ccfResolveStyle() above). ----------
      var bsFields = ccfStyle.fields || {};
      var bsRadius = (cfg.borderRadius != null ? cfg.borderRadius : 16) + 'px';
      var bsBg = cfg.bgColor || '#ffffff';
      var bsFg = cfg.textColor || '#111827';

      // mobile-popup-polish: full-width edge-to-edge is this style's own
      // anchor (bottom sheets don't float with side margins on a real
      // device) so no max-width guard is added here — item 3's max-width
      // requirement applies to the floating/card-shaped styles, not the
      // edge-anchored ones. max-height+overflow-y IS added: if the sheet's
      // own content (long headline/subtext/countdown) ever exceeds the
      // viewport, it scrolls internally instead of pushing Allow off the
      // bottom edge.
      wrap.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'bottom:0', 'width:100%',
        'max-height:calc(100vh - 32px)',
        'padding-bottom:env(safe-area-inset-bottom, 0px)',
        'background:' + bsBg, 'color:' + bsFg,
        'border-top-left-radius:' + bsRadius, 'border-top-right-radius:' + bsRadius,
        'overflow-x:hidden', 'overflow-y:auto', 'box-shadow:0 -8px 30px rgba(0,0,0,0.2)',
        'z-index:2147483647',
        'font-family:' + (cfg.fontFamily || '-apple-system,BlinkMacSystemFont,sans-serif')
      ].join(';');
      wrap.classList.add('layout-sheet');

      var bsHandleEnabled = bsFields.dragHandleEnabled !== false;
      if (bsHandleEnabled) {
        var bsHandleWrap = document.createElement('div');
        bsHandleWrap.style.cssText = 'display:flex;justify-content:center;padding-top:8px;';
        var bsHandle = document.createElement('div');
        bsHandle.style.cssText = 'width:40px;height:5px;border-radius:999px;background:#9ca3af;';
        bsHandleWrap.appendChild(bsHandle);
        wrap.appendChild(bsHandleWrap);
      }

      var bsImageUrl = cfg.imageUrl || '';
      if (bsImageUrl) {
        var bsImgEl = document.createElement('img');
        bsImgEl.src = bsImageUrl;
        bsImgEl.alt = '';
        bsImgEl.style.cssText = 'width:100%;height:' + (isMobile ? '90px' : '110px') +
          ';object-fit:cover;display:block;margin-top:8px;object-position:' +
          (cfg.imagePosition || '50% 50%') + ';';
        bsImgEl.onerror = function () { bsImgEl.style.display = 'none'; };
        wrap.appendChild(bsImgEl);
      } else if (bsFields.iconArtEnabled !== false) {
        var bsIconWrap = document.createElement('div');
        bsIconWrap.style.cssText = 'height:70px;display:flex;align-items:center;' +
          'justify-content:center;color:' + accent + ';';
        bsIconWrap.innerHTML = ccfIcon('gift', 40); // hardcoded icon markup — no merchant string involved
        wrap.appendChild(bsIconWrap);
      }

      // mobile-popup-polish: token set (padding/headline/subtext/gap) —
      // see the token table in audits/mobile-popup-polish-audit.txt.
      var bsContent = document.createElement('div');
      bsContent.id = 'ccf-content-section';
      bsContent.style.cssText = 'padding:' + ccfMobileOuterPad + ';text-align:center;';

      var bsHead = document.createElement('div');
      bsHead.id = 'ccf-prompt-text';
      bsHead.style.cssText = 'font-size:18px;font-weight:700;line-height:1.3;margin-bottom:12px;';
      bsHead.textContent = headline;
      bsContent.appendChild(bsHead);

      if (cfg.subtext) {
        var bsSub = document.createElement('div');
        bsSub.style.cssText = 'font-size:13px;margin-bottom:12px;line-height:1.4;color:#6b7280;';
        bsSub.textContent = cfg.subtext;
        bsContent.appendChild(bsSub);
      }

      if (ccfShowEmailField()) {
        var bsEmailInput = document.createElement('input');
        bsEmailInput.type = 'email';
        bsEmailInput.id = 'ccf-email-input';
        bsEmailInput.className = 'ccf-input';
        var bsEp = ccfFieldPct('emailDiscount');
        bsEmailInput.placeholder = 'Your email' + (bsEp ? ' (get ' + bsEp + '% off)' : '');
        bsEmailInput.style.cssText = ccfInputStyle();
        bsContent.appendChild(bsEmailInput);
      }

      allow = buildAllowBtn(ccfAllowButtonStyle(accent, cfg.ctaStyle));
      bsContent.appendChild(allow);

      // mobile-popup-polish: padded up from ccfDenyButtonStyle()'s shared
      // 6px-tall default to a ~44px tap target — only for this style (not
      // a change to ccfDenyButtonStyle() itself, which Classic/Flash Sale/
      // Gift Reveal also share and which must stay byte-identical on
      // desktop).
      deny = buildDenyBtn(ccfDenyButtonStyle() + 'padding:15px 0;');
      bsContent.appendChild(deny);

      if (cfg.showBranding) {
        bsContent.appendChild(buildBranding(
          'margin-top:12px;font-size:10px;text-align:center;letter-spacing:0.5px;color:#d1d5db;'));
      }

      wrap.appendChild(bsContent);

      // mobile-popup-polish: 26x26 -> 44x44 tap target (token: close X
      // minimum 44x44), keeping the same visual glyph size/position feel
      // via a larger centered hit area.
      closeBtn = document.createElement('button');
      closeBtn.id = 'ccf-close-btn';
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.style.cssText = 'position:absolute;top:' + (bsHandleEnabled ? '10px' : '4px') +
        ';right:4px;background:rgba(0,0,0,0.35);color:#fff;border:none;border-radius:50%;' +
        'width:44px;height:44px;font-size:16px;line-height:44px;text-align:center;cursor:pointer;z-index:10;';
      wrap.appendChild(closeBtn);

    } else if (ccfStyle.id === 'top_bar') {
      // ---------- POPUP STYLE: Top Bar — a slim bar pinned to the top of
      // the screen, headline + inline CTA on one line. Mobile-only (see
      // ccfResolveStyle() above). No discount/code-reveal state — same
      // "no room for it" (see wantsDiscount
      // below).
      // mobile-popup-polish: DELIBERATE token exception — headline stays
      // 13px/700 (single-line, ellipsis-if-long by design) and Allow stays
      // "compact" (8px/13px) rather than the 18px/700 headline and full
      // 15px/700 button tokens applied to the other 2 mobile-only styles.
      // A slim single-line bar is this style's entire reason for existing
      // (its alternative IS Bottom Sheet/Story Card); forcing the full
      // token set here would inflate it into one of those. The close X
      // still gets a bigger tap target below, short of the full 44x44
      // token for the same reason — 44px would double the bar's height. ----------
      var tbFields = ccfStyle.fields || {};
      var tbBg = cfg.accentColor || '#4f46e5';
      var tbFg = cfg.textColor || '#ffffff';

      // mobile-popup-polish: full-width, top-anchored by design (same
      // "no side-margin guard" reasoning as Bottom Sheet).
      // max-height/overflow-y added for consistency with every other
      // style, though a single-line bar can't realistically overflow.
      wrap.style.cssText = [
        'position:fixed', 'left:0', 'right:0', 'top:0', 'width:100%',
        'max-height:calc(100vh - 32px)',
        'padding-top:env(safe-area-inset-top, 0px)',
        'z-index:2147483647',
        'background:' + tbBg, 'color:' + tbFg,
        'padding:10px 14px', 'display:flex', 'align-items:center', 'gap:10px',
        'overflow-y:auto',
        'box-shadow:0 2px 12px rgba(0,0,0,0.18)',
        'font-family:' + (cfg.fontFamily || '-apple-system,BlinkMacSystemFont,sans-serif')
      ].join(';');
      wrap.classList.add('layout-bar'); // no translateX(-50%) resting transform, same reasoning as the other full-width bar layouts

      var tbText = document.createElement('span');
      tbText.id = 'ccf-prompt-text';
      tbText.setAttribute('style',
        'flex:1;min-width:0;font-size:13px;font-weight:700;white-space:nowrap;' +
        'overflow:hidden;text-overflow:ellipsis;');
      tbText.textContent = headline;
      wrap.appendChild(tbText);

      allow = buildAllowBtn(
        ccfAllowButtonStyle(tbBg, cfg.ctaStyle, true) + 'width:auto;flex-shrink:0;margin-bottom:0;');
      allow.textContent = (cfg.allowText || 'Allow') + (tbFields.arrowCta ? ' →' : '');
      wrap.appendChild(allow);

      closeBtn = document.createElement('button');
      closeBtn.id = 'ccf-close-btn';
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.style.cssText =
        'background:none;border:none;color:' + tbFg + ';opacity:0.75;font-size:18px;' +
        'line-height:1;cursor:pointer;flex-shrink:0;padding:2px;' +
        'min-width:36px;min-height:36px;display:flex;align-items:center;justify-content:center;';
      wrap.appendChild(closeBtn);
      deny = closeBtn; // the × is the only dismiss control for this layout

    } else if (ccfStyle.id === 'story_card') {
      // ---------- POPUP STYLE: Story Card — a tall, full-bleed photo card
      // with the headline overlaid directly on the image behind a bottom
      // gradient scrim, no separate white/colored content panel. Uses the
      // SAME centered (translate(-50%,-50%)) resting position and
      // 'layout-center' animation class as Flash Sale/Gift Reveal above.
      // Mobile-only (see ccfResolveStyle() above). ----------
      var scFields = ccfStyle.fields || {};
      var scRadius = (cfg.borderRadius != null ? cfg.borderRadius : 16) + 'px';
      var scImageUrl = cfg.imageUrl || '';
      var scFg = '#ffffff';

      // mobile-popup-polish: was bottom:24px (bottom-anchored) — the
      // admin preview already shows this style CENTERED (both axes, per
      // the task's own spec); this was exactly the admin/storefront
      // disagreement the task asked to find and fix. Now genuinely
      // centered here too, plus the same max-height/overflow-y safety
      // net and narrow-viewport width guard as every other style.
      wrap.style.cssText = [
        'position:fixed', 'top:50%', 'left:50%', 'transform:translate(-50%,-50%)',
        'width:' + (isMobile ? 'min(260px, calc(100vw - 32px))' : 'min(280px,90vw)'),
        'aspect-ratio:9/16',
        'max-height:calc(100vh - 32px)',
        'background:' + (scImageUrl ? '#111827' : ('linear-gradient(160deg,' + accent + ',' + accent + 'cc)')),
        'color:' + scFg, 'border-radius:' + scRadius,
        'overflow-x:hidden', 'overflow-y:auto',
        'display:flex', 'flex-direction:column', 'justify-content:flex-end',
        'box-shadow:0 20px 60px rgba(0,0,0,0.3)', 'z-index:2147483647',
        'font-family:' + (cfg.fontFamily || '-apple-system,BlinkMacSystemFont,sans-serif'),
        'max-width:90vw'
      ].join(';');
      // mobile-popup-polish: was bottom-anchored (translateX(-50%)) before
      // this task's centering fix; now needs the same translate(-50%,-50%)
      // animation class as Flash Sale/Gift Reveal above, or the shared
      // default entrance animation snaps to the wrong resting transform.
      wrap.classList.add('layout-center');

      if (scImageUrl) {
        var scImgEl = document.createElement('img');
        scImgEl.src = scImageUrl;
        scImgEl.alt = '';
        scImgEl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;' +
          'object-fit:cover;object-position:' + (cfg.imagePosition || '50% 50%') + ';';
        scImgEl.onerror = function () { scImgEl.style.display = 'none'; };
        wrap.appendChild(scImgEl);
      }

      if (scFields.scrimEnabled !== false) {
        var scScrim = document.createElement('div');
        scScrim.setAttribute('style', 'position:absolute;inset:0;' +
          'background:linear-gradient(180deg,transparent 40%,rgba(0,0,0,0.78) 100%);');
        wrap.appendChild(scScrim);
      }

      // mobile-popup-polish: token padding/headline/gap applied.
      var scContent = document.createElement('div');
      scContent.id = 'ccf-content-section';
      scContent.style.cssText = 'position:relative;padding:' + ccfMobileOuterPad + ';text-align:center;';

      var scHead = document.createElement('div');
      scHead.id = 'ccf-prompt-text';
      scHead.style.cssText = 'font-size:18px;font-weight:700;line-height:1.3;margin-bottom:12px;';
      scHead.textContent = headline;
      scContent.appendChild(scHead);

      if (cfg.subtext) {
        var scSub = document.createElement('div');
        scSub.style.cssText = 'font-size:13px;margin-bottom:12px;line-height:1.4;color:rgba(255,255,255,0.85);';
        scSub.textContent = cfg.subtext;
        scContent.appendChild(scSub);
      }

      if (ccfShowEmailField()) {
        var scEmailInput = document.createElement('input');
        scEmailInput.type = 'email';
        scEmailInput.id = 'ccf-email-input';
        scEmailInput.className = 'ccf-input';
        var scEp = ccfFieldPct('emailDiscount');
        scEmailInput.placeholder = 'Your email' + (scEp ? ' (get ' + scEp + '% off)' : '');
        scEmailInput.style.cssText = ccfInputStyle() +
          'background:rgba(255,255,255,0.15);color:' + scFg + ';border-color:rgba(255,255,255,0.3);';
        scContent.appendChild(scEmailInput);
      }

      allow = buildAllowBtn(ccfAllowButtonStyle(accent, cfg.ctaStyle));
      scContent.appendChild(allow);

      // mobile-popup-polish: padded to a ~44px tap target, same as Bottom
      // Sheet above — per-style override, not a change to the
      // shared ccfDenyButtonStyle().
      deny = buildDenyBtn(ccfDenyButtonStyle() + 'color:rgba(255,255,255,0.7);padding:15px 0;');
      scContent.appendChild(deny);

      if (cfg.showBranding) {
        scContent.appendChild(buildBranding(
          'margin-top:12px;font-size:10px;text-align:center;letter-spacing:0.5px;color:rgba(255,255,255,0.4);'));
      }

      wrap.appendChild(scContent);

      // mobile-popup-polish: 26x26 -> 44x44 tap target, same as Bottom
      // Sheet's close X above.
      closeBtn = document.createElement('button');
      closeBtn.id = 'ccf-close-btn';
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.style.cssText = 'position:absolute;top:4px;right:4px;' +
        'background:rgba(0,0,0,0.4);color:#fff;border:none;border-radius:50%;' +
        'width:44px;height:44px;font-size:16px;line-height:44px;text-align:center;cursor:pointer;z-index:10;';
      wrap.appendChild(closeBtn);

    } else if (layout === 'card') {
      // ---------- LAYOUT 2: premium card. DESKTOP is the exact original
      // array, untouched (constraint: Classic desktop must stay
      // byte-identical) — built as its own separate branch rather than
      // sprinkling ternaries into one shared array, specifically so nothing
      // here can silently change desktop's output string. mobile-popup-
      // polish: MOBILE becomes genuinely centered (both axes) per the
      // anchor-table requirement, plus the max-height/overflow-y safety
      // net and the narrow-viewport width guard from item 3. ----------
      var cardRadius = (cfg.borderRadius != null ? cfg.borderRadius : 22) + 'px';
      wrap.style.cssText = isMobile ? [
        'position:fixed',
        'top:50%',
        'left:50%',
        'transform:translate(-50%,-50%)',
        'width:min(300px, calc(100vw - 32px))',
        'max-height:calc(100vh - 32px)',
        'background:linear-gradient(145deg,#ffffff,#f8f9ff)',
        'border-radius:' + cardRadius,
        'overflow-x:hidden',
        'overflow-y:auto',
        'box-shadow:0 20px 60px rgba(0,0,0,0.18),0 4px 12px rgba(0,0,0,0.08),inset 0 1px 0 rgba(255,255,255,0.8)',
        'z-index:2147483647',
        'font-family:' + (cfg.fontFamily || '-apple-system,BlinkMacSystemFont,sans-serif'),
        'border:1px solid rgba(255,255,255,0.8)',
        'max-width:90vw'
      ].join(';') : [
        'position:fixed',
        'bottom:24px',
        'left:50%',
        'transform:translateX(-50%)',
        'width:min(340px,90vw)',
        'background:linear-gradient(145deg,#ffffff,#f8f9ff)',
        'border-radius:' + cardRadius,
        'overflow:hidden',
        'box-shadow:0 20px 60px rgba(0,0,0,0.18),0 4px 12px rgba(0,0,0,0.08),inset 0 1px 0 rgba(255,255,255,0.8)',
        'z-index:2147483647',
        'font-family:' + (cfg.fontFamily || '-apple-system,BlinkMacSystemFont,sans-serif'),
        'border:1px solid rgba(255,255,255,0.8)',
        'max-width:90vw'
      ].join(';');
      // mobile-popup-polish: mobile now rests at translate(-50%,-50%)
      // instead of desktop's translateX(-50%) — needs 'layout-center' so
      // the entrance animation/hover-lift use the right transform basis.
      // Conditional on isMobile (not a class the desktop branch ever
      // gets) so desktop's classList, like its cssText, stays exactly as
      // it was before this task.
      if (isMobile) wrap.classList.add('layout-center');

      if (cfg.imageUrl) {
        // Image wrapper with effects (dark bottom gradient, diagonal sheen,
        // corner dot pattern) — see ccfInjectPopupStyles for the CSS.
        var imgWrap = document.createElement('div');
        imgWrap.className = 'ccf-img-wrap ccf-corner-dots';
        imgWrap.style.cssText = [
          'width:100%',
          'height:' + (isMobile ? '160px' : '170px'),
          'position:relative',
          'overflow:hidden',
          'flex-shrink:0'
        ].join(';');

        // Main image with zoom-on-hover (CSS: #ccf-push-prompt:hover .ccf-popup-img).
        var cardImgEl = document.createElement('img');
        cardImgEl.src = cfg.imageUrl;
        cardImgEl.alt = '';
        cardImgEl.className = 'ccf-popup-img';
        cardImgEl.style.cssText = [
          'width:100%',
          'height:100%',
          'object-fit:cover',
          'display:block',
          'object-position:' + (cfg.imagePosition || '50% 50%')
        ].join(';');
        cardImgEl.onerror = function () {
          imgWrap.style.background = 'linear-gradient(135deg,' + accent + ',' + accent + '88)';
          cardImgEl.style.display = 'none';
        };
        imgWrap.appendChild(cardImgEl);

        // Decorative accent circles (bottom-right).
        var imgShape1 = document.createElement('div');
        imgShape1.style.cssText = [
          'position:absolute',
          'bottom:-20px',
          'right:-20px',
          'width:80px',
          'height:80px',
          'border-radius:50%',
          'background:rgba(255,255,255,0.12)',
          'z-index:2',
          'pointer-events:none'
        ].join(';');
        imgWrap.appendChild(imgShape1);

        var imgShape2 = document.createElement('div');
        imgShape2.style.cssText = [
          'position:absolute',
          'bottom:20px',
          'right:20px',
          'width:40px',
          'height:40px',
          'border-radius:50%',
          'background:rgba(255,255,255,0.1)',
          'z-index:2',
          'pointer-events:none'
        ].join(';');
        imgWrap.appendChild(imgShape2);

        wrap.appendChild(imgWrap);
      } else {
        // No image — premium gradient placeholder instead of nothing.
        var gradientWrap = document.createElement('div');
        gradientWrap.style.cssText = [
          'width:100%',
          'height:' + (isMobile ? '120px' : '130px'),
          'background:linear-gradient(135deg,' +
            accent + ' 0%,' + accent + 'aa 50%,' + accent + '44 100%)',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'position:relative',
          'overflow:hidden',
          'flex-shrink:0'
        ].join(';');

        // Animated circles in the gradient.
        ['70px 70px rgba(255,255,255,0.08)',
         '120px 120px rgba(255,255,255,0.05)'].forEach(function (c, i) {
          var circle = document.createElement('div');
          var parts = c.split(' ');
          circle.style.cssText = [
            'position:absolute',
            i === 0 ? 'top:-20px;right:-20px' : 'bottom:-40px;left:-40px',
            'width:' + parts[0],
            'height:' + parts[1],
            'border-radius:50%',
            'background:' + parts[2]
          ].join(';');
          gradientWrap.appendChild(circle);
        });

        // Store icon in the center.
        var gradientIcon = document.createElement('div');
        gradientIcon.style.cssText = 'color:#fff;line-height:1;z-index:1;' +
          'animation:ccfBounce 2s ease infinite';
        gradientIcon.innerHTML = ccfIcon('bag', 36);
        gradientWrap.appendChild(gradientIcon);
        wrap.appendChild(gradientWrap);
      }

      // Subtle top accent line — right after the image, or at the very top
      // when there's no image. `accent` is already in scope (cfg.accentColor).
      var accentLine = document.createElement('div');
      accentLine.style.cssText = [
        'height:3px',
        'background:linear-gradient(90deg,' + accent + ',' + accent + '88,transparent)',
        'width:100%'
      ].join(';');
      wrap.appendChild(accentLine);

      var cardContent = document.createElement('div');
      cardContent.id = 'ccf-content-section';
      cardContent.style.cssText = 'padding:20px 18px 18px;';

      var cardAlign = cfg.textAlign || 'left';

      if (cfg.brandName) {
        var cardBrand = document.createElement('div');
        cardBrand.style.cssText = [
          'font-size:10px',
          'font-weight:700',
          'letter-spacing:3px',
          'text-transform:uppercase',
          'color:#9ca3af',
          'margin-bottom:8px'
        ].join(';');
        cardBrand.textContent = cfg.brandName;
        cardContent.appendChild(cardBrand);
      }

      var cardHead = document.createElement('div');
      cardHead.id = 'ccf-prompt-text';
      cardHead.style.cssText = [
        'font-size:16px',
        'font-weight:700',
        'line-height:1.3',
        'color:' + fg,
        'margin-bottom:6px',
        'text-align:' + cardAlign
      ].join(';');
      cardHead.textContent = headline;
      cardContent.appendChild(cardHead);

      if (cfg.subtext) {
        var cardSub = document.createElement('div');
        cardSub.style.cssText = [
          'font-size:13px',
          'color:#6b7280',
          'margin-bottom:16px',
          'line-height:1.5',
          'text-align:' + cardAlign
        ].join(';');
        cardSub.textContent = cfg.subtext;
        cardContent.appendChild(cardSub);
      }

      // Highlighted discount offer, when any discount action is configured
      // — a gently bouncing badge (see .ccf-discount-badge / ccfBounce).
      if (ccfDiscountEnabled()) {
        var offerBox = document.createElement('div');
        offerBox.className = 'ccf-discount-badge';
        offerBox.style.cssText = [
          'background:linear-gradient(135deg,#f0fdf4,#dcfce7)',
          'border:1px solid #86efac',
          'border-radius:12px',
          'padding:10px 14px',
          'margin-bottom:14px',
          'display:flex',
          'align-items:center',
          'gap:8px',
          'justify-content:center'
        ].join(';');
        offerBox.innerHTML =
          '<span style="display:inline-flex;color:#16a34a">' + ccfIcon('tag', 16) + '</span>' +
          '<span style="font-size:13px;color:#16a34a;font-weight:600">' +
          ccfEscapeHtml(ccfDiscountOfferText()) + '</span>';
        cardContent.appendChild(offerBox);
      }

      // Card builds its own inline email input (matching its own
      // content-section design) instead of the shared
      // ccfBuildDiscountFields()+append path split still uses below.
      // Phone field removed — email-only capture (see ccfShowPhoneField()).
      if (ccfShowEmailField()) {
        var cardEmailInput = document.createElement('input');
        cardEmailInput.type = 'email';
        cardEmailInput.id = 'ccf-email-input';
        cardEmailInput.className = 'ccf-input';
        var cardEp = ccfFieldPct('emailDiscount');
        cardEmailInput.placeholder = 'Your email' + (cardEp ? ' (get ' + cardEp + '% off)' : '');
        cardEmailInput.style.cssText = ccfInputStyle();
        cardContent.appendChild(cardEmailInput);
      }

      allow = buildAllowBtn(ccfAllowButtonStyle(accent, cfg.ctaStyle));
      cardContent.appendChild(allow);

      // Plain text dismiss — no border/box, not underlined by default
      // (CSS handles the subtle hover color, see ccfInjectPopupStyles).
      deny = buildDenyBtn(ccfDenyButtonStyle());
      cardContent.appendChild(deny);

      if (cfg.showBranding) {
        cardContent.appendChild(buildBranding(
          'margin-top:12px;font-size:10px;color:#d1d5db;text-align:center;letter-spacing:0.5px;'));
      }

      wrap.appendChild(cardContent);

      closeBtn = document.createElement('button');
      closeBtn.id = 'ccf-close-btn';
      closeBtn.type = 'button';
      closeBtn.textContent = '×';
      closeBtn.style.cssText = 'position:absolute;top:12px;right:12px;' +
        'background:rgba(0,0,0,0.35);color:#fff;border:none;border-radius:50%;' +
        'width:26px;height:26px;font-size:14px;line-height:26px;text-align:center;' +
        'cursor:pointer;z-index:10;';
      wrap.appendChild(closeBtn);

    } else {
      // ---------- LAYOUT 1: split (image + content), the default ----------
      var imageUrl = cfg.imageUrl || '';

      // Desktop reuses this single <img>; mobile builds its own below.
      var splitImgEl = null;
      if (imageUrl) {
        splitImgEl = document.createElement('img');
        splitImgEl.src = imageUrl;
        splitImgEl.alt = '';
        splitImgEl.setAttribute('style',
          'width:100%;height:100%;object-fit:cover;object-position:' + imagePosition + ';display:block;');
      }

      closeBtn = document.createElement('button');
      closeBtn.id = 'ccf-close-btn';
      closeBtn.type = 'button';
      closeBtn.textContent = '×';

      if (isMobile) {
        // ----- MOBILE: image on top, content below -----
        wrap.setAttribute('style',
          'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
          'width:88vw;max-width:360px;border-radius:16px;overflow:hidden;' +
          'background:' + bg + ';box-shadow:0 20px 60px rgba(0,0,0,0.35);z-index:999999;');
        // Screen-centered (translate(-50%,-50%)) — use the fade+scale
        // animation instead of the bottom-anchored default slide-up.
        wrap.classList.add('layout-center');

        // Image section — always a fixed 200px tall box; if an image is set,
        // an absolutely-positioned <img> fills it, with a gradient fallback
        // both when there's no image and when the image fails to load.
        var mImg = document.createElement('div');
        mImg.style.cssText = [
          'width:100%',
          'height:200px',
          'flex-shrink:0',
          'position:relative',
          'overflow:hidden',
          imageUrl
            ? 'background:none'
            : 'background:linear-gradient(135deg,#667eea,#764ba2)'
        ].join(';');

        if (imageUrl) {
          var imgEl = document.createElement('img');
          imgEl.src = imageUrl;
          imgEl.alt = '';
          imgEl.style.cssText = [
            'width:100%',
            'height:100%',
            'object-fit:cover',
            'display:block',
            'position:absolute',
            'top:0',
            'left:0',
            'object-position:' + (cfg.imagePosition || '50% 50%')
          ].join(';');
          imgEl.onerror = function () {
            mImg.style.background = 'linear-gradient(135deg,#667eea,#764ba2)';
            imgEl.style.display = 'none';
          };
          mImg.appendChild(imgEl);
        }

        var mContent = document.createElement('div');
        mContent.id = 'ccf-content-section';
        mContent.setAttribute('style',
          'padding:20px 18px;background:' + bg + ';color:' + fg + ';font-family:' + font + ';');

        if (cfg.brandName) {
          var mBrand = document.createElement('div');
          mBrand.setAttribute('style',
            'font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;' +
            'color:#9ca3af;margin-bottom:8px;');
          mBrand.textContent = cfg.brandName;
          mContent.appendChild(mBrand);
        }

        var mHead = document.createElement('div');
        mHead.id = 'ccf-prompt-text';
        mHead.setAttribute('style',
          'font-size:20px;font-weight:700;line-height:1.25;margin-bottom:8px;color:' + fg + ';');
        mHead.textContent = headline;
        mContent.appendChild(mHead);

        if (cfg.subtext) {
          var mSub = document.createElement('div');
          mSub.setAttribute('style',
            'font-size:13px;color:#6b7280;margin-bottom:16px;line-height:1.4;');
          mSub.textContent = cfg.subtext;
          mContent.appendChild(mSub);
        }

        allow = buildAllowBtn(ccfAllowButtonStyle(accent, cfg.ctaStyle));
        mContent.appendChild(allow);

        deny = buildDenyBtn(ccfDenyButtonStyle());
        mContent.appendChild(deny);

        if (cfg.showBranding) {
          mContent.appendChild(buildBranding(
            'margin-top:12px;font-size:10px;color:#d1d5db;text-align:center;'));
        }

        closeBtn.setAttribute('style',
          'position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.4);color:#fff;' +
          'border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;' +
          'font-size:16px;line-height:28px;text-align:center;z-index:10;');

        wrap.appendChild(mImg);
        wrap.appendChild(mContent);
        wrap.appendChild(closeBtn);

      } else {
        // ----- DESKTOP: side-by-side (unchanged) -----
        wrap.setAttribute('style',
          'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:999999;' +
          'max-width:680px;width:90%;display:flex;border-radius:12px;overflow:hidden;' +
          'box-shadow:0 20px 60px rgba(0,0,0,0.3);');
        // Screen-centered — same reasoning as the mobile-split branch above.
        wrap.classList.add('layout-center');

        var leftPanel = document.createElement('div');
        leftPanel.className = 'ccf-img-wrap ccf-corner-dots';
        leftPanel.setAttribute('style',
          'width:45%;min-height:380px;background:linear-gradient(135deg,#667eea,#764ba2);');
        if (splitImgEl) {
          splitImgEl.className = 'ccf-popup-img';
          leftPanel.appendChild(splitImgEl);
        }

        var rightPanel = document.createElement('div');
        rightPanel.id = 'ccf-content-section';
        rightPanel.setAttribute('style',
          'width:55%;padding:32px 28px;display:flex;flex-direction:column;justify-content:center;' +
          'background:' + bg + ';color:' + fg + ';font-family:' + font + ';');

        if (cfg.brandName) {
          var splitBrand = document.createElement('div');
          splitBrand.setAttribute('style',
            'letter-spacing:3px;font-size:11px;font-weight:600;text-transform:uppercase;' +
            'color:#9ca3af;margin-bottom:12px;');
          splitBrand.textContent = cfg.brandName;
          rightPanel.appendChild(splitBrand);
        }

        var splitHead = document.createElement('div');
        splitHead.id = 'ccf-prompt-text';
        splitHead.setAttribute('style',
          'font-size:26px;font-weight:700;line-height:1.2;margin-bottom:12px;');
        splitHead.textContent = headline;
        rightPanel.appendChild(splitHead);

        if (cfg.subtext) {
          var splitSub = document.createElement('div');
          splitSub.setAttribute('style', 'font-size:14px;color:#6b7280;margin-bottom:24px;');
          splitSub.textContent = cfg.subtext;
          rightPanel.appendChild(splitSub);
        }

        allow = buildAllowBtn(ccfAllowButtonStyle(accent, cfg.ctaStyle));
        rightPanel.appendChild(allow);

        deny = buildDenyBtn(ccfDenyButtonStyle());
        rightPanel.appendChild(deny);

        if (cfg.showBranding) {
          rightPanel.appendChild(buildBranding('margin-top:16px;font-size:10px;color:#d1d5db;'));
        }

        closeBtn.setAttribute('style',
          'position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.4);color:#fff;' +
          'border:none;border-radius:50%;width:28px;height:28px;cursor:pointer;' +
          'font-size:16px;line-height:28px;text-align:center;z-index:10;');

        wrap.appendChild(leftPanel);
        wrap.appendChild(rightPanel);
        wrap.appendChild(closeBtn);
      }

      // Dark overlay behind the popup (split layout only, unless disabled).
      if (cfg.showOverlay !== false) {
        var oAlpha = (typeof cfg.overlayOpacity === 'number') ? cfg.overlayOpacity : 0.5;
        overlay = document.createElement('div');
        overlay.id = 'ccf-overlay';
        overlay.setAttribute('style',
          'position:fixed;top:0;left:0;width:100%;height:100%;' +
          'background:rgba(0,0,0,' + oAlpha + ');z-index:999998;');
      }
    }

    if (overlay) document.body.appendChild(overlay);
    document.body.appendChild(wrap);

    // discount-feature: the split layout still uses the shared field-builder,
    // inserted right after the deny control. Card builds its own inline
    // fields above (see the card branch).
    // popup-style: Flash Sale/Gift Reveal build their own inline email
    // field too (same as card) — gating on ccfStyle.id === 'classic' here
    // stops this from ALSO firing when the layout field left over from an
    // earlier Classic session still happens to read 'split' while a style
    // is active (popup.layout is deliberately left untouched while a
    // non-classic style is selected — see ccfResolveStyle()/Settings.jsx).
    if (ccfStyle.id === 'classic' && layout === 'split') {
      var discountFields = ccfBuildDiscountFields();
      if (discountFields && deny && deny.parentNode) {
        if (deny.nextSibling) deny.parentNode.insertBefore(discountFields, deny.nextSibling);
        else deny.parentNode.appendChild(discountFields);
      }
    }
    // Top Bar never shows a discount — no room for the unlocked-code reveal
    // state in a slim bar, and no #ccf-content-section swap target is built
    // for it above.
    var wantsDiscount = ccfStyle.id === 'top_bar'
      ? false
      : ccfDiscountEnabled();

    function cleanup() {
      if (promptAutoDismissTimer) { clearTimeout(promptAutoDismissTimer); promptAutoDismissTimer = null; }
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      var ov = document.getElementById('ccf-overlay');
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
    }

    // discount-feature: consume the /generate-discount response — tidy the
    // popup, stash the code for cross-page badges, then hand off to the
    // module-level handleDiscount (product button + in-popup code block).
    function finishDiscount(d, action) {
      // Guard: only render/inject the discount UI when Shopify actually
      // created a code. On { code: null } just close the popup — the
      // subscribe already succeeded, so nothing else is blocked.
      if (!d || !d.code) { cleanup(); return; }

      // NOTE: ccf_active_discount / ccf_active_pct are stashed by
      // renderDiscountCode() immediately before it redirects — NOT here —
      // so the redirected page load never finds a stale code and skips.
      // renderDiscountCode() replaces #ccf-content-section wholesale, so
      // there's no separate need to hide the Allow button or the discount
      // fields here — they live inside that same section and go with it.

      var productHandle = null;
      var pathParts = window.location.pathname.split('/');
      var prodIdx = pathParts.indexOf('products');
      if (prodIdx !== -1 && pathParts[prodIdx + 1]) {
        productHandle = pathParts[prodIdx + 1].split('?')[0].split('#')[0];
      }

      handleDiscount(d, action, productHandle, ccfStyle);
    }

    allow.addEventListener('click', function () {
      // Read the discount inputs BEFORE any teardown.
      var emailEl = document.getElementById('ccf-email-input');
      var email = emailEl && emailEl.value ? emailEl.value.trim() : '';
      var originalButtonText = allow.textContent;
      var originalButtonBg = allow.style.background;

      function resetButton() {
        allow.disabled = false;
        allow.textContent = originalButtonText;
        allow.style.opacity = '1';
        allow.style.cursor = 'pointer';
        allow.style.background = originalButtonBg;
      }

      // Stage 1: immediate feedback — keep the popup open while we work.
      allow.disabled = true;
      ccfSetLabel(allow, 'loader', 'Setting up...');
      allow.style.opacity = '0.8';
      allow.style.cursor = 'not-allowed';

      // Already-subscribed customer (discount-capture path) — there's no
      // native permission prompt to show, so skip requestPermission()
      // entirely and go straight to generating the discount.
      if (Notification.permission === 'granted') {
        var capAction = 'push';
        if (email) capAction = 'email';

        ccfSetLabel(allow, 'check', 'Getting your discount...');
        allow.style.background = '#16a34a';

        registerSW()
          .then(function (reg) { return getToken(reg); })
          .then(function (t) { return saveToken(t); })
          .catch(function (err) {
            console.error('[ccf] granted-path subscribe failed:', err.message);
            // do not block the discount on a subscribe failure
          })
          .then(function () {
            return fetch('/cart.js')
              .then(function (r) { return r.json(); })
              .catch(function () { return { token: '' }; })
              .then(function (cart) {
                var cartToken = cart.token ? cart.token.split('?')[0].trim() : null;
                return fetch('/apps/cartncodform/generate-discount?shop=' + encodeURIComponent(SHOP_DOMAIN), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: capAction, email: email,
                    sessionId: getSessionId(), cartToken: cartToken
                  })
                });
              })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                if (d && d.code) ccfSetLabel(allow, 'gift', 'Redirecting...');
                finishDiscount(d, capAction);
              });
          })
          .catch(function () { resetButton(); });
        return;
      }

      // Normal flow for new subscribers.
      Notification.requestPermission().then(function (permission) {
        var granted = permission === 'granted';
        try { trackEvent('push_prompt_accepted', { trigger: trigger, granted: granted }); } catch (e) {}
        if (!granted) {
          try { sessionStorage.setItem('ccf_denied_session', '1'); } catch (e) {}
          cleanup();
          return;
        }
        registerSW()
          .then(function (reg) { return getToken(reg); })
          .then(function (token) { return saveToken(token); })
          .then(function () { setupForegroundMessages(); })
          .then(function () {
            // Stage 2: subscribed.
            ccfSetLabel(allow, 'check', wantsDiscount
              ? 'Subscribed! Getting your discount...'
              : 'Subscribed!');
            allow.style.background = '#16a34a';

            if (!wantsDiscount) {
              setTimeout(cleanup, 900);
              return;
            }
            var action = 'push';
            if (email) action = 'email';
            return fetch('/cart.js')
              .then(function (r) { return r.json(); })
              .then(function (cart) {
                var cartToken = cart.token ? cart.token.split('?')[0].trim() : null;
                return fetch('/apps/cartncodform/generate-discount?shop=' + encodeURIComponent(SHOP_DOMAIN), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    action: action, email: email,
                    sessionId: getSessionId(), cartToken: cartToken
                  })
                });
              })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                // Stage 3: discount generated — renderDiscountCode swaps the
                // content section right after this, via finishDiscount().
                if (d && d.code) ccfSetLabel(allow, 'gift', 'Redirecting...');
                finishDiscount(d, action);
              })
              .catch(function () {
                // Stage 4: error — reset so the customer can retry, rather
                // than silently closing the popup.
                resetButton();
              });
          })
          .catch(function (err) {
            console.error('[CCF] subscribe after prompt failed:', err.message);
            console.error('[ccf] Allow flow failed:', err.message);
            var ccfDebug = false;
            try {
              ccfDebug = /[?&]ccf_debug=1/.test(window.location.search) ||
                localStorage.getItem('ccf_debug') === '1';
            } catch (e) {}
            if (ccfDebug) {
              alert('[CCF Error] ' + err.message);
            }
            resetButton();
          });
      });
    });

    deny.addEventListener('click', function () {
      cleanup();
      try { sessionStorage.setItem('ccf_denied_session', '1'); } catch (e) {}
    });

    if (closeBtn && closeBtn !== deny) {
      closeBtn.addEventListener('click', function () {
        cleanup();
        try { sessionStorage.setItem('ccf_denied_session', '1'); } catch (e) {}
      });
    }
  }

  // Races a fetch against a plain timer so a cold-starting backend can't
  // block the popup/discount config load (and, in turn, initIntentTriggers())
  // for as long as the browser's own fetch would otherwise wait.
  function fetchWithTimeout(url, ms) {
    var timeout = new Promise(function(resolve) {
      setTimeout(resolve, ms || 3000, null);
    });
    return Promise.race([fetch(url), timeout]);
  }

  // popup-customizer: pull the merchant's appearance config from the App Proxy
  // (same origin as the store — Shopify signs & appends `shop` automatically).
  // Any failure leaves popupConfig = {} so showSoftPrompt uses its defaults.
  function fetchPopupConfig() {
    var url = window.location.origin + '/apps/cartncodform/popup-config';
    return fetchWithTimeout(url, 3000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && data.popup && typeof data.popup === 'object') {
          popupConfig = data.popup;
        }
        if (data && data.mobilePopup && typeof data.mobilePopup === 'object') {
          mobilePopupConfig = data.mobilePopup;
        }
      })
      .catch(function () { /* keep defaults */ });
  }

  // discount-feature: pull the shop's discount rules (enabled flags + %) and
  // offer headline from the App Proxy. Failure leaves discountConfig = {} so
  // no email/phone fields render.
  function fetchDiscountConfig() {
    var url = window.location.origin + '/apps/cartncodform/discount-config?shop=' +
      encodeURIComponent(SHOP_DOMAIN);
    return fetchWithTimeout(url, 3000)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (data && typeof data === 'object') discountConfig = data;
      })
      .catch(function () { /* keep defaults */ });
  }

  // discount-feature: a standalone "unlock discount" component injected
  // right under the Buy It Now button on product pages. No notification
  // permission needed — the customer just enters email/phone to claim it.
  // Independent of the popup — its own form, its own discount-generate call.
  function injectProductNudge() {
    if (getPageType() !== 'product') return;
    if (document.getElementById('ccf-product-nudge')) return;
    if (!ccfDiscountEnabled()) return;

    // Don't show if this session already claimed a discount.
    var discAlreadyClaimed = false;
    try {
      discAlreadyClaimed = sessionStorage.getItem('ccf_disc_redirected') === '1';
    } catch(e) {}
    if (discAlreadyClaimed) return;

    // Real percentages only: ccfPct() is 0 for a disabled rule, so a number
    // is never invented (no fallback constants). Nothing to honour = no nudge.
    var emailPct = ccfFieldPct('emailDiscount');
    var pushPct = ccfPct('pushDiscount');
    var showEmail = ccfShowEmailField();

    // Determine best discount to show.
    var bestPct = pushPct;
    var bestAction = 'push';
    if (showEmail) {
      bestPct = emailPct; bestAction = 'email';
    }
    if (!(bestPct > 0)) return;

    // Same stylesheet the main popup uses (hover/focus states, the
    // ccfNudgeSlideUp keyframe below) — the main popup never runs on
    // product pages, so nothing else would inject it here.
    ccfInjectPopupStyles();

    var accent = popupConfig.accentColor || '#4f46e5';

    // Find Buy It Now button.
    var buyBtn = document.querySelector(
      '.shopify-payment-button__button, ' +
      '[data-testid="Checkout-button"], ' +
      '.product-form__submit, button[name="add"]'
    );
    if (!buyBtn) return;

    var nudge = document.createElement('div');
    nudge.id = 'ccf-product-nudge';
    nudge.style.cssText = [
      'margin-top:12px',
      'border-radius:16px',
      'border:1.5px solid ' + accent + '33',
      'background:linear-gradient(135deg,#f8f9ff,#f0f4ff)',
      'box-shadow:0 4px 16px rgba(79,70,229,0.08)',
      'overflow:hidden',
      'animation:ccfNudgeSlideUp 0.4s cubic-bezier(0.34,1.56,0.64,1)'
    ].join(';');

    var formHTML =
      '<div style="padding:16px">' +
      '<div style="display:flex;align-items:center;gap:10px;' +
      'margin-bottom:12px">' +
      '<div style="color:#4f46e5;line-height:1">' + ccfIcon('tag', 24) + '</div>' +
      '<div>' +
      '<div style="font-size:14px;font-weight:700;color:#111827">' +
      'Unlock ' + bestPct + '% off this order</div>' +
      '<div style="font-size:12px;color:#6b7280">' +
      ccfEscapeHtml(
        ccfOfferText(showEmail ? 'emailDiscount' : 'pushDiscount') ||
        (showEmail
          ? 'Enter your details below to claim'
          : 'Subscribe to notifications to claim')
      ) +
      '</div></div></div>';

    if (showEmail) {
      formHTML +=
        '<input type="email" id="ccf-nudge-email" ' +
        'placeholder="Your email address" ' +
        'style="width:100%;padding:10px 14px;font-size:13px;' +
        'border:1.5px solid #e5e7eb;border-radius:10px;' +
        'box-sizing:border-box;margin-bottom:8px;' +
        'background:#fff;font-family:inherit"/>';
    }

    formHTML +=
      '<button id="ccf-nudge-btn" ' +
      'style="width:100%;padding:12px;font-size:14px;' +
      'font-weight:700;color:#fff;' +
      'background:linear-gradient(135deg,' + accent + ',' +
      accent + 'dd);border:none;border-radius:12px;' +
      'cursor:pointer;box-shadow:0 4px 12px ' + accent + '44;' +
      'margin-bottom:8px;letter-spacing:0.3px;' +
      'transition:all 0.2s ease">' +
      ccfIcon('tag', 16, true) + 'Unlock ' + bestPct + '% off</button>' +
      '<div style="text-align:center">' +
      '<button onclick="document.getElementById(' +
      '\'ccf-product-nudge\').style.display=\'none\'" ' +
      'style="font-size:11px;color:#9ca3af;background:none;' +
      'border:none;cursor:pointer">' +
      'No thanks, skip discount</button></div>' +
      '</div>';

    nudge.innerHTML = formHTML;

    var insertTarget = buyBtn.closest('form') || buyBtn.parentNode;
    if (insertTarget && insertTarget.parentNode) {
      insertTarget.parentNode.insertBefore(nudge, insertTarget.nextSibling);
    }

    var nudgeBtn = document.getElementById('ccf-nudge-btn');
    if (!nudgeBtn) return;

    nudgeBtn.addEventListener('click', function() {
      var email = document.getElementById('ccf-nudge-email');
      var emailVal = email ? email.value.trim() : '';

      // When the offer shown is the EMAIL discount, an email is required to
      // claim it — an empty submit would fall through to the push rule, which
      // is a different (or disabled) percentage than the one on the button.
      if (showEmail && !emailVal) {
        if (email) { email.style.borderColor = '#dc2626'; email.focus(); }
        return;
      }

      // Determine action based on what was entered.
      var action = emailVal ? 'email' : 'push';

      ccfSetLabel(nudgeBtn, 'loader', 'Getting your discount...');
      nudgeBtn.disabled = true;

      fetch('/apps/cartncodform/generate-discount?shop=' +
        encodeURIComponent(SHOP_DOMAIN), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action,
          email: emailVal || null,
          sessionId: getSessionId()
        })
      })
      .then(function(r) { return r.json(); })
      .then(function(d) {
        if (d && d.code) {
          nudge.innerHTML =
            '<div style="padding:16px;text-align:center">' +
            // Same fix as renderDiscountCode()'s unlocked view: flex+center
            // instead of relying on the outer text-align, which some
            // storefront themes' svg{display:block} reset would break.
            '<div style="color:#16a34a;line-height:1;margin-bottom:8px;' +
            'display:flex;justify-content:center">' + ccfIcon('gift', 32) + '</div>' +
            '<div style="font-size:16px;font-weight:700;' +
            'color:#111827;margin-bottom:6px">' +
            (d.percentage ? d.percentage + '% off unlocked!' : 'Discount unlocked!') + '</div>' +
            '<div style="background:linear-gradient(135deg,' +
            '#f0f4ff,#e8edff);border:1.5px dashed #818cf8;' +
            'border-radius:12px;padding:12px;margin:10px 0">' +
            '<div style="font-size:10px;color:#6366f1;' +
            'font-weight:700;letter-spacing:2px;margin-bottom:4px">' +
            'YOUR DISCOUNT CODE</div>' +
            '<div style="font-size:22px;font-weight:800;' +
            'letter-spacing:3px;font-family:monospace;color:#4338ca">' +
            d.code + '</div>' +
            '</div>' +
            '<a href="/discount/' + d.code +
            '?redirect=' + encodeURIComponent(window.location.pathname) +
            '" style="display:block;padding:12px;' +
            'background:linear-gradient(135deg,#16a34a,#15803d);' +
            'color:#fff;border-radius:12px;font-weight:700;' +
            'font-size:14px;text-decoration:none;margin-top:8px">' +
            (d.percentage ? 'Shop now with ' + d.percentage + '% off →' : 'Shop now with your discount →') + '</a>' +
            '</div>';
          try {
            sessionStorage.setItem('ccf_disc_redirected', '1');
            sessionStorage.setItem('ccf_active_discount', d.code);
            sessionStorage.setItem('ccf_active_pct', String(d.percentage));
          } catch(e) {}
        } else {
          nudgeBtn.disabled = false;
          ccfSetLabel(nudgeBtn, 'tag', 'Unlock ' + bestPct + '% off');
        }
      })
      .catch(function() {
        nudgeBtn.disabled = false;
        ccfSetLabel(nudgeBtn, 'tag', 'Unlock ' + bestPct + '% off');
      });
    });
  }

  // Wire the four intent triggers. First one to fire wins (session guard).
  var ccfExitIntentBound = false;
  function initIntentTriggers() {
    if (!canPrompt()) return;

    // Do not show the popup on product pages — home/collection/etc only.
    // Computed here (not the `var pageType = getPageType()` further down)
    // so this actually gates the PAGE_LOAD trigger below too, not just the
    // return-visit/dwell triggers that come after it.
    var pageType = getPageType();
    if (pageType === 'product') return;

    // PAGE_LOAD trigger — fires on ANY [remaining, non-product] page after
    // DWELL_MS (1.5s) if the customer has no existing push subscription.
    // When it's in play we don't wire the other (page-restricted) intent
    // triggers.
    var hasToken = false;
    try {
      hasToken = !!localStorage.getItem(PAGE_LOAD_TOKEN_KEY);
    } catch (e) {}

    if (!hasToken && canPrompt()) {
      setTimeout(function () {
        if (canPrompt()) {
          showSoftPrompt('page_load', null);
        }
      }, DWELL_MS);
      return; // Don't set up other triggers if we show on load
    }

    // pageType is already computed above (and is guaranteed not 'product'
    // here, since we returned early if it was) — meta/pid below is now
    // effectively always null; the return-visit and dwell triggers that
    // reference it are unreachable dead code as a direct consequence of
    // this change, kept as-is in case product pages are ever re-enabled.
    var meta = pageType === 'product' ? getProductMeta() : null;
    var pid = meta && meta.productId ? String(meta.productId) : null;

    // Trigger 2 — RETURN VISIT: this productId seen in a previous session.
    if (pageType === 'product' && pid) {
      var viewed = [];
      try { viewed = JSON.parse(localStorage.getItem(VIEWED_KEY) || '[]'); } catch (e) { viewed = []; }
      if (!Array.isArray(viewed)) viewed = [];
      if (viewed.indexOf(pid) !== -1) {
        showSoftPrompt('return_visit', pid);
      } else {
        viewed.push(pid);
        if (viewed.length > 200) viewed = viewed.slice(-200);
        try { localStorage.setItem(VIEWED_KEY, JSON.stringify(viewed)); } catch (e) {}
      }
    }

    // Trigger 1 — DWELL: continuous dwell on a product page (pauses when hidden).
    if (pageType === 'product') {
      var dwellRemaining = DWELL_MS;
      var dwellStartedAt = 0;
      var dwellTimer = null;
      function startDwell() {
        if (dwellTimer || dwellRemaining <= 0) return;
        dwellStartedAt = Date.now();
        dwellTimer = setTimeout(function () {
          dwellTimer = null;
          dwellRemaining = 0;
          showSoftPrompt('dwell', pid);
        }, dwellRemaining);
      }
      function pauseDwell() {
        if (!dwellTimer) return;
        clearTimeout(dwellTimer);
        dwellTimer = null;
        dwellRemaining -= (Date.now() - dwellStartedAt);
        if (dwellRemaining < 0) dwellRemaining = 0;
      }
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') pauseDwell();
        else startDwell();
      });
      if (document.visibilityState === 'visible') startDwell();
    }

    // Trigger 4 — EXIT INTENT: desktop only, mouse toward the browser chrome.
    if (window.innerWidth > 768 && !ccfExitIntentBound) {
      ccfExitIntentBound = true;
      var onExitMove = function (e) {
        if (e.clientY < 20) {
          document.removeEventListener('mousemove', onExitMove);
          showSoftPrompt('exit_intent', null);
        }
      };
      document.addEventListener('mousemove', onExitMove);
    }
    // Trigger 3 — ADD TO CART: fired from the cart-add hooks (see trackCart /
    // the /cart/add.js fetch interceptor), which call showSoftPrompt('add_to_cart').
  }

  function setupForegroundMessages() {
    try {
      var app = firebase.apps && firebase.apps.length > 0
        ? firebase.apps[0]
        : firebase.initializeApp(firebaseConfig);
      var messaging = firebase.messaging(app);
      messaging.onMessage(function(payload) {
        var title = payload.notification && payload.notification.title
          ? payload.notification.title : 'ShopiReachBoost AI';
        var body = payload.notification && payload.notification.body
          ? payload.notification.body : 'New notification';
        if (Notification.permission === 'granted') {
          new Notification(title, { body: body, icon: '/favicon.ico' });
        }
      });
    } catch(err) {
    }
  }

  // ============================================
  // SERVICE WORKER via APP PROXY
  // ============================================

  function registerSW() {
    return new Promise(function(resolve, reject) {
      if (!('serviceWorker' in navigator)) {
        return reject(new Error('SW not supported'));
      }

      var swUrl = window.location.origin + '/apps/cartncodform/sw.js';

      // Unregister any stale SWs (blob URLs, wrong scope) before registering
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        var unregisterPromises = regs.map(function(reg) {
          var swScope = window.location.origin + '/apps/cartncodform/';
          var sw = reg.active || reg.waiting || reg.installing;
          var isCorrect = reg.scope === swScope &&
            !!sw &&
            sw.scriptURL.indexOf('/apps/cartncodform/sw.js') !== -1;
          if (!isCorrect) {
            return reg.unregister();
          }
          return Promise.resolve(false);
        });

        return Promise.all(unregisterPromises);
      }).then(function() {
        // Check if correct SW already active
        return navigator.serviceWorker.getRegistrations();
      }).then(function(regs) {
        for (var i = 0; i < regs.length; i++) {
          var reg = regs[i];
          var existingSw = reg.active || reg.waiting || reg.installing;
          if (
            existingSw &&
            existingSw.scriptURL.indexOf('/apps/cartncodform/sw.js') !== -1 &&
            reg.scope === window.location.origin + '/apps/cartncodform/'
          ) {
            resolve(reg);
            return;
          }
        }

        // Register fresh
        navigator.serviceWorker.register(swUrl, {
          scope: '/apps/cartncodform/',
          updateViaCache: 'none'
        }).then(function(reg) {
          if (reg.active) {
            resolve(reg);
            return;
          }

          var sw = reg.installing || reg.waiting;
          if (!sw) {
            resolve(reg); // FCM can work with the reg as-is
            return;
          }

          // Force skip waiting if stuck
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }

          if (sw.state === 'activated') {
            resolve(reg);
            return;
          }

          // Watch the registration's own installing/waiting worker directly —
          // never navigator.serviceWorker.ready, which only resolves for the
          // CURRENT page's controller and never fires for a page outside this
          // SW's scope (e.g. any normal storefront page, since our scope is
          // the /apps/cartncodform/ proxy path, not the page itself).
          var done = false;
          var timeout = setTimeout(function () {
            if (done) return;
            done = true;
            resolve(reg); // resolve, not reject — FCM often works anyway
          }, 10000);

          sw.addEventListener('statechange', function () {
            if (done) return;
            if (sw.state === 'activated' || sw.state === 'redundant') {
              done = true;
              clearTimeout(timeout);
              resolve(reg);
            }
          });
        }).catch(function(err) {
          console.error('[CCF] SW registration failed:', err.message);
          reject(err);
        });
      }).catch(function(err) {
        console.error('[CCF] SW setup error:', err.message);
        reject(err);
      });
    });
  }

  // ============================================
  // FCM TOKEN GENERATION
  // ============================================

  function getToken(swReg) {
    return new Promise(function(resolve, reject) {
      try {

        var app;
        if (firebase.apps && firebase.apps.length > 0) {
          app = firebase.apps[0];
        } else {
          app = firebase.initializeApp(firebaseConfig);
        }

        var messaging = firebase.messaging(app);

        console.log('[ccf] getToken: calling FCM getToken...');
        messaging.getToken({
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg
        }).then(function(token) {
          if (token) {
            resolve(token);
          } else {
            reject(new Error('No token returned'));
          }
        }).catch(function(err) {
          console.error('[CCF] getToken error:', err.code, err.message);
          console.error('[ccf] getToken failed:', err.message, err.code);
          reject(err);
        });
      } catch(err) {
        console.error('[CCF] getToken setup error:', err.message);
        reject(err);
      }
    });
  }

  function saveToken(token) {
    var oldToken = localStorage.getItem(TOKEN_KEY);
    var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    var deviceType = isMobile ? 'mobile' : 'desktop';

    var customerId = (window.Shopify && window.Shopify.customerId)
      ? String(window.Shopify.customerId)
      : null;

    // Fetch Shopify cart token to link this subscription to the cart.
    // Falls back to no cartToken rather than blocking the subscribe POST
    // if /cart.js is unavailable.
    return fetch('/cart.js')
      .then(function(r) { return r.json(); })
      .catch(function(err) {
        console.warn('[ccf] cart fetch failed, subscribing without cartToken');
        return { token: '' };
      })
      .then(function(cart) {
        // Normalize: strip ?key=... suffix so it matches the webhook token.
        var rawCartToken = cart.token || null;
        var cartToken = rawCartToken ? rawCartToken.split('?')[0].trim() || null : null;

        return fetch(window.location.origin + '/apps/cartncodform/subscribe-customer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopDomain: SHOP_DOMAIN,
            token: token,
            oldToken: oldToken,
            page: window.location.pathname,
            deviceType: deviceType,
            cartToken: cartToken,
            customerId: customerId,
            ccfSessionId: getSessionId()
          })
        });
      })
      .then(function(r) {
        return r.json();
      })
      .then(function(data) {
        if (data.success) {
          localStorage.setItem(TOKEN_KEY, token);
          localStorage.setItem(SUBSCRIBED_KEY, '1');
          // Latch so the PAGE_LOAD trigger never re-prompts this browser.
          try { localStorage.setItem(PAGE_LOAD_TOKEN_KEY, '1'); } catch (e) {}
        } else {
          // Backend rejected the token — clear latch so next visit
          // triggers a fresh getToken() instead of re-saving this one.
          localStorage.removeItem(SUBSCRIBED_KEY);
          console.warn('[CCF] Token save failed — will retry on next visit');
        }

        // Discount is handled by the Allow button click handler
        // which correctly detects email/phone action type.

        // discount-feature: saveToken() also runs when permission was
        // ALREADY 'granted' (checkAndInit's returning-customer path), where
        // showSoftPrompt/finishDiscount never ran on this page load. Show
        // the main popup (email/phone fields) for discount capture there —
        // canPromptForDiscount() guards against showing it twice.
        // getPageType() (not a bare `pageType` var — saveToken() has no such
        // variable in scope; that'd throw a ReferenceError and silently kill
        // this whole discount-capture branch via the outer .catch below).
        var alreadyRedirected = false;
        try { alreadyRedirected = !!sessionStorage.getItem('ccf_disc_redirected'); } catch(e) {}

        if (ccfDiscountEnabled() && canPromptForDiscount() && getPageType() !== 'product' &&
            !alreadyRedirected && !promptAlreadyShown()) {
          setTimeout(function() {
            showSoftPrompt('page_load', null);
          }, 1500);
        }

        console.log('[ccf] subscribe POST success');
        return { success: true };
      })
      .catch(function(err) {
        console.error('[ccf] subscribe POST failed', err);
        throw err;
      });
  }

  // ============================================
  // CHECK TOKEN + INIT
  // ============================================

  function checkAndInit() {
    if (!('Notification' in window)) {
      return;
    }


    if (Notification.permission === 'denied') return;
    if (sessionStorage.getItem('ccf_denied_session')) return;

    if (Notification.permission === 'granted') {
      // Always re-fetch the current FCM token to detect rotation.
      registerSW().then(function(reg) {
        return getToken(reg);
      }).then(function(currentToken) {
        var storedToken = localStorage.getItem(TOKEN_KEY);
        if (currentToken !== storedToken) {
          // Update localStorage IMMEDIATELY so any concurrent
          // saveToken() calls (from trackCart) use the new token,
          // not the stale one. This prevents two rows being created.
          localStorage.setItem(TOKEN_KEY, currentToken);
          localStorage.removeItem(SUBSCRIBED_KEY);
        }
        return saveToken(currentToken);
      }).then(function() {
        setupForegroundMessages();
        // discount-feature: saveToken()'s own success handler (above) is
        // what schedules the discount-capture showSoftPrompt() call for
        // this already-granted path — nothing extra needed here.
      }).catch(function(err) {
        console.error('[CCF] Token verify failed:', err.message);
        // If getToken fails entirely, fall back to saving the stored token.
        var fallback = localStorage.getItem(TOKEN_KEY);
        if (fallback) {
          saveToken(fallback);
        }
      });
      return;
    }

    // Permission is 'default' — nothing to do here. The soft prompt is shown
    // by intent triggers (initIntentTriggers), not on a timer.
  }

  // ============================================
  // CART TRACKING
  // ============================================

  function trackCart() {
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('[name="add"], .product-form__submit, [data-testid="add-to-cart"]');
      if (!btn) return;
      var form = btn.closest('form[action*="/cart"]');
      if (!form) return;


      var token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        fetch(BACKEND_URL + '/api/push/cart-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            shopDomain: SHOP_DOMAIN,
            token: token,
            event: 'add_to_cart',
            url: window.location.href
          })
        }).catch(function(e) {
        });
      }

      // Token/cartToken refresh now happens post-request in the
      // window.fetch monkey-patch (initTracking), after the cart
      // token has actually rotated — see fetchPromise.then() there.

      // Trigger 3 — ADD TO CART soft prompt (session-guarded internally).
      // Do not show on product pages, even when add-to-cart fires there.
      try {
        if (getPageType() !== 'product') {
          showSoftPrompt('add_to_cart', null);
        }
      } catch (e) {}
    });
  }

  // ============================================================
  // EVENT TRACKING
  // ============================================================
  var CCF_SESSION_KEY = 'ccf_analytics_session_' + SHOP_DOMAIN;
  var eventQueue = [];
  var flushTimer = null;

  // Generate a stable analytics session UUID — persists in
  // localStorage across page loads and cart token rotations.
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getSessionId() {
    var existing = localStorage.getItem(CCF_SESSION_KEY);
    if (existing) return existing;
    var newId = generateUUID();
    localStorage.setItem(CCF_SESSION_KEY, newId);
    return newId;
  }

  function setSessionId(id) {
    // No-op — sessionId is now managed by getSessionId() via localStorage.
    // Kept for compatibility with existing calls.
  }

  function getPageType() {
    try {
      return (window.ShopifyAnalytics &&
              window.ShopifyAnalytics.meta &&
              window.ShopifyAnalytics.meta.page &&
              window.ShopifyAnalytics.meta.page.pageType) || null;
    } catch(e) { return null; }
  }

  function getProductMeta() {
    try {
      var p = window.ShopifyAnalytics &&
              window.ShopifyAnalytics.meta &&
              window.ShopifyAnalytics.meta.product;
      if (!p) return null;

      var imageUrl = null;
      try {
        var ogImage = document.querySelector('meta[property="og:image"]');
        if (ogImage) imageUrl = ogImage.getAttribute('content');
      } catch(e) {}

      // The product title is rendered server-side (Liquid) onto
      // #ccf-embed-root's data-product-title attribute (see the .liquid
      // block) — prefer
      // it over window.ShopifyAnalytics (theme-dependent, can lag or be
      // absent), then fall back to a cleaned-up document.title.
      var liquidTitle = null;
      try {
        var embedRoot = document.getElementById('ccf-embed-root');
        liquidTitle = embedRoot ? embedRoot.getAttribute('data-product-title') : null;
      } catch(e) {}

      var cleanedDocTitle = document.title
        .replace(' – ' + SHOP_DOMAIN.split('.')[0], '')
        .trim();

      var productTitle = liquidTitle || p.title || cleanedDocTitle;

      return {
        productId: p.id ? String(p.id) : null,
        productTitle: productTitle,
        productPrice: p.price || null,
        title: p.title || null,
        vendor: p.vendor || null,
        type: p.type || null,
        price: p.price || null,
        variantId: (p.variants && p.variants[0] && p.variants[0].id) || null,
        imageUrl: imageUrl
      };
    } catch(e) { return null; }
  }

  function getCollectionMeta() {
    try {
      var c = window.ShopifyAnalytics &&
              window.ShopifyAnalytics.meta &&
              window.ShopifyAnalytics.meta.collection;
      if (!c) return null;
      return { collectionId: c.id || null, handle: c.handle || null };
    } catch(e) { return null; }
  }

  function trackEvent(type, meta) {
    var token = localStorage.getItem(TOKEN_KEY);
    var customerId = (window.Shopify && window.Shopify.customerId)
      ? String(window.Shopify.customerId) : null;
    var sessionId = getSessionId();

    eventQueue.push({
      type: type,
      path: window.location.pathname,
      pageType: getPageType(),
      meta: meta || null,
      ts: new Date().toISOString()
    });

    // Flush after 2s idle (debounce) or immediately for exit events.
    if (flushTimer) clearTimeout(flushTimer);
    if (type === 'page_exit') {
      flushEvents(token, customerId, sessionId);
    } else {
      flushTimer = setTimeout(function() {
        flushEvents(token, customerId, sessionId);
      }, 2000);
    }
  }

  function flushEvents(token, customerId, sessionId) {
    if (eventQueue.length === 0) return;
    var batch = eventQueue.splice(0);
    var payload = JSON.stringify({
      shopDomain: SHOP_DOMAIN,
      sessionId:  sessionId  || null,
      customerId: customerId || null,
      token:      token      || null,
      events:     batch,
      // Phase 1 attribution — tags this whole batch with the notification
      // job (if any) this session is currently attributed to, per
      // getAttributionJob() above. undefined is dropped by JSON.stringify,
      // so the key is simply absent when there's no active attribution.
      ccf_job:    getAttributionJob() || undefined
    });

    // Use sendBeacon for exit events (survives page unload).
    // Use fetch for normal events.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(BACKEND_URL + '/api/events', payload);
    } else {
      fetch(BACKEND_URL + '/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload
      }).catch(function() {});
    }
  }

  function initTracking() {
    var pageType = getPageType();

    // PUSH CLICK ATTRIBUTION
    // If this page load came from a CartnCodForm automated push, the URL
    // carries ?ccf_job=<jobId>. Record the click server-side and stamp the
    // job id onto the Shopify cart so it re-emerges in orders/create.
    (function handlePushClickAttribution() {
      try {
        var ccfJob = new URLSearchParams(window.location.search).get('ccf_job');
        if (!ccfJob) return;

        var dedupeKey = 'ccf_click_recorded_' + ccfJob;
        try {
          if (sessionStorage.getItem(dedupeKey)) return;
          sessionStorage.setItem(dedupeKey, '1');
        } catch (e) {}

        var token = null;
        try { token = localStorage.getItem(TOKEN_KEY); } catch (e) {}
        var customerId = (window.Shopify && window.Shopify.customerId)
          ? String(window.Shopify.customerId) : null;

        fetch('/cart.js').then(function(r) { return r.json(); })
          .then(function(cart) {
            var rawCartToken = cart && cart.token ? cart.token : null;
            var cartToken = rawCartToken ? (rawCartToken.split('?')[0].trim() || null) : null;

            fetch(BACKEND_URL + '/api/attribution/click', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                shopDomain: SHOP_DOMAIN,
                jobId: ccfJob,
                cartToken: cartToken,
                customerId: customerId,
                subscriptionToken: token || null
              })
            }).catch(function() {});

            // Persist onto the cart so orders/create sees it in note_attributes.
            fetch('/cart/update.js', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ attributes: { _ccf_job: ccfJob } })
            }).catch(function() {});

          }).catch(function() {});
      } catch (e) {}
    })();

    // PAGE VIEW
    trackEvent('page_view', {
      title: document.title,
      referrer: document.referrer || null,
      pageType: pageType
    });

    // PRODUCT VIEW
    if (pageType === 'product') {
      trackEvent('product_view', getProductMeta());
    }

    // COLLECTION VIEW
    if (pageType === 'collection') {
      trackEvent('collection_view', getCollectionMeta());
    }

    // SEARCH
    if (pageType === 'search') {
      var q = new URLSearchParams(window.location.search).get('q');
      trackEvent('search', { query: q || null });
    }

    // CART VIEW
    if (pageType === 'cart') {
      trackEvent('cart_view', null);
    }

    // CHECKOUT BUTTON CLICK
    document.addEventListener('click', function(e) {
      var btn = e.target.closest(
        'button[name="checkout"], a[href="/checkout"], [data-testid="Checkout-button"]'
      );
      if (btn) {
        fetch('/cart.js').then(function(r) { return r.json(); })
          .then(function(cart) {
            trackEvent('reached_checkout', {
              cartValue: cart.total_price ? cart.total_price / 100 : null,
              itemCount: cart.item_count || null
            });
          }).catch(function() {
            trackEvent('reached_checkout', null);
          });
      }
    });

    // Re-sync the subscription's cartToken after an add/change,
    // using sendBeacon so the write survives immediate page unload.
    function resyncCartTokenBeacon(token) {
      fetch('/cart.js').then(function(r) { return r.json(); })
        .then(function(cart) {
          var rawCartToken = cart.token || null;
          var cartToken = rawCartToken ? rawCartToken.split('?')[0].trim() || null : null;
          var isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
          var deviceType = isMobile ? 'mobile' : 'desktop';
          var customerId = (window.Shopify && window.Shopify.customerId)
            ? String(window.Shopify.customerId) : null;

          var payload = JSON.stringify({
            shopDomain: SHOP_DOMAIN,
            token: token,
            oldToken: token,
            page: window.location.pathname,
            deviceType: deviceType,
            cartToken: cartToken,
            customerId: customerId,
            ccfSessionId: getSessionId()
          });

          if (navigator.sendBeacon) {
            var blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon(window.location.origin + '/apps/cartncodform/subscribe-customer', blob);
          } else {
            fetch(window.location.origin + '/apps/cartncodform/subscribe-customer', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload
            }).catch(function() {});
          }
        }).catch(function() {});
    }

    // CART ADD (intercept fetch to /cart/add.js)
    var origFetch = window.fetch;
    window.fetch = function(input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var isCartAdd = url.indexOf('/cart/add') !== -1;
      var isCartChange = url.indexOf('/cart/change') !== -1 || url.indexOf('/cart/update') !== -1;

      if (isCartAdd) {
        try {
          var body = init && init.body;
          var parsed = typeof body === 'string' ? JSON.parse(body) : null;
          var addedPid = parsed && (parsed.id || parsed.items && parsed.items[0] && parsed.items[0].id) || null;

          // Fetch the current cart token so the backend can link it onto
          // the profile (POST /api/events, cartToken-link block) — needed
          // for cart_abandon to fire (signalEngine.js computeCartAbandon()
          // matches ONLY via identifiers.cartTokens). Kept out of the
          // synchronous path below so it never delays showSoftPrompt().
          var addToCartMeta = {
            productId: addedPid,
            quantity: parsed && (parsed.quantity || 1) || 1,
            url: window.location.href
          };
          fetch('/cart.js')
            .then(function(r) { return r.json(); })
            .then(function(cart) {
              addToCartMeta.cartToken = cart.token ? cart.token.split('?')[0].trim() : null;
              trackEvent('add_to_cart', addToCartMeta);
            })
            .catch(function() {
              // Still record the event even if the cart token lookup fails.
              trackEvent('add_to_cart', addToCartMeta);
            });

          // Trigger 3 — ADD TO CART soft prompt (session-guarded internally).
          // Do not show on product pages, even when add-to-cart fires there.
          try {
            if (getPageType() !== 'product') {
              showSoftPrompt('add_to_cart', addedPid ? String(addedPid) : null);
            }
          } catch (e) {}
        } catch(e) {}
      }
      if (isCartChange) {
        try {
          var cbody = init && init.body;
          var cparsed = typeof cbody === 'string' ? JSON.parse(cbody) : null;
          var qty = cparsed && cparsed.quantity;
          trackEvent(qty === 0 ? 'remove_from_cart' : 'cart_update', {
            line: cparsed && cparsed.line || null,
            id: cparsed && cparsed.id || null,
            quantity: qty
          });
        } catch(e) {}
      }

      var fetchPromise = origFetch.apply(this, arguments);

      // After a cart add/change completes, re-sync the subscription's
      // cartToken so it reflects the POST-rotation cart state — this
      // keeps the Customer Journey resolve() lookup working.
      // Uses sendBeacon (via resyncCartTokenBeacon) so the write
      // survives immediate page unload/navigation.
      if (isCartAdd || isCartChange) {
        fetchPromise.then(function() {
          var existingToken = localStorage.getItem(TOKEN_KEY);
          if (existingToken && Notification.permission === 'granted') {
            resyncCartTokenBeacon(existingToken);
          }
        }).catch(function() {});
      }

      return fetchPromise;
    };

    // PAGE EXIT — dwell time + scroll depth
    var pageLoadTime = Date.now();
    var maxScroll = 0;
    window.addEventListener('scroll', function() {
      var scrollPct = Math.round(
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
      );
      if (scrollPct > maxScroll) maxScroll = scrollPct;
    }, { passive: true });

    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'hidden') {
        trackEvent('page_exit', {
          dwellSeconds: Math.round((Date.now() - pageLoadTime) / 1000),
          scrollDepth: maxScroll,
          pageType: pageType
        });
      }
    });
  }

  // ============================================
  // START
  // ============================================

  var ccfStarted = false;
  function start() {
    if (ccfStarted) return;
    ccfStarted = true;
    trackCart();
    checkAndInit();
    initTracking();

    // discount-feature: if a CCF discount was minted earlier this session,
    // badge every product price on this page (collection / home / search / PDP).
    checkActiveDiscount();

    // popup-customizer + discount-feature: load appearance + discount config
    // first, then wire the intent triggers (which is where the dwell timer
    // starts) and the product-page nudge — both read popupConfig/
    // discountConfig, so both wait on this same Promise.all rather than a
    // bare setTimeout racing the config fetch (which can lose on a cold
    // backend and silently never show the nudge).
    Promise.all([fetchPopupConfig(), fetchDiscountConfig()]).then(function () {
      initIntentTriggers();

      // Inject product page discount nudge.
      setTimeout(function() {
        if (('Notification' in window) && Notification.permission === 'granted') return;
        // already subscribed — no nudge needed
        injectProductNudge();
      }, 1000);
    });

    if (('Notification' in window) && Notification.permission === 'granted') {
      setupForegroundMessages();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.addEventListener('load', function() {
    if (!ccfStarted) start();
  });

})();
