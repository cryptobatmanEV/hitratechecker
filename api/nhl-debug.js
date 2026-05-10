export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q = 'dahlin' } = req.query;
  const results = {};

  // Test every plausible search endpoint
  const endpoints = [
    `https://api-web.nhle.com/v1/search/player?culture=en-us&limit=5&q=${encodeURIComponent(q)}&active=true`,
    `https://search.d3.nhle.com/api/v1/search?q=${encodeURIComponent(q)}&active=true&limit=5`,
    `https://api.nhle.com/stats/rest/en/players?limit=5&sort=lastName&cayenneExp=active=1`,
    `https://api-web.nhle.com/v1/player/search?q=${encodeURIComponent(q)}&active=true`,
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const text = await r.text();
      results[url] = { status: r.status, ok: r.ok, snippet: text.slice(0, 300) };
    } catch(e) {
      results[url] = { error: e.message };
    }
  }

  return res.json({ q, results });
}
