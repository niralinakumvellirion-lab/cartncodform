/* ccf-restock.js — "Back in stock", CartnCodForm.
   Classes prefixed .ccf-bis-*. Shows a "Notify me" box when the chosen variant is sold out.
   Options are cards: WhatsApp (fastest — the seller sends it by hand), email (sent a little later),
   and a small "browser alert" (push, via window.CCFPush from ccf-push.js).
   When WhatsApp and email are both on, a priority bar fills up: WhatsApp adds settings.percent.whatsapp,
   email adds the rest; both = 100%. What the shopper signed up for is remembered per size.
   Settings from the App Proxy (GET /apps/cartncodform/restock/config); requests go to
   POST /apps/cartncodform/restock/subscribe. The admin preview (BackInStockPreview.jsx) mirrors this look. */
(function () {
  'use strict';

  var PROXY = '/apps/cartncodform/restock';
  var SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var BELL = SVG + '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  var CHAT = SVG + '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.5 8.5 0 1 1 21 11.5z"/></svg>';
  var MAIL = SVG + '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
  var CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
  var EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[A-Za-z]{2,24}$/;

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
  function radius(v) {
    var n = Number(v);
    if (!isFinite(n)) n = 8;
    return n >= 24 ? '999px' : Math.max(0, n) + 'px';
  }
  function sizeLabel(title) {
    return title && title !== 'Default Title' ? title : 'it';
  }

  function injectStyles(accent, r) {
    if (document.getElementById('ccf-bis-styles')) return;
    var s = document.createElement('style');
    s.id = 'ccf-bis-styles';
    s.textContent = [
      '.ccf-bis,.ccf-bis *{box-sizing:border-box}',
      '.ccf-bis{margin:16px 0;padding:16px;border:1px solid #E7E5E4;border-radius:16px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.04),0 6px 20px rgba(16,24,40,.05);font-family:inherit;color:#1A1A1A;line-height:1.45}',
      '.ccf-bis[hidden]{display:none}',
      '.ccf-bis button,.ccf-bis input{font-family:inherit;letter-spacing:normal;text-transform:none;margin:0;min-height:0}',
      // head
      '.ccf-bis-head{display:flex;gap:12px;align-items:center}',
      '.ccf-bis-icon{width:42px;height:42px;border-radius:12px;background:' + accent + '12;color:' + accent + ';display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '.ccf-bis-icon svg{animation:ccf-bis-ring 2.4s ease-in-out 1s 2;transform-origin:50% 10%}',
      '@keyframes ccf-bis-ring{0%,30%,100%{transform:rotate(0)}5%{transform:rotate(14deg)}10%{transform:rotate(-12deg)}15%{transform:rotate(8deg)}20%{transform:rotate(-6deg)}}',
      '.ccf-bis-copy{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.ccf-bis-title{font-size:15.5px;font-weight:650;line-height:1.3}',
      '.ccf-bis-text{font-size:13px;color:#6B6B6B}',
      // priority bar
      '.ccf-bis-meter{margin-top:14px}',
      '.ccf-bis-meterrow{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;font-weight:600;color:#3F3F46}',
      '.ccf-bis-pct{font-size:14px;font-weight:750;color:#15803D;font-variant-numeric:tabular-nums}',
      '.ccf-bis-bar{position:relative;height:8px;margin-top:6px;border-radius:999px;background:#F1F1EF;overflow:hidden}',
      '.ccf-bis-fill{display:block;height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#4ADE80,#16A34A);transition:width .7s cubic-bezier(.2,.8,.2,1)}',
      '.ccf-bis.is-full .ccf-bis-fill{background:linear-gradient(90deg,#22C55E,#15803D);box-shadow:0 0 10px rgba(34,197,94,.45)}',
      // option cards
      '.ccf-bis-body{margin-top:12px;display:flex;flex-direction:column;gap:10px}',
      '.ccf-bis-card{border:1px solid #EAEAEA;border-radius:12px;background:#FCFCFB;padding:12px;display:flex;flex-direction:column;gap:8px;transition:border-color .15s,box-shadow .15s}',
      '.ccf-bis-card:focus-within{border-color:#D4D4D8;box-shadow:0 4px 14px rgba(16,24,40,.06);background:#fff}',
      '.ccf-bis-cardhead{display:flex;align-items:center;gap:8px}',
      '.ccf-bis-chan{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '.ccf-bis-chan svg{width:16px;height:16px}',
      '.ccf-bis-wa .ccf-bis-chan{background:#E7F8EE;color:#15803D}',
      '.ccf-bis-em .ccf-bis-chan{background:' + accent + '12;color:' + accent + '}',
      '.ccf-bis-cardtitle{font-size:13.5px;font-weight:600}',
      '.ccf-bis-badge{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:#DCFCE7;color:#166534}',
      '.ccf-bis-chip{margin-left:auto;font-size:12px;font-weight:700;padding:2px 9px;border-radius:999px;border:1px solid #BBF7D0;background:#F0FDF4;color:#15803D;font-variant-numeric:tabular-nums}',
      '.ccf-bis-em .ccf-bis-chip{border-color:#E2E8F0;background:#F8FAFC;color:#475569}',
      '.ccf-bis-form{display:flex;gap:8px}',
      '.ccf-bis-input{flex:1;min-width:0;height:42px;padding:0 12px;border:1px solid #D4D4D8;border-radius:' + r + ';background:#fff;font-size:14px;color:#1A1A1A}',
      '.ccf-bis-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0;padding:0 16px;height:42px;border:1px solid ' + accent + ';border-radius:' + r + ';background:' + accent + ';color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .15s,transform .15s}',
      '.ccf-bis-btn:hover{opacity:.92}',
      '.ccf-bis-btn:active{transform:translateY(1px)}',
      '.ccf-bis-wa .ccf-bis-btn{background:#1FA855;border-color:#1FA855}',
      '.ccf-bis-btn:focus-visible,.ccf-bis-input:focus-visible,.ccf-bis-pushlink:focus-visible{outline:2px solid ' + accent + ';outline-offset:2px}',
      '.ccf-bis-btn[disabled]{opacity:.6;cursor:default}',
      '.ccf-bis-hint{margin:0;font-size:12px;color:#71717A}',
      '.ccf-bis-push{width:100%}',
      '.ccf-bis-pushlink{align-self:center;display:inline-flex;align-items:center;gap:6px;background:none;border:none;padding:4px 6px;color:' + accent + ';font-size:13px;font-weight:600;cursor:pointer}',
      '.ccf-bis-pushlink svg{width:15px;height:15px}',
      '.ccf-bis-err{margin:0;font-size:12.5px;color:#B42318}',
      // done / partial
      '.ccf-bis-done{display:flex;gap:10px;align-items:center;margin-top:12px;padding:11px 12px;border-radius:12px;background:#ECFDF5;border:1px solid #BBF7D0;color:#065F46;font-size:13.5px;font-weight:500}',
      '.ccf-bis-done svg{flex-shrink:0}',
      '.ccf-bis-partial{margin-top:12px}',
      '@media (prefers-reduced-motion:reduce){.ccf-bis-icon svg{animation:none}.ccf-bis-fill{transition:none}}',
      '@media (max-width:420px){.ccf-bis{padding:14px}.ccf-bis-form{flex-direction:column}.ccf-bis-btn{width:100%}}',
    ].join('');
    document.head.appendChild(s);
  }

  function init(root) {
    var shop = root.getAttribute('data-shop') || (window.Shopify && window.Shopify.shop) || '';
    var design = root.getAttribute('data-design-mode') === 'true';
    var variants = [];
    try {
      var vNode = root.querySelector('.ccf-bis-variants');
      variants = JSON.parse((vNode && vNode.textContent) || '[]') || [];
    } catch (e) { variants = []; }
    if (!variants.length) return;
    var SUBS_KEY = 'ccf_bis_' + shop;

    function getConfig(retry) {
      return fetch(PROXY + '/config?shop=' + encodeURIComponent(shop), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (d) { return d && d.ok ? d.settings : null; })
        .catch(function () {
          if (!retry) return null;
          return new Promise(function (res) { setTimeout(res, 1500); }).then(function () { return getConfig(false); });
        });
    }

    getConfig(true).then(function (settings) {
      if (!settings || !settings.enabled) return;
      var t = settings.texts || {};
      var ch = settings.channels || {};
      var accent = /^#[0-9a-fA-F]{6}$/.test(settings.accentColor || '') ? settings.accentColor : '#111827';
      var waPct = settings.percent && isFinite(settings.percent.whatsapp) ? Math.max(0, Math.min(100, settings.percent.whatsapp)) : 80;
      var PCT = { whatsapp: waPct, email: 100 - waPct };
      injectStyles(accent, radius(settings.buttonRadius));
      placeAfterBuyButtons(root, design);

      var box = el('div', 'ccf-bis');
      box.setAttribute('role', 'region');
      box.setAttribute('aria-label', 'Back in stock alert');
      box.hidden = true;
      root.appendChild(box);

      var shown = null;
      var busy = false;
      var lastPct = {}; // variant id → % last drawn (the bar animates from there)

      function currentVariant() {
        var id = '';
        var form = buyForm();
        var input = form && form.querySelector('[name="id"]');
        if (input && input.value) id = String(input.value);
        if (!id) {
          try { id = new URLSearchParams(window.location.search).get('variant') || ''; } catch (e) {}
        }
        if (!id) id = root.getAttribute('data-selected') || '';
        for (var i = 0; i < variants.length; i++) if (String(variants[i].id) === id) return variants[i];
        return null;
      }

      // What this browser signed up for, per size: { whatsapp: 1, email: 1, push: 1 }.
      // (An older list of ids meant "signed up" without the channel: kept as { done: 1 }.)
      function readSubs() {
        var m = readJSON(SUBS_KEY);
        if (Array.isArray(m)) {
          var o = {};
          m.forEach(function (id) { o[String(id)] = { done: 1 }; });
          return o;
        }
        return m && typeof m === 'object' ? m : {};
      }
      function gotFor(id) { return readSubs()[String(id)] || {}; }
      function markGot(id, channel) {
        var m = readSubs();
        var cur = m[String(id)] || {};
        cur[channel] = 1;
        delete m[String(id)];
        m[String(id)] = cur;
        var keys = Object.keys(m);
        while (keys.length > 50) delete m[keys.shift()];
        writeJSON(SUBS_KEY, m);
      }

      function pushPossible() {
        return !!(ch.push && window.CCFPush && typeof window.CCFPush.subscribe === 'function' &&
          window.CCFPush.canPush && window.CCFPush.canPush());
      }
      var meterOn = !!(ch.whatsapp && ch.email);

      function percentOf(got) {
        return (got.whatsapp ? PCT.whatsapp : 0) + (got.email ? PCT.email : 0);
      }
      function isComplete(got) {
        if (got.done) return true;
        if (meterOn) return !!(got.whatsapp && got.email);
        return !!(got.whatsapp || got.email || got.push);
      }

      function sessionId() {
        try { return localStorage.getItem('ccf_analytics_session_' + shop) || ''; } catch (e) { return ''; }
      }

      function send(variant, body) {
        var img = root.getAttribute('data-product-image') || '';
        if (img.indexOf('//') === 0) img = 'https:' + img;
        var payload = {
          productId: root.getAttribute('data-product-id'),
          variantId: String(variant.id),
          productTitle: root.getAttribute('data-product-title') || '',
          variantTitle: variant.title || '',
          productHandle: root.getAttribute('data-product-handle') || '',
          imageUrl: img,
          sessionId: sessionId(),
        };
        for (var k in body) if (Object.prototype.hasOwnProperty.call(body, k)) payload[k] = body[k];
        return fetch(PROXY + '/subscribe?shop=' + encodeURIComponent(shop), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (d) {
            if (!r.ok || !d || !d.ok) throw new Error((d && d.error) || 'Could not save. Try again.');
            return d;
          });
        });
      }

      function doneLine(cls, text) {
        var d = el('div', 'ccf-bis-done' + (cls ? ' ' + cls : ''));
        d.setAttribute('role', 'status');
        d.innerHTML = CHECK;
        d.appendChild(el('span', null, text));
        return d;
      }

      function meter(variantId, pct) {
        var m = el('div', 'ccf-bis-meter');
        m.setAttribute('role', 'progressbar');
        m.setAttribute('aria-valuemin', '0');
        m.setAttribute('aria-valuemax', '100');
        m.setAttribute('aria-valuenow', String(pct));
        m.setAttribute('aria-label', t.meterLabel || 'Alert priority');
        var row = el('div', 'ccf-bis-meterrow');
        row.appendChild(el('span', null, t.meterLabel || 'Alert priority'));
        row.appendChild(el('span', 'ccf-bis-pct', pct + '%'));
        var bar = el('div', 'ccf-bis-bar');
        var fill = el('span', 'ccf-bis-fill');
        var from = lastPct[variantId] != null ? lastPct[variantId] : 0;
        fill.style.width = from + '%';
        bar.appendChild(fill);
        m.appendChild(row);
        m.appendChild(bar);
        lastPct[variantId] = pct;
        if (from !== pct) setTimeout(function () { fill.style.width = pct + '%'; }, 40);
        else fill.style.width = pct + '%';
        return m;
      }

      function draw(variant) {
        var id = String(variant.id);
        var got = gotFor(id);
        var pct = percentOf(got);
        var complete = isComplete(got);
        var size = sizeLabel(variant.title);
        box.innerHTML = '';
        box.classList.toggle('is-full', meterOn && complete);

        var head = el('div', 'ccf-bis-head');
        var icon = el('span', 'ccf-bis-icon');
        icon.innerHTML = BELL;
        var copy = el('span', 'ccf-bis-copy');
        copy.appendChild(el('span', 'ccf-bis-title', t.boxTitle || 'Sold out in this size'));
        copy.appendChild(el('span', 'ccf-bis-text', t.boxText || 'Get a message the moment it’s back.'));
        head.appendChild(icon);
        head.appendChild(copy);
        box.appendChild(head);
        if (meterOn) box.appendChild(meter(id, complete && got.done ? 100 : pct));

        if (complete) {
          box.appendChild(doneLine('', (t.successText || 'Done! We’ll tell you when {size} is back.').replace(/\{size\}/g, size)));
          return;
        }
        if (meterOn && pct > 0) {
          var next = got.whatsapp ? 'email' : 'WhatsApp';
          box.appendChild(doneLine('ccf-bis-partial', (t.partialText || 'Done! Add {next} too to reach 100%.')
            .replace(/\{next\}/g, next).replace(/\{percent\}/g, String(pct)).replace(/\{size\}/g, size)));
        }

        var body = el('div', 'ccf-bis-body');
        var err = el('p', 'ccf-bis-err');
        err.setAttribute('role', 'alert');
        err.hidden = true;
        var label = t.buttonText || 'Notify me';
        var showWa = ch.whatsapp && !got.whatsapp;
        var showEmail = ch.email && !got.email;
        var showPush = pushPossible() && !got.push;

        function fail(msg, btn) {
          busy = false;
          if (btn) btn.disabled = false;
          err.textContent = msg;
          err.hidden = false;
        }
        function saved(channel) {
          busy = false;
          markGot(id, channel);
          draw(variant);
        }

        function card(kind, title, iconSvg, badge, chipPct, input, hint, onSubmit) {
          var c = el('div', 'ccf-bis-card ccf-bis-' + kind);
          var h = el('div', 'ccf-bis-cardhead');
          var chan = el('span', 'ccf-bis-chan');
          chan.innerHTML = iconSvg;
          h.appendChild(chan);
          h.appendChild(el('span', 'ccf-bis-cardtitle', title));
          if (badge) h.appendChild(el('span', 'ccf-bis-badge', badge));
          if (meterOn) h.appendChild(el('span', 'ccf-bis-chip', '+' + chipPct + '%'));
          c.appendChild(h);
          var form = el('form', 'ccf-bis-form');
          form.setAttribute('novalidate', '');
          var btn = el('button', 'ccf-bis-btn', label);
          btn.type = 'submit';
          form.appendChild(input);
          form.appendChild(btn);
          form.addEventListener('submit', function (ev) {
            ev.preventDefault();
            if (busy) return;
            onSubmit(btn);
          });
          c.appendChild(form);
          if (hint) c.appendChild(el('p', 'ccf-bis-hint', hint));
          return c;
        }

        // WhatsApp — fastest: the store messages the shopper as soon as the size is back.
        if (showWa) {
          var phone = el('input', 'ccf-bis-input ccf-bis-phone');
          phone.type = 'tel';
          phone.autocomplete = 'tel';
          phone.inputMode = 'tel';
          phone.placeholder = t.whatsappPlaceholder || 'WhatsApp number';
          phone.setAttribute('aria-label', t.whatsappPlaceholder || 'WhatsApp number');
          body.appendChild(card('wa', 'WhatsApp', CHAT, 'Fastest', PCT.whatsapp, phone,
            t.whatsappHint || 'Fastest · we message you the moment it’s back',
            function (btn) {
              var num = String(phone.value || '').replace(/[\s()-]/g, '');
              if (!/^\+?\d{10,15}$/.test(num)) { fail('Enter a valid WhatsApp number', null); phone.focus(); return; }
              busy = true;
              btn.disabled = true;
              err.hidden = true;
              send(variant, { channel: 'whatsapp', phone: num })
                .then(function () { saved('whatsapp'); })
                .catch(function (e) { fail((e && e.message) || 'Could not save. Try again.', btn); });
            }));
        }

        // Email — sent a little later, after WhatsApp and push.
        if (showEmail) {
          var input = el('input', 'ccf-bis-input ccf-bis-email');
          input.type = 'email';
          input.autocomplete = 'email';
          input.placeholder = t.emailPlaceholder || 'Your email';
          input.setAttribute('aria-label', t.emailPlaceholder || 'Your email');
          try { var known = readJSON('ccf_known_email'); if (known && known.email) input.value = known.email; } catch (e) {}
          body.appendChild(card('em', 'Email', MAIL, '', PCT.email, input,
            ch.whatsapp ? (t.emailHint || '') : '',
            function (btn) {
              var email = String(input.value || '').trim();
              if (!EMAIL_RE.test(email)) { fail('Enter a valid email', null); input.focus(); return; }
              busy = true;
              btn.disabled = true;
              err.hidden = true;
              send(variant, { channel: 'email', email: email })
                .then(function () {
                  writeJSON('ccf_known_email', { email: email, ts: Date.now() });
                  saved('email');
                })
                .catch(function (e) { fail((e && e.message) || 'Could not save. Try again.', btn); });
            }));
        }

        // Push — one tap. A small extra next to the cards; the only option when nothing else is on.
        if (showPush) {
          var alone = !showWa && !showEmail;
          var pushBtn = el('button', alone ? 'ccf-bis-btn ccf-bis-push' : 'ccf-bis-pushlink ccf-bis-push');
          pushBtn.type = 'button';
          pushBtn.innerHTML = BELL;
          pushBtn.appendChild(document.createTextNode(' ' + (alone ? label : 'Also get a browser alert')));
          pushBtn.addEventListener('click', function () {
            if (busy) return;
            busy = true;
            pushBtn.disabled = true;
            err.hidden = true;
            window.CCFPush.subscribe()
              .then(function (token) { return send(variant, { channel: 'push', pushToken: token }); })
              .then(function () { saved('push'); })
              .catch(function (e) {
                var denied = e && /denied|unsupported/.test(e.message || '');
                fail(denied
                  ? (ch.whatsapp ? 'Notifications are blocked. Use WhatsApp or email instead.' : ch.email ? 'Notifications are blocked. Use your email instead.' : 'Notifications are blocked in this browser.')
                  : (e && e.message) || 'Could not save. Try again.', pushBtn);
              });
          });
          body.appendChild(pushBtn);
        }
        if (!body.children.length) return;
        body.appendChild(err);
        box.appendChild(body);
      }

      function refresh() {
        if (busy) return;
        var v = currentVariant();
        // Theme editor: always show the box so the merchant can see and place it.
        if (design && v && v.available) v = { id: v.id, title: v.title, available: false };
        var key = v && !v.available ? String(v.id) + ':' + Object.keys(gotFor(v.id)).sort().join(',') : null;
        if (key === shown) return;
        shown = key;
        if (!key) { box.hidden = true; return; }
        draw(v);
        box.hidden = false;
      }

      refresh();
      document.addEventListener('change', function () { setTimeout(refresh, 0); }, true);
      document.addEventListener('click', function () { setTimeout(refresh, 50); }, true);
      setInterval(refresh, 600); // themes change the variant in many ways; a light check catches all
    });
  }

  // The theme's real buy form: has a submit button and isn't Dawn's hidden "installment" form.
  function buyForm() {
    var forms = document.querySelectorAll('form[action*="/cart/add"]');
    for (var i = 0; i < forms.length; i++) {
      var f = forms[i];
      if (/installment/i.test(f.id || '')) continue;
      if (f.querySelector('[name="add"], button[type="submit"], input[type="submit"]')) return f;
    }
    return forms[0] || null;
  }

  // Sit right under the theme's Add to cart / Buy buttons (not in the theme editor, so the
  // merchant can move the block freely there).
  function placeAfterBuyButtons(root, design) {
    if (design) return;
    var form = buyForm();
    if (!form || form.contains(root)) return;
    var anchor = form.closest('product-form') || form;
    if (anchor.parentNode && anchor.nextSibling !== root) anchor.parentNode.insertBefore(root, anchor.nextSibling);
  }

  function start() {
    var root = document.getElementById('ccf-bis-root');
    if (!root || root.getAttribute('data-ccf-ready')) return;
    root.setAttribute('data-ccf-ready', '1');
    init(root);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
