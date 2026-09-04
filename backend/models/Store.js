const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  shopDomain: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  accessToken: {
    type: String,
    required: true,
  },
  ownerEmail: {
    type: String,
    lowercase: true,
    trim: true,
  },
  timezone: {
    type: String,
    default: 'Asia/Kolkata',
  },
  installedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Store', storeSchema);
