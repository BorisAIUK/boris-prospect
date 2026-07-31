const fs = require('fs');
const path = require('path');
const { isAuthed } = require('./_auth.js');

// index.html is entirely self-contained (no separate .css/.js assets), so
// gating every non-API route through this one function is enough to cover
// the whole app.
const INDEX_PATH = path.join(__dirname, '..', 'index.html');

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Boris Prospect — Sign in</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f5f7; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
  .card { background:#fff; border-radius:12px; box-shadow:0 4px 24px rgba(0,0,0,0.08); padding:2.5rem; width:100%; max-width:340px; }
  h1 { font-size:1.15rem; margin:0 0 1.25rem; color:#1a1a2e; }
  input { width:100%; box-sizing:border-box; padding:0.65rem 0.75rem; border:1px solid #d7d9e0; border-radius:8px; font-size:0.95rem; margin-bottom:0.85rem; }
  button { width:100%; padding:0.65rem; border:none; border-radius:8px; background:#fe7032; color:#fff; font-weight:600; font-size:0.95rem; cursor:pointer; }
  button:disabled { opacity:0.6; cursor:not-allowed; }
  .err { color:#c0392b; font-size:0.82rem; margin-bottom:0.75rem; min-height:1em; }
</style>
</head>
<body>
  <form class="card" id="login-form">
    <h1>Boris Prospect</h1>
    <div class="err" id="err"></div>
    <input type="password" id="password" placeholder="Password" autofocus required />
    <button type="submit" id="btn">Sign in</button>
  </form>
  <script>
    const form = document.getElementById('login-form');
    const btn = document.getElementById('btn');
    const err = document.getElementById('err');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: document.getElementById('password').value }),
        });
        if (res.ok) {
          window.location.reload();
        } else {
          const data = await res.json().catch(() => ({}));
          err.textContent = data.error || 'Sign in failed';
          btn.disabled = false;
          btn.textContent = 'Sign in';
        }
      } catch (e) {
        err.textContent = 'Network error — try again';
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    });
  </script>
</body>
</html>`;

module.exports = async function handler(req, res) {
  if (isAuthed(req)) {
    try {
      const html = fs.readFileSync(INDEX_PATH, 'utf8');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    } catch (err) {
      return res.status(500).send('Failed to load the app.');
    }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(401).send(LOGIN_PAGE);
};
