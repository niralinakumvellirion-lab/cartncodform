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
      return currency + ' ' + (minorUnits / 100).toFixed(2);
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
    var style = document.createElement('style');
    style.id = 'ccf-qt-styles';
    style.textContent = [
      '.ccf-qt-wrap{margin:16px 0;font-family:inherit}',
      '.ccf-qt-heading{font-size:14px;font-weight:600;margin-bottom:10px;color:inherit}',
      '.ccf-qt-cards{display:flex;gap:10px;flex-wrap:wrap}',
      '.ccf-qt-layout-list .ccf-qt-card{flex:1 1 100%}',
      '.ccf-qt-layout-cards .ccf-qt-card{flex:1 1 0;min-width:80px}',
      '@media(max-width:479px){.ccf-qt-card{flex:1 1 100%!important}}',
      '.ccf-qt-card{position:relative;border:1px solid #e4e4e7;border-radius:10px;padding:14px 10px 10px;text-align:center;cursor:pointer;background:#fff;transition:border-color .15s;display:flex;flex-direction:column;align-items:center;gap:4px}',
      '.ccf-qt-card:focus-visible{outline:2px solid ' + accentColor + ';outline-offset:2px}',
      '.ccf-qt-card--active{border-color:' + accentColor + ';border-width:2px}',
      '.ccf-qt-badge{position:absolute;top:-10px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:700;color:#fff;padding:2px 8px;border-radius:20px;white-space:nowrap;background:' + accentColor + '}',
      '.ccf-qt-qty{font-size:14px;font-weight:700;color:inherit}',
      '.ccf-qt-chip{font-size:11px;font-weight:700;color:#fff;padding:2px 8px;border-radius:20px;background:' + accentColor + '}',
      '.ccf-qt-price{font-size:12px;color:#52525b}',
      '.ccf-qt-note{font-size:11px;color:#71717a;margin-top:8px}',
      '.ccf-qt-savings{font-size:13px;font-weight:600;color:#16a34a;margin-top:6px;display:none}',
      '.ccf-qt-placeholder{border:2px dashed #d4d4d8;border-radius:12px;padding:24px;text-align:center;color:#71717a;font-size:13px;font-family:inherit}',
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
    var accentColor = /^#[0-9A-Fa-f]{6}$/.test(config.accentColor || '') ? config.accentColor : '#4F46E5';
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
    // Update any static COD form links on the page to include the current qty.

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

      // Heading
      var h = document.createElement('div');
      h.className = 'ccf-qt-heading';
      h.textContent = heading;
      wrap.appendChild(h);

      // Cards container
      var container = document.createElement('div');
      container.className = 'ccf-qt-cards ccf-qt-layout-' + layout;
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

        if (tier.badge) {
          var badge = document.createElement('span');
          badge.className = 'ccf-qt-badge';
          badge.textContent = tier.badge;
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
          priceEl.textContent = formatMoney(Math.round(discPaise)) + '/item';
          btn.appendChild(priceEl);
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

      var note = document.createElement('div');
      note.className = 'ccf-qt-note';
      note.textContent = 'Discount applied at checkout';
      wrap.appendChild(note);

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
      // Update active card without full re-render for performance
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

    render(); // Render immediately (without prices) for fast display

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

    // Fallback: fetch from App Proxy (Shopify adds signature automatically)
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
