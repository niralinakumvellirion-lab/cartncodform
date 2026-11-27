/* ccf-pricedrop.js — "Price drop", CartnCodForm. Same look as Back in stock (ccf-restock.js), with its own
   .ccf-pd-* classes so both can sit on one product page with their own colours.
   On an in-stock size a full-width "Notify me if the price drops" button with an arrow sits under the buy
   buttons. The arrow opens a small panel: product photo, "Now ₹1,499", "Your chance to be notified" with a
   % ring (live while typing), and round selectors for Email and WhatsApp (pick one or both). One "Notify
   me" sends them. WhatsApp adds settings.percent.whatsapp, email the rest (just one channel on = 100%).
   The price at sign-up is taken by the server, not from this page. Remembered per size.
   Settings: GET /apps/cartncodform/price-drop/config; requests: POST .../subscribe.
   The admin preview (BackInStockPreview.jsx, kind "price") mirrors this look. */
(function () {
  'use strict';

  var PROXY = '/apps/cartncodform/price-drop';
  var SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var BELL = SVG + '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  var CHAT = SVG + '<path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.5 8.5 0 1 1 21 11.5z"/></svg>';
  var MAIL = SVG + '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
  var CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  var CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>';
  var EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[A-Za-z]{2,24}$/;
  var RING_R = 22;
  var RING_C = 2 * Math.PI * RING_R;

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
    if (document.getElementById('ccf-pd-styles')) return;
    var s = document.createElement('style');
    s.id = 'ccf-pd-styles';
    s.textContent = [
      '.ccf-pd,.ccf-pd *{box-sizing:border-box}',
      '.ccf-pd{margin:10px 0 14px;font-family:inherit;color:#1A1A1A;line-height:1.45}',
      '.ccf-pd[hidden],.ccf-pd [hidden]{display:none!important}',
      '.ccf-pd button,.ccf-pd input{font-family:inherit;letter-spacing:normal;text-transform:none;margin:0;min-height:0}',
      // the Notify me button (in place of Buy it now)
      '.ccf-pd-trigger{width:100%;display:flex;align-items:center;gap:10px;min-height:48px;padding:12px 16px;border:1px solid ' + accent + ';border-radius:' + r + ';background:' + accent + ';color:#fff;font-size:15px;font-weight:600;cursor:pointer;text-align:left;transition:box-shadow .2s,transform .15s}',
      '.ccf-pd-trigger:hover{box-shadow:0 8px 22px ' + accent + '40}',
      '.ccf-pd-trigger:active{transform:translateY(1px)}',
      '.ccf-pd-trigger:focus-visible{outline:2px solid ' + accent + ';outline-offset:3px}',
      '.ccf-pd-trigger .ccf-pd-tlabel{flex:1;min-width:0}',
      '.ccf-pd-tpct{font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.18)}',
      '.ccf-pd-chev{display:flex;width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.16);align-items:center;justify-content:center;transition:transform .25s}',
      '.ccf-pd.is-open .ccf-pd-chev{transform:rotate(90deg)}',
      '.ccf-pd-trigger svg:first-child{animation:ccf-pd-ring 2.4s ease-in-out 1s 2;transform-origin:50% 10%}',
      '@keyframes ccf-pd-ring{0%,30%,100%{transform:rotate(0)}5%{transform:rotate(14deg)}10%{transform:rotate(-12deg)}15%{transform:rotate(8deg)}20%{transform:rotate(-6deg)}}',
      '.ccf-pd.is-full .ccf-pd-trigger{background:#fff;color:#15803D;border-color:#86EFAC}',
      '.ccf-pd.is-full .ccf-pd-chev,.ccf-pd.is-full .ccf-pd-tpct{background:#F0FDF4}',
      // the small panel
      '.ccf-pd-panel{margin-top:10px;padding:14px;border:1px solid #E7E5E4;border-radius:16px;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.04),0 12px 32px rgba(16,24,40,.10);animation:ccf-pd-pop .28s cubic-bezier(.2,.8,.2,1)}',
      '@keyframes ccf-pd-pop{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}',
      '.ccf-pd-top{display:flex;align-items:center;gap:12px}',
      '.ccf-pd-thumb{width:52px;height:52px;border-radius:10px;object-fit:cover;background:#F1F1EF;flex-shrink:0;border:1px solid #EEE}',
      '.ccf-pd-topcopy{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}',
      '.ccf-pd-sold{font-size:12.5px;font-weight:650;color:#15803D}',
      '.ccf-pd-chance{font-size:15px;font-weight:650;line-height:1.3}',
      '.ccf-pd-text{font-size:12.5px;color:#71717A}',
      '.ccf-pd-ringwrap{position:relative;width:56px;height:56px;flex-shrink:0}',
      '.ccf-pd-ringwrap svg{transform:rotate(-90deg)}',
      '.ccf-pd-ringtrack{stroke:#F1F1EF}',
      '.ccf-pd-ringfill{stroke:#16A34A;transition:stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)}',
      '.ccf-pd-pct{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13.5px;font-weight:750;color:#15803D;font-variant-numeric:tabular-nums}',
      // options with round selectors
      '.ccf-pd-opts{margin-top:14px;border-top:1px solid #F0F0F0}',
      '.ccf-pd-opt{border-bottom:1px solid #F0F0F0;padding:2px 0}',
      '.ccf-pd-row{width:100%;display:flex;align-items:center;gap:10px;padding:11px 2px;background:none;border:none;cursor:pointer;color:#1A1A1A;text-align:left}',
      '.ccf-pd-row:focus-visible{outline:2px solid ' + accent + ';outline-offset:2px;border-radius:8px}',
      '.ccf-pd-chan{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
      '.ccf-pd-chan svg{width:16px;height:16px}',
      '.ccf-pd-wa .ccf-pd-chan{background:#E7F8EE;color:#15803D}',
      '.ccf-pd-em .ccf-pd-chan{background:' + accent + '12;color:' + accent + '}',
      '.ccf-pd-name{font-size:14px;font-weight:600}',
      '.ccf-pd-badge{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:#DCFCE7;color:#166534}',
      '.ccf-pd-chip{margin-left:auto;font-size:12px;font-weight:700;color:#15803D;font-variant-numeric:tabular-nums}',
      '.ccf-pd-em .ccf-pd-chip{color:#475569}',
      '.ccf-pd-radio{width:22px;height:22px;border-radius:50%;border:2px solid #D4D4D8;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:border-color .15s,background .15s}',
      '.ccf-pd-radio::after{content:"";width:10px;height:10px;border-radius:50%;background:transparent;transition:background .15s,transform .15s;transform:scale(.4)}',
      '.ccf-pd-opt.is-on .ccf-pd-radio{border-color:' + accent + '}',
      '.ccf-pd-opt.is-on .ccf-pd-radio::after{background:' + accent + ';transform:scale(1)}',
      '.ccf-pd-wa.is-on .ccf-pd-radio{border-color:#16A34A}',
      '.ccf-pd-wa.is-on .ccf-pd-radio::after{background:#16A34A}',
      '.ccf-pd-opt.is-done .ccf-pd-row{cursor:default}',
      '.ccf-pd-opt.is-done .ccf-pd-radio{border-color:#16A34A;background:#16A34A;color:#fff}',
      '.ccf-pd-opt.is-done .ccf-pd-radio::after{display:none}',
      '.ccf-pd-added{font-size:12px;font-weight:600;color:#15803D}',
      '.ccf-pd-field{padding:0 2px 12px;display:flex;flex-direction:column;gap:5px;animation:ccf-pd-pop .2s ease-out}',
      '.ccf-pd-inputwrap{display:flex;align-items:stretch;border:1px solid #D4D4D8;border-radius:' + r + ';background:#fff;overflow:hidden}',
      '.ccf-pd-inputwrap:focus-within{border-color:' + accent + ';box-shadow:0 0 0 3px ' + accent + '1F}',
      '.ccf-pd-cc{display:flex;align-items:center;padding:0 10px;font-size:14px;font-weight:600;color:#3F3F46;background:#FAFAFA;border-right:1px solid #E4E4E7}',
      '.ccf-pd-input{flex:1;min-width:0;height:44px;padding:0 12px;border:none;background:transparent;font-size:14px;color:#1A1A1A;outline:none}',
      '.ccf-pd-hint{margin:0;font-size:12px;color:#71717A}',
      // submit + extras
      '.ccf-pd-submit{width:100%;margin-top:14px;height:48px;border:none;border-radius:999px;background:' + accent + ';color:#fff;font-size:15px;font-weight:650;cursor:pointer;transition:opacity .15s,box-shadow .2s}',
      '.ccf-pd-submit:hover{box-shadow:0 8px 22px ' + accent + '40}',
      '.ccf-pd-submit[disabled]{opacity:.45;cursor:default;box-shadow:none}',
      '.ccf-pd-submit:focus-visible{outline:2px solid ' + accent + ';outline-offset:3px}',
      '.ccf-pd-pushlink{display:flex;margin:10px auto 0;align-items:center;gap:6px;background:none;border:none;padding:4px 6px;color:' + accent + ';font-size:13px;font-weight:600;cursor:pointer}',
      '.ccf-pd-pushlink svg{width:15px;height:15px}',
      '.ccf-pd-err{margin:10px 0 0;font-size:12.5px;color:#B42318}',
      '.ccf-pd-done{display:flex;gap:10px;align-items:center;margin-top:12px;padding:11px 12px;border-radius:12px;background:#ECFDF5;border:1px solid #BBF7D0;color:#065F46;font-size:13.5px;font-weight:500;animation:ccf-pd-pop .3s ease-out}',
      '.ccf-pd-done svg{flex-shrink:0}',
      '@media (prefers-reduced-motion:reduce){.ccf-pd *{animation:none!important;transition:none!important}}',
      '@media (max-width:420px){.ccf-pd-panel{padding:12px}.ccf-pd-thumb{width:44px;height:44px}}',
    ].join('');
    document.head.appendChild(s);
  }

  function init(root) {
    var shop = root.getAttribute('data-shop') || (window.Shopify && window.Shopify.shop) || '';
    var design = root.getAttribute('data-design-mode') === 'true';
    var variants = [];
    try {
      var vNode = root.querySelector('.ccf-pd-variants');
      variants = JSON.parse((vNode && vNode.textContent) || '[]') || [];
    } catch (e) { variants = []; }
    if (!variants.length) return;
    var SUBS_KEY = 'ccf_pd_' + shop;

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
      // What each channel adds to the ring. With just one of WhatsApp/email on, that one is 100%.
      var PCT = ch.whatsapp && ch.email ? { whatsapp: waPct, email: 100 - waPct }
        : ch.whatsapp ? { whatsapp: 100 } : ch.email ? { email: 100 } : { push: 100 };
      var replaceBuyNow = false; // price drop never hides the theme's buttons
      injectStyles(accent, radius(settings.buttonRadius));
      placeAfterBuyButtons(root, design);

      var box = el('div', 'ccf-pd');
      box.setAttribute('role', 'region');
      box.setAttribute('aria-label', 'Price drop alert');
      box.hidden = true;
      root.appendChild(box);

      var shown = null;
      var busy = false;
      var open = false;
      var picked = {}; // channels ticked in the panel (not yet sent)
      var lastPct = {}; // variant id → % the ring last showed (it animates from there)

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
      function percentOf(got) {
        if (got.done) return 100;
        var p = 0;
        Object.keys(PCT).forEach(function (k) { if (got[k]) p += PCT[k]; });
        return Math.min(100, p);
      }

      // Sold-out size: hide the theme's "Buy it now" so the Notify me button takes its place.
      function setBuyNowHidden(hide) {
        if (!replaceBuyNow || design) return;
        var form = buyForm();
        var scope = (form && (form.closest('product-form') || form.parentNode)) || document;
        var nodes = scope.querySelectorAll('.shopify-payment-button, shopify-buy-it-now-button, [data-shopify="payment-button"]');
        for (var i = 0; i < nodes.length; i++) {
          if (hide) { nodes[i].setAttribute('data-ccf-hidden', '1'); nodes[i].style.display = 'none'; }
          else if (nodes[i].getAttribute('data-ccf-hidden')) { nodes[i].style.display = ''; nodes[i].removeAttribute('data-ccf-hidden'); }
        }
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
        var d = el('div', 'ccf-pd-done' + (cls ? ' ' + cls : ''));
        d.setAttribute('role', 'status');
        d.innerHTML = CHECK;
        d.appendChild(el('span', null, text));
        return d;
      }

      function ring(id, pct) {
        var w = el('div', 'ccf-pd-ringwrap');
        w.setAttribute('role', 'progressbar');
        w.setAttribute('aria-valuemin', '0');
        w.setAttribute('aria-valuemax', '100');
        w.setAttribute('aria-valuenow', String(pct));
        w.setAttribute('aria-label', t.chanceLabel || 'Your chance to be notified');
        var from = lastPct[id] != null ? lastPct[id] : 0;
        var off = function (p) { return (RING_C * (1 - p / 100)).toFixed(1); };
        w.innerHTML = '<svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">' +
          '<circle class="ccf-pd-ringtrack" cx="28" cy="28" r="' + RING_R + '" fill="none" stroke-width="5"/>' +
          '<circle class="ccf-pd-ringfill" cx="28" cy="28" r="' + RING_R + '" fill="none" stroke-width="5" stroke-linecap="round" ' +
          'stroke-dasharray="' + RING_C.toFixed(1) + '" stroke-dashoffset="' + off(from) + '"/></svg>';
        var pctEl = el('span', 'ccf-pd-pct', pct + '%');
        w.appendChild(pctEl);
        var fill = w.querySelector('.ccf-pd-ringfill');
        var target = pct;
        var started = false;
        function apply() { fill.setAttribute('stroke-dashoffset', off(target)); }
        // Live updates (while the shopper types) move the ring and the % at once.
        w.setPct = function (p) {
          target = p;
          lastPct[id] = p;
          pctEl.textContent = p + '%';
          w.setAttribute('aria-valuenow', String(p));
          if (started) apply();
        };
        lastPct[id] = pct;
        setTimeout(function () { started = true; apply(); }, 40); // animate from the last % shown
        return w;
      }

      function validPhone(v) {
        var raw = String(v || '').replace(/[\s()-]/g, '');
        var num = raw.indexOf('+') === 0 ? raw : raw.replace(/^0+/, '');
        return /^\+?\d{10,15}$/.test(num);
      }

      function draw(variant) {
        var id = String(variant.id);
        var got = gotFor(id);
        var pct = percentOf(got);
        var complete = pct >= 100;
        var size = sizeLabel(variant.title);
        box.innerHTML = '';
        box.classList.toggle('is-open', open);
        box.classList.toggle('is-full', complete);

        // 1. The Notify me button (arrow opens the panel).
        var trig = el('button', 'ccf-pd-trigger');
        trig.type = 'button';
        trig.setAttribute('aria-expanded', open ? 'true' : 'false');
        trig.innerHTML = complete ? CHECK : BELL;
        trig.appendChild(el('span', 'ccf-pd-tlabel', complete ? 'You’re on the list' : (t.triggerText || 'Notify me if the price drops')));
        if (pct > 0) trig.appendChild(el('span', 'ccf-pd-tpct', pct + '%'));
        var chev = el('span', 'ccf-pd-chev');
        chev.innerHTML = CHEV;
        trig.appendChild(chev);
        trig.addEventListener('click', function () { open = !open; draw(variant); });
        box.appendChild(trig);
        if (!open) return;

        // 2. The panel.
        var panel = el('div', 'ccf-pd-panel');
        var top = el('div', 'ccf-pd-top');
        var img = root.getAttribute('data-product-image') || '';
        if (img) {
          var th = el('img', 'ccf-pd-thumb');
          th.src = img.indexOf('//') === 0 ? 'https:' + img : img;
          th.alt = '';
          top.appendChild(th);
        }
        var copy = el('div', 'ccf-pd-topcopy');
        copy.appendChild(el('span', 'ccf-pd-sold', (t.boxTitle || 'Now {price}').replace(/\{size\}/g, size).replace(/\{price\}/g, variant.price || '')));
        copy.appendChild(el('span', 'ccf-pd-chance', t.chanceLabel || 'Your chance to be notified'));
        top.appendChild(copy);
        var ringEl = ring(id, pct);
        top.appendChild(ringEl);
        panel.appendChild(top);

        if (complete) {
          panel.appendChild(doneLine('', (t.successText || 'Done! We’ll tell you when the price drops.').replace(/\{size\}/g, size)));
          box.appendChild(panel);
          return;
        }
        if (pct > 0) {
          var next = got.whatsapp ? 'email' : 'WhatsApp';
          panel.appendChild(doneLine('ccf-pd-partial', (t.partialText || 'Done! Add {next} too to reach 100%.')
            .replace(/\{next\}/g, next).replace(/\{percent\}/g, String(pct)).replace(/\{size\}/g, size)));
        }
        if (t.boxText && pct === 0) panel.appendChild(el('p', 'ccf-pd-text', t.boxText));

        var err = el('p', 'ccf-pd-err');
        err.setAttribute('role', 'alert');
        err.hidden = true;
        var opts = el('div', 'ccf-pd-opts');
        opts.setAttribute('role', 'group');
        opts.setAttribute('aria-label', 'How should we tell you?');
        var inputs = {};
        var submit = el('button', 'ccf-pd-submit', t.buttonText || 'Notify me');
        submit.type = 'button';

        function syncSubmit() {
          var any = Object.keys(picked).some(function (k) { return picked[k] && !got[k]; });
          submit.disabled = !any;
        }

        function option(kind, channel, name, iconSvg, badge, inputEl, hint, prefix) {
          var done = !!got[channel];
          var on = !done && !!picked[channel];
          var o = el('div', 'ccf-pd-opt ccf-pd-' + kind + (on ? ' is-on' : '') + (done ? ' is-done' : ''));
          var row = el('button', 'ccf-pd-row');
          row.type = 'button';
          row.setAttribute('role', 'checkbox');
          row.setAttribute('aria-checked', done || on ? 'true' : 'false');
          if (done) row.setAttribute('aria-disabled', 'true');
          var chan = el('span', 'ccf-pd-chan');
          chan.innerHTML = iconSvg;
          row.appendChild(chan);
          row.appendChild(el('span', 'ccf-pd-name', name));
          if (badge && !done) row.appendChild(el('span', 'ccf-pd-badge', badge));
          if (done) row.appendChild(el('span', 'ccf-pd-chip ccf-pd-added', 'Added'));
          else if (PCT[channel] != null && PCT[channel] < 100) row.appendChild(el('span', 'ccf-pd-chip', '+' + PCT[channel] + '%'));
          else row.appendChild(el('span', 'ccf-pd-chip', ''));
          var dot = el('span', 'ccf-pd-radio');
          if (done) dot.innerHTML = CHECK;
          row.appendChild(dot);
          if (!done) {
            row.addEventListener('click', function () {
              picked[channel] = !picked[channel];
              err.hidden = true;
              draw(variant);
              var f = box.querySelector('.ccf-pd-' + kind + ' .ccf-pd-input');
              if (picked[channel] && f) f.focus();
            });
          }
          o.appendChild(row);
          if (on) {
            var field = el('div', 'ccf-pd-field');
            var wrap = el('div', 'ccf-pd-inputwrap');
            if (prefix) wrap.appendChild(el('span', 'ccf-pd-cc', prefix));
            wrap.appendChild(inputEl);
            field.appendChild(wrap);
            if (hint) field.appendChild(el('p', 'ccf-pd-hint', hint));
            o.appendChild(field);
            inputs[channel] = inputEl;
          }
          return o;
        }

        if (ch.email) {
          var em = el('input', 'ccf-pd-input ccf-pd-email');
          em.type = 'email';
          em.autocomplete = 'email';
          em.placeholder = t.emailPlaceholder || 'Your email';
          em.setAttribute('aria-label', t.emailPlaceholder || 'Your email');
          var known = readJSON('ccf_known_email');
          if (known && known.email) em.value = known.email;
          if (draft.email != null) em.value = draft.email;
          em.addEventListener('input', function () { draft.email = em.value; liveUpdate(); });
          opts.appendChild(option('em', 'email', 'Email', MAIL, '', em, ch.whatsapp ? (t.emailHint || '') : '', ''));
        }
        if (ch.whatsapp) {
          var ph = el('input', 'ccf-pd-input ccf-pd-phone');
          ph.type = 'tel';
          ph.autocomplete = 'tel-national';
          ph.inputMode = 'tel';
          ph.placeholder = t.whatsappPlaceholder || 'WhatsApp number';
          ph.setAttribute('aria-label', t.whatsappPlaceholder || 'WhatsApp number');
          if (draft.phone != null) ph.value = draft.phone;
          ph.addEventListener('input', function () { draft.phone = ph.value; liveUpdate(); });
          opts.appendChild(option('wa', 'whatsapp', 'WhatsApp', CHAT, 'Fastest', ph,
            t.whatsappHint || 'Fastest · we message you the moment the price drops', '+91'));
        }
        if (opts.children.length) panel.appendChild(opts);

        function fail(msg) {
          busy = false;
          syncSubmit();
          err.textContent = msg;
          err.hidden = false;
        }

        submit.addEventListener('click', function () {
          if (busy) return;
          var jobs = [];
          if (picked.email && !got.email && inputs.email) {
            var e = String(inputs.email.value || '').trim();
            if (!EMAIL_RE.test(e)) { fail('Enter a valid email'); inputs.email.focus(); return; }
            jobs.push(['email', { channel: 'email', email: e }]);
          }
          if (picked.whatsapp && !got.whatsapp && inputs.whatsapp) {
            var raw = String(inputs.whatsapp.value || '').replace(/[\s()-]/g, '');
            var num = raw.indexOf('+') === 0 ? raw : raw.replace(/^0+/, '');
            if (!/^\+?\d{10,15}$/.test(num)) { fail('Enter a valid WhatsApp number'); inputs.whatsapp.focus(); return; }
            jobs.push(['whatsapp', { channel: 'whatsapp', phone: num.indexOf('+') === 0 ? num : (num.length === 10 ? '+91' + num : '+' + num) }]);
          }
          if (!jobs.length) return;
          busy = true;
          submit.disabled = true;
          err.hidden = true;
          var errors = [];
          Promise.all(jobs.map(function (j) {
            return send(variant, j[1]).then(function () {
              markGot(id, j[0]);
              picked[j[0]] = false;
              if (j[0] === 'email') writeJSON('ccf_known_email', { email: j[1].email, ts: Date.now() });
            }).catch(function (x) { errors.push((x && x.message) || 'Could not save. Try again.'); });
          })).then(function () {
            busy = false;
            draw(variant);
            if (errors.length) {
              var e2 = box.querySelector('.ccf-pd-err');
              if (e2) { e2.textContent = errors[0]; e2.hidden = false; }
            }
          });
        });
        if (ch.email || ch.whatsapp) panel.appendChild(submit);

        // Push: a small extra (or the only way, when it is the only channel on).
        if (pushPossible() && !got.push) {
          var alone = !ch.email && !ch.whatsapp;
          var pushBtn = el('button', alone ? 'ccf-pd-submit ccf-pd-push' : 'ccf-pd-pushlink ccf-pd-push');
          pushBtn.type = 'button';
          if (!alone) pushBtn.innerHTML = BELL;
          pushBtn.appendChild(document.createTextNode(alone ? (t.buttonText || 'Notify me') : ' Also get a browser alert'));
          pushBtn.addEventListener('click', function () {
            if (busy) return;
            busy = true;
            pushBtn.disabled = true;
            err.hidden = true;
            window.CCFPush.subscribe()
              .then(function (token) { return send(variant, { channel: 'push', pushToken: token }); })
              .then(function () { busy = false; markGot(id, 'push'); draw(variant); })
              .catch(function (x) {
                pushBtn.disabled = false;
                var denied = x && /denied|unsupported/.test(x.message || '');
                fail(denied
                  ? (ch.whatsapp ? 'Notifications are blocked. Use WhatsApp or email instead.' : ch.email ? 'Notifications are blocked. Use your email instead.' : 'Notifications are blocked in this browser.')
                  : (x && x.message) || 'Could not save. Try again.');
              });
          });
          panel.appendChild(pushBtn);
        }
        panel.appendChild(err);
        box.appendChild(panel);
        syncSubmit();
        liveUpdate();

        // The ring shows the chance live: what is already saved plus every picked option whose
        // field is filled in correctly (email 20%, WhatsApp 80%, both 100%) — before Notify me.
        function liveUpdate() {
          var live = {};
          Object.keys(got).forEach(function (k) { live[k] = got[k]; });
          if (picked.email && inputs.email && EMAIL_RE.test(String(inputs.email.value || '').trim())) live.email = 1;
          if (picked.whatsapp && inputs.whatsapp && validPhone(inputs.whatsapp.value)) live.whatsapp = 1;
          ringEl.setPct(percentOf(live));
        }
      }
      var draft = {}; // typed values survive redraws (picking a second option, errors)

      function refresh() {
        if (busy) return;
        var v = currentVariant();
        // Shown on sizes that can be bought (Back in stock covers sold-out ones). Theme editor: always.
        if (design && v && !v.available) v = { id: v.id, title: v.title, price: v.price, available: true };
        var inStock = !!(v && v.available);
        var key = inStock ? String(v.id) + ':' + Object.keys(gotFor(v.id)).sort().join(',') : null;
        if (key === shown) return;
        var sameSize = shown && key && shown.split(':')[0] === key.split(':')[0];
        shown = key;
        setBuyNowHidden(false);
        if (!key) { box.hidden = true; return; }
        if (!sameSize) { open = false; picked = {}; }
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
    var root = document.getElementById('ccf-pd-root');
    if (!root || root.getAttribute('data-ccf-ready')) return;
    root.setAttribute('data-ccf-ready', '1');
    init(root);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
