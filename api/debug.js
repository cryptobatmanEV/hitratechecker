export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const results = {};

  // Test 1: Basic connectivity to stats.nba.com
  try {
    const r = await fetch('https://stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=1&LeagueID=00&Season=2025-26', {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://www.nba.com',
        'Referer': 'https://www.nba.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'x-nba-stats-origin': 'stats',
        'x-nba-stats-token': 'true',
      }
    });
    const text = await r.text();
    results.allPlayers = {
      status: r.status,
      ok: r.ok,
      contentType: r.headers.get('content-type'),
      bodyPreview: text.slice(0, 300),
      isJSON: text.trim().startsWith('{') || text.trim().startsWith('['),
    };
  } catch(e) {
    results.allPlayers = { error: e.message };
  }

  // Test 2: Game log for Jokic (player ID 203999)
  try {
    const r = await fetch('https://stats.nba.com/stats/playergamelog?PlayerID=203999&Season=2025-26&SeasonType=Regular+Season', {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Origin': 'https://www.nba.com',
        'Referer': 'https://www.nba.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'x-nba-stats-origin': 'stats',
        'x-nba-stats-token': 'true',
      }
    });
    const text = await r.text();
    results.jokicGameLog = {
      status: r.status,
      ok: r.ok,
      contentType: r.headers.get('content-type'),
      bodyPreview: text.slice(0, 300),
      isJSON: text.trim().startsWith('{') || text.trim().startsWith('['),
    };
    if (r.ok && results.jokicGameLog.isJSON) {
      const d = JSON.parse(text);
      const rows = d.resultSets?.[0]?.rowSet || [];
      results.jokicGameLog.gamesFound = rows.length;
      results.jokicGameLog.firstGame = rows[0] || null;
    }
  } catch(e) {
    results.jokicGameLog = { error: e.message };
  }

  // Test 3: WNBA
  try {
    const r = await fetch('https://stats.wnba.com/stats/commonallplayers?IsOnlyCurrentSeason=0&LeagueID=10&Season=2025', {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://www.wnba.com',
        'Referer': 'https://www.wnba.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'x-nba-stats-origin': 'stats',
        'x-nba-stats-token': 'true',
      }
    });
    const text = await r.text();
    results.wnba = {
      status: r.status,
      ok: r.ok,
      bodyPreview: text.slice(0, 200),
      isJSON: text.trim().startsWith('{') || text.trim().startsWith('['),
    };
  } catch(e) {
    results.wnba = { error: e.message };
  }

  // Test 4: Server info
  results.serverInfo = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    region: process.env.VERCEL_REGION || 'unknown',
  };

  return res.status(200).json(results);
}
