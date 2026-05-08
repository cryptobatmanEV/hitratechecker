const WNBA_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Origin': 'https://www.wnba.com',
  'Referer': 'https://www.wnba.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
  'Pragma': 'no-cache',
  'Cache-Control': 'no-cache',
};

function toRows(resultSet) {
  if (!resultSet?.headers || !resultSet?.rowSet) return [];
  return resultSet.rowSet.map(row => {
    const obj = {};
    resultSet.headers.forEach((k, i) => obj[k] = row[i]);
    return obj;
  });
}

function currentSeason(offset = 0) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const cur = (month >= 5 ? year : year - 1) - offset;
  return String(cur);
}

async function wnbaFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const r = await fetch(url, { headers: WNBA_HEADERS, signal: controller.signal });
    clearTimeout(timer);
    return r;
  } catch(e) {
    clearTimeout(timer);
    throw new Error(e.name === 'AbortError' ? 'WNBA API timed out' : e.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, query, playerId, scope } = req.query;

  try {
    if (action === 'search') {
      const season = currentSeason(0);
      const r = await wnbaFetch(
        `https://stats.wnba.com/stats/commonallplayers?IsOnlyCurrentSeason=0&LeagueID=10&Season=${season}`
      );
      if (!r.ok) {
        const txt = await r.text();
        return res.status(500).json({ error: `WNBA search ${r.status}: ${txt.slice(0,150)}` });
      }
      const d = await r.json();
      const rows = toRows(d.resultSets[0]);
      const q = (query || '').toLowerCase();
      return res.json({
        players: rows
          .filter(p => p.IS_ACTIVE_FLAG === 'Y' && (p.DISPLAY_FIRST_LAST || '').toLowerCase().includes(q))
          .slice(0, 10)
          .map(p => ({ id: p.PERSON_ID, name: p.DISPLAY_FIRST_LAST, sub: p.TEAM_ABBREVIATION || '' }))
      });
    }

    if (action === 'gamelog') {
      const seasons = scope === 'career'
        ? [currentSeason(0), currentSeason(1), currentSeason(2)]
        : [currentSeason(0)];

      let allGames = [];

      for (const season of seasons) {
        try {
          const r = await wnbaFetch(
            `https://stats.wnba.com/stats/playergamelog?PlayerID=${playerId}&Season=${season}&SeasonType=Regular+Season&LeagueID=10`
          );
          if (!r.ok) continue;
          const d = await r.json();
          const rows = toRows(d.resultSets[0]);
          rows.forEach(g => {
            const parts = (g.MATCHUP || '').split(/ vs\. | @ /);
            const opp = parts.length > 1 ? parts[1] : '';
            const parsed = new Date(g.GAME_DATE || '');
            const iso = isNaN(parsed) ? (g.GAME_DATE || '') : parsed.toISOString().split('T')[0];
            allGames.push({
              pts: g.PTS, reb: g.REB, ast: g.AST, stl: g.STL,
              blk: g.BLK, fg3m: g.FG3M, turnover: g.TOV, min: g.MIN,
              _date: iso, _opp: opp, _oppFull: opp, _season: season,
            });
          });
        } catch(e) { continue; }
      }

      return res.json({ games: allGames.sort((a, b) => new Date(b._date) - new Date(a._date)) });
    }

    res.status(400).json({ error: 'Unknown action' });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
