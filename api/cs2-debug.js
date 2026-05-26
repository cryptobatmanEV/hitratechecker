export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // Step 1: Find glowiing in GRID and get their team ID
  const p = await cdQ(`{ players(filter:{nickname:{equals:"glowiing"}},first:5){
    edges{node{id nickname title{id} team{id name}}}
  }}`);
  const players = p?.data?.players?.edges?.map(e=>e.node)||[];
  out.players = players;
  const teamId = players[0]?.team?.id;
  const playerId = players[0]?.id;
  out.teamId = teamId;

  if (!teamId) return res.json(out);

  // Step 2: Try allSeries with different ordering approaches
  // Try orderBy:ID (might give newest first since IDs are sequential)
  const r1 = await cdQ(`{ allSeries(filter:{teamIds:{in:["${teamId}"]}}, first:5, orderBy:ID) {
    edges{node{id startTimeScheduled tournament{name}}}
  }}`);
  out.orderBy_ID_first5 = r1?.data?.allSeries?.edges?.map(e=>e.node) || r1?.errors;

  // Try orderBy:StartTimeScheduled
  const r2 = await cdQ(`{ allSeries(filter:{teamIds:{in:["${teamId}"]}}, first:5, orderBy:StartTimeScheduled) {
    edges{node{id startTimeScheduled tournament{name}}}
  }}`);
  out.orderBy_StartTime_first5 = r2?.data?.allSeries?.edges?.map(e=>e.node) || r2?.errors;

  // Try orderBy:UpdatedAt
  const r3 = await cdQ(`{ allSeries(filter:{teamIds:{in:["${teamId}"]}}, first:5, orderBy:UpdatedAt) {
    edges{node{id startTimeScheduled tournament{name}}}
  }}`);
  out.orderBy_UpdatedAt_first5 = r3?.data?.allSeries?.edges?.map(e=>e.node) || r3?.errors;

  // Step 3: How many total series does this team have?
  const r4 = await cdQ(`{ allSeries(filter:{teamIds:{in:["${teamId}"]}}, first:100) {
    edges{node{id startTimeScheduled}}
  }}`);
  const all = r4?.data?.allSeries?.edges?.map(e=>e.node)||[];
  out.totalCount = all.length;
  out.mostRecent3 = all.sort((a,b)=>new Date(b.startTimeScheduled)-new Date(a.startTimeScheduled)).slice(0,3);
  out.oldest3 = all.sort((a,b)=>new Date(a.startTimeScheduled)-new Date(b.startTimeScheduled)).slice(0,3);

  return res.json(out);
}
