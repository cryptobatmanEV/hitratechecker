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
      results[label] = { status: r.status, ok: r.ok, preview: text.slice(0, 500) };
    } catch(e) {
      clearTimeout(timer);
      results[label] = { error: e.name === 'AbortError' ? 'BLOCKED' : e.message };
    }
  }

  // Look up a specific NBA game to see if player stats are inside
  // Event ID 2292728 = Knicks vs 76ers from the previous test
  await test('tsdb_lookupevent',
    'https://www.thesportsdb.com/api/v1/json/3/lookupevent.php?id=2292728'
  );

  // TheSportsDB game results/stats
  await test('tsdb_lookupresults',
    'https://www.thesportsdb.com/api/v1/json/3/lookupresults.php?id=2292728'
  );

  // TheSportsDB player events - correct endpoint
  await test('tsdb_eventsplayer',
    'https://www.thesportsdb.com/api/v1/json/3/eventsplayer.php?id=34162324&s=2025-2026'
  );

  // BallDontLie season averages (might be free tier)
  await test('bdl_season_avg',
    'https://api.balldontlie.io/v1/season_averages?season=2025&player_ids[]=246',
    { 'Authorization': '296a4c03-94ec-4cfd-a472-8e4d464c9167' }
  );

  // Try nba.com internal app API
  await test('nba_app_api',
    'https://www.nba.com/player/203999/stats'
  );

  results._time = new Date().toISOString();
  return res.status(200).json(results);
}
