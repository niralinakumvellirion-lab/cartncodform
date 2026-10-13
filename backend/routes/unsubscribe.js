'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const Profile = require('../models/Profile');
const Store = require('../models/Store');
const { verifyToken } = require('../utils/unsubscribeToken');

const router = express.Router();

router.use(rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false }));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CSS = `body{font-family:Arial,sans-serif;max-width:480px;margin:60px auto;padding:20px;
  color:#111827;text-align:center;line-height:1.6}
  button{padding:12px 28px;background:#dc2626;color:#fff;border:none;border-radius:8px;
    font-size:16px;cursor:pointer;font-weight:600}
  button:hover{background:#b91c1c}p{color:#6b7280}`;

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>`;
}

const INVALID_PAGE = page('Unsubscribe',
  '<h1 style="font-size:22px">Invalid link</h1>' +
  '<p>This unsubscribe link is not valid. If you received unwanted emails, ' +
  "reply to any of them and we'll remove you.</p>"
);

// GET — show confirmation page; must NOT unsubscribe
router.get('/:token', async (req, res) => {
  const parsed = verifyToken(req.params.token);
  if (!parsed) return res.status(400).type('html').send(INVALID_PAGE);

  let storeName = parsed.shopDomain;
  try {
    const store = await Store.findOne({ shopDomain: parsed.shopDomain }).select('shopName').lean();
    if (store?.shopName) storeName = store.shopName;
  } catch {}

  const safeToken = encodeURIComponent(req.params.token);
  res.type('html').send(page('Unsubscribe',
    `<h1 style="font-size:22px">Unsubscribe from ${esc(storeName)}</h1>` +
    `<p>Click the button to stop receiving marketing emails from <strong>${esc(storeName)}</strong>.</p>` +
    `<form method="POST" action="/api/unsubscribe/${safeToken}">` +
    `<button type="submit">Unsubscribe</button></form>` +
    `<p style="font-size:13px;margin-top:24px">If you didn't request this, simply close the page.</p>`
  ));
});

// POST — set suppressed=true; idempotent; RFC 8058 one-click
router.post('/:token', async (req, res) => {
  const parsed = verifyToken(req.params.token);
  if (!parsed) return res.status(400).type('html').send(INVALID_PAGE);

  try {
    await Profile.findOneAndUpdate(
      { _id: parsed.profileId, shopDomain: parsed.shopDomain },
      { $set: { suppressed: true } }
    );
  } catch (e) {
    console.error('[unsubscribe] db error:', e.message);
  }

  res.type('html').send(page('Unsubscribed',
    "<h1 style=\"font-size:22px;color:#16a34a\">You've been unsubscribed.</h1>" +
    '<p>You will no longer receive marketing emails from this store.</p>'
  ));
});

module.exports = router;
