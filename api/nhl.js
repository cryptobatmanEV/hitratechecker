export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, q, playerId } = req.query;

  try {
    // ── Search ──────────────────────────────────────────────────────────────
    if (action === 'search') {
      // Try NHL's own search API first
      const r = await fetch(
        `https://search.d3.nhle.com/api/v1/search?q=${encodeURIComponent(q)}&type=player&active=true&limit=8`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
      );
      if (!r.ok) throw new Error(`NHL search ${r.status}`);
      const d = await r.json();
      const players = (d.player || []).map(p => ({
        id:   p.playerId,
        name: p.name,
        sub:  `${p.positionCode || ''} · ${p.teamAbbrev || 'Free Agent'}`.trim(),
      }));
      return res.json({ players });
    }

    // ── Game log ─────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const r = await fetch(
        `https://api-web.nhle.com/v1/player/${playerId}/game-log/now`,
        { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
      );
      if (!r.ok) throw new Error(`NHL API ${r.status}`);
      const d = await r.json();
      const games = (d.gameLog || []).map(g => ({
        stat: {
          goals:   g.goals   || 0,
          assists: g.assists || 0,
          points:  (g.goals || 0) + (g.assists || 0),
          shots:   g.shots  || 0,
          toi:     g.toi    || '0:00',
        },
        _date:   g.gameDate       || '',
        _opp:    g.opponentAbbrev || '',
        _isHome: g.homeRoadFlag   === 'H',
      })).reverse();
      return res.json({ games });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
