export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  const out = {};

  // 1. Find Swisher in GRID
  const r1 = await cdQ(`{players(filter:{nickname:{equals:"Swisher"}},first:5){edges{node{id nickname title{id} team{id name}}}}}`);
  out.swisher = r1?.data?.players?.edges?.map(e=>e.node)||[];
  const cs2Profile = out.swisher.find(p=>p.title?.id==='28') || out.swisher[0];
  const teamId = cs2Profile?.team?.id;
  out.teamId = teamId;
  out.teamName = cs2Profile?.team?.name;

  // 2. Get M80's recent series from CD around May 20-21
  if (teamId) {
    const r2 = await cdQ(`{
      allSeries(filter:{
        teamIds:{in:["${teamId}"]}
        startTimeScheduled:{gte:"2026-05-01T00:00:00Z"}
      }, first:20, orderBy:StartTimeScheduled) {
        edges{node{id startTimeScheduled tournament{name} teams{baseInfo{name}}}}
      }
    }`);
    out.m80_may_series = r2?.data?.allSeries?.edges?.map(e=>({
      id: e.node.id,
      date: e.node.startTimeScheduled?.split('T')[0],
      tournament: e.node.tournament?.name,
      teams: e.node.teams?.map(t=>t.baseInfo?.name)
    }))||[];
  }

  // 3. Try Series State for a May 20-21 series if found
  if (out.m80_may_series?.length) {
    const seriesId = out.m80_may_series[0]?.id;
    const r3 = await ssQ(`{seriesState(id:"${seriesId}"){
      id startedAt
      teams{id name players{id name kills ...on SeriesPlayerStateCs2{headshots} ...on SeriesPlayerStateCsgo{headshots}}}
    }}`);
    out.series_state_sample = r3?.data?.seriesState || r3?.errors?.[0]?.message;
  }

  return res.json(out);
}
