const NBA_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
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
  const start = (month >= 10 ? year : year - 1) - offset;
  return `${start}-${(start + 1).toString().slice(2)}`;
}

async function nbaFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const r = await fetch(url, { headers: NBA_HEADERS, signal: controller.signal });
    clearTimeout(timer);
    return r;
  } catch(e) {
    clearTimeout(timer);
    throw new Error(e.name === 'AbortError' ? 'NBA API timed out' : e.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, query, playerId, scope } = req.query;

  try {
    // ── Search ────────────────────────────────────────────────────────────────
    if (action === 'search') {
      const season = currentSeason(0);
      const r = await nbaFetch(
        `https://stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=1&LeagueID=00&Season=${season}`
      );
      if (!r.ok) {
        const txt = await r.text();
        return res.status(500).json({ error: `NBA search ${r.status}: ${txt.slice(0,150)}` });
      }
      const d = await r.json();
      const rows = toRows(d.resultSets[0]);
      const q = (query || '').toLowerCase();
      return res.json({
        players: rows
          .filter(p => (p.DISPLAY_FIRST_LAST || '').toLowerCase().includes(q))
          .slice(0, 10)
          .map(p => ({ id: p.PERSON_ID, name: p.DISPLAY_FIRST_LAST, sub: p.TEAM_ABBREVIATION || '' }))
      });
    }

    // ── Game log ──────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const seasons = scope === 'career'
        ? [currentSeason(0), currentSeason(1), currentSeason(2)]
        : [currentSeason(0)];

      let allGames = [];

      for (const season of seasons) {
        try {
          const r = await nbaFetch(
            `https://stats.nba.com/stats/playergamelog?PlayerID=${playerId}&Season=${season}&SeasonType=Regular+Season`
          );
          if (!r.ok) {
            const txt = await r.text();
            console.log(`Game log ${season} failed ${r.status}: ${txt.slice(0,100)}`);
            continue;
          }
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
        } catch(e) {
          console.log(`Season ${season} error: ${e.message}`);
          continue;
        }
      }

      return res.json({ games: allGames.sort((a, b) => new Date(b._date) - new Date(a._date)) });
    }

    res.status(400).json({ error: 'Unknown action. Use action=search or action=gamelog' });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
