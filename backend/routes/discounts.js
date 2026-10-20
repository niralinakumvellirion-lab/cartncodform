const express = require('express');
const router = express.Router();

const Store = require('../models/Store');
const DiscountConfig = require('../models/DiscountConfig');
const { requireAuth, requireStoreOwner } = require('../middleware/requireOwner');
const { verifyProxySignature, API_VERSION } = require('../utils/shopify');
const { sanitizeTiers, sanitizeAccentColor, DEFAULT_ACCENT } = require('../utils/quantityTiers');
const tierSync = require('../services/tierSync');

// The four storefront actions that can earn a discount code, and the
// DiscountConfig sub-doc key each maps to. 'birthday' is poller-only.
const ACTIONS = ['push', 'email', 'phone', 'both', 'whatsapp', 'birthday'];

// In-memory rate limiter for the 'whatsapp' action.
// Key: ip|shop|sessionId — sessionId differentiates visitors sharing a
// public IP (CGNAT, corporate NAT) so one visitor's limit never blocks
// another's. Limit intentionally generous (30/min) since a real visitor
// has at most one popup interaction per session.
const _waRateMap = {};
const _WA_RATE_WINDOW = 60 * 1000; // 1 minute
const _WA_RATE_LIMIT = 30;
function _waRateCheck(ip, shop, sessionId) {
  const key = (ip || '') + '|' + (shop || '') + '|' + (sessionId || '');
  const now = Date.now();
  if (!_waRateMap[key]) _waRateMap[key] = [];
  _waRateMap[key] = _waRateMap[key].filter(function (t) { return now - t < _WA_RATE_WINDOW; });
  if (_waRateMap[key].length >= _WA_RATE_LIMIT) return false;
  _waRateMap[key].push(now);
  return true;
}
const DEFAULT_PREFIX = {
  pushDiscount: 'PUSH',
  emailDiscount: 'EMAIL',
  phoneDiscount: 'PHONE',
  bothDiscount: 'VIP',
};

// A full config object with schema defaults — returned by GET when the shop
// has never saved the Discounts screen, so the admin always renders a
// complete form.
function defaultConfig(shop) {
  return {
    shopDomain: shop,
    pushDiscount: { enabled: false, percentage: 10, maxUses: 100, expiryDays: 7, prefix: 'PUSH', offerText: '' },
    emailDiscount: { enabled: false, percentage: 15, maxUses: 100, expiryDays: 7, prefix: 'EMAIL', offerText: '' },
    phoneDiscount: { enabled: false, percentage: 15, maxUses: 100, expiryDays: 7, prefix: 'PHONE', offerText: '' },
    bothDiscount: { enabled: false, percentage: 20, maxUses: 100, expiryDays: 7, prefix: 'VIP', offerText: '' },
    offerHeadline: 'Get a discount on your first order!',
    whatsappCapture: { enabled: false },
    birthdayCapture: {
      popup: { enabled: false },
      banner: { enabled: false, text: '', buttonText: 'Get my gift', dismissDays: 7, bgColor: '#3730A3', textColor: 'auto', highlight: true },
      postOrder: { enabled: false },
    },
    birthdayDiscount: { enabled: false, percentage: 15, expiryDays: 7, leadDays: 3, prefix: 'BDAY', offerText: '', consentText: "We'll use your birthday only to send you a birthday offer." },
    quantityTiers: {
      enabled: false,
      heading: 'Buy more, save more',
      accentColor: DEFAULT_ACCENT,
      layout: 'cards',
      scope: 'all',
      tiers: [
        { minQty: 2, percent: 10, badge: '' },
        { minQty: 3, percent: 15, badge: 'Most popular' },
        { minQty: 4, percent: 25, badge: 'Best value' },
      ],
      discountId: '',
      lastSyncAt: null,
      lastSyncError: '',
    },
    popupCopy: {
      emailPlaceholder: '', captureButton: '', subscribedTitle: '',
      subscribedSub: '', unlockedTitle: '', unlockedSub: '',
      bdSub: '', bdButton: '', bdSkip: '', bdOkTitle: '', bdOkSub: '',
    },
  };
}

