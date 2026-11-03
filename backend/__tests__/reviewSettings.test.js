'use strict';

const {
  DEFAULT_REVIEW_SETTINGS,
  sanitizeReviewSettings,
  toPublicSettings,
} = require('../utils/reviewSettings');

function valid(over = {}) {
  return {
    whoCanReview: 'verified',
    verifiedBadge: true,
    starRating: true,
    starRequired: true,
    reviewsPerPage: 10,
    photos: { enabled: true, maxPhotos: 3, maxFileSizeMb: 5, allowedTypes: ['jpeg', 'png', 'webp'] },
    helpfulVotes: true,
    ...over,
  };
}

function fails(input, field) {
  let err;
  try { sanitizeReviewSettings(input); } catch (e) { err = e; }
  expect(err).toBeDefined();
  expect(err.isValidation).toBe(true);
  expect(err.field).toBe(field);
}

describe('sanitizeReviewSettings — accepts valid input', () => {
  test('returns the normalised settings', () => {
    expect(sanitizeReviewSettings(valid())).toEqual({ ...valid(), requireApproval: true });
  });

  test('approval: defaults to on when the client does not send it, otherwise must be on/off', () => {
    expect(sanitizeReviewSettings(valid()).requireApproval).toBe(true);
    expect(sanitizeReviewSettings(valid({ requireApproval: false })).requireApproval).toBe(false);
    expect(() => sanitizeReviewSettings(valid({ requireApproval: 'no' }))).toThrow(/Approve reviews first/);
  });

  test.each(['verified', 'logged_in', 'anyone'])('who can review: %s', (who) => {
    expect(sanitizeReviewSettings(valid({ whoCanReview: who })).whoCanReview).toBe(who);
  });

  test('ignores unknown fields', () => {
    const out = sanitizeReviewSettings({ ...valid(), isAdmin: true, shopDomain: 'evil.myshopify.com' });
    expect(out.isAdmin).toBeUndefined();
    expect(out.shopDomain).toBeUndefined();
  });

  test('file types are de-duplicated and kept in a fixed order', () => {
    const out = sanitizeReviewSettings(valid({ photos: { ...valid().photos, allowedTypes: ['webp', 'jpeg', 'jpeg', 'gif'] } }));
    expect(out.photos.allowedTypes).toEqual(['jpeg', 'gif', 'webp']);
  });

  test('star rating off forces "required" off', () => {
    const out = sanitizeReviewSettings(valid({ starRating: false, starRequired: true }));
    expect(out.starRating).toBe(false);
    expect(out.starRequired).toBe(false);
  });

  test('photos off with no types chosen is allowed and keeps default types', () => {
    const out = sanitizeReviewSettings(valid({ photos: { enabled: false, maxPhotos: 3, maxFileSizeMb: 5, allowedTypes: [] } }));
    expect(out.photos.enabled).toBe(false);
    expect(out.photos.allowedTypes).toEqual(['jpeg', 'png', 'webp']);
  });

  test('limits are inclusive', () => {
    const out = sanitizeReviewSettings(valid({ reviewsPerPage: 50, photos: { enabled: true, maxPhotos: 10, maxFileSizeMb: 10, allowedTypes: ['png'] } }));
    expect(out.reviewsPerPage).toBe(50);
    expect(out.photos.maxPhotos).toBe(10);
    expect(out.photos.maxFileSizeMb).toBe(10);
    const low = sanitizeReviewSettings(valid({ reviewsPerPage: 1, photos: { enabled: true, maxPhotos: 1, maxFileSizeMb: 1, allowedTypes: ['png'] } }));
    expect(low.reviewsPerPage).toBe(1);
  });
});

describe('sanitizeReviewSettings — rejects bad input', () => {
  test.each([[null], [undefined], ['x'], [[]], [42]])('non-object %p', (v) => fails(v, 'settings'));

  test('unknown "who can review"', () => {
    fails(valid({ whoCanReview: 'everyone' }), 'whoCanReview');
    fails(valid({ whoCanReview: undefined }), 'whoCanReview');
  });

  test.each(['verifiedBadge', 'starRating', 'starRequired', 'helpfulVotes'])('%s must be a real boolean', (field) => {
    fails(valid({ [field]: 'true' }), field);
    fails(valid({ [field]: 1 }), field);
    fails(valid({ [field]: undefined }), field);
  });

  test.each([[0], [51], [10.5], ['10'], [null], [-1]])('reviews per page %p', (v) => fails(valid({ reviewsPerPage: v }), 'reviewsPerPage'));

  test('photo settings are required and validated', () => {
    fails(valid({ photos: undefined }), 'photos');
    fails(valid({ photos: [] }), 'photos');
    fails(valid({ photos: { ...valid().photos, enabled: 'yes' } }), 'photos.enabled');
    fails(valid({ photos: { ...valid().photos, maxPhotos: 0 } }), 'photos.maxPhotos');
    fails(valid({ photos: { ...valid().photos, maxPhotos: 11 } }), 'photos.maxPhotos');
    fails(valid({ photos: { ...valid().photos, maxFileSizeMb: 0 } }), 'photos.maxFileSizeMb');
    fails(valid({ photos: { ...valid().photos, maxFileSizeMb: 11 } }), 'photos.maxFileSizeMb');
  });

  test('file types: only JPEG, PNG, GIF, WEBP; at least one when photos are on', () => {
    fails(valid({ photos: { ...valid().photos, allowedTypes: ['jpeg', 'exe'] } }), 'photos.allowedTypes');
    fails(valid({ photos: { ...valid().photos, allowedTypes: 'jpeg' } }), 'photos.allowedTypes');
    fails(valid({ photos: { ...valid().photos, allowedTypes: [] } }), 'photos.allowedTypes');
  });
});

describe('toPublicSettings', () => {
  test('no document -> the defaults', () => {
    const s = toPublicSettings(null);
    expect(s).toMatchObject({
      whoCanReview: 'verified', verifiedBadge: true, starRating: true, starRequired: true,
      reviewsPerPage: 10, helpfulVotes: true,
      photos: { enabled: true, maxPhotos: 3, maxFileSizeMb: 5, allowedTypes: ['jpeg', 'png', 'webp'] },
    });
    expect(s.updatedAt).toBeNull();
  });

  test('a stored document wins; missing fields fall back to defaults', () => {
    const s = toPublicSettings({ whoCanReview: 'anyone', verifiedBadge: false, reviewsPerPage: 25, photos: { enabled: false } });
    expect(s.whoCanReview).toBe('anyone');
    expect(s.verifiedBadge).toBe(false);
    expect(s.reviewsPerPage).toBe(25);
    expect(s.photos.enabled).toBe(false);
    expect(s.photos.maxPhotos).toBe(3);
    expect(s.starRating).toBe(true);
  });

  test('does not leak internal fields and does not share the defaults array', () => {
    const s = toPublicSettings({ _id: 'x', shopDomain: 'a.myshopify.com', __v: 0 });
    expect(s._id).toBeUndefined();
    expect(s.shopDomain).toBeUndefined();
    s.photos.allowedTypes.push('gif');
    expect(DEFAULT_REVIEW_SETTINGS.photos.allowedTypes).toEqual(['jpeg', 'png', 'webp']);
  });
});
