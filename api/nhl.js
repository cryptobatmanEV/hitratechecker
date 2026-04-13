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

function seasonStr(offset = 0) {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = (month >= 10 ? year : year - 1) - offset;
  return `${start}${start + 1}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, query, playerId, scope } = req.query;

  try {
    // ── Player search ─────────────────────────────────────────────────────────
    if (action === 'search') {
      // Try NHL web search first
      try {
        const r = await fetchWithTimeout(
          `https://search.d3.nhle.com/api/v1/search?q=${encodeURIComponent(query)}&type=player&active=true`
        );
        if (r.ok) {
          const d = await r.json();
          if (d && d.length > 0) {
            return res.json({
              players: d.slice(0, 10).map(p => ({
                id:   p.playerId,
                name: p.name,
                sub:  `${p.positionCode || ''} · ${p.teamAbbrev || ''}`.trim()
              }))
            });
          }
        }
      } catch(e) {}

      // Fallback: NHL suggest API
      // Format: playerId|jersey|lastName|firstName|teamAbbrev|position
      const r2 = await fetchWithTimeout(
        `https://suggest.svc.nhl.com/svc/suggest/v1/minactiveplayers/${encodeURIComponent(query)}/10`
      );
      if (!r2.ok) throw new Error(`NHL search failed (${r2.status})`);
      const d2 = await r2.json();
      const suggestions = d2.suggestions || [];
      if (!suggestions.length) return res.json({ players: [] });

      return res.json({
        players: suggestions.slice(0, 10).map(p => {
          const pts = p.split('|');
          return {
            id:   pts[0],
            name: `${pts[3]} ${pts[2]}`,
            sub:  `${pts[5] || ''} · ${pts[4] || ''}`.trim()
          };
        })
      });
    }

    // ── Game log ──────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      let allGames = [];

      // Current season
      try {
        const r = await fetchWithTimeout(
          `https://api-web.nhle.com/v1/player/${playerId}/game-log/now`
        );
        if (r.ok) {
          const d = await r.json();
          (d.gameLog || []).forEach(g => {
            allGames.push({
              goals: g.goals, assists: g.assists, shots: g.shots,
              hits: g.hits, blockedShots: g.blockedShots,
              powerPlayGoals: g.powerPlayGoals || 0,
              powerPlayAssists: g.powerPlayAssists || 0,
              _date: g.gameDate, _opp: g.opponentAbbrev || '',
              _oppFull: g.opponentAbbrev || '', _season: 'current',
            });
          });
        }
      } catch(e) {}

      // Past seasons if lifetime
      if (scope === 'lifetime') {
        for (let offset = 1; offset <= 2; offset++) {
          const seasonId = seasonStr(offset);
          try {
            const r = await fetchWithTimeout(
              `https://api-web.nhle.com/v1/player/${playerId}/game-log/${seasonId}/2`
            );
            if (!r.ok) continue;
            const d = await r.json();
            (d.gameLog || []).forEach(g => {
              allGames.push({
                goals: g.goals, assists: g.assists, shots: g.shots,
                hits: g.hits, blockedShots: g.blockedShots,
                powerPlayGoals: g.powerPlayGoals || 0,
                powerPlayAssists: g.powerPlayAssists || 0,
                _date: g.gameDate, _opp: g.opponentAbbrev || '',
                _oppFull: g.opponentAbbrev || '', _season: seasonId,
              });
            });
          } catch(e) { continue; }
        }
      }

      return res.json({ games: allGames });
    }

    res.status(400).json({ error: 'Unknown action' });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
