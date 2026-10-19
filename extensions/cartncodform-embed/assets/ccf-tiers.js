/* ccf-tiers.js — Quantity Tier Cards, CartnCodForm
   CSS: all classes prefixed .ccf-qt-*  No global leaks. */
(function () {
  'use strict';

  // ── Config resolution ──────────────────────────────────────────────────────

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
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
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

  function getVariantPrice(handle, variantId) {
    var key = handle + ':' + variantId;
    if (priceCache[key] != null) return Promise.resolve(priceCache[key]);
    return fetch('/products/' + encodeURIComponent(handle) + '.js')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !Array.isArray(d.variants)) return null;
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
      // narrow: 3 or 4 cols collapse to 2
      '@container ccf-qt (max-width:480px){.ccf-qt-cards-n3,.ccf-qt-cards-n4{grid-template-columns:repeat(2,minmax(0,1fr))}}',
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
      // ── Savings ──
      '.ccf-qt-savings{font-size:13px;font-weight:700;color:#0F766E;background:#E0F5F1;border-radius:8px;padding:8px 12px;margin-top:8px;display:none}',
      // ── Placeholder ──
      '.ccf-qt-placeholder{border:2px dashed #d4d4d8;border-radius:12px;padding:24px;text-align:center;color:#71717a;font-size:13px;font-family:inherit}',
      // ── Reduced motion ──
      '@media (prefers-reduced-motion:no-preference){.ccf-qt-card{transition:box-shadow .15s,background .15s}}',
    ].join('');
    document.head.appendChild(style);
  }

  // ── Main init ──────────────────────────────────────────────────────────────

  function init(config) {
    var wrap = document.getElementById('ccf-qt-root');
    if (!wrap) return;

    // Design mode: replace with placeholder
    if (window.Shopify && window.Shopify.designMode) {
      injectStyles('#4F46E5');
      var ph = document.createElement('div');
      ph.className = 'ccf-qt-placeholder';
      var strong = document.createElement('strong');
      strong.textContent = 'Quantity Tiers — CartnCodForm';
      var span = document.createElement('span');
      span.textContent = ' (configure in the admin app)';
      ph.appendChild(strong);
      ph.appendChild(span);
      wrap.parentNode && wrap.parentNode.replaceChild(ph, wrap);
      return;
    }

    if (!config || !config.enabled || !Array.isArray(config.tiers) || config.tiers.length === 0) {
      wrap.parentNode && wrap.parentNode.removeChild(wrap);
      return;
    }

    var tiers = config.tiers;
    var accentColor = ACCENT_RE.test(config.accentColor || '') ? config.accentColor : '#4F46E5';
    var heading = String(config.heading || 'Buy more, save more');
    var layout = config.layout === 'list' ? 'list' : 'cards';
    var handle = String(wrap.getAttribute('data-handle') || '');
    var initialVariantId = String(wrap.getAttribute('data-variant-id') || '');

    injectStyles(accentColor);

    var variantPricePaise = null;
    var currentQty = 1;
    var savingsEl = null;
    var cardEls = [];

    // ── DOM helpers ─────────────────────────────────────────────────────────

    function findQtyInput() {
      return document.querySelector('form[action*="/cart/add"] input[name="quantity"]');
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
          chip.textContent = tier.percent + '% off';
          btn.appendChild(chip);

          if (variantPricePaise !== null) {
            var discPaise = discountedUnitPricePaise(variantPricePaise, tier.percent);
            var priceEl = document.createElement('div');
            priceEl.className = 'ccf-qt-price';
            priceEl.textContent = formatMoney(Math.round(discPaise)) + ' each';
            btn.appendChild(priceEl);
          }
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
            var discPaiseL = discountedUnitPricePaise(variantPricePaise, tier.percent);
            var priceElL = document.createElement('div');
            priceElL.className = 'ccf-qt-list-price';
            priceElL.textContent = formatMoney(Math.round(discPaiseL)) + ' each';
            left.appendChild(priceElL);
          }
          btn.appendChild(left);

          // Right side: chip
          var chipL = document.createElement('div');
          chipL.className = 'ccf-qt-chip';
          chipL.textContent = tier.percent + '% off';
          btn.appendChild(chipL);
        }

        btn.addEventListener('click', function () {
          var newQty = tier.minQty;
          if (btn.getAttribute('aria-pressed') === 'true') {
            newQty = 1; // clicking active card → reset to 1
          }
          currentQty = newQty;
          var qtyInput = findQtyInput();
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

      savingsEl = document.createElement('div');
      savingsEl.className = 'ccf-qt-savings';
      wrap.appendChild(savingsEl);
      updateSavings();
    }

    function updateSavings() {
      if (!savingsEl) return;
      var activeTier = pickTier(tiers, currentQty);
      if (activeTier && variantPricePaise !== null) {
        var discPaise = Math.round(discountedUnitPricePaise(variantPricePaise, activeTier.percent));
        var savingPerUnit = variantPricePaise - discPaise;
        var totalSaving = savingPerUnit * currentQty;
        if (totalSaving > 0) {
          savingsEl.textContent = 'You save ' + formatMoney(totalSaving);
          savingsEl.style.display = '';
          return;
        }
      }
      savingsEl.style.display = 'none';
    }

    // ── Quantity tracking ─────────────────────────────────────────────────────

    function onQtyInput(newQty) {
      if (typeof newQty !== 'number' || !isFinite(newQty) || newQty < 1) return;
      currentQty = Math.floor(newQty);
      syncCodLinks(currentQty);
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
      getVariantPrice(handle, variantId).then(function (price) {
        if (price !== null) {
          variantPricePaise = price;
          render();
        }
      });
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
        if (price !== null && price !== variantPricePaise) {
          variantPricePaise = price;
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
