export const config = { maxDuration: 30 };
const KEY   = process.env.GRID_API_KEY;
const STATS = 'https://api-op.grid.gg/statistics-feed/graphql';
const delay = ms => new Promise(r => setTimeout(r, ms));
async function qStats(q) { await delay(2000); const r = await fetch(STATS, { method:'POST', headers:{'Content-Type':'application/json','x-api-key':KEY}, body:JSON.stringify({query:q}) }); return r.json(); }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const results = {};

  // 1. NiKo CS2 (112182) with LAST_MONTH - IEM Rio was April 2026
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "112182", filter: { timeWindow: LAST_MONTH }) {
        id aggregationSeriesIds
        series { count kills { avg sum } deaths { avg } ... on Cs2PlayerSeriesStatistics { headshots { avg sum } } }
      }
    }`);
    results.niko_LAST_MONTH = d;
  } catch(e) { results.niko_LAST_MONTH = { error: e.message }; }

  // 2. NiKo CS:GO profile (7190) with LAST_MONTH
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "7190", filter: { timeWindow: LAST_MONTH }) {
        id aggregationSeriesIds
        series { count kills { avg sum } deaths { avg } }
      }
    }`);
    results.niko_csgo_LAST_MONTH = d;
  } catch(e) { results.niko_csgo_LAST_MONTH = { error: e.message }; }

  // 3. Try seriesStatistics query directly for IEM Rio Playoffs
  try {
    const d = await qStats(`{
      seriesStatistics(filter: { tournamentIds: { in: ["829250"] } }) {
        aggregationSeriesIds count
        games { count map { name } teams { kills { avg } } }
      }
    }`);
    results.iemRioSeriesStats = d;
  } catch(e) { results.iemRioSeriesStats = { error: e.message }; }

  // 4. Try ZywOo - another top CS2 player who might be in GRID
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "11893", filter: { timeWindow: LAST_MONTH }) {
        id aggregationSeriesIds
        series { count kills { avg sum } deaths { avg } ... on Cs2PlayerSeriesStatistics { headshots { avg sum } } }
      }
    }`);
    results.zywoo_LAST_MONTH = d;
  } catch(e) { results.zywoo_LAST_MONTH = { error: e.message }; }

  // 5. Try TeamGameStatistics players field breakdown for Falcons
  try {
    const d = await qStats(`{
      __type(name: "TeamGameStatisticsCs2") { 
        fields { name type { name kind ofType { name } } } 
      }
    }`);
    const playersField = d?.data?.__type?.fields?.find(f => f.name === 'players');
    results.teamGamePlayersField = playersField;
  } catch(e) { results.teamGamePlayersField = { error: e.message }; }

  return res.json({ results });
}
