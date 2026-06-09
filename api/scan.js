// headless browser scanner v2
const chromium = require('chrome-aws-lambda');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });

  console.log('scan started for:', url);

  let browser;
  try {
    const executablePath = await chromium.executablePath;
    console.log('executablePath:', executablePath);

    console.log('launching chromium...');
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
    console.log('chromium launched');

    const page = await browser.newPage();

    // Suppress images, fonts and media to speed up load
    await page.setRequestInterception(true);
    page.on('request', req => {
      const type = req.resourceType();
      if (['image', 'media', 'font'].includes(type)) req.abort();
      else req.continue();
    });

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    console.log('navigating to', url, '...');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });

    // Wait 3 s for any deferred widget scripts to initialise
    await new Promise(r => setTimeout(r, 3000));

    const html = await page.content();
    console.log('page loaded, html length:', html.length);
    return res.status(200).json({ html });
  } catch (err) {
    console.error('scan error:', err.message);
    console.error('stack:', err.stack);
    return res.status(200).json({ error: err.message || 'Scan failed' });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};
