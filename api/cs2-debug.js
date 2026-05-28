export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const SCRAPER = process.env.SCRAPER_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const t = () => Date.now();
  const start = t();
  const out = { timings: {} };

  // 1. How long does a single HLTV scraper fetch take?
  try {
    const s = t();
    const r = await fetch(`https://api.scraperapi.com?api_key=${SCRAPER}&url=${encodeURIComponent('https://www.hltv.org/stats/players/matches/7592/device?startDate=2023-09-27&endDate=2026-05-28')}`,{headers:{Accept:'text/html'}});
    await r.text();
    out.timings.hltv_fetch_ms = t() - s;
  } catch(e) { out.timings.hltv_fetch_ms = `ERROR: ${e.message}`; }

  // 2. How long does a single GRID team search take?
  try {
    const s = t();
    await cdQ(`{teams(filter:{name:{contains:"Liquid"}},first:5){edges{node{id name}}}}`);
    out.timings.grid_team_search_ms = t() - s;
  } catch(e) { out.timings.grid_team_search_ms = `ERROR: ${e.message}`; }

  // 3. How long does a GRID allSeries query take?
  try {
    const s = t();
    await cdQ(`{allSeries(filter:{teamIds:{in:["47361"]},startTimeScheduled:{gte:"2026-04-01T00:00:00Z",lte:"2026-04-30T23:59:59Z"}},first:5,orderBy:StartTimeScheduled){edges{node{id startTimeScheduled}}}}`);
    out.timings.grid_allseries_ms = t() - s;
  } catch(e) { out.timings.grid_allseries_ms = `ERROR: ${e.message}`; }

  // 4. Simulate 15 sequential team searches (worst case Pass 2)
  try {
    const s = t();
    const opponents = ['Liquid','HEROIC','FlyQuest','BIG','NiP','G2','Falcons','MOUZ','Eternal Fire','Wildcard','Legacy','Aurora','Monte','Alliance','FUT'];
    for(const opp of opponents) {
      await cdQ(`{teams(filter:{name:{contains:"${opp}"}},first:3){edges{node{id}}}}`);
    }
    out.timings.pass2_15_team_searches_ms = t() - s;
    out.timings.pass2_per_search_avg_ms = Math.round((t()-s)/15);
  } catch(e) { out.timings.pass2_15_searches_ms = `ERROR: ${e.message}`; }

  out.timings.total_elapsed_ms = t() - start;
  out.budget_remaining_ms = 28000 - out.timings.total_elapsed_ms;
  out.safe_pass2_limit = Math.floor(out.budget_remaining_ms / (out.timings.pass2_per_search_avg_ms * 3 || 600));

  return res.json(out);
}
