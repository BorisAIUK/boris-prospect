// Hunter.io domain search — returns contacts sorted by sales-relevance tier.

const PRIORITY = [
  ['marketing manager','head of marketing','marketing director','digital marketing'],
  ['operations manager','practice manager','office manager'],
  ['managing partner','partner','director'],
  ['manager'],
];

function getTier(title) {
  const t = (title || '').toLowerCase();
  for (let i = 0; i < PRIORITY.length; i++) {
    if (PRIORITY[i].some(p => t.includes(p))) return i + 1;
  }
  return 5;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { domain, apiKey, action } = req.body || {};
  if (!domain) return res.status(400).json({ error: 'Missing domain' });
  if (!apiKey)  return res.status(400).json({ error: 'Missing apiKey' });

  // ── Free count check — no credits used ───────────────────────────────────
  if (action === 'count') {
    try {
      const url = `https://api.hunter.io/v2/email-count?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(apiKey)}`;
      console.log('hunter.js: counting emails for domain:', domain);
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data = await resp.json();
      if (!resp.ok || data.errors?.length) {
        const msg = data.errors?.[0]?.details || data.errors?.[0]?.id || 'Hunter API error';
        console.error('hunter.js: count error:', msg);
        return res.status(200).json({ error: msg });
      }
      const count = data.data?.total ?? 0;
      console.log('hunter.js: email count for', domain, ':', count);
      return res.status(200).json({ count });
    } catch (e) {
      console.error('hunter.js count exception:', e.message);
      return res.status(200).json({ error: e.message || 'Request failed' });
    }
  }

  // ── Full domain search (uses 1 Hunter credit) ─────────────────────────────
  try {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${encodeURIComponent(apiKey)}&limit=10`;
    console.log('hunter.js: searching domain:', domain);
    const resp = await fetch(url, { signal: AbortSignal.timeout(9000) });
    const data = await resp.json();

    if (!resp.ok || data.errors?.length) {
      const msg = data.errors?.[0]?.details || data.errors?.[0]?.id || 'Hunter API error';
      console.error('hunter.js: API error:', msg);
      return res.status(200).json({ error: msg });
    }

    const contacts = (data.data?.emails || []).map(e => ({
      firstName:   e.first_name  || '',
      lastName:    e.last_name   || '',
      email:       e.value       || '',
      jobTitle:    e.position    || '',
      linkedinUrl: e.linkedin    || null,
      confidence:  e.confidence  || 0,
      tier:        getTier(e.position),
    }));

    contacts.sort((a, b) => a.tier - b.tier || b.confidence - a.confidence);
    console.log('hunter.js: returning', contacts.length, 'contacts for', domain);

    return res.status(200).json({ contacts });
  } catch (e) {
    console.error('hunter.js exception:', e.message);
    return res.status(200).json({ error: e.message || 'Request failed' });
  }
};
