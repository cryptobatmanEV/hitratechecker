const NBA_HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

function seasonStr(offset = 0) {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = (month >= 10 ? year : year - 1) - offset;
  return `${start}-${(start + 1).toString().slice(2)}`;
}

async function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const r = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return r;
  } catch(e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('Request timed out after 8s');
    throw e;
  }
}

function toRows(resultSet) {
  const h = resultSet.headers;
  return resultSet.rowSet.map(row => {
    const obj = {};
    h.forEach((k, i) => obj[k] = row[i]);
    return obj;
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, query, playerId, scope } = req.query;

  try {
    // ── Player search ─────────────────────────────────────────────────────────
    if (action === 'search') {
      const season = seasonStr(0);
      const r = await fetchWithTimeout(
        `https://stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=1&LeagueID=00&Season=${season}`,
        { headers: NBA_HEADERS }
      );
      if (!r.ok) throw new Error(`NBA API returned ${r.status}`);
      const d = await r.json();
      const rows = toRows(d.resultSets[0]);
      const q = (query || '').toLowerCase();
      const matches = rows
        .filter(p => (p.DISPLAY_FIRST_LAST || '').toLowerCase().includes(q))
        .slice(0, 10)
        .map(p => ({ id: p.PERSON_ID, name: p.DISPLAY_FIRST_LAST, sub: p.TEAM_ABBREVIATION || '' }));
      return res.json({ players: matches });
    }

    // ── Game log ──────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const seasons = scope === 'lifetime'
        ? [seasonStr(0), seasonStr(1), seasonStr(2)]
        : [seasonStr(0)];

      let allGames = [];
      for (const season of seasons) {
        try {
          const r = await fetchWithTimeout(
            `https://stats.nba.com/stats/playergamelog?PlayerID=${playerId}&Season=${season}&SeasonType=Regular+Season`,
            { headers: NBA_HEADERS }
          );
          if (!r.ok) continue;
          const d = await r.json();
          const rows = toRows(d.resultSets[0]);
          rows.forEach(g => {
            const parts = (g.MATCHUP || '').split(/ vs\. | @ /);
            const opp   = parts.length > 1 ? parts[1] : '';
            const parsed = new Date(g.GAME_DATE || '');
            const iso    = isNaN(parsed) ? (g.GAME_DATE || '') : parsed.toISOString().split('T')[0];
            allGames.push({
              pts: g.PTS, reb: g.REB, ast: g.AST, stl: g.STL,
              blk: g.BLK, fg3m: g.FG3M, turnover: g.TOV, min: g.MIN,
              _date: iso, _opp: opp, _oppFull: opp, _season: season,
            });
          });
        } catch(e) { continue; }
      }
      return res.json({ games: allGames });
    }

    res.status(400).json({ error: 'Unknown action' });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
