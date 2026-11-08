/**
 * Deep links into the merchant's theme editor (Shopify's documented parameters):
 *  - add an app block to the product page:  ?template=product&addAppBlockId=<apiKey>/<handle>&target=mainSection
 *  - turn on an app embed:                   ?context=apps&activateAppId=<apiKey>/<handle>
 * <handle> is the block's file name in extensions/cartncodform-embed/blocks. Without the API key (meta tag
 * missing) the links still open the right editor page; the merchant then adds the block by hand.
 */

/** The app's API key from the <meta name="shopify-api-key"> tag in app/admin/layout.js, or ''. */
export function shopifyApiKey() {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector('meta[name="shopify-api-key"]');
  return (meta && meta.getAttribute('content')) || '';
}

function editorBase(shop) {
  const s = String(shop || '').trim();
  return s ? `https://${s}/admin/themes/current/editor` : '';
}

/** Theme editor on a product page with the app block added (or just the product page). '' without a shop. */
export function addProductBlockUrl(shop, handle, apiKey = shopifyApiKey()) {
  const base = editorBase(shop);
  if (!base) return '';
  if (!apiKey || !handle) return `${base}?template=product`;
  return `${base}?template=product&addAppBlockId=${encodeURIComponent(`${apiKey}/${handle}`)}&target=mainSection`;
}

/** Theme editor's App embeds panel with the app embed switched on (or just the panel). '' without a shop. */
export function activateEmbedUrl(shop, handle = 'push-notifications', apiKey = shopifyApiKey()) {
  const base = editorBase(shop);
  if (!base) return '';
  if (!apiKey || !handle) return `${base}?context=apps`;
  return `${base}?context=apps&activateAppId=${encodeURIComponent(`${apiKey}/${handle}`)}`;
}
