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
    // ── Search: filter proPlayers by name ────────────────────────────────────
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
          id:   String(p.account_id),
          name: p.name || p.personaname || 'Unknown',
          sub:  `${p.team_name || 'Free Agent'} · Dota 2`,
        }));
      return res.json(results);
    }

    // ── Gamelog: fetch matches + cross-ref proMatches for opponent names ──────
    if (action === 'gamelog') {
      if (!id) return res.json([]);

      const isCareer = scope === 'career';
      const limit    = isCareer ? 160 : 40;
      const offset   = isCareer ? 40  : 0;

      // Fetch player matches + recent pro matches in parallel
      const [matches, proMatchList] = await Promise.all([
        odFetch(`/players/${id}/matches?limit=${limit}&offset=${offset}&significant=1`),
        isCareer ? Promise.resolve([]) : odFetch('/proMatches'),
      ]);

      // Build match_id → {radiant, dire} lookup from proMatches
      const proMap = {};
      if (Array.isArray(proMatchList)) {
        proMatchList.forEach(m => {
          proMap[m.match_id] = {
            radiant: m.radiant_name || m.radiant_tag || '',
            dire:    m.dire_name    || m.dire_tag    || '',
          };
        });
      }

      if (!Array.isArray(matches)) return res.json([]);

      const log = matches
        .filter(m => typeof m.kills === 'number')
        .map(m => {
          const isRadiant = m.player_slot < 128;
          const teams     = proMap[m.match_id];
          const opp       = teams ? (isRadiant ? teams.dire : teams.radiant) : '';
          return {
            kills:    m.kills,
            deaths:   m.deaths   ?? 0,
            assists:  m.assists  ?? 0,
            gpm:      m.gold_per_min ?? 0,
            xpm:      m.xp_per_min  ?? 0,
            _date:    new Date((m.start_time || 0) * 1000).toISOString().split('T')[0],
            _opp:     opp,
            win:      m.radiant_win === isRadiant,
          };
        });

      return res.json(log);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
