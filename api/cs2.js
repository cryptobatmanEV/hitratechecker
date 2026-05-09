const KEY = process.env.FACEIT_API_KEY;
const BASE = 'https://open.faceit.com/data/v4';

async function ff(path) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { 'Authorization': `Bearer ${KEY}`, 'Accept': 'application/json' }
  });
  if (!r.ok) throw new Error(`FACEIT ${r.status}: ${path}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!KEY) return res.status(500).json({ error: 'FACEIT_API_KEY not set in Vercel environment variables' });

  const { action, nickname, playerId, scope } = req.query;

  try {
    if (action === 'search') {
      const d = await ff(`/search/players?nickname=${encodeURIComponent(nickname)}&game=cs2&offset=0&limit=10`);
      return res.json({
        players: (d.items || []).map(p => ({
          id: p.player_id,
          name: p.nickname,
          sub: `Level ${p.games?.cs2?.skill_level || '?'} · ${p.country || ''}`.trim()
        }))
      });
    }

    if (action === 'gamelog') {
      const limit = scope === 'career' ? 40 : 20;
      const history = await ff(`/players/${playerId}/history?game=cs2&limit=${limit}&offset=0`);
      const matches = history.items || [];
      const games = [];

      for (const match of matches.slice(0, 20)) {
        try {
          const stats = await ff(`/matches/${match.match_id}/stats`);
          const rounds = stats.rounds || [];
          for (const round of rounds) {
            for (const team of round.teams || []) {
              const p = (team.players || []).find(x => x.player_id === playerId);
              if (!p) continue;
              const s = p.player_stats || {};
              const opp = (round.teams || []).find(t => !t.players?.some(x => x.player_id === playerId));
              games.push({
                kills:     parseInt(s['Kills'] || 0),
                deaths:    parseInt(s['Deaths'] || 0),
                assists:   parseInt(s['Assists'] || 0),
                headshots: parseInt(s['Headshots'] || 0),
                hsPct:     parseFloat(s['Headshots %'] || 0),
                kd:        parseFloat(s['K/D Ratio'] || 0),
                kr:        parseFloat(s['K/R Ratio'] || 0),
                mvps:      parseInt(s['MVPs'] || 0),
                result:    s['Result'] === '1' ? 'W' : 'L',
                _date:     match.started_at ? new Date(match.started_at * 1000).toISOString().split('T')[0] : '',
                _opp:      opp?.team_stats?.['Team'] || '',
              });
            }
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
