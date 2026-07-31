const crypto = require('crypto');

// A tiny, stateless "one shared password" auth scheme — no database, no
// user accounts, just enough to stop a stranger who finds the URL from
// opening the tool or calling its API routes.
//
// How it works: api/login.js checks the submitted password against
// process.env.SITE_PASSWORD, and if it matches, issues a cookie whose value
// is `<expiryTimestamp>.<hmac>` — the HMAC is computed from the expiry
// timestamp using process.env.AUTH_SECRET as the key. Any request can then
// be verified by recomputing that HMAC and checking it matches, with no
// need to look anything up in a database. AUTH_SECRET is a separate value
// from SITE_PASSWORD on purpose, so the signing key isn't the same thing a
// person types into the login box.
const COOKIE_NAME = 'boris_auth';
const SESSION_LENGTH_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sign(expiry) {
  const secret = process.env.AUTH_SECRET || '';
  return crypto.createHmac('sha256', secret).update(String(expiry)).digest('hex');
}

function makeSessionCookie() {
  const expiry = Date.now() + SESSION_LENGTH_MS;
  const token = `${expiry}.${sign(expiry)}`;
  const maxAgeSeconds = Math.floor(SESSION_LENGTH_MS / 1000);
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

function isAuthed(req) {
  if (!process.env.SITE_PASSWORD || !process.env.AUTH_SECRET) {
    // Fail closed: if the site isn't configured with a password yet, treat
    // every request as unauthenticated rather than silently leaving the
    // tool wide open because an env var was never set.
    return false;
  }
  const cookies = parseCookies(req);
  const raw = cookies[COOKIE_NAME];
  if (!raw) return false;

  const dotIdx = raw.indexOf('.');
  if (dotIdx === -1) return false;
  const expiry = raw.slice(0, dotIdx);
  const mac = raw.slice(dotIdx + 1);
  if (!expiry || !mac) return false;
  if (Date.now() > Number(expiry)) return false;

  const expected = sign(expiry);
  const expectedBuf = Buffer.from(expected, 'hex');
  const macBuf = Buffer.from(mac, 'hex');
  if (expectedBuf.length !== macBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, macBuf);
}

module.exports = { isAuthed, makeSessionCookie, clearSessionCookie, COOKIE_NAME };
