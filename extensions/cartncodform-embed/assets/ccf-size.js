/* ccf-size.js — "Find my size", CartnCodForm.
   Classes prefixed .ccf-sf-*. Settings + charts from the App Proxy; the size itself is worked out
   on the backend (POST /apps/cartncodform/size-finder/recommend). Height and weight stay on this
   device (localStorage, to pre-fill next time) and are sent only for the calculation.
   The admin's live preview (frontend/app/admin/screens/SizeFinderPreview.jsx) mirrors this design. */
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

  function injectStyles(accent) {
    if (document.getElementById('ccf-sf-styles')) return;
    var tint = accent + '14';
    var s = document.createElement('style');
    s.id = 'ccf-sf-styles';
    s.textContent = [
      '.ccf-sf *{box-sizing:border-box}',
      '.ccf-sf{margin:14px 0;font-family:inherit;color:#303030;line-height:1.45;-webkit-font-smoothing:antialiased}',
      '.ccf-sf button{font-family:inherit;letter-spacing:normal;text-transform:none;min-height:0}',
      // trigger
      '.ccf-sf-trigger{width:100%;display:flex;align-items:center;gap:12px;padding:12px 14px;margin:0;border:1px solid ' + accent + '40;border-radius:14px;background:linear-gradient(135deg,' + accent + '0F,' + accent + '05);color:#303030;cursor:pointer;text-align:left;transition:border-color .15s,box-shadow .15s,transform .15s}',
      '.ccf-sf-trigger:hover{border-color:' + accent + ';box-shadow:0 6px 18px rgba(17,24,39,.08);transform:translateY(-1px)}',
      '.ccf-sf-trigger:focus-visible{outline:2px solid ' + accent + ';outline-offset:2px}',
      '.ccf-sf-icon{position:relative;width:42px;height:42px;border-radius:50%;background:#fff;color:' + accent + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 0 1px ' + accent + '33}',
      '.ccf-sf-icon::after{content:"";position:absolute;inset:-1px;border-radius:50%;border:2px solid ' + accent + ';opacity:0;animation:ccf-sf-pulse 2.2s ease-out 1s 3}',
      '@keyframes ccf-sf-pulse{0%{transform:scale(1);opacity:.45}100%{transform:scale(1.45);opacity:0}}',
      '@media (prefers-reduced-motion:reduce){.ccf-sf-icon::after{animation:none}.ccf-sf-trigger{transition:none}}',
      '.ccf-sf-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.ccf-sf-card-title{font-size:15px;font-weight:600;line-height:1.3}',
      '.ccf-sf-card-sub{font-size:12.5px;color:#616161;line-height:1.35}',
      '.ccf-sf-cta{flex-shrink:0;display:inline-flex;align-items:center;gap:4px;background:' + accent + ';color:#fff;border:1px solid ' + accent + ';border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;white-space:nowrap}',
      '.ccf-sf-trigger.is-done .ccf-sf-icon{background:' + accent + ';color:#fff}',
      '.ccf-sf-trigger.is-done .ccf-sf-icon::after{display:none}',
      '.ccf-sf-trigger.is-done .ccf-sf-cta{background:#fff;color:' + accent + '}',
      '@media (max-width:420px){.ccf-sf-trigger{padding:11px 12px;gap:10px}.ccf-sf-icon{width:38px;height:38px}.ccf-sf-card-title{font-size:14px}.ccf-sf-cta{padding:7px 11px;font-size:12px}}',
      // panel
      '.ccf-sf-panel{margin-top:12px;border:1px solid #E5E7EB;border-radius:16px;background:#fff;box-shadow:0 10px 30px rgba(17,24,39,.08);overflow:hidden}',
      '.ccf-sf-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px 0}',
      '.ccf-sf-step{font-size:11px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:#616161;margin:0 0 4px}',
      '.ccf-sf-title{font-size:18px;font-weight:600;margin:0}',
      '.ccf-sf-close{background:#F3F4F6;border:0;width:30px;height:30px;border-radius:50%;cursor:pointer;color:#4A4A4A;font-size:16px;line-height:30px;text-align:center;flex-shrink:0}',
      '.ccf-sf-progress{display:flex;gap:6px;padding:14px 20px 0}',
      '.ccf-sf-progress span{flex:1;height:4px;border-radius:4px;background:#E5E7EB}',
      '.ccf-sf-progress span.on{background:' + accent + '}',
      '.ccf-sf-body{padding:18px 20px 20px}',
      // segmented
      '.ccf-sf-seg{display:flex;background:#F3F4F6;border-radius:10px;padding:4px;gap:4px;margin:0 0 18px}',
      '.ccf-sf-seg button{flex:1;border:0;background:transparent;border-radius:8px;padding:8px;font-size:14px;font-weight:500;color:#616161;cursor:pointer}',
      '.ccf-sf-seg button[aria-pressed="true"]{background:#fff;color:#303030;box-shadow:0 1px 3px rgba(17,24,39,.12)}',
      // measure fields
      '.ccf-sf-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}',
      '.ccf-sf-field{margin:0 0 16px;min-width:0}',
      '.ccf-sf-label{display:flex;justify-content:space-between;align-items:center;margin:0 0 8px}',
      '.ccf-sf-label > span:first-child{font-size:13px;font-weight:500;color:#4A4A4A}',
      '.ccf-sf-unit{display:inline-flex;background:#F3F4F6;border-radius:8px;padding:2px}',
      '.ccf-sf-unit button{border:0;background:transparent;border-radius:6px;padding:3px 10px;font-size:12px;font-weight:500;color:#616161;cursor:pointer}',
      '.ccf-sf-unit button[aria-pressed="true"]{background:#fff;color:#303030;box-shadow:0 1px 2px rgba(17,24,39,.12)}',
      '.ccf-sf-value{font-size:28px;font-weight:600;letter-spacing:-.01em;margin:0 0 6px}',
      '.ccf-sf-range{width:100%;accent-color:' + accent + ';margin:0}',
      '.ccf-sf-scale{display:flex;justify-content:space-between;font-size:11px;color:#8A8A8A;margin-top:2px}',
      // option cards
      '.ccf-sf-q{font-size:13px;font-weight:500;color:#4A4A4A;margin:0 0 8px}',
      '.ccf-sf-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 18px}',
      '.ccf-sf-card{border:1.5px solid #E5E7EB;background:#fff;border-radius:12px;padding:10px 8px;text-align:center;cursor:pointer;display:flex;flex-direction:column;gap:2px}',
      '.ccf-sf-card b{font-size:14px;font-weight:500;color:#303030}',
      '.ccf-sf-card small{font-size:11px;color:#616161}',
      '.ccf-sf-card[aria-pressed="true"]{border-color:' + accent + ';background:' + tint + '}',
      // remember switch
      '.ccf-sf-check{display:flex;align-items:center;justify-content:space-between;gap:12px;background:#F9FAFB;border-radius:12px;padding:12px 14px;cursor:pointer}',
      '.ccf-sf-check span b{display:block;font-size:13px;font-weight:500;color:#303030}',
      '.ccf-sf-check span small{font-size:12px;color:#616161}',
      '.ccf-sf-check input{appearance:none;-webkit-appearance:none;width:40px;height:22px;border-radius:999px;background:#D1D5DB;position:relative;cursor:pointer;flex-shrink:0;margin:0;transition:background .15s}',
      '.ccf-sf-check input::after{content:"";position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}',
      '.ccf-sf-check input:checked{background:' + accent + '}',
      '.ccf-sf-check input:checked::after{left:20px}',
      // actions
      '.ccf-sf-actions{display:flex;gap:10px;margin-top:18px}',
      '.ccf-sf-btn{flex:1;border:1px solid #D1D5DB;background:#fff;color:#303030;border-radius:10px;padding:12px;font-size:14px;font-weight:500;cursor:pointer}',
      '.ccf-sf-btn-main{flex:2;background:' + accent + ';border-color:' + accent + ';color:#fff}',
      '.ccf-sf-btn-main[disabled]{opacity:.7;cursor:wait}',
      // result
      '.ccf-sf-result{text-align:left}',
      '.ccf-sf-result-top{display:flex;align-items:center;gap:16px;margin:0 0 8px}',
      '.ccf-sf-summary{flex:1;min-width:0}',
      '.ccf-sf-kicker{font-size:12px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:#616161;margin:0}',
      '.ccf-sf-size{width:76px;height:76px;margin:0;flex-shrink:0;border-radius:50%;border:4px solid ' + accent + ';background:' + tint + ';display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:600;color:#303030}',
      '.ccf-sf-verdict{font-size:16px;font-weight:600;margin:2px 0 10px}',
      '.ccf-sf-meter{margin:0;text-align:left}',
      '.ccf-sf-meter-bar{position:relative;height:6px;border-radius:6px;background:linear-gradient(90deg,#FDE68A,#A7F3D0 35%,#A7F3D0 65%,#FDE68A)}',
      '.ccf-sf-meter-dot{position:absolute;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#fff;border:3px solid ' + accent + '}',
      '.ccf-sf-meter-labels{display:flex;justify-content:space-between;font-size:11px;color:#616161;margin-top:6px}',
      '.ccf-sf-reason{display:flex;justify-content:space-between;align-items:center;font-size:13px;border-top:1px solid #F3F4F6;padding:10px 2px;text-align:left}',
      '.ccf-sf-reason > span:first-child{color:#4A4A4A;font-weight:500}',
      '.ccf-sf-ok,.ccf-sf-warn{display:inline-flex;align-items:center;gap:6px;font-weight:500}',
      '.ccf-sf-ok{color:#047857}.ccf-sf-warn{color:#B45309}',
      '.ccf-sf-ok::before,.ccf-sf-warn::before{content:"";width:16px;height:16px;border-radius:50%;flex-shrink:0;background-repeat:no-repeat;background-position:center;background-size:10px}',
      ".ccf-sf-ok::before{background-color:#D1FAE5;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23047857' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12l5 5L20 7'/%3E%3C/svg%3E\")}",
      ".ccf-sf-warn::before{background-color:#FEF3C7;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23B45309' stroke-width='3.5' stroke-linecap='round'%3E%3Cpath d='M12 6v7M12 18h.01'/%3E%3C/svg%3E\")}",
      '.ccf-sf-muted{color:#616161}',
      '.ccf-sf-note{font-size:12px;color:#616161;margin:10px 0 0}',
      '.ccf-sf-err{font-size:13px;color:#B42318;font-weight:500;margin:12px 0 0;background:#FEF2F2;border-radius:8px;padding:8px 10px}',
      '.ccf-sf-link{background:none;border:0;padding:0;color:' + accent + ';text-decoration:underline;text-underline-offset:3px;font-size:13px;font-weight:500;cursor:pointer;margin-top:12px}',
      '.ccf-sf-table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden}',
      '.ccf-sf-table th{background:#F9FAFB;font-weight:500;color:#4A4A4A}',
      '.ccf-sf-table th,.ccf-sf-table td{border-bottom:1px solid #F3F4F6;padding:7px 6px;text-align:center}',
      '@media (max-width:340px){.ccf-sf-fields{grid-template-columns:minmax(0,1fr)}}',
      '@media (max-width:420px){.ccf-sf-head,.ccf-sf-progress{padding-left:16px;padding-right:16px}.ccf-sf-body{padding:16px}.ccf-sf-value{font-size:24px}}',
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

  function init(root, settings) {
    var shop = root.getAttribute('data-shop') || '';
    var sizeOption = root.getAttribute('data-size-option') || 'Size';
    var sizeValues = (root.getAttribute('data-size-values') || '').split('|').filter(Boolean);
    var accent = /^#[0-9A-Fa-f]{6}$/.test(settings.accentColor || '') ? settings.accentColor : '#111827';
    var genders = Array.isArray(settings.genders) ? settings.genders : [];
    if (!genders.length) { root.remove(); return; }

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
      busy: false,
      error: '',
      showChart: false,
    };

    var design = root.getAttribute('data-design-mode') === 'true' || !!(window.Shopify && window.Shopify.designMode);
    if (!design) placeNearSizePicker(root, sizeOption);

    var wrap = el('div', 'ccf-sf');
    var open = el('button', 'ccf-sf-open ccf-sf-trigger');
    open.type = 'button';
    open.setAttribute('aria-expanded', 'false');
    var panel = el('div', 'ccf-sf-panel');
    panel.hidden = true;
    wrap.appendChild(open);
    wrap.appendChild(panel);
    root.appendChild(wrap);

    // The card: "Not sure about your size?" until the shopper has a size, then "Your size: M".
    function setOpenLabel(size) {
      open.innerHTML = '';
      open.classList.toggle('is-done', !!size);
      var icon = el('span', 'ccf-sf-icon');
      icon.innerHTML = size ? CHECK : RULER;
      var copy = el('span', 'ccf-sf-copy');
      copy.appendChild(el('span', 'ccf-sf-card-title', size ? 'Your size: ' + size : 'Not sure about your size?'));
      copy.appendChild(el('span', 'ccf-sf-card-sub', size ? 'Based on your answers · tap to change' : '3 quick questions · takes 20 seconds'));
      open.appendChild(icon);
      open.appendChild(copy);
      open.appendChild(el('span', 'ccf-sf-cta', size ? 'Change' : (settings.buttonText || 'Find my size') + ' →'));
    }
    var known = saved.size && (!sizeValues.length || sizeValues.some(function (v) { return v.toLowerCase() === String(saved.size).toLowerCase(); }));
    setOpenLabel(known ? saved.size : '');

    function close() {
      panel.hidden = true;
      open.setAttribute('aria-expanded', 'false');
    }

    open.addEventListener('click', function () {
      panel.hidden = !panel.hidden;
      open.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
      if (!panel.hidden) { state.step = state.result ? 3 : 1; draw(); }
    });

    function segmented(options, current, onPick, labelText) {
      var box = el('div', 'ccf-sf-seg');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', labelText);
      options.forEach(function (o) {
        var b = el('button', null, o.label);
        b.type = 'button';
        b.setAttribute('aria-pressed', o.value === current ? 'true' : 'false');
        b.addEventListener('click', function () { onPick(o.value); draw(); });
        box.appendChild(b);
      });
      return box;
    }

    function cards(options, current, onPick, labelText) {
      var box = el('div', 'ccf-sf-cards');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', labelText);
      options.forEach(function (o) {
        var b = el('button', 'ccf-sf-card');
        b.type = 'button';
        b.setAttribute('aria-label', o.label);
        b.setAttribute('aria-pressed', o.value === current ? 'true' : 'false');
        b.appendChild(el('b', null, o.label));
        b.appendChild(el('small', null, o.hint));
        b.addEventListener('click', function () { onPick(o.value); draw(); });
        box.appendChild(b);
      });
      return box;
    }

    function unitToggle(opts, current, onPick, labelText) {
      var box = el('span', 'ccf-sf-unit');
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', labelText);
      opts.forEach(function (u) {
        var b = el('button', null, u);
        b.type = 'button';
        b.setAttribute('aria-pressed', u === current ? 'true' : 'false');
        b.addEventListener('click', function () { onPick(u); draw(); });
        box.appendChild(b);
      });
      return box;
    }

    function heightText() {
      if (state.hUnit === 'cm') return Math.round(state.heightCm) + ' cm';
      var totalIn = Math.round(state.heightCm / CM_PER_IN);
      return Math.floor(totalIn / 12) + '′ ' + (totalIn % 12) + '″';
    }
    function weightText() {
      return state.wUnit === 'kg' ? Math.round(state.weightKg) + ' kg' : Math.round(state.weightKg / KG_PER_LB) + ' lb';
    }

    function slider(label, min, max, value, onInput, valueText, unitEl, scale) {
      var f = el('div', 'ccf-sf-field');
      var l = el('div', 'ccf-sf-label');
      l.appendChild(el('span', null, label));
      l.appendChild(unitEl);
      f.appendChild(l);
      var v = el('div', 'ccf-sf-value', valueText());
      var input = el('input', 'ccf-sf-range');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = '1';
      input.value = String(Math.round(value));
      input.setAttribute('aria-label', label);
      input.addEventListener('input', function () { onInput(Number(input.value)); v.textContent = valueText(); });
      f.appendChild(v);
      f.appendChild(input);
      var sc = el('div', 'ccf-sf-scale');
      sc.appendChild(el('span', null, scale[0]));
      sc.appendChild(el('span', null, scale[1]));
      f.appendChild(sc);
      return f;
    }

    function chartTable(gender) {
      var rows = (settings.charts && settings.charts[gender]) || [];
      var inch = state.hUnit === 'ft';
      var t = el('table', 'ccf-sf-table');
      var head = el('tr');
      ['Size', 'Chest', 'Waist', 'Length'].forEach(function (h) { head.appendChild(el('th', null, h + (h === 'Size' ? '' : inch ? ' (in)' : ' (cm)'))); });
      t.appendChild(head);
      rows.forEach(function (r) {
        var tr = el('tr');
        tr.appendChild(el('td', null, r.size));
        [r.chest, r.waist, r.length].forEach(function (n) {
          tr.appendChild(el('td', null, !n ? '—' : inch ? (Math.round(n / CM_PER_IN * 10) / 10).toString() : String(n)));
        });
        t.appendChild(tr);
      });
      return t;
    }

    function actions(backFn, mainText, mainFn) {
      var a = el('div', 'ccf-sf-actions');
      if (backFn) {
        var back = el('button', 'ccf-sf-btn', 'Back');
        back.type = 'button';
        back.addEventListener('click', backFn);
        a.appendChild(back);
      }
      var main = el('button', 'ccf-sf-btn ccf-sf-btn-main', mainText);
      main.type = 'button';
      main.disabled = state.busy;
      main.addEventListener('click', mainFn);
      a.appendChild(main);
      return a;
    }

    function remember() {
      writeJSON(STORE_KEY, {
        gender: state.gender, heightCm: state.heightCm, weightKg: state.weightKg,
        hUnit: state.hUnit, wUnit: state.wUnit, shape: state.shape, fit: state.fit,
        size: (readJSON(STORE_KEY) || {}).size,
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

    var REASON_TEXT = { right: 'Right for your fit', snug: 'A little snug', roomy: 'A little roomy' };
    var TITLES = { 1: 'Find your size', 2: 'Tell us about your fit', 3: 'Your size' };

    function header() {
      var h = el('div', 'ccf-sf-head');
      var left = el('div');
      left.appendChild(el('p', 'ccf-sf-step', 'Step ' + state.step + ' of 3'));
      left.appendChild(el('p', 'ccf-sf-title', TITLES[state.step]));
      h.appendChild(left);
      var x = el('button', 'ccf-sf-close', '×');
      x.type = 'button';
      x.setAttribute('aria-label', 'Close');
      x.addEventListener('click', close);
      h.appendChild(x);
      panel.appendChild(h);
      var p = el('div', 'ccf-sf-progress');
      p.setAttribute('aria-hidden', 'true');
      for (var i = 1; i <= 3; i++) p.appendChild(el('span', i <= state.step ? 'on' : null));
      panel.appendChild(p);
    }

    function draw() {
      panel.innerHTML = '';
      header();
      var body = el('div', 'ccf-sf-body');
      panel.appendChild(body);

      if (state.step === 1) {
        if (genders.length > 1) {
          body.appendChild(segmented(
            genders.map(function (g) { return { value: g, label: g === 'men' ? 'Men' : 'Women' }; }),
            state.gender, function (v) { state.gender = v; }, 'Women or men'
          ));
        }
        var fields = el('div', 'ccf-sf-fields');
        body.appendChild(fields);
        fields.appendChild(slider('Height', 140, 200, state.heightCm, function (v) { state.heightCm = v; }, heightText,
          unitToggle(['cm', 'ft'], state.hUnit, function (u) { state.hUnit = u; }, 'Height unit'),
          state.hUnit === 'cm' ? ['140 cm', '200 cm'] : ['4′ 7″', '6′ 7″']));
        fields.appendChild(slider('Weight', 40, 130, state.weightKg, function (v) { state.weightKg = v; }, weightText,
          unitToggle(['kg', 'lb'], state.wUnit, function (u) { state.wUnit = u; }, 'Weight unit'),
          state.wUnit === 'kg' ? ['40 kg', '130 kg'] : ['88 lb', '287 lb']));
        body.appendChild(actions(null, 'Continue', function () { state.step = 2; draw(); }));
      } else if (state.step === 2) {
        body.appendChild(el('p', 'ccf-sf-q', 'Your body shape'));
        body.appendChild(cards([
          { value: 'slim', label: 'Slim', hint: 'Narrow frame' },
          { value: 'average', label: 'Average', hint: 'Medium frame' },
          { value: 'broad', label: 'Broad', hint: 'Wider frame' },
        ], state.shape, function (v) { state.shape = v; }, 'Body shape'));
        body.appendChild(el('p', 'ccf-sf-q', 'How do you like it to fit?'));
        body.appendChild(cards([
          { value: 'snug', label: 'Snug', hint: 'Close to body' },
          { value: 'regular', label: 'Regular', hint: 'Classic fit' },
          { value: 'relaxed', label: 'Relaxed', hint: 'Loose and easy' },
        ], state.fit, function (v) { state.fit = v; }, 'Preferred fit'));
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
        body.appendChild(actions(function () { state.step = 1; draw(); }, state.busy ? 'Working it out…' : 'See my size', getSize));
      } else {
        var r = state.result || {};
        var box = el('div', 'ccf-sf-result');
        var top = el('div', 'ccf-sf-result-top');
        top.appendChild(el('div', 'ccf-sf-size', r.size || '?'));
        var summary = el('div', 'ccf-sf-summary');
        summary.appendChild(el('p', 'ccf-sf-kicker', 'We recommend'));
        summary.appendChild(el('p', 'ccf-sf-verdict', r.outOfRange ? 'Our largest size — it may feel tight' : 'Best fit for you'));
        top.appendChild(summary);
        box.appendChild(top);

        var meter = el('div', 'ccf-sf-meter');
        meter.setAttribute('aria-hidden', 'true');
        var bar = el('div', 'ccf-sf-meter-bar');
        var dot = el('span', 'ccf-sf-meter-dot');
        dot.style.left = meterPosition(r.reasons) + '%';
        bar.appendChild(dot);
        meter.appendChild(bar);
        var ml = el('div', 'ccf-sf-meter-labels');
        ['Snug', 'Perfect', 'Roomy'].forEach(function (t) { ml.appendChild(el('span', null, t)); });
        meter.appendChild(ml);
        summary.appendChild(meter);

        (r.reasons || []).forEach(function (x) {
          var row = el('div', 'ccf-sf-reason');
          row.appendChild(el('span', null, x.area.charAt(0).toUpperCase() + x.area.slice(1)));
          if (x.status === 'info') {
            var len = state.hUnit === 'ft' ? (Math.round(x.value / CM_PER_IN * 10) / 10) + ' in' : x.value + ' cm';
            row.appendChild(el('span', 'ccf-sf-muted', 'Garment length ' + len));
          } else {
            row.appendChild(el('span', x.status === 'right' ? 'ccf-sf-ok' : 'ccf-sf-warn', REASON_TEXT[x.status] || ''));
          }
          box.appendChild(row);
        });
        var available = !sizeValues.length || sizeValues.some(function (v) { return v.toLowerCase() === String(r.size).toLowerCase(); });
        if (!available) box.appendChild(el('p', 'ccf-sf-note', 'This product doesn’t come in ' + r.size + '. Check the size chart for the closest size.'));
        if (r.saved) box.appendChild(el('p', 'ccf-sf-note', 'Saved — we’ll remember ' + r.size + ' for next time.'));
        body.appendChild(box);

        var chartBtn = el('button', 'ccf-sf-link', state.showChart ? 'Hide size chart' : 'View size chart');
        chartBtn.type = 'button';
        chartBtn.addEventListener('click', function () { state.showChart = !state.showChart; draw(); });
        body.appendChild(chartBtn);
        if (state.showChart) body.appendChild(chartTable(state.gender));
        body.appendChild(actions(
          function () { state.step = 1; state.result = null; draw(); },
          available ? 'Select size ' + r.size : 'Close',
          function () {
            if (available) {
              var ok = selectSizeOnPage(sizeOption, r.size);
              state.error = ok ? '' : 'Choose ' + r.size + ' from the sizes above.';
              if (ok) {
                close();
                setOpenLabel(r.size);
                var a = readJSON(STORE_KEY) || {};
                a.size = r.size;
                writeJSON(STORE_KEY, a);
              }
              else draw();
            } else {
              close();
            }
          }
        ));
        body.appendChild(el('p', 'ccf-sf-note', 'A guide based on your answers and this store’s size chart.'));
      }

      if (state.error) {
        var err = el('p', 'ccf-sf-err', state.error);
        err.setAttribute('role', 'alert');
        body.appendChild(err);
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
