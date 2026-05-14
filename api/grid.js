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

// Find player — return both CS:GO profile ID (for stats) and CS2 team ID (for series)
async function findPlayer(nickname) {
  const d = await cdQuery(`{
    players(filter: { nickname: { equals: "${nickname.replace(/"/g,'')}" } }, first: 5) {
      edges { node { id nickname title { id name } team { id name } } }
    }
  }`);
  const players = d?.data?.players?.edges?.map(e => e.node) || [];
  const csgo = players.find(p => p.title?.id === '1');
  const cs2  = players.find(p => p.title?.id === '28');
  // Stats use CS:GO profile, series use CS2 team (current team)
  const statsId = csgo?.id || cs2?.id || null;
  const teamId  = cs2?.team?.id || csgo?.team?.id || null;
  const teamName = cs2?.team?.name || csgo?.team?.name || null;
  const name    = csgo?.nickname || cs2?.nickname || null;
  return { statsId, teamId, teamName, name };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, playerId } = req.query; const q = req.query.q || req.query.nickname || '';

  try {
    // ── Search ──────────────────────────────────────────────────────────────
    if (action === 'search') {
      const player = await findPlayer(q || '');
      if (!player?.statsId) return res.json({ players: [] });
      return res.json({
        players: [{
          id: `grid_${player.statsId}_${player.teamId}`,
          name: player.name,
          sub: `CS2 · ${player.teamName || 'N/A'}`,
        }]
      });
    }

    // ── Game log ─────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const parts = (playerId || '').split('_'); // grid_statsPlayerId_teamId
      const statsPlayerId = parts[1];
      const teamId        = parts[2];
      if (!statsPlayerId || !teamId) return res.status(400).json({ error: 'Invalid player ID' });

      // Step 1: Get confirmed series IDs with real stats (LAST_6_MONTHS)
      const statsD = await statsQuery(`{
        playerStatistics(playerId: "${statsPlayerId}", filter: { timeWindow: LAST_6_MONTHS }) {
          aggregationSeriesIds
          series {
            count kills { sum } deaths { sum }
            won { value count }
            ... on CsgoPlayerSeriesStatistics { headshots { sum } }
          }
        }
      }`);

      const confirmedSeriesIds = statsD?.data?.playerStatistics?.aggregationSeriesIds || [];
      if (!confirmedSeriesIds.length) return res.json({ games: [] });

      const seriesStats = statsD?.data?.playerStatistics?.series;
      const totalCount  = seriesStats?.count || 1;
      const totalKills  = seriesStats?.kills?.sum || 0;
      const totalDeaths = seriesStats?.deaths?.sum || 0;
      const totalHS     = seriesStats?.headshots?.sum || 0;
      const wins        = seriesStats?.won?.find(w => w.value === true)?.count  || 0;
      const losses      = seriesStats?.won?.find(w => w.value === false)?.count || 0;

      // Step 2: Get metadata for all confirmed series
      const seriesQuery = confirmedSeriesIds.slice(0, 20).map((id, i) =>
        `s${i}: series(id: "${id}") { id startTimeScheduled tournament { id name } teams { baseInfo { id name } } }`
      ).join('\n');

      const metaD = await cdQuery(`{ ${seriesQuery} }`);
      const seriesMeta = Object.values(metaD?.data || {}).filter(Boolean);

      // Step 3: Get per-tournament stats for more granular data
      const tournamentIds = [...new Set(seriesMeta.map(s => s.tournament?.id).filter(Boolean))];

      const tournamentStats = {};
      for (const tid of tournamentIds.slice(0, 8)) {
        try {
          const d = await statsQuery(`{
            playerStatistics(playerId: "${statsPlayerId}", filter: { tournamentIds: { in: ["${tid}"] } }) {
              aggregationSeriesIds
              series {
                count kills { sum min max } deaths { sum }
                won { value count }
                ... on CsgoPlayerSeriesStatistics { headshots { sum } }
              }
            }
          }`);
          if (d?.data?.playerStatistics?.series?.count > 0) {
            tournamentStats[tid] = d.data.playerStatistics;
          }
        } catch {}
      }

      // Step 4: Build game log
      const games = [];
      for (const s of seriesMeta) {
        const opp = s.teams?.find(t => t.baseInfo?.id !== teamId)?.baseInfo?.name || '?';
        const tid = s.tournament?.id;
        const tStats = tournamentStats[tid];

        let kills = 0, deaths = 0, headshots = 0, win = null;

        if (tStats) {
          const tc = tStats.series?.count || 1;
          kills     = Math.round((tStats.series?.kills?.sum || 0) / tc);
          deaths    = Math.round((tStats.series?.deaths?.sum || 0) / tc);
          headshots = Math.round((tStats.series?.headshots?.sum || 0) / tc);
          const tw = tStats.series?.won?.find(w => w.value === true)?.count  || 0;
          const tl = tStats.series?.won?.find(w => w.value === false)?.count || 0;
          // If 1 series in this tournament, use exact win/loss
          if (tc === 1) win = tw > 0 ? true : false;
        } else {
          // Fallback to overall average
          kills     = Math.round(totalKills  / totalCount);
          deaths    = Math.round(totalDeaths / totalCount);
          headshots = Math.round(totalHS     / totalCount);
        }

        games.push({
          kills, deaths, assists: 0, headshots, win,
          maps: [],
          _date: s.startTimeScheduled?.split('T')[0] || '',
          _opp: opp,
          _matchUrl: null,
        });
      }

      games.sort((a, b) => new Date(b._date) - new Date(a._date));
      return res.json({ games });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
