module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { token, properties } = req.body || {};

  if (!token) return res.status(400).json({ message: 'Missing HubSpot token' });
  if (!properties) return res.status(400).json({ message: 'Missing properties' });

  try {
    const hsRes = await fetch(
      'https://api.hubapi.com/crm/v3/objects/companies?idProperty=domain',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ properties }),
      }
    );

    const data = await hsRes.json();
    return res.status(hsRes.status).json(data);
  } catch (e) {
    return res.status(502).json({ message: 'Upstream HubSpot request failed', error: e.message });
  }
};
