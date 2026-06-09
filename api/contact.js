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

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  try {
    // Step 1: create the contact
    const createRes  = await fetch(`${BASE}/crm/v3/objects/contacts`, {
      method: 'POST', headers,
      body: JSON.stringify({ properties: contactProperties }),
    });
    const createBody = await createRes.json();
    console.log('[contact] create status:', createRes.status, JSON.stringify(createBody));

    if (!createRes.ok) {
      return res.status(200).json({ error: createBody.message || 'Failed to create contact' });
    }

    const contactId = createBody.id;
    const domain    = cleanDomain(companyDomain);

    // Step 2: search for existing company by domain (read-only — never creates)
    if (domain) {
      const searchRes  = await fetch(`${BASE}/crm/v3/objects/companies/search`, {
        method: 'POST', headers,
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: domain }] }],
          properties: ['domain', 'name'],
        }),
      });
      const searchBody = await searchRes.json();
      console.log('[contact] company search status:', searchRes.status, '| total:', searchBody.total);

      if (searchRes.ok && searchBody.total > 0) {
        // Step 3: associate contact → existing company
        const companyId = searchBody.results[0].id;
        const assocRes  = await fetch(
          `${BASE}/crm/v4/objects/contacts/${contactId}/associations/companies/${companyId}/labels`,
          {
            method: 'POST', headers,
            body: JSON.stringify([{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 280 }]),
          }
        );
        console.log('[contact] association status:', assocRes.status);
        return res.status(200).json({ success: true, linked: true });
      }

      // Company not found — contact created but not linked (no company creation)
      console.log('[contact] no company found for domain:', domain, '— contact created without link');
      return res.status(200).json({ success: true, linked: false });
    }

    return res.status(200).json({ success: true, linked: false });
  } catch (e) {
    console.error('[contact] exception:', e.message);
    return res.status(200).json({ error: e.message || 'Request failed' });
  }
};
