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
  if (!domain) return res.status(400).json({ message: 'Could not extract a domain from properties' });

  // Always write a clean domain
  const cleanProps = { ...properties, domain };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  try {
    // Step 1: search for an existing company matching this domain
    const searchRes = await fetch(
      'https://api.hubapi.com/crm/v3/objects/companies/search',
      {
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
          properties: ['domain'],
          limit: 1,
        }),
      }
    );

    if (!searchRes.ok) {
      const err = await searchRes.json();
      return res.status(searchRes.status).json(err);
    }

    const searchData = await searchRes.json();
    const existing = searchData.results && searchData.results[0];

    if (existing) {
      // Step 2a: PATCH the existing record
      const patchRes = await fetch(
        `https://api.hubapi.com/crm/v3/objects/companies/${existing.id}`,
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ properties: cleanProps }),
        }
      );
      const patchData = await patchRes.json();
      // Return 200 so the client toast shows "Updated in HubSpot"
      return res.status(patchRes.ok ? 200 : patchRes.status).json(patchData);
    }

    // Step 2b: POST to create a new record
    const createRes = await fetch(
      'https://api.hubapi.com/crm/v3/objects/companies',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ properties: cleanProps }),
      }
    );
    const createData = await createRes.json();
    // Return 201 so the client toast shows "Added to HubSpot"
    return res.status(createRes.ok ? 201 : createRes.status).json(createData);

  } catch (e) {
    return res.status(502).json({ message: 'Upstream HubSpot request failed', error: e.message });
  }
};
