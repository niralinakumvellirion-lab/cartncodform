/* ccf-reviews.js - Product reviews block, ShopiReachBoost AI.
   CSS lives in assets/ccf-reviews.css (classes .ccf-rv-* for the page, .ccf-rvm-* for the pop-up pages).
   Review text is only ever put on the page with textContent, never innerHTML. */
(function () {
  'use strict';

  var ENDPOINT = '/apps/cartncodform/reviews';
  var TYPE_MIME = { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  var MAX_SIDE = 1600;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var RATING_WORDS = ['Select a rating', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  var REASONS = {
    NOT_VERIFIED_BUYER: 'Only customers who bought this product can write a review.',
    ALREADY_REVIEWED: 'Thank you, you have already reviewed this product.'
  };
  // Which step shows an error the server reported for a field.
  var FIELD_STEP = { rating: 'rating', title: 'story', body: 'story', name: 'you', email: 'you', photos: 'photos' };
  var STAR_PATH = 'M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96z';

  // ── icons (built with createElementNS, no HTML strings) ─────────────────────

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ICONS = {
    edit: [['path', { d: 'M12 20h9' }], ['path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z' }]],
    x: [['path', { d: 'M18 6 6 18M6 6l12 12' }]],
    left: [['path', { d: 'M19 12H5M12 19l-7-7 7-7' }]],
    plus: [['path', { d: 'M12 5v14M5 12h14' }]],
    verified: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M8.5 12.5l2.5 2.5 4.5-5' }]],
    thumb: [['path', { d: 'M7 10v11' }], ['path', { d: 'M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.5l-2.3 7A2 2 0 0 1 17.5 21H7V10l4-8a3 3 0 0 1 3 3.9Z' }]]
  };

  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) { if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, String(attrs[k])); }
    return n;
  }

  function icon(name, size) {
    var svg = svgEl('svg', { viewBox: '0 0 24 24', width: size || 18, height: size || 18, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' });
    (ICONS[name] || []).forEach(function (part) { svg.appendChild(svgEl(part[0], part[1])); });
    return svg;
  }

  function starIcon(size, on) {
    var svg = svgEl('svg', { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true', focusable: 'false', 'class': 'ccf-rv-staricon' + (on ? ' on' : '') });
    svg.appendChild(svgEl('path', { d: STAR_PATH, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
    return svg;
  }

  // A row of five vector stars, read out as "4 out of 5 stars".
  function starRow(n, size, cls) {
    var row = el('span', 'ccf-rv-stars' + (cls ? ' ' + cls : ''));
    row.setAttribute('role', 'img');
    row.setAttribute('aria-label', n + ' out of 5 stars');
    for (var i = 1; i <= 5; i++) row.appendChild(starIcon(size, i <= Math.round(n)));
    return row;
  }

  // ── small helpers ──────────────────────────────────────────────────────────

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function button(cls, text) {
    var b = el('button', cls, text);
    b.type = 'button';
    return b;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function formatDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return d.toDateString(); }
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
  }

  function avatarEl(name, cls) {
    var a = el('span', cls || 'ccf-rv-ava', initials(name));
    a.setAttribute('aria-hidden', 'true');
    return a;
  }

  function readJson(res) {
    return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, body: body }; });
  }

  function request(method, path, payload) {
    var opts = { method: method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (payload !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(payload);
    }
    return fetch(ENDPOINT + path, opts).then(readJson);
  }

  // localStorage is optional: a blocked or full store just means votes are not remembered.
  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) { /* ignore */ }
    return null;
  }

  function visitorId() {
    var id = store('ccf_rv_visitor');
    if (!id) {
      id = 'v' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      store('ccf_rv_visitor', id);
    }
    return id;
  }

  function votedIds() {
    try { return JSON.parse(store('ccf_rv_voted') || '[]') || []; } catch (e) { return []; }
  }

  function rememberVote(id) {
    var list = votedIds();
    if (list.indexOf(id) === -1) list.push(id);
    store('ccf_rv_voted', JSON.stringify(list.slice(-200)));
  }

  // Brightness (0 dark .. 1 light) of a #rgb / #rrggbb / rgb() colour, or null when it cannot be read.
  function luminance(color) {
    var c = String(color || '').trim();
    var r, g, b, m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(c))) {
      r = parseInt(m[1].charAt(0) + m[1].charAt(0), 16); g = parseInt(m[1].charAt(1) + m[1].charAt(1), 16); b = parseInt(m[1].charAt(2) + m[1].charAt(2), 16);
    } else if ((m = /^#([0-9a-f]{6})$/i.exec(c))) {
      r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16);
    } else if ((m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(c))) {
      r = +m[1]; g = +m[2]; b = +m[3];
    } else {
      return null;
    }
    function lin(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  // Text colour that stays readable on the brand colour.
  function textOn(accent) {
    var l = luminance(accent);
    return l !== null && l > 0.45 ? '#141414' : '#ffffff';
  }

  // The page part sits on the theme's background. On a dark theme a near-black button or star colour (the
  // default) would vanish, so there it uses the theme's own text colour. The white pop-up keeps the chosen
  // colours, remembered here before any change.
  function adaptToTheme(root) {
    var cs = window.getComputedStyle(root);
    var accent = (cs.getPropertyValue('--ccf-rv-accent') || '').trim();
    var star = (cs.getPropertyValue('--ccf-rv-star') || '').trim();
    if (accent) root.setAttribute('data-ccf-accent', accent);
    if (star) root.setAttribute('data-ccf-star', star);
    var text = cs.color;
    var textLum = luminance(text);
    var used = accent;
    if (textLum !== null && textLum > 0.5) {
      var accentLum = luminance(accent);
      var starLum = luminance(star);
      if (accentLum !== null && accentLum < 0.2) { root.style.setProperty('--ccf-rv-accent', text); used = text; }
      if (starLum !== null && starLum < 0.2) root.style.setProperty('--ccf-rv-star', text);
    }
    root.style.setProperty('--ccf-rv-accent-fg', textOn(used));
  }

  // ── photos: read, shrink, check ────────────────────────────────────────────

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result)); };
      fr.onerror = function () { reject(new Error('read')); };
      fr.readAsDataURL(file);
    });
  }

  // Big photos are scaled down in the browser so the upload stays small and quick.
  function prepareImage(file) {
    if (file.type === 'image/gif') return readAsDataUrl(file);
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        if ((w <= MAX_SIDE && h <= MAX_SIDE) && file.size <= 1.5 * 1024 * 1024) { readAsDataUrl(file).then(resolve, reject); return; }
        var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        var ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) { readAsDataUrl(file).then(resolve, reject); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var out = canvas.toDataURL(file.type, 0.85);
        if (out.indexOf('data:' + file.type) === 0) resolve(out); else readAsDataUrl(file).then(resolve, reject);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('read')); };
      img.src = url;
    });
  }

  function dataUrlBytes(dataUrl) {
    var i = dataUrl.indexOf(',');
    var b64 = i === -1 ? '' : dataUrl.slice(i + 1);
    var pad = (b64.match(/=+$/) || [''])[0].length;
    return Math.floor(b64.length * 3 / 4) - pad;
  }

  function typeList(types) {
    var names = types.map(function (t) { return t.toUpperCase(); });
    return names.length > 1 ? names.slice(0, -1).join(', ') + ' or ' + names[names.length - 1] : names.join('');
  }

  // ── pop-up layers shared by the write-a-review pages and the photo viewer ───

  var scrollLocks = 0;
  var savedOverflow = '';

  function lockScroll() {
    if (scrollLocks === 0) {
      savedOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
    }
    scrollLocks++;
  }

  function unlockScroll() {
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) document.documentElement.style.overflow = savedOverflow;
  }

  function focusables(container) {
    return Array.prototype.slice.call(container.querySelectorAll('button, a[href], input, textarea, select, [tabindex]'))
      .filter(function (n) { return !n.disabled && n.getAttribute('tabindex') !== '-1' && !n.hidden && n.style.visibility !== 'hidden' && n.type !== 'file'; });
  }

  // Creates the overlay on <body> (a theme container cannot squeeze it), locks page scroll,
  // keeps Tab inside and closes on Escape.
  function openLayer(root, label, onClose) {
    var layer = el('div', 'ccf-rvm');
    // The pop-up is white: use the colours as chosen, not the dark-theme swap made for the page.
    var vars = window.getComputedStyle(root);
    var accent = root.getAttribute('data-ccf-accent') || (vars.getPropertyValue('--ccf-rv-accent') || '').trim();
    var star = root.getAttribute('data-ccf-star') || (vars.getPropertyValue('--ccf-rv-star') || '').trim();
    if (accent) layer.style.setProperty('--ccf-rv-accent', accent);
    if (star) layer.style.setProperty('--ccf-rv-star', star);
    layer.style.setProperty('--ccf-rv-accent-fg', textOn(accent));
    var backdrop = el('div', 'ccf-rvm-backdrop');
    var dialog = el('div', 'ccf-rvm-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', label);
    layer.appendChild(backdrop);
    layer.appendChild(dialog);
    document.body.appendChild(layer);
    lockScroll();

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      layer.classList.add('ccf-rvm-out');
      setTimeout(function () {
        if (layer.parentNode) layer.parentNode.removeChild(layer);
        unlockScroll();
      }, 200);
      if (onClose) onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var list = focusables(dialog);
      if (!list.length) return;
      var first = list[0];
      var last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('click', close);
    return { layer: layer, dialog: dialog, close: close };
  }

  function openLightbox(root, url, alt, opener) {
    var l = openLayer(root, 'Photo', function () { if (opener && opener.focus) opener.focus(); });
    l.layer.className += ' ccf-rvm-lightbox';
    var x = button('ccf-rvm-x');
    x.setAttribute('aria-label', 'Close photo');
    x.appendChild(icon('x', 18));
    x.addEventListener('click', l.close);
    var img = el('img', 'ccf-rvm-bigphoto');
    img.src = url;
    img.alt = alt || 'Customer photo';
    l.dialog.appendChild(x);
    l.dialog.appendChild(img);
    x.focus();
  }

  // ── one reviews block ──────────────────────────────────────────────────────

  function init(root) {
    if (root.getAttribute('data-ccf-ready')) return;
    root.setAttribute('data-ccf-ready', '1');
    adaptToTheme(root);

    var productId = root.getAttribute('data-product-id');
    var handle = root.getAttribute('data-product-handle') || '';
    var productTitle = root.getAttribute('data-product-title') || '';
    var productImage = root.getAttribute('data-product-image') || '';
    var heading = root.getAttribute('data-heading') || 'What customers are saying';
    var eyebrow = root.getAttribute('data-eyebrow') || 'Customer reviews';

    var data = null;
    var items = [];
    var page = 1;
    var filter = { rating: '', photos: false };
    var sort = 'recent';
    var loading = false;
    // What the customer has typed so far. Kept while the pages are closed and re-opened.
    var draft = { rating: 0, title: '', body: '', name: '', email: '', photos: [] };

    clear(root);

    // Narrow layout follows the block's own width (a narrow theme column), not just the screen.
    function markWidth() { root.classList.toggle('ccf-rv--narrow', root.clientWidth > 0 && root.clientWidth < 720); }
    markWidth();
    if (typeof window.ResizeObserver === 'function') {
      try { new window.ResizeObserver(markWidth).observe(root); } catch (e) { /* the media query still covers phones */ }
    }

    // Some themes put the block in a container that is only as wide as its content, which leaves the
    // section narrow and to the left. Where the page has room, ask for the full width; if the container
    // does not grow (a genuinely narrow column), take the request back.
    function widen() {
      root.style.minWidth = '';
      var par = root.parentElement;
      if (!par) return;
      var vw = document.documentElement.clientWidth;
      // Take the page width, the same room on both sides so the section is centred on the page; the inner
      // wrapper keeps the content centred at its maximum width.
      var left = Math.max(0, root.getBoundingClientRect().left);
      var want = Math.floor(vw - 2 * left);
      if (want < 400 || root.getBoundingClientRect().width >= want - 1) return;
      root.style.minWidth = want + 'px';
      var fits = par.getBoundingClientRect().width >= want - 1 && root.getBoundingClientRect().right <= vw + 1;
      if (!fits) root.style.minWidth = '';
    }

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { widen(); markWidth(); }, 150);
    });

    // Page layout: header (title + write button), summary, toolbar, list, footer.
    var inner = el('div', 'ccf-rv-inner');
    var headEl = el('header', 'ccf-rv-head');
    var titles = el('div', 'ccf-rv-titles');
    if (eyebrow.trim().toLowerCase() !== heading.trim().toLowerCase()) titles.appendChild(el('p', 'ccf-rv-eyebrow', eyebrow));
    titles.appendChild(el('h2', 'ccf-rv-h', heading));
    var ctaEl = el('div', 'ccf-rv-cta');
    headEl.appendChild(titles);
    headEl.appendChild(ctaEl);
    var summaryEl = el('section', 'ccf-rv-summary');
    summaryEl.setAttribute('aria-label', 'Rating summary');
    var toolbarEl = el('div', 'ccf-rv-toolbar');
    var noteEl = el('div');
    var listEl = el('div', 'ccf-rv-list');
    var footEl = el('div', 'ccf-rv-foot');
    inner.appendChild(headEl);
    inner.appendChild(summaryEl);
    inner.appendChild(toolbarEl);
    inner.appendChild(noteEl);
    inner.appendChild(listEl);
    inner.appendChild(footEl);
    root.appendChild(inner);

    function setNote(text, kind) {
      clear(noteEl);
      if (!text) return;
      var n = el('div', 'ccf-rv-note' + (kind ? ' ccf-rv-' + kind : ''), text);
      n.setAttribute('role', kind === 'err' ? 'alert' : 'status');
      noteEl.appendChild(n);
    }

    function isActive(rating, photos) { return filter.rating === rating && filter.photos === photos; }

    function setFilter(rating, photos) {
      filter = { rating: rating, photos: photos };
      load(true);
    }

    // ── header: write button ──
    function renderHead() {
      clear(ctaEl);
      var f = data.form;
      if (f.canReview) {
        var btn = button('ccf-rv-btn ccf-rv-btn--write');
        btn.appendChild(icon('edit', 18));
        btn.appendChild(el('span', null, 'Write a review'));
        btn.addEventListener('click', function () { openWizard(btn); });
        ctaEl.appendChild(btn);
      } else if (f.reason === 'LOGIN_REQUIRED') {
        var a = el('a', 'ccf-rv-btn ccf-rv-btn--write');
        a.href = '/account/login?return_url=' + encodeURIComponent(window.location.pathname);
        a.appendChild(el('span', null, 'Log in to write a review'));
        ctaEl.appendChild(a);
      } else if (REASONS[f.reason]) {
        ctaEl.appendChild(el('p', 'ccf-rv-reason', REASONS[f.reason]));
      }
    }

    // ── summary: average, star bars, customer photos ──
    function renderSummary() {
      clear(summaryEl);
      var f = data.form;
      var s = data.summary;
      summaryEl.hidden = !s.count;
      if (!s.count) return;

      var score = el('div', 'ccf-rv-score');
      if (f.starRating && s.rated > 0) {
        var big = el('div', 'ccf-rv-scoreline');
        big.appendChild(el('span', 'ccf-rv-avg', String(s.average)));
        big.appendChild(el('span', 'ccf-rv-muted', 'out of 5'));
        score.appendChild(big);
        score.appendChild(starRow(s.average, 20, 'ccf-rv-sumstars'));
      }
      score.appendChild(el('p', 'ccf-rv-muted ccf-rv-based', 'Based on ' + plural(s.count, 'review', 'reviews')));
      summaryEl.appendChild(score);

      if (f.starRating && s.rated > 0) {
        var bars = el('div', 'ccf-rv-bars');
        for (var star = 5; star >= 1; star--) {
          (function (n) {
            var count = s.distribution[n] || 0;
            var on = isActive(String(n), false);
            var b = button('ccf-rv-bar' + (on ? ' on' : ''));
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.setAttribute('aria-label', plural(n, 'star', 'stars') + ': ' + plural(count, 'review', 'reviews'));
            b.appendChild(el('span', null, plural(n, 'star', 'stars')));
            var track = el('span', 'ccf-rv-bar-track');
            var fill = el('span', 'ccf-rv-bar-fill');
            fill.style.width = (s.rated ? Math.round(count * 100 / s.rated) : 0) + '%';
            track.appendChild(fill);
            b.appendChild(track);
            b.appendChild(el('span', 'ccf-rv-muted', String(count)));
            b.addEventListener('click', function () { setFilter(on ? '' : String(n), false); });
            bars.appendChild(b);
          })(star);
        }
        summaryEl.appendChild(bars);
      }

      var gallery = s.gallery || [];
      if (gallery.length) {
        var g = el('div', 'ccf-rv-gallery');
        g.appendChild(el('p', 'ccf-rv-gtitle', 'Photos from customers'));
        var grid = el('div', 'ccf-rv-ggrid');
        var shown = gallery.slice(0, 4);
        var extra = Math.max(0, gallery.length - 4);
        shown.forEach(function (url, i) {
          var t = button('ccf-rv-gtile');
          var img = el('img');
          img.src = url; img.alt = ''; img.loading = 'lazy';
          t.appendChild(img);
          if (i === 3 && extra > 0) {
            t.appendChild(el('span', 'ccf-rv-gmore', '+' + extra));
            t.setAttribute('aria-label', 'Show reviews with photos');
            t.addEventListener('click', function () { setFilter('', true); });
          } else {
            t.setAttribute('aria-label', 'Open customer photo');
            t.addEventListener('click', function () { openLightbox(root, url, 'Customer photo', t); });
          }
          grid.appendChild(t);
        });
        g.appendChild(grid);
        var all = button('ccf-rv-link', 'See all ' + plural(s.photoCount || gallery.length, 'review', 'reviews') + ' with photos');
        all.addEventListener('click', function () { setFilter('', true); });
        g.appendChild(all);
        summaryEl.appendChild(g);
      }
    }

    // ── toolbar: filter chips + sort ──
    function renderToolbar() {
      clear(toolbarEl);
      var f = data.form;
      var s = data.summary;
      toolbarEl.hidden = !s.count;
      if (!s.count) return;
      var chips = el('div', 'ccf-rv-chips');
      chips.setAttribute('role', 'group');
      chips.setAttribute('aria-label', 'Filter reviews');
      var defs = [{ label: 'All reviews', count: s.count, rating: '', photos: false }];
      if (s.photoCount > 0) defs.push({ label: 'With photos', count: s.photoCount, rating: '', photos: true });
      if (f.starRating && s.rated > 0) {
        var d = s.distribution || {};
        defs.push({ label: '5 stars', count: d[5] || 0, rating: '5', photos: false });
        defs.push({ label: '4 stars', count: d[4] || 0, rating: '4', photos: false });
        defs.push({ label: '3 stars and below', count: (d[3] || 0) + (d[2] || 0) + (d[1] || 0), rating: 'low', photos: false });
      }
      defs.forEach(function (c) {
        if (c.count === 0 && (c.rating || c.photos)) return;
        var on = isActive(c.rating, c.photos);
        var b = button('ccf-rv-chip' + (on ? ' on' : ''));
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.appendChild(el('span', null, c.label));
        b.appendChild(el('span', 'ccf-rv-chipcount', String(c.count)));
        b.addEventListener('click', function () { setFilter(c.rating, c.photos); });
        chips.appendChild(b);
      });
      toolbarEl.appendChild(chips);

      var label = el('label', 'ccf-rv-sortlabel', 'Sort by');
      var sel = el('select', 'ccf-rv-sort');
      [['recent', 'Most recent'], ['helpful', 'Most helpful'], ['highest', 'Highest rated'], ['lowest', 'Lowest rated']].forEach(function (o) {
        if (!f.starRating && (o[0] === 'highest' || o[0] === 'lowest')) return;
        if (!f.helpfulVotes && o[0] === 'helpful') return;
        var opt = el('option', null, o[1]);
        opt.value = o[0];
        sel.appendChild(opt);
      });
      sel.value = sort;
      sel.addEventListener('change', function () { sort = sel.value; load(true); });
      label.appendChild(sel);
      toolbarEl.appendChild(label);
    }

    // ── review rows ──
    function reviewRow(r, voted) {
      var item = el('article', 'ccf-rv-item');
      var meta = el('div', 'ccf-rv-meta');
      meta.appendChild(avatarEl(r.name));
      var who = el('div', 'ccf-rv-who');
      who.appendChild(el('span', 'ccf-rv-name', r.name));
      if (r.verified) {
        var badge = el('span', 'ccf-rv-badge');
        badge.appendChild(icon('verified', 14));
        badge.appendChild(document.createTextNode('Verified buyer'));
        who.appendChild(badge);
      }
      meta.appendChild(who);
      item.appendChild(meta);

      var main = el('div', 'ccf-rv-main');
      var line = el('div', 'ccf-rv-line');
      if (typeof r.rating === 'number') line.appendChild(starRow(r.rating, 16));
      line.appendChild(el('span', 'ccf-rv-date', formatDate(r.createdAt)));
      main.appendChild(line);
      if (r.title) main.appendChild(el('h3', 'ccf-rv-title', r.title));
      main.appendChild(el('p', 'ccf-rv-body', r.body));
      if (r.photos && r.photos.length) {
        var ph = el('div', 'ccf-rv-photos');
        r.photos.forEach(function (url) {
          var b = button('ccf-rv-photo');
          b.setAttribute('aria-label', 'View photo from ' + r.name);
          var img = el('img');
          img.src = url; img.alt = 'Photo from ' + r.name; img.loading = 'lazy';
          b.appendChild(img);
          b.addEventListener('click', function () { openLightbox(root, url, 'Photo from ' + r.name, b); });
          ph.appendChild(b);
        });
        main.appendChild(ph);
      }
      if (r.helpful !== null && r.helpful !== undefined) main.appendChild(helpfulRow(r, voted));
      item.appendChild(main);
      return item;
    }

    function helpfulRow(r, already) {
      var row = el('div', 'ccf-rv-helpful');
      row.appendChild(el('span', null, 'Was this helpful?'));
      var b = button('ccf-rv-help' + (already ? ' on' : ''));
      b.appendChild(icon('thumb', 15));
      var label = el('span', null, 'Yes (' + r.helpful + ')');
      b.appendChild(label);
      b.setAttribute('aria-pressed', already ? 'true' : 'false');
      if (already) b.disabled = true;
      b.addEventListener('click', function () {
        b.disabled = true;
        request('POST', '/' + encodeURIComponent(r.id) + '/helpful', { visitorId: visitorId() }).then(function (res) {
          if (res.body && res.body.ok) {
            rememberVote(r.id);
            label.textContent = 'Yes (' + res.body.helpful + ')';
            b.setAttribute('aria-pressed', 'true');
            b.classList.add('on');
          } else {
            b.disabled = false;
          }
        }).catch(function () { b.disabled = false; });
      });
      row.appendChild(b);
      return row;
    }

    function renderList(appended) {
      var voted = votedIds();
      if (!appended) clear(listEl);
      var s = data.summary;
      if (!s.count) {
        var empty = el('div', 'ccf-rv-empty');
        empty.appendChild(el('p', 'ccf-rv-empty-t', 'No reviews yet'));
        empty.appendChild(el('p', 'ccf-rv-muted', data.form.canReview ? 'Be the first to share your thoughts.' : 'Reviews will appear here.'));
        listEl.appendChild(empty);
        return;
      }
      if (!items.length) {
        var none = el('div', 'ccf-rv-none');
        none.appendChild(el('span', null, 'No reviews match this filter. '));
        var reset = button('ccf-rv-link', 'Show all reviews');
        reset.addEventListener('click', function () { setFilter('', false); });
        none.appendChild(reset);
        listEl.appendChild(none);
        return;
      }
      (appended || items).forEach(function (r) { listEl.appendChild(reviewRow(r, voted.indexOf(r.id) !== -1)); });
    }

    function renderFoot() {
      clear(footEl);
      if (!data.summary.count || !items.length) return;
      footEl.appendChild(el('p', 'ccf-rv-muted', 'Showing ' + items.length + ' of ' + plural(data.filtered, 'review', 'reviews')));
      if (page < data.pages) {
        var more = button('ccf-rv-btn ccf-rv-btn--ghost ccf-rv-more', 'Load more reviews');
        more.addEventListener('click', function () { if (!loading) load(false); });
        footEl.appendChild(more);
      }
    }

    function query(toPage) {
      var q = '?productId=' + encodeURIComponent(productId) + '&page=' + toPage;
      if (filter.rating) q += '&rating=' + encodeURIComponent(filter.rating);
      if (filter.photos) q += '&photos=1';
      if (sort !== 'recent') q += '&sort=' + encodeURIComponent(sort);
      return q;
    }

    // reset: first page for the current filter and sort; otherwise the next page is added below.
    function load(reset) {
      var toPage = reset ? 1 : page + 1;
      loading = true;
      return request('GET', query(toPage)).then(function (res) {
        loading = false;
        if (!res.body || !res.body.ok) throw new Error('load');
        data = res.body;
        if (data.filtered === undefined) data.filtered = data.summary.count;
        page = data.page;
        if (reset) {
          items = data.reviews.slice();
          setNote('');
          renderHead();
          renderSummary();
          renderToolbar();
          renderList();
        } else {
          items = items.concat(data.reviews);
          renderList(data.reviews);
        }
        renderFoot();
        widen();
        markWidth();
      }).catch(function () {
        loading = false;
        if (!data) { clear(ctaEl); setNote('Reviews could not be loaded right now.', 'err'); }
        else setNote('Could not load more reviews. Please try again.', 'err');
      });
    }

    // ── the write-a-review pages: one question at a time ──────────────────────
    function openWizard(opener) {
      var f = data.form;
      var steps = [];
      if (f.starRating) steps.push({ key: 'rating', name: 'Rating' });
      steps.push({ key: 'story', name: 'Your review' });
      if (f.photos) steps.push({ key: 'photos', name: 'Photos' });
      steps.push({ key: 'you', name: 'About you' });
      steps.push({ key: 'submit', name: 'Check and submit' });

      var index = 0;
      var sending = false;
      var finished = false;
      var thumbsEl = null;
      var errEl = null;
      var layer = openLayer(root, 'Write a review', function () {
        // After a sent review the list is reloaded and the old button is gone: use the new one.
        var target = opener && document.body.contains(opener) ? opener : root.querySelector('.ccf-rv-btn--write');
        if (target && target.focus) target.focus();
      });
      var dialog = layer.dialog;

      var top = el('div', 'ccf-rvm-top');
      top.appendChild(el('span', 'ccf-rvm-grab'));
      var prod = el('div', 'ccf-rvm-product');
      var thumb = el('span', 'ccf-rvm-pthumb');
      thumb.setAttribute('aria-hidden', 'true');
      if (productImage) { var pimg = el('img'); pimg.src = productImage; pimg.alt = ''; thumb.appendChild(pimg); }
      prod.appendChild(thumb);
      var ptext = el('div', 'ccf-rvm-ptext');
      ptext.appendChild(el('span', 'ccf-rvm-pkicker', 'Write a review'));
      ptext.appendChild(el('span', 'ccf-rvm-pname', productTitle || 'This product'));
      prod.appendChild(ptext);
      var closeBtn = button('ccf-rvm-x');
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.appendChild(icon('x', 18));
      closeBtn.addEventListener('click', layer.close);
      prod.appendChild(closeBtn);
      top.appendChild(prod);

      var progress = el('div', 'ccf-rvm-progress');
      var segs = el('div', 'ccf-rvm-segs');
      var segEls = steps.map(function () { var sg = el('span', 'ccf-rvm-seg'); segs.appendChild(sg); return sg; });
      var stepCount = el('p', 'ccf-rvm-count');
      progress.appendChild(segs);
      progress.appendChild(stepCount);

      var stage = el('div', 'ccf-rvm-stage');
      var foot = el('div', 'ccf-rvm-foot');
      var backBtn = button('ccf-rv-btn ccf-rv-btn--ghost ccf-rvm-back');
      backBtn.appendChild(icon('left', 16));
      backBtn.appendChild(el('span', null, 'Back'));
      var right = el('div', 'ccf-rvm-right');
      var skipBtn = button('ccf-rvm-skip', 'Skip');
      var nextBtn = button('ccf-rv-btn ccf-rvm-next');
      right.appendChild(skipBtn);
      right.appendChild(nextBtn);
      foot.appendChild(backBtn);
      foot.appendChild(right);

      dialog.appendChild(top);
      dialog.appendChild(progress);
      dialog.appendChild(stage);
      dialog.appendChild(foot);

      function showErr(text) {
        if (!errEl) return;
        clear(errEl);
        if (!text) return;
        errEl.appendChild(el('p', 'ccf-rvm-errmsg', text));
      }

      function heading(title, sub) {
        var h = el('div', 'ccf-rvm-heading');
        var t = el('h3', 'ccf-rvm-title', title);
        t.tabIndex = -1;
        h.appendChild(t);
        h.appendChild(el('p', 'ccf-rvm-sub', sub));
        return h;
      }

      function field(labelText, optional, control, id) {
        var label = el('label', 'ccf-rvm-label');
        label.htmlFor = id;
        label.appendChild(document.createTextNode(labelText));
        if (optional) label.appendChild(el('span', 'ccf-rvm-optional', 'Optional'));
        var wrap = el('div', 'ccf-rvm-field');
        wrap.appendChild(label);
        wrap.appendChild(control);
        return wrap;
      }

      function input(type, id, value, placeholder, max) {
        var i = el('input', 'ccf-rvm-in');
        i.type = type; i.id = id; i.value = value; i.placeholder = placeholder; i.maxLength = max;
        return i;
      }

      // step: rating
      function buildRating(box) {
        box.className += ' ccf-rvm-center';
        box.appendChild(heading('How would you rate it?', 'Your overall impression of the product.'));
        var row = el('div', 'ccf-rvm-stars');
        row.setAttribute('role', 'radiogroup');
        row.setAttribute('aria-label', 'Your rating');
        var word = el('p', 'ccf-rvm-ratelabel');
        var buttons = [];
        function paint(n) {
          buttons.forEach(function (b, i) {
            b.classList.toggle('on', i < n);
            b.setAttribute('aria-checked', i + 1 === draft.rating ? 'true' : 'false');
          });
          word.textContent = RATING_WORDS[n];
          word.classList.toggle('set', !!n);
        }
        function choose(v) { draft.rating = v; paint(v); showErr(''); }
        for (var i = 1; i <= 5; i++) {
          (function (value) {
            var b = button('ccf-rvm-star');
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-label', plural(value, 'star', 'stars'));
            b.appendChild(starIcon(44, false));
            b.addEventListener('click', function () { choose(value); });
            b.addEventListener('mouseenter', function () { paint(value); });
            b.addEventListener('keydown', function (e) {
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); var n = Math.min(5, (draft.rating || 0) + 1); choose(n); buttons[n - 1].focus(); }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); var m = Math.max(1, (draft.rating || 2) - 1); choose(m); buttons[m - 1].focus(); }
            });
            buttons.push(b);
            row.appendChild(b);
          })(i);
        }
        row.addEventListener('mouseleave', function () { paint(draft.rating); });
        box.appendChild(row);
        box.appendChild(word);
        paint(draft.rating);
      }

      // step: review text
      function buildStory(box) {
        box.appendChild(heading('Tell us about it', 'What did you like, and what could be better?'));
        var title = input('text', 'ccf-rv-title', draft.title, 'Beautiful fabric and a perfect fit', 120);
        var body = el('textarea', 'ccf-rvm-in ccf-rvm-area');
        body.id = 'ccf-rv-body'; body.rows = 5; body.maxLength = 2000; body.value = draft.body;
        body.placeholder = 'Quality, fit, colour, delivery…';
        var counter = el('p', 'ccf-rvm-counter');
        function count() { counter.textContent = body.value.length + ' / 2000'; counter.classList.toggle('ok', body.value.trim().length >= 10); }
        title.addEventListener('input', function () { draft.title = title.value; });
        title.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); body.focus(); } });
        body.addEventListener('input', function () { draft.body = body.value; count(); showErr(''); });
        count();
        box.appendChild(field('Headline', true, title, 'ccf-rv-title'));
        box.appendChild(field('Your review', false, body, 'ccf-rv-body'));
        box.appendChild(counter);
      }

      // step: photos
      var mimes = f.photos ? f.photos.allowedTypes.map(function (t) { return TYPE_MIME[t]; }).filter(Boolean) : [];
      var fileIn = null;

      function renderThumbs() {
        if (!thumbsEl || !document.body.contains(thumbsEl)) return;
        clear(thumbsEl);
        var limit = f.photos.maxPhotos;
        draft.photos.forEach(function (p) {
          var t = el('div', 'ccf-rvm-thumb' + (p.busy ? ' busy' : ''));
          if (p.preview) { var img = el('img'); img.src = p.preview; img.alt = 'Selected photo'; t.appendChild(img); }
          if (p.busy) t.appendChild(el('span', 'ccf-rvm-spin'));
          var x = button('ccf-rvm-thumbx');
          x.setAttribute('aria-label', 'Remove photo');
          x.appendChild(icon('x', 14));
          x.addEventListener('click', function () { draft.photos = draft.photos.filter(function (q) { return q !== p; }); renderThumbs(); });
          t.appendChild(x);
          thumbsEl.appendChild(t);
        });
        var tiles = draft.photos.length;
        if (draft.photos.length < limit) {
          var add = button('ccf-rvm-add');
          add.appendChild(icon('plus', 22));
          add.appendChild(el('span', null, 'Add photo'));
          add.addEventListener('click', function () { if (fileIn) fileIn.click(); });
          thumbsEl.appendChild(add);
          tiles++;
        }
        while (tiles < 3 || tiles % 3 !== 0) {
          var empty = el('span', 'ccf-rvm-empty');
          empty.setAttribute('aria-hidden', 'true');
          thumbsEl.appendChild(empty);
          tiles++;
        }
      }

      function addPhoto(file) {
        var limits = f.photos;
        if (draft.photos.length >= limits.maxPhotos) { showErr('You can add up to ' + plural(limits.maxPhotos, 'photo', 'photos') + '.'); return; }
        if (mimes.indexOf(file.type) === -1) { showErr('Only ' + typeList(limits.allowedTypes) + ' photos are allowed.'); return; }
        showErr('');
        var entry = { url: '', preview: '', busy: true };
        draft.photos.push(entry);
        renderThumbs();
        prepareImage(file).then(function (dataUrl) {
          if (dataUrlBytes(dataUrl) > limits.maxFileSizeMb * 1024 * 1024) throw new Error('size');
          entry.preview = dataUrl;
          renderThumbs();
          return request('POST', '/photo', { dataUrl: dataUrl });
        }).then(function (res) {
          if (!res.body || !res.body.ok) { var e = new Error('upload'); e.userMessage = res.body && res.body.message; throw e; }
          entry.url = res.body.url;
          entry.busy = false;
          renderThumbs();
        }).catch(function (err) {
          draft.photos = draft.photos.filter(function (q) { return q !== entry; });
          renderThumbs();
          showErr(err.message === 'size' ? 'Each photo must be under ' + limits.maxFileSizeMb + ' MB.' : (err.userMessage || 'That photo could not be added. Try another one.'));
        });
      }

      function buildPhotos(box) {
        var limits = f.photos;
        box.appendChild(heading('Add photos', 'Optional. Shoppers trust reviews with photos more.'));
        fileIn = el('input', 'ccf-rvm-file');
        fileIn.type = 'file'; fileIn.id = 'ccf-rv-photos'; fileIn.multiple = limits.maxPhotos > 1; fileIn.accept = mimes.join(',');
        fileIn.tabIndex = -1;
        fileIn.setAttribute('aria-hidden', 'true');
        function take(files) { Array.prototype.slice.call(files || []).forEach(addPhoto); }
        fileIn.addEventListener('change', function () { var files = fileIn.files; take(files); fileIn.value = ''; });
        thumbsEl = el('div', 'ccf-rvm-tiles');
        thumbsEl.addEventListener('dragover', function (e) { e.preventDefault(); thumbsEl.classList.add('over'); });
        thumbsEl.addEventListener('dragleave', function () { thumbsEl.classList.remove('over'); });
        thumbsEl.addEventListener('drop', function (e) { e.preventDefault(); thumbsEl.classList.remove('over'); take(e.dataTransfer && e.dataTransfer.files); });
        box.appendChild(fileIn);
        box.appendChild(thumbsEl);
        box.appendChild(el('p', 'ccf-rvm-hint', typeList(limits.allowedTypes) + ' · up to ' + plural(limits.maxPhotos, 'photo', 'photos') + ' · ' + limits.maxFileSizeMb + ' MB each'));
      }

      // step: about you
      function buildYou(box) {
        box.appendChild(heading('About you', 'Your name is shown with your review.'));
        var name = input('text', 'ccf-rv-name', draft.name, 'Asha Patel', 60);
        name.autocomplete = 'name';
        name.addEventListener('input', function () { draft.name = name.value; showErr(''); });
        name.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); goNext(); } });
        box.appendChild(field('Name', false, name, 'ccf-rv-name'));
        if (f.needsEmail) {
          var email = input('email', 'ccf-rv-email', draft.email, 'asha@example.com', 254);
          email.autocomplete = 'email';
          email.addEventListener('input', function () { draft.email = email.value; showErr(''); });
          email.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); goNext(); } });
          box.appendChild(field('Email', !f.emailRequired, email, 'ccf-rv-email'));
          box.appendChild(el('p', 'ccf-rvm-hint', f.emailRequired
            ? 'Use the email from your order. It is never shown.'
            : 'Never shown. Use the email from your order to get the Verified buyer badge.'));
        }
      }

      // step: check and submit
      function buildSubmit(box) {
        box.appendChild(heading('Check your review', 'This is how it will appear on the product page.'));
        var card = el('div', 'ccf-rvm-preview');
        var row1 = el('div', 'ccf-rvm-prow');
        var who = el('div', 'ccf-rvm-pwho');
        who.appendChild(avatarEl(draft.name, 'ccf-rv-ava ccf-rv-ava--sm'));
        who.appendChild(el('span', 'ccf-rv-name', draft.name.trim() || 'Your name'));
        row1.appendChild(who);
        var editYou = button('ccf-rv-link', 'Edit');
        editYou.setAttribute('aria-label', 'Edit your name');
        editYou.addEventListener('click', function () { go(stepIndex('you'), -1); });
        row1.appendChild(editYou);
        card.appendChild(row1);
        if (f.starRating) {
          var row2 = el('div', 'ccf-rvm-prow');
          row2.appendChild(draft.rating ? starRow(draft.rating, 16) : el('span', 'ccf-rv-muted', 'No rating'));
          var editRating = button('ccf-rv-link', 'Edit');
          editRating.setAttribute('aria-label', 'Edit your rating');
          editRating.addEventListener('click', function () { go(stepIndex('rating'), -1); });
          row2.appendChild(editRating);
          card.appendChild(row2);
        }
        if (draft.title.trim()) card.appendChild(el('p', 'ccf-rvm-ptitle', draft.title.trim()));
        card.appendChild(el('p', 'ccf-rv-body', draft.body.trim()));
        if (draft.photos.length) card.appendChild(el('p', 'ccf-rv-muted ccf-rvm-pphotos', plural(draft.photos.length, 'photo', 'photos') + ' attached'));
        box.appendChild(card);
        box.appendChild(el('p', 'ccf-rvm-hint', f.requireApproval
          ? 'The store checks every review before it is published.'
          : 'Your review is published right away.'));
      }

      var BUILDERS = { rating: buildRating, story: buildStory, photos: buildPhotos, you: buildYou, submit: buildSubmit };

      function stepIndex(key) {
        for (var i = 0; i < steps.length; i++) if (steps[i].key === key) return i;
        return -1;
      }

      // Returns an error message for the step, or '' when it is fine.
      function validate(key) {
        if (key === 'rating' && f.starRating && f.starRequired && !draft.rating) return 'Choose a star rating to continue.';
        if (key === 'story' && draft.body.trim().length < 10) return 'Write at least 10 characters.';
        if (key === 'photos' && draft.photos.some(function (p) { return p.busy; })) return 'Wait for your photos to finish uploading.';
        if (key === 'you') {
          if (!draft.name.trim()) return 'Enter your name.';
          var em = draft.email.trim();
          if (f.needsEmail && f.emailRequired && !em) return 'Enter the email you used to order.';
          if (em && !EMAIL_RE.test(em)) return 'Enter a valid email address.';
        }
        return '';
      }

      function focusStep() {
        var target = stage.querySelector('.ccf-rvm-star, input:not([type="file"]), textarea') || stage.querySelector('.ccf-rvm-title');
        if (target && target.focus) target.focus();
      }

      function renderStep(dir) {
        var st = steps[index];
        clear(stage);
        thumbsEl = null;
        var box = el('div', 'ccf-rvm-step ' + (dir > 0 ? 'ccf-rvm-in-next' : dir < 0 ? 'ccf-rvm-in-back' : 'ccf-rvm-in-first'));
        BUILDERS[st.key](box);
        errEl = el('div', 'ccf-rvm-err');
        errEl.setAttribute('role', 'alert');
        box.appendChild(errEl);
        stage.appendChild(box);
        // Photos already added (coming back to this page) can only be drawn once the page is attached.
        if (thumbsEl) renderThumbs();

        stepCount.textContent = 'Step ' + (index + 1) + ' of ' + steps.length + ' · ' + st.name;
        segEls.forEach(function (sg, i) { sg.classList.toggle('on', i <= index); });
        backBtn.style.visibility = index === 0 ? 'hidden' : 'visible';
        foot.classList.toggle('ccf-rvm-first', index === 0);
        skipBtn.hidden = st.key !== 'photos';
        nextBtn.textContent = st.key === 'submit' ? 'Submit review' : 'Continue';
        nextBtn.disabled = false;
        nextBtn.classList.remove('loading');
        focusStep();
      }

      function go(to, dir) {
        index = to;
        renderStep(dir);
      }

      function goNext() {
        if (sending || finished) return;
        var key = steps[index].key;
        var err = validate(key);
        if (err) { showErr(err); return; }
        if (key === 'submit') { submit(); return; }
        go(index + 1, 1);
      }

      function goBack() {
        if (sending || finished || index === 0) return;
        go(index - 1, -1);
      }

      function submit() {
        // Check every earlier page once more so nothing incomplete is sent.
        for (var i = 0; i < steps.length - 1; i++) {
          var e = validate(steps[i].key);
          if (e) { go(i, -1); showErr(e); return; }
        }
        sending = true;
        nextBtn.disabled = true;
        nextBtn.classList.add('loading');
        backBtn.disabled = true;
        request('POST', '', {
          productId: productId,
          productHandle: handle,
          rating: draft.rating || undefined,
          name: draft.name.trim(),
          email: f.needsEmail && draft.email.trim() ? draft.email.trim() : undefined,
          title: draft.title.trim(),
          body: draft.body.trim(),
          photos: draft.photos.map(function (p) { return p.url; })
        }).then(function (res) {
          sending = false;
          backBtn.disabled = false;
          if (res.body && res.body.ok) { showDone(res.body.status); return; }
          nextBtn.disabled = false;
          nextBtn.classList.remove('loading');
          var message = (res.body && res.body.message) || 'Your review could not be sent. Try again.';
          if (res.body && res.body.error === 'LOGIN_REQUIRED') message = 'Log in to write a review.';
          var at = res.body && res.body.field ? stepIndex(FIELD_STEP[res.body.field]) : -1;
          if (at !== -1 && at !== index) go(at, -1);
          showErr(message);
        }).catch(function () {
          sending = false;
          backBtn.disabled = false;
          nextBtn.disabled = false;
          nextBtn.classList.remove('loading');
          showErr('Your review could not be sent. Check your connection and try again.');
        });
      }

      // The final "thank you" page.
      function showDone(status) {
        finished = true;
        var first = draft.name.trim().split(/\s+/)[0] || '';
        clear(stage);
        errEl = null;
        foot.hidden = true;
        progress.hidden = true;
        var done = el('div', 'ccf-rvm-step ccf-rvm-done ccf-rvm-in-first');
        var mark = svgEl('svg', { viewBox: '0 0 56 56', width: 72, height: 72, 'aria-hidden': 'true', 'class': 'ccf-rvm-okmark' });
        mark.appendChild(svgEl('circle', { 'class': 'ccf-rvm-okring', cx: 28, cy: 28, r: 26 }));
        mark.appendChild(svgEl('path', { 'class': 'ccf-rvm-oktick', d: 'M17 29l7 7 15-16' }));
        done.appendChild(mark);
        var h = el('h3', 'ccf-rvm-title', first ? 'Thank you, ' + first : 'Thank you');
        h.tabIndex = -1;
        done.appendChild(h);
        done.appendChild(el('p', 'ccf-rvm-sub', status === 'pending'
          ? 'Your review has been sent. It will appear on the product page once the store approves it.'
          : 'Your review is now live on the product page.'));
        var back = button('ccf-rv-btn ccf-rvm-donebtn', 'Back to the product');
        back.addEventListener('click', layer.close);
        done.appendChild(back);
        stage.appendChild(done);
        back.focus();
        draft = { rating: 0, title: '', body: '', name: '', email: '', photos: [] };
        filter = { rating: '', photos: false };
        load(true);
      }

      backBtn.addEventListener('click', goBack);
      nextBtn.addEventListener('click', goNext);
      skipBtn.addEventListener('click', goNext);
      renderStep(0);
    }

    load(true);
  }

  function initAll() {
    var roots = document.querySelectorAll('[data-ccf-reviews]');
    for (var i = 0; i < roots.length; i++) init(roots[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else initAll();
  // Theme editor re-renders sections without a page load.
  document.addEventListener('shopify:section:load', initAll);
})();
