export const config = { maxDuration: 30 };
const KEY = process.env.GRID_API_KEY;
const CD = 'https://api-op.grid.gg/central-data/graphql';
const SS = 'https://api-op.grid.gg/live-data-feed/series-state/graphql';
async function cdQ(q){const r=await fetch(CD,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}
async function ssQ(q){const r=await fetch(SS,{method:'POST',headers:{'Content-Type':'application/json','x-api-key':KEY},body:JSON.stringify({query:q})});return r.json();}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const out = {};

  // 1. Find Nemiga's GRID team ID
  const r1 = await cdQ(`{ teams(filter:{name:{contains:"Nemiga"}},first:5){ edges{node{id name}} } }`);
  out.nemiga = r1?.data?.teams?.edges?.map(e=>e.node)||[];
  const nemigaId = out.nemiga[0]?.id;

  // 2. Get ALL series for Nemiga in May 2026 — if GRID has Cybershoke vs Nemiga it'll appear
  if (nemigaId) {
    const r2 = await cdQ(`{
      allSeries(filter:{
        teamIds:{in:["${nemigaId}"]}
        startTimeScheduled:{gte:"2026-04-25T00:00:00Z"}
      }, first:30, orderBy:StartTimeScheduled) {
        edges{node{id startTimeScheduled tournament{id name} teams{baseInfo{id name}}}}
      }
    }`);
    out.nemiga_recent_series = r2?.data?.allSeries?.edges?.map(e=>e.node)?.map(s=>({
      date: s.startTimeScheduled?.split('T')[0],
      tournament: s.tournament?.name,
      id: s.id,
      teams: s.teams?.map(t=>t.baseInfo?.name)
    }))||[];
  }

  // 3. Get ALL CS2 tournaments in GRID from 2026 — see the full list
  const r3 = await cdQ(`{
    tournaments(filter:{name:{contains:"2026"}}, first:50) {
      edges{node{id name startDate}}
    }
  }`);
  out.all_2026_tournaments = r3?.data?.tournaments?.edges?.map(e=>e.node)||[];

  // 4. Check if "Masters" alone finds BC Game Masters
  const r4 = await cdQ(`{
    tournaments(filter:{name:{contains:"Masters"}}, first:20) {
      edges{node{id name startDate}}
    }
  }`);
  out.masters_tournaments = r4?.data?.tournaments?.edges?.map(e=>e.node)
    ?.filter(t => new Date(t.startDate) > new Date('2025-01-01'))||[];

  return res.json(out);
}
