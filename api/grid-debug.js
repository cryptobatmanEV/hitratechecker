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

  // 1. Check DateTimeFilter period type in stats feed
  try {
    const d = await qStats(`{ __type(name: "DateTimeFilter") { inputFields { name type { name kind enumValues { name } ofType { name kind enumValues { name } } } } } }`);
    results.dateTimeFilter = d?.data?.__type?.inputFields;
  } catch(e) { results.dateTimeFilter = { error: e.message }; }

  // 2. Try CsgoPlayerSeriesStatistics fields - does it have headshots?
  try {
    const d = await qStats(`{ __type(name: "CsgoPlayerSeriesStatistics") { fields { name } } }`);
    const fields = d?.data?.__type?.fields?.map(f => f.name) || [];
    results.csgoPlayerSeriesStats = { hasHeadshots: fields.includes('headshots'), fields };
  } catch(e) { results.csgoPlayerSeriesStats = { error: e.message }; }

  // 3. Try startedAt with ISO date string as period
  try {
    const d = await qStats(`{
      playerStatistics(playerId: "7190", filter: { startedAt: { period: "2026-04-19" } }) {
        aggregationSeriesIds
        series { count kills { avg sum } deaths { avg } }
      }
    }`);
    results.nikoApril19 = d;
  } catch(e) { results.nikoApril19 = { error: e.message }; }

  // 4. Find a pure CS2 player to test Cs2PlayerSeriesStatistics + headshots
  // s1mple switched to CS2, ZywOo is CS2 native
  try {
    const d = await qCD(`{
      players(filter: { nickname: { equals: "ZywOo" } }, first: 3) {
        edges { node { id nickname title { id name } team { name } } }
      }
    }`);
    results.zywooProfile = d;
  } catch(e) { results.zywooProfile = { error: e.message }; }

  return res.json({ results });
}
