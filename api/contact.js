// Creates a HubSpot contact and associates it with an existing company.
// NEVER creates a company record — only reads companies via search.

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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, contactProperties, companyDomain } = req.body || {};
  if (!token)             return res.status(400).json({ error: 'Missing token' });
  if (!contactProperties) return res.status(400).json({ error: 'Missing contactProperties' });

  const domain = cleanDomain(companyDomain);
  console.log('contact.js: starting for domain:', domain);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  try {
    // Step 1: create the contact
    console.log('contact.js: creating contact...');
    const createRes  = await fetch(`${BASE}/crm/v3/objects/contacts`, {
      method: 'POST', headers,
      body: JSON.stringify({ properties: contactProperties }),
    });
    const createBody = await createRes.json();
    console.log('contact.js: contact create HTTP status:', createRes.status, '| body:', JSON.stringify(createBody));

    if (!createRes.ok) {
      return res.status(200).json({ error: createBody.message || 'Failed to create contact' });
    }

    const contactId = createBody.id;
    console.log('contact.js: contact created with id:', contactId);

    // Step 2: search for existing company by domain (read-only — NEVER creates a company)
    if (domain) {
      console.log('contact.js: searching for company with domain:', domain);
      const searchRes  = await fetch(`${BASE}/crm/v3/objects/companies/search`, {
        method: 'POST', headers,
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: domain }] }],
          properties: ['domain', 'name'],
        }),
      });
      const searchBody = await searchRes.json();
      console.log('contact.js: company search result:', searchBody.total, 'results found');

      if (searchRes.ok && searchBody.total > 0) {
        const companyId = searchBody.results[0].id;
        console.log('contact.js: linking contact', contactId, 'to company', companyId);
        const assocRes  = await fetch(
          `${BASE}/crm/v4/objects/contacts/${contactId}/associations/companies/${companyId}/labels`,
          {
            method: 'POST', headers,
            body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 280 }]),
          }
        );
        console.log('contact.js: association HTTP status:', assocRes.status);
        return res.status(200).json({ success: true, linked: true });
      }

      console.log('contact.js: no company found, returning unlinked');
      return res.status(200).json({ success: true, linked: false });
    }

    console.log('contact.js: no domain provided, returning unlinked');
    return res.status(200).json({ success: true, linked: false });
  } catch (e) {
    console.error('contact.js: exception:', e.message, e.stack);
    return res.status(200).json({ error: e.message || 'Request failed' });
  }
};
