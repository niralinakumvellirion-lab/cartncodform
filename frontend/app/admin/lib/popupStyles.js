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
// Round 1: classic, flash_sale, gift_reveal.
// Round 2 (mobile-specific styles, see audits/mobile-popup-styles-
// proposal.txt and -after.txt): bottom_sheet, top_bar, story_card —
// (full_takeover was removed; an old saved id resolves to classic) — each carries `mobileOnly: true` (see resolveStyleId below).
//
// To ADD a style: append one entry below with a unique `id`, then add a
// matching case to renderStylePreview()/buildStyleCardThumbnail() in
// Settings.jsx and a matching render branch in ccf-push.js, plus the same
// id in backend/utils/popupStyles.js's STYLE_IDS/STYLE_EXTRA_FIELDS and in
// Store.js's popup.styleId/mobilePopup.styleId enum arrays. If the style is
// device-restricted, set `mobileOnly: true` here AND mirror the same
// restriction in ccf-push.js's ccfResolveStyle() — there is no shared
// runtime between the two, so this is a manual-parity requirement like
// every other per-style value.
// To REMOVE a style: delete its entry here, its two render branches, and
// its backend id — do NOT delete the id from the Store.js enum retroactively
// for shops that already saved it (that would break their save until they
// re-pick a style); instead have the renderers fall back to Classic for an
// id no longer in this registry, exactly like an unrecognized/legacy id.

export const STYLE_ORDER = [
  'classic', 'flash_sale', 'gift_reveal',
  'bottom_sheet', 'top_bar', 'story_card',
  'spotlight', 'noir', 'color_block',
];

// Style ids that only ever render on mobile — desktop's gallery hides
// these cards entirely (see Settings.jsx's GALLERY_CARDS filter), and
// resolveStyleId() below is the defensive fallback for every other path
// (a stale desktop styleId from before this style existed, a direct API
// write, admin preview, etc.) so one is never rendered with device:
// 'desktop'. ccf-push.js's ccfResolveStyle() mirrors this same list.
export const MOBILE_ONLY_STYLE_IDS = ['bottom_sheet', 'top_bar', 'story_card'];

