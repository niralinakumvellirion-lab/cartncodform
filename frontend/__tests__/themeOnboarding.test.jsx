/**
 * Theme app extension onboarding (App Store submission checklist): every theme block has steps and a
 * one-click link into the theme editor. lib/themeEditor.js builds the deep links (addAppBlockId /
 * activateAppId); ThemeBlockSetup shows them on Quantity Tiers and Product reviews; Onboarding turns the
 * app embed on. Mocks: __mocks__/api.js.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { apiGet } from '../../../lib/api';
import { shopifyApiKey, addProductBlockUrl, activateEmbedUrl } from '../lib/themeEditor';
import ThemeBlockSetup from '../app/admin/components/ThemeBlockSetup';
import QuantityTiers from '../app/admin/screens/QuantityTiers';
import Reviews from '../app/admin/screens/Reviews';
import Onboarding from '../app/admin/screens/Onboarding';

const SHOP = 'demo.myshopify.com';
const KEY = 'abc123key';
const EDITOR = `https://${SHOP}/admin/themes/current/editor`;
const blockUrl = (handle) => `${EDITOR}?template=product&addAppBlockId=${encodeURIComponent(`${KEY}/${handle}`)}&target=mainSection`;

function setKey(value) {
  document.head.querySelectorAll('meta[name="shopify-api-key"]').forEach((m) => m.remove());
  if (value === null) return;
  const m = document.createElement('meta');
  m.setAttribute('name', 'shopify-api-key');
  m.setAttribute('content', value);
  document.head.appendChild(m);
}

beforeEach(() => { jest.clearAllMocks(); setKey(KEY); window.innerWidth = 1200; });
afterAll(() => setKey(null));

describe('lib/themeEditor', () => {
  it('reads the API key from the meta tag', () => {
    expect(shopifyApiKey()).toBe(KEY);
    setKey(null);
    expect(shopifyApiKey()).toBe('');
  });

  it('add-block link opens a product page with the block added to the main section', () => {
    expect(addProductBlockUrl(SHOP, 'quantity-tiers')).toBe(`${EDITOR}?template=product&addAppBlockId=abc123key%2Fquantity-tiers&target=mainSection`);
  });

  it('embed link opens App embeds with the embed switched on', () => {
    expect(activateEmbedUrl(SHOP)).toBe(`${EDITOR}?context=apps&activateAppId=abc123key%2Fpush-notifications`);
  });

  it('without the API key the links still open the right editor page; without a shop there is no link', () => {
    setKey(null);
    expect(addProductBlockUrl(SHOP, 'quantity-tiers')).toBe(`${EDITOR}?template=product`);
    expect(activateEmbedUrl(SHOP)).toBe(`${EDITOR}?context=apps`);
    expect(addProductBlockUrl('', 'quantity-tiers')).toBe('');
    expect(activateEmbedUrl('  ')).toBe('');
  });
});

describe('every linked block exists in the theme extension', () => {
  const fs = require('fs');
  const path = require('path');
  const root = path.join(__dirname, '..');
  const blocks = path.join(root, '../extensions/cartncodform-embed/blocks');
  const src = (f) => fs.readFileSync(path.join(root, f), 'utf8');

  it('handles used by the admin screens match block files (a typo would open the editor without the block)', () => {
    const handles = [
      ...[...src('app/admin/screens/Discounts.jsx').matchAll(/addProductBlockUrl\([^,]+,\s*'([\w-]+)'/g)].map((m) => m[1]),
      ...[...src('app/admin/screens/QuantityTiers.jsx').matchAll(/handle="([\w-]+)"/g)].map((m) => m[1]),
      ...[...src('app/admin/screens/Reviews.jsx').matchAll(/handle="([\w-]+)"/g)].map((m) => m[1]),
      src('lib/themeEditor.js').match(/activateEmbedUrl\(shop, handle = '([\w-]+)'/)[1],
    ];
    expect(handles).toEqual(['birthday-product', 'quantity-tiers', 'product-reviews', 'push-notifications']);
    for (const h of handles) expect(fs.existsSync(path.join(blocks, `${h}.liquid`))).toBe(true);
  });
});

describe('ThemeBlockSetup card', () => {
  it('three steps, the block name, where to place it, and the button in a new tab', () => {
    render(<ThemeBlockSetup shop={SHOP} handle="product-reviews" blockName="Product reviews" place="below the product details" whenLive="Live note." />);
    expect(screen.getByRole('heading', { name: 'Show it on your store' })).toBeInTheDocument();
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[1]).toHaveTextContent('Drag the Product reviews block below the product details.');
    expect(steps[2]).toHaveTextContent('Click Save in the theme editor.');
    expect(screen.getByText(/Live note\./)).toBeInTheDocument();
    const btn = screen.getByRole('link', { name: /Add to product page/ });
    expect(btn).toHaveAttribute('href', blockUrl('product-reviews'));
    expect(btn).toHaveAttribute('target', '_blank');
  });

  it('no shop → no button (the steps still show)', () => {
    render(<ThemeBlockSetup shop="" handle="product-reviews" blockName="Product reviews" place="here" whenLive="" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});

describe('screens', () => {
  it('Quantity Tiers shows the setup card with its own block link', () => {
    render(
      <QuantityTiers
        shopDomain={SHOP}
        config={{ quantityTiers: { enabled: false, heading: 'Buy more, save more', accentColor: '#4F46E5', layout: 'cards', tiers: [{ minQty: 2, percent: 10, badge: '' }] } }}
        onSaveComplete={() => {}}
      />
    );
    expect(screen.getByRole('link', { name: /Add to product page/ })).toHaveAttribute('href', blockUrl('quantity-tiers'));
    expect(screen.getByText('under the price and size picker', { exact: false })).toBeInTheDocument();
  });

  it('Product reviews shows the setup card with its own block link', async () => {
    apiGet.mockResolvedValue({ settings: { whoCanReview: 'anyone', starRating: true, starRequired: true, photos: { enabled: false, maxPhotos: 3, maxFileSizeMb: 5, allowedTypes: ['jpeg'] }, helpfulVotes: true, requireApproval: true } });
    render(<Reviews shop={SHOP} />);
    expect(await screen.findByRole('link', { name: /Add to product page/ })).toHaveAttribute('href', blockUrl('product-reviews'));
  });

  it('Onboarding: the storefront step opens the editor with the app embed switched on', () => {
    window.open = jest.fn();
    render(<Onboarding shop={SHOP} onNavigate={() => {}} onDone={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn on in theme editor' }));
    expect(window.open).toHaveBeenCalledWith(`${EDITOR}?context=apps&activateAppId=abc123key%2Fpush-notifications`, '_blank');
  });
});
