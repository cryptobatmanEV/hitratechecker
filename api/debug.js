export const config = { runtime: 'edge' };

export default async function handler(req) {
  const NBA_H = {
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://www.nba.com',
    'Referer': 'https://www.nba.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
  };

  const results = { timestamp: new Date().toISOString(), runtime: 'edge', tests: {} };

  async function test(label, url, headers) {
    try {
      const r = await fetch(url, { headers });
      const text = await r.text();
      const isJson = text.trim().startsWith('{');
      let rowCount = null;
      if (isJson && r.ok) {
        try { rowCount = JSON.parse(text).resultSets?.[0]?.rowSet?.length ?? null; } catch(e) {}
      }
      results.tests[label] = { status: r.status, ok: r.ok, isJson, rowCount, preview: text.slice(0,150) };
    } catch(e) {
      results.tests[label] = { error: e.message };
    }
  }

  await test('nba_players',
    'https://stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=1&LeagueID=00&Season=2025-26',
    NBA_H
  );

  await test('nba_gamelog_jokic',
    'https://stats.nba.com/stats/playergamelog?PlayerID=203999&Season=2025-26&SeasonType=Regular+Season',
    NBA_H
  );

  await test('wnba_players',
    'https://stats.wnba.com/stats/commonallplayers?IsOnlyCurrentSeason=0&LeagueID=10&Season=2025',
    { ...NBA_H, 'Origin': 'https://www.wnba.com', 'Referer': 'https://www.wnba.com/' }
  );

  return new Response(JSON.stringify(results, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
