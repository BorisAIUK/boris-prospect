const crypto = require('crypto');
const { makeSessionCookie } = require('./_auth.js');
const { rateLimit, clientKey } = require('./_rateLimit.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Throttle login attempts so the single shared password can't be brute
  // forced by just hammering this endpoint.
  const limit = rateLimit(`login:${clientKey(req)}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!limit.allowed) {
    return res.status(429).json({ error: 'Too many attempts — try again in a few minutes' });
  }

  if (!process.env.SITE_PASSWORD || !process.env.AUTH_SECRET) {
    return res.status(500).json({ error: 'Site password is not configured yet' });
  }

  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Missing password' });

  const expected = Buffer.from(process.env.SITE_PASSWORD);
  const given = Buffer.from(String(password));
  const match = expected.length === given.length && crypto.timingSafeEqual(expected, given);

  if (!match) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  res.setHeader('Set-Cookie', makeSessionCookie());
  return res.status(200).json({ ok: true });
};