export const POPUP_STYLES = {
  classic: {
    id: 'classic',
    name: 'Classic',
    shortDescription: "Today's default look. Full control over layout.",
    bestFor: 'Any shop — pick Split or Card yourself.',
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
    defaultColors: { bgColor: '#fff7ed', textColor: '#111827' },
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

  // --- Round 2: mobile-only styles (audits/mobile-popup-styles-
  // proposal.txt) — each is genuinely mobile-native geometry, not a
  // shrunk desktop layout, and is hidden from the Desktop tab's gallery.

  bottom_sheet: {
    id: 'bottom_sheet',
    name: 'Bottom Sheet',
    shortDescription: 'Slides up from the bottom edge, like a native app sheet.',
    bestFor: 'A familiar, one-thumb mobile interaction instead of a floating card.',
    mobileOnly: true,
    layoutType: 'card',
    supportedFields: [
      'headline', 'subtext', 'brandName', 'imageUrl', 'imagePosition',
      'accentColor', 'bgColor', 'textColor', 'fontFamily', 'borderRadius',
      'allowText', 'denyText', 'ctaStyle',
    ],
    extraFields: [
      {
        key: 'iconArtEnabled',
        type: 'boolean',
        label: 'Show an offer icon when no image is set',
        default: true,
      },
      {
        key: 'dragHandleEnabled',
        type: 'boolean',
        label: 'Show a drag handle bar',
        default: true,
      },
    ],
    defaultValues: {
      iconArtEnabled: true,
      dragHandleEnabled: true,
    },
  },

  top_bar: {
    id: 'top_bar',
    name: 'Top Bar',
    shortDescription: 'A slim bar pinned to the top of the screen.',
    bestFor: 'Low-friction, always-visible nudges that do not interrupt browsing.',
    mobileOnly: true,
    layoutType: 'bar',
    supportedFields: [
      'headline', 'accentColor', 'textColor', 'fontFamily',
      'allowText', 'ctaStyle',
    ],
    extraFields: [
      {
        key: 'arrowCta',
        type: 'boolean',
        label: 'Add a trailing arrow to the button text',
        default: false,
      },
    ],
    defaultValues: {
      arrowCta: false,
    },
  },

  story_card: {
    id: 'story_card',
    name: 'Story Card',
    shortDescription: 'A tall, full-bleed photo card — headline overlaid on the image.',
    bestFor: 'Shops with strong lifestyle/product photography who want an immersive ask.',
    mobileOnly: true,
    layoutType: 'card',
    supportedFields: [
      'headline', 'subtext', 'imageUrl', 'imagePosition',
      'accentColor', 'textColor', 'fontFamily',
      'allowText', 'denyText', 'ctaStyle',
    ],
    extraFields: [
      {
        key: 'scrimEnabled',
        type: 'boolean',
        label: 'Darken the bottom of the photo so text stays readable',
        default: true,
      },
    ],
    defaultValues: {
      scrimEnabled: true,
    },
  },

  // --- Round 3: professional styles (audits/pro-popup-styles-proposal.txt).
  // Both devices; mobile gets its own geometry in each builder. bgColor/
  // textColor/fontFamily stay merchant controls; `defaultColors` is the
  // style's own fallback when neither the mobile nor the desktop value is
  // set, and each tone/fieldTone select carries `presets` that WRITE
  // bgColor+textColor when picked (a shortcut, not a replacement).

  spotlight: {
    id: 'spotlight',
    name: 'Spotlight',
    shortDescription: 'A soft round shape floats over your page. No box, no hard edges.',
    bestFor: 'Brands with a lifestyle look who want the offer to feel like part of the page.',
    layoutType: 'card',
    defaultColors: { bgColor: '#fbf4e8', textColor: '#1c1917', accentColor: '#c2410c' },
    supportedFields: [
      'headline', 'subtext', 'brandName', 'imageUrl', 'imagePosition',
      'accentColor', 'bgColor', 'textColor', 'fontFamily',
      'allowText', 'denyText', 'ctaStyle',
    ],
    extraFields: [
      {
        key: 'spotlightTone', type: 'select', label: 'Colour preset',
        helper: 'Sets the background and text colours. You can still fine-tune them below.',
        options: [
          { value: 'cream', label: 'Cream' }, { value: 'blush', label: 'Blush' },
          { value: 'sage', label: 'Sage' }, { value: 'ink', label: 'Ink' },
        ],
        default: 'cream',
        presets: {
          cream: { bgColor: '#fbf4e8', textColor: '#1c1917' },
          blush: { bgColor: '#fbe4e6', textColor: '#3b1d22' },
          sage: { bgColor: '#e4eddc', textColor: '#1f2a1a' },
          ink: { bgColor: '#15171c', textColor: '#f4f4f5' },
        },
      },
      {
        key: 'shape', type: 'select', label: 'Shape (desktop)',
        options: [{ value: 'circle', label: 'Circle' }, { value: 'oval', label: 'Oval' }],
        default: 'circle',
      },
      { key: 'showSquiggle', type: 'boolean', label: 'Show a decorative squiggle', default: true },
      { key: 'badgeText', type: 'text', label: 'Eyebrow text (optional)', maxLength: 24, default: '' },
    ],
    defaultValues: { spotlightTone: 'cream', shape: 'circle', showSquiggle: true, badgeText: '' },
  },

  noir: {
    id: 'noir',
    name: 'Noir Split',
    shortDescription: 'Photo on one side, a dark calm panel on the other. Premium and quiet.',
    bestFor: 'Higher-priced or design-led shops that want a restrained, editorial ask.',
    layoutType: 'card',
    defaultColors: { bgColor: '#0f1115', textColor: '#f4f4f5', accentColor: '#9a6b1f' },
    supportedFields: [
      'headline', 'subtext', 'brandName', 'imageUrl', 'imagePosition',
      'accentColor', 'bgColor', 'textColor', 'fontFamily',
      'allowText', 'denyText', 'ctaStyle',
    ],
    extraFields: [
      {
        key: 'noirTone', type: 'select', label: 'Colour preset',
        helper: 'Sets the background and text colours. You can still fine-tune them below.',
        options: [
          { value: 'noir', label: 'Noir' }, { value: 'slate', label: 'Slate' },
          { value: 'plum', label: 'Plum' }, { value: 'forest', label: 'Forest' },
        ],
        default: 'noir',
        presets: {
          noir: { bgColor: '#0f1115', textColor: '#f4f4f5' },
          slate: { bgColor: '#1e293b', textColor: '#f1f5f9' },
          plum: { bgColor: '#2a1a2e', textColor: '#f5eef7' },
          forest: { bgColor: '#14261c', textColor: '#eef5f0' },
        },
      },
      {
        key: 'imageSide', type: 'select', label: 'Photo side (desktop)',
        options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }],
        default: 'left',
      },
      { key: 'badgeText', type: 'text', label: 'Eyebrow text (optional)', maxLength: 24, default: '' },
    ],
    defaultValues: { noirTone: 'noir', imageSide: 'left', badgeText: '' },
  },

  color_block: {
    id: 'color_block',
    name: 'Colour Block',
    shortDescription: 'A warm colour panel with a big offer number and a friendly decline link.',
    bestFor: 'Playful, food, beauty and gifting shops that want the discount to be the hero.',
    layoutType: 'card',
    defaultColors: { bgColor: '#f6e3c4', textColor: '#1c1917', accentColor: '#0f766e' },
    supportedFields: [
      'headline', 'subtext', 'brandName', 'imageUrl', 'imagePosition',
      'accentColor', 'bgColor', 'textColor', 'fontFamily',
      'allowText', 'denyText', 'ctaStyle',
    ],
    extraFields: [
      {
        key: 'fieldTone', type: 'select', label: 'Colour preset',
        helper: 'Sets the background and text colours. You can still fine-tune them below.',
        options: [
          { value: 'sand', label: 'Sand' }, { value: 'apricot', label: 'Apricot' },
          { value: 'blush', label: 'Blush' }, { value: 'mint', label: 'Mint' },
        ],
        default: 'sand',
        presets: {
          sand: { bgColor: '#f6e3c4', textColor: '#1c1917' },
          apricot: { bgColor: '#fbd5b0', textColor: '#2a1608' },
          blush: { bgColor: '#f9d3d8', textColor: '#2e1418' },
          mint: { bgColor: '#d5ecdd', textColor: '#0f2a1c' },
        },
      },
      {
        key: 'offerFigure', type: 'text', label: 'Offer figure (blank = your real discount %)',
        helper: 'Shown only while a discount is turned on. Never invented.',
        maxLength: 12, default: '',
      },
      { key: 'badgeText', type: 'text', label: 'Eyebrow text (optional)', maxLength: 24, default: '' },
      {
        key: 'countdownSource', type: 'select', label: 'Countdown (optional) counts down to',
        helper: 'Never a fake per-visitor timer, only a real deadline.',
        options: [
          { value: 'discount_expiry', label: 'No countdown before unlocking' },
          { value: 'fixed_date', label: 'A specific end date and time' },
        ],
        default: 'discount_expiry',
      },
      {
        key: 'countdownEndsAt', type: 'datetime', label: 'Ends at', default: '',
        showWhen: { countdownSource: 'fixed_date' },
      },
    ],
    defaultValues: {
      fieldTone: 'sand', offerFigure: '', badgeText: '',
      countdownSource: 'discount_expiry', countdownEndsAt: '',
    },
  },
};

export function getStyle(styleId) {
  return POPUP_STYLES[styleId] || POPUP_STYLES.classic;
}

// Device-aware resolution — the one function every "which style is
// actually in force" computation should go through (Settings.jsx's
// activeStyleId, in particular). Falls back to Classic for BOTH an
// unrecognized id and a recognized-but-mobile-only id being resolved for
// 'desktop' — mirrors ccfResolveStyle() in ccf-push.js exactly, so a
// mobile-only style is never rendered anywhere for a desktop context, no
// matter how the id got there (stale save, direct API write, a style
// removed from the registry later, etc.).
export function resolveStyleId(styleId, device) {
  const style = getStyle(styleId);
  if (style.mobileOnly && device !== 'mobile') return 'classic';
  return style.id;
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
