export const config = { maxDuration: 30 };
const KEY   = process.env.GRID_API_KEY;
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const delay = ms => new Promise(r => setTimeout(r, ms));

async function qStats(query) {
  await delay(1500);
  const r = await fetch(STATS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query }),
  });
  return r.json();
}
async function qCD(query) {
  await delay(500);
  const r = await fetch(CD, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ query }),
  });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. Get tournament ID for IEM Rio 2026 so we can query stats
  try {
    const d = await qCD(`{
      tournaments(filter: { name: { contains: "IEM Rio 2026" }, title: { id: { in: ["28"] } } }, first: 5) {
        edges { node { id name startDate endDate } }
      }
    }`);
    results.iemRioTournaments = d;
  } catch(e) { results.iemRioTournaments = { error: e.message }; }

  // 2. Check playerStatistics query arguments
  try {
    const d = await qStats(`{
      __type(name: "Query") {
        fields(includeDeprecated: true) {
          name
          args { name type { name kind ofType { name } } }
        }
      }
    }`);
    const psField = d?.data?.__type?.fields?.find(f => f.name === 'playerStatistics');
    results.playerStatisticsArgs = psField?.args;
  } catch(e) { results.playerStatisticsArgs = { error: e.message }; }

  // 3. Check PlayerStatisticsFilter — can we filter by seriesIds?
  try {
    const d = await qStats(`{ __type(name: "PlayerStatisticsFilter") { inputFields { name type { name kind ofType { name } } } } }`);
    results.playerStatisticsFilter = d?.data?.__type?.inputFields?.map(f => f.name);
  } catch(e) { results.playerStatisticsFilter = { error: e.message }; }

  // 4. Check Cs2PlayerSeriesStatistics headshots structure
  try {
    const d = await qStats(`{
      __type(name: "Cs2PlayerSeriesStatistics") { 
        fields { name type { name kind ofType { name } } } 
      }
    }`);
    results.cs2PlayerSeriesStatsDetailed = d?.data?.__type?.fields;
  } catch(e) { results.cs2PlayerSeriesStatsDetailed = { error: e.message }; }

  return res.json({ results });
}
