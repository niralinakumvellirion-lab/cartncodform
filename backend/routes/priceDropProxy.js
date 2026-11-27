'use strict';

/**
 * "Price drop" — storefront side (App Proxy /apps/cartncodform/price-drop). See routes/alertProxy.js.
 */

const { makeAlertProxy } = require('./alertProxy');
const PriceDropConfig = require('../models/PriceDropConfig');
const PriceDropRequest = require('../models/PriceDropRequest');
const { publicSettings, withDefaults, sanitizeSubscribe, expiresAt } = require('../utils/priceDrop');

module.exports = makeAlertProxy({
  Config: PriceDropConfig,
  Request: PriceDropRequest,
  publicSettings,
  withDefaults,
  sanitizeSubscribe,
  expiresAt,
  tag: 'price-drop',
  offText: 'Price drop alerts are off',
});
