'use strict';

/**
 * Product review settings: defaults, the public shape, and validation of what the
 * Reviews screen sends. Pure functions, no database access.
 */

const WHO_CAN_REVIEW = ['verified', 'logged_in', 'anyone'];
const PHOTO_TYPES = ['jpeg', 'png', 'gif', 'webp'];
const LIMITS = {
  reviewsPerPage: { min: 1, max: 50 },
  maxPhotos: { min: 1, max: 10 },
  maxFileSizeMb: { min: 1, max: 10 },
};

const DEFAULT_REVIEW_SETTINGS = Object.freeze({
  whoCanReview: 'verified',
  verifiedBadge: true,
  starRating: true,
  starRequired: true,
  reviewsPerPage: 10,
  photos: Object.freeze({
    enabled: true,
    maxPhotos: 3,
    maxFileSizeMb: 5,
    allowedTypes: Object.freeze(['jpeg', 'png', 'webp']),
  }),
  helpfulVotes: true,
  requireApproval: true,
});

function invalid(message, field) {
  const err = new Error(message);
  err.field = field;
  err.isValidation = true;
  return err;
}

function requireBoolean(value, field, label) {
  if (typeof value !== 'boolean') throw invalid(`${label} must be on or off`, field);
  return value;
}

function requireIntInRange(value, field, label, { min, max }) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw invalid(`${label} must be a whole number from ${min} to ${max}`, field);
  }
  return value;
}

/**
 * Validate and normalise a settings object from the admin screen.
 * Throws an Error with .isValidation and .field when something is wrong.
 */
function sanitizeReviewSettings(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalid('Settings must be an object', 'settings');
  }
  if (!WHO_CAN_REVIEW.includes(input.whoCanReview)) {
    throw invalid('Choose who can leave reviews: verified buyers, logged-in users or anyone', 'whoCanReview');
  }

  const verifiedBadge = requireBoolean(input.verifiedBadge, 'verifiedBadge', 'Verified owner badge');
  const starRating = requireBoolean(input.starRating, 'starRating', 'Star rating');
  let starRequired = requireBoolean(input.starRequired, 'starRequired', 'Star rating required');
  const helpfulVotes = requireBoolean(input.helpfulVotes, 'helpfulVotes', 'Helpful votes');
  // Added after the first release: a client that does not send it keeps approval on.
  const requireApproval = input.requireApproval === undefined
    ? DEFAULT_REVIEW_SETTINGS.requireApproval
    : requireBoolean(input.requireApproval, 'requireApproval', 'Approve reviews first');
  const reviewsPerPage = requireIntInRange(input.reviewsPerPage, 'reviewsPerPage', 'Reviews per page', LIMITS.reviewsPerPage);

  const p = input.photos;
  if (!p || typeof p !== 'object' || Array.isArray(p)) throw invalid('Photo settings are missing', 'photos');
  const photosEnabled = requireBoolean(p.enabled, 'photos.enabled', 'Photo reviews');
  const maxPhotos = requireIntInRange(p.maxPhotos, 'photos.maxPhotos', 'Max photos per review', LIMITS.maxPhotos);
  const maxFileSizeMb = requireIntInRange(p.maxFileSizeMb, 'photos.maxFileSizeMb', 'Max file size', LIMITS.maxFileSizeMb);

  if (!Array.isArray(p.allowedTypes) || p.allowedTypes.some((t) => !PHOTO_TYPES.includes(t))) {
    throw invalid('Allowed file types can only be JPEG, PNG, GIF or WEBP', 'photos.allowedTypes');
  }
  const allowedTypes = PHOTO_TYPES.filter((t) => p.allowedTypes.includes(t));
  if (photosEnabled && allowedTypes.length === 0) {
    throw invalid('Choose at least one allowed file type', 'photos.allowedTypes');
  }

  // A rating cannot be required when star ratings are switched off.
  if (!starRating) starRequired = false;

  return {
    whoCanReview: input.whoCanReview,
    verifiedBadge,
    starRating,
    starRequired,
    reviewsPerPage,
    photos: {
      enabled: photosEnabled,
      maxPhotos,
      maxFileSizeMb,
      // Switched off with no types picked: keep the defaults so turning it on again is sane.
      allowedTypes: allowedTypes.length ? allowedTypes : [...DEFAULT_REVIEW_SETTINGS.photos.allowedTypes],
    },
    helpfulVotes,
    requireApproval,
  };
}

/** The shape sent to the admin screen: a stored document merged over the defaults. */
function toPublicSettings(doc) {
  const d = DEFAULT_REVIEW_SETTINGS;
  const src = doc || {};
  const photos = src.photos || {};
  return {
    whoCanReview: src.whoCanReview || d.whoCanReview,
    verifiedBadge: typeof src.verifiedBadge === 'boolean' ? src.verifiedBadge : d.verifiedBadge,
    starRating: typeof src.starRating === 'boolean' ? src.starRating : d.starRating,
    starRequired: typeof src.starRequired === 'boolean' ? src.starRequired : d.starRequired,
    reviewsPerPage: Number.isInteger(src.reviewsPerPage) ? src.reviewsPerPage : d.reviewsPerPage,
    photos: {
      enabled: typeof photos.enabled === 'boolean' ? photos.enabled : d.photos.enabled,
      maxPhotos: Number.isInteger(photos.maxPhotos) ? photos.maxPhotos : d.photos.maxPhotos,
      maxFileSizeMb: Number.isInteger(photos.maxFileSizeMb) ? photos.maxFileSizeMb : d.photos.maxFileSizeMb,
      allowedTypes: Array.isArray(photos.allowedTypes) && photos.allowedTypes.length
        ? [...photos.allowedTypes]
        : [...d.photos.allowedTypes],
    },
    helpfulVotes: typeof src.helpfulVotes === 'boolean' ? src.helpfulVotes : d.helpfulVotes,
    requireApproval: typeof src.requireApproval === 'boolean' ? src.requireApproval : d.requireApproval,
    updatedAt: src.updatedAt || null,
  };
}

module.exports = {
  WHO_CAN_REVIEW,
  PHOTO_TYPES,
  LIMITS,
  DEFAULT_REVIEW_SETTINGS,
  sanitizeReviewSettings,
  toPublicSettings,
};
