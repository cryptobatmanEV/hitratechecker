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

  // 1. What fields does PlayerSeriesStatistics have?
  try {
    const d = await q(STATS, `{ __type(name: "PlayerSeriesStatistics") { fields { name } } }`);
    results.playerSeriesStatsFields = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.playerSeriesStatsFields = { error: e.message }; }

  // 2. What fields does PlayerGameStatistics have?
  try {
    const d = await q(STATS, `{ __type(name: "PlayerGameStatistics") { fields { name } } }`);
    results.playerGameStatsFields = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.playerGameStatsFields = { error: e.message }; }

  // 3. What does GameStatisticsResult look like (the individual game entries)?
  try {
    const d = await q(STATS, `{ __type(name: "GameStatisticsResult") { fields { name } } }`);
    results.gameStatisticsResult = d?.data?.__type?.fields?.map(f => f.name);
  } catch(e) { results.gameStatisticsResult = { error: e.message }; }

  // 4. Try NiKo CS2 stats with correct fields
  try {
    const d = await q(STATS, `{
      playerStatistics(playerId: "112182", filter: { timeWindow: LAST_3_MONTHS }) {
        id
        aggregationSeriesIds
        series { count kills { avg sum min max } deaths { avg sum } }
        game { count kills { avg sum min max } deaths { avg } }
      }
    }`);
    results.nikoCS2Stats = d;
  } catch(e) { results.nikoCS2Stats = { error: e.message }; }

  // 5. Get recent CS2 tournaments so we can use tournamentIds filter
  try {
    const d = await q(CD, `{
      tournaments(
        filter: { title: { id: { in: ["28"] } }, startDate: { gte: "2025-01-01" } }
        first: 5
      ) {
        edges { node { id name startDate endDate } }
      }
    }`);
    results.recentCS2Tournaments = d;
  } catch(e) { results.recentCS2Tournaments = { error: e.message }; }

  return res.json({ results });
}
