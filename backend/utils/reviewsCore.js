'use strict';

/**
 * Product reviews: the rules for what a customer may submit. Pure functions (no database),
 * used by routes/reviewsProxy.js and the orders/create webhook.
 */

const crypto = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PRODUCT_ID_RE = /^\d{1,20}$/;
const LIMITS = { name: 60, title: 120, body: 2000, minBody: 10 };

const MIME_BY_TYPE = { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };

function invalid(message, code, field) {
  const err = new Error(message);
  err.isValidation = true;
  err.code = code;
  err.field = field;
  return err;
}

/** sha256 of the lower-cased address, or null when there is no usable address. */
function hashEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  return crypto.createHash('sha256').update(e).digest('hex');
}

function cleanText(value, max) {
  // Strip control characters; keep line breaks. Output is only ever shown as plain text.
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, max);
}

/**
 * Validate what the storefront form sent, against the shop's settings.
 * `photoUrls` must already be filtered to our own image host by the caller.
 * Returns the clean fields; throws a validation Error ({ code, field }) otherwise.
 */
function validateSubmission(settings, input, photoUrls) {
  const body = input || {};
  if (!PRODUCT_ID_RE.test(String(body.productId || ''))) {
    throw invalid('Missing product', 'BAD_PRODUCT', 'productId');
  }

  const name = cleanText(body.name, LIMITS.name);
  if (!name) throw invalid('Please enter your name.', 'NAME_REQUIRED', 'name');

  const reviewText = cleanText(body.body, LIMITS.body);
  if (reviewText.length < LIMITS.minBody) {
    throw invalid(`Please write at least ${LIMITS.minBody} characters.`, 'BODY_TOO_SHORT', 'body');
  }

  let rating = null;
  if (settings.starRating) {
    const raw = body.rating;
    if (raw === undefined || raw === null || raw === '') {
      if (settings.starRequired) throw invalid('Please choose a star rating.', 'RATING_REQUIRED', 'rating');
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 5) throw invalid('Rating must be 1 to 5 stars.', 'BAD_RATING', 'rating');
      rating = n;
    }
  }

  let email = '';
  if (body.email !== undefined && body.email !== null && String(body.email).trim() !== '') {
    email = String(body.email).trim().toLowerCase();
    if (email.length > 254 || !EMAIL_RE.test(email)) {
      throw invalid('Please enter a valid email address.', 'BAD_EMAIL', 'email');
    }
  }

  const photos = Array.isArray(photoUrls) ? photoUrls : [];
  if (photos.length > 0) {
    if (!settings.photos.enabled) throw invalid('Photos are not accepted.', 'PHOTOS_OFF', 'photos');
    if (photos.length > settings.photos.maxPhotos) {
      throw invalid(`You can add up to ${settings.photos.maxPhotos} photos.`, 'TOO_MANY_PHOTOS', 'photos');
    }
  }

  return {
    productId: String(body.productId),
    productHandle: cleanText(body.productHandle, 255).replace(/[^a-zA-Z0-9\-_]/g, ''),
    name,
    title: cleanText(body.title, LIMITS.title),
    body: reviewText,
    rating,
    email,
  };
}

/**
 * Check a base64 data URL against the photo settings and its real file signature.
 * Returns { type, bytes } or throws a validation Error.
 */
function checkPhotoDataUrl(settings, dataUrl) {
  const p = settings.photos;
  if (!p.enabled) throw invalid('Photos are not accepted.', 'PHOTOS_OFF', 'photo');

  const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw invalid('That file is not a valid image.', 'BAD_IMAGE', 'photo');

  const type = Object.keys(MIME_BY_TYPE).find((t) => MIME_BY_TYPE[t] === m[1]);
  if (!type || !p.allowedTypes.includes(type)) {
    const list = p.allowedTypes.map((t) => t.toUpperCase()).join(', ');
    throw invalid(`Only ${list} photos are allowed.`, 'BAD_IMAGE_TYPE', 'photo');
  }

  const buf = Buffer.from(m[2].replace(/\s/g, ''), 'base64');
  if (buf.length > p.maxFileSizeMb * 1024 * 1024) {
    throw invalid(`Each photo must be under ${p.maxFileSizeMb} MB.`, 'IMAGE_TOO_LARGE', 'photo');
  }
  if (!hasSignature(type, buf)) throw invalid('That file is not a valid image.', 'BAD_IMAGE', 'photo');
  return { type, bytes: buf.length };
}

function hasSignature(type, buf) {
  if (buf.length < 12) return false;
  if (type === 'jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (type === 'png') return buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === 'gif') return buf.slice(0, 4).toString('latin1') === 'GIF8';
  if (type === 'webp') return buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP';
  return false;
}

/** Keep only https URLs that live on our own Cloudinary account. */
function ownPhotoUrls(urls, cloudName) {
  if (!cloudName || !Array.isArray(urls)) return [];
  const prefix = `https://res.cloudinary.com/${cloudName}/`;
  return urls
    .map((u) => String(u || ''))
    .filter((u) => u.startsWith(prefix) && u.length <= 500 && !/[\s"'<>]/.test(u));
}

/** From an orders/create payload: the ids we keep to answer "did this person buy that product?". */
function purchaseFromOrder(order) {
  if (!order || order.id == null) return null;
  const productIds = [...new Set(
    (Array.isArray(order.line_items) ? order.line_items : [])
      .map((li) => (li && li.product_id != null ? String(li.product_id) : ''))
      .filter(Boolean)
  )];
  const customerId = order.customer && order.customer.id != null ? String(order.customer.id) : null;
  const emailHash = hashEmail(order.email || (order.customer && order.customer.email));
  if (!productIds.length || (!customerId && !emailHash)) return null;
  return { orderId: String(order.id), customerId, emailHash, productIds };
}

/** Average and 1-5 distribution from a [{ _id: rating, n }] aggregation result. */
function summarizeRatings(rows) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const r of rows || []) {
    const star = Number(r._id);
    if (!(star >= 1 && star <= 5)) continue;
    distribution[star] = r.n;
    total += r.n;
    sum += star * r.n;
  }
  return { rated: total, average: total ? Math.round((sum / total) * 10) / 10 : 0, distribution };
}

module.exports = {
  EMAIL_RE,
  PRODUCT_ID_RE,
  LIMITS,
  hashEmail,
  cleanText,
  validateSubmission,
  checkPhotoDataUrl,
  ownPhotoUrls,
  purchaseFromOrder,
  summarizeRatings,
};
