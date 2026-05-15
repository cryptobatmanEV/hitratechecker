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

// Search GRID — try exact match then contains fallback
async function searchGrid(nickname) {
  const safe = nickname.replace(/"/g, '');
  for (const filter of [`equals: "${safe}"`, `contains: "${safe}"`]) {
    const d = await cdQuery(`{
      players(filter: { nickname: { ${filter} } }, first: 5) {
        edges { node { id nickname title { id name } team { id name } } }
      }
    }`);
    const players = d?.data?.players?.edges?.map(e => e.node) || [];
    if (players.length) return players;
  }
  return [];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, playerId } = req.query;
  const q = req.query.q || req.query.nickname || '';

  try {
    // ── Search ──────────────────────────────────────────────────────────────
    if (action === 'search') {
      const players = await searchGrid(q);
      if (!players.length) return res.json({ players: [] });

      // Group by nickname — prefer CS:GO profile (title 1) for stats
      const seen = new Set();
      const results = [];
      for (const p of players) {
        const key = p.nickname.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        // Find CS:GO profile for stats, CS2 for current team
        const csgo = players.find(x => x.nickname.toLowerCase() === key && x.title?.id === '1');
        const cs2  = players.find(x => x.nickname.toLowerCase() === key && x.title?.id === '28');
        const statsId = csgo?.id || cs2?.id || p.id;
        const teamId  = cs2?.team?.id || csgo?.team?.id || p.team?.id;
        const teamName = cs2?.team?.name || csgo?.team?.name || p.team?.name || 'N/A';

        results.push({
          id:  `grid_${statsId}_${teamId}`,
          name: p.nickname,
          sub: `CS2 · ${teamName}`,
        });
      }
      return res.json({ players: results });
    }

    // ── Game log ─────────────────────────────────────────────────────────────
    if (action === 'gamelog') {
      const parts = (playerId || '').split('_');
      const statsPlayerId = parts[1];
      const teamId        = parts[2];
      if (!statsPlayerId || !teamId) return res.status(400).json({ error: 'Invalid player ID' });

      // Step 1: Get confirmed series IDs + overall stats (LAST_YEAR for full coverage)
      const statsD = await statsQuery(`{
        playerStatistics(playerId: "${statsPlayerId}", filter: { timeWindow: LAST_YEAR }) {
          aggregationSeriesIds
          series {
            count kills { sum } deaths { sum }
            won { value count }
            ... on CsgoPlayerSeriesStatistics { headshots { sum } }
          }
        }
      }`);

      const confirmedIds = statsD?.data?.playerStatistics?.aggregationSeriesIds || [];
      if (!confirmedIds.length) return res.json({ games: [] });

      const s = statsD?.data?.playerStatistics?.series;
      const totalCount  = s?.count || 1;
      const totalKills  = s?.kills?.sum  || 0;
      const totalDeaths = s?.deaths?.sum || 0;
      const totalHS     = s?.headshots?.sum || 0;
      const overallWins = s?.won?.find(w => w.value === true)?.count  || 0;
      const overallLoss = s?.won?.find(w => w.value === false)?.count || 0;

      // Step 2: Fetch metadata for confirmed series (batched)
      const metaChunks = [];
      for (let i = 0; i < Math.min(confirmedIds.length, 40); i += 10) {
        const chunk = confirmedIds.slice(i, i + 10);
        const fields = chunk.map((id, j) =>
          `s${i+j}: series(id: "${id}") { id startTimeScheduled tournament { id name } teams { baseInfo { id name } } }`
        ).join('\n');
        const d = await cdQuery(`{ ${fields} }`);
        metaChunks.push(...Object.values(d?.data || {}).filter(Boolean));
      }

      // Step 3: Per-tournament stats for granular data
      const tournamentIds = [...new Set(metaChunks.map(s => s.tournament?.id).filter(Boolean))];
      const tStats = {};
      for (const tid of tournamentIds.slice(0, 10)) {
        try {
          const d = await statsQuery(`{
            playerStatistics(playerId: "${statsPlayerId}", filter: { tournamentIds: { in: ["${tid}"] } }) {
              aggregationSeriesIds
              series {
                count kills { sum } deaths { sum }
                won { value count }
                ... on CsgoPlayerSeriesStatistics { headshots { sum } }
              }
            }
          }`);
          if ((d?.data?.playerStatistics?.series?.count || 0) > 0) {
            tStats[tid] = d.data.playerStatistics;
          }
        } catch {}
      }

      // Step 4: Build game log
      const games = [];
      for (const series of metaChunks) {
        const opp = series.teams?.find(t => t.baseInfo?.id !== teamId)?.baseInfo?.name || '?';
        const tid = series.tournament?.id;
        const ts  = tStats[tid];

        let kills, deaths, headshots, win;

        if (ts) {
          const tc = ts.series?.count || 1;
          kills     = Math.round((ts.series?.kills?.sum  || 0) / tc);
          deaths    = Math.round((ts.series?.deaths?.sum || 0) / tc);
          headshots = Math.round((ts.series?.headshots?.sum || 0) / tc);
          const tw  = ts.series?.won?.find(w => w.value === true)?.count  || 0;
          const tl  = ts.series?.won?.find(w => w.value === false)?.count || 0;
          win = tc === 1 ? (tw > 0 ? true : false) : null;
        } else {
          kills     = Math.round(totalKills  / totalCount);
          deaths    = Math.round(totalDeaths / totalCount);
          headshots = Math.round(totalHS     / totalCount);
          win = null;
        }

        games.push({
          kills, deaths, assists: 0, headshots, win,
          maps: [],
          _date: series.startTimeScheduled?.split('T')[0] || '',
          _opp:  opp,
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
