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

  // ── Session ID (same key as ccf-push.js getSessionId) ────────────────────
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

  // ── localStorage gates ─────────────────────────────────────────────────────
  function getBdayKey(shopDomain)    { return 'ccf_bday_' + shopDomain; }
  function getSkipKey(shopDomain)    { return 'ccf_bday_pp_skip_' + shopDomain; }

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

  // ── SVG helpers (no innerHTML, no external files) ─────────────────────────
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
    var s = svgEl('svg', { width: 28, height: 28, viewBox: '0 0 24 24', fill: 'none',
      stroke: strokeColor, 'stroke-width': '1.8', 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.appendChild(svgEl('rect',  { x: '3', y: '10', width: '18', height: '11', rx: '1' }));
    s.appendChild(svgEl('rect',  { x: '2', y: '7',  width: '20', height: '3',  rx: '1' }));
    s.appendChild(svgEl('line',  { x1: '12', y1: '7', x2: '12', y2: '21' }));
    s.appendChild(svgEl('path',  { d: 'M12 7C12 7 11 4 9 3C7 2 6 3 7 5C8 7 12 7 12 7Z' }));
    s.appendChild(svgEl('path',  { d: 'M12 7C12 7 13 4 15 3C17 2 18 3 17 5C16 7 12 7 12 7Z' }));
    return s;
  }

  function makeCheckSvg(strokeColor) {
    var s = svgEl('svg', { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none',
      stroke: strokeColor, 'stroke-width': '2.5', 'stroke-linecap': 'round',
      'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    s.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '10' }));
    s.appendChild(svgEl('path',   { d: 'M7 12.5l3.5 3.5 6-7' }));
    return s;
  }

  // ── CSS injection (once per page) ─────────────────────────────────────────
  var _stylesInjected = false;

  function injectStyles(colors) {
    if (_stylesInjected) return;
    _stylesInjected = true;

    var accent     = colors.accent      || '#4F46E5';
    var stubFg     = colors.stubFg      || '#FFFFFF';
    var sealText   = colors.sealText    || accent;
    var bodyBg     = colors.bodyBg      || '#FFFFFF';
    var text       = colors.text        || '#18181B';
    var muted      = colors.muted       || '#71717A';
    var fieldBg    = colors.fieldBg     || '#FFFFFF';
    var fldBorder  = colors.fieldBorder || '#D4D4D8';
    var chkBorder  = colors.checkBorder || '#71717A';
    var btnFg      = colors.btnFg       || '#FFFFFF';
    var err        = colors.err         || '#DC2626';
    var errBg      = colors.errBg       || '#FEE2E2';
    var ok         = colors.ok          || '#16A34A';

    var notchStub   = 'radial-gradient(circle 11px at 0 100%,#0000 97%,#000),' +
                      'radial-gradient(circle 11px at 100% 100%,#0000 97%,#000)';
    var notchBody   = 'radial-gradient(circle 11px at 0 0,#0000 97%,#000),' +
                      'radial-gradient(circle 11px at 100% 0,#0000 97%,#000)';
    var dashedColor = (stubFg === '#FFFFFF') ? 'rgba(255,255,255,0.45)' : 'rgba(23,26,34,0.45)';

    var css = [
      // Card wrapper — drop-shadow applied here; stub/body carry their own radius + mask
      '.ccf-bp-card{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      'margin:16px 0;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.12));}',
      // Stub — top radius 16px, notch mask cuts bottom corners
      '.ccf-bp-stub{background:' + accent + ';padding:16px 14px;',
      'display:flex;align-items:center;justify-content:space-between;gap:12px;',
      'border-radius:16px 16px 0 0;position:relative;',
      'mask:' + notchStub + ';mask-composite:intersect;',
      '-webkit-mask:' + notchStub + ';-webkit-mask-composite:source-in;}',
      '.ccf-bp-stub-text{flex:1;min-width:0;}',
      '.ccf-bp-stub-heading{font-size:15px;font-weight:700;color:' + stubFg + ';',
      'margin:0 0 4px;line-height:1.3;}',
      '.ccf-bp-stub-sub{font-size:12px;color:' + stubFg + ';opacity:0.85;',
      'margin:0;line-height:1.45;}',
      // Seal (circular, rotated, white background)
      '.ccf-bp-seal{width:74px;height:74px;flex-shrink:0;border-radius:50%;',
      'background:#FFFFFF;display:flex;flex-direction:column;align-items:center;',
      'justify-content:center;transform:rotate(-8deg);position:relative;',
      'box-shadow:0 2px 8px rgba(0,0,0,0.15);}',
      '.ccf-bp-seal-ring{position:absolute;inset:5px;border-radius:50%;',
      'border:1.5px dashed ' + sealText + ';opacity:0.3;pointer-events:none;}',
      '.ccf-bp-seal-pct{font-size:13px;font-weight:800;color:' + sealText + ';',
      'margin-top:2px;letter-spacing:-0.5px;line-height:1;}',
      // Dashed separator — aria-hidden span at stub bottom
      '.ccf-bp-dashed{position:absolute;left:22px;right:22px;bottom:0;display:block;',
      'border-bottom:2px dashed ' + dashedColor + ';pointer-events:none;}',
      // Body — bottom radius 16px, notch mask cuts top corners
      '.ccf-bp-body{background:' + bodyBg + ';padding:14px 14px 12px;',
      'border-radius:0 0 16px 16px;',
      'mask:' + notchBody + ';mask-composite:intersect;',
      '-webkit-mask:' + notchBody + ';-webkit-mask-composite:source-in;}',
      // @supports fallback: plain rounded card when mask is unavailable
      '@supports not (mask:none){',
      '.ccf-bp-card{overflow:hidden;border-radius:16px;}',
      '.ccf-bp-stub{mask:none;-webkit-mask:none;border-radius:16px 16px 0 0;}',
      '.ccf-bp-body{mask:none;-webkit-mask:none;border-radius:0 0 16px 16px;}}',
      // Email input
      '.ccf-bp-email{width:100%;height:44px;font-size:16px;padding:0 12px;',
      'box-sizing:border-box;border:1px solid ' + fldBorder + ';border-radius:8px;',
      'background:' + fieldBg + ';color:' + text + ';margin-bottom:8px;display:block;}',
      // Month/day row
      '.ccf-bp-date-row{display:flex;gap:8px;margin-bottom:8px;}',
      '.ccf-bp-select{flex:1;height:44px;font-size:16px;padding:0 8px;',
      'box-sizing:border-box;border:1px solid ' + fldBorder + ';border-radius:8px;',
      'background:' + fieldBg + ';color:' + text + ';-webkit-appearance:none;}',
      // Error state on inputs
      '.ccf-bp-select.ccf-bp-error{border-color:' + err + ' !important;}',
      '.ccf-bp-email.ccf-bp-error{border-color:' + err + ' !important;}',
      // Consent row
      '.ccf-bp-consent{display:flex;gap:8px;align-items:flex-start;',
      'margin-bottom:10px;margin-top:2px;}',
      '.ccf-bp-check{width:18px;height:18px;flex-shrink:0;margin-top:1px;',
      'accent-color:' + accent + ';border:1px solid ' + chkBorder + ';}',
      '.ccf-bp-consent-text{font-size:12px;color:' + muted + ';line-height:1.4;}',
      // Error box (wraps the error message text)
      '.ccf-bp-err-box{background:' + errBg + ';border-radius:6px;',
      'padding:6px 10px;margin-bottom:8px;}',
      '.ccf-bp-msg-err{font-size:12px;color:' + err + ';margin:0;}',
      // Save button
      '.ccf-bp-btn{width:100%;height:46px;font-size:15px;font-weight:700;',
      'background:' + accent + ';color:' + btnFg + ';border:none;border-radius:10px;',
      'cursor:pointer;margin-bottom:8px;}',
      // Skip link
      '.ccf-bp-skip{display:block;width:100%;font-size:13px;color:' + muted + ';',
      'background:none;border:none;cursor:pointer;text-align:center;padding:4px 0;}',
      // Success message
      '.ccf-bp-msg-ok{font-size:14px;font-weight:600;color:' + ok + ';',
      'text-align:center;padding:12px 0;display:flex;align-items:center;',
      'justify-content:center;gap:8px;}',
      // Design-mode placeholder
      '.ccf-bp-design-placeholder{border:2px dashed #D4D4D8;border-radius:12px;',
      'padding:16px;text-align:center;font-size:13px;color:#9ca3af;margin:16px 0;}',
    ].join('');

    var styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // ── Months helper ──────────────────────────────────────────────────────────
  var MONTHS = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];

  // ── Unique id counter (prevents duplicate ids when 2 boxes on one page) ────
  var _instanceCount = 0;

  // ── Custom element ─────────────────────────────────────────────────────────
  var CCFBirthdayBox = (function () {
    // Reflect.construct is required for ES5 functions extending built-in
    // HTMLElement; HTMLElement.call(this) does not set up internal slots
    // in WebKit and will throw "Illegal constructor".
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

      if (isDesignMode) {
        var ph = document.createElement('div');
        ph.className = 'ccf-bp-design-placeholder';
        ph.textContent = 'Birthday box — configure in the CartnCodForm admin';
        this.appendChild(ph);
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
        injectStyles(colors);

        var copy = pp.copy || {};
        var uid  = 'ccf-bp-consent-' + shop.replace(/[^a-z0-9]/g, '-') + '-' + (++_instanceCount);

        // ── Gift-card wrapper ─────────────────────────────────────────────────
        var card = document.createElement('div');
        card.className = 'ccf-bp-card';

        // ── Stub section ──────────────────────────────────────────────────────
        var stub = document.createElement('div');
        stub.className = 'ccf-bp-stub';

        var stubText = document.createElement('div');
        stubText.className = 'ccf-bp-stub-text';

        if (copy.heading) {
          var h = document.createElement('div');
          h.className = 'ccf-bp-stub-heading';
          h.textContent = copy.heading;
          stubText.appendChild(h);
        }
        if (copy.sub) {
          var sub = document.createElement('div');
          sub.className = 'ccf-bp-stub-sub';
          sub.textContent = copy.sub;
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
        sealPct.textContent = '−' + pct + '%';  // − (minus sign U+2212)
        seal.appendChild(sealPct);

        stub.appendChild(seal);

        // Dashed separator — aria-hidden span at stub bottom
        var dashedLine = document.createElement('span');
        dashedLine.setAttribute('aria-hidden', 'true');
        dashedLine.className = 'ccf-bp-dashed';
        stub.appendChild(dashedLine);

        card.appendChild(stub);

        // ── Body section ──────────────────────────────────────────────────────
        var body = document.createElement('div');
        body.className = 'ccf-bp-body';

        // Email
        var emailInput = document.createElement('input');
        emailInput.type = 'email';
        emailInput.className = 'ccf-bp-email';
        emailInput.placeholder = copy.emailPlaceholder || 'Your email';
        emailInput.setAttribute('autocomplete', 'email');
        body.appendChild(emailInput);

        // Month / Day row (day count is month-aware)
        var MAX_DAYS = [0,31,29,31,30,31,30,31,31,30,31,30,31];
        var dateRow = document.createElement('div');
        dateRow.className = 'ccf-bp-date-row';

        var monthSel = document.createElement('select');
        monthSel.className = 'ccf-bp-select';
        var mOpt = document.createElement('option');
        mOpt.value = '';
        mOpt.textContent = 'Month';
        monthSel.appendChild(mOpt);
        for (var mi = 0; mi < 12; mi++) {
          var mo = document.createElement('option');
          mo.value = String(mi + 1);
          mo.textContent = MONTHS[mi];
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

        // Consent row — always visible
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

        // Error box (wraps error message; hidden by default)
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
        btn.textContent = copy.button || 'Save my birthday';
        body.appendChild(btn);

        // Skip link
        if (copy.skip) {
          var skip = document.createElement('button');
          skip.type = 'button';
          skip.className = 'ccf-bp-skip';
          skip.textContent = copy.skip;
          skip.addEventListener('click', function () {
            markSkipped(shop);
            self.innerHTML = '';
          });
          body.appendChild(skip);
        }

        card.appendChild(body);
        self.appendChild(card);

        // ── Validation + submit ───────────────────────────────────────────────
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
              month: monthVal,
              day: dayVal,
              email: emailVal,
              consent: true,
              sessionId: sessionId,
              source: 'product_page',
            }),
          }).then(function (r) { return r.json(); }).then(function (res) {
            if (res && res.ok) {
              markSaved(shop);
              // Keep card and stub intact; replace body content with success message
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
