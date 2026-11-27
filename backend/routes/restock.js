'use strict';

/**
 * "Back in stock" — admin, /api/restock. See routes/alertAdmin.js.
 */

const { makeAlertAdmin } = require('./alertAdmin');
const RestockConfig = require('../models/RestockConfig');
const RestockRequest = require('../models/RestockRequest');
const { sanitizeSettings, withDefaults, buildMessage } = require('../utils/restock');

module.exports = makeAlertAdmin({
  Config: RestockConfig,
  Request: RestockRequest,
  sanitizeSettings,
  withDefaults,
  buildMessage,
  signalType: 'back_in_stock',
  tag: 'restock',
  name: 'back in stock',
  label: 'Back in stock',
});
