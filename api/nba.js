const BDL_KEY = "296a4c03-94ec-4cfd-a472-8e4d464c9167";

function seasonStr(offset = 0) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = (month >= 10 ? year : year - 1) - offset;
  return start;
}

function parseMin(m) {
  if (!m || m === "" || m === null) return 0;
  const s = m.toString().trim();
  if (s.includes(":")) return parseInt(s.split(":")[0]) || 0;
  return parseInt(s) || 0;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, query, playerId, scope } = req.query;

  try {
    // ── Player search ─────────────────────────────────────────────────────────
    if (action === 'search') {
      const r = await fetch(
        `https://api.balldontlie.io/v1/players?search=${encodeURIComponent(query)}&per_page=10`,
        { headers: { Authorization: BDL_KEY } }
      );
      const text = await r.text();
      if (r.status === 429) return res.status(429).json({ error: 'NBA rate limit hit (100/day free tier). Try again tomorrow.' });
      if (!r.ok) return res.status(500).json({ error: `BDL search failed (${r.status}): ${text.slice(0,150)}` });
      const d = JSON.parse(text);
      return res.json({
        players: (d.data || []).map(p => ({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          sub: p.team?.full_name || ''
        }))
      });
    }

    // ── Game log ──────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const curSeason = seasonStr(0);
      const seasons = scope === 'career'
        ? [curSeason, curSeason - 1, curSeason - 2]
        : [curSeason];

      let allGames = [];

      for (const season of seasons) {
        let page = 1, totalPages = 1;
        while (page <= totalPages && page <= 3) {
          try {
            const r = await fetch(
              `https://api.balldontlie.io/v1/stats?player_ids[]=${playerId}&seasons[]=${season}&per_page=100&page=${page}`,
              { headers: { Authorization: BDL_KEY } }
            );
            if (r.status === 429) break;
            if (!r.ok) break;
            const d = await r.json();
            totalPages = d.meta?.total_pages || 1;
            const played = (d.data || []).filter(g => parseMin(g.min) > 0);

            // NBA team ID to abbr map
            const TEAMS = {1:"ATL",2:"BOS",3:"BKN",4:"CHA",5:"CHI",6:"CLE",7:"DAL",8:"DEN",9:"DET",10:"GSW",11:"HOU",12:"IND",13:"LAC",14:"LAL",15:"MEM",16:"MIA",17:"MIL",18:"MIN",19:"NOP",20:"NYK",21:"OKC",22:"ORL",23:"PHI",24:"PHX",25:"POR",26:"SAC",27:"SAS",28:"TOR",29:"UTA",30:"WAS"};

            played.forEach(g => {
              const isHome = g.game.home_team_id === g.team.id;
              const oppId = isHome ? g.game.visitor_team_id : g.game.home_team_id;
              allGames.push({
                pts: g.pts, reb: g.reb, ast: g.ast, stl: g.stl,
                blk: g.blk, fg3m: g.fg3m, turnover: g.turnover, min: g.min,
                _date: (g.game.date || '').split('T')[0],
                _opp: TEAMS[oppId] || `T${oppId}`,
                _oppFull: TEAMS[oppId] || '',
                _season: season,
              });
            });
            page++;
          } catch(e) { break; }
        }
      }

      return res.json({ games: allGames.sort((a, b) => new Date(b._date) - new Date(a._date)) });
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
