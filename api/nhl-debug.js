export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q = 'dahlin' } = req.query;
  const results = {};

  const endpoints = [
    // Old suggest API (used to work for years)
    `https://suggest.svc.nhl.com/svc/suggest/v1/minactiveplayers/${encodeURIComponent(q)}/5`,
    // Stats REST with name filter
    `https://api.nhle.com/stats/rest/en/players?limit=5&sort=lastName&cayenneExp=lastName="${q}"`,
    // Search d3 without active param
    `https://search.d3.nhle.com/api/v1/search?q=${encodeURIComponent(q)}&culture=en-us&limit=5`,
    // Stats REST skater search
    `https://api.nhle.com/stats/rest/en/skater/summary?limit=5&sort=points&cayenneExp=seasonId=20242025 and skaterFullName like "%${q}%"`,
    // Web API roster approach - get player by ID using known Dahlin ID
    `https://api-web.nhle.com/v1/player/8481533/landing`,
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const text = await r.text();
      results[url.split('?')[0]] = { status: r.status, ok: r.ok, snippet: text.slice(0, 400) };
    } catch(e) {
      results[url.split('?')[0]] = { error: e.message };
    }
  }

  return res.json({ q, results });
}
