const mongoose = require('mongoose');

const oAuthStateSchema = new mongoose.Schema({
  nonce: {
    type: String,
    required: true,
    unique: true,
  },
  // Optional: dashboard owner's email, passed as ?owner_email= on /install and
  // carried through OAuth so the connected store can be linked to that account.
  ownerEmail: {
    type: String,
    lowercase: true,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    // TTL index: Mongo automatically removes the document 3600 seconds
    // (1 hour) after createdAt, giving the OAuth flow more time to complete
    // before the nonce is considered stale.
    expires: 3600,
  },
});

module.exports = mongoose.model('OAuthState', oAuthStateSchema);
