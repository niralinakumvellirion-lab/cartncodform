/**
 * Phase D — the COD form now captures an optional email. Verify the CodOrder
 * schema accepts it (document construction only; no DB connection).
 */

const CodOrder = require('../models/CodOrder');

test('CodOrder schema has an `email` path defaulting to ""', () => {
  expect(CodOrder.schema.path('email')).toBeDefined();

  const doc = new CodOrder({
    shopDomain: 'shop.myshopify.com',
    name: 'Asha',
    phone: '+919999999999',
    address: '1 Test Rd',
  });
  expect(doc.email).toBe('');

  doc.email = 'asha@example.com';
  expect(doc.email).toBe('asha@example.com');

  const err = doc.validateSync();
  expect(err).toBeUndefined(); // email is optional, no format constraint
});