// Only these two actions are still offered by the storefront popup; phone /
// both are kept in the schema for old documents but are always saved disabled.
const EDITABLE_KEYS = ['pushDiscount', 'emailDiscount'];
const DISABLED_KEYS = ['phoneDiscount', 'bothDiscount'];
const OFFER_TEXT_MAX = 120;

const POPUP_COPY_KEYS = [
  'emailPlaceholder', 'captureButton', 'subscribedTitle', 'subscribedSub',
  'unlockedTitle', 'unlockedSub', 'bdSub', 'bdButton', 'bdSkip',
  'bdOkTitle', 'bdOkSub',
];
const POPUP_COPY_MAX = {
  emailPlaceholder: 40,  captureButton: 50,
  subscribedTitle: 40,   subscribedSub: 60,
  unlockedTitle: 40,     unlockedSub: 60,
  bdSub: 120,            bdButton: 30,
  bdSkip: 30,            bdOkTitle: 40,
  bdOkSub: 120,
};

function sanitizePopupCopy(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const k of POPUP_COPY_KEYS) {
    if (k in raw) {
      // Coerce to string, trim, strip control chars / newlines, truncate.
      const s = String(raw[k]).replace(/[\x00-\x1F\x7F]/g, '').trim();
      out[`popupCopy.${k}`] = s.slice(0, POPUP_COPY_MAX[k]);
    }
  }
  return out;
}

// Clamp / coerce one incoming rule sub-doc before it is written.
function sanitizeRule(input, fallbackPrefix) {
  const r = input && typeof input === 'object' ? input : {};
  const pct = Number(r.percentage);
  const uses = Number(r.maxUses);
  const days = Number(r.expiryDays);
  const prefix = String(r.prefix || fallbackPrefix)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  return {
    enabled: !!r.enabled,
    percentage: Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 10,
    maxUses: Number.isFinite(uses) ? Math.min(100000, Math.max(1, Math.round(uses))) : 100,
    expiryDays: Number.isFinite(days) ? Math.min(365, Math.max(1, Math.round(days))) : 7,
    prefix: prefix || fallbackPrefix,
    offerText: typeof r.offerText === 'string'
      ? r.offerText.trim().slice(0, OFFER_TEXT_MAX)
      : '',
  };
}

/**
 * Core: create a single-use-limited Shopify discount code for `action`.
 * Shared by the storefront POST route below and proxy.js POST /generate-discount.
 *
 * @returns {Promise<{code: string|null, percentage?: number, expiryDays?: number, error?: string}>}
 */
