export const config = { maxDuration: 30 };

const OPENDOTA = 'https://api.opendota.com/api';

async function odFetch(path) {
  const r = await fetch(`${OPENDOTA}${path}`);
  if (!r.ok) throw new Error(`OpenDota ${r.status}: ${path}`);
  return r.json();
}

function parseMatches(matches) {
  if (!Array.isArray(matches)) return [];
  return matches
    .filter(m => typeof m.kills === 'number')
    .map(m => ({
      kills:    m.kills,
      deaths:   m.deaths   ?? 0,
      assists:  m.assists  ?? 0,
      gpm:      m.gold_per_min ?? 0,
      xpm:      m.xp_per_min  ?? 0,
      _date:    new Date((m.start_time || 0) * 1000).toISOString().split('T')[0],
      _opp:     '',
      win:      m.radiant_win === (m.player_slot < 128),
    }));
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

    // ── Gamelog: recent (season) or older (career) ────────────────────────────
    if (action === 'gamelog') {
      if (!id) return res.json([]);
      const isCareer = scope === 'career';
      const limit    = isCareer ? 160 : 40;
      const offset   = isCareer ? 40  : 0;
      const matches  = await odFetch(
        `/players/${id}/matches?limit=${limit}&offset=${offset}&significant=1`
      );
      return res.json(parseMatches(matches));
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
