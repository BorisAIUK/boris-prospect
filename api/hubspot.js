function cleanDomain(raw) {
  return (raw || '')
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .trim()
    .toLowerCase();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { token, properties } = req.body || {};

  if (!token) return res.status(400).json({ message: 'Missing HubSpot token' });
  if (!properties) return res.status(400).json({ message: 'Missing properties' });

  const domain = cleanDomain(properties.domain || properties.website || '');
  console.log('[hubspot] raw domain input:', properties.domain, '| website input:', properties.website, '| cleaned domain:', domain);

  if (!domain) return res.status(400).json({ message: 'Could not extract a domain from properties' });

  const cleanProps = { ...properties, domain };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  try {
    // Step 1: PATCH by domain — updates if a unique record exists
    const patchUrl = `https://api.hubapi.com/crm/v3/objects/companies/${encodeURIComponent(domain)}?idProperty=domain`;
    console.log('[hubspot] PATCH url:', patchUrl);
    console.log('[hubspot] PATCH body properties keys:', Object.keys(cleanProps));

    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ properties: cleanProps }),
    });

    const patchBody = await patchRes.json();
    console.log('[hubspot] PATCH response status:', patchRes.status);
    console.log('[hubspot] PATCH response body:', JSON.stringify(patchBody));

    if (patchRes.ok) {
      return res.status(200).json(patchBody);
    }

    if (patchRes.status === 409) {
      return res.status(409).json({
        message: 'Multiple records found with this domain in HubSpot — please merge duplicates first',
      });
    }

    // 400 can carry the non-unique error too
    if (patchRes.status === 400) {
      const msg = patchBody.message || '';
      if (msg.includes('non-unique') || msg.includes('multiple')) {
        return res.status(409).json({
          message: 'Multiple records found with this domain in HubSpot — please merge duplicates first',
        });
      }
      return res.status(400).json(patchBody);
    }

    if (patchRes.status !== 404) {
      return res.status(patchRes.status).json(patchBody);
    }

    // Step 2: 404 — no existing record, create a new one
    const createUrl = 'https://api.hubapi.com/crm/v3/objects/companies';
    console.log('[hubspot] PATCH returned 404 — falling back to POST create:', createUrl);

    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ properties: cleanProps }),
    });

    const createBody = await createRes.json();
    console.log('[hubspot] POST response status:', createRes.status);
    console.log('[hubspot] POST response body:', JSON.stringify(createBody));

    return res.status(createRes.ok ? 201 : createRes.status).json(createBody);

  } catch (e) {
    console.error('[hubspot] exception:', e.message);
    return res.status(502).json({ message: 'Upstream HubSpot request failed', error: e.message });
  }
};
