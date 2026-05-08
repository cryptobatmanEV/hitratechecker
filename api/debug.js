export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const results = {};

  async function test(label, url, headers = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const r = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timer);
      const text = await r.text();
      const isJson = text.trim().startsWith('{') || text.trim().startsWith('[');
      results[label] = {
        status: r.status,
        ok: r.ok,
        isJson,
        preview: text.slice(0, 200)
      };
    } catch(e) {
      clearTimeout(timer);
      results[label] = { error: e.name === 'AbortError' ? 'BLOCKED/TIMEOUT' : e.message };
    }
  }

  // Test 1: data.nba.net CDN (different domain from stats.nba.com)
  await test('data_nba_net_players',
    'https://data.nba.net/10s/prod/v1/2025/players.json'
  );

  // Test 2: data.nba.net game log
  await test('data_nba_net_gamelog_jokic',
    'https://data.nba.net/10s/prod/v1/2025/players/203999_gamelog.json'
  );

  // Test 3: TheSportsDB - completely free NBA API
  await test('thesportsdb_search',
    'https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=embiid'
  );

  // Test 4: BallDontLie player search (we know this works)
  await test('balldontlie_search',
    'https://api.balldontlie.io/v1/players?search=jokic&per_page=5',
    { 'Authorization': '296a4c03-94ec-4cfd-a472-8e4d464c9167' }
  );

  // Test 5: BallDontLie STATS (this is what was failing before)
  await test('balldontlie_stats',
    'https://api.balldontlie.io/v1/stats?player_ids[]=246&seasons[]=2025&per_page=5',
    { 'Authorization': '296a4c03-94ec-4cfd-a472-8e4d464c9167' }
  );

  // Test 6: cdn.nba.com
  await test('cdn_nba_com',
    'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json'
  );

  results._region = process.env.VERCEL_REGION || 'unknown';
  results._time = new Date().toISOString();

  return res.status(200).json(results);
}
