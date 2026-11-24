'use strict';

// Inline the two pure helpers so the bundled function has no backend import.
// Authoritative implementation lives in backend/utils/quantityTiers.js —
// keep in sync if the logic changes.
function pickTier(tiers, qty) {
  if (!Array.isArray(tiers) || tiers.length === 0) return null;
  if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 1) return null;
  let best = null;
  for (const tier of tiers) {
    if (tier.minQty <= qty) best = tier;
  }
  return best;
}

/**
 * The one price rule shared by the storefront cards (ccf-tiers.js), the COD form and prepaid offer
 * (backend/utils/quantityTiers.js) and this function: the discounted unit price in cents is
 * priceCents x (100 - percent) / 100, rounded half-up. The product is an exact integer, so a half cent
 * is exactly .5 and always rounds up the same way.
 */
function discountedUnitCents(priceCents, percent) {
  return Math.round((priceCents * (100 - percent)) / 100);
}

/**
 * Amount off ONE item, as a Decimal string in the cart's currency: price - discounted price. Sent as a
 * fixed amount per item so Shopify does no rounding of its own: the cart's per-item price is then exactly
 * the price the product page showed (App Review 2.1.4: card 18.71 vs cart 18.72 with a percentage).
 * null when the price cannot be read.
 */
function perItemDiscount(amountPerQuantity, percent) {
  const priceCents = Math.round(Number(amountPerQuantity) * 100);
  if (!Number.isFinite(priceCents) || priceCents <= 0) return null;
  const off = priceCents - discountedUnitCents(priceCents, percent);
  return (off / 100).toFixed(2);
}

function noDiscount() {
  return { operations: [] };
}

/**
 * Shopify Function entry point for cart.lines.discounts.generate.run.
 * Groups cart lines by product, applies the highest qualifying tier
 * to every line of that product.
 */
function run(input) {
  // ── Read config from discount metafield (jsonValue is already parsed) ─────
  let config;
  try {
    config =
      input &&
      input.discount &&
      input.discount.metafield &&
      input.discount.metafield.jsonValue;
    if (!config) return noDiscount();
    // Defensive: tolerate a JSON string in case schema or stub changes
    if (typeof config === 'string') config = JSON.parse(config);
  } catch (_) {
    return noDiscount();
  }

  if (!config.enabled || !Array.isArray(config.tiers) || config.tiers.length === 0) {
    return noDiscount();
  }

  // ── Group cart lines by product GID ──────────────────────────────────────
  const productQty = Object.create(null);
  const linesByProduct = Object.create(null);

  const lines = (input && input.cart && input.cart.lines) || [];
  for (const line of lines) {
    if (!line.merchandise || line.merchandise.__typename !== 'ProductVariant') continue;
    const pid = line.merchandise.product.id;
    productQty[pid] = (productQty[pid] || 0) + line.quantity;
    if (!linesByProduct[pid]) linesByProduct[pid] = [];
    linesByProduct[pid].push(line);
  }

  // ── Build candidates — one per qualifying cart line ───────────────────────
  // The tier is chosen from the product's total quantity (all its variants together); the amount off is
  // worked out per line from that line's own unit price (variants can have different prices).
  const candidates = [];
  for (const pid of Object.keys(productQty)) {
    const tier = pickTier(config.tiers, productQty[pid]);
    if (!tier) continue;
    for (const line of linesByProduct[pid]) {
      const amount = perItemDiscount(
        line.cost && line.cost.amountPerQuantity && line.cost.amountPerQuantity.amount,
        tier.percent
      );
      if (amount === null || Number(amount) <= 0) continue;
      candidates.push({
        targets: [{ cartLine: { id: line.id } }],
        value: { fixedAmount: { amount, appliesToEachItem: true } },
        message: `Buy ${tier.minQty}+, save ${tier.percent}%`,
      });
    }
  }

  if (candidates.length === 0) return noDiscount();

  return {
    operations: [{
      productDiscountsAdd: {
        candidates,
        // One candidate per cart line, never overlapping: apply them all (FIRST applied only one line).
        selectionStrategy: 'ALL',
      },
    }],
  };
}

// Export both names: 'run' for Jest tests, 'cartLinesDiscountsGenerateRun' for CLI entry
module.exports = { run, cartLinesDiscountsGenerateRun: run, discountedUnitCents, perItemDiscount };
