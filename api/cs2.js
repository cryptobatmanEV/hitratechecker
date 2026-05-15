eexport const config = { maxDuration: 30 };

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

// Search — no title filter so we get ALL profiles (CS:GO + CS2)
// Stats live on CS:GO profile (title 1), current team on CS2 profile (title 28)
async function searchPlayers(nickname) {
  const safe = nickname.replace(/"/g, '');
  for (const filter of [`equals: "${safe}"`, `contains: "${safe}"`]) {
    const d = await cdQuery(`{
      players(filter: { nickname: { ${filter} } }, first: 10) {
        edges { node { id nickname title { id } team { id name } } }
      }
    }`);
    const all = d?.data?.players?.edges?.map(e => e.node) || [];
    if (!all.length) continue;

    // Group by lowercase nickname
    const groups = {};
    for (const p of all) {
      const k = p.nickname.toLowerCase();
      if (!groups[k]) groups[k] = [];
      groups[k].push(p);
    }

    const results = [];
    for (const profiles of Object.values(groups)) {
      const csgo = profiles.find(p => p.title?.id === '1'); // stats live here
      const cs2  = profiles.find(p => p.title?.id === '28'); // current team here
      const any  = profiles[0];

      const statsId  = csgo?.id || cs2?.id || any.id;
      const teamId   = cs2?.team?.id  || csgo?.team?.id  || any.team?.id;
      const teamName = cs2?.team?.name || csgo?.team?.name || any.team?.name || 'N/A';

      if (statsId) results.push({
        id:   `grid_${statsId}_${teamId || '0'}`,
        name: any.nickname,
        sub:  `CS2 · ${teamName}`,
      });
    }
    if (results.length) return results;
  }
  return [];
}

async function getPlayerStats(playerId, timeWindow) {
  const d = await statsQuery(`{
    playerStatistics(playerId: "${playerId}", filter: { timeWindow: ${timeWindow} }) {
      aggregationSeriesIds
      series {
        count
        kills  { sum avg min max }
        deaths { sum avg }
        won    { value count }
        ... on CsgoPlayerSeriesStatistics { headshots { sum avg min max } }
      }
    }
  }`);
  return d?.data?.playerStatistics || null;
}

async function getSeriesMeta(ids) {
  if (!ids.length) return [];
  const fields = ids.slice(0, 30).map((id, i) =>
    `s${i}: series(id: "${id}") { id startTimeScheduled tournament { id } teams { baseInfo { id name } } }`
  ).join('\n');
  const d = await cdQuery(`{ ${fields} }`);
  return Object.values(d?.data || {}).filter(Boolean);
}

async function getTournamentStats(playerId, tournamentId) {
  const d = await statsQuery(`{
    playerStatistics(playerId: "${playerId}", filter: { tournamentIds: { in: ["${tournamentId}"] } }) {
      aggregationSeriesIds
      series {
        count
        kills  { sum }
        deaths { sum }
        won    { value count }
        ... on CsgoPlayerSeriesStatistics { headshots { sum } }
      }
    }
  }`);
  return d?.data?.playerStatistics || null;
}

async function buildGameLog(statsPlayerId, teamId) {
  // LAST_YEAR gives confirmed series IDs + overall stats
  const overall = await getPlayerStats(statsPlayerId, 'LAST_YEAR');
  if (!overall?.aggregationSeriesIds?.length) return [];

  const ids        = overall.aggregationSeriesIds;
  const totalCount = overall.series?.count || 1;
  const totalKills = overall.series?.kills?.sum  || 0;
  const totalDeaths= overall.series?.deaths?.sum || 0;
  const totalHS    = overall.series?.headshots?.sum || 0;

  // Get metadata for all confirmed series
  const meta = await getSeriesMeta(ids);

  // Per-tournament queries for individual accuracy
  const tournamentIds = [...new Set(meta.map(s => s.tournament?.id).filter(Boolean))];
  const tStats = {};
  for (const tid of tournamentIds.slice(0, 10)) {
    try {
      const ts = await getTournamentStats(statsPlayerId, tid);
      if ((ts?.series?.count || 0) > 0) tStats[tid] = ts;
    } catch {}
  }

  const games = meta.map(series => {
    const opp = series.teams?.find(t => t.baseInfo?.id !== teamId)?.baseInfo?.name || '?';
    const tid  = series.tournament?.id;
    const ts   = tStats[tid];
    let kills, deaths, headshots, win = null;

    if (ts) {
      const tc  = ts.series?.count || 1;
      kills     = Math.round((ts.series?.kills?.sum  || 0) / tc);
      deaths    = Math.round((ts.series?.deaths?.sum || 0) / tc);
      headshots = Math.round((ts.series?.headshots?.sum || 0) / tc);
      if (tc === 1) win = (ts.series?.won?.find(w => w.value === true)?.count || 0) > 0;
    } else {
      kills     = Math.round(totalKills  / totalCount);
      deaths    = Math.round(totalDeaths / totalCount);
      headshots = Math.round(totalHS     / totalCount);
    }

    return { kills, deaths, assists: 0, headshots, win,
      maps: [], _date: series.startTimeScheduled?.split('T')[0] || '',
      _opp: opp, _matchUrl: null };
  });

  return games.sort((a, b) => new Date(b._date) - new Date(a._date));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, playerId } = req.query;
  const nickname = req.query.nickname || req.query.q || '';

  try {
    if (action === 'search') {
      const players = await searchPlayers(nickname);
      return res.json({ players });
    }

    if (action === 'gamelog') {
      const parts   = (playerId || '').split('_');
      const statsId = parts[1];
      const teamId  = parts[2];
      if (!statsId) return res.status(400).json({ error: 'Invalid player ID' });
      const games = await buildGameLog(statsId, teamId);
      return res.json({ games });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
