export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q = 'Dahlin' } = req.query;
  const results = {};

  const endpoints = [
    // See raw player fields with no filter
    `https://api.nhle.com/stats/rest/en/players?limit=3&sort=lastName`,
    // Try capitalized name
    `https://api.nhle.com/stats/rest/en/players?limit=5&sort=lastName&cayenneExp=lastName=%22${encodeURIComponent(q)}%22`,
    // Try skater summary current season
    `https://api.nhle.com/stats/rest/en/skater/summary?limit=3&sort=points&cayenneExp=seasonId=20252026`,
    // Confirm game log works for Dahlin (id 8481533 was wrong - Dahlin is 8482671)
    `https://api-web.nhle.com/v1/player/8482671/game-log/now`,
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const text = await r.text();
      results[url.split('?')[0]] = { status: r.status, ok: r.ok, snippet: text.slice(0, 500) };
    } catch(e) {
      results[url.split('?')[0]] = { error: e.message };
    }
  }

  return res.json({ q, results });
}
