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
  cartItems: [
    {
      title: String,
      quantity: Number,
      price: Number,
      imageUrl: String,
      productId: mongoose.Schema.Types.Mixed,
      variantId: mongoose.Schema.Types.Mixed,
    },
  ],
  // First available cart-item image, used as the push notification image.
  productImageUrl: {
    type: String,
    trim: true,
  },
  cartValue: {
    type: Number,
    default: 0,
  },
  sessionId: {
    type: String,
    trim: true,
  },
  customerId: {
    type: String,
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
