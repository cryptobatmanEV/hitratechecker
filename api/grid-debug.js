export const config = { maxDuration: 30 };
const KEY   = process.env.GRID_API_KEY;
const CD    = 'https://api-op.grid.gg/central-data/graphql';
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const delay = ms => new Promise(r => setTimeout(r, ms));
async function qStats(q) { await delay(2000); const r = await fetch(STATS, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query:q}) }); return r.json(); }
async function qCD(q)    { const r = await fetch(CD,    { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query:q}) }); return r.json(); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. Check TimeRangeFilter enum values
  try {
    const d = await qStats(`{ __type(name: "TimeRangeFilter") { enumValues { name } } }`);
    results.timeRangeValues = d?.data?.__type?.enumValues?.map(v => v.name);
  } catch(e) { results.timeRangeValues = { error: e.message }; }

  // 2. Try Team Falcons stats at IEM Rio (team might have data even if player doesn't)
  try {
    const d = await qStats(`{
      teamStatistics(teamId: "51967", filter: { tournamentIds: { in: ["829191","829241","829250"] } }) {
        series { count kills { avg sum } deaths { avg } }
        game { count wins { value count } }
      }
    }`);
    results.falconsIemRio = d;
  } catch(e) { results.falconsIemRio = { error: e.message }; }

  // 3. Try NiKo with timeWindow instead of tournament
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "112182", filter: { timeWindow: LAST_6_MONTHS }) {
        id aggregationSeriesIds
        series { count kills { avg sum } deaths { avg } ... on Cs2PlayerSeriesStatistics { headshots { avg sum } } }
      }
    }`);
    results.nikoTimeWindow = d;
  } catch(e) { results.nikoTimeWindow = { error: e.message }; }

  // 4. Get players actually in the IEM Rio series (2931340) from Central Data
  try {
    const d = await qCD(`{ series(id: "2931340") { 
      players { id nickname }
      teams { baseInfo { name } }
      tournament { id name }
    }}`);
    results.seriesPlayers = d;
  } catch(e) { results.seriesPlayers = { error: e.message }; }

  // 5. Check DateTimeFilter fields in stats feed
  try {
    const d = await qStats(`{ __type(name: "DateTimeFilter") { inputFields { name } } }`);
    results.dateTimeFilterFields = d?.data?.__type?.inputFields?.map(f => f.name);
  } catch(e) { results.dateTimeFilterFields = { error: e.message }; }

  return res.json({ results });
}