async function generateDiscount(shopDomain, body = {}, opts = {}) {
  const shop = String(shopDomain || '').trim().toLowerCase();
  const action = String(body.action || '').trim();

  if (!shop || ACTIONS.indexOf(action) === -1) {
    return { code: null, error: 'Invalid action' };
  }

  // Birthday action: unique-use (limit 1) code from birthdayDiscount config.
  // Called by the poller at send time — never from the storefront directly.
  if (action === 'birthday') {
    const [bdConfig, bdStore] = await Promise.all([
      DiscountConfig.findOne({ shopDomain: shop }),
      Store.findOne({ shopDomain: shop }).select('accessToken onlineAccessToken onlineTokenExpiresAt'),
    ]);
    if (!bdStore || !bdStore.accessToken) return { code: null, error: 'Store not connected' };
    const bdCfg = bdConfig && bdConfig.birthdayDiscount;
    if (!bdCfg || !bdCfg.enabled) return { code: null, error: 'Birthday discount not enabled' };

    let bdToken = bdStore.onlineAccessToken || bdStore.accessToken;
    if (bdStore.onlineAccessToken && bdStore.onlineTokenExpiresAt && new Date() > bdStore.onlineTokenExpiresAt) {
      bdToken = bdStore.accessToken;
    }

    const bdPrefix = String(bdCfg.prefix || 'BDAY').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'BDAY';
    const bdCode = bdPrefix + '_' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const bdStartsAt = new Date(Date.now() - 60 * 1000);
    const bdEndsAt = new Date();
    bdEndsAt.setDate(bdEndsAt.getDate() + (bdCfg.expiryDays || 7));

    const bdMutation = `
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode { id }
          userErrors { field message }
        }
      }
    `;
    const bdVariables = {
      basicCodeDiscount: {
        title: bdCode, code: bdCode,
        startsAt: bdStartsAt.toISOString(), endsAt: bdEndsAt.toISOString(),
        customerGets: { value: { percentage: (bdCfg.percentage || 15) / 100 }, items: { all: true } },
        appliesOncePerCustomer: true,
        usageLimit: 1,
        context: { all: 'ALL' },
      },
    };
    let bdData;
    try {
      const bdRes = await fetch(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': bdToken },
        body: JSON.stringify({ query: bdMutation, variables: bdVariables }),
      });
      bdData = await bdRes.json();
    } catch (err) {
      console.error('[discounts] birthday Shopify API error:', err.message);
      return { code: null, error: 'Discount service unavailable' };
    }
    if (Array.isArray(bdData && bdData.errors) && bdData.errors.length) {
      console.error('[discounts] birthday GraphQL error:', bdData.errors[0].message);
      return { code: null, error: 'Discount creation failed' };
    }
    const bdErrors = bdData && bdData.data && bdData.data.discountCodeBasicCreate && bdData.data.discountCodeBasicCreate.userErrors;
    if (bdErrors && bdErrors.length) {
      console.error('[discounts] birthday discountCodeBasicCreate userErrors:', bdErrors[0].message);
      return { code: null, error: bdErrors[0].message };
    }
    const bdNode = bdData && bdData.data && bdData.data.discountCodeBasicCreate && bdData.data.discountCodeBasicCreate.codeDiscountNode;
    if (!bdNode || !bdNode.id) {
      console.error('[discounts] birthday discountCodeBasicCreate returned no node.id');
      return { code: null, error: 'Discount creation failed' };
    }
    return { code: bdCode, percentage: bdCfg.percentage, expiryDays: bdCfg.expiryDays, shop };
  }

  // WhatsApp-capture action: no discount minted — profile upsert only.
  if (action === 'whatsapp') {
    // Rate-limit via caller-supplied IP + sessionId (per-session key so
    // visitors behind shared NAT/CGNAT don't block each other).
    if (opts.ip && !_waRateCheck(opts.ip, shop, opts.sessionId || '')) {
      return { code: null, error: 'Too many requests' };
    }
    const waConfig = await DiscountConfig.findOne({ shopDomain: shop });
    if (!waConfig || !waConfig.whatsappCapture || !waConfig.whatsappCapture.enabled) {
      return { code: null, error: 'WhatsApp capture not enabled' };
    }
    const waConsent = body.whatsappConsent === true;
    if (!waConsent) return { code: null, error: 'Consent required' };
    const waPhone = body.whatsappPhone ? String(body.whatsappPhone).trim() : '';
    if (!waPhone) return { code: null, error: 'Invalid phone number' };
    const { normalizePhone } = require('../utils/phone');
    const { upsertProfile } = require('../services/profileService');
    const waCountry = body.whatsappCountry || 'IN';
    const normalized = normalizePhone(waPhone, waCountry);
    if (!normalized) return { code: null, error: 'Invalid phone number' };
    const cartToken = body.cartToken ? String(body.cartToken).trim() : null;
    upsertProfile(
      shop,
      { phone: normalized, email: null, sessionId: body.sessionId || null, cartToken },
      { 'channels.whatsapp.phone': normalized, 'channels.whatsapp.consentedAt': new Date(), 'channels.whatsapp.source': 'popup', lastSeenAt: new Date() }
    ).catch(() => {});
    return { success: true, whatsapp: true };
  }

  const [config, store] = await Promise.all([
    DiscountConfig.findOne({ shopDomain: shop }),
    Store.findOne({ shopDomain: shop }).select(
      'accessToken onlineAccessToken onlineTokenExpiresAt'
    ),
  ]);

  if (!store || !store.accessToken) {
    return { code: null, error: 'Store not connected' };
  }

  // Prefer the online token (shpua_) — works with new Shopify API.
  // Fall back to the offline token for backwards compatibility.
  let apiToken = store.onlineAccessToken || store.accessToken;

  // Check if the online token is expired.
  if (store.onlineAccessToken && store.onlineTokenExpiresAt) {
    if (new Date() > store.onlineTokenExpiresAt) {
      console.log('[discounts] online token expired for', shop);
      // Fall back to offline token.
      apiToken = store.accessToken;
    }
  }

  console.log(
    '[discounts] using token type:',
    apiToken && apiToken.startsWith('shpua_') ? 'online' : 'offline'
  );

  // Resolution order: {action}Discount first; if that rule is disabled but
  // bothDiscount is enabled, fall back to bothDiscount's settings so the
  // customer still gets a code when the merchant only configured the combined
  // rule (push+email together) rather than per-channel rules.
  const primaryCfg = config && config[action + 'Discount'];
  const bothCfg = config && config.bothDiscount;
  const cfg = (primaryCfg && primaryCfg.enabled)
    ? primaryCfg
    : (bothCfg && bothCfg.enabled ? bothCfg : null);
  if (!cfg) {
    // Neither the direct rule nor the bothDiscount fallback is active.
    return { code: null, shop };
  }

  const code =
    (cfg.prefix || action.toUpperCase()) +
    '_' +
    Math.random().toString(36).slice(2, 8).toUpperCase();

  // Back-date startsAt by a minute so a small client/server clock skew can't
  // make Shopify reject the code as "starts in the future".
  const startsAt = new Date(Date.now() - 60 * 1000);
  const endsAt = new Date();
  endsAt.setDate(endsAt.getDate() + (cfg.expiryDays || 7));

  const mutation = `
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) {
                nodes { code }
              }
            }
          }
        }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    basicCodeDiscount: {
      title: code,
      code,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      customerGets: {
        value: { percentage: (cfg.percentage || 0) / 100 },
        items: { all: true },
      },
      appliesOncePerCustomer: true,
      usageLimit: cfg.maxUses || 100,
      // Required as of the 2024-10+ discounts schema: eligibility now goes
      // through `context` (the legacy `customerSelection` field is
      // deprecated). Omitting it is what produces Shopify's userErrors
      // message "Context can't be blank". { all: ALL } = applies to every
      // buyer, matching the old customerSelection: { all: true } behavior.
      context: { all: 'ALL' },
    },
  };

  let data;
  try {
    const shopifyRes = await fetch(
      `https://${shop}/admin/api/${API_VERSION}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': apiToken,
        },
        body: JSON.stringify({ query: mutation, variables }),
      }
    );
    data = await shopifyRes.json();
  } catch (err) {
    console.error('[discounts] Shopify API error:', err.message);
    return { code: null, error: 'Discount service unavailable' };
  }

  // 1. Top-level GraphQL errors (auth / throttling / schema) — the mutation
  //    never ran. This is the ACCESS_DENIED case when the installed token
  //    predates the write_discounts scope. Do NOT log the token or any PII.
  if (Array.isArray(data && data.errors) && data.errors.length) {
    const gqlCode =
      (data.errors[0].extensions && data.errors[0].extensions.code) ||
      data.errors[0].message;
    console.error('[discounts] GraphQL error: ' + gqlCode);
    if (gqlCode === 'ACCESS_DENIED') {
      // Flag the store so the admin can prompt the merchant to reconnect.
      Store.updateOne({ shopDomain: shop }, { $set: { needsReauth: true } }).catch(() => {});
    }
    return { code: null, error: 'Discount creation failed' };
  }

  // 2. Field-level userErrors from the mutation itself (bad input, limits).
  const errors =
    data &&
    data.data &&
    data.data.discountCodeBasicCreate &&
    data.data.discountCodeBasicCreate.userErrors;
  if (errors && errors.length) {
    console.error('[discounts] discountCodeBasicCreate userErrors:', errors[0].message);
    return { code: null, error: errors[0].message };
  }

  // 3. Success requires a real node id. Anything else means the code was NOT
  //    created in Shopify — never hand back a code Shopify doesn't know.
  const node =
    data &&
    data.data &&
    data.data.discountCodeBasicCreate &&
    data.data.discountCodeBasicCreate.codeDiscountNode;
  if (!node || !node.id) {
    console.error('[discounts] discountCodeBasicCreate returned no codeDiscountNode.id');
    return { code: null, error: 'Discount creation failed' };
  }

  // Best-effort: attach the captured email/phone to a profile. Never blocks
  // the response and never logs the PII.
  const email = body.email ? String(body.email).trim() : '';
  const phone = body.phone ? String(body.phone).trim() : '';
  const cartToken = body.cartToken ? String(body.cartToken).trim() : null;
  if (email || phone) {
    try {
      const { upsertProfile } = require('../services/profileService');
      upsertProfile(
        shop,
        {
          email: email || null,
          phone: phone || null,
          sessionId: body.sessionId || null,
          cartToken: cartToken || null,
        },
        {
          ...(email
            ? {
                'channels.email.address': email.toLowerCase(),
                'channels.email.source': 'popup',
                'channels.email.capturedAt': new Date(),
              }
            : {}),
          lastSeenAt: new Date(),
        }
      ).catch((err) => {
        console.error('[discount] upsertProfile failed for', shop, action, err.message);
      });
    } catch (e) {
      /* profileService optional — ignore */
    }
  }

  // WhatsApp consent capture — only when the storefront sends explicit consent
  // AND the merchant has the whatsappCapture flag enabled.
  const waPhone = body.whatsappPhone ? String(body.whatsappPhone).trim() : '';
  const waConsent = body.whatsappConsent === true;
  const waFlagOn = !!(config && config.whatsappCapture && config.whatsappCapture.enabled);
  if (waPhone && waConsent && waFlagOn) {
    try {
      const { normalizePhone } = require('../utils/phone');
      const { upsertProfile: upsertWa } = require('../services/profileService');
      const waCountry = body.whatsappCountry || 'IN';
      const normalized = normalizePhone(waPhone, waCountry);
      if (normalized) {
        upsertWa(
          shop,
          {
            phone: normalized,
            email: email || null,
            sessionId: body.sessionId || null,
            cartToken: cartToken || null,
          },
          {
            'channels.whatsapp.phone': normalized,
            'channels.whatsapp.consentedAt': new Date(),
            'channels.whatsapp.source': 'popup',
            lastSeenAt: new Date(),
          }
        ).catch((err) => {
          console.error('[discount] upsertWa failed for', shop, action, err.message);
        });
      }
    } catch (e) {
      /* phone normalizer optional — ignore */
    }
  }

  // `shop` is included so the storefront can build /discount/<code> redirect
  // URLs (and absolute links) client-side without a second round-trip.
  return { code, percentage: cfg.percentage, expiryDays: cfg.expiryDays, shop };
}

