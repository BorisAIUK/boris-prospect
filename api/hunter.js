// Hunter.io — two-step flow:
//   Step 1 (free):  domain search — returns contacts with masked emails, no credits used
//   Step 2 (paid):  email-finder  — reveals one real email per contact, 1 credit each

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

function maskEmail(email, domain) {
  if (!email || !email.includes('@')) return '•••••@' + domain;
  return email[0] + '••••@' + domain;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { domain, apiKey, action, firstName, lastName } = req.body || {};
  if (!domain) return res.status(400).json({ error: 'Missing domain' });
  if (!apiKey)  return res.status(400).json({ error: 'Missing apiKey' });

  // ── Step 2: reveal a single email (1 Hunter credit) ──────────────────────
  if (action === 'reveal') {
    if (!firstName && !lastName) return res.status(400).json({ error: 'Missing name for email finder' });
    try {
      const url = `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName || '')}&last_name=${encodeURIComponent(lastName || '')}&api_key=${encodeURIComponent(apiKey)}`;
      console.log('hunter.js: revealing email for', firstName, lastName, 'at', domain);
      const resp = await fetch(url, { signal: AbortSignal.timeout(9000) });
      const data = await resp.json();

      if (!resp.ok || data.errors?.length) {
        const msg = data.errors?.[0]?.details || data.errors?.[0]?.id || 'Hunter API error';
        console.error('hunter.js: reveal error:', msg);
        return res.status(200).json({ error: msg });
      }

      const email = data.data?.email || null;
      console.log('hunter.js: revealed email:', email ? email[0] + '****@...' : '(none)');
      return res.status(200).json({ email });
    } catch (e) {
      console.error('hunter.js reveal exception:', e.message);
      return res.status(200).json({ error: e.message || 'Request failed' });
    }
  }

  // ── Step 1: domain search (free — no credits used) ────────────────────────
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
      maskedEmail: maskEmail(e.value, domain),
      jobTitle:    e.position    || '',
      linkedinUrl: e.linkedin    || null,
      confidence:  e.confidence  || 0,
      tier:        getTier(e.position),
    }));

    contacts.sort((a, b) => a.tier - b.tier || b.confidence - a.confidence);
    console.log('hunter.js: returning', contacts.length, 'masked contacts for', domain);

    return res.status(200).json({ contacts });
  } catch (e) {
    console.error('hunter.js exception:', e.message);
    return res.status(200).json({ error: e.message || 'Request failed' });
  }
};
