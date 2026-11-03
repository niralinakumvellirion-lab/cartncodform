/* ccf-reviews.js - Product reviews block, ShopiReachBoost AI.
   CSS lives in assets/ccf-reviews.css (classes .ccf-rv-* for the page, .ccf-rvm-* for the pop-up pages).
   Review text is only ever put on the page with textContent, never innerHTML. */
(function () {
  'use strict';

  var ENDPOINT = '/apps/cartncodform/reviews';
  var TYPE_MIME = { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  var MAX_SIDE = 1600;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var RATING_LABELS = ['Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  var CONFETTI = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#ec4899'];
  var REASONS = {
    NOT_VERIFIED_BUYER: 'Only customers who bought this product can write a review.',
    ALREADY_REVIEWED: 'Thank you, you have already reviewed this product.'
  };
  // Which step shows an error the server reported for a field.
  var FIELD_STEP = { rating: 'rating', title: 'story', body: 'story', name: 'you', email: 'you', photos: 'photos' };

  // ── icons (built with createElementNS, no HTML strings) ─────────────────────

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ICONS = {
    star: [['path', { d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' }]],
    edit: [['path', { d: 'M12 20h9' }], ['path', { d: 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' }]],
    image: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }], ['circle', { cx: 8.5, cy: 8.5, r: 1.5 }], ['polyline', { points: '21 15 16 10 5 21' }]],
    user: [['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }], ['circle', { cx: 12, cy: 7, r: 4 }]],
    check: [['path', { d: 'M20 6L9 17l-5-5' }]],
    x: [['path', { d: 'M18 6L6 18M6 6l12 12' }]],
    right: [['path', { d: 'M5 12h14M12 5l7 7-7 7' }]],
    left: [['path', { d: 'M19 12H5M12 19l-7-7 7-7' }]],
    thumb: [['path', { d: 'M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3' }]],
    shield: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' }], ['path', { d: 'M9 12l2 2 4-4' }]],
    upload: [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['polyline', { points: '17 8 12 3 7 8' }], ['line', { x1: 12, y1: 3, x2: 12, y2: 15 }]]
  };

  function icon(name, size, filled) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size || 20));
    svg.setAttribute('height', String(size || 20));
    svg.setAttribute('fill', filled ? 'currentColor' : 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    (ICONS[name] || []).forEach(function (part) {
      var n = document.createElementNS(SVG_NS, part[0]);
      for (var k in part[1]) { if (Object.prototype.hasOwnProperty.call(part[1], k)) n.setAttribute(k, String(part[1][k])); }
      svg.appendChild(n);
    });
    return svg;
  }

  // ── small helpers ──────────────────────────────────────────────────────────

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function starText(n) {
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= n ? '★' : '☆';
    return s;
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function formatDate(value) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return d.toDateString(); }
  }

  function hueOf(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return h;
  }

  // Round letter avatar, colour picked from the name so each person keeps the same colour.
  function avatarEl(name, cls) {
    var n = String(name || '').trim();
    var a = el('span', cls || 'ccf-rv-ava', n.charAt(0).toUpperCase() || '?');
    var h = hueOf(n);
    a.style.background = 'hsl(' + h + ', 70%, 90%)';
    a.style.color = 'hsl(' + h + ', 55%, 28%)';
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
    return types.map(function (t) { return t.toUpperCase(); }).join(', ');
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
    return l !== null && l > 0.45 ? '#0f172a' : '#ffffff';
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
      .filter(function (n) { return !n.disabled && n.getAttribute('tabindex') !== '-1' && !n.hidden; });
  }

  // Creates the overlay, locks page scroll, keeps Tab inside, closes on Escape.
  function openLayer(root, label, onClose) {
    var layer = el('div', 'ccf-rvm');
    var vars = window.getComputedStyle(root);
    ['--ccf-rv-accent', '--ccf-rv-star'].forEach(function (name) {
      var v = vars.getPropertyValue(name);
      if (v && v.trim()) layer.style.setProperty(name, v.trim());
    });
    var accent = (vars.getPropertyValue('--ccf-rv-accent') || '').trim();
    var lum = luminance(accent);
    // A near-black brand colour would vanish on the pop-up's dark palette; the style sheet swaps it for a light button.
    layer.setAttribute('data-acc', lum !== null && lum < 0.18 ? 'dark' : 'other');
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
    var x = el('button', 'ccf-rvm-x');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close photo');
    x.appendChild(icon('x', 20));
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
    root.style.setProperty('--ccf-rv-accent-fg', textOn(window.getComputedStyle(root).getPropertyValue('--ccf-rv-accent')));

    var productId = root.getAttribute('data-product-id');
    var handle = root.getAttribute('data-product-handle') || '';
    var heading = root.getAttribute('data-heading') || 'Customer reviews';
    var data = null;
    var page = 1;
    // What the customer has typed so far. Kept while the pages are closed and re-opened.
    var draft = { rating: 0, title: '', body: '', name: '', email: '', photos: [] };

    clear(root);

    // Narrow layout follows the block's own width (a narrow theme column), not just the screen.
    function markWidth() { root.classList.toggle('ccf-rv--narrow', root.clientWidth > 0 && root.clientWidth < 620); }
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

    // Page layout: title + write button first, then the rating summary, then the reviews.
    var heroEl = el('header', 'ccf-rv-hero');
    var headEl = el('h2', 'ccf-rv-h', heading);
    var subEl = el('div', 'ccf-rv-sub');
    var ctaEl = el('div', 'ccf-rv-cta');
    var barsEl = el('div', 'ccf-rv-barswrap');
    var noteEl = el('div');
    var listEl = el('div', 'ccf-rv-list');
    var pagerEl = el('div', 'ccf-rv-pager');
    heroEl.appendChild(headEl);
    heroEl.appendChild(subEl);
    heroEl.appendChild(ctaEl);
    var inner = el('div', 'ccf-rv-inner');
    inner.appendChild(heroEl);
    inner.appendChild(barsEl);
    inner.appendChild(noteEl);
    inner.appendChild(listEl);
    inner.appendChild(pagerEl);
    root.appendChild(inner);

    function setNote(text, kind) {
      clear(noteEl);
      if (!text) return;
      var n = el('div', 'ccf-rv-note' + (kind ? ' ccf-rv-' + kind : ''), text);
      n.setAttribute('role', kind === 'err' ? 'alert' : 'status');
      noteEl.appendChild(n);
    }

    // ── hero: rating line, write button, star bars ──
    function renderHero() {
      clear(subEl);
      clear(ctaEl);
      clear(barsEl);
      var f = data.form;
      var s = data.summary;
      var hasRatings = f.starRating && s.rated > 0;

      if (hasRatings) {
        var score = el('div', 'ccf-rv-score');
        score.appendChild(el('span', 'ccf-rv-avg', String(s.average)));
        var st = el('span', 'ccf-rv-stars ccf-rv-stars--big', starText(Math.round(s.average)));
        st.setAttribute('aria-label', s.average + ' out of 5 stars');
        score.appendChild(st);
        score.appendChild(el('span', 'ccf-rv-count', 'Based on ' + plural(s.count, 'review', 'reviews')));
        subEl.appendChild(score);
      } else {
        subEl.appendChild(el('div', 'ccf-rv-count', s.count ? plural(s.count, 'review', 'reviews') : 'No reviews yet'));
      }

      if (f.canReview) {
        var btn = el('button', 'ccf-rv-btn ccf-rv-btn--write');
        btn.type = 'button';
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
        ctaEl.appendChild(el('div', 'ccf-rv-count', REASONS[f.reason]));
      }

      if (hasRatings) {
        var card = el('div', 'ccf-rv-bars');
        for (var star = 5; star >= 1; star--) {
          var n = s.distribution[star] || 0;
          var row = el('div', 'ccf-rv-bar');
          row.appendChild(el('span', null, star + '★'));
          var track = el('span', 'ccf-rv-bar-track');
          var fill = el('span', 'ccf-rv-bar-fill');
          fill.style.width = (s.rated ? Math.round(n * 100 / s.rated) : 0) + '%';
          track.appendChild(fill);
          row.appendChild(track);
          row.appendChild(el('span', null, String(n)));
          card.appendChild(row);
        }
        barsEl.appendChild(card);
      }
    }

    // ── list of review cards ──
    function renderList() {
      clear(listEl);
      if (!data.reviews.length) {
        var empty = el('div', 'ccf-rv-empty');
        empty.appendChild(icon('star', 30));
        empty.appendChild(el('div', 'ccf-rv-empty-t', 'No reviews yet'));
        empty.appendChild(el('div', 'ccf-rv-empty-s', 'Be the first to write one.'));
        listEl.appendChild(empty);
        return;
      }
      var voted = votedIds();
      data.reviews.forEach(function (r, idx) {
        var item = el('article', 'ccf-rv-item');
        item.style.animationDelay = Math.min(idx, 8) * 60 + 'ms';
        var who = el('div', 'ccf-rv-who');
        who.appendChild(avatarEl(r.name));
        var idCol = el('div', 'ccf-rv-id');
        idCol.appendChild(el('span', 'ccf-rv-name', r.name));
        var meta = el('div', 'ccf-rv-meta');
        if (r.verified) {
          var badge = el('span', 'ccf-rv-badge');
          badge.appendChild(icon('shield', 13));
          badge.appendChild(document.createTextNode('Verified owner'));
          meta.appendChild(badge);
        }
        meta.appendChild(el('span', 'ccf-rv-date', formatDate(r.createdAt)));
        idCol.appendChild(meta);
        who.appendChild(idCol);
        if (typeof r.rating === 'number') {
          var st = el('span', 'ccf-rv-stars', starText(r.rating));
          st.setAttribute('aria-label', r.rating + ' out of 5 stars');
          who.appendChild(st);
        }
        item.appendChild(who);
        if (r.title) item.appendChild(el('div', 'ccf-rv-title', r.title));
        item.appendChild(el('p', 'ccf-rv-body', r.body));
        if (r.photos && r.photos.length) {
          var ph = el('div', 'ccf-rv-photos');
          r.photos.forEach(function (url) {
            var b = el('button', 'ccf-rv-photo');
            b.type = 'button';
            b.setAttribute('aria-label', 'View photo from ' + r.name);
            var img = el('img');
            img.src = url; img.alt = 'Photo from ' + r.name; img.loading = 'lazy';
            b.appendChild(img);
            b.addEventListener('click', function () { openLightbox(root, url, 'Photo from ' + r.name, b); });
            ph.appendChild(b);
          });
          item.appendChild(ph);
        }
        if (r.helpful !== null && r.helpful !== undefined) item.appendChild(helpfulButton(r, voted.indexOf(r.id) !== -1));
        listEl.appendChild(item);
      });
    }

    function helpfulButton(r, already) {
      var b = el('button', 'ccf-rv-help');
      b.type = 'button';
      b.appendChild(icon('thumb', 14));
      var label = el('span', null, 'Helpful (' + r.helpful + ')');
      b.appendChild(label);
      b.setAttribute('aria-pressed', already ? 'true' : 'false');
      if (already) b.disabled = true;
      b.addEventListener('click', function () {
        b.disabled = true;
        request('POST', '/' + encodeURIComponent(r.id) + '/helpful', { visitorId: visitorId() }).then(function (res) {
          if (res.body && res.body.ok) {
            rememberVote(r.id);
            label.textContent = 'Helpful (' + res.body.helpful + ')';
            b.setAttribute('aria-pressed', 'true');
          } else {
            b.disabled = false;
          }
        }).catch(function () { b.disabled = false; });
      });
      return b;
    }

    function renderPager() {
      clear(pagerEl);
      if (data.pages <= 1) return;
      var prev = el('button', 'ccf-rv-btn ccf-rv-btn--ghost', 'Previous');
      var next = el('button', 'ccf-rv-btn ccf-rv-btn--ghost', 'Next');
      prev.type = next.type = 'button';
      prev.disabled = page <= 1;
      next.disabled = page >= data.pages;
      prev.addEventListener('click', function () { load(page - 1, true); });
      next.addEventListener('click', function () { load(page + 1, true); });
      pagerEl.appendChild(prev);
      pagerEl.appendChild(el('span', 'ccf-rv-count', 'Page ' + page + ' of ' + data.pages));
      pagerEl.appendChild(next);
    }

    function load(toPage, scroll) {
      return request('GET', '?productId=' + encodeURIComponent(productId) + '&page=' + toPage).then(function (res) {
        if (!res.body || !res.body.ok) throw new Error('load');
        data = res.body;
        page = data.page;
        renderHero();
        renderList();
        renderPager();
        widen();
        markWidth();
        if (scroll) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }).catch(function () {
        if (!data) { clear(subEl); clear(ctaEl); clear(listEl); setNote('Reviews could not be loaded right now.', 'err'); }
      });
    }

    // ── the write-a-review pages: one question at a time ──────────────────────
    function openWizard(opener) {
      var f = data.form;
      var steps = [];
      if (f.starRating) steps.push({ key: 'rating', icon: 'star', title: 'How was your experience?', sub: 'Tap a star to rate this product.' });
      steps.push({ key: 'story', icon: 'edit', title: 'Tell us more', sub: 'What did you like or not like?' });
      if (f.photos) steps.push({ key: 'photos', icon: 'image', title: 'Add some photos', sub: 'Optional, but other shoppers love them.' });
      steps.push({ key: 'you', icon: 'user', title: 'About you', sub: f.emailRequired ? 'Use the email from your order. It is never shown.' : 'Your name is shown next to your review.' });
      steps.push({ key: 'submit', icon: 'check', title: 'Ready to submit?', sub: 'This is how your review will look.' });

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

      var closeBtn = el('button', 'ccf-rvm-x');
      closeBtn.type = 'button';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.appendChild(icon('x', 20));
      closeBtn.addEventListener('click', layer.close);

      var meta = el('div', 'ccf-rvm-meta');
      var stepCount = el('span', 'ccf-rvm-count');
      var dots = el('div', 'ccf-rvm-dots');
      var dotEls = steps.map(function () { var d = el('span', 'ccf-rvm-dot'); dots.appendChild(d); return d; });
      meta.appendChild(stepCount);
      meta.appendChild(dots);
      var progress = el('div', 'ccf-rvm-progress');
      var bar = el('div', 'ccf-rvm-bar');
      progress.appendChild(bar);
      var stage = el('div', 'ccf-rvm-stage');
      var foot = el('div', 'ccf-rvm-foot');
      var backBtn = el('button', 'ccf-rv-btn ccf-rv-btn--ghost ccf-rvm-back');
      backBtn.type = 'button';
      backBtn.appendChild(icon('left', 18));
      backBtn.appendChild(el('span', null, 'Back'));
      var nextBtn = el('button', 'ccf-rv-btn ccf-rvm-next');
      nextBtn.type = 'button';
      foot.appendChild(backBtn);
      foot.appendChild(nextBtn);
      dialog.appendChild(closeBtn);
      dialog.appendChild(progress);
      dialog.appendChild(meta);
      dialog.appendChild(stage);
      dialog.appendChild(foot);

      function showErr(text) {
        if (!errEl) return;
        clear(errEl);
        if (!text) return;
        errEl.appendChild(el('div', 'ccf-rvm-errmsg', text));
        dialog.classList.remove('ccf-rvm-shake');
        void dialog.offsetWidth;
        dialog.classList.add('ccf-rvm-shake');
      }

      function field(labelText, hint, control, id) {
        var wrap = el('div', 'ccf-rvm-field');
        var label = el('label', 'ccf-rvm-label', labelText);
        if (id) label.htmlFor = id;
        if (hint) label.appendChild(el('span', 'ccf-rvm-hint', ' ' + hint));
        wrap.appendChild(label);
        wrap.appendChild(control);
        return wrap;
      }

      // step: rating
      function buildRating() {
        var box = el('div', 'ccf-rvm-rate');
        var row = el('div', 'ccf-rvm-stars');
        row.setAttribute('role', 'radiogroup');
        row.setAttribute('aria-label', 'Your rating');
        var label = el('div', 'ccf-rvm-ratelabel');
        var buttons = [];
        function paint(n) {
          buttons.forEach(function (b, i) {
            b.classList.toggle('on', i < n);
            b.setAttribute('aria-checked', i + 1 === draft.rating ? 'true' : 'false');
          });
          label.textContent = n ? RATING_LABELS[n - 1] : 'Select a rating';
          label.classList.toggle('set', !!n);
        }
        function choose(v, b) {
          draft.rating = v;
          paint(v);
          showErr('');
          if (b) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
        }
        for (var i = 1; i <= 5; i++) {
          (function (value) {
            var b = el('button', 'ccf-rvm-star');
            b.type = 'button';
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-label', plural(value, 'star', 'stars'));
            b.appendChild(icon('star', 46, true));
            b.addEventListener('click', function () { choose(value, b); });
            b.addEventListener('mouseenter', function () { paint(value); });
            b.addEventListener('mouseleave', function () { paint(draft.rating); });
            b.addEventListener('keydown', function (e) {
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); var n = Math.min(5, (draft.rating || 0) + 1); choose(n, buttons[n - 1]); buttons[n - 1].focus(); }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); var m = Math.max(1, (draft.rating || 2) - 1); choose(m, buttons[m - 1]); buttons[m - 1].focus(); }
            });
            buttons.push(b);
            row.appendChild(b);
          })(i);
        }
        box.appendChild(row);
        box.appendChild(label);
        paint(draft.rating);
        return box;
      }

      // step: story
      function buildStory() {
        var box = el('div', 'ccf-rvm-fields');
        var title = el('input', 'ccf-rvm-in');
        title.type = 'text'; title.id = 'ccf-rv-title'; title.maxLength = 120; title.value = draft.title;
        title.placeholder = 'Sum it up in a few words';
        title.addEventListener('input', function () { draft.title = title.value; });
        title.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); body.focus(); } });
        var body = el('textarea', 'ccf-rvm-in ccf-rvm-area');
        body.id = 'ccf-rv-body'; body.rows = 6; body.maxLength = 2000; body.value = draft.body;
        body.placeholder = 'Share details about quality, fit and how you use it';
        var counter = el('div', 'ccf-rvm-counter');
        function count() { counter.textContent = body.value.length + ' / 2000'; counter.classList.toggle('ok', body.value.trim().length >= 10); }
        body.addEventListener('input', function () { draft.body = body.value; count(); showErr(''); });
        count();
        box.appendChild(field('Headline', '(optional)', title, 'ccf-rv-title'));
        box.appendChild(field('Your review', '', body, 'ccf-rv-body'));
        box.appendChild(counter);
        return box;
      }

      // step: photos
      function renderThumbs() {
        if (!thumbsEl || !document.body.contains(thumbsEl)) return;
        clear(thumbsEl);
        draft.photos.forEach(function (p) {
          var box = el('div', 'ccf-rvm-thumb' + (p.busy ? ' busy' : ''));
          var img = el('img'); img.src = p.preview; img.alt = 'Selected photo';
          box.appendChild(img);
          if (p.busy) box.appendChild(el('span', 'ccf-rvm-spin'));
          var x = el('button', 'ccf-rvm-thumbx'); x.type = 'button'; x.setAttribute('aria-label', 'Remove photo');
          x.appendChild(icon('x', 14));
          x.addEventListener('click', function () { draft.photos = draft.photos.filter(function (q) { return q !== p; }); renderThumbs(); });
          box.appendChild(x);
          thumbsEl.appendChild(box);
        });
      }

      function addPhoto(file, mimes) {
        var limits = f.photos;
        if (draft.photos.length >= limits.maxPhotos) { showErr('You can add up to ' + limits.maxPhotos + ' photos.'); return; }
        if (mimes.indexOf(file.type) === -1) { showErr('Only ' + typeList(limits.allowedTypes) + ' photos are allowed.'); return; }
        showErr('');
        var entry = { url: '', preview: '', busy: true };
        draft.photos.push(entry);
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
          showErr(err.message === 'size' ? 'Each photo must be under ' + limits.maxFileSizeMb + ' MB.' : (err.userMessage || 'That photo could not be added. Please try another.'));
        });
      }

      function buildPhotos() {
        var box = el('div', 'ccf-rvm-fields');
        var limits = f.photos;
        var mimes = limits.allowedTypes.map(function (t) { return TYPE_MIME[t]; }).filter(Boolean);
        var fileIn = el('input', 'ccf-rvm-file');
        fileIn.type = 'file'; fileIn.id = 'ccf-rv-photos'; fileIn.multiple = limits.maxPhotos > 1; fileIn.accept = mimes.join(',');
        var zone = el('label', 'ccf-rvm-drop');
        zone.htmlFor = 'ccf-rv-photos';
        zone.appendChild(icon('upload', 28));
        zone.appendChild(el('strong', null, 'Click to upload'));
        zone.appendChild(el('span', null, 'or drag and drop'));
        zone.appendChild(el('small', null, typeList(limits.allowedTypes) + ' · up to ' + limits.maxPhotos + ' photos · each under ' + limits.maxFileSizeMb + ' MB'));
        function take(files) {
          Array.prototype.slice.call(files || []).forEach(function (file) { addPhoto(file, mimes); });
        }
        fileIn.addEventListener('change', function () { var files = fileIn.files; take(files); fileIn.value = ''; });
        zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('over'); });
        zone.addEventListener('dragleave', function () { zone.classList.remove('over'); });
        zone.addEventListener('drop', function (e) { e.preventDefault(); zone.classList.remove('over'); take(e.dataTransfer && e.dataTransfer.files); });
        thumbsEl = el('div', 'ccf-rvm-thumbs');
        box.appendChild(fileIn);
        box.appendChild(zone);
        box.appendChild(thumbsEl);
        renderThumbs();
        return box;
      }

      // step: about you
      function buildYou() {
        var box = el('div', 'ccf-rvm-fields');
        var name = el('input', 'ccf-rvm-in');
        name.type = 'text'; name.id = 'ccf-rv-name'; name.maxLength = 60; name.autocomplete = 'name'; name.value = draft.name;
        name.placeholder = 'Your name';
        name.addEventListener('input', function () { draft.name = name.value; showErr(''); });
        box.appendChild(field('Name', '', name, 'ccf-rv-name'));
        var email = null;
        if (f.needsEmail) {
          email = el('input', 'ccf-rvm-in');
          email.type = 'email'; email.id = 'ccf-rv-email'; email.maxLength = 254; email.autocomplete = 'email'; email.value = draft.email;
          email.placeholder = 'you@example.com';
          email.addEventListener('input', function () { draft.email = email.value; showErr(''); });
          box.appendChild(field('Email', f.emailRequired ? '' : '(optional)', email, 'ccf-rv-email'));
          box.appendChild(el('p', 'ccf-rvm-fine', f.emailRequired ? 'We use it only to check your order. It is never shown.' : 'Never shown. Use your order email to get the Verified owner badge.'));
        }
        var onEnter = function (e) { if (e.key === 'Enter') { e.preventDefault(); goNext(); } };
        name.addEventListener('keydown', onEnter);
        if (email) email.addEventListener('keydown', onEnter);
        return box;
      }

      // step: preview + submit
      function buildSubmit() {
        var box = el('div', 'ccf-rvm-fields');
        var card = el('div', 'ccf-rvm-preview');
        var who = el('div', 'ccf-rv-who');
        who.appendChild(avatarEl(draft.name));
        var idCol = el('div', 'ccf-rv-id');
        idCol.appendChild(el('span', 'ccf-rv-name', draft.name.trim() || 'You'));
        idCol.appendChild(el('div', 'ccf-rv-meta')).appendChild(el('span', 'ccf-rv-date', formatDate(new Date())));
        who.appendChild(idCol);
        if (f.starRating && draft.rating) who.appendChild(el('span', 'ccf-rv-stars', starText(draft.rating)));
        card.appendChild(who);
        if (draft.title.trim()) card.appendChild(el('div', 'ccf-rv-title', draft.title.trim()));
        card.appendChild(el('p', 'ccf-rv-body', draft.body.trim()));
        if (draft.photos.length) {
          var ph = el('div', 'ccf-rvm-thumbs');
          draft.photos.forEach(function (p) {
            var t = el('div', 'ccf-rvm-thumb');
            var img = el('img'); img.src = p.preview; img.alt = 'Your photo';
            t.appendChild(img);
            ph.appendChild(t);
          });
          card.appendChild(ph);
        }
        box.appendChild(card);
        box.appendChild(el('p', 'ccf-rvm-fine ccf-rvm-center', f.requireApproval
          ? 'The store checks every review before it is published.'
          : 'Your review is published right away.'));
        return box;
      }

      var BUILDERS = { rating: buildRating, story: buildStory, photos: buildPhotos, you: buildYou, submit: buildSubmit };

      function stepIndex(key) {
        for (var i = 0; i < steps.length; i++) if (steps[i].key === key) return i;
        return -1;
      }

      // Returns an error message for the step, or '' when it is fine.
      function validate(key) {
        if (key === 'rating' && f.starRating && f.starRequired && !draft.rating) return 'Please choose a star rating.';
        if (key === 'story' && draft.body.trim().length < 10) return 'Please write at least 10 characters.';
        if (key === 'photos' && draft.photos.some(function (p) { return p.busy; })) return 'Please wait for your photos to finish uploading.';
        if (key === 'you') {
          if (!draft.name.trim()) return 'Please enter your name.';
          var em = draft.email.trim();
          if (f.needsEmail && f.emailRequired && !em) return 'Please enter the email you used to order.';
          if (em && !EMAIL_RE.test(em)) return 'Please enter a valid email address.';
        }
        return '';
      }

      function focusStep() {
        var first = stage.querySelector('.ccf-rvm-star, input:not([type="file"]), textarea');
        var target = first || stage.querySelector('.ccf-rvm-title');
        if (target && target.focus) target.focus();
      }

      function renderStep(dir) {
        var st = steps[index];
        clear(stage);
        thumbsEl = null;
        var wrap = el('div', 'ccf-rvm-step ' + (dir > 0 ? 'ccf-rvm-in-next' : dir < 0 ? 'ccf-rvm-in-back' : 'ccf-rvm-in-first'));
        var ic = el('div', 'ccf-rvm-ic');
        ic.appendChild(icon(st.icon, 26));
        var h = el('h3', 'ccf-rvm-title', st.title);
        h.tabIndex = -1;
        wrap.appendChild(ic);
        wrap.appendChild(h);
        wrap.appendChild(el('p', 'ccf-rvm-sub', st.sub));
        wrap.appendChild(BUILDERS[st.key]());
        errEl = el('div', 'ccf-rvm-err');
        errEl.setAttribute('role', 'alert');
        wrap.appendChild(errEl);
        stage.appendChild(wrap);
        // Photos already added (coming back to this page) can only be drawn once the page is attached.
        if (thumbsEl) renderThumbs();

        stepCount.textContent = 'Step ' + (index + 1) + ' of ' + steps.length;
        bar.style.width = Math.round((index + 1) * 100 / steps.length) + '%';
        dotEls.forEach(function (d, i) { d.classList.toggle('done', i < index); d.classList.toggle('now', i === index); });
        backBtn.style.visibility = index === 0 ? 'hidden' : 'visible';
        clear(nextBtn);
        if (st.key === 'submit') {
          nextBtn.appendChild(el('span', null, 'Submit review'));
          nextBtn.appendChild(icon('check', 18));
        } else {
          nextBtn.appendChild(el('span', null, 'Next'));
          nextBtn.appendChild(icon('right', 18));
        }
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
          var message = (res.body && res.body.message) || 'Could not send your review. Please try again.';
          if (res.body && res.body.error === 'LOGIN_REQUIRED') message = 'Please log in to write a review.';
          var at = res.body && res.body.field ? stepIndex(FIELD_STEP[res.body.field]) : -1;
          if (at !== -1 && at !== index) go(at, -1);
          showErr(message);
        }).catch(function () {
          sending = false;
          backBtn.disabled = false;
          nextBtn.disabled = false;
          nextBtn.classList.remove('loading');
          showErr('Could not send your review. Please check your connection and try again.');
        });
      }

      // The final "thank you" page.
      function showDone(status) {
        finished = true;
        clear(stage);
        errEl = null;
        foot.style.display = 'none';
        meta.style.display = 'none';
        bar.style.width = '100%';
        var done = el('div', 'ccf-rvm-step ccf-rvm-done ccf-rvm-in-first');
        var burst = el('div', 'ccf-rvm-burst');
        for (var i = 0; i < 22; i++) {
          var c = el('span', 'ccf-rvm-conf');
          var angle = (i / 22) * Math.PI * 2;
          var dist = 70 + Math.random() * 90;
          c.style.setProperty('--x', Math.round(Math.cos(angle) * dist) + 'px');
          c.style.setProperty('--y', Math.round(Math.sin(angle) * dist - 18) + 'px');
          c.style.setProperty('--r', Math.round(Math.random() * 540 - 270) + 'deg');
          c.style.setProperty('--c', CONFETTI[i % CONFETTI.length]);
          c.style.setProperty('--d', (Math.random() * 0.18).toFixed(2) + 's');
          burst.appendChild(c);
        }
        var badge = document.createElementNS(SVG_NS, 'svg');
        badge.setAttribute('class', 'ccf-rvm-okmark');
        badge.setAttribute('viewBox', '0 0 64 64');
        badge.setAttribute('width', '88');
        badge.setAttribute('height', '88');
        badge.setAttribute('aria-hidden', 'true');
        var ring = document.createElementNS(SVG_NS, 'circle');
        ring.setAttribute('class', 'ccf-rvm-okring'); ring.setAttribute('cx', '32'); ring.setAttribute('cy', '32'); ring.setAttribute('r', '28');
        var tick = document.createElementNS(SVG_NS, 'path');
        tick.setAttribute('class', 'ccf-rvm-oktick'); tick.setAttribute('d', 'M19 33l9 9 17-19');
        badge.appendChild(ring);
        badge.appendChild(tick);
        done.appendChild(burst);
        done.appendChild(badge);
        var h = el('h3', 'ccf-rvm-title ccf-rvm-bigtitle', 'Thank you!');
        h.tabIndex = -1;
        done.appendChild(h);
        done.appendChild(el('p', 'ccf-rvm-sub', status === 'pending'
          ? 'Your review was sent. It will appear once the store approves it.'
          : 'Your review is now live. Thanks for helping other shoppers.'));
        var again = el('button', 'ccf-rv-btn ccf-rvm-donebtn', 'Done');
        again.type = 'button';
        again.addEventListener('click', layer.close);
        done.appendChild(again);
        stage.appendChild(done);
        again.focus();
        draft = { rating: 0, title: '', body: '', name: '', email: '', photos: [] };
        load(1, false);
      }

      backBtn.addEventListener('click', goBack);
      nextBtn.addEventListener('click', goNext);
      renderStep(0);
    }

    load(1, false);
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
