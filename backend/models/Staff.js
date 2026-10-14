'use strict';

const mongoose = require('mongoose');

const staffSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, default: '' },
    role: {
      type: String,
      enum: ['owner', 'admin', 'support'],
      required: true,
    },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: String, default: '' }, // email of creator, or 'bootstrap'
  },
  { timestamps: true }
);

module.exports = mongoose.model('Staff', staffSchema);
