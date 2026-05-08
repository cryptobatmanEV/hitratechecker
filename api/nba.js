export const config = { runtime: 'edge' };

const NBA_H = {
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
  'Pragma': 'no-cache',
  'Cache-Control': 'no-cache',
};

function toRows(rs) {
  if (!rs?.headers || !rs?.rowSet) return [];
  return rs.rowSet.map(row => {
    const obj = {};
    rs.headers.forEach((k,i) => obj[k] = row[i]);
    return obj;
  });
}

function currentSeason(offset = 0) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = (month >= 10 ? year : year - 1) - offset;
  return `${start}-${(start+1).toString().slice(2)}`;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' } });
  }

  const { searchParams } = new URL(req.url);
  const action   = searchParams.get('action');
  const query    = searchParams.get('query') || '';
  const playerId = searchParams.get('playerId');
  const scope    = searchParams.get('scope') || 'season';

  try {
    if (action === 'search') {
      const r = await fetch(
        `https://stats.nba.com/stats/commonallplayers?IsOnlyCurrentSeason=1&LeagueID=00&Season=${currentSeason(0)}`,
        { headers: NBA_H }
      );
      if (!r.ok) return jsonResponse({ error: `NBA ${r.status}: ${(await r.text()).slice(0,150)}` }, 500);
      const d = await r.json();
      const rows = toRows(d.resultSets[0]);
      const q = query.toLowerCase();
      return jsonResponse({
        players: rows
          .filter(p => (p.DISPLAY_FIRST_LAST||'').toLowerCase().includes(q))
          .slice(0,10)
          .map(p => ({ id: p.PERSON_ID, name: p.DISPLAY_FIRST_LAST, sub: p.TEAM_ABBREVIATION||'' }))
      });
    }

    if (action === 'gamelog') {
      const seasons = scope === 'career'
        ? [currentSeason(0), currentSeason(1), currentSeason(2)]
        : [currentSeason(0)];

      let allGames = [];
      for (const season of seasons) {
        try {
          const r = await fetch(
            `https://stats.nba.com/stats/playergamelog?PlayerID=${playerId}&Season=${season}&SeasonType=Regular+Season`,
            { headers: NBA_H }
          );
          if (!r.ok) continue;
          const d = await r.json();
          toRows(d.resultSets[0]).forEach(g => {
            const parts = (g.MATCHUP||'').split(/ vs\. | @ /);
            const opp = parts.length > 1 ? parts[1] : '';
            allGames.push({
              pts:g.PTS, reb:g.REB, ast:g.AST, stl:g.STL,
              blk:g.BLK, fg3m:g.FG3M, turnover:g.TOV, min:g.MIN,
              _date:(g.GAME_DATE||'').replace(/[A-Z]{3}, /,''),
              _opp:opp, _oppFull:opp, _season:season,
            });
          });
        } catch(e) { continue; }
      }

      return jsonResponse({ games: allGames.sort((a,b) => new Date(b._date)-new Date(a._date)) });
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch(e) {
    return jsonResponse({ error: e.message }, 500);
  }
}
