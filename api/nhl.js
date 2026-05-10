export const config = { maxDuration: 30 };

const STATS_BASE = 'https://api.nhle.com/stats/rest/en';
const WEB_BASE   = 'https://api-web.nhle.com/v1';
const SEASON     = 20252026;
const HEADERS    = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

function mapGame(g) {
  return {
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
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, q, playerId } = req.query;

  try {
    // ── Search ──────────────────────────────────────────────────────────────
    if (action === 'search') {
      const lastName = (q || '').split(' ').pop();
      const cap = lastName.charAt(0).toUpperCase() + lastName.slice(1);
      const cayenne = encodeURIComponent(`seasonId=${SEASON} and lastName="${cap}"`);

      const [skaterRes, goalieRes] = await Promise.all([
        fetch(`${STATS_BASE}/skater/summary?limit=5&sort=points&cayenneExp=${cayenne}`, { headers: HEADERS }),
        fetch(`${STATS_BASE}/goalie/summary?limit=5&sort=wins&cayenneExp=${cayenne}`, { headers: HEADERS }),
      ]);
      const [skaterData, goalieData] = await Promise.all([skaterRes.json(), goalieRes.json()]);

      const skaters = (skaterData.data || []).map(p => ({
        id: p.playerId, name: p.skaterFullName,
        sub: `${p.positionCode} · ${p.teamAbbrevs || 'N/A'}`,
      }));
      const goalies = (goalieData.data || []).map(p => ({
        id: p.playerId, name: p.goalieFullName,
        sub: `G · ${p.teamAbbrevs || 'N/A'}`,
      }));

      return res.json({ players: [...skaters, ...goalies] });
    }

    // ── Current season game log ───────────────────────────────────────────
    if (action === 'gamelog') {
      // Fetch regular season + playoffs separately — /game-log/now only returns current active type
      const [regRes, playoffRes] = await Promise.all([
        fetch(`${WEB_BASE}/player/${playerId}/game-log/${SEASON}/2`, { headers: HEADERS }),
        fetch(`${WEB_BASE}/player/${playerId}/game-log/${SEASON}/3`, { headers: HEADERS }),
      ]);
      const [regData, playoffData] = await Promise.all([regRes.json(), playoffRes.json()]);
      // Playoffs first (most recent), then regular season
      const playoffs = (playoffData.gameLog || []).map(mapGame);
      const regular  = (regData.gameLog    || []).map(mapGame);
      return res.json({ games: [...playoffs, ...regular] });
    }

    // ── Career: all NHL regular season games ────────────────────────────────
    if (action === 'career') {
      // Get all seasons from landing page first
      const landingRes = await fetch(`${WEB_BASE}/player/${playerId}/landing`, { headers: HEADERS });
      const landing    = await landingRes.json();
      const nhlSeasons = (landing.seasonTotals || [])
        .filter(s => s.leagueAbbrev === 'NHL' && s.gameTypeId === 2)
        .map(s => s.season)
        .filter(s => s < 20252026); // exclude current season (already in gamelog)

      // Fetch all seasons in parallel
      const results = await Promise.all(nhlSeasons.map(async s => {
        try {
          const r = await fetch(`${WEB_BASE}/player/${playerId}/game-log/${s}/2`, { headers: HEADERS });
          if (!r.ok) return [];
          const d = await r.json();
          return (d.gameLog || []).map(mapGame);
        } catch { return []; }
      }));

      return res.json({ games: results.flat() });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
