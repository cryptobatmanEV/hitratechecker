export const config = { maxDuration: 30 };

// stats.wnba.com requires these headers or returns 403
const HEADERS = {
  'Host': 'stats.wnba.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
  'Referer': 'https://stats.wnba.com/',
  'Origin': 'https://stats.wnba.com',
  'Connection': 'keep-alive',
};

function currentSeason() {
  const now = new Date();
  return now.getMonth() >= 4 ? now.getFullYear() : now.getFullYear() - 1;
}

async function wnbaFetch(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (!r.ok) throw new Error(`stats.wnba.com ${r.status}`);
  return r.json();
}

function toRows(data, setName) {
  const rs = (data.resultSets || []).find(s => s.name === setName) || data.resultSets?.[0];
  if (!rs) return [];
  const h = rs.headers || [];
  return (rs.rowSet || []).map(row => Object.fromEntries(h.map((k, i) => [k, row[i]])));
}

function formatGame(g) {
  return {
    pts:   g.PTS  ?? 0,
    reb:   g.REB  ?? 0,
    ast:   g.AST  ?? 0,
    stl:   g.STL  ?? 0,
    blk:   g.BLK  ?? 0,
    fg3m:  g.FG3M ?? 0,
    tov:   g.TOV  ?? 0,
    _date: (g.GAME_DATE || '').slice(0, 10),
    _opp:  (g.MATCHUP || '').split(/\s+vs\.?\s+|\s+@\s+/).pop() || '',
    win:   g.WL === 'W',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { action, q, id, scope } = req.query;
  const season = currentSeason();

  try {
    if (action === 'search') {
      const data = await wnbaFetch(
        `https://stats.wnba.com/stats/commonallplayers?LeagueID=10&Season=${season}&IsOnlyCurrentSeason=1`
      );
      const players = toRows(data, 'CommonAllPlayers');
      const ql = (q || '').toLowerCase();
      const results = players
        .filter(p => (p.DISPLAY_FIRST_LAST || '').toLowerCase().includes(ql))
        .slice(0, 10)
        .map(p => ({
          id:   String(p.PERSON_ID),
          name: p.DISPLAY_FIRST_LAST || '',
          sub:  p.TEAM_NAME || 'WNBA',
        }));
      return res.json(results);
    }

    if (action === 'gamelog') {
      if (!id) return res.json([]);
      const seasons = scope === 'career' ? [season - 1, season - 2] : [season];
      const all = [];
      for (const s of seasons) {
        try {
          const data = await wnbaFetch(
            `https://stats.wnba.com/stats/playergamelogs?LeagueID=10&Season=${s}&SeasonType=Regular+Season&PlayerID=${id}`
          );
          all.push(...toRows(data, 'PlayerGameLogs').map(formatGame));
        } catch {}
      }
      return res.json(all);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
