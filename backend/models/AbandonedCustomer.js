const mongoose = require('mongoose');

const abandonedCustomerSchema = new mongoose.Schema({
  shopDomain: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  phone: {
    type: String,
    trim: true,
  },
  cartItems: {
    type: Array,
    default: [],
  },
  cartValue: {
    type: Number,
    default: 0,
  },
  sessionId: {
    type: String,
    trim: true,
  },
  status: {
    type: String,
    enum: ['abandoned', 'recovered'],
    default: 'abandoned',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('AbandonedCustomer', abandonedCustomerSchema);
