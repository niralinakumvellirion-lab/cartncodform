'use strict';

/**
 * "Price drop" — admin, /api/price-drop. See routes/alertAdmin.js.
 */

const { makeAlertAdmin } = require('./alertAdmin');
const PriceDropConfig = require('../models/PriceDropConfig');
const PriceDropRequest = require('../models/PriceDropRequest');
const { sanitizeSettings, withDefaults, buildMessage } = require('../utils/priceDrop');

module.exports = makeAlertAdmin({
  Config: PriceDropConfig,
  Request: PriceDropRequest,
  sanitizeSettings,
  withDefaults,
  buildMessage,
  signalType: 'price_drop',
  tag: 'price-drop',
  name: 'price drop',
  label: 'Price drop',
});
