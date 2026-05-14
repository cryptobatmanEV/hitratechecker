export const config = { maxDuration: 30 };
const KEY   = process.env.GRID_API_KEY;
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const delay = ms => new Promise(r => setTimeout(r, ms));
async function qStats(q) { await delay(2000); const r = await fetch(STATS, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query:q}) }); return r.json(); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. THE FIX: CsgoPlayerSeriesStatistics fragment for headshots
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "7190", filter: { timeWindow: LAST_MONTH }) {
        id aggregationSeriesIds
        series {
          count
          kills { avg sum min max }
          deaths { avg sum }
          won { value count percentage }
          ... on CsgoPlayerSeriesStatistics {
            headshots { avg sum min max }
          }
        }
        game { count kills { avg sum min max } deaths { avg } }
      }
    }`);
    results.nikoWithCorrectFragment = d;
  } catch(e) { results.nikoWithCorrectFragment = { error: e.message }; }

  // 2. Per-series data: IEM Rio Group Stage (829241) = 1 series for NiKo
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "7190", filter: { tournamentIds: { in: ["829241"] } }) {
        aggregationSeriesIds
        series {
          count kills { sum avg } deaths { avg }
          won { value count }
          ... on CsgoPlayerSeriesStatistics { headshots { sum avg } }
        }
      }
    }`);
    results.nikoGroupStage = d;
  } catch(e) { results.nikoGroupStage = { error: e.message }; }

  // 3. IEM Rio Playoffs (829250) = 2 series for NiKo  
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "7190", filter: { tournamentIds: { in: ["829250"] } }) {
        aggregationSeriesIds
        series {
          count kills { sum avg min max } deaths { avg }
          won { value count }
          ... on CsgoPlayerSeriesStatistics { headshots { sum avg min max } }
        }
        game { count kills { avg sum min max } }
      }
    }`);
    results.nikoPlayoffs = d;
  } catch(e) { results.nikoPlayoffs = { error: e.message }; }

  return res.json({ results });
}
