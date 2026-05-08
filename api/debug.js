export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const results = { timestamp: new Date().toISOString(), tests: {} };

  async function testUrl(label, url, headers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const r = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timer);
      const text = await r.text();
      const isJson = text.trim().startsWith('{') || text.trim().startsWith('[');
      let rowCount = null;
      if (isJson && r.ok) {
        try {
          const d = JSON.parse(text);
          rowCount = d.resultSets?.[0]?.rowSet?.length ?? null;
        } catch(e) {}
      }
      results.tests[label] = {
        status: r.status,
        ok: r.ok,
        isJson,
        rowCount,
        preview: text.slice(0, 150)
      };
    } catch(e) {
      clearTimeout(timer);
      results.tests[label] = {
        error: e.name === 'AbortError' ? 'TIMED OUT after 3s' : e.message
      };
    }
  }

  const NBA_H = {
    'Accept': 'application/json',
    'Origin': 'https://www.nba.com',
    'Referer': 'https://www.nba.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
  };

  // Run tests sequentially to stay under time limit
  await testUrl(
    'nba_players',
    'https://stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=1&LeagueID=00&Season=2025-26',
    NBA_H
  );

  await testUrl(
    'nba_gamelog_jokic',
    'https://stats.nba.com/stats/playergamelog?PlayerID=203999&Season=2025-26&SeasonType=Regular+Season',
    NBA_H
  );

  await testUrl(
    'wnba_players',
    'https://stats.wnba.com/stats/commonallplayers?IsOnlyCurrentSeason=0&LeagueID=10&Season=2025',
    { ...NBA_H, 'Origin': 'https://www.wnba.com', 'Referer': 'https://www.wnba.com/' }
  );

  results.vercelRegion = process.env.VERCEL_REGION || 'unknown';

  return res.status(200).json(results);
}
