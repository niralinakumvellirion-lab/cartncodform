// Shared constants for email studio components.

export const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;800' +
  '&family=Cormorant+Garamond:wght@400;700&family=DM+Serif+Display' +
  '&family=Abril+Fatface&family=Lora:wght@400;700' +
  '&family=Montserrat:wght@400;800&family=Poppins:wght@400;700' +
  '&family=Raleway:wght@400;800&family=Josefin+Sans:wght@400;700' +
  '&family=Oswald:wght@400;600&family=Bebas+Neue&family=Pacifico' +
  '&family=Dancing+Script:wght@400;700&family=Nunito:wght@400;800&display=swap';

export const STICKY_TOP = 12;

export const TYPE_LABELS = { special_offer: 'Special offer', festival: 'Festival', normal: 'Normal' };
export const VALID_TYPES = ['special_offer', 'festival', 'normal'];

export const SEGMENTS = [
  { key: 'everyone',       label: 'All with email' },
  { key: 'email_captured', label: 'Email subscribers' },
  { key: 'has_cart',       label: 'Abandoned cart' },
  { key: 'bought_once',    label: 'One-time buyers' },
  { key: 'going_quiet',    label: 'Re-engage (quiet)' },
];

export const MAX_LEN = {
  subject: 70, eyebrow: 40, headline: 70, offerText: 24,
  body: 600, ctaLabel: 30, note: 60, name: 60,
};

export const EMPTY_DRAFT = {
  type: 'normal',
  name: '',
  subject: '',
  body: '',
  offerText: '',
  imageUrl: null,
  ctaLabel: '',
  ctaUrl: '',
  layout: null,
  color: null,
  hFont: null,
  bFont: null,
  radius: null,
  pageBg: null,
  cardBg: null,
  eyebrow: '',
  headline: '',
  note: '',
  imgW: null,
  imgH: null,
  showLogo: false,
};

export function draftFromTemplate(t) {
  return {
    type: t.type || 'normal',
    name: t.name || '',
    subject: t.subject || '',
    body: t.body || '',
    offerText: t.offerText || '',
    imageUrl: t.imageUrl || null,
    ctaLabel: t.ctaLabel || '',
    ctaUrl: t.ctaUrl || '',
    layout: t.layout || null,
    color: t.color || null,
    hFont: t.hFont || null,
    bFont: t.bFont || null,
    radius: t.radius || null,
    pageBg: t.pageBg || null,
    cardBg: t.cardBg || null,
    eyebrow: t.eyebrow || '',
    headline: t.headline || '',
    note: t.note || '',
    imgW: t.imgW || null,
    imgH: t.imgH || null,
    showLogo: t.showLogo || false,
  };
}
