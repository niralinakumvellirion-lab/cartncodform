/**
 * Verifies that backend/utils/emailEngine.js and
 * frontend/app/admin/lib/emailEngine.js are identical (after normalising
 * line endings to \n).
 *
 * If this test fails, run:  node scripts/syncEmailEngine.js
 */

const fs = require('fs');
const path = require('path');

const BACKEND = path.resolve(__dirname, '../utils/emailEngine.js');
const FRONTEND = path.resolve(__dirname, '../../frontend/app/admin/lib/emailEngine.js');

function normalise(content) {
  return content.replace(/\r\n/g, '\n');
}

test('frontend emailEngine.js is in sync with backend copy', () => {
  const backend  = normalise(fs.readFileSync(BACKEND,  'utf8'));
  const frontend = normalise(fs.readFileSync(FRONTEND, 'utf8'));
  expect(frontend).toBe(
    backend,
    '\nFrontend copy is out of sync. Run: node scripts/syncEmailEngine.js\n'
  );
});
