export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const CD_URL    = 'https://api-op.grid.gg/central-data/graphql';
const STATS_URL = 'https://api-op.grid.gg/statistics-feed/graphql';

async function query(url, q) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query: q }),
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. Player search on OPEN ACCESS URL
  try {
    const d = await query(CD_URL, `{
      players(filter: { nickname: { contains: "NiKo" } }, first: 3) {
        edges { node { id nickname team { name } title { name } } }
      }
    }`);
    results.playerSearch = d;
  } catch(e) { results.playerSearch = { error: e.message }; }

  // 2. Get all CS2 series (open access URL)
  try {
    const d = await query(CD_URL, `{
      allSeries(first: 2, orderBy: StartTimeScheduled, orderDirection: DESC,
        filter: { types: [ESPORTS] }
      ) {
        edges { node { id startTimeScheduled title { name } 
          teams { baseInfo { name } }
          players { id nickname }
        }}
      }
    }`);
    results.recentSeries = d;
  } catch(e) { results.recentSeries = { error: e.message }; }

  // 3. Test Stats Feed - introspect what's available
  try {
    const d = await query(STATS_URL, `{
      __type(name: "Query") { fields { name } }
    }`);
    results.statsFeedQueries = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.statsFeedQueries = { error: e.message }; }

  // 4. Try playerStatistics on stats feed
  try {
    const d = await query(STATS_URL, `{
      __type(name: "PlayerStatistics") { fields { name } }
    }`);
    results.playerStatsFields = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.playerStatsFields = { error: e.message }; }

  return res.json({ results });
}
