export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { q = 'Dahlin' } = req.query;
  const lastName = q.split(' ').pop();
  const cap = lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();
  const results = {};

  const tests = {
    skater_lastName: `https://api.nhle.com/stats/rest/en/skater/summary?limit=5&sort=points&cayenneExp=seasonId=20252026 and lastName="${cap}"`,
    goalie_lastName: `https://api.nhle.com/stats/rest/en/goalie/summary?limit=5&sort=wins&cayenneExp=seasonId=20252026 and lastName="${cap}"`,
    gamelog_confirmed: `https://api-web.nhle.com/v1/player/8482671/game-log/now`,
  };

  for (const [key, url] of Object.entries(tests)) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
      const text = await r.text();
      results[key] = { status: r.status, ok: r.ok, snippet: text.slice(0, 400) };
    } catch(e) { results[key] = { error: e.message }; }
  }

  return res.json({ q, cap, results });
}
