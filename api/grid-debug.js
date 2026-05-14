export const config = { maxDuration: 30 };
const KEY   = process.env.GRID_API_KEY;
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const delay = ms => new Promise(r => setTimeout(r, ms));
async function qStats(q) {
  await delay(2000);
  const r = await fetch(STATS, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query:q}) });
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. Check exact type of startedAt in PlayerStatisticsFilter
  try {
    const d = await qStats(`{
      __type(name: "PlayerStatisticsFilter") {
        inputFields { name type { name kind ofType { name kind } } }
      }
    }`);
    results.filterTypes = d?.data?.__type?.inputFields;
  } catch(e) { results.filterTypes = { error: e.message }; }

  // 2. Fix: use series (not segment) for CS2 headshots
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "112182", filter: { tournamentIds: { in: ["829250"] } }) {
        id
        aggregationSeriesIds
        series {
          count
          kills { avg sum min max }
          deaths { avg sum }
          ... on Cs2PlayerSeriesStatistics {
            headshots { avg sum min max }
          }
        }
        game { count kills { avg sum min max } deaths { avg } }
      }
    }`);
    results.nikoSeriesWithHeadshots = d;
  } catch(e) { results.nikoSeriesWithHeadshots = { error: e.message }; }

  // 3. Try full IEM Rio with correct fragment placement
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "112182", filter: { tournamentIds: { in: ["829191","829241","829250"] } }) {
        id
        aggregationSeriesIds
        series {
          count
          kills { avg sum min max }
          deaths { avg }
          ... on Cs2PlayerSeriesStatistics {
            headshots { avg sum }
          }
        }
      }
    }`);
    results.nikoFullIemRio = d;
  } catch(e) { results.nikoFullIemRio = { error: e.message }; }

  return res.json({ results });
}
