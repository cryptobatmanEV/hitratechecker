export const config = { maxDuration: 30 };
const KEY   = process.env.GRID_API_KEY;
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

  // 1. Get NiKo's recent series using livePlayerIds filter
  try {
    const d = await q(CD, `{
      allSeries(
        first: 5
        orderBy: StartTimeScheduled
        orderDirection: DESC
        filter: { 
          livePlayerIds: { in: ["112182"] }
          titleIds: { in: ["28"] }
        }
      ) {
        edges { node { 
          id startTimeScheduled 
          tournament { id name }
          teams { baseInfo { name } }
        }}
      }
    }`);
    results.nikoRecentSeries = d;
  } catch(e) { results.nikoRecentSeries = { error: e.message }; }

  // 2. Try playerStatistics with tournamentIds (IEM Atlanta)
  try {
    const d = await q(STATS, `{
      playerStatistics(playerId: "112182", filter: { tournamentIds: { in: ["828285", "828286"] } }) {
        id
        aggregationSeriesIds
        series { count kills { avg sum min max } deaths { avg } }
        game { count kills { avg sum min max } deaths { avg } }
      }
    }`);
    results.nikoTournamentStats = d;
  } catch(e) { results.nikoTournamentStats = { error: e.message }; }

  // 3. Introspect SeriesStatistics.games type to see if it's individual entries
  try {
    const d = await q(STATS, `{
      __type(name: "SeriesStatistics") { fields { name type { name kind ofType { name kind } } } }
    }`);
    results.seriesStatsType = d?.data?.__type?.fields;
  } catch(e) { results.seriesStatsType = { error: e.message }; }

  // 4. Introspect GameStatisticsResult type
  try {
    const d = await q(STATS, `{
      __type(name: "GameStatisticsResult") { fields { name type { name kind ofType { name } } } }
    }`);
    results.gameStatResultType = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.gameStatResultType = { error: e.message }; }

  // 5. Get more recent CS2 tournaments (bigger ones)
  try {
    const d = await q(CD, `{
      tournaments(
        filter: { 
          title: { id: { in: ["28"] } }
          startDate: { gte: "2025-10-01" }
        }
        first: 10
      ) {
        edges { node { id name startDate endDate } }
      }
    }`);
    results.bigCS2Tournaments = d;
  } catch(e) { results.bigCS2Tournaments = { error: e.message }; }

  return res.json({ results });
}
