'use strict';

// Inline the pure helpers so the bundled function has no backend import.
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

// "₹200", "$15.50", or "200 AED" for currencies without a symbol here. Whole amounts drop ".00".
const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$', SGD: 'S$' };
function formatAmount(amount, currencyCode) {
  const n = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  const sym = CURRENCY_SYMBOLS[currencyCode];
  if (sym) return sym + n;
  return currencyCode ? `${n} ${currencyCode}` : n;
}

// Rewards carry upward (a gift on "Buy 3+" also applies at 4+). Same rule as
// backend/utils/quantityTiers.perksFor.
function perksFor(tiers, qty) {
  const out = { freeShipping: false, gift: null };
  for (const t of tiers || []) {
    if (!t || !(t.minQty <= qty)) continue;
    if (t.freeShipping === true) out.freeShipping = true;
    if (t.gift && t.gift.variantId) out.gift = t.gift;
  }
  return out;
}

function noDiscount() {
  return { operations: [] };
}

function readConfig(input) {
  try {
    let config =
      input &&
      input.discount &&
      input.discount.metafield &&
      input.discount.metafield.jsonValue;
    if (!config) return null;
    // Defensive: tolerate a JSON string in case schema or stub changes
    if (typeof config === 'string') config = JSON.parse(config);
    if (!config.enabled || !Array.isArray(config.tiers) || config.tiers.length === 0) return null;
    return config;
  } catch (_) {
    return null;
  }
}

// The widget adds a tier's free gift with the line property _ccf_gift=1.
function isGiftLine(line) {
  return !!(line && line.giftAttribute && line.giftAttribute.value);
}

/**
 * Groups the cart's paid lines by product and picks each product's reached tier.
 * Gift lines are left out, so a free gift never counts toward a tier.
 * Returns [{ tier, qty, lines }] for products that reached a tier.
 */
function reachedTiers(input, config) {
  const productQty = Object.create(null);
  const linesByProduct = Object.create(null);
  const lines = (input && input.cart && input.cart.lines) || [];
  for (const line of lines) {
    if (!line.merchandise || line.merchandise.__typename !== 'ProductVariant') continue;
    if (isGiftLine(line)) continue;
    const pid = line.merchandise.product.id;
    productQty[pid] = (productQty[pid] || 0) + line.quantity;
    if (!linesByProduct[pid]) linesByProduct[pid] = [];
    linesByProduct[pid].push(line);
  }
  const out = [];
  for (const pid of Object.keys(productQty)) {
    const tier = pickTier(config.tiers, productQty[pid]);
    if (tier) out.push({ tier, qty: productQty[pid], lines: linesByProduct[pid] });
  }
  return out;
}

/**
 * Shopify Function entry point for cart.lines.discounts.generate.run.
 * - Each product that reaches a tier gets that tier's % or flat amount on its lines.
 * - If a reached tier has a free gift and the cart holds that gift (as a gift line),
 *   one unit of it is made free.
 * Candidates target different lines, so ALL applies each of them.
 */
function run(input) {
  const config = readConfig(input);
  if (!config) return noDiscount();

  // 'amount' tiers: a flat amount off the product's lines together (not per item). The amount is
  // set in the shop's currency; presentmentCurrencyRate converts it to the cart's currency.
  const isAmount = config.discountType === 'amount';
  const rate = Number(input && input.presentmentCurrencyRate) || 1;
  const currency = (input && input.cart && input.cart.cost && input.cart.cost.subtotalAmount &&
    input.cart.cost.subtotalAmount.currencyCode) || '';

  const reached = reachedTiers(input, config);
  const candidates = [];
  for (const { tier, lines } of reached) {
    const targets = lines.map((l) => ({ cartLine: { id: l.id } }));
    if (isAmount) {
      const amount = Math.round(Number(tier.amount) * rate * 100) / 100;
      if (!(amount > 0)) continue;
      candidates.push({
        targets,
        value: { fixedAmount: { amount: amount.toFixed(2), appliesToEachItem: false } },
        message: `Buy ${tier.minQty}+, save ${formatAmount(amount, currency)}`,
      });
    } else if (Number(tier.percent) > 0) {
      candidates.push({
        targets,
        value: { percentage: { value: String(tier.percent) } },
        message: `Buy ${tier.minQty}+, save ${tier.percent}%`,
      });
    }
  }

  // Free gift: one unit of the first gift line whose variant is a reached tier's gift.
  const giftVariants = new Set(
    reached.map((r) => {
      const g = perksFor(config.tiers, r.qty).gift;
      return g && g.variantId;
    }).filter(Boolean)
  );
  if (giftVariants.size) {
    const lines = (input && input.cart && input.cart.lines) || [];
    const giftLine = lines.find((l) =>
      isGiftLine(l) && l.merchandise && giftVariants.has(l.merchandise.id));
    if (giftLine) {
      candidates.push({
        targets: [{ cartLine: { id: giftLine.id, quantity: 1 } }],
        value: { percentage: { value: '100' } },
        message: 'Free gift',
      });
    }
  }

  if (candidates.length === 0) return noDiscount();

  return {
    operations: [{
      productDiscountsAdd: {
        candidates,
        selectionStrategy: 'ALL',
      },
    }],
  };
}

/**
 * Shopify Function entry point for cart.delivery-options.discounts.generate.run.
 * Free shipping on every delivery group when any product reaches a tier with freeShipping.
 */
function runDelivery(input) {
  const config = readConfig(input);
  if (!config) return noDiscount();
  const free = reachedTiers(input, config).some((r) => perksFor(config.tiers, r.qty).freeShipping);
  if (!free) return noDiscount();
  const groups = (input && input.cart && input.cart.deliveryGroups) || [];
  if (groups.length === 0) return noDiscount();
  return {
    operations: [{
      deliveryDiscountsAdd: {
        candidates: [{
          targets: groups.map((g) => ({ deliveryGroup: { id: g.id } })),
          value: { percentage: { value: '100' } },
          message: 'Free shipping',
        }],
        selectionStrategy: 'ALL',
      },
    }],
  };
}

// Export both names: 'run' for Jest tests, the camelCase names for the CLI entry points.
module.exports = {
  run,
  runDelivery,
  cartLinesDiscountsGenerateRun: run,
  cartDeliveryOptionsDiscountsGenerateRun: runDelivery,
};
