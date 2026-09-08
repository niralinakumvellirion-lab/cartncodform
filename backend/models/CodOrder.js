const mongoose = require('mongoose');

const codOrderSchema = new mongoose.Schema({
  shopDomain: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
  },
  // Phase D: optional email captured on the COD form ("for order updates").
  email: { type: String, default: '' },
  address: {
    type: String,
    required: true,
    trim: true,
  },
  city: {
    type: String,
    trim: true,
  },
  pincode: {
    type: String,
    trim: true,
  },
  productName: {
    type: String,
    trim: true,
  },
  productPrice: {
    type: Number,
    default: 0,
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1,
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled'],
    default: 'pending',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('CodOrder', codOrderSchema);
