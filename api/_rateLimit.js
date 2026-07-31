// Best-effort in-memory rate limiter.
//
// Important limitation: Vercel serverless functions can run as multiple
// separate instances, and each cold start gets a fresh, empty counter — so
// this does NOT guarantee a hard cap the way a shared database/Redis would.
// What it does do, cheaply and with zero extra infrastructure, is stop a
// single warm instance from being hammered in a tight loop (an accidental
// runaway retry, a leaked URL getting hit repeatedly, etc.). If this project
// ever needs a real, distributed guarantee, the right upgrade is Vercel KV
// or Upstash Redis — not in scope here since it needs its own provisioning.
const buckets = new Map();

function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count };
}

function clientKey(req) {
  // x-forwarded-for can contain a chain of IPs behind Vercel's edge — the
  // first entry is the original client.
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

module.exports = { rateLimit, clientKey };
