export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';

async function q(url, query) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. Find CS2 title ID
  try {
    const d = await q(CD, `{ titles { id name nameShortened } }`);
    results.titles = d;
  } catch(e) { results.titles = { error: e.message }; }

  // 2. Find NiKo's CS2 player ID (filter by titleId once we know it)
  // For now search by nickname + check title
  try {
    const d = await q(CD, `{
      players(filter: { nickname: { equals: "NiKo" } }, first: 5) {
        edges { node { id nickname title { id name } team { name } } }
      }
    }`);
    results.nikoAllTitles = d;
  } catch(e) { results.nikoAllTitles = { error: e.message }; }

  // 3. Introspect seriesStatistics type
  try {
    const d = await q(STATS, `{
      __type(name: "SeriesStatistics") { fields { name } }
    }`);
    results.seriesStatsFields = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.seriesStatsFields = { error: e.message }; }

  // 4. Introspect gameStatistics type
  try {
    const d = await q(STATS, `{
      __type(name: "GameStatistics") { fields { name } }
    }`);
    results.gameStatsFields = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.gameStatsFields = { error: e.message }; }

  // 5. Try playerStatistics with NiKo ID 7190
  try {
    const d = await q(STATS, `{
      playerStatistics(playerId: "7190", filter: { timeWindow: LAST_3_MONTHS }) {
        id
        aggregationSeriesIds
        series { count kills { avg sum min max } deaths { avg } headshots { avg } }
        game { count kills { avg sum min max } deaths { avg } headshots { avg } }
      }
    }`);
    results.nikoStats = d;
  } catch(e) { results.nikoStats = { error: e.message }; }

  return res.json({ results });
}
