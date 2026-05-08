export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  async function test(label, url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const r = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      const text = await r.text();
      results[label] = {
        status: r.status,
        ok: r.ok,
        preview: text.slice(0, 400)
      };
    } catch(e) {
      clearTimeout(timer);
      results[label] = { error: e.name === 'AbortError' ? 'BLOCKED/TIMEOUT' : e.message };
    }
  }

  // TheSportsDB - test player game events (Joel Embiid ID from previous test: 34162324)
  await test('tsdb_player_events',
    'https://www.thesportsdb.com/api/v1/json/3/eventsplayer.php?id=34162324'
  );

  // TheSportsDB - player stats
  await test('tsdb_player_stats',
    'https://www.thesportsdb.com/api/v1/json/3/lookupplayerstats.php?id=34162324&s=2025-2026&l=4387'
  );

  // TheSportsDB - league events (NBA league ID 4387)
  await test('tsdb_league_events',
    'https://www.thesportsdb.com/api/v1/json/3/eventsseason.php?id=4387&s=2025-2026'
  );

  // cdn.nba.com - test if player gamelog exists
  await test('cdn_nba_player',
    'https://cdn.nba.com/static/json/liveData/gamecenter/0022501000_g.json'
  );

  // api.nba.com - different domain worth trying
  await test('api_nba_com',
    'https://api.nba.com/stats/playerprofile/v2?PlayerID=203999&PerMode=PerGame'
  );

  results._time = new Date().toISOString();
  return res.status(200).json(results);
}
