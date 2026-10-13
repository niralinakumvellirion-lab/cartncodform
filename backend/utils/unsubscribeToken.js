'use strict';
const crypto = require('crypto');

function getSecret() {
  return process.env.SHOPIFY_API_SECRET || '';
}

function getBackendUrl() {
  return (process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '');
}

// token = base64url(shopDomain + '|' + profileId) + '.' + HMAC-SHA256-hex
function createToken(shopDomain, profileId) {
  const secret = getSecret();
  if (!secret) throw new Error('[unsubscribe] SHOPIFY_API_SECRET not set');
  const payload = `${shopDomain}|${String(profileId)}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

// Returns { shopDomain, profileId } or null on any failure/tamper.
function verifyToken(rawToken) {
  try {
    const secret = getSecret();
    if (!secret) return null;
    const dot = rawToken.indexOf('.');
    if (dot < 1) return null;
    const b64Part = rawToken.slice(0, dot);
    const givenSig = rawToken.slice(dot + 1);
    if (!/^[0-9a-f]{64}$/.test(givenSig)) return null;
    const payload = Buffer.from(b64Part, 'base64url').toString('utf8');
    const pipe = payload.indexOf('|');
    if (pipe < 1) return null;
    const shopDomain = payload.slice(0, pipe);
    const profileId = payload.slice(pipe + 1);
    if (!shopDomain || !profileId) return null;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const expBuf = Buffer.from(expected, 'hex');
    const givenBuf = Buffer.from(givenSig, 'hex');
    if (!crypto.timingSafeEqual(expBuf, givenBuf)) return null;
    return { shopDomain, profileId };
  } catch {
    return null;
  }
}

function buildUnsubscribeUrl(shopDomain, profileId) {
  const token = createToken(shopDomain, profileId);
  return `${getBackendUrl()}/api/unsubscribe/${token}`;
}

function buildUnsubscribeHeaders(shopDomain, profileId) {
  const url = buildUnsubscribeUrl(shopDomain, profileId);
  return {
    'List-Unsubscribe': `<${url}>, <mailto:unsubscribe@shopireachboost.com>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

module.exports = { createToken, verifyToken, buildUnsubscribeUrl, buildUnsubscribeHeaders };
