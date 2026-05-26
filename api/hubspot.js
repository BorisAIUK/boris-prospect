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

  const cleanProps = { ...properties, domain };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  try {
    // Step 1: try PATCH by domain — updates if a unique record exists
    const patchRes = await fetch(
      `https://api.hubapi.com/crm/v3/objects/companies/${encodeURIComponent(domain)}?idProperty=domain`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ properties: cleanProps }),
      }
    );

    if (patchRes.ok) {
      const data = await patchRes.json();
      return res.status(200).json(data);
    }

    if (patchRes.status === 409) {
      return res.status(409).json({
        message: 'Multiple records found with this domain in HubSpot — please merge duplicates first',
      });
    }

    // Check for the non-unique property error in the body (sometimes comes as 400)
    if (patchRes.status === 400) {
      const errData = await patchRes.json();
      const msg = errData.message || '';
      if (msg.includes('non-unique') || msg.includes('multiple')) {
        return res.status(409).json({
          message: 'Multiple records found with this domain in HubSpot — please merge duplicates first',
        });
      }
      return res.status(400).json(errData);
    }

    if (patchRes.status !== 404) {
      const errData = await patchRes.json();
      return res.status(patchRes.status).json(errData);
    }

    // Step 2: 404 means no existing record — create a new one
    const createRes = await fetch(
      'https://api.hubapi.com/crm/v3/objects/companies',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ properties: cleanProps }),
      }
    );

    const createData = await createRes.json();
    return res.status(createRes.ok ? 201 : createRes.status).json(createData);

  } catch (e) {
    return res.status(502).json({ message: 'Upstream HubSpot request failed', error: e.message });
  }
};
