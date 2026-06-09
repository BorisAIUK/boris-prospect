// headless browser scanner v2
// Uses ScrapingBee API for JS-rendered HTML — free tier: 1000 credits/month, 1 credit per scan

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'SCRAPINGBEE_API_KEY not configured' });

  console.log('scan started for:', url);

  try {
    const sbUrl = `https://app.scrapingbee.com/api/v1/?api_key=${apiKey}&url=${encodeURIComponent(url)}&render_js=true&wait=3000`;

    console.log('calling ScrapingBee for:', url);
    const response = await fetch(sbUrl, { signal: AbortSignal.timeout(35000) });

    console.log('ScrapingBee status:', response.status);
    if (!response.ok) {
      const text = await response.text();
      console.error('ScrapingBee error response:', text);
      return res.status(200).json({ error: `ScrapingBee returned ${response.status}: ${text}` });
    }

    const html = await response.text();
    console.log('page loaded, html length:', html.length);
    return res.status(200).json({ html });
  } catch (err) {
    console.error('scan error:', err.message);
    console.error('stack:', err.stack);
    return res.status(200).json({ error: err.message || 'Scan failed' });
  }
};
