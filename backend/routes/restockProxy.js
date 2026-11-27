'use strict';

/**
 * "Back in stock" — storefront side (App Proxy /apps/cartncodform/restock). See routes/alertProxy.js.
 */

const { makeAlertProxy } = require('./alertProxy');
const RestockConfig = require('../models/RestockConfig');
const RestockRequest = require('../models/RestockRequest');
const { publicSettings, withDefaults, sanitizeSubscribe, expiresAt } = require('../utils/restock');

module.exports = makeAlertProxy({
  Config: RestockConfig,
  Request: RestockRequest,
  publicSettings,
  withDefaults,
  sanitizeSubscribe,
  expiresAt,
  tag: 'restock',
  offText: 'Back in stock alerts are off',
});
