export const config = { maxDuration: 30 };

const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const KEY   = process.env.GRID_API_KEY;

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvGet(key) {
  if (!KV_URL) return null;
  try {
    const r = await fetch(KV_URL, { method:'POST', headers:{'Authorization':'Bearer '+KV_TOKEN,'Content-Type':'application/json'}, body:JSON.stringify(['GET', key]) });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  } catch { return null; }
}
async function kvSet(key, value) {
  if (!KV_URL) return;
  try {
    await fetch(KV_URL, { method:'POST', headers:{'Authorization':'Bearer '+KV_TOKEN,'Content-Type':'application/json'}, body:JSON.stringify(['SETEX', key, 86400, JSON.stringify(value)]) });
  } catch {}
}

async function cdQuery(query) {
  const r = await fetch(CD, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

async function statsQuery(query) {
  const r = await fetch(STATS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

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

    const groups = {};
    for (const p of all) {
      const k = p.nickname.toLowerCase();
      if (!groups[k]) groups[k] = [];
      groups[k].push(p);
    }

    const results = [];
    for (const profiles of Object.values(groups)) {
      const csgo = profiles.find(p => p.title?.id === '1');
      const cs2  = profiles.find(p => p.title?.id === '28');
      const any  = profiles[0];
      const statsId  = csgo?.id || cs2?.id || any.id;
      const teamId   = cs2?.team?.id  || csgo?.team?.id  || any.team?.id;
      const teamName = cs2?.team?.name || csgo?.team?.name || any.team?.name || 'N/A';
      if (statsId) results.push({
        id: `grid_${statsId}_${teamId || '0'}`,
        name: any.nickname,
        sub: `CS2 · ${teamName}`,
      });
    }
    if (results.length) return results;
  }
  return [];
}

async function getOverallStats(playerId) {
  const d = await statsQuery(`{
    playerStatistics(playerId: "${playerId}", filter: { timeWindow: LAST_YEAR }) {
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

async function getSeriesMeta(ids) {
  if (!ids.length) return [];
  const fields = ids.slice(0, 25).map((id, i) =>
    `s${i}: series(id: "${id}") { id startTimeScheduled tournament { id } teams { baseInfo { id name } } }`
  ).join('\n');
  const d = await cdQuery(`{ ${fields} }`);
  return Object.values(d?.data || {}).filter(Boolean);
}

async function getTournamentStats(playerId, tournamentId) {
  try {
    const d = await statsQuery(`{
      playerStatistics(playerId: "${playerId}", filter: { tournamentIds: { in: ["${tournamentId}"] } }) {
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
  } catch { return null; }
}

async function buildGameLog(statsId, teamId) {
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = 'grid_' + statsId + '_' + today;
  const cached = await kvGet(cacheKey);
  if (cached) return cached;

  // Step 1: overall stats + confirmed series IDs
  const overall = await getOverallStats(statsId);
  if (!overall?.aggregationSeriesIds?.length) return [];

  const ids        = overall.aggregationSeriesIds;
  const totalCount = overall.series?.count || 1;
  const avgKills   = Math.round((overall.series?.kills?.sum  || 0) / totalCount);
  const avgDeaths  = Math.round((overall.series?.deaths?.sum || 0) / totalCount);
  const avgHS      = Math.round((overall.series?.headshots?.sum || 0) / totalCount);

  // Step 2: series metadata
  const meta = await getSeriesMeta(ids);

  // Step 3: per-tournament stats IN PARALLEL (no sequential delays)
  const tournamentIds = [...new Set(meta.map(s => s.tournament?.id).filter(Boolean))].slice(0, 8);
  const tResults = await Promise.allSettled(
    tournamentIds.map(tid => getTournamentStats(statsId, tid))
  );
  const tStats = {};
  tournamentIds.forEach((tid, i) => {
    const r = tResults[i];
    if (r.status === 'fulfilled' && (r.value?.series?.count || 0) > 0) {
      tStats[tid] = r.value;
    }
  });

  // Step 4: build game log
  const games = meta.map(series => {
    const opp = series.teams?.find(t => t.baseInfo?.id !== teamId)?.baseInfo?.name || '?';
    const ts  = tStats[series.tournament?.id];
    let kills = avgKills, deaths = avgDeaths, headshots = avgHS, win = null;

    if (ts) {
      const tc = ts.series?.count || 1;
      kills     = Math.round((ts.series?.kills?.sum  || 0) / tc);
      deaths    = Math.round((ts.series?.deaths?.sum || 0) / tc);
      headshots = Math.round((ts.series?.headshots?.sum || 0) / tc);
      if (tc === 1) win = (ts.series?.won?.find(w => w.value === true)?.count || 0) > 0;
    }

    return {
      kills, deaths, assists: 0, headshots, win,
      maps: [],
      _date: series.startTimeScheduled?.split('T')[0] || '',
      _opp: opp,
      _matchUrl: null,
    };
  });

  const sorted = games.sort((a, b) => new Date(b._date) - new Date(a._date));
  kvSet(cacheKey, sorted);
  return sorted;
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
      const parts  = (playerId || '').split('_');
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
