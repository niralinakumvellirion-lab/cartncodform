/**
 * Unit tests for frontend/lib/financeFormat.js
 * Run: node frontend/lib/financeFormat.test.mjs
 */

// ESM shim: financeFormat.js uses `export`, so we need to load it as an ES module.
// We re-read it as text and use a data URL so we don't need a build step.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(__dirname, 'financeFormat.js'), 'utf8');
// Convert export declarations to named exports via a data URL
const mod = await import('data:text/javascript,' + encodeURIComponent(src));
const { fmtMoney, fmtSignedMoney, fmtMonthLabel, fmtShortDate } = mod;

let passed = 0; let failed = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.error(`  ✗ ${label}\n    ${e.message}`); failed++; }
}

console.log('financeFormat');

// fmtMoney
test('fmtMoney: 9.99 → "$9.99"',       () => assert.equal(fmtMoney(9.99),  '$9.99'));
test('fmtMoney: 0 → "$0.00"',           () => assert.equal(fmtMoney(0),     '$0.00'));
test('fmtMoney: null → "—"',            () => assert.equal(fmtMoney(null),  '—'));
test('fmtMoney: NaN string → "—"',      () => assert.equal(fmtMoney('abc'), '—'));
test('fmtMoney: string "9.99" → "$9.99"', () => assert.equal(fmtMoney('9.99'), '$9.99'));

// fmtSignedMoney
test('fmtSignedMoney: 9.99 → "+$9.99"',  () => assert.equal(fmtSignedMoney(9.99),  '+$9.99'));
test('fmtSignedMoney: -9.99 → "-$9.99"', () => assert.equal(fmtSignedMoney(-9.99), '-$9.99'));
test('fmtSignedMoney: 0 → "$0.00"',      () => assert.equal(fmtSignedMoney(0),     '$0.00'));
test('fmtSignedMoney: null → "—"',       () => assert.equal(fmtSignedMoney(null),  '—'));
test('fmtSignedMoney: 19.98 → "+$19.98"',() => assert.equal(fmtSignedMoney(19.98), '+$19.98'));
test('fmtSignedMoney: -0.01 → "-$0.01"', () => assert.equal(fmtSignedMoney(-0.01), '-$0.01'));

// fmtMonthLabel
test('fmtMonthLabel: "2024-06" → "Jun 2024"', () => assert.equal(fmtMonthLabel('2024-06'), 'Jun 2024'));
test('fmtMonthLabel: "2024-01" → "Jan 2024"', () => assert.equal(fmtMonthLabel('2024-01'), 'Jan 2024'));
test('fmtMonthLabel: "2024-12" → "Dec 2024"', () => assert.equal(fmtMonthLabel('2024-12'), 'Dec 2024'));
test('fmtMonthLabel: null → ""',              () => assert.equal(fmtMonthLabel(null), ''));
test('fmtMonthLabel: "" → ""',                () => assert.equal(fmtMonthLabel(''), ''));
test('fmtMonthLabel: "2026-10" → "Oct 2026"', () => assert.equal(fmtMonthLabel('2026-10'), 'Oct 2026'));

// fmtShortDate
test('fmtShortDate: null → "—"',         () => assert.equal(fmtShortDate(null), '—'));
test('fmtShortDate: ISO string returns a non-empty string', () => {
  const r = fmtShortDate('2024-06-15T12:00:00Z');
  assert.ok(r && r !== '—', `expected non-empty, got "${r}"`);
  assert.ok(r.includes('2024'), `expected year 2024 in "${r}"`);
});
test('fmtShortDate: string reason passed through', () => {
  // For excluded tab, date is a reason string like "Internal"
  // fmtShortDate("Internal") → "Internal" (new Date("Internal") is Invalid Date → returns String(d))
  const r = fmtShortDate('Internal');
  assert.equal(r, 'Internal');
});

console.log(`\n  ${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
