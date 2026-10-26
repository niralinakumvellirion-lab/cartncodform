import '@testing-library/jest-dom';

// Stub window.shopify (App Bridge) — used by handleExport
global.window.shopify = {
  idToken: jest.fn().mockResolvedValue('fake-token'),
};

// Stub URL.createObjectURL / revokeObjectURL — not in jsdom
if (!global.URL.createObjectURL) {
  global.URL.createObjectURL = jest.fn(() => 'blob:mock');
  global.URL.revokeObjectURL = jest.fn();
}
