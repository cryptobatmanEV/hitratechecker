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

  const { action, q, id, scope, teamId } = req.query;

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

      // Fetch player matches + team match history in parallel
      const [playerMatches, teamMatches] = await Promise.all([
        odFetch(`/players/${id}/matches?limit=${limit}&offset=${offset}&significant=1`),
        teamId ? odFetch(`/teams/${teamId}/matches`) : Promise.resolve([]),
      ]);

      // Build match_id → {opp, series_id} from team history
      const matchMeta = {};
      if (Array.isArray(teamMatches)) {
        teamMatches.forEach(m => {
          matchMeta[m.match_id] = {
            opp:      m.opposing_team_name || '',
            seriesId: m.series_id || null,
          };
        });
      }

      if (!Array.isArray(playerMatches)) return res.json([]);

      // Filter to pro matches only
      const proGames = playerMatches.filter(m =>
        typeof m.kills === 'number' &&
        m.lobby_type === 1 &&
        (m.duration || 0) > 300
      );

      // Group by series_id; fallback key = opp+date for unmatched games
      const seriesMap = {};
      proGames.forEach(m => {
        const meta      = matchMeta[m.match_id] || {};
        const seriesKey = meta.seriesId
          ? `s_${meta.seriesId}`
          : `g_${m.match_id}`;            // solo entry if no series info

        if (!seriesMap[seriesKey]) {
          seriesMap[seriesKey] = {
            startTime: m.start_time || 0,
            opp:       meta.opp || '',
            games:     [],
          };
        }
        // Keep earliest start_time for the series header date
        if ((m.start_time || 0) < seriesMap[seriesKey].startTime) {
          seriesMap[seriesKey].startTime = m.start_time || 0;
        }
        seriesMap[seriesKey].games.push({
          kills:   m.kills,
          deaths:  m.deaths   ?? 0,
          assists: m.assists  ?? 0,
          gpm:     m.gold_per_min ?? 0,
          xpm:     m.xp_per_min  ?? 0,
          startTime: m.start_time || 0,
        });
      });

      // Sort games within each series chronologically
      const seriesList = Object.values(seriesMap)
        .map(s => {
          const sorted = s.games.sort((a, b) => a.startTime - b.startTime);
          const count  = sorted.length;
          return {
            _date:   new Date(s.startTime * 1000).toISOString().split('T')[0],
            _opp:    s.opp,
            // Top-level totals/averages for "full series" scope
            kills:   sorted.reduce((n, g) => n + g.kills,   0),
            deaths:  sorted.reduce((n, g) => n + g.deaths,  0),
            assists: sorted.reduce((n, g) => n + g.assists, 0),
            gpm:     count ? Math.round(sorted.reduce((n, g) => n + g.gpm, 0) / count) : 0,
            xpm:     count ? Math.round(sorted.reduce((n, g) => n + g.xpm, 0) / count) : 0,
            // Per-game maps array (same pattern as CS2/LoL)
            maps:    sorted.map(g => ({
              kills:   g.kills,
              deaths:  g.deaths,
              assists: g.assists,
              gpm:     g.gpm,
              xpm:     g.xpm,
            })),
          };
        })
        .sort((a, b) => b._date.localeCompare(a._date));

      return res.json(seriesList);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
