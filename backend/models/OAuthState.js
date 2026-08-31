const mongoose = require('mongoose');

const oAuthStateSchema = new mongoose.Schema({
  nonce: {
    type: String,
    required: true,
    unique: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    // TTL index: Mongo automatically removes the document 600 seconds
    // (10 minutes) after createdAt, so stale OAuth nonces clean themselves up.
    expires: 600,
  },
});

module.exports = mongoose.model('OAuthState', oAuthStateSchema);
