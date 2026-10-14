'use strict';

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  at:         { type: Date, default: Date.now, index: true },
  staffEmail: { type: String, default: '' },
  staffRole:  { type: String, default: '' },
  action:     { type: String, required: true, index: true },
  shopDomain: { type: String, default: null, index: true },
  // meta must never hold shopper emails, phones, or tokens — enforced by callers.
  meta:       { type: mongoose.Schema.Types.Mixed, default: null },
  ip:         { type: String, default: null },
});

// Append-only guards: throw if anyone calls a mutating operation.
const MUTATION_ERROR = 'AuditLog rows are immutable — use create() only';

for (const hook of [
  'updateOne', 'updateMany', 'findOneAndUpdate',
  'deleteOne', 'deleteMany', 'findOneAndDelete',
]) {
  auditLogSchema.pre(hook, function () {
    throw new Error(MUTATION_ERROR);
  });
}

module.exports = mongoose.model('AuditLog', auditLogSchema);
