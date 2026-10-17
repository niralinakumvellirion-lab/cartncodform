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

  // ── Build candidates — one per qualifying product ─────────────────────────
  const candidates = [];
  for (const pid of Object.keys(productQty)) {
    const tier = pickTier(config.tiers, productQty[pid]);
    if (!tier) continue;
    candidates.push({
      targets: linesByProduct[pid].map((l) => ({
        cartLine: { id: l.id },
      })),
      value: { percentage: { value: String(tier.percent) } },
      message: `Buy ${tier.minQty}+, save ${tier.percent}%`,
    });
  }

  if (candidates.length === 0) return noDiscount();

  return {
    operations: [{
      productDiscountsAdd: {
        candidates,
        selectionStrategy: 'FIRST',
      },
    }],
  };
}

module.exports = { run };