/**
 * GET /api/discounts/:shopDomain/config
 * Admin only. Returns { config } — a full object even when no row exists yet.
 */
router.get('/:shopDomain/config', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const doc = await DiscountConfig.findOne({ shopDomain: shop }).lean();
    return res.json({
      config: doc || defaultConfig(shop),
      // Surfaces the "reconnect to enable discounts" banner in the admin.
      needsReauth: !!(req.store && req.store.needsReauth),
    });
  } catch (err) {
    console.error('[discounts] GET config error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch discount config' });
  }
});

/**
 * PATCH /api/discounts/:shopDomain/config
 * Admin only. Upserts the DiscountConfig with pushDiscount / emailDiscount
 * (replaced wholesale, clamped, incl. offerText) and offerHeadline; phoneDiscount
 * and bothDiscount are always saved with enabled:false.
 * -> { updated: true, config }
 */
router.patch('/:shopDomain/config', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const set = { updatedAt: new Date() };

    for (const key of EDITABLE_KEYS) {
      if (req.body[key] && typeof req.body[key] === 'object') {
        set[key] = sanitizeRule(req.body[key], DEFAULT_PREFIX[key]);
      }
    }
    // phone / both can no longer be turned on: force them off on every save,
    // leaving their other stored fields untouched.
    for (const key of DISABLED_KEYS) {
      set[`${key}.enabled`] = false;
    }
    if (typeof req.body.offerHeadline === 'string') {
      set.offerHeadline = req.body.offerHeadline.slice(0, 200);
    }
    if (req.body.whatsappCapture && typeof req.body.whatsappCapture.enabled === 'boolean') {
      set['whatsappCapture.enabled'] = req.body.whatsappCapture.enabled;
    }
    if (req.body.birthdayCapture && typeof req.body.birthdayCapture === 'object') {
      const bc = req.body.birthdayCapture;
      if (bc.popup && typeof bc.popup.enabled === 'boolean') {
        set['birthdayCapture.popup.enabled'] = bc.popup.enabled;
      }
      if (bc.postOrder && typeof bc.postOrder.enabled === 'boolean') {
        set['birthdayCapture.postOrder.enabled'] = bc.postOrder.enabled;
      }
      if (bc.banner && typeof bc.banner === 'object') {
        const bn = bc.banner;
        if (typeof bn.enabled === 'boolean') set['birthdayCapture.banner.enabled'] = bn.enabled;
        if (typeof bn.text === 'string') set['birthdayCapture.banner.text'] = bn.text.trim().slice(0, 120);
        if (typeof bn.buttonText === 'string') set['birthdayCapture.banner.buttonText'] = bn.buttonText.trim().slice(0, 40) || 'Get my gift';
        const dismissDays = Number(bn.dismissDays);
        if (Number.isFinite(dismissDays)) set['birthdayCapture.banner.dismissDays'] = Math.min(30, Math.max(1, Math.round(dismissDays)));
        if (bn.bgColor !== undefined) {
          if (!/^#[0-9a-fA-F]{6}$/.test(String(bn.bgColor || ''))) {
            return res.status(400).json({ error: 'birthdayCapture.banner.bgColor must be a 6-digit hex colour (e.g. #3730A3)' });
          }
          set['birthdayCapture.banner.bgColor'] = bn.bgColor;
        }
        if (bn.textColor !== undefined) {
          if (!['auto', 'white', 'dark'].includes(bn.textColor)) {
            return res.status(400).json({ error: 'birthdayCapture.banner.textColor must be one of: auto, white, dark' });
          }
          set['birthdayCapture.banner.textColor'] = bn.textColor;
        }
        if (bn.highlight !== undefined) set['birthdayCapture.banner.highlight'] = !!bn.highlight;
      }
    }
    if (req.body.birthdayDiscount && typeof req.body.birthdayDiscount === 'object') {
      const bd = req.body.birthdayDiscount;
      if (typeof bd.enabled === 'boolean') set['birthdayDiscount.enabled'] = bd.enabled;
      const bdPct = Number(bd.percentage);
      if (Number.isFinite(bdPct)) set['birthdayDiscount.percentage'] = Math.min(100, Math.max(0, bdPct));
      const bdDays = Number(bd.expiryDays);
      if (Number.isFinite(bdDays)) set['birthdayDiscount.expiryDays'] = Math.min(30, Math.max(1, Math.round(bdDays)));
      if (typeof bd.prefix === 'string') {
        set['birthdayDiscount.prefix'] = (String(bd.prefix).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)) || 'BDAY';
      }
      if (typeof bd.offerText === 'string') {
        set['birthdayDiscount.offerText'] = bd.offerText.trim().slice(0, OFFER_TEXT_MAX);
      }
      if (typeof bd.consentText === 'string') {
        set['birthdayDiscount.consentText'] = bd.consentText.trim().slice(0, 200);
      }
      const bdLead = Number(bd.leadDays);
      if (Number.isFinite(bdLead)) set['birthdayDiscount.leadDays'] = Math.min(7, Math.max(0, Math.round(bdLead)));
    }

    if (req.body.popupCopy && typeof req.body.popupCopy === 'object') {
      Object.assign(set, sanitizePopupCopy(req.body.popupCopy));
    }

    // ── quantityTiers validation ───────────────────────────────────────────
    let doTierSync = false;
    if (req.body.quantityTiers && typeof req.body.quantityTiers === 'object') {
      const qt = req.body.quantityTiers;

      if (typeof qt.enabled === 'boolean') {
        set['quantityTiers.enabled'] = qt.enabled;
        doTierSync = true;
      }
      if (typeof qt.heading === 'string') {
        const h = qt.heading.trim().slice(0, 60);
        if (!h) return res.status(400).json({ error: 'quantityTiers.heading must not be empty' });
        set['quantityTiers.heading'] = h;
      }
      if (qt.accentColor !== undefined) {
        set['quantityTiers.accentColor'] = sanitizeAccentColor(qt.accentColor);
      }
      if (qt.layout !== undefined) {
        if (qt.layout !== 'cards' && qt.layout !== 'list')
          return res.status(400).json({ error: 'quantityTiers.layout must be "cards" or "list"' });
        set['quantityTiers.layout'] = qt.layout;
      }
      if (qt.tiers !== undefined) {
        let validated;
        try {
          validated = sanitizeTiers(qt.tiers);
        } catch (e) {
          return res.status(400).json({ error: `quantityTiers.tiers: ${e.message}` });
        }
        set['quantityTiers.tiers'] = validated;
        doTierSync = true;
      }
    }

    const config = await DiscountConfig.findOneAndUpdate(
      { shopDomain: shop },
      { $set: set, $setOnInsert: { shopDomain: shop } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    // Sync to Shopify after save — failure must not fail the HTTP response.
    let syncResult = null;
    if (doTierSync) {
      try {
        syncResult = await tierSync.syncTiers(shop);
        if (syncResult && !syncResult.synced) {
          await DiscountConfig.updateOne(
            { shopDomain: shop },
            { $set: { 'quantityTiers.lastSyncError': syncResult.error || 'Sync failed' } }
          );
        }
      } catch (syncErr) {
        console.error('[discounts] tier sync error (non-fatal):', syncErr.message);
        syncResult = { synced: false, error: syncErr.message };
        await DiscountConfig.updateOne(
          { shopDomain: shop },
          { $set: { 'quantityTiers.lastSyncError': syncErr.message } }
        ).catch(() => {});
      }
    }

    return res.json({
      updated: true,
      config,
      ...(syncResult !== null ? { synced: syncResult.synced, syncError: syncResult.error || null } : {}),
    });
  } catch (err) {
    console.error('[discounts] PATCH config error:', err.message);
    return res.status(500).json({ error: 'Failed to update discount config' });
  }
});

