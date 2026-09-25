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
