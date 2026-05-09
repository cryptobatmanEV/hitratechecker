const KEY = process.env.FACEIT_API_KEY;
const BASE = 'https://open.faceit.com/data/v4';

async function ff(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${KEY}`, 'Accept': 'application/json' }
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`FACEIT ${r.status}: ${t.slice(0, 120)}`);
  }
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!KEY) return res.status(500).json({ error: 'FACEIT_API_KEY not set' });

  const { action, nickname, playerId, scope } = req.query;

  try {
    if (action === 'search') {
      const d = await ff(`/search/players?nickname=${encodeURIComponent(nickname)}&game=cs2&offset=0&limit=20`);
      const items = d.items || [];

      // Try Level 10 filter first (parseInt handles string "10" from API)
      const lvl10 = items
        .filter(p => parseInt(p.games?.cs2?.skill_level) === 10)
        .sort((a,b) => (parseInt(b.games?.cs2?.faceit_elo)||0) - (parseInt(a.games?.cs2?.faceit_elo)||0))
        .slice(0, 8);

      // Fallback: if Level 10 data is missing from response (happens for some accounts),
      // show all results sorted by ELO so pros still appear at top
      const toReturn = lvl10.length > 0 ? lvl10
        : items
            .sort((a,b) => (parseInt(b.games?.cs2?.faceit_elo)||0) - (parseInt(a.games?.cs2?.faceit_elo)||0))
            .slice(0, 6);

      return res.json({
        players: toReturn.map(p => ({
          id:  p.player_id,
          name: p.nickname,
          sub: [
            p.games?.cs2?.skill_level ? `Level ${p.games.cs2.skill_level}` : null,
            p.games?.cs2?.faceit_elo  ? `ELO ${p.games.cs2.faceit_elo}`    : null,
            p.country ? p.country.toUpperCase() : null,
          ].filter(Boolean).join(' · ')
        }))
      });
    }

    if (action === 'gamelog') {
      const limit   = scope === 'career' ? 40 : 20;
      const history = await ff(`/players/${playerId}/history?game=cs2&limit=${limit}&offset=0`);
      const matches = history.items || [];
      const games   = [];

      for (const match of matches.slice(0, 20)) {
        try {
          const stats = await ff(`/matches/${match.match_id}/stats`);

          // ── Sum ALL maps in the match into ONE entry ──────────────────────
          let kills=0, deaths=0, assists=0, headshots=0, mvps=0, maps=0;
          let result='L', opponent='', found=false;

          for (const round of stats.rounds || []) {       // each round = one map
            for (const team of round.teams || []) {
              const p = (team.players || []).find(x => x.player_id === playerId);
              if (!p) continue;
              const s = p.player_stats || {};
              kills     += parseInt(s['Kills']     || 0);
              deaths    += parseInt(s['Deaths']    || 0);
              assists   += parseInt(s['Assists']   || 0);
              headshots += parseInt(s['Headshots'] || 0);
              mvps      += parseInt(s['MVPs']      || 0);
              if (s['Result'] === '1') result = 'W';
              maps++;
              found = true;
              // Grab opponent name from the other team
              const opp = (round.teams || []).find(t => !t.players?.some(x => x.player_id === playerId));
              if (opp?.team_stats?.['Team']) opponent = opp.team_stats['Team'];
            }
          }

          if (found) {
            games.push({
              kills,
              deaths,
              assists,
              headshots,
              hsPct:  kills > 0 ? Math.round(headshots / kills * 100) : 0,
              kd:     deaths > 0 ? Math.round(kills / deaths * 10) / 10 : kills,
              mvps,
              maps,
              result,
              _date:  match.started_at ? new Date(match.started_at * 1000).toISOString().split('T')[0] : '',
              _opp:   opponent,
            });
          }
        } catch(e) { continue; }
      }

      return res.json({ games: games.filter(g => g.kills > 0 || g.deaths > 0) });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
