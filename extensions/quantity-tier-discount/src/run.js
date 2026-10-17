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

function noDiscount() {
  return { discountApplicationStrategy: 'FIRST', discounts: [] };
}

/**
 * Shopify Function entry point for purchase.product-discount.run.
 * Groups cart lines by product, applies the highest qualifying tier
 * to every variant of that product.
 */
function run(input) {
  // ── Parse config from discount node metafield ─────────────────────────────
  let config;
  try {
    const raw =
      input &&
      input.discountNode &&
      input.discountNode.metafield &&
      input.discountNode.metafield.value;
    if (!raw) return noDiscount();
    config = JSON.parse(raw);
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

  // ── Build discount entries ────────────────────────────────────────────────
  const discounts = [];
  for (const pid of Object.keys(productQty)) {
    const tier = pickTier(config.tiers, productQty[pid]);
    if (!tier) continue;
    discounts.push({
      value: { percentage: { value: String(tier.percent) } },
      targets: linesByProduct[pid].map((l) => ({
        productVariant: { id: l.merchandise.id },
      })),
      message: `Buy ${tier.minQty}+, save ${tier.percent}%`,
    });
  }

  return {
    discountApplicationStrategy: 'MAXIMUM',
    discounts,
  };
}

module.exports = { run };
