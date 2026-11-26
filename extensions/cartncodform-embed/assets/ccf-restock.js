/* ccf-restock.js — "Back in stock", CartnCodForm.
   Classes prefixed .ccf-bis-*. Shows a "Notify me" box when the chosen variant is sold out.
   Push uses window.CCFPush (from the push app embed, ccf-push.js); email works without it.
   Settings from the App Proxy (GET /apps/cartncodform/restock/config); requests go to
   POST /apps/cartncodform/restock/subscribe. The admin preview (BackInStockPreview.jsx) mirrors this look. */
(function () {
  'use strict';

  var PROXY = '/apps/cartncodform/restock';
  var BELL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
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
      '.ccf-bis{margin:14px 0;padding:14px;border:1px solid ' + accent + '33;border-radius:14px;background:linear-gradient(135deg,' + accent + '0D,' + accent + '03);font-family:inherit;color:#1A1A1A;line-height:1.45}',
      '.ccf-bis[hidden]{display:none}',
      '.ccf-bis button,.ccf-bis input{font-family:inherit;letter-spacing:normal;text-transform:none;margin:0;min-height:0}',
      '.ccf-bis-head{display:flex;gap:12px;align-items:flex-start}',
      '.ccf-bis-icon{width:40px;height:40px;border-radius:50%;background:#fff;color:' + accent + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 0 1px ' + accent + '33}',
      '.ccf-bis-icon svg{animation:ccf-bis-ring 2.4s ease-in-out 1s 2;transform-origin:50% 10%}',
      '@keyframes ccf-bis-ring{0%,30%,100%{transform:rotate(0)}5%{transform:rotate(14deg)}10%{transform:rotate(-12deg)}15%{transform:rotate(8deg)}20%{transform:rotate(-6deg)}}',
      '@media (prefers-reduced-motion:reduce){.ccf-bis-icon svg{animation:none}}',
      '.ccf-bis-copy{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.ccf-bis-title{font-size:15px;font-weight:600;line-height:1.3}',
      '.ccf-bis-text{font-size:13px;color:#6B6B6B}',
      '.ccf-bis-body{margin-top:12px;display:flex;flex-direction:column;gap:8px}',
      '.ccf-bis-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:11px 16px;border:1px solid ' + accent + ';border-radius:' + r + ';background:' + accent + ';color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:opacity .15s}',
      '.ccf-bis-btn:hover{opacity:.9}',
      '.ccf-bis-btn:focus-visible,.ccf-bis-input:focus-visible{outline:2px solid ' + accent + ';outline-offset:2px}',
      '.ccf-bis-btn[disabled]{opacity:.6;cursor:default}',
      '.ccf-bis-or{display:flex;align-items:center;gap:8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#8A8A8A}',
      '.ccf-bis-or::before,.ccf-bis-or::after{content:"";flex:1;height:1px;background:#E5E5E5}',
      '.ccf-bis-form{display:flex;gap:8px}',
      '.ccf-bis-input{flex:1;min-width:0;height:42px;padding:0 12px;border:1px solid #D4D4D4;border-radius:' + r + ';background:#fff;font-size:14px;color:#1A1A1A}',
      '.ccf-bis-form .ccf-bis-btn{width:auto;flex-shrink:0;background:#fff;color:' + accent + '}',
      '.ccf-bis-form.is-only .ccf-bis-btn{background:' + accent + ';color:#fff}',
      '.ccf-bis-err{margin:0;font-size:12.5px;color:#B42318}',
      '.ccf-bis-opt{display:flex;flex-direction:column;gap:6px}',
      '.ccf-bis-optlabel{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:#1A1A1A}',
      '.ccf-bis-badge{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:#DCFCE7;color:#166534}',
      '.ccf-bis-badge.is-slow{background:#F1F5F9;color:#475569}',
      '.ccf-bis-hint{margin:0;font-size:12px;color:#6B6B6B}',
      '.ccf-bis-wa .ccf-bis-form .ccf-bis-btn{background:#1FA855;border-color:#1FA855;color:#fff}',
      '.ccf-bis-btn.is-ghost{background:#fff;color:' + accent + '}',
      '.ccf-bis-done{display:flex;gap:10px;align-items:center;margin-top:12px;padding:10px 12px;border-radius:10px;background:#ECFDF5;color:#065F46;font-size:13.5px;font-weight:500}',
      '.ccf-bis-done svg{flex-shrink:0}',
      '@media (max-width:420px){.ccf-bis-form{flex-direction:column}.ccf-bis-form .ccf-bis-btn{width:100%}}',
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
      var accent = /^#[0-9a-fA-F]{6}$/.test(settings.accentColor || '') ? settings.accentColor : '#111827';
      injectStyles(accent, radius(settings.buttonRadius));
      placeAfterBuyButtons(root, design);

      var box = el('div', 'ccf-bis');
      box.setAttribute('role', 'region');
      box.setAttribute('aria-label', 'Back in stock alert');
      box.hidden = true;
      root.appendChild(box);

      var shown = null;
      var busy = false;

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

      function subscribed(id) {
        var list = readJSON(SUBS_KEY) || [];
        return list.indexOf(String(id)) !== -1;
      }
      function markSubscribed(id) {
        var list = readJSON(SUBS_KEY) || [];
        if (list.indexOf(String(id)) === -1) list.push(String(id));
        writeJSON(SUBS_KEY, list.slice(-50));
      }

      function pushPossible() {
        return !!(settings.channels && settings.channels.push && window.CCFPush &&
          typeof window.CCFPush.subscribe === 'function' && window.CCFPush.canPush && window.CCFPush.canPush());
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

      function draw(variant) {
        box.innerHTML = '';
        var head = el('div', 'ccf-bis-head');
        var icon = el('span', 'ccf-bis-icon');
        icon.innerHTML = BELL;
        var copy = el('span', 'ccf-bis-copy');
        copy.appendChild(el('span', 'ccf-bis-title', t.boxTitle || 'Sold out in this size'));
        copy.appendChild(el('span', 'ccf-bis-text', t.boxText || 'Get a message the moment it’s back.'));
        head.appendChild(icon);
        head.appendChild(copy);
        box.appendChild(head);

        if (subscribed(variant.id)) {
          var done = el('div', 'ccf-bis-done');
          done.setAttribute('role', 'status');
          done.innerHTML = CHECK;
          done.appendChild(el('span', null, (t.successText || 'Done! We’ll tell you when {size} is back.').replace(/\{size\}/g, sizeLabel(variant.title))));
          box.appendChild(done);
          return;
        }

        var body = el('div', 'ccf-bis-body');
        var err = el('p', 'ccf-bis-err');
        err.setAttribute('role', 'alert');
        err.hidden = true;
        var label = t.buttonText || 'Notify me';
        var useWa = !!(settings.channels && settings.channels.whatsapp);
        var usePush = pushPossible();
        var useEmail = !!(settings.channels && settings.channels.email);
        var many = (useWa ? 1 : 0) + (usePush ? 1 : 0) + (useEmail ? 1 : 0) > 1;

        function fail(msg, btn) {
          busy = false;
          if (btn) btn.disabled = false;
          err.textContent = msg;
          err.hidden = false;
        }
        function ok() {
          busy = false;
          markSubscribed(variant.id);
          draw(variant);
        }
        function optLabel(text, badge, slow) {
          var row = el('span', 'ccf-bis-optlabel', text);
          if (badge) row.appendChild(el('span', 'ccf-bis-badge' + (slow ? ' is-slow' : ''), badge));
          return row;
        }

        // 1. WhatsApp — fastest: the store messages the shopper as soon as the size is back.
        if (useWa) {
          var wa = el('div', 'ccf-bis-opt ccf-bis-wa');
          if (many) wa.appendChild(optLabel('WhatsApp', 'Fastest', false));
          var waForm = el('form', 'ccf-bis-form');
          waForm.setAttribute('novalidate', '');
          var phone = el('input', 'ccf-bis-input ccf-bis-phone');
          phone.type = 'tel';
          phone.autocomplete = 'tel';
          phone.inputMode = 'tel';
          phone.placeholder = t.whatsappPlaceholder || 'WhatsApp number';
          phone.setAttribute('aria-label', t.whatsappPlaceholder || 'WhatsApp number');
          var waBtn = el('button', 'ccf-bis-btn ccf-bis-wabtn', label);
          waBtn.type = 'submit';
          waForm.appendChild(phone);
          waForm.appendChild(waBtn);
          waForm.addEventListener('submit', function (ev) {
            ev.preventDefault();
            if (busy) return;
            var num = String(phone.value || '').replace(/[\s()-]/g, '');
            if (!/^\+?\d{10,15}$/.test(num)) { fail('Enter a valid WhatsApp number', null); phone.focus(); return; }
            busy = true;
            waBtn.disabled = true;
            err.hidden = true;
            send(variant, { channel: 'whatsapp', phone: num })
              .then(ok)
              .catch(function (e) { fail((e && e.message) || 'Could not save. Try again.', waBtn); });
          });
          wa.appendChild(waForm);
          wa.appendChild(el('p', 'ccf-bis-hint', t.whatsappHint || 'Fastest · we message you the moment it’s back'));
          body.appendChild(wa);
        }

        // 2. Push — one tap, instant browser alert.
        if (usePush) {
          if (useWa) body.appendChild(el('div', 'ccf-bis-or', 'or'));
          var pushBtn = el('button', 'ccf-bis-btn ccf-bis-push' + (useWa ? ' is-ghost' : ''));
          pushBtn.type = 'button';
          pushBtn.innerHTML = BELL;
          pushBtn.appendChild(document.createTextNode(' ' + (useWa ? 'Get a browser alert' : label)));
          pushBtn.addEventListener('click', function () {
            if (busy) return;
            busy = true;
            pushBtn.disabled = true;
            err.hidden = true;
            window.CCFPush.subscribe()
              .then(function (token) { return send(variant, { channel: 'push', pushToken: token }); })
              .then(ok)
              .catch(function (e) {
                var denied = e && /denied|unsupported/.test(e.message || '');
                fail(denied
                  ? (useWa ? 'Notifications are blocked. Use WhatsApp or email instead.' : useEmail ? 'Notifications are blocked. Use your email instead.' : 'Notifications are blocked in this browser.')
                  : (e && e.message) || 'Could not save. Try again.', pushBtn);
              });
          });
          body.appendChild(pushBtn);
        }

        // 3. Email — sent a little later, after WhatsApp and push.
        if (useEmail) {
          if (useWa || usePush) body.appendChild(el('div', 'ccf-bis-or', 'or by email'));
          var em = el('div', 'ccf-bis-opt ccf-bis-em');
          var form = el('form', 'ccf-bis-form' + (useWa || usePush ? '' : ' is-only'));
          form.setAttribute('novalidate', '');
          var input = el('input', 'ccf-bis-input');
          input.type = 'email';
          input.autocomplete = 'email';
          input.placeholder = t.emailPlaceholder || 'Your email';
          input.setAttribute('aria-label', t.emailPlaceholder || 'Your email');
          try { var known = readJSON('ccf_known_email'); if (known && known.email) input.value = known.email; } catch (e) {}
          var submit = el('button', 'ccf-bis-btn ccf-bis-email', label);
          submit.type = 'submit';
          form.appendChild(input);
          form.appendChild(submit);
          form.addEventListener('submit', function (ev) {
            ev.preventDefault();
            if (busy) return;
            var email = String(input.value || '').trim();
            if (!EMAIL_RE.test(email)) { fail('Enter a valid email', null); input.focus(); return; }
            busy = true;
            submit.disabled = true;
            err.hidden = true;
            send(variant, { channel: 'email', email: email })
              .then(function () {
                writeJSON('ccf_known_email', { email: email, ts: Date.now() });
                ok();
              })
              .catch(function (e) { fail((e && e.message) || 'Could not save. Try again.', submit); });
          });
          em.appendChild(form);
          if (useWa && t.emailHint) em.appendChild(el('p', 'ccf-bis-hint', t.emailHint));
          body.appendChild(em);
        }
        if (!useWa && !usePush && !useEmail) return;
        body.appendChild(err);
        box.appendChild(body);
      }

      function refresh() {
        if (busy) return;
        var v = currentVariant();
        // Theme editor: always show the box so the merchant can see and place it.
        if (design && v && v.available) v = { id: v.id, title: v.title, available: false };
        var key = v && !v.available ? String(v.id) + (subscribed(v.id) ? ':done' : '') : null;
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

  // Sit right under the theme's Add to cart / Buy buttons (not in the theme editor, so the
  // merchant can move the block freely there).
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
