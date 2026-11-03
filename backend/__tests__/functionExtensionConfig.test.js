'use strict';

/**
 * Shopify's App Store review clicked "Quantity Tier Discount" in Discounts > Create discount and was
 * sent to the app dashboard. The function extension must say where its create/details page is.
 */

const fs = require('fs');
const path = require('path');

const toml = fs.readFileSync(path.join(__dirname, '../../extensions/quantity-tier-discount/shopify.extension.toml'), 'utf8');

describe('quantity-tier-discount extension config', () => {
  it('declares where Shopify opens the create and details pages', () => {
    expect(toml).toMatch(/^\[extensions\.ui\.paths\]\s*$/m);
    expect(toml).toMatch(/^create\s*=\s*"\/admin\/discounts"\s*$/m);
    expect(toml).toMatch(/^details\s*=\s*"\/admin\/discounts"\s*$/m);
  });

  it('does not also declare an admin UI extension (Shopify says the two are mutually exclusive)', () => {
    expect(toml).not.toMatch(/^\[extensions\.ui\]\s*$/m);
    expect(toml).not.toMatch(/^enable_create\s*=/m);
  });

  it('still targets the discount function', () => {
    expect(toml).toMatch(/target\s*=\s*"cart\.lines\.discounts\.generate\.run"/);
  });
});
