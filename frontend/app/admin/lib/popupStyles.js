// Popup style registry — the single source of truth for what each style
// IS (id, name, description, which existing layout it wraps, which base
// fields it uses, its own extra fields and their defaults). Settings.jsx's
// Popup Style section and live preview both read this file; the storefront
// (push-notifications.liquid) has its own mirrored render implementation
// per style (no shared runtime between a Next.js admin and a vanilla-JS
// theme app embed — see audits/popup-style-audit-before.txt item 8), kept
// in sync by convention/checklist rather than shared code, same as the
// pre-existing `layout` field already is today.
//
// Round 1 (this change): classic, flash_sale, gift_reveal only. Editorial
// and Spotlight are NOT registered here yet — adding either later means
// adding its entry here (+ its Settings.jsx render branch + its liquid
// render branch + its id in backend/utils/popupStyles.js and the Store.js
// enum), not touching anything else.
//
// To ADD a style: append one entry below with a unique `id`, then add a
// matching case to renderStylePreview()/buildStyleCardThumbnail() in
// Settings.jsx and a matching build<Name>Card() branch in the liquid file,
// plus the same id in backend/utils/popupStyles.js's STYLE_IDS/
// STYLE_EXTRA_FIELDS and in Store.js's popup.styleId/mobilePopup.styleId
// enum arrays.
// To REMOVE a style: delete its entry here, its two render branches, and
// its backend id — do NOT delete the id from the Store.js enum retroactively
// for shops that already saved it (that would break their save until they
// re-pick a style); instead have the renderers fall back to Classic for an
// id no longer in this registry, exactly like an unrecognized/legacy id.

export const STYLE_ORDER = ['classic', 'flash_sale', 'gift_reveal'];

export const POPUP_STYLES = {
  classic: {
    id: 'classic',
    name: 'Classic',
    shortDescription: "Today's default look. Full control over layout.",
    bestFor: 'Any shop — pick Split, Card, or Banner yourself.',
    // null = not forced; Classic keeps using popup.layout / mobilePopup.layout
    // exactly as the existing Layout picker already sets it.
    layoutType: null,
    supportedFields: [
      'layout', 'headline', 'subtext', 'brandName', 'imageUrl',
      'imagePosition', 'accentColor', 'bgColor', 'textColor', 'fontFamily',
      'borderRadius', 'allowText', 'denyText', 'ctaStyle', 'position',
      'showOverlay',
    ],
    extraFields: [],
    defaultValues: {},
  },

  flash_sale: {
    id: 'flash_sale',
    name: 'Flash Sale',
    shortDescription: 'Dark, high-contrast card built for a time-boxed offer.',
    bestFor: 'Limited-time promotions, restock drops, seasonal sales.',
    layoutType: 'card',
    supportedFields: [
      'headline', 'subtext', 'brandName', 'imageUrl', 'imagePosition',
      'accentColor', 'bgColor', 'textColor', 'fontFamily', 'borderRadius',
      'allowText', 'denyText', 'ctaStyle',
    ],
    extraFields: [
      {
        key: 'countdownSource',
        type: 'select',
        label: 'Countdown counts down to',
        helper: 'Never a fake per-visitor timer — only a real deadline.',
        options: [
          { value: 'discount_expiry', label: "The discount code's real expiry (shown after unlocking)" },
          { value: 'fixed_date', label: 'A specific end date & time' },
        ],
        default: 'discount_expiry',
      },
      {
        key: 'countdownEndsAt',
        type: 'datetime',
        label: 'Ends at',
        default: '',
        showWhen: { countdownSource: 'fixed_date' },
      },
      {
        key: 'badgeText',
        type: 'text',
        label: 'Badge text (optional)',
        maxLength: 24,
        default: '',
      },
    ],
    defaultValues: {
      countdownSource: 'discount_expiry',
      countdownEndsAt: '',
      badgeText: '',
    },
  },

  gift_reveal: {
    id: 'gift_reveal',
    name: 'Gift Reveal',
    shortDescription: 'Playful card with a bold, gift-styled code reveal.',
    bestFor: 'Casual/DTC brands that want a fun, low-pressure ask.',
    layoutType: 'card',
    supportedFields: [
      'headline', 'subtext', 'brandName', 'imageUrl', 'imagePosition',
      'accentColor', 'bgColor', 'textColor', 'fontFamily', 'borderRadius',
      'allowText', 'denyText', 'ctaStyle',
    ],
    extraFields: [
      {
        key: 'giftIconEnabled',
        type: 'boolean',
        label: 'Show a gift icon when no image is set',
        default: true,
      },
      {
        key: 'secondaryButtonStyle',
        type: 'select',
        label: 'Decline style',
        options: [
          { value: 'text-link', label: 'Text link (e.g. "No thanks")' },
          { value: 'pill', label: 'Full-width button' },
        ],
        default: 'text-link',
      },
      {
        key: 'codeChipEmphasis',
        type: 'boolean',
        label: 'Bigger, bolder code chip after unlocking',
        default: true,
      },
    ],
    defaultValues: {
      giftIconEnabled: true,
      secondaryButtonStyle: 'text-link',
      codeChipEmphasis: true,
    },
  },
};

export function getStyle(styleId) {
  return POPUP_STYLES[styleId] || POPUP_STYLES.classic;
}

// Merge a style's extraFields defaults under whatever the shop already has
// saved in styleFields (styleFields is a flat bag shared across every
// style — see the comment on Store.js's styleFields field — so this only
// fills in defaults for fields this style needs that aren't set yet; it
// never touches another style's own fields).
export function getStyleFieldValue(style, styleFields, key) {
  if (styleFields && Object.prototype.hasOwnProperty.call(styleFields, key)) {
    return styleFields[key];
  }
  const def = style.extraFields.find((f) => f.key === key);
  return def ? def.default : undefined;
}
