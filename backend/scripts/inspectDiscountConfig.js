/**
 * Read-only DB inspection: prints non-secret DiscountConfig fields for a shop.
 * Usage: MONGODB_URI=... node backend/scripts/inspectDiscountConfig.js <shopDomain>
 * Never prints accessToken, webhookSecret, or other secrets.
 */
'use strict';

const mongoose = require('mongoose');
const DiscountConfig = require('../models/DiscountConfig');

const shop = process.argv[2];
if (!shop) { console.error('Usage: node inspectDiscountConfig.js <shopDomain>'); process.exit(1); }

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const doc = await DiscountConfig.findOne({ shopDomain: shop }).lean();
  if (!doc) { console.log('No DiscountConfig found for', shop); }
  else {
    const safe = {
      shopDomain: doc.shopDomain,
      pushDiscount: doc.pushDiscount,
      emailDiscount: doc.emailDiscount,
      phoneDiscount: doc.phoneDiscount,
      bothDiscount: doc.bothDiscount,
      offerHeadline: doc.offerHeadline,
      whatsappCapture: doc.whatsappCapture,
      birthdayCapture: doc.birthdayCapture,
      birthdayDiscount: doc.birthdayDiscount,
      quantityTiers: doc.quantityTiers ? {
        enabled: doc.quantityTiers.enabled,
        heading: doc.quantityTiers.heading,
        layout: doc.quantityTiers.layout,
        accentColor: doc.quantityTiers.accentColor,
        tierCount: Array.isArray(doc.quantityTiers.tiers) ? doc.quantityTiers.tiers.length : 0,
      } : undefined,
      updatedAt: doc.updatedAt,
    };
    console.log(JSON.stringify(safe, null, 2));
  }
}).catch(err => {
  console.error('DB error:', err.message);
}).finally(() => mongoose.disconnect());
