export const config = { maxDuration: 30 };

const STATS_BASE = 'https://api.nhle.com/stats/rest/en';
const WEB_BASE   = 'https://api-web.nhle.com/v1';
const SEASON     = 20252026;
const HEADERS    = { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' };

// Returns Map<gameId, blockedShots> for a player/season/gameType
async function fetchBlockedShots(playerId, season, gameType) {
  try {
    const cayenne = encodeURIComponent(`playerId=${playerId} and seasonId=${season} and gameTypeId=${gameType}`);
    const r = await fetch(`${STATS_BASE}/skater/realtime?isAggregate=false&isGame=true&limit=100&sort=gameDate&cayenneExp=${cayenne}`, { headers: HEADERS });
    if (!r.ok) return new Map();
    const d = await r.json();
    return new Map((d.data || []).map(g => [g.gameId, g.blockedShots || 0]));
  } catch { return new Map(); }
}

function mapGame(g, blkMap = new Map()) {
  return {
    stat: {
      goals:        g.goals        || 0,
      assists:      g.assists      || 0,
      points:       (g.goals || 0) + (g.assists || 0),
      shots:        g.shots        || 0,
      blockedShots: blkMap.get(g.gameId) || 0,
      saves:        (g.shotsAgainst || 0) - (g.goalsAgainst || 0),
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
      const lastName = (q || '').split(' ').pop().replace(/'/g, '');
      const cayenne  = encodeURIComponent(`seasonId=${SEASON} and lastName likeIgnoreCase '%${lastName}%'`);
      const [skaterRes, goalieRes] = await Promise.all([
        fetch(`${STATS_BASE}/skater/summary?limit=5&sort=points&cayenneExp=${cayenne}`, { headers: HEADERS }),
        fetch(`${STATS_BASE}/goalie/summary?limit=5&sort=wins&cayenneExp=${cayenne}`, { headers: HEADERS }),
      ]);
      const [skaterData, goalieData] = await Promise.all([skaterRes.json(), goalieRes.json()]);
      return res.json({
        players: [
          ...(skaterData.data || []).map(p => ({ id: p.playerId, name: p.skaterFullName, sub: `${p.positionCode} · ${p.teamAbbrevs || 'N/A'}` })),
          ...(goalieData.data || []).map(p => ({ id: p.playerId, name: p.goalieFullName, sub: `G · ${p.teamAbbrevs || 'N/A'}` })),
        ]
      });
    }

    // ── Current season game log ───────────────────────────────────────────
    if (action === 'gamelog') {
      const [regData, playoffData, regBLK, playoffBLK] = await Promise.all([
        fetch(`${WEB_BASE}/player/${playerId}/game-log/${SEASON}/2`, { headers: HEADERS }).then(r => r.json()),
        fetch(`${WEB_BASE}/player/${playerId}/game-log/${SEASON}/3`, { headers: HEADERS }).then(r => r.json()),
        fetchBlockedShots(playerId, SEASON, 2),
        fetchBlockedShots(playerId, SEASON, 3),
      ]);
      const playoffs = (playoffData.gameLog || []).map(g => mapGame(g, playoffBLK));
      const regular  = (regData.gameLog    || []).map(g => mapGame(g, regBLK));
      return res.json({ games: [...playoffs, ...regular] });
    }

    // ── Career: all NHL regular season games ────────────────────────────────
    if (action === 'career') {
      const landing    = await fetch(`${WEB_BASE}/player/${playerId}/landing`, { headers: HEADERS }).then(r => r.json());
      const nhlSeasons = (landing.seasonTotals || [])
        .filter(s => s.leagueAbbrev === 'NHL' && s.gameTypeId === 2)
        .map(s => s.season)
        .filter(s => s < SEASON);

      const results = await Promise.all(nhlSeasons.map(async s => {
        const [webData, blkMap] = await Promise.all([
          fetch(`${WEB_BASE}/player/${playerId}/game-log/${s}/2`, { headers: HEADERS }).then(r => r.json()),
          fetchBlockedShots(playerId, s, 2),
        ]);
        return (webData.gameLog || []).map(g => mapGame(g, blkMap));
      }));

      return res.json({ games: results.flat() });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
