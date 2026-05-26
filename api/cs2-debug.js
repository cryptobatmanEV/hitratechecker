export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // Correct IDs: CS2 profile = 116103, team = 52247 (Cybershoke)
  const CS2_PLAYER_ID = '116103';
  const TEAM_ID = '52247';

  // Test 1: allSeries for Cybershoke with a date filter (last 6 months)
  const sixMonthsAgo = new Date(Date.now()-180*86400000).toISOString();
  const r1 = await cdQ(`{
    allSeries(filter:{
      teamIds:{in:["${TEAM_ID}"]}
      startTimeScheduled:{gte:"${sixMonthsAgo}"}
    }, first:50, orderBy:StartTimeScheduled) {
      edges{node{id startTimeScheduled tournament{name}}}
    }
  }`);
  const recent = r1?.data?.allSeries?.edges?.map(e=>e.node)||[];
  out.recentSeriesCount = recent.length;
  out.recentSeries_last3 = recent.slice(-3); // last 3 (most recent)
  out.recentSeries_first3 = recent.slice(0,3); // first 3 (oldest in range)

  // Test 2: Does Series State have data for most recent series?
  if (recent.length > 0) {
    const latestId = recent[recent.length-1].id;
    out.latestSeriesId = latestId;
    const ss = await ssQ(`{
      seriesState(id:"${latestId}") {
        id startedAt finished
        teams { id name players {
          id name kills deaths
          ... on SeriesPlayerStateCs2 { headshots }
        }}
      }
    }`);
    out.latestSeriesState = ss?.data?.seriesState || ss?.errors?.[0]?.message;
  }

  // Test 3: Total series count for Cybershoke (no date filter)
  const r3 = await cdQ(`{
    allSeries(filter:{teamIds:{in:["${TEAM_ID}"]}}, first:200, orderBy:StartTimeScheduled) {
      edges{node{id startTimeScheduled}}
    }
  }`);
  const all = r3?.data?.allSeries?.edges?.map(e=>e.node)||[];
  out.totalSeriesCount = all.length;
  out.absoluteMostRecent = all.slice(-3).reverse();

  return res.json(out);
}
