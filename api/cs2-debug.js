export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. Check IEM Atlanta 2026 playoffs - does GRID have it?
  const r1 = await cdQ(`{tournaments(filter:{name:{contains:"IEM Atlanta 2026"}},first:10){edges{node{id name startDate}}}}`);
  out.iem_atlanta_tournaments = r1?.data?.tournaments?.edges?.map(e=>e.node)||[];

  // 2. Get M80 IEM Atlanta series specifically
  const r2 = await cdQ(`{
    allSeries(filter:{
      teamIds:{in:["52200"]}
      startTimeScheduled:{gte:"2026-05-10T00:00:00Z", lte:"2026-05-25T00:00:00Z"}
    }, first:20, orderBy:StartTimeScheduled) {
      edges{node{id startTimeScheduled tournament{id name} teams{baseInfo{name}}}}
    }
  }`);
  out.m80_mid_may = r2?.data?.allSeries?.edges?.map(e=>e.node)?.map(s=>({
    id:s.id, date:s.startTimeScheduled?.split('T')[0],
    tournament:s.tournament?.name, teams:s.teams?.map(t=>t.baseInfo?.name)
  }))||[];

  // 3. Check if IEM Atlanta Group Stage series HAS player data (not empty)
  const iem_series = ['2944380','2944388']; // M80 vs Legacy, M80 vs Liquid
  const r3 = await ssQ(`{
    s0:seriesState(id:"2944380"){id startedAt teams{name players{id name kills ...on SeriesPlayerStateCs2{headshots}}}}
    s1:seriesState(id:"2944388"){id startedAt teams{name players{id name kills ...on SeriesPlayerStateCs2{headshots}}}}
  }`);
  out.iem_atlanta_states = Object.values(r3?.data||{}).map(s=>({
    id:s?.id, date:s?.startedAt?.split('T')[0],
    team1: {name:s?.teams?.[0]?.name, playerCount:s?.teams?.[0]?.players?.length, sample:s?.teams?.[0]?.players?.[0]},
    team2: {name:s?.teams?.[1]?.name, playerCount:s?.teams?.[1]?.players?.length, sample:s?.teams?.[1]?.players?.[0]}
  }));

  return res.json(out);
}
