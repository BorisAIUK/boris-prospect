function cleanDomain(raw) {
  return (raw || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .trim()
    .toLowerCase();
}

const BASE = 'https://api.hubspot.com';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { token, properties } = req.body || {};
  const _logDomain = cleanDomain(properties?.domain || properties?.website || '');
  console.log('hubspot.js: called for domain:', _logDomain);

  if (!token) return res.status(400).json({ message: 'Missing HubSpot token' });
  if (!properties) return res.status(400).json({ message: 'Missing properties' });

  const domain = cleanDomain(properties.domain || properties.website || '');
  console.log('[hubspot] cleaned domain:', domain);

  if (!domain) return res.status(400).json({ message: 'Could not extract a domain from properties' });

  const cleanProps = { ...properties, domain };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  try {
    // Step 1: search for existing company by domain
    const searchUrl = `${BASE}/crm/v3/objects/companies/search`;
    console.log('[hubspot] searching:', searchUrl, 'domain:', domain);

    const searchRes = await fetch(searchUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: 'domain',
            operator: 'EQ',
            value: domain,
          }],
        }],
        properties: ['domain', 'name'],
      }),
    });

    const searchBody = await searchRes.json();
    console.log('[hubspot] search status:', searchRes.status, '| total:', searchBody.total);

    if (searchRes.status === 403) {
      return res.status(403).json({
        message: 'Please add crm.objects.companies.read scope to your HubSpot private app',
      });
    }

    if (!searchRes.ok) {
      console.log('[hubspot] search error body:', JSON.stringify(searchBody));
      return res.status(searchRes.status).json(searchBody);
    }

    if (searchBody.total > 0) {
      // Step 2a: record found — PATCH by HubSpot record ID
      const recordId = searchBody.results[0].id;
      const patchUrl = `${BASE}/crm/v3/objects/companies/${recordId}`;
      console.log('[hubspot] found record id:', recordId, '— PATCHing:', patchUrl);

      const patchRes = await fetch(patchUrl, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ properties: cleanProps }),
      });

      const patchBody = await patchRes.json();
      console.log('[hubspot] PATCH status:', patchRes.status, '| body:', JSON.stringify(patchBody));

      return res.status(patchRes.ok ? 200 : patchRes.status).json(patchBody);
    }

    // Step 2b: no record found — POST to create
    const createUrl = `${BASE}/crm/v3/objects/companies`;
    console.log('[hubspot] no record found — POSTing to create:', createUrl);

    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ properties: cleanProps }),
    });

    const createBody = await createRes.json();
    console.log('[hubspot] POST status:', createRes.status, '| body:', JSON.stringify(createBody));

    return res.status(createRes.ok ? 201 : createRes.status).json(createBody);

  } catch (e) {
    console.error('[hubspot] exception:', e.message);
    return res.status(502).json({ message: 'Upstream HubSpot request failed', error: e.message });
  }
};
