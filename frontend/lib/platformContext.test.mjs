/**
 * Regression test: AuditScreen and StaffScreen must not reference the
 * removed `meLoaded` variable and must import usePlatformStaff.
 *
 * Bug caught: after replacing useState meLoaded with usePlatformStaff context,
 * render-path guards `if (!meLoaded)` were left in, causing ReferenceError on
 * every render of /staff and /audit (d1d2fd5 → fixed).
 *
 * Run: node frontend/lib/platformContext.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function src(rel) {
  return readFileSync(path.join(root, rel), 'utf8');
}

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${label}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

const auditSrc = src('app/platform/audit/AuditScreen.js');
const staffSrc = src('app/platform/staff/StaffScreen.js');

console.log('platformContext — stale meLoaded regression');

test('AuditScreen: no reference to meLoaded', () => {
  assert.ok(
    !auditSrc.includes('meLoaded'),
    'AuditScreen.js still references meLoaded — ReferenceError at render time'
  );
});

test('AuditScreen: imports usePlatformStaff', () => {
  assert.ok(
    auditSrc.includes('usePlatformStaff'),
    'AuditScreen.js does not import usePlatformStaff'
  );
});

test('AuditScreen: no direct getMe() call', () => {
  assert.ok(
    !auditSrc.includes('getMe('),
    'AuditScreen.js still calls getMe() — duplicate /me request'
  );
});

test('StaffScreen: no reference to meLoaded', () => {
  assert.ok(
    !staffSrc.includes('meLoaded'),
    'StaffScreen.js still references meLoaded — ReferenceError at render time'
  );
});

test('StaffScreen: imports usePlatformStaff', () => {
  assert.ok(
    staffSrc.includes('usePlatformStaff'),
    'StaffScreen.js does not import usePlatformStaff'
  );
});

test('StaffScreen: no direct getMe() call', () => {
  assert.ok(
    !staffSrc.includes('getMe('),
    'StaffScreen.js still calls getMe() — duplicate /me request'
  );
});

const shellSrc = src('app/platform/components/PlatformShell.js');

test('PlatformShell: provides PlatformStaffContext', () => {
  assert.ok(
    shellSrc.includes('PlatformStaffContext.Provider'),
    'PlatformShell.js does not render PlatformStaffContext.Provider'
  );
});

console.log(`\n  ${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
