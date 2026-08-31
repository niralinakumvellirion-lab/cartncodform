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
  installedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Store', storeSchema);
