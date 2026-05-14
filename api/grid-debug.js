export const config = { maxDuration: 30 };
const KEY   = process.env.GRID_API_KEY;
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const delay = ms => new Promise(r => setTimeout(r, ms));
async function qStats(q) { await delay(2000); const r = await fetch(STATS, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query:q}) }); return r.json(); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. Check __typename of series to see what runtime type is returned
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "7190", filter: { timeWindow: LAST_MONTH }) {
        series { __typename count kills { avg } }
      }
    }`);
    results.seriesTypename = d;
  } catch(e) { results.seriesTypename = { error: e.message }; }

  // 2. What does PlayerSeriesStatistics interface look like?
  try {
    const d = await qStats(`{ __type(name: "PlayerSeriesStatistics") { kind fields { name } possibleTypes { name } } }`);
    results.playerSeriesStatsInterface = d?.data?.__type;
  } catch(e) { results.playerSeriesStatsInterface = { error: e.message }; }

  // 3. Check GameStatisticsTournamentFilter fields
  try {
    const d = await qStats(`{ __type(name: "GameStatisticsTournamentFilter") { inputFields { name type { name kind } } } }`);
    results.gameStatsTournamentFilter = d?.data?.__type?.inputFields?.map(f => f.name);
  } catch(e) { results.gameStatsTournamentFilter = { error: e.message }; }

  // 4. Try gameStatistics for NiKo - per map data
  try {
    const d = await qStats(`{
      __type(name: "Query") {
        fields { name args { name type { name kind ofType { name } } } }
      }
    }`);
    const gsField = d?.data?.__type?.fields?.find(f => f.name === 'gameStatistics');
    results.gameStatisticsArgs = gsField?.args;
  } catch(e) { results.gameStatisticsArgs = { error: e.message }; }

  // 5. Try querying headshots directly without inline fragment
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "7190", filter: { timeWindow: LAST_MONTH }) {
        series { 
          count kills { avg sum min max } deaths { avg }
          headshots { avg sum min max }
        }
      }
    }`);
    results.nikoHeadshotsDirectQuery = d;
  } catch(e) { results.nikoHeadshotsDirectQuery = { error: e.message }; }

  return res.json({ results });
}
