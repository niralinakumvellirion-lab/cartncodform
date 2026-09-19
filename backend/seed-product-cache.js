require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const ProductImageCache = require('./models/ProductImageCache');
  const Store = require('./models/Store');

  const store = await Store.findOne({
    shopDomain: 'cartncod-form.myshopify.com'
  }).lean();

  // Try online token first, then offline
  const token = store.onlineAccessToken || store.accessToken;
  const shop = 'cartncod-form.myshopify.com';
  const productId = '9561899499757';

  console.log('Fetching product image...');
  const res = await fetch(
    `https://${shop}/admin/api/2025-01/products/${productId}.json?fields=id,images`,
    { headers: { 'X-Shopify-Access-Token': token } }
  );

  console.log('Status:', res.status);

  if (res.ok) {
    const data = await res.json();
    const imageUrl = data.product?.images?.[0]?.src || null;
    console.log('Image URL:', imageUrl);

    if (imageUrl) {
      await ProductImageCache.findOneAndUpdate(
        { shopDomain: shop, productId: String(productId) },
        { shopDomain: shop, productId: String(productId),
          imageUrl, cachedAt: new Date() },
        { upsert: true, new: true }
      );
      console.log('Cached successfully ✅');
    }
  } else {
    const err = await res.json();
    console.log('Error:', JSON.stringify(err));

    // Manual fallback — use known CDN URL from earlier session
    const knownImageUrl = 'https://cdn.shopify.com/s/files/1/0831/4824/3181/files/WhatsApp-Image-2024-09-03-at-6.27.44-PM.jpg?v=1788175662';
    await ProductImageCache.findOneAndUpdate(
      { shopDomain: shop, productId: String(productId) },
      { shopDomain: shop, productId: String(productId),
        imageUrl: knownImageUrl, cachedAt: new Date() },
      { upsert: true, new: true }
    );
    console.log('Manually cached with known URL ✅');
    console.log('Image URL:', knownImageUrl);
  }

  mongoose.disconnect();
});
