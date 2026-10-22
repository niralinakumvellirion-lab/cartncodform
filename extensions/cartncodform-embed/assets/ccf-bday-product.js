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

  // ── CSS injection (once per page) ─────────────────────────────────────────
  var _stylesInjected = false;

  function injectStyles(colors) {
    if (_stylesInjected) return;
    _stylesInjected = true;
    var accent      = colors.accent      || '#4F46E5';
    var btnFg       = colors.btnFg       || '#FFFFFF';
    var bg          = colors.bg;          // null = outlined
    var text        = colors.text        || '#18181B';
    var muted       = colors.muted       || '#71717A';
    var fieldBg     = colors.fieldBg     || '#FFFFFF';
    var fieldBorder = colors.fieldBorder || '#D4D4D8';
    var checkBorder = colors.checkBorder || '#71717A';

    var css = [
      '.ccf-bp-wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      bg
        ? 'background:' + bg + ';border-radius:12px;padding:20px 16px;'
        : 'border:1px solid #D4D4D8;border-radius:12px;padding:20px 16px;background:transparent;',
      'color:' + text + ';margin:16px 0;}',
      '.ccf-bp-heading{font-size:15px;font-weight:700;margin:0 0 4px;}',
      '.ccf-bp-sub{font-size:13px;color:' + muted + ';margin:0 0 12px;line-height:1.5;}',
      '.ccf-bp-email{width:100%;height:44px;font-size:16px;padding:0 12px;',
      'box-sizing:border-box;border:1px solid ' + fieldBorder + ';border-radius:8px;',
      'background:' + fieldBg + ';color:' + text + ';margin-bottom:8px;}',
      '.ccf-bp-row{display:flex;gap:8px;margin-bottom:8px;}',
      '.ccf-bp-select{flex:1;height:44px;font-size:16px;padding:0 8px;',
      'box-sizing:border-box;border:1px solid ' + fieldBorder + ';border-radius:8px;',
      'background:' + fieldBg + ';color:' + text + ';-webkit-appearance:none;}',
      '.ccf-bp-select.ccf-bp-error{border-color:#dc2626 !important;}',
      '.ccf-bp-email.ccf-bp-error{border-color:#dc2626 !important;}',
      '.ccf-bp-consent{display:flex;gap:8px;align-items:flex-start;margin-bottom:12px;}',
      '.ccf-bp-check{width:18px;height:18px;flex-shrink:0;margin-top:1px;',
      'accent-color:' + accent + ';border:1px solid ' + checkBorder + ';}',
      '.ccf-bp-consent-text{font-size:12px;color:' + muted + ';line-height:1.4;}',
      '.ccf-bp-btn{width:100%;height:46px;font-size:15px;font-weight:700;',
      'background:' + accent + ';color:' + btnFg + ';border:none;border-radius:10px;',
      'cursor:pointer;margin-bottom:8px;}',
      '.ccf-bp-skip{display:block;width:100%;font-size:13px;color:' + muted + ';',
      'background:none;border:none;cursor:pointer;text-align:center;padding:4px 0;}',
      '.ccf-bp-msg-ok{font-size:14px;font-weight:600;color:#16a34a;text-align:center;padding:12px 0;}',
      '.ccf-bp-msg-err{font-size:13px;color:#dc2626;margin:4px 0 8px;}',
      '.ccf-bp-design-placeholder{border:2px dashed #D4D4D8;border-radius:12px;',
      'padding:16px;text-align:center;font-size:13px;color:#9ca3af;margin:16px 0;}',
    ].join('');

    var el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
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
        injectStyles(colors);

        var copy = pp.copy || {};
        var wrap = document.createElement('div');
        wrap.className = 'ccf-bp-wrap';

        // Heading
        if (copy.heading) {
          var h = document.createElement('div');
          h.className = 'ccf-bp-heading';
          h.textContent = copy.heading;
          wrap.appendChild(h);
        }

        // Sub
        if (copy.sub) {
          var sub = document.createElement('div');
          sub.className = 'ccf-bp-sub';
          sub.textContent = copy.sub;
          wrap.appendChild(sub);
        }

        // Email input
        var emailInput = document.createElement('input');
        emailInput.type = 'email';
        emailInput.className = 'ccf-bp-email';
        emailInput.placeholder = copy.emailPlaceholder || 'Your email';
        emailInput.setAttribute('autocomplete', 'email');
        wrap.appendChild(emailInput);

        // Month / Day row (day count is month-aware, mirrors ccfRenderBirthdayForm)
        var MAX_DAYS = [0,31,29,31,30,31,30,31,31,30,31,30,31];
        var row = document.createElement('div');
        row.className = 'ccf-bp-row';

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
        row.appendChild(monthSel);

        var daySel = document.createElement('select');
        daySel.className = 'ccf-bp-select';

        function updateDayOptions(m) {
          var prev = daySel.value;
          daySel.innerHTML = '';
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

        row.appendChild(daySel);
        wrap.appendChild(row);

        // Consent row — always visible; server fills the default text but we
        // also fall back client-side in case the field arrives empty.
        var consentRow = document.createElement('div');
        consentRow.className = 'ccf-bp-consent';

        var check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'ccf-bp-check';
        check.id = 'ccf-bp-consent-' + shop.replace(/[^a-z0-9]/g, '-') + '-' + (++_instanceCount);

        var consentLbl = document.createElement('label');
        consentLbl.htmlFor = check.id;
        consentLbl.className = 'ccf-bp-consent-text';
        consentLbl.textContent = copy.consent || 'Email me my birthday offer';

        consentRow.appendChild(check);
        consentRow.appendChild(consentLbl);
        wrap.appendChild(consentRow);

        // Error message area
        var errDiv = document.createElement('div');
        errDiv.className = 'ccf-bp-msg-err';
        errDiv.style.display = 'none';
        wrap.appendChild(errDiv);

        // Save button
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ccf-bp-btn';
        btn.textContent = copy.button || 'Save my birthday';
        wrap.appendChild(btn);

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
          wrap.appendChild(skip);
        }

        btn.addEventListener('click', function () {
          errDiv.style.display = 'none';
          errDiv.textContent = '';

          var emailVal = emailInput.value.trim().toLowerCase();
          var monthVal = parseInt(monthSel.value, 10);
          var dayVal   = parseInt(daySel.value, 10);
          var consentVal = check.checked;

          var hasError = false;

          if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailVal)) {
            emailInput.classList.add('ccf-bp-error');
            errDiv.textContent = copy.emailError || 'Enter a valid email and tick the box.';
            errDiv.style.display = '';
            hasError = true;
          } else {
            emailInput.classList.remove('ccf-bp-error');
          }

          if (!monthVal || !dayVal || isNaN(monthVal) || isNaN(dayVal)) {
            monthSel.classList.add('ccf-bp-error');
            daySel.classList.add('ccf-bp-error');
            if (!hasError) {
              errDiv.textContent = copy.error || 'Please select a month and day.';
              errDiv.style.display = '';
            }
            hasError = true;
          } else {
            monthSel.classList.remove('ccf-bp-error');
            daySel.classList.remove('ccf-bp-error');
          }

          if (!consentVal) {
            if (!hasError) {
              errDiv.textContent = 'Please accept the consent checkbox.';
              errDiv.style.display = '';
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
              self.innerHTML = '';
              var ok = document.createElement('div');
              ok.className = 'ccf-bp-wrap';
              var okMsg = document.createElement('div');
              okMsg.className = 'ccf-bp-msg-ok';
              okMsg.textContent = copy.saved || 'Thanks! Your gift will arrive before your birthday.';
              ok.appendChild(okMsg);
              self.appendChild(ok);
            } else {
              btn.disabled = false;
              errDiv.textContent = (res && res.message) || copy.error || 'Something went wrong. Please try again.';
              errDiv.style.display = '';
            }
          }).catch(function () {
            btn.disabled = false;
            errDiv.textContent = copy.error || 'Something went wrong. Please try again.';
            errDiv.style.display = '';
          });
        });

        self.appendChild(wrap);
      }).catch(function () {});
    };

    return CCFBirthdayBox;
  }());

  if (typeof customElements !== 'undefined' && !customElements.get('ccf-birthday-box')) {
    customElements.define('ccf-birthday-box', CCFBirthdayBox);
  }
}());
