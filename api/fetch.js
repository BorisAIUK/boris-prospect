const dns = require('dns').promises;
const { URL } = require('url');

// Private/reserved IPv4 ranges — a legitimate prospect website will never
// resolve to one of these, so blocking them closes off SSRF against internal
// infrastructure (e.g. a cloud metadata endpoint, or another service on the
// same private network as this function) without limiting the tool's actual
// job of fetching public business websites.
function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, includes cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // fe80::/10 link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 unique local
  return false;
}

const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0', 'metadata.google.internal']);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }

  // This proxy exists purely to scan a prospect's own homepage for
  // chat-widget scripts — never to reach internal services, cloud metadata
  // endpoints, or anything on localhost, so we only ever allow public
  // http/https destinations.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http/https URLs are allowed' });
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return res.status(400).json({ error: 'This host is not allowed' });
  }

  try {
    // dns.lookup() also handles the case where hostname is itself a raw IP
    // literal (e.g. someone passes http://127.0.0.1/) — Node returns it
    // as-is without a real lookup, so this one check covers both cases.
    const { address, family } = await dns.lookup(hostname);
    const blocked = family === 4 ? isPrivateIPv4(address) : isPrivateIPv6(address);
    if (blocked) {
      return res.status(400).json({ error: 'This host is not allowed' });
    }
  } catch (err) {
    return res.status(200).json({ error: 'Could not resolve host' });
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const html = await response.text();
    return res.status(200).json({ html });
  } catch (err) {
    return res.status(200).json({ error: err.message || 'Fetch failed' });
  }
};
