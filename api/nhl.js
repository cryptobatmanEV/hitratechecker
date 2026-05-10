export const config = { maxDuration: 30 };

const STATS_BASE = 'https://api.nhle.com/stats/rest/en';
const WEB_BASE   = 'https://api-web.nhle.com/v1';
const SEASON     = 20252026;
const HEADERS    = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, q, playerId } = req.query;

  try {
    // ── Search ──────────────────────────────────────────────────────────────
    if (action === 'search') {
      // Capitalize first letter, preserve rest (handles McDavid if typed correctly)
      const lastName = (q || '').split(' ').pop();
      const cap = lastName.charAt(0).toUpperCase() + lastName.slice(1);
      const cayenne = encodeURIComponent(`seasonId=${SEASON} and lastName="${cap}"`);

      // Search skaters and goalies in parallel
      const [skaterRes, goalieRes] = await Promise.all([
        fetch(`${STATS_BASE}/skater/summary?limit=5&sort=points&cayenneExp=${cayenne}`, { headers: HEADERS }),
        fetch(`${STATS_BASE}/goalie/summary?limit=5&sort=wins&cayenneExp=${cayenne}`, { headers: HEADERS }),
      ]);

      const [skaterData, goalieData] = await Promise.all([skaterRes.json(), goalieRes.json()]);

      const skaters = (skaterData.data || []).map(p => ({
        id:   p.playerId,
        name: p.skaterFullName,
        sub:  `${p.positionCode} · ${p.teamAbbrevs || 'N/A'}`,
      }));

      const goalies = (goalieData.data || []).map(p => ({
        id:   p.playerId,
        name: p.goalieFullName,
        sub:  `G · ${p.teamAbbrevs || 'N/A'}`,
      }));

      return res.json({ players: [...skaters, ...goalies] });
    }

    // ── Game log ─────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const r = await fetch(`${WEB_BASE}/player/${playerId}/game-log/now`, { headers: HEADERS });
      if (!r.ok) throw new Error(`NHL API ${r.status}`);
      const d = await r.json();

      const games = (d.gameLog || []).map(g => ({
        stat: {
          goals:        g.goals        || 0,
          assists:      g.assists      || 0,
          points:       (g.goals || 0) + (g.assists || 0),
          shots:        g.shots        || 0,
          blockedShots: g.blockedShots || 0,
          saves:        g.saves        || 0,
          goalsAgainst: g.goalsAgainst || 0,
          toi:          g.toi          || '0:00',
        },
        _date:   g.gameDate       || '',
        _opp:    g.opponentAbbrev || (g.opponentCommonName?.default || ''),
        _isHome: g.homeRoadFlag   === 'H',
      })).reverse();

      return res.json({ games });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
