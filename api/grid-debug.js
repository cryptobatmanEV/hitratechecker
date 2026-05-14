export const config = { maxDuration: 30 };
const KEY   = process.env.GRID_API_KEY;
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const delay = ms => new Promise(r => setTimeout(r, ms));
async function qStats(q) { await delay(2000); const r = await fetch(STATS, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query:q}) }); return r.json(); }
async function qCD(q)    { const r = await fetch(CD, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query:q}) }); return r.json(); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. NiKo (7190) with headshots - LAST_MONTH
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "7190", filter: { timeWindow: LAST_MONTH }) {
        id aggregationSeriesIds
        series {
          count
          kills { avg sum min max }
          deaths { avg sum }
          ... on Cs2PlayerSeriesStatistics { headshots { avg sum min max } }
        }
        game { count kills { avg sum min max } deaths { avg } }
      }
    }`);
    results.nikoWithHeadshots = d;
  } catch(e) { results.nikoWithHeadshots = { error: e.message }; }

  // 2. Get series metadata for all 3 series (date, opponent, tournament)
  try {
    const d = await qCD(`{
      s1: series(id: "2931340") { id startTimeScheduled tournament { name } teams { baseInfo { name } } }
      s2: series(id: "2931338") { id startTimeScheduled tournament { name } teams { baseInfo { name } } }
      s3: series(id: "2931333") { id startTimeScheduled tournament { name } teams { baseInfo { name } } }
    }`);
    results.seriesMetadata = d;
  } catch(e) { results.seriesMetadata = { error: e.message }; }

  // 3. Try playerStatistics per individual tournament to get per-series data
  // IEM Rio Playoffs = 829250, try Group Stage separately = 829241
  try {
    const d = await qStats(`{
      playoffs: playerStatistics(playerId: "7190", filter: { tournamentIds: { in: ["829250"] } }) {
        aggregationSeriesIds
        series { count kills { avg sum } deaths { avg } ... on Cs2PlayerSeriesStatistics { headshots { avg sum } } }
      }
    }`);
    results.nikoPlayoffsSeparate = d;
  } catch(e) { results.nikoPlayoffsSeparate = { error: e.message }; }

  // 4. Check gameStatistics arguments for map-level per-player data
  try {
    const d = await qStats(`{
      __type(name: "GameStatisticsFilter") { inputFields { name type { name kind ofType { name } } } }
    }`);
    results.gameStatsFilter = d?.data?.__type?.inputFields?.map(f => f.name);
  } catch(e) { results.gameStatsFilter = { error: e.message }; }

  return res.json({ results });
}
