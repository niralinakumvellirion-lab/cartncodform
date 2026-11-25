/* ccf-tiers.js — Quantity Tier Cards, CartnCodForm
   CSS: all classes prefixed .ccf-qt-*  No global leaks. */
(function () {
  'use strict';

  // ── Config resolution ──────────────────────────────────────────────────────

  // Shown only in the theme editor when the merchant has not turned tiers on yet.
  var SAMPLE_CONFIG = {
    enabled: true,
    heading: 'Buy more, save more',
    accentColor: '#4F46E5',
    layout: 'cards',
    tiers: [
      { minQty: 2, percent: 5, badge: '' },
      { minQty: 3, percent: 10, badge: 'Most popular' },
      { minQty: 5, percent: 15, badge: '' },
    ],
  };

  function getInlineConfig() {
    var el = document.getElementById('ccf-qt-config');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  function fetchConfig(shopDomain) {
    return fetch('/apps/cartncodform/discount-config?shop=' + encodeURIComponent(shopDomain))
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && d.quantityTiers) || null; })
      .catch(function () { return null; });
  }

  // ── Money formatting ───────────────────────────────────────────────────────

  function formatMoney(minorUnits) {
    var currency = (window.Shopify && window.Shopify.currency && window.Shopify.currency.active) || 'INR';
    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      return window.Shopify.formatMoney(minorUnits);
    }
    // Whole amounts without decimals (₹999); otherwise always two (₹1,798.20, never ₹1,798.2).
    var fraction = Math.round(minorUnits) % 100 === 0 ? 0 : 2;
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: fraction,
        maximumFractionDigits: fraction,
      }).format(minorUnits / 100);
    } catch (e) {
      return currency + ' ' + (minorUnits / 100).toFixed(2);
    }
  }

  // ── Discount math — must match backend/utils/quantityTiers.js ─────────────

  function pickTier(tiers, qty) {
    if (!Array.isArray(tiers) || tiers.length === 0) return null;
    if (typeof qty !== 'number' || !isFinite(qty) || qty < 1) return null;
    var best = null;
    for (var i = 0; i < tiers.length; i++) {
      if (tiers[i].minQty <= qty) best = tiers[i];
    }
    return best;
  }

  function discountedUnitPricePaise(pricePaise, percent) {
    var raw = pricePaise * (1 - percent / 100);
    return Math.round((raw + Number.EPSILON) * 100) / 100;
  }

  // ── Colour accessibility ───────────────────────────────────────────────────

  var ACCENT_RE = /^#[0-9A-Fa-f]{6}$/;

  function hexLuminance(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255;
    var g = parseInt(hex.slice(3, 5), 16) / 255;
    var b = parseInt(hex.slice(5, 7), 16) / 255;
    function lin(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  // Returns '#ffffff' or '#171A22', whichever meets >= 4.5:1 on bgHex.
  function pickReadableText(bgHex) {
    if (!ACCENT_RE.test(bgHex)) return '#ffffff';
    var lum = hexLuminance(bgHex);
    return 1.05 / (lum + 0.05) >= 4.5 ? '#ffffff' : '#171A22';
  }

  // Returns the chip text colour (accent or #171A22) for chip on tint background.
  function chipTextOnTint(accentHex) {
    if (!ACCENT_RE.test(accentHex)) return '#171A22';
    var L = hexLuminance(accentHex);
    var tintL = 0.9 + 0.1 * L;
    var lighter = Math.max(L, tintL) + 0.05;
    var darker = Math.min(L, tintL) + 0.05;
    return lighter / darker >= 4.5 ? accentHex : '#171A22';
  }

  // ── Variant price fetch ────────────────────────────────────────────────────

  var priceCache = Object.create(null);
  // Full product JSON per handle (options + variants) for the per-item colour/size picker.
  var productCache = Object.create(null);

  function getVariantPrice(handle, variantId) {
    var key = handle + ':' + variantId;
    if (priceCache[key] != null) return Promise.resolve(priceCache[key]);
    return fetch('/products/' + encodeURIComponent(handle) + '.js')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !Array.isArray(d.variants)) return null;
        productCache[handle] = d;
        d.variants.forEach(function (v) {
          priceCache[handle + ':' + v.id] = v.price; // Shopify price is in minor units (paise)
        });
        var fallback = d.variants[0] ? d.variants[0].price : null;
        return priceCache[key] != null ? priceCache[key] : fallback;
      })
      .catch(function () { return null; });
  }

  // ── CSS injection ──────────────────────────────────────────────────────────

  function injectStyles(accentColor) {
    if (document.getElementById('ccf-qt-styles')) return;
    var tint = accentColor + '1A';
    var badgeText = pickReadableText(accentColor);
    var chipUnselText = chipTextOnTint(accentColor);
    var chipSelText = pickReadableText(accentColor);
    var accentHover = accentColor + '99'; // accent at ~60% opacity on white
    var style = document.createElement('style');
    style.id = 'ccf-qt-styles';
    style.textContent = [
      // ── Box-sizing reset ──
      '.ccf-qt-wrap *,.ccf-qt-wrap *::before,.ccf-qt-wrap *::after{box-sizing:border-box}',
      // ── Wrapper ──
      '.ccf-qt-wrap{margin:16px 0;font-family:inherit;container-type:inline-size;container-name:ccf-qt}',
      // ── Heading row ──
      '.ccf-qt-heading-row{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:12px}',
      '.ccf-qt-heading{font-size:16px;font-weight:800;color:#171A22;font-family:inherit;margin:0}',
      '.ccf-qt-checkout-note{font-size:12px;color:#4A5062;white-space:nowrap;flex-shrink:0}',
      // ── Cards grid ──
      '.ccf-qt-cards{display:grid;gap:12px;padding-top:12px}',
      '.ccf-qt-cards-n1{grid-template-columns:minmax(0,1fr)}',
      '.ccf-qt-cards-n2{grid-template-columns:repeat(2,minmax(0,1fr))}',
      '.ccf-qt-cards-n3{grid-template-columns:repeat(3,minmax(0,1fr))}',
      '.ccf-qt-cards-n4{grid-template-columns:repeat(4,minmax(0,1fr))}',
      // narrow: 4 tiers collapse to 2 columns; 3 tiers stay on ONE row until the box is really tiny
      '@container ccf-qt (max-width:480px){.ccf-qt-cards-n4{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@container ccf-qt (max-width:240px){.ccf-qt-cards-n3{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      // ── Card button (cards layout) ──
      '.ccf-qt-card{position:relative;background:#fff;border:none;box-shadow:inset 0 0 0 1px #C7CBD6;border-radius:12px;padding:20px 8px 14px;display:flex;flex-direction:column;align-items:center;text-align:center;cursor:pointer;color:#171A22;font-family:inherit;gap:6px;appearance:none !important;text-transform:none !important;letter-spacing:normal !important;min-height:0 !important;line-height:1.4}',
      // hover on unselected
      '.ccf-qt-card:not(.ccf-qt-card--active):hover{box-shadow:inset 0 0 0 1px ' + accentHover + '}',
      // focus-visible
      '.ccf-qt-card:focus-visible{outline:2px solid ' + accentColor + ';outline-offset:2px}',
      // selected card
      '.ccf-qt-card--active{box-shadow:inset 0 0 0 2px ' + accentColor + ';background:' + tint + '}',
      // ── Badge ──
      '.ccf-qt-badge{position:absolute;top:0;left:50%;transform:translate(-50%,-50%);background:' + accentColor + ';color:' + badgeText + ';font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;white-space:nowrap;max-width:calc(100% - 8px);overflow:hidden;text-overflow:ellipsis;pointer-events:none}',
      // ── Qty label ──
      '.ccf-qt-qty{font-size:15px;font-weight:800;color:#171A22}',
      // ── Chip (unselected) ──
      '.ccf-qt-chip{font-size:13px;font-weight:800;color:' + chipUnselText + ';background:' + tint + ';border-radius:6px;padding:3px 9px;display:inline-block}',
      // chip on selected card — accent bg, readable text
      '.ccf-qt-card--active .ccf-qt-chip{background:' + accentColor + ';color:' + chipSelText + '}',
      // tighter cards so three fit side by side in a narrow product column
      '@container ccf-qt (max-width:440px){.ccf-qt-cards{gap:8px}.ccf-qt-card{padding:20px 4px 12px}.ccf-qt-qty{font-size:14px}.ccf-qt-chip{font-size:12px;padding:3px 6px}}',
      '@container ccf-qt (max-width:330px){.ccf-qt-badge{font-size:10px;padding:3px 5px;letter-spacing:-.01em}}',
      // ── Price ──
      '.ccf-qt-price{font-size:12px;color:#4A5062}',
      // ── List layout ──
      '.ccf-qt-layout-list{display:flex;flex-direction:column;gap:8px;padding-top:0}',
      '.ccf-qt-layout-list .ccf-qt-card{flex-direction:row;justify-content:space-between;align-items:center;text-align:left;border-radius:10px;padding:12px 14px;box-shadow:inset 0 0 0 1px #E1E4EA;gap:12px}',
      '.ccf-qt-layout-list .ccf-qt-card:not(.ccf-qt-card--active):hover{box-shadow:inset 0 0 0 1px ' + accentHover + '}',
      '.ccf-qt-layout-list .ccf-qt-card--active{box-shadow:inset 0 0 0 2px ' + accentColor + '}',
      '.ccf-qt-list-left{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.ccf-qt-list-qty{font-size:14px;font-weight:800;color:#171A22;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.ccf-qt-list-price{font-size:12px;color:#4A5062}',
      '.ccf-qt-badge-inline{display:inline-flex;align-items:center;background:' + accentColor + ';color:' + badgeText + ';font-size:11px;font-weight:700;border-radius:999px;padding:2px 8px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle}',
      // ── Rows layout (radio rows: qty + % pill, subtitle, total + struck price) ──
      '.ccf-qt-layout-rows{display:flex;flex-direction:column;gap:12px;padding-top:8px}',
      '.ccf-qt-layout-rows .ccf-qt-card{flex-direction:row;align-items:center;justify-content:flex-start;text-align:left;border-radius:12px;padding:14px;gap:12px}',
      '.ccf-qt-radio{position:relative;width:18px;height:18px;border-radius:50%;box-shadow:inset 0 0 0 2px #C7CBD6;flex-shrink:0}',
      '.ccf-qt-card--active .ccf-qt-radio{box-shadow:inset 0 0 0 2px ' + accentColor + '}',
      '.ccf-qt-card--active .ccf-qt-radio::after{content:"";position:absolute;top:4px;left:4px;width:10px;height:10px;border-radius:50%;background:' + accentColor + '}',
      '.ccf-qt-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
      '.ccf-qt-row-title{font-size:15px;font-weight:800;color:#171A22;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.ccf-qt-pill{font-size:11px;font-weight:800;background:' + accentColor + ';color:' + badgeText + ';border-radius:4px;padding:2px 6px;letter-spacing:.02em;white-space:nowrap}',
      '.ccf-qt-row-sub{font-size:12px;color:#4A5062}',
      '.ccf-qt-row-price{display:flex;flex-direction:column;align-items:flex-end;gap:1px;flex-shrink:0;text-align:right}',
      '.ccf-qt-row-total{font-size:15px;font-weight:800;color:#171A22}',
      '.ccf-qt-row-compare{font-size:12px;color:#6B7280;text-decoration:line-through}',
      '.ccf-qt-row-each{font-size:11px;color:#4A5062}',
      '.ccf-qt-ribbon{position:absolute;top:0;right:14px;transform:translateY(-50%);background:' + accentColor + ';color:' + badgeText + ';font-size:11px;font-weight:700;border-radius:999px;padding:2px 10px;white-space:nowrap;max-width:60%;overflow:hidden;text-overflow:ellipsis;pointer-events:none}',
      '.ccf-qt-toplabel{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700;color:' + chipUnselText + ';text-transform:uppercase;letter-spacing:.06em;margin:0 0 4px}',
      '.ccf-qt-toplabel::before,.ccf-qt-toplabel::after{content:"";flex:1;height:1px;background:#E1E4EA}',
      '.ccf-qt-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:12px;font-size:13px;color:#171A22}',
      '.ccf-qt-footer-note{font-weight:700;color:#0F766E}',
      '.ccf-qt-footer-total{font-weight:800;margin-left:auto}',
      '@container ccf-qt (max-width:330px){.ccf-qt-layout-rows .ccf-qt-card{padding:12px 10px;gap:8px}.ccf-qt-row-title,.ccf-qt-row-total{font-size:14px}}',
      // ── Per-item colour / size picker ──
      '.ccf-qt-picker{margin:4px 0 0;padding:12px;border-radius:10px;background:#F6F7F9;display:flex;flex-direction:column;gap:8px}',
      '.ccf-qt-picker-title{font-size:13px;font-weight:800;color:#171A22}',
      '.ccf-qt-pick-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.ccf-qt-pick-label{font-size:12px;font-weight:700;color:#4A5062;min-width:48px}',
      '.ccf-qt-pick-row select{flex:1 1 110px;min-width:0;font:inherit;font-size:13px;padding:6px 8px;border:1px solid #C7CBD6;border-radius:8px;background:#fff;color:#171A22}',
      '.ccf-qt-pick-err{flex-basis:100%;font-size:12px;font-weight:700;color:#B42318}',
      '.ccf-qt-picker-msg{font-size:12px;font-weight:700;color:#B42318}',
      // ── Tier perks (free shipping / free gift) ──
      '.ccf-qt-perks{font-size:12px;font-weight:700;color:#0F766E;line-height:1.35}',
      '.ccf-qt-card .ccf-qt-perks{font-size:11px}',
      // ── Savings ──
      '.ccf-qt-savings{font-size:13px;font-weight:700;color:#0F766E;background:#E0F5F1;border-radius:8px;padding:8px 12px;margin-top:8px;display:none}',
      // ── Theme editor sample caption ──
      '.ccf-qt-sample-note{font-size:11px;color:#6B7280;margin-top:8px;text-align:center}',
      // ── Reduced motion ──
      '@media (prefers-reduced-motion:no-preference){.ccf-qt-card{transition:box-shadow .15s,background .15s}}',
    ].join('');
    document.head.appendChild(style);
  }

  // ── Main init ──────────────────────────────────────────────────────────────

  function init(config) {
    var wrap = document.getElementById('ccf-qt-root');
    if (!wrap) return;

    // Theme editor: always draw the real cards - the merchant's tiers when they are on, otherwise sample
    // tiers (marked "Sample preview"). The live store only shows tiers the merchant turned on.
    var designMode = !!(window.Shopify && window.Shopify.designMode) || wrap.getAttribute('data-design-mode') === 'true';
    var configured = !!(config && config.enabled && Array.isArray(config.tiers) && config.tiers.length > 0);
    var isSample = false;

    if (!configured) {
      if (!designMode) {
        wrap.parentNode && wrap.parentNode.removeChild(wrap);
        return;
      }
      config = SAMPLE_CONFIG;
      isSample = true;
    }

    var tiers = config.tiers;
    var accentColor = ACCENT_RE.test(config.accentColor || '') ? config.accentColor : '#4F46E5';
    var heading = String(config.heading || 'Buy more, save more');
    var layout = (config.layout === 'list' || config.layout === 'rows') ? config.layout : 'cards';
    // Rows-only extras
    var topLabel = String(config.topLabel || '').slice(0, 40);
    var footerNote = String(config.footerNote || '').slice(0, 40);
    var showCompareAt = config.showCompareAt !== false;
    var showTotal = config.showTotal !== false;
    var showSingle = config.showSingle === true && tiers.length > 0 && tiers[0].minQty > 1;
    // 'percent' off each item, or a flat 'amount' off the whole bundle (tier.amount, shop currency).
    var isAmount = config.discountType === 'amount';

    // Flat amount in the shopper's currency, in minor units (paise / cents).
    function amountMinor(tier) {
      var rate = Number(window.Shopify && window.Shopify.currency && window.Shopify.currency.rate) || 1;
      return Math.round((Number(tier.amount) || 0) * rate * 100);
    }

    // Price of qty items under tier (minor units). Same rule as backend/utils/quantityTiers.tierTotal.
    function totalMinor(qty, tier) {
      var full = variantPricePaise * qty;
      if (!tier) return full;
      if (isAmount) return Math.max(0, full - amountMinor(tier));
      return Math.round(discountedUnitPricePaise(variantPricePaise, tier.percent)) * qty;
    }

    // "10% off" / "10% OFF", or "Save ₹200" / "SAVE ₹200" for flat tiers.
    function offText(tier, upper) {
      if (isAmount) return (upper ? 'SAVE ' : 'Save ') + formatMoney(amountMinor(tier));
      return tier.percent + (upper ? '% OFF' : '% off');
    }

    // Rewards for buying qty — they carry upward (a gift on "Buy 3+" also applies at 4+).
    // Same rule as backend/utils/quantityTiers.perksFor and the checkout function.
    function perksFor(qty) {
      var out = { freeShipping: false, gift: null };
      for (var i = 0; i < tiers.length; i++) {
        var t = tiers[i];
        if (!(t.minQty <= qty)) continue;
        if (t.freeShipping) out.freeShipping = true;
        if (t.gift && t.gift.variantId) out.gift = t.gift;
      }
      return out;
    }

    // "+ Free shipping · Free gift: Wax" for a tier (including rewards from lower tiers), '' if none.
    function perksText(tier) {
      if (!tier) return '';
      var p = perksFor(tier.minQty);
      var parts = [];
      if (p.freeShipping) parts.push('Free shipping');
      if (p.gift) parts.push('Free gift: ' + String(p.gift.title || 'gift').slice(0, 60));
      return parts.length ? '+ ' + parts.join(' · ') : '';
    }

    function appendPerks(parent, tier) {
      var text = perksText(tier);
      if (!text) return;
      var el = document.createElement('div');
      el.className = 'ccf-qt-perks';
      el.textContent = text;
      parent.appendChild(el);
    }
    var handle = String(wrap.getAttribute('data-handle') || '');
    var initialVariantId = String(wrap.getAttribute('data-variant-id') || '');

    injectStyles(accentColor);

    var variantPricePaise = null;
    var currentQty = 1;

    // ── Per-item colour / size picker state ──
    var pickerOn = config.variantPicker === true && !isSample;
    var MAX_PICK_ITEMS = 10;
    var product = null;              // /products/<handle>.js once loaded
    var pageVariantId = initialVariantId;
    var picks = [];                  // variant id (string) chosen for item 1..n
    var pickerMsgEl = null;
    var savingsEl = null;
    var cardEls = [];

    // ── DOM helpers ─────────────────────────────────────────────────────────

    function findQtyInput() {
      return document.querySelector('form[action*="/cart/add"] input[name="quantity"]');
    }

    // Themes without a quantity box would add just 1 after the shopper picks "Buy 3": give the
    // product form a hidden quantity field so its own Add to cart sends the chosen quantity.
    function ensureQtyInput() {
      var input = findQtyInput();
      if (input) return input;
      var form = document.querySelector('form[action*="/cart/add"]');
      if (!form) return null;
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'quantity';
      input.value = '1';
      input.setAttribute('data-ccf-qty', '1');
      form.appendChild(input);
      return input;
    }

    // ── COD link sync ────────────────────────────────────────────────────────

    function syncCodLinks(qty) {
      try {
        var links = document.querySelectorAll('a[href*="cod-form"]');
        for (var i = 0; i < links.length; i++) {
          var href = links[i].getAttribute('href');
          if (!href) continue;
          href = href.replace(/([?&])quantity=[^&]*/g, '$1quantity=' + qty);
          if (href.indexOf('quantity=') === -1) {
            href += (href.indexOf('?') === -1 ? '?' : '&') + 'quantity=' + qty;
          }
          links[i].setAttribute('href', href);
        }
      } catch (e) {}
    }

    // ── Render ────────────────────────────────────────────────────────────────

    function render() {
      wrap.innerHTML = '';
      wrap.className = 'ccf-qt-wrap';
      cardEls = [];

      // Heading row: heading + "Discount applied at checkout" note
      var headingRow = document.createElement('div');
      headingRow.className = 'ccf-qt-heading-row';

      var h = document.createElement('div');
      h.className = 'ccf-qt-heading';
      h.textContent = heading;
      headingRow.appendChild(h);

      var note = document.createElement('div');
      note.className = 'ccf-qt-checkout-note';
      note.textContent = 'Discount applied at checkout';
      headingRow.appendChild(note);

      wrap.appendChild(headingRow);

      if (layout === 'rows') {
        renderRows();
        return;
      }

      // Cards / list container
      var container = document.createElement('div');
      if (layout === 'list') {
        container.className = 'ccf-qt-cards ccf-qt-layout-list';
      } else {
        var n = Math.min(tiers.length, 4);
        container.className = 'ccf-qt-cards ccf-qt-cards-n' + n;
      }
      wrap.appendChild(container);

      var activeTier = pickTier(tiers, currentQty);

      tiers.forEach(function (tier) {
        var isActive = activeTier === tier;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ccf-qt-card' + (isActive ? ' ccf-qt-card--active' : '');
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        btn.setAttribute('data-min-qty', String(tier.minQty));
        btn.setAttribute('data-percent', String(tier.percent));
        cardEls.push(btn);

        if (layout === 'cards') {
          // Floating badge
          if (tier.badge) {
            var badge = document.createElement('span');
            badge.className = 'ccf-qt-badge';
            badge.textContent = String(tier.badge).slice(0, 20);
            btn.appendChild(badge);
          }

          var qtyLabel = document.createElement('div');
          qtyLabel.className = 'ccf-qt-qty';
          qtyLabel.textContent = 'Buy ' + tier.minQty;
          btn.appendChild(qtyLabel);

          var chip = document.createElement('div');
          chip.className = 'ccf-qt-chip';
          chip.textContent = offText(tier, false);
          btn.appendChild(chip);

          if (variantPricePaise !== null) {
            var priceEl = document.createElement('div');
            priceEl.className = 'ccf-qt-price';
            priceEl.textContent = formatMoney(Math.round(totalMinor(tier.minQty, tier) / tier.minQty)) + ' each';
            btn.appendChild(priceEl);
          }
          appendPerks(btn, tier);
        } else {
          // List layout: left side
          var left = document.createElement('div');
          left.className = 'ccf-qt-list-left';

          var qtyRow = document.createElement('div');
          qtyRow.className = 'ccf-qt-list-qty';
          qtyRow.textContent = 'Buy ' + tier.minQty;

          if (tier.badge) {
            var inlineBadge = document.createElement('span');
            inlineBadge.className = 'ccf-qt-badge-inline';
            inlineBadge.textContent = String(tier.badge).slice(0, 20);
            qtyRow.appendChild(inlineBadge);
          }
          left.appendChild(qtyRow);

          if (variantPricePaise !== null) {
            var priceElL = document.createElement('div');
            priceElL.className = 'ccf-qt-list-price';
            priceElL.textContent = formatMoney(Math.round(totalMinor(tier.minQty, tier) / tier.minQty)) + ' each';
            left.appendChild(priceElL);
          }
          appendPerks(left, tier);
          btn.appendChild(left);

          // Right side: chip
          var chipL = document.createElement('div');
          chipL.className = 'ccf-qt-chip';
          chipL.textContent = offText(tier, false);
          btn.appendChild(chipL);
        }

        btn.addEventListener('click', function () {
          var newQty = tier.minQty;
          if (btn.getAttribute('aria-pressed') === 'true') {
            newQty = 1; // clicking active card → reset to 1
          }
          currentQty = newQty;
          var qtyInput = ensureQtyInput();
          if (qtyInput) {
            qtyInput.value = newQty;
            try { qtyInput.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
            try { qtyInput.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
          }
          syncCodLinks(newQty);
          render();
          updateSavings();
        });

        container.appendChild(btn);
      });

      renderPicker(wrap);

      savingsEl = document.createElement('div');
      savingsEl.className = 'ccf-qt-savings';
      wrap.appendChild(savingsEl);
      updateSavings();

      if (isSample) {
        var sampleNote = document.createElement('div');
        sampleNote.className = 'ccf-qt-sample-note';
        sampleNote.textContent = 'Sample preview — shown only in the theme editor';
        wrap.appendChild(sampleNote);
      }
    }

    // ── Rows layout ─────────────────────────────────────────────────────────
    // One radio row per tier (plus an optional "1 item" row at full price).
    // Prices: discounted total for the row's quantity, the full total struck through,
    // and the per-item price. Same rounding as the cards and the checkout discount.

    function setQty(newQty) {
      currentQty = newQty;
      var qtyInput = ensureQtyInput();
      if (qtyInput) {
        qtyInput.value = newQty;
        try { qtyInput.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        try { qtyInput.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
      }
      syncCodLinks(newQty);
    }

    function renderRows() {
      if (topLabel) {
        var tl = document.createElement('div');
        tl.className = 'ccf-qt-toplabel';
        tl.textContent = topLabel;
        wrap.appendChild(tl);
      }

      var container = document.createElement('div');
      container.className = 'ccf-qt-cards ccf-qt-layout-rows';
      wrap.appendChild(container);

      var options = tiers.map(function (t) {
        return { qty: t.minQty, percent: t.percent, badge: t.badge, subtitle: t.subtitle, tier: t };
      });
      if (showSingle) {
        options.unshift({ qty: 1, percent: 0, badge: '', subtitle: 'Standard price', tier: null });
      }

      var activeTier = pickTier(tiers, currentQty);

      options.forEach(function (opt) {
        var isActive = opt.tier ? activeTier === opt.tier : !activeTier;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ccf-qt-card' + (isActive ? ' ccf-qt-card--active' : '');
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        btn.setAttribute('data-min-qty', String(opt.qty));
        btn.setAttribute('data-percent', String(opt.percent));
        cardEls.push(btn);

        if (opt.badge) {
          var ribbon = document.createElement('span');
          ribbon.className = 'ccf-qt-ribbon';
          ribbon.textContent = String(opt.badge).slice(0, 20);
          btn.appendChild(ribbon);
        }

        var radio = document.createElement('span');
        radio.className = 'ccf-qt-radio';
        radio.setAttribute('aria-hidden', 'true');
        btn.appendChild(radio);

        var main = document.createElement('div');
        main.className = 'ccf-qt-row-main';
        var title = document.createElement('div');
        title.className = 'ccf-qt-row-title';
        title.appendChild(document.createTextNode(opt.qty === 1 ? '1 item' : opt.qty + ' items'));
        if (opt.tier) {
          var pill = document.createElement('span');
          pill.className = 'ccf-qt-pill';
          pill.textContent = offText(opt.tier, true);
          title.appendChild(pill);
        }
        main.appendChild(title);
        if (opt.subtitle) {
          var sub = document.createElement('div');
          sub.className = 'ccf-qt-row-sub';
          sub.textContent = String(opt.subtitle).slice(0, 40);
          main.appendChild(sub);
        }
        appendPerks(main, opt.tier);
        btn.appendChild(main);

        if (variantPricePaise !== null) {
          var rowTotal = totalMinor(opt.qty, opt.tier);
          var each = Math.round(rowTotal / opt.qty);
          var priceBox = document.createElement('div');
          priceBox.className = 'ccf-qt-row-price';
          var total = document.createElement('div');
          total.className = 'ccf-qt-row-total';
          total.textContent = formatMoney(rowTotal);
          priceBox.appendChild(total);
          if (showCompareAt && opt.tier && rowTotal < variantPricePaise * opt.qty) {
            var compare = document.createElement('s');
            compare.className = 'ccf-qt-row-compare';
            compare.textContent = formatMoney(variantPricePaise * opt.qty);
            priceBox.appendChild(compare);
          }
          if (opt.qty > 1) {
            var eachEl = document.createElement('div');
            eachEl.className = 'ccf-qt-row-each';
            eachEl.textContent = formatMoney(each) + ' / each';
            priceBox.appendChild(eachEl);
          }
          btn.appendChild(priceBox);
        }

        // Radio behaviour: clicking a row always selects it (never toggles back to 1).
        btn.addEventListener('click', function () {
          if (btn.getAttribute('aria-pressed') === 'true') return;
          setQty(opt.qty);
          render();
        });

        container.appendChild(btn);
        if (isActive) renderPicker(container);
      });

      var note = footerNote;
      var totalText = '';
      if (showTotal && variantPricePaise !== null) {
        totalText = 'Total: ' + formatMoney(totalMinor(currentQty, activeTier));
      }
      if (note || totalText) {
        var footer = document.createElement('div');
        footer.className = 'ccf-qt-footer';
        if (note) {
          var noteEl = document.createElement('span');
          noteEl.className = 'ccf-qt-footer-note';
          noteEl.textContent = note;
          footer.appendChild(noteEl);
        }
        if (totalText) {
          var totalEl = document.createElement('span');
          totalEl.className = 'ccf-qt-footer-total';
          totalEl.textContent = totalText;
          footer.appendChild(totalEl);
        }
        wrap.appendChild(footer);
      }

      // The struck price + total already show the saving, so no separate savings line here.
      savingsEl = null;

      if (isSample) {
        var sampleNote = document.createElement('div');
        sampleNote.className = 'ccf-qt-sample-note';
        sampleNote.textContent = 'Sample preview — shown only in the theme editor';
        wrap.appendChild(sampleNote);
      }
    }

    function updateSavings() {
      if (!savingsEl) return;
      var activeTier = pickTier(tiers, currentQty);
      if (activeTier && variantPricePaise !== null) {
        var totalSaving = variantPricePaise * currentQty - totalMinor(currentQty, activeTier);
        if (totalSaving > 0) {
          savingsEl.textContent = 'You save ' + formatMoney(totalSaving);
          savingsEl.style.display = '';
          return;
        }
      }
      savingsEl.style.display = 'none';
    }

    // ── Per-item colour / size picker ────────────────────────────────────────
    // One row per item with a <select> per product option (Color, Size...). Each item's variant is
    // kept in picks[]; at add-to-cart the items are grouped by variant (see submitPicks).

    function hasChoices() {
      return !!(product && Array.isArray(product.variants) && product.variants.length > 1 &&
        Array.isArray(product.options) && product.options.length > 0);
    }

    function pickerVisible() {
      return pickerOn && hasChoices() && currentQty >= 2 && currentQty <= MAX_PICK_ITEMS;
    }

    function variantById(id) {
      if (!product) return null;
      for (var i = 0; i < product.variants.length; i++) {
        if (String(product.variants[i].id) === String(id)) return product.variants[i];
      }
      return null;
    }

    function variantByOptions(values) {
      if (!product) return null;
      for (var i = 0; i < product.variants.length; i++) {
        var v = product.variants[i];
        var opts = v.options || [];
        var ok = true;
        for (var j = 0; j < values.length; j++) {
          if (String(opts[j]) !== String(values[j])) { ok = false; break; }
        }
        if (ok) return v;
      }
      return null;
    }

    function defaultPickId() {
      var v = variantById(pageVariantId) || (product && product.variants[0]);
      return v ? String(v.id) : '';
    }

    // picks[] gets exactly currentQty entries; new items start on the page's variant.
    function syncPicks() {
      var n = currentQty;
      if (picks.length > n) picks = picks.slice(0, n);
      while (picks.length < n) picks.push(defaultPickId());
    }

    // '' when the item's variant can be added, otherwise the reason.
    function pickProblem(id) {
      var v = variantById(id);
      if (!v) return 'This combination is not available';
      if (v.available === false) return 'Sold out \u2014 choose another option';
      return '';
    }

    function optionValues(opt, index) {
      if (opt && Array.isArray(opt.values) && opt.values.length) return opt.values;
      var seen = [];
      product.variants.forEach(function (v) {
        var val = v.options && v.options[index];
        if (val != null && seen.indexOf(val) === -1) seen.push(val);
      });
      return seen;
    }

    function renderPicker(parent) {
      if (!pickerVisible()) return;
      syncPicks();
      var panel = document.createElement('div');
      panel.className = 'ccf-qt-picker';
      var title = document.createElement('div');
      title.className = 'ccf-qt-picker-title';
      title.textContent = 'Choose for each item';
      panel.appendChild(title);

      picks.forEach(function (id, i) {
        var row = document.createElement('div');
        row.className = 'ccf-qt-pick-row';
        var label = document.createElement('span');
        label.className = 'ccf-qt-pick-label';
        label.textContent = 'Item ' + (i + 1);
        row.appendChild(label);

        var current = variantById(id) || variantById(defaultPickId());
        var selects = [];
        var err = document.createElement('span');
        err.className = 'ccf-qt-pick-err';

        product.options.forEach(function (opt, oi) {
          var name = typeof opt === 'string' ? opt : (opt && opt.name) || ('Option ' + (oi + 1));
          var sel = document.createElement('select');
          sel.setAttribute('aria-label', 'Item ' + (i + 1) + ' ' + name);
          optionValues(opt, oi).forEach(function (val) {
            var o = document.createElement('option');
            o.value = String(val);
            o.textContent = String(val);
            if (current && current.options && String(current.options[oi]) === String(val)) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener('change', function () {
            var values = selects.map(function (x) { return x.value; });
            var v = variantByOptions(values);
            picks[i] = v ? String(v.id) : '';
            err.textContent = pickProblem(picks[i]);
          });
          selects.push(sel);
          row.appendChild(sel);
        });

        err.textContent = pickProblem(id);
        row.appendChild(err);
        panel.appendChild(row);
      });

      var msg = document.createElement('div');
      msg.className = 'ccf-qt-picker-msg';
      msg.setAttribute('role', 'alert');
      panel.appendChild(msg);
      pickerMsgEl = msg;
      parent.appendChild(panel);
    }

    function formVariantId(form) {
      var idEl = form && form.querySelector('[name="id"]');
      return idEl ? String(idEl.value || '') : pageVariantId;
    }

    // Our own add only when an item differs from the form's variant; otherwise the theme adds as usual.
    function shouldTakeOver(form, qty) {
      if (!pickerOn || !hasChoices() || qty < 2 || qty > MAX_PICK_ITEMS || qty !== currentQty) return false;
      syncPicks();
      var fid = formVariantId(form);
      return picks.some(function (id) { return id !== fid; });
    }

    function submitPicks(qty) {
      syncPicks();
      for (var i = 0; i < picks.length; i++) {
        var problem = pickProblem(picks[i]);
        if (problem) {
          if (pickerMsgEl) pickerMsgEl.textContent = 'Item ' + (i + 1) + ': ' + problem;
          return;
        }
      }
      if (pickerMsgEl) pickerMsgEl.textContent = '';
      var counts = {};
      var order = [];
      picks.forEach(function (id) {
        if (!counts[id]) { counts[id] = 0; order.push(id); }
        counts[id] += 1;
      });
      var items = order.map(function (id) { return { id: Number(id), quantity: counts[id] }; });
      var gift = perksFor(qty).gift;
      var giftId = gift && /^\d+$/.test(String(gift.variantId || '')) ? Number(gift.variantId) : null;

      fetch('/cart.js', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .catch(function () { return null; })
        .then(function (cart) {
          var inCart = giftId && cart && (cart.items || []).some(function (it) {
            return it.variant_id === giftId && it.properties && it.properties._ccf_gift;
          });
          if (giftId && !inCart) items.push({ id: giftId, quantity: 1, properties: { _ccf_gift: '1' } });
          return fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ items: items }),
          });
        })
        .then(function (r) {
          if (r && r.ok) {
            goToCart();
          } else if (pickerMsgEl) {
            pickerMsgEl.textContent = 'Could not add to cart. Please try again.';
          }
        })
        .catch(function () {
          if (pickerMsgEl) pickerMsgEl.textContent = 'Could not add to cart. Please try again.';
        });
    }

    // Separate so tests can replace it (jsdom cannot navigate).
    function goToCart() {
      if (typeof window.__ccfQtGoToCart === 'function') { window.__ccfQtGoToCart(); return; }
      window.location.href = '/cart';
    }

    // ── Quantity tracking ─────────────────────────────────────────────────────

    function onQtyInput(newQty) {
      if (typeof newQty !== 'number' || !isFinite(newQty) || newQty < 1) return;
      currentQty = Math.floor(newQty);
      syncCodLinks(currentQty);
      if (layout === 'rows' || pickerVisible()) {
        // Rows show the total for the chosen quantity, and the picker needs one row per item,
        // so redraw instead of only moving the highlight.
        render();
        return;
      }
      var activeTier = pickTier(tiers, currentQty);
      cardEls.forEach(function (btn) {
        var isActive = activeTier && parseInt(btn.getAttribute('data-min-qty'), 10) === activeTier.minQty;
        btn.className = 'ccf-qt-card' + (isActive ? ' ccf-qt-card--active' : '');
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
      updateSavings();
    }

    // ── Variant price update ──────────────────────────────────────────────────

    function updateVariant(variantId) {
      if (!handle) return;
      // Items still on the old page variant follow the shopper's new choice on the page.
      var old = pageVariantId;
      pageVariantId = String(variantId || '');
      picks = picks.map(function (id) { return id === old ? pageVariantId : id; });
      getVariantPrice(handle, variantId).then(function (price) {
        if (price !== null) {
          variantPricePaise = price;
          render();
        }
      });
    }

    // ── Free gift: add it to the cart when a gift tier is added ─────────────────
    // The gift goes in as its own line with the hidden property _ccf_gift=1; the checkout function
    // makes one unit of it free while the tier is reached (and never counts it toward a tier).
    // "Buy it now" skips the cart, so it gets no gift.

    function addGiftIfNeeded(qty) {
      var gift = perksFor(qty).gift;
      if (!gift || !/^\d+$/.test(String(gift.variantId || '')) || window.__ccfQtGiftAdding || isSample) return;
      window.__ccfQtGiftAdding = true;
      var giftId = Number(gift.variantId);
      // Let the theme's own add-to-cart finish first, then check the cart.
      setTimeout(function () {
        fetch('/cart.js', { headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json(); })
          .then(function (cart) {
            var items = (cart && cart.items) || [];
            var already = items.some(function (it) {
              return it.variant_id === giftId && it.properties && it.properties._ccf_gift;
            });
            if (already) return null;
            return fetch('/cart/add.js', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify({ items: [{ id: giftId, quantity: 1, properties: { _ccf_gift: '1' } }] }),
            }).then(function (r) {
              if (r && r.ok) {
                try { document.dispatchEvent(new CustomEvent('ccf:gift-added', { detail: { variantId: giftId } })); } catch (e) {}
              }
            });
          })
          .catch(function () {})
          .then(function () { window.__ccfQtGiftAdding = false; });
      }, 1200);
    }

    // One page-wide submit listener, always calling the newest widget (the theme editor re-runs
    // the block without a page load; extra listeners would add the gift more than once).
    window.__ccfQtOnCartSubmit = function (form, e) {
      var qtyEl = form.querySelector('input[name="quantity"]');
      var qty = qtyEl ? parseInt(qtyEl.value, 10) : currentQty;
      qty = isFinite(qty) && qty > 0 ? qty : currentQty;
      if (shouldTakeOver(form, qty)) {
        // Items with different colours/sizes: stop the theme's single-variant add and add each
        // variant ourselves (plus the free gift), then open the cart.
        if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
        submitPicks(qty);
        return;
      }
      addGiftIfNeeded(qty);
    };
    if (!window.__ccfQtSubmitBound) {
      window.__ccfQtSubmitBound = true;
      document.addEventListener('submit', function (e) {
        var form = e.target;
        if (!form || !form.getAttribute) return;
        if (String(form.getAttribute('action') || '').indexOf('/cart/add') === -1) return;
        if (typeof window.__ccfQtOnCartSubmit === 'function') window.__ccfQtOnCartSubmit(form, e);
      }, true);
    }

    // ── Event listeners ───────────────────────────────────────────────────────

    document.addEventListener('change', function (e) {
      if (!e.target) return;
      if (e.target.name === 'quantity') {
        onQtyInput(parseInt(e.target.value, 10));
      }
      if (e.target.name === 'id') {
        updateVariant(e.target.value);
      }
    });

    document.addEventListener('input', function (e) {
      if (e.target && e.target.name === 'quantity') {
        onQtyInput(parseInt(e.target.value, 10));
      }
    });

    document.addEventListener('variant:change', function (e) {
      var v = e.detail && e.detail.variant;
      if (v && v.id) updateVariant(String(v.id));
      if (v && v.price != null) {
        variantPricePaise = v.price;
        render();
      }
    });

    document.addEventListener('variantChange', function (e) {
      var v = e.detail && e.detail.variant;
      if (v && v.id) updateVariant(String(v.id));
      if (v && v.price != null) {
        variantPricePaise = v.price;
        render();
      }
    });

    // ── Initial render ────────────────────────────────────────────────────────

    render();

    if (handle) {
      getVariantPrice(handle, initialVariantId).then(function (price) {
        var hadProduct = !!product;
        product = productCache[handle] || null;
        if (!pageVariantId && product && product.variants && product.variants[0]) {
          pageVariantId = String(product.variants[0].id);
        }
        if (price !== null && price !== variantPricePaise) {
          variantPricePaise = price;
          render();
        } else if (!hadProduct && pickerVisible()) {
          render();
        }
      });
    }
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  function bootstrap() {
    var wrap = document.getElementById('ccf-qt-root');
    if (!wrap) return;

    var config = getInlineConfig();
    if (config !== null) {
      init(config);
      return;
    }

    var shopDomain = wrap.getAttribute('data-shop') || '';
    if (!shopDomain) return;
    fetchConfig(shopDomain).then(init);
  }

  // Once per block element (the theme editor re-renders sections without a page load).
  function start() {
    var wrap = document.getElementById('ccf-qt-root');
    if (!wrap || wrap.getAttribute('data-ccf-ready')) return;
    wrap.setAttribute('data-ccf-ready', '1');
    bootstrap();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
  document.addEventListener('shopify:section:load', start);
})();