/**
 * POST /api/discounts/:shopDomain/sync-tiers
 * Admin only. Re-triggers the Shopify sync for quantity tiers independently.
 * -> { synced: bool, syncError? }
 */
router.post('/:shopDomain/sync-tiers', requireAuth, requireStoreOwner, async (req, res) => {
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const result = await tierSync.syncTiers(shop);
    if (!result.synced) {
      await DiscountConfig.updateOne(
        { shopDomain: shop },
        { $set: { 'quantityTiers.lastSyncError': result.error || 'Sync failed' } }
      ).catch(() => {});
    }
    return res.json({ synced: result.synced, syncError: result.error || null });
  } catch (err) {
    console.error('[discounts] sync-tiers error:', err.message);
    return res.status(500).json({ synced: false, syncError: err.message });
  }
});

/**
 * POST /api/discounts/:shopDomain/generate
 * PUBLIC — called from the storefront popup through the App Proxy, so the
 * App Proxy signature is the auth (hard-enforced). Body:
 *   { action: 'push'|'email'|'phone'|'both', email?, phone?, sessionId }
 * -> { code, percentage, expiryDays } | { code: null }
 */
router.post('/:shopDomain/generate', async (req, res) => {
  if (!verifyProxySignature(req.query)) {
    console.warn('[discounts] Invalid or missing App Proxy signature on /generate — rejecting');
    return res.status(403).json({ code: null, error: 'Invalid signature' });
  }
  try {
    const shop = req.params.shopDomain.trim().toLowerCase();
    const result = await generateDiscount(shop, req.body || {});
    return res.json(result);
  } catch (err) {
    console.error('[discounts] POST generate error:', err.message);
    return res.status(500).json({ code: null, error: 'Failed to generate discount' });
  }
});

module.exports = router;
module.exports.generateDiscount = generateDiscount;
module.exports.defaultConfig = defaultConfig;
