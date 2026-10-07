// backend/scripts/syncEmailEngine.js
// Copies backend/utils/emailEngine.js → frontend/app/admin/lib/emailEngine.js
// with LF line endings (so git treats the files as identical on all OSes).
// Run: node scripts/syncEmailEngine.js
'use strict';
var fs = require('fs');
var path = require('path');

var src = path.resolve(__dirname, '../utils/emailEngine.js');
var dst = path.resolve(__dirname, '../../frontend/app/admin/lib/emailEngine.js');
var content = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n');
fs.writeFileSync(dst, content, { encoding: 'utf8' });
console.log('Synced emailEngine.js to frontend (' + content.length + ' bytes)');
