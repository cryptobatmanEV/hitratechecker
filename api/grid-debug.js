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

  // 1. NiKo stats for IEM Rio 2026 Playoffs (tournament 829250)
  // Series 2931340 started at 2026-04-19T13:30:00Z
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "112182", filter: { tournamentIds: { in: ["829250"] } }) {
        id
        aggregationSeriesIds
        series { 
          count 
          kills { avg sum min max }
          deaths { avg sum }
        }
        game { count kills { avg sum min max } deaths { avg } }
        segment {
          ... on Cs2PlayerSeriesStatistics {
            count
            kills { avg sum min max }
            deaths { avg sum }
            headshots { avg sum min max }
          }
        }
      }
    }`);
    results.nikoIemRioPlayoffs = d;
  } catch(e) { results.nikoIemRioPlayoffs = { error: e.message }; }

  // 2. Test startedAt filter — isolate single series (IEM Rio series started 2026-04-19T13:30:00Z)
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "112182", filter: { 
        startedAt: { gte: "2026-04-19T00:00:00Z", lte: "2026-04-20T00:00:00Z" }
      }) {
        id
        aggregationSeriesIds
        segment {
          ... on Cs2PlayerSeriesStatistics {
            count
            kills { avg sum }
            deaths { avg sum }
            headshots { avg sum }
          }
        }
      }
    }`);
    results.nikoSingleSeries = d;
  } catch(e) { results.nikoSingleSeries = { error: e.message }; }

  // 3. Try full IEM Rio (parent 829191) to get more series
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "112182", filter: { tournamentIds: { in: ["829191","829241","829250"] } }) {
        id
        aggregationSeriesIds
        segment {
          ... on Cs2PlayerSeriesStatistics {
            count kills { avg sum min max } deaths { avg } headshots { avg sum }
          }
        }
      }
    }`);
    results.nikoFullIemRio = d;
  } catch(e) { results.nikoFullIemRio = { error: e.message }; }

  return res.json({ results });
}
