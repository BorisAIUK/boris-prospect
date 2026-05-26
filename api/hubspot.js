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

  try {
    const hsRes = await fetch(
      'https://api.hubapi.com/crm/v3/objects/companies/batch/upsert',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          inputs: [{
            idProperty: 'domain',
            id: domain,
            properties: cleanProps,
          }],
        }),
      }
    );

    const data = await hsRes.json();

    if (!hsRes.ok) {
      return res.status(hsRes.status).json(data);
    }

    // Distinguish create vs update: for a new record createdAt === updatedAt
    const record = data.results && data.results[0];
    const wasCreated = record && record.createdAt === record.updatedAt;
    return res.status(wasCreated ? 201 : 200).json(data);

  } catch (e) {
    return res.status(502).json({ message: 'Upstream HubSpot request failed', error: e.message });
  }
};
