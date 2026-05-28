export const config = { maxDuration: 30 };

const OPENDOTA = 'https://api.opendota.com/api';

async function odFetch(path) {
  const r = await fetch(`${OPENDOTA}${path}`);
  if (!r.ok) throw new Error(`OpenDota ${r.status}: ${path}`);
  return r.json();
}

function groupIntoSeries(matches, oppMap) {
  // Build flat game list
  const games = matches
    .filter(m =>
      typeof m.kills === 'number' &&
      m.lobby_type === 1 &&
      (m.duration || 0) > 300
    )
    .map(m => ({
      kills:      m.kills,
      deaths:     m.deaths   ?? 0,
      assists:    m.assists  ?? 0,
      gpm:        m.gold_per_min ?? 0,
      xpm:        m.xp_per_min  ?? 0,
      start_time: m.start_time || 0,
      _date:      new Date((m.start_time || 0) * 1000).toISOString().split('T')[0],
      _opp:       oppMap[m.match_id] || '',
      win:        m.radiant_win === (m.player_slot < 128),
    }));

  // Group by date + opponent (same opponent on same day = same series)
  const buckets = new Map();
  for (const g of games) {
    const key = g._opp ? `${g._date}|${g._opp}` : `solo_${g.start_time}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(g);
  }

  // Build series objects with maps array sorted Game 1 first
  const series = [];
  for (const [, bucket] of buckets) {
    bucket.sort((a, b) => a.start_time - b.start_time); // G1 first

    const maps = bucket.map(g => ({
      kills:   g.kills,
      deaths:  g.deaths,
      assists: g.assists,
      gpm:     g.gpm,
      xpm:     g.xpm,
      win:     g.win,
    }));

    const n          = maps.length;
    const sumKills   = maps.reduce((s, m) => s + m.kills,   0);
    const sumDeaths  = maps.reduce((s, m) => s + m.deaths,  0);
    const sumAssists = maps.reduce((s, m) => s + m.assists, 0);
    const avgGpm     = Math.round(maps.reduce((s, m) => s + m.gpm, 0) / n);
    const avgXpm     = Math.round(maps.reduce((s, m) => s + m.xpm, 0) / n);
    const seriesWins = maps.filter(m => m.win).length;

    series.push({
      _date:   bucket[0]._date,
      _opp:    bucket[0]._opp,
      maps,
      kills:   sumKills,
      deaths:  sumDeaths,
      assists: sumAssists,
      gpm:     avgGpm,
      xpm:     avgXpm,
      win:     seriesWins > n / 2,
    });
  }

  // Most recent series first
  series.sort((a, b) => b._date.localeCompare(a._date));
  return series;
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

      const [matches, teamMatches] = await Promise.all([
        odFetch(`/players/${id}/matches?limit=${limit}&offset=${offset}&significant=1`),
        teamId ? odFetch(`/teams/${teamId}/matches`) : Promise.resolve([]),
      ]);

      // Build match_id → opponent name
      const oppMap = {};
      if (Array.isArray(teamMatches)) {
        teamMatches.forEach(m => {
          oppMap[m.match_id] = m.opposing_team_name || '';
        });
      }

      if (!Array.isArray(matches)) return res.json([]);

      return res.json(groupIntoSeries(matches, oppMap));
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
