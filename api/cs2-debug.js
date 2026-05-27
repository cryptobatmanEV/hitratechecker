export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};
  const ninetyDaysAgo = new Date(Date.now()-90*86400000).toISOString();

  // Test 1: allSeries filtered by team 51439 (what the frontend actually uses)
  const r1 = await cdQ(`{allSeries(filter:{teamIds:{in:["51439"]},startTimeScheduled:{gte:"${ninetyDaysAgo}"}},first:20,orderBy:StartTimeScheduled){edges{node{id startTimeScheduled tournament{name} teams{baseInfo{name}}}}}}`);
  out.team_51439_series = r1?.data?.allSeries?.edges?.map(e=>({
    id:e.node.id, date:e.node.startTimeScheduled?.split('T')[0],
    tournament:e.node.tournament?.name, teams:e.node.teams?.map(t=>t.baseInfo?.name)
  }))||[];

  // Test 2: allSeries filtered by team 52200 (what our debug used)
  const r2 = await cdQ(`{allSeries(filter:{teamIds:{in:["52200"]},startTimeScheduled:{gte:"${ninetyDaysAgo}"}},first:20,orderBy:StartTimeScheduled){edges{node{id startTimeScheduled tournament{name} teams{baseInfo{name}}}}}}`);
  out.team_52200_series = r2?.data?.allSeries?.edges?.map(e=>({
    id:e.node.id, date:e.node.startTimeScheduled?.split('T')[0],
    tournament:e.node.tournament?.name, teams:e.node.teams?.map(t=>t.baseInfo?.name)
  }))||[];

  // Test 3: Does GRID support playerIds filter on allSeries?
  const r3 = await cdQ(`{allSeries(filter:{playerIds:{in:["114025"]},startTimeScheduled:{gte:"${ninetyDaysAgo}"}},first:20,orderBy:StartTimeScheduled){edges{node{id startTimeScheduled tournament{name}}}}}`);
  out.playerIds_filter = r3?.data?.allSeries?.edges?.map(e=>e.node)||[];
  out.playerIds_error = r3?.errors?.[0]?.message;

  // Test 4: Swisher's current GRID profile - what team does GRID show now?
  const r4 = await cdQ(`{players(filter:{nickname:{equals:"Swisher"}},first:5){edges{node{id nickname title{id} team{id name}}}}}`);
  out.swisher_profile = r4?.data?.players?.edges?.map(e=>e.node)||[];

  return res.json(out);
}
