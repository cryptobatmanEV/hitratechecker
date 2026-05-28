export const config = { maxDuration: 30 };

const OPENDOTA = 'https://api.opendota.com/api';

async function odFetch(path) {
  const r = await fetch(`${OPENDOTA}${path}`);
  if (!r.ok) throw new Error(`OpenDota ${r.status}: ${path}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const { action, q, id, scope } = req.query;

  try {
    // ── Search ────────────────────────────────────────────────────────────────
    if (action === 'search') {
      if (!q) return res.json([]);
      const players = await odFetch('/proPlayers');
      const ql = q.toLowerCase();
      const results = (Array.isArray(players) ? players : [])
        .filter(p =>
          ((p.name || '').toLowerCase().includes(ql) ||
           (p.personaname || '').toLowerCase().includes(ql)) &&
          p.account_id
        )
        .slice(0, 8)
        .map(p => ({
          id:     String(p.account_id),
          name:   p.name || p.personaname || 'Unknown',
          sub:    `${p.team_name || 'Free Agent'} · Dota 2`,
          teamId: p.team_id ? String(p.team_id) : null,
        }));
      return res.json(results);
    }

    // ── Gamelog ───────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      if (!id) return res.json([]);

      const isCareer = scope === 'career';
      const limit    = isCareer ? 160 : 40;
      const offset   = isCareer ? 40  : 0;
      const teamId   = req.query.teamId || null;

      // Fetch player matches + team match history in parallel
      const [matches, teamMatches] = await Promise.all([
        odFetch(`/players/${id}/matches?limit=${limit}&offset=${offset}&significant=1`),
        teamId ? odFetch(`/teams/${teamId}/matches`) : Promise.resolve([]),
      ]);

      // Build match_id → opponent name from team's match history
      const oppMap = {};
      if (Array.isArray(teamMatches)) {
        teamMatches.forEach(m => {
          oppMap[m.match_id] = m.opposing_team_name || '';
        });
      }

      if (!Array.isArray(matches)) return res.json([]);

      const log = matches
        .filter(m =>
          typeof m.kills === 'number' &&
          (m.duration || 0) > 300  // exclude forfeits / walkovers
        )
        .map(m => ({
          kills:   m.kills,
          deaths:  m.deaths   ?? 0,
          assists: m.assists  ?? 0,
          gpm:     m.gold_per_min ?? 0,
          xpm:     m.xp_per_min  ?? 0,
          _date:   new Date((m.start_time || 0) * 1000).toISOString().split('T')[0],
          _opp:    oppMap[m.match_id] || '',
          win:     m.radiant_win === (m.player_slot < 128),
        }));

      return res.json(log);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
