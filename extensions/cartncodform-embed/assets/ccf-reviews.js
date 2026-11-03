/* ccf-reviews.js — Product reviews block, ShopiReachBoost AI.
   CSS lives in blocks/product-reviews.liquid (classes .ccf-rv-*).
   Review text is only ever put on the page with textContent, never innerHTML. */
(function () {
  'use strict';

  var ENDPOINT = '/apps/cartncodform/reviews';
  var TYPE_MIME = { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
  var MAX_SIDE = 1600;
  var REASONS = {
    NOT_VERIFIED_BUYER: 'Only customers who bought this product can write a review.',
    ALREADY_REVIEWED: 'Thank you, you have already reviewed this product.'
  };

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

  // ── one reviews block ──────────────────────────────────────────────────────

  function init(root) {
    if (root.getAttribute('data-ccf-ready')) return;
    root.setAttribute('data-ccf-ready', '1');

    var productId = root.getAttribute('data-product-id');
    var handle = root.getAttribute('data-product-handle') || '';
    var heading = root.getAttribute('data-heading') || 'Customer reviews';
    var data = null;
    var page = 1;
    var photos = []; // { url, preview, busy }
    var formOpen = false;

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
      var cssMax = parseInt(window.getComputedStyle(root).getPropertyValue('--ccf-rv-max'), 10) || 1100;
      var want = Math.min(vw - 40, cssMax);
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

    var headEl = el('h2', 'ccf-rv-h', heading);
    var topEl = el('div', 'ccf-rv-top');
    var noteEl = el('div');
    var formHost = el('div');
    var listEl = el('div', 'ccf-rv-list');
    var pagerEl = el('div', 'ccf-rv-pager');
    root.appendChild(headEl);
    root.appendChild(topEl);
    root.appendChild(noteEl);
    root.appendChild(formHost);
    root.appendChild(listEl);
    root.appendChild(pagerEl);

    function setNote(text, kind) {
      clear(noteEl);
      if (!text) return;
      var n = el('div', 'ccf-rv-note' + (kind ? ' ccf-rv-' + kind : ''), text);
      n.setAttribute('role', kind === 'err' ? 'alert' : 'status');
      noteEl.appendChild(n);
    }

    // ── summary + write button ──
    function renderTop() {
      clear(topEl);
      var f = data.form;
      var sum = el('div', 'ccf-rv-sum');
      var s = data.summary;
      if (f.starRating && s.rated > 0) {
        sum.className = 'ccf-rv-sum ccf-rv-sum--bars';
        var avg = el('div', 'ccf-rv-sum-main');
        avg.appendChild(el('div', 'ccf-rv-avg', String(s.average)));
        var st = el('div', 'ccf-rv-stars', starText(Math.round(s.average)));
        st.setAttribute('aria-label', s.average + ' out of 5 stars');
        avg.appendChild(st);
        avg.appendChild(el('div', 'ccf-rv-count', 'Based on ' + plural(s.count, 'review', 'reviews')));
        sum.appendChild(avg);
        var bars = el('div', 'ccf-rv-bars');
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
          bars.appendChild(row);
        }
        sum.appendChild(bars);
      } else {
        sum.appendChild(el('div', 'ccf-rv-count', s.count ? plural(s.count, 'review', 'reviews') : 'No reviews yet'));
      }
      topEl.appendChild(sum);

      var cta = el('div', 'ccf-rv-cta');
      if (f.canReview) {
        var btn = el('button', 'ccf-rv-btn', formOpen ? 'Close' : 'Write a review');
        btn.type = 'button';
        btn.addEventListener('click', function () { formOpen ? closeForm() : openForm(); renderTop(); });
        cta.appendChild(btn);
      } else if (f.reason === 'LOGIN_REQUIRED') {
        var a = el('a', 'ccf-rv-btn', 'Log in to write a review');
        a.href = '/account/login?return_url=' + encodeURIComponent(window.location.pathname);
        cta.appendChild(a);
      } else if (REASONS[f.reason]) {
        cta.appendChild(el('div', 'ccf-rv-count', REASONS[f.reason]));
      }
      if (cta.firstChild) topEl.appendChild(cta);
    }

    // ── list ──
    function renderList() {
      clear(listEl);
      if (!data.reviews.length) {
        listEl.appendChild(el('div', 'ccf-rv-empty', 'No reviews yet. Be the first to write one.'));
        return;
      }
      var voted = votedIds();
      data.reviews.forEach(function (r) {
        var item = el('article', 'ccf-rv-item');
        var who = el('div', 'ccf-rv-who');
        var ava = el('span', 'ccf-rv-ava', String(r.name || '?').trim().charAt(0).toUpperCase() || '?');
        ava.setAttribute('aria-hidden', 'true');
        who.appendChild(ava);
        var idCol = el('div', 'ccf-rv-id');
        idCol.appendChild(el('span', 'ccf-rv-name', r.name));
        if (r.verified) idCol.appendChild(el('span', 'ccf-rv-badge', '✓ Verified owner'));
        who.appendChild(idCol);
        var rd = el('div', 'ccf-rv-rd');
        if (typeof r.rating === 'number') {
          var st = el('span', 'ccf-rv-stars', starText(r.rating));
          st.setAttribute('aria-label', r.rating + ' out of 5 stars');
          rd.appendChild(st);
        }
        rd.appendChild(el('span', 'ccf-rv-date', formatDate(r.createdAt)));
        who.appendChild(rd);
        item.appendChild(who);
        if (r.title) item.appendChild(el('div', 'ccf-rv-title', r.title));
        item.appendChild(el('p', 'ccf-rv-body', r.body));
        if (r.photos && r.photos.length) {
          var ph = el('div', 'ccf-rv-photos');
          r.photos.forEach(function (url) {
            var a = el('a');
            a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
            var img = el('img');
            img.src = url; img.alt = 'Photo from ' + r.name; img.loading = 'lazy';
            a.appendChild(img);
            ph.appendChild(a);
          });
          item.appendChild(ph);
        }
        if (r.helpful !== null && r.helpful !== undefined) item.appendChild(helpfulButton(r, voted.indexOf(r.id) !== -1));
        listEl.appendChild(item);
      });
    }

    function helpfulButton(r, already) {
      var b = el('button', 'ccf-rv-help', 'Helpful (' + r.helpful + ')');
      b.type = 'button';
      b.setAttribute('aria-pressed', already ? 'true' : 'false');
      if (already) b.disabled = true;
      b.addEventListener('click', function () {
        b.disabled = true;
        request('POST', '/' + encodeURIComponent(r.id) + '/helpful', { visitorId: visitorId() }).then(function (res) {
          if (res.body && res.body.ok) {
            rememberVote(r.id);
            b.textContent = 'Helpful (' + res.body.helpful + ')';
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
      var prev = el('button', 'ccf-rv-btn ccf-rv-btn-ghost', 'Previous');
      var next = el('button', 'ccf-rv-btn ccf-rv-btn-ghost', 'Next');
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
        renderTop();
        renderList();
        renderPager();
        widen();
        markWidth();
        if (scroll) root.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }).catch(function () {
        if (!data) { clear(topEl); clear(listEl); setNote('Reviews could not be loaded right now.', 'err'); }
      });
    }

    // ── form ──
    function closeForm() { formOpen = false; clear(formHost); photos = []; }

    function openForm() {
      formOpen = true;
      photos = [];
      var f = data.form;
      var rating = 0;
      var form = el('form', 'ccf-rv-form');
      form.noValidate = true;
      form.setAttribute('aria-label', 'Write a review');
      form.appendChild(el('h3', 'ccf-rv-fh', 'Share your experience'));

      function field(labelText, hint, control, id) {
        var wrap = el('div', 'ccf-rv-field');
        var label = el('label', 'ccf-rv-label', labelText);
        if (id) label.htmlFor = id;
        if (hint) label.appendChild(el('span', 'ccf-rv-hint', ' ' + hint));
        wrap.appendChild(label);
        wrap.appendChild(control);
        return wrap;
      }

      // rating
      var pickRow = null;
      if (f.starRating) {
        pickRow = el('div', 'ccf-rv-pick-row');
        pickRow.setAttribute('role', 'radiogroup');
        pickRow.setAttribute('aria-label', 'Your rating');
        var buttons = [];
        for (var i = 1; i <= 5; i++) {
          (function (value) {
            var b = el('button', 'ccf-rv-pick', '★');
            b.type = 'button';
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', 'false');
            b.setAttribute('aria-label', plural(value, 'star', 'stars'));
            b.addEventListener('click', function () {
              rating = value;
              buttons.forEach(function (x, idx) {
                x.className = 'ccf-rv-pick' + (idx < value ? ' on' : '');
                x.setAttribute('aria-checked', idx + 1 === value ? 'true' : 'false');
              });
            });
            buttons.push(b);
            pickRow.appendChild(b);
          })(i);
        }
        form.appendChild(field('Your rating', f.starRequired ? '' : '(optional)', pickRow));
      }

      var name = el('input', 'ccf-rv-in'); name.type = 'text'; name.id = 'ccf-rv-name'; name.maxLength = 60; name.autocomplete = 'name';
      form.appendChild(field('Name', '', name, 'ccf-rv-name'));

      var email = null;
      if (f.needsEmail) {
        email = el('input', 'ccf-rv-in'); email.type = 'email'; email.id = 'ccf-rv-email'; email.maxLength = 254; email.autocomplete = 'email';
        form.appendChild(field('Email', f.emailRequired ? '(use the email from your order, it is never shown)' : '(optional, never shown. Use your order email to get the Verified badge)', email, 'ccf-rv-email'));
      }

      var title = el('input', 'ccf-rv-in'); title.type = 'text'; title.id = 'ccf-rv-title'; title.maxLength = 120;
      form.appendChild(field('Title', '(optional)', title, 'ccf-rv-title'));

      var body = el('textarea', 'ccf-rv-in'); body.id = 'ccf-rv-body'; body.rows = 5; body.maxLength = 2000;
      form.appendChild(field('Your review', '', body, 'ccf-rv-body'));

      // photos
      var thumbs = el('div', 'ccf-rv-thumbs');
      var fileIn = null;
      if (f.photos) {
        var mimes = f.photos.allowedTypes.map(function (t) { return TYPE_MIME[t]; }).filter(Boolean);
        fileIn = el('input'); fileIn.type = 'file'; fileIn.id = 'ccf-rv-photos'; fileIn.multiple = f.photos.maxPhotos > 1; fileIn.accept = mimes.join(',');
        var photoWrap = field('Photos', '(optional, up to ' + f.photos.maxPhotos + ', ' + typeList(f.photos.allowedTypes) + ', each under ' + f.photos.maxFileSizeMb + ' MB)', fileIn, 'ccf-rv-photos');
        photoWrap.appendChild(thumbs);
        form.appendChild(photoWrap);

        fileIn.addEventListener('change', function () {
          var files = Array.prototype.slice.call(fileIn.files || []);
          fileIn.value = '';
          files.forEach(function (file) { addPhoto(file, mimes); });
        });
      }

      function renderThumbs() {
        clear(thumbs);
        photos.forEach(function (p) {
          var box = el('div', 'ccf-rv-thumb' + (p.busy ? ' busy' : ''));
          var img = el('img'); img.src = p.preview; img.alt = 'Selected photo';
          box.appendChild(img);
          var x = el('button', 'ccf-rv-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove photo');
          x.addEventListener('click', function () { photos = photos.filter(function (q) { return q !== p; }); renderThumbs(); });
          box.appendChild(x);
          thumbs.appendChild(box);
        });
      }

      function addPhoto(file, mimes) {
        var limits = f.photos;
        if (photos.length >= limits.maxPhotos) { formError('You can add up to ' + limits.maxPhotos + ' photos.'); return; }
        if (mimes.indexOf(file.type) === -1) { formError('Only ' + typeList(limits.allowedTypes) + ' photos are allowed.'); return; }
        formError('');
        var entry = { url: '', preview: '', busy: true };
        photos.push(entry);
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
          photos = photos.filter(function (q) { return q !== entry; });
          renderThumbs();
          formError(err.message === 'size' ? 'Each photo must be under ' + limits.maxFileSizeMb + ' MB.' : (err.userMessage || 'That photo could not be added. Please try another.'));
        });
      }

      var errEl = el('div');
      function formError(text) {
        clear(errEl);
        if (!text) return;
        var n = el('div', 'ccf-rv-note ccf-rv-err', text);
        n.setAttribute('role', 'alert');
        errEl.appendChild(n);
      }
      form.appendChild(errEl);

      var actions = el('div', 'ccf-rv-actions');
      var submit = el('button', 'ccf-rv-btn', 'Submit review'); submit.type = 'submit';
      var cancel = el('button', 'ccf-rv-btn ccf-rv-btn-ghost', 'Cancel'); cancel.type = 'button';
      cancel.addEventListener('click', function () { closeForm(); renderTop(); });
      actions.appendChild(submit);
      actions.appendChild(cancel);
      form.appendChild(actions);

      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var nameVal = name.value.trim();
        var bodyVal = body.value.trim();
        if (f.starRating && f.starRequired && !rating) return formError('Please choose a star rating.');
        if (!nameVal) return formError('Please enter your name.');
        if (email && f.emailRequired && !email.value.trim()) return formError('Please enter the email you used to order.');
        if (bodyVal.length < 10) return formError('Please write at least 10 characters.');
        if (photos.some(function (p) { return p.busy; })) return formError('Please wait for your photos to finish uploading.');
        formError('');
        submit.disabled = true;
        request('POST', '', {
          productId: productId,
          productHandle: handle,
          rating: rating || undefined,
          name: nameVal,
          email: email ? email.value.trim() : undefined,
          title: title.value.trim(),
          body: bodyVal,
          photos: photos.map(function (p) { return p.url; })
        }).then(function (res) {
          if (res.body && res.body.ok) {
            closeForm();
            setNote(res.body.status === 'pending'
              ? 'Thank you! Your review will appear once the store approves it.'
              : 'Thank you! Your review is now live.', 'ok');
            return load(1, false);
          }
          submit.disabled = false;
          if (res.body && res.body.error === 'LOGIN_REQUIRED') return formError('Please log in to write a review.');
          formError((res.body && res.body.message) || 'Could not send your review. Please try again.');
        }).catch(function () {
          submit.disabled = false;
          formError('Could not send your review. Please check your connection and try again.');
        });
      });

      clear(formHost);
      formHost.appendChild(form);
      name.focus();
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
