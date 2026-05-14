export const config = { maxDuration: 30 };

const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;
const delay = ms => new Promise(r => setTimeout(r, ms));

async function cdQuery(query) {
  const r = await fetch(CD, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

async function statsQuery(query) {
  await delay(1500);
  const r = await fetch(STATS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

// Find player's CS:GO profile (title 1) — this is what stats system uses
async function findPlayer(nickname) {
  const d = await cdQuery(`{
    players(filter: { nickname: { equals: "${nickname.replace(/"/g,'')}" } }, first: 5) {
      edges { node { id nickname title { id name } team { id name } } }
    }
  }`);
  const players = d?.data?.players?.edges?.map(e => e.node) || [];
  // Prefer CS:GO profile (title 1), fall back to CS2 (28), then anything
  return players.find(p => p.title?.id === '1')
      || players.find(p => p.title?.id === '28')
      || players[0]
      || null;
}

// Get recent CS2 series for a team from Central Data
async function getTeamSeries(teamId, count = 40) {
  const d = await cdQuery(`{
    allSeries(
      first: ${count}
      orderBy: StartTimeScheduled
      orderDirection: DESC
      filter: { teamIds: { in: ["${teamId}"] } titleIds: { in: ["28"] } }
    ) {
      edges { node {
        id startTimeScheduled
        tournament { id name }
        teams { baseInfo { id name } }
      }}
    }
  }`);
  return d?.data?.allSeries?.edges?.map(e => e.node) || [];
}

// Get player stats for specific tournament IDs
async function getPlayerStatsByTournament(playerId, tournamentIds) {
  const d = await statsQuery(`{
    playerStatistics(playerId: "${playerId}", filter: { tournamentIds: { in: [${tournamentIds.map(id => `"${id}"`).join(',')}] } }) {
      aggregationSeriesIds
      series {
        count
        kills { sum avg min max }
        deaths { sum avg }
        won { value count }
        ... on CsgoPlayerSeriesStatistics { headshots { sum avg min max } }
      }
      game { count kills { sum avg min max } deaths { avg } }
    }
  }`);
  return d?.data?.playerStatistics || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, q, playerId } = req.query;

  try {
    // ── Search ──────────────────────────────────────────────────────────────
    if (action === 'search') {
      const player = await findPlayer(q || '');
      if (!player) return res.json({ players: [] });
      return res.json({
        players: [{
          id: `grid_${player.id}_${player.team?.id || 'none'}`,
          name: player.nickname,
          sub: `${player.title?.name?.includes('2') ? 'CS2' : 'CS'} · ${player.team?.name || 'N/A'}`,
        }]
      });
    }

    // ── Game log ─────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const parts = (playerId || '').split('_'); // grid_playerId_teamId
      const gridPlayerId = parts[1];
      const gridTeamId   = parts[2];
      if (!gridPlayerId || !gridTeamId) return res.status(400).json({ error: 'Invalid player ID' });

      // Get recent CS2 series for this team
      const seriesList = await getTeamSeries(gridTeamId, 40);
      if (!seriesList.length) return res.json({ games: [] });

      // Group series by tournament — query each tournament's stats separately
      const tournamentMap = {};
      for (const s of seriesList) {
        const tid = s.tournament?.id;
        if (!tid) continue;
        if (!tournamentMap[tid]) tournamentMap[tid] = [];
        tournamentMap[tid].push(s);
      }

      const tournamentIds = Object.keys(tournamentMap).slice(0, 12);
      const games = [];

      // Query each tournament separately (rate limited with delay)
      for (const tid of tournamentIds) {
        try {
          const stats = await getPlayerStatsByTournament(gridPlayerId, [tid]);
          if (!stats || !stats.aggregationSeriesIds?.length) continue;

          const seriesInTournament = tournamentMap[tid]
            .filter(s => stats.aggregationSeriesIds.includes(s.id))
            .sort((a, b) => new Date(b.startTimeScheduled) - new Date(a.startTimeScheduled));

          if (!seriesInTournament.length) continue;

          const seriesCount = stats.series?.count || 1;
          const killsPerSeries  = Math.round((stats.series?.kills?.sum || 0) / seriesCount);
          const deathsPerSeries = Math.round((stats.series?.deaths?.sum || 0) / seriesCount);
          const hsPerSeries     = Math.round(((stats.series?.headshots?.sum) || 0) / seriesCount);
          const wins = stats.series?.won?.find(w => w.value === true)?.count || 0;
          const losses = stats.series?.won?.find(w => w.value === false)?.count || 0;

          // If 1 series — exact data. If multiple — approximate (average)
          if (seriesCount === 1 && seriesInTournament[0]) {
            const s = seriesInTournament[0];
            const opp = s.teams.find(t => t.baseInfo.id !== gridTeamId)?.baseInfo?.name || '?';
            games.push({
              kills: stats.series?.kills?.sum || 0,
              deaths: stats.series?.deaths?.sum || 0,
              assists: 0,
              headshots: stats.series?.headshots?.sum || 0,
              win: wins > losses ? true : losses > wins ? false : null,
              maps: [],
              _date: s.startTimeScheduled?.split('T')[0] || '',
              _opp: opp,
              _matchUrl: null,
            });
          } else {
            // Multiple series — add each with approximate stats
            for (let i = 0; i < seriesInTournament.length; i++) {
              const s = seriesInTournament[i];
              const opp = s.teams.find(t => t.baseInfo.id !== gridTeamId)?.baseInfo?.name || '?';
              games.push({
                kills: killsPerSeries,
                deaths: deathsPerSeries,
                assists: 0,
                headshots: hsPerSeries,
                win: i < wins ? true : false,
                maps: [],
                _date: s.startTimeScheduled?.split('T')[0] || '',
                _opp: opp,
                _matchUrl: null,
              });
            }
          }
        } catch(e) { /* skip failed tournament */ }
      }

      games.sort((a, b) => new Date(b._date) - new Date(a._date));
      return res.json({ games: games.slice(0, 40) });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
