require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const ProductImageCache = require('./models/ProductImageCache');

  const total = await ProductImageCache.countDocuments();
  const withImage = await ProductImageCache.countDocuments({
    imageUrl: { $exists: true, $ne: null }
  });

  console.log('=== PRODUCT IMAGE CACHE ===');
  console.log('Total cached products:', total);
  console.log('With image URL:', withImage);

  const samples = await ProductImageCache.find()
    .sort({ cachedAt: -1 })
    .limit(5)
    .lean();

  samples.forEach(p => {
    console.log('productId:', p.productId,
      '| imageUrl:', p.imageUrl ? p.imageUrl.substring(0,50)+'...' : 'MISSING',
      '| cachedAt:', p.cachedAt);
  });

  mongoose.disconnect();
});
