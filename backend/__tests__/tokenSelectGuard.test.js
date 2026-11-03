'use strict';

/**
 * Guard: expiring offline tokens only renew if the refresh pair is loaded with the token.
 * Any field list that selects accessTokenExpiresAt must also select refreshToken and
 * refreshTokenExpiresAt, otherwise the Admin API calls fail an hour after the token was issued.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['routes', 'services', 'utils', 'middleware'];

function sourceFiles() {
  const out = [];
  for (const d of DIRS) {
    const dir = path.join(ROOT, d);
    for (const f of fs.readdirSync(dir)) if (f.endsWith('.js')) out.push(path.join(dir, f));
  }
  out.push(path.join(ROOT, 'server.js'));
  return out;
}

// Every quoted string that lists accessTokenExpiresAt as a Mongoose field selection.
function fieldLists(src) {
  const lists = [];
  const re = /(['"`])([^'"`\n]*\baccessTokenExpiresAt\b[^'"`\n]*)\1/g;
  let m;
  while ((m = re.exec(src))) {
    const text = m[2];
    // Only plain space-separated field lists (not, say, log text or object keys).
    if (/^[\w. ]+$/.test(text) && text.split(' ').length > 1) lists.push(text);
  }
  return lists;
}

describe('token field selections include the refresh pair', () => {
  const found = [];
  for (const file of sourceFiles()) {
    for (const list of fieldLists(fs.readFileSync(file, 'utf8'))) {
      found.push({ file: path.relative(ROOT, file), list });
    }
  }

  test('the scan finds the known call sites (so the guard cannot pass by finding nothing)', () => {
    const files = found.map((f) => f.file.replace(/\\/g, '/'));
    expect(files).toEqual(expect.arrayContaining([
      'routes/discounts.js', 'services/tierSync.js', 'routes/stores.js', 'utils/productImage.js',
    ]));
  });

  test.each(found.map((f) => [f.file, f.list]))('%s: "%s"', (file, list) => {
    const fields = list.split(' ');
    expect(fields).toContain('refreshToken');
    expect(fields).toContain('refreshTokenExpiresAt');
  });
});
