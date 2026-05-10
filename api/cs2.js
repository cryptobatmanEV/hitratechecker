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

  // Pro alias map: DFS name → real FACEIT nickname (for pros who use different usernames)
  const PRO_ALIASES = {
    'dgt': 'cabra', 'fallen': 'FalleN', 'kscerato': 'KSCERATO',
  };
  // Verified pro FACEIT IDs (from Liquipedia faceitdb field)
  const KNOWN_PRO_IDS = new Set([
    '20e9f61c-8072-4f50-b257-b6b4219669d2', // dgt
    '19606e0c-137b-4885-a904-744fa12d25f6', // NiKo
  ]);

  try {
    // ── Search ─────────────────────────────────────────────────────────────
    if (action === 'search') {
      const q = (nickname || '').toLowerCase().trim();
      const faceitNick = PRO_ALIASES[q] || nickname;

      const d = await ff(`/search/players?nickname=${encodeURIComponent(faceitNick)}&game=cs2&offset=0&limit=20`);
      const items = d.items || [];

      const scored = items.map(p => {
        const nick = (p.nickname || '').toLowerCase();
        const elo  = parseInt(p.games?.cs2?.faceit_elo) || 0;
        const lvl  = parseInt(p.games?.cs2?.skill_level) || 0;
        const isKnown    = KNOWN_PRO_IDS.has(p.player_id);
        const exactMatch = nick === q || nick === faceitNick.toLowerCase();
        const hasDigits  = /\d/.test(p.nickname);
        let score = elo;
        if (isKnown)    score += 100000;
        if (exactMatch) score += 10000;
        if (lvl === 10) score += 5000;
        if (!hasDigits) score += 1000;
        return { p, score };
      });

      const players = scored.sort((a,b) => b.score - a.score).slice(0,6).map(({p}) => ({
        id:   p.player_id,
        name: p.nickname,
        sub: [
          p.games?.cs2?.skill_level ? `Level ${p.games.cs2.skill_level}` : null,
          p.games?.cs2?.faceit_elo  ? `ELO ${p.games.cs2.faceit_elo}`    : null,
          p.country ? p.country.toUpperCase() : null,
          KNOWN_PRO_IDS.has(p.player_id) ? '✓ VERIFIED PRO' : null,
        ].filter(Boolean).join(' · ')
      }));

      return res.json({ players });
    }

    // ── Game log ───────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const limit   = scope === 'career' ? 40 : 20;
      const history = await ff(`/players/${playerId}/history?game=cs2&limit=${limit}&offset=0`);

      // ── ONLY professional matches (championship or hub = FPL/pro leagues) ──
      // competition_type === 'matchmaking' = ranked PUGs → excluded
      const proMatches = (history.items || []).filter(m =>
        m.competition_type === 'championship' || m.competition_type === 'hub'
      );

      if (!proMatches.length) {
        return res.json({ games: [], note: 'No professional/tournament matches found in recent history.' });
      }

      const games = [];

      for (const match of proMatches.slice(0, 20)) {
        try {
          const stats = await ff(`/matches/${match.match_id}/stats`);

          // Sum ALL maps in the match into ONE entry
          let kills=0, deaths=0, assists=0, headshots=0, mvps=0, maps=0;
          let result='L', opponent='', found=false;

          for (const round of stats.rounds || []) {
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
              hsPct:       kills > 0 ? Math.round(headshots / kills * 100) : 0,
              kd:          deaths > 0 ? Math.round(kills / deaths * 10) / 10 : kills,
              mvps,
              maps,
              result,
              competition: match.competition_name || '',
              _date:       match.started_at ? new Date(match.started_at * 1000).toISOString().split('T')[0] : '',
              _opp:        opponent,
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
